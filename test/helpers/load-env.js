'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ENV_PATH = path.join(__dirname, '..', '..', '.env');

/**
 * Lädt Variablen aus .env ins process.env, ohne bereits gesetzte
 * Variablen (z.B. von CI) zu überschreiben. Fehlt die Datei, passiert nichts.
 */
function loadEnvFile(envPath = ENV_PATH) {
  if (!fs.existsSync(envPath)) {
    return;
  }

  const content = fs.readFileSync(envPath, 'utf8');

  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, eqIndex).trim();
    const value = trimmed.slice(eqIndex + 1).trim().replace(/^["']|["']$/g, '');

    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

module.exports = { loadEnvFile };
