#!/usr/bin/env node
/**
 * Moodle-Token-Speicher fuer macOS: speichert, prueft und entfernt die
 * persoenliche Moodle-URL und das Moodle-Webservice-Token einer Lehrkraft
 * in der macOS Keychain, statt sie in Klartextdateien abzulegen.
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

const DEFAULT_SERVICE = 'MoodleMcp';
const SERVICE = process.env.MOODLE_CREDENTIALS_SERVICE || DEFAULT_SERVICE;
const ACCOUNT_URL = 'moodle-url';
const ACCOUNT_TOKEN = 'moodle-token';

function assertMacOS() {
  if (process.platform !== 'darwin') {
    throw new Error(
      'Dieser Moodle-Token-Speicher unterstuetzt aktuell nur macOS (Keychain).'
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

  setKeychainValue(ACCOUNT_URL, url);
  setKeychainValue(ACCOUNT_TOKEN, token);

  process.stdout.write('Moodle-URL und Token wurden im macOS-Schluesselbund gespeichert.\n');
}

function runTest() {
  const url = getKeychainValue(ACCOUNT_URL);
  const token = getKeychainValue(ACCOUNT_TOKEN);

  if (!url || !token) {
    process.stdout.write('Keine vollstaendigen Moodle-Zugangsdaten im Schluesselbund gefunden.\n');
    process.exitCode = 1;
    return;
  }

  process.stdout.write(
    `Moodle-Zugangsdaten vorhanden: URL=${url}, Token=<gesetzt, ${token.length} Zeichen>\n`
  );
}

function runRemove() {
  const removedUrl = deleteKeychainValue(ACCOUNT_URL);
  const removedToken = deleteKeychainValue(ACCOUNT_TOKEN);

  if (!removedUrl && !removedToken) {
    process.stdout.write('Keine gespeicherten Moodle-Zugangsdaten zum Entfernen gefunden.\n');
    return;
  }

  process.stdout.write('Moodle-Zugangsdaten wurden aus dem Schluesselbund entfernt.\n');
}

function main() {
  assertMacOS();

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
 * Liest Moodle-URL und Token programmatisch aus dem Schluesselbund, ohne sie
 * auszugeben. Fuer Wrapper/Helper gedacht, die den MCP-Server starten (siehe
 * scripts/start-mcp.js). Gibt `null` zurueck, wenn keine vollstaendigen
 * Zugangsdaten gespeichert sind.
 */
function readCredentials() {
  assertMacOS();
  const url = getKeychainValue(ACCOUNT_URL);
  const token = getKeychainValue(ACCOUNT_TOKEN);
  if (!url || !token) {
    return null;
  }
  return { url, token };
}

module.exports = { readCredentials };

if (require.main === module) {
  main();
}
