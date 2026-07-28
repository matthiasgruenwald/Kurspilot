'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  defaultRuntimeStatePath,
  writeRuntimeState,
  readRuntimeState,
  removeRuntimeState,
} = require('../lib/setup-server-state');

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'kurspilot-state-'));
}

test('defaultRuntimeStatePath liegt im Home-Verzeichnis unter .kurspilot', () => {
  const statePath = defaultRuntimeStatePath();
  assert.strictEqual(statePath, path.join(os.homedir(), '.kurspilot', 'setup-server.json'));
});

test('writeRuntimeState schreibt PID, Port und Token als JSON mit Modus 600', () => {
  const dir = tempDir();
  const statePath = path.join(dir, 'setup-server.json');

  writeRuntimeState(statePath, { pid: 1234, port: 5111, token: 'abc123' });

  const raw = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  assert.deepStrictEqual(raw, { pid: 1234, port: 5111, token: 'abc123' });

  const mode = fs.statSync(statePath).mode & 0o777;
  assert.strictEqual(mode, 0o600);
});

test('writeRuntimeState erzeugt fehlende Elternverzeichnisse', () => {
  const dir = tempDir();
  const statePath = path.join(dir, 'nested', 'deep', 'setup-server.json');

  writeRuntimeState(statePath, { pid: 1, port: 2, token: 't' });

  assert.ok(fs.existsSync(statePath));
});

test('readRuntimeState liefert die geschriebenen Werte zurueck', () => {
  const dir = tempDir();
  const statePath = path.join(dir, 'setup-server.json');
  writeRuntimeState(statePath, { pid: 42, port: 8080, token: 'geheim' });

  const state = readRuntimeState(statePath);

  assert.deepStrictEqual(state, { pid: 42, port: 8080, token: 'geheim' });
});

test('readRuntimeState liefert null bei fehlender Datei', () => {
  const dir = tempDir();
  assert.strictEqual(readRuntimeState(path.join(dir, 'nope.json')), null);
});

test('readRuntimeState liefert null bei ungueltigem JSON', () => {
  const dir = tempDir();
  const statePath = path.join(dir, 'setup-server.json');
  fs.writeFileSync(statePath, 'kein json{');

  assert.strictEqual(readRuntimeState(statePath), null);
});

test('removeRuntimeState loescht die Datei', () => {
  const dir = tempDir();
  const statePath = path.join(dir, 'setup-server.json');
  writeRuntimeState(statePath, { pid: 1, port: 2, token: 't' });

  removeRuntimeState(statePath);

  assert.strictEqual(fs.existsSync(statePath), false);
});

test('removeRuntimeState ist fehlerfrei bei fehlender Datei', () => {
  const dir = tempDir();
  assert.doesNotThrow(() => removeRuntimeState(path.join(dir, 'nope.json')));
});
