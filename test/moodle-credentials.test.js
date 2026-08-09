const { test, after } = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('node:child_process');
const path = require('node:path');

process.env.MOODLE_CREDENTIALS_SERVICE = `MoodleMcp-test-prog-${process.pid}-${Date.now()}`;
const { readCredentials, setCredentials, removeCredentials, normalizeMoodleUrl } = require('../scripts/moodle-credentials');

// Service-Name des programmatischen Speichers (oben vor dem require gesetzt) -
// wird fuer den Legacy-Rohwert-Test benoetigt, der direkt mit dem
// Plattform-Tool schreibt und dabei die Normalisierung beim Speichern umgeht.
const PROG_SERVICE = process.env.MOODLE_CREDENTIALS_SERVICE;

const CLI_PATH = path.join(__dirname, '..', 'scripts', 'moodle-credentials.js');

// Eindeutiger Service-Name pro Testlauf, damit echte Lehrkraft-Keychain-Einträge
// (Standard-Service "MoodleMcp") nie beruehrt werden und parallele Testlaeufe
// sich nicht in die Quere kommen.
const TEST_SERVICE = `MoodleMcp-test-${process.pid}-${Date.now()}`;
const TEST_URL = 'https://moodle.example.test';
const TEST_TOKEN = 'super-secret-token-value-12345';

function runCli(args, options = {}) {
  return execFileSync('node', [CLI_PATH, ...args], {
    encoding: 'utf8',
    env: { ...process.env, MOODLE_CREDENTIALS_SERVICE: TEST_SERVICE },
    ...options,
  });
}

function removeTestCredentials() {
  try {
    runCli(['remove']);
  } catch {
    // bereits entfernt oder nie angelegt - kein Problem im Cleanup
  }
}

after(() => {
  removeTestCredentials();
});

test('set speichert URL und Token, ohne den Token auszugeben', () => {
  const output = runCli(['set', '--url', TEST_URL, '--token', TEST_TOKEN]);

  assert.ok(!output.includes(TEST_TOKEN), 'Token darf nicht in stdout erscheinen');
  assert.match(output, /gespeichert/i);
});

test('test meldet vorhandene, nutzbare Zugangsdaten ohne den Token auszugeben', () => {
  runCli(['set', '--url', TEST_URL, '--token', TEST_TOKEN]);

  const output = runCli(['test']);

  assert.ok(!output.includes(TEST_TOKEN), 'Token darf nicht in stdout erscheinen');
  assert.match(output, /vorhanden/i);
  assert.match(output, new RegExp(TEST_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

test('test meldet fehlende Zugangsdaten, wenn noch nichts gespeichert wurde', () => {
  removeTestCredentials();

  let stdout = '';
  let exitCode = 0;
  try {
    stdout = runCli(['test']);
  } catch (error) {
    exitCode = error.status;
    stdout = error.stdout;
  }

  assert.notStrictEqual(exitCode, 0);
  assert.match(stdout, /keine|nicht gefunden/i);
});

test('macOS-Keychain-Abfragen pipen stderr, damit fehlende Eintraege beim Erstlauf nicht als security-Warnungen erscheinen', () => {
  const source = require('node:fs').readFileSync(CLI_PATH, 'utf8');
  assert.match(source, /stdio: \['ignore', 'pipe', 'pipe'\]/);
});

test('remove entfernt gespeicherte Zugangsdaten', () => {
  runCli(['set', '--url', TEST_URL, '--token', TEST_TOKEN]);

  const removeOutput = runCli(['remove']);
  assert.match(removeOutput, /entfernt/i);

  let stdout = '';
  let exitCode = 0;
  try {
    stdout = runCli(['test']);
  } catch (error) {
    exitCode = error.status;
    stdout = error.stdout;
  }
  assert.notStrictEqual(exitCode, 0);
  assert.match(stdout, /keine|nicht gefunden/i);
});

test('removeCredentials (programmatisch) entfernt gespeicherte Zugangsdaten, readCredentials liefert danach null', () => {
  setCredentials(TEST_URL, TEST_TOKEN);
  assert.deepStrictEqual(readCredentials(), { url: TEST_URL, token: TEST_TOKEN });

  removeCredentials();

  assert.strictEqual(readCredentials(), null);
});

test('setCredentials ergaenzt fehlendes Protokoll um https:// (URL ohne Praefix eingegeben)', () => {
  setCredentials('moo.gruenwald.fun', TEST_TOKEN);
  assert.deepStrictEqual(readCredentials(), { url: 'https://moo.gruenwald.fun', token: TEST_TOKEN });
});

test('setCredentials laesst ein vorhandenes Protokoll unangetastet (auch http:// fuer lokale Testinstanzen)', () => {
  setCredentials('http://localhost:8080', TEST_TOKEN);
  assert.deepStrictEqual(readCredentials(), { url: 'http://localhost:8080', token: TEST_TOKEN });
});

test('normalizeMoodleUrl ergaenzt https:// nur bei fehlendem Protokoll', () => {
  assert.strictEqual(normalizeMoodleUrl('moo.gruenwald.fun'), 'https://moo.gruenwald.fun');
  assert.strictEqual(normalizeMoodleUrl('https://moo.gruenwald.fun'), 'https://moo.gruenwald.fun');
  assert.strictEqual(normalizeMoodleUrl('http://localhost:8080'), 'http://localhost:8080');
  assert.strictEqual(normalizeMoodleUrl(''), '');
  assert.strictEqual(normalizeMoodleUrl(undefined), undefined);
});

test('readCredentials heilt legacy URL ohne Protokoll (vor der Normalisierung gespeichert)', () => {
  setCredentials('https://legacy.example.test', TEST_TOKEN);
  writeRawStoredUrl('legacy.example.test');

  try {
    assert.deepStrictEqual(readCredentials(), {
      url: 'https://legacy.example.test',
      token: TEST_TOKEN,
    });
  } finally {
    removeCredentials();
  }
});

// Schreibt den URL-Eintrag ohne Normalisierung direkt mit dem Plattform-Tool,
// um eine Installation zu simulieren, die vor Issue #242 gespeichert hat.
// Der Kontoname 'moodle-url' ist die ACCOUNT_URL-Konstante aus
// scripts/moodle-credentials.js.
function writeRawStoredUrl(rawUrl) {
  if (process.platform === 'win32') {
    execFileSync(
      'cmdkey',
      [`/generic:${PROG_SERVICE}:moodle-url`, '/user:kurspilot-test', `/pass:${rawUrl}`],
      { encoding: 'utf8' }
    );
    return;
  }
  execFileSync(
    'security',
    ['add-generic-password', '-a', 'moodle-url', '-s', PROG_SERVICE, '-w', rawUrl, '-U'],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
  );
}

test('removeCredentials (programmatisch) ist ohne vorherige Zugangsdaten ein No-Op, kein Fehler', () => {
  removeCredentials();
  assert.strictEqual(readCredentials(), null);
  assert.doesNotThrow(() => removeCredentials());
});

test('set schreibt den Token nicht in eine Klartextdatei im Repo', () => {
  runCli(['set', '--url', TEST_URL, '--token', TEST_TOKEN]);

  const repoRoot = path.join(__dirname, '..');
  const candidateFiles = ['.env', '.env.example'];
  for (const file of candidateFiles) {
    const filePath = path.join(repoRoot, file);
    try {
      const content = require('node:fs').readFileSync(filePath, 'utf8');
      assert.ok(!content.includes(TEST_TOKEN), `${file} darf den Token nicht enthalten`);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
});
