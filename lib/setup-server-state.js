'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function defaultRuntimeStatePath() {
  return path.join(os.homedir(), '.kurspilot', 'setup-server.json');
}

function writeRuntimeState(statePath, state) {
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  fs.writeFileSync(statePath, `${JSON.stringify(state)}\n`, { mode: 0o600 });
  fs.chmodSync(statePath, 0o600);
}

function readRuntimeState(statePath) {
  try {
    const raw = fs.readFileSync(statePath, 'utf8');
    const parsed = JSON.parse(raw);
    if (
      parsed
      && typeof parsed.pid === 'number'
      && typeof parsed.port === 'number'
      && typeof parsed.token === 'string'
    ) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

function removeRuntimeState(statePath) {
  try {
    fs.unlinkSync(statePath);
  } catch {
    // Datei existiert nicht oder ist nicht loeschbar - beides akzeptabel.
  }
}

module.exports = {
  defaultRuntimeStatePath,
  writeRuntimeState,
  readRuntimeState,
  removeRuntimeState,
};
