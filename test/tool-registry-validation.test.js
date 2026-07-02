'use strict';

/**
 * Testet Issue #151 (Deklarative Tool-Registry statt Switch-Case-Dispatch):
 * ungueltige Args gegen ein Tool-inputSchema werden an der Systemgrenze
 * (lib/mcp-server-runtime.js, validateToolArgs) abgelehnt, BEVOR der
 * jeweilige Tool-Handler laeuft - unabhaengig davon, zu welchem der 7
 * Tool-Module das Tool gehoert.
 *
 * Zwei Ebenen:
 * 1) Unit-Test von validateToolArgs() direkt (schnelle Schema-Faelle).
 * 2) End-to-End ueber moodle-mcp.js per stdio: ein Tool-Call mit fehlendem
 *    Pflichtfeld darf NICHT bei Moodle ankommen (kein Handler-Seiteneffekt),
 *    sondern muss vor dem Handler-Aufruf mit isError abgelehnt werden.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');

const { validateToolArgs } = require('../lib/mcp-server-runtime');

test('validateToolArgs: wirft bei fehlendem Pflichtfeld', () => {
  const schema = {
    type: 'object',
    properties: { courseid: { type: 'number' }, sectionnum: { type: 'number' } },
    required: ['courseid', 'sectionnum'],
  };

  assert.throws(
    () => validateToolArgs(schema, { courseid: 1 }),
    /sectionnum/
  );
});

test('validateToolArgs: wirft bei falschem Typ eines vorhandenen Feldes', () => {
  const schema = {
    type: 'object',
    properties: { courseid: { type: 'number' } },
    required: ['courseid'],
  };

  assert.throws(
    () => validateToolArgs(schema, { courseid: 'not-a-number' }),
    /courseid/
  );
});

test('validateToolArgs: akzeptiert vollstaendige, typkorrekte Args', () => {
  const schema = {
    type: 'object',
    properties: {
      courseid: { type: 'number' },
      questionids: { type: 'array', items: { type: 'number' } },
    },
    required: ['courseid', 'questionids'],
  };

  assert.doesNotThrow(() => validateToolArgs(schema, { courseid: 1, questionids: [1, 2] }));
});

test('validateToolArgs: ignoriert optionale Felder, die in args fehlen', () => {
  const schema = {
    type: 'object',
    properties: { cmid: { type: 'number' }, name: { type: 'string' } },
    required: ['cmid'],
  };

  assert.doesNotThrow(() => validateToolArgs(schema, { cmid: 1 }));
});

// ─────────────────────────────────────────────────────────────
// End-to-End: moodle-mcp.js lehnt ungueltige Args vor dem Handler ab
// ─────────────────────────────────────────────────────────────
const SERVER_PATH = path.join(__dirname, '..', 'moodle-mcp.js');

function startServer() {
  const child = spawn('node', [SERVER_PATH], {
    env: {
      ...process.env,
      MOODLE_URL: 'https://example.test/moodle',
      MOODLE_TOKEN: 'dummy-token',
    },
  });

  let stdoutBuffer = '';
  const pending = [];

  child.stdout.on('data', chunk => {
    stdoutBuffer += chunk;
    const lines = stdoutBuffer.split('\n');
    stdoutBuffer = lines.pop();
    for (const line of lines) {
      if (!line.trim()) continue;
      const next = pending.shift();
      if (next) next(JSON.parse(line));
    }
  });

  return {
    request(message) {
      child.stdin.write(`${JSON.stringify(message)}\n`);
      return new Promise(resolve => pending.push(resolve));
    },
    stop() {
      child.stdin.end();
    },
  };
}

test('tools/call lehnt fehlendes Pflichtfeld ab, bevor der Handler eine Moodle-Anfrage ausloest', async () => {
  const server = startServer();
  try {
    // moodle_create_page benoetigt courseid, sectionnum, name, content
    // (lib/page-tools.js) - hier fehlt "content" komplett.
    const response = await server.request({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'moodle_create_page',
        arguments: { courseid: 1, sectionnum: 0, name: 'Testseite' },
      },
    });

    assert.equal(response.result.isError, true);
    assert.match(response.result.content[0].text, /content/);
    // Da MOODLE_URL auf ein nicht existierendes Test-Moodle zeigt, wuerde ein
    // tatsaechlicher Handler-Aufruf einen Netzwerkfehler werfen (ECONNREFUSED/
    // fetch failed o.ae.), keinen Validierungsfehler ueber das fehlende Feld.
    assert.doesNotMatch(response.result.content[0].text, /ECONNREFUSED|fetch failed|ENOTFOUND/);
  } finally {
    server.stop();
  }
});

test('tools/call lehnt falschen Feldtyp ab, bevor der Handler laeuft', async () => {
  const server = startServer();
  try {
    const response = await server.request({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'moodle_get_sections',
        arguments: { courseid: 'nicht-numerisch' },
      },
    });

    assert.equal(response.result.isError, true);
    assert.match(response.result.content[0].text, /courseid/);
  } finally {
    server.stop();
  }
});
