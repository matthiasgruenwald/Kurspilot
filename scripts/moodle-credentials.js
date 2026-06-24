#!/usr/bin/env node
/**
 * Moodle-Token-Speicher fuer macOS: speichert, prueft und entfernt die
 * persoenliche Moodle-URL und das Moodle-Webservice-Token einer Lehrkraft
 * in der macOS Keychain bzw. Windows Credential Manager, statt sie in Klartextdateien abzulegen.
 *
 * Siehe docs/adr/0006-node-helper-fuer-moodle-token-speicher.md.
 *
 * Diese erste Schicht deckt macOS ab (Keychain via `security`-CLI). Andere
 * Plattformen sind bewusst nicht Teil dieser Schicht (siehe ADR 0006,
 * Plattformstrategie) und werden erst bei Bedarf ergaenzt.
 *
 * Aufrufe:
 *   node scripts/moodle-credentials.js set --url <url> --token <token>
 *   node scripts/moodle-credentials.js test
 *   node scripts/moodle-credentials.js remove
 */

const { execFileSync } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const DEFAULT_SERVICE = 'MoodleMcp';
const SERVICE = process.env.MOODLE_CREDENTIALS_SERVICE || DEFAULT_SERVICE;
const ACCOUNT_URL = 'moodle-url';
const ACCOUNT_TOKEN = 'moodle-token';

function assertSupportedPlatform() {
  if (process.platform !== 'darwin' && process.platform !== 'win32') {
    throw new Error(
      'Dieser Moodle-Token-Speicher unterstuetzt aktuell macOS (Keychain) und Windows (Credential Manager).'
    );
  }
}

function security(args) {
  return execFileSync('security', args, { encoding: 'utf8' });
}

function setKeychainValue(account, value) {
  security([
    'add-generic-password',
    '-a', account,
    '-s', SERVICE,
    '-w', value,
    '-U',
  ]);
}

function getKeychainValue(account) {
  try {
    return security([
      'find-generic-password',
      '-a', account,
      '-s', SERVICE,
      '-w',
    ]).replace(/\n$/, '');
  } catch (error) {
    if (error.status === 44) {
      // "The specified item could not be found in the keychain." (errSecItemNotFound)
      return null;
    }
    throw error;
  }
}

function deleteKeychainValue(account) {
  try {
    security(['delete-generic-password', '-a', account, '-s', SERVICE]);
    return true;
  } catch (error) {
    if (error.status === 44) {
      return false;
    }
    throw error;
  }
}

const WINDOWS_CREDENTIAL_HELPER_SOURCE = String.raw`
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Text;

class KurspilotCredentialHelper {
  const int CRED_TYPE_GENERIC = 1;
  const int CRED_PERSIST_LOCAL_MACHINE = 2;
  const int ERROR_NOT_FOUND = 1168;

  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  struct CREDENTIAL {
    public int Flags;
    public int Type;
    public string TargetName;
    public string Comment;
    public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten;
    public int CredentialBlobSize;
    public IntPtr CredentialBlob;
    public int Persist;
    public int AttributeCount;
    public IntPtr Attributes;
    public string TargetAlias;
    public string UserName;
  }

  [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
  static extern bool CredWrite(ref CREDENTIAL userCredential, int flags);

  [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
  static extern bool CredRead(string target, int type, int reservedFlag, out IntPtr credentialPtr);

  [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
  static extern bool CredDelete(string target, int type, int flags);

  [DllImport("advapi32.dll", SetLastError = true)]
  static extern void CredFree(IntPtr buffer);

  static string Target(string service, string account) {
    return service + ":" + account;
  }

  static void Write(string service, string account) {
    string secret = Console.In.ReadToEnd();
    byte[] secretBytes = Encoding.Unicode.GetBytes(secret);
    IntPtr blob = Marshal.AllocCoTaskMem(secretBytes.Length);
    try {
      Marshal.Copy(secretBytes, 0, blob, secretBytes.Length);
      var credential = new CREDENTIAL {
        Type = CRED_TYPE_GENERIC,
        TargetName = Target(service, account),
        CredentialBlobSize = secretBytes.Length,
        CredentialBlob = blob,
        Persist = CRED_PERSIST_LOCAL_MACHINE,
        UserName = account
      };
      if (!CredWrite(ref credential, 0)) throw new Win32Exception(Marshal.GetLastWin32Error());
    } finally {
      Marshal.ZeroFreeCoTaskMemUnicode(blob);
    }
  }

  static int Read(string service, string account) {
    IntPtr credentialPtr;
    if (!CredRead(Target(service, account), CRED_TYPE_GENERIC, 0, out credentialPtr)) {
      int error = Marshal.GetLastWin32Error();
      if (error == ERROR_NOT_FOUND) return 2;
      throw new Win32Exception(error);
    }
    try {
      var credential = (CREDENTIAL)Marshal.PtrToStructure(credentialPtr, typeof(CREDENTIAL));
      if (credential.CredentialBlobSize > 0) {
        Console.Out.Write(Marshal.PtrToStringUni(credential.CredentialBlob, credential.CredentialBlobSize / 2));
      }
      return 0;
    } finally {
      CredFree(credentialPtr);
    }
  }

  static int Delete(string service, string account) {
    if (CredDelete(Target(service, account), CRED_TYPE_GENERIC, 0)) return 0;
    int error = Marshal.GetLastWin32Error();
    if (error == ERROR_NOT_FOUND) return 2;
    throw new Win32Exception(error);
  }

  static int Main(string[] args) {
    if (args.Length != 3) return 64;
    if (args[0] == "set") { Write(args[1], args[2]); return 0; }
    if (args[0] == "get") return Read(args[1], args[2]);
    if (args[0] == "delete") return Delete(args[1], args[2]);
    return 64;
  }
}
`;

function findCsc() {
  const windir = process.env.WINDIR || 'C:\\Windows';
  const candidates = [
    path.join(windir, 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'csc.exe'),
    path.join(windir, 'Microsoft.NET', 'Framework', 'v4.0.30319', 'csc.exe'),
  ];
  return candidates.find(candidate => fs.existsSync(candidate));
}

function getWindowsCredentialHelperPath() {
  const hash = crypto.createHash('sha256').update(WINDOWS_CREDENTIAL_HELPER_SOURCE).digest('hex').slice(0, 16);
  const helperDir = path.join(os.tmpdir(), 'kurspilot-credential-helper');
  const sourcePath = path.join(helperDir, `credential-helper-${hash}.cs`);
  const exePath = path.join(helperDir, `credential-helper-${hash}.exe`);
  if (fs.existsSync(exePath)) return exePath;

  const cscPath = findCsc();
  if (!cscPath) {
    throw new Error('Windows Credential Manager kann nicht genutzt werden: csc.exe wurde nicht gefunden.');
  }

  fs.mkdirSync(helperDir, { recursive: true });
  fs.writeFileSync(sourcePath, WINDOWS_CREDENTIAL_HELPER_SOURCE);
  execFileSync(cscPath, ['/nologo', '/target:exe', `/out:${exePath}`, sourcePath], { stdio: 'ignore' });
  return exePath;
}

function runWindowsCredentialHelper(action, account, input) {
  const helperPath = getWindowsCredentialHelperPath();
  try {
    return execFileSync(helperPath, [action, SERVICE, account], {
      encoding: 'utf8',
      input,
      windowsHide: true,
    });
  } catch (error) {
    if (error.status === 2) return null;
    throw error;
  }
}

function setWindowsCredentialValue(account, value) {
  runWindowsCredentialHelper('set', account, value);
}

function getWindowsCredentialValue(account) {
  return runWindowsCredentialHelper('get', account);
}

function deleteWindowsCredentialValue(account) {
  return runWindowsCredentialHelper('delete', account) !== null;
}

function setStoredValue(account, value) {
  if (process.platform === 'win32') {
    setWindowsCredentialValue(account, value);
    return;
  }
  setKeychainValue(account, value);
}

function getStoredValue(account) {
  if (process.platform === 'win32') {
    return getWindowsCredentialValue(account);
  }
  return getKeychainValue(account);
}

function deleteStoredValue(account) {
  if (process.platform === 'win32') {
    return deleteWindowsCredentialValue(account);
  }
  return deleteKeychainValue(account);
}

function parseArgs(args) {
  const result = {};
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--url') {
      result.url = args[i + 1];
      i += 1;
    } else if (arg === '--token') {
      result.token = args[i + 1];
      i += 1;
    }
  }
  return result;
}

function runSet(args) {
  const { url, token } = parseArgs(args);
  if (!url || !token) {
    process.stderr.write(
      'Fehler: --url und --token werden benoetigt, z.B.\n' +
      '  node scripts/moodle-credentials.js set --url https://moodle.example.org --token <token>\n'
    );
    process.exitCode = 1;
    return;
  }

  setStoredValue(ACCOUNT_URL, url);
  setStoredValue(ACCOUNT_TOKEN, token);

  process.stdout.write('Moodle-URL und Token wurden im sicheren Zugangsdaten-Speicher gespeichert.\n');
}

function runTest() {
  const url = getStoredValue(ACCOUNT_URL);
  const token = getStoredValue(ACCOUNT_TOKEN);

  if (!url || !token) {
    process.stdout.write('Keine vollstaendigen Moodle-Zugangsdaten im sicheren Zugangsdaten-Speicher gefunden.\n');
    process.exitCode = 1;
    return;
  }

  process.stdout.write(
    `Moodle-Zugangsdaten vorhanden: URL=${url}, Token=<gesetzt, ${token.length} Zeichen>\n`
  );
}

function runRemove() {
  const removedUrl = deleteStoredValue(ACCOUNT_URL);
  const removedToken = deleteStoredValue(ACCOUNT_TOKEN);

  if (!removedUrl && !removedToken) {
    process.stdout.write('Keine gespeicherten Moodle-Zugangsdaten zum Entfernen gefunden.\n');
    return;
  }

  process.stdout.write('Moodle-Zugangsdaten wurden aus dem sicheren Zugangsdaten-Speicher entfernt.\n');
}

function main() {
  assertSupportedPlatform();

  const [command, ...rest] = process.argv.slice(2);

  switch (command) {
    case 'set':
      runSet(rest);
      break;
    case 'test':
      runTest();
      break;
    case 'remove':
      runRemove();
      break;
    default:
      process.stderr.write(
        'Verwendung:\n' +
        '  node scripts/moodle-credentials.js set --url <url> --token <token>\n' +
        '  node scripts/moodle-credentials.js test\n' +
        '  node scripts/moodle-credentials.js remove\n'
      );
      process.exitCode = 1;
  }
}

/**
 * Liest Moodle-URL und Token programmatisch aus dem sicheren Zugangsdaten-Speicher, ohne sie
 * auszugeben. Fuer Wrapper/Helper gedacht, die den MCP-Server starten (siehe
 * scripts/start-mcp.js). Gibt `null` zurueck, wenn keine vollstaendigen
 * Zugangsdaten gespeichert sind.
 */
function readCredentials() {
  assertSupportedPlatform();
  const url = getStoredValue(ACCOUNT_URL);
  const token = getStoredValue(ACCOUNT_TOKEN);
  if (!url || !token) {
    return null;
  }
  return { url, token };
}

/**
 * Speichert Moodle-URL und Token programmatisch im sicheren Zugangsdaten-Speicher, ohne sie
 * auszugeben. Fuer Aufrufer gedacht, die die Eingabe selbst entgegennehmen
 * (z.B. lib/setup-flow.js) statt die CLI per Kindprozess zu starten.
 */
function setCredentials(url, token) {
  assertSupportedPlatform();
  setStoredValue(ACCOUNT_URL, url);
  setStoredValue(ACCOUNT_TOKEN, token);
}

/**
 * Entfernt Moodle-URL und Token programmatisch aus dem sicheren Zugangsdaten-Speicher, ohne
 * sie auszugeben. Fuer den Uninstall-Flow gedacht (lib/uninstall-flow.js).
 * No-Op (kein Fehler), wenn nichts gespeichert war.
 */
function removeCredentials() {
  assertSupportedPlatform();
  deleteStoredValue(ACCOUNT_URL);
  deleteStoredValue(ACCOUNT_TOKEN);
}

module.exports = { readCredentials, setCredentials, removeCredentials };

if (require.main === module) {
  main();
}
