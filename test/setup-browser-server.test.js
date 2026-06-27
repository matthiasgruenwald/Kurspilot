'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');

const {
  DEFAULT_IDLE_TIMEOUT_MS,
  startSetupBrowserServer,
  defaultChooseWorkspaceFolder,
} = require('../lib/setup-browser-server');

function request(url, options = {}) {
  return new Promise((resolve, reject) => {
    const requestBody = options.body || '';
    const headers = options.headers || {};
    if (requestBody && !headers['content-length']) {
      headers['content-length'] = Buffer.byteLength(requestBody);
    }
    const req = http.request(url, { method: options.method || 'GET', headers }, res => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', chunk => {
        body += chunk;
      });
      res.on('end', () => {
        resolve({ statusCode: res.statusCode, headers: res.headers, body });
      });
    });
    req.on('error', reject);
    if (requestBody) {
      req.write(requestBody);
    }
    req.end();
  });
}

test('lokales Browser-Konfigurationstool bindet lokal auf automatischem Port und zeigt Statusseite', async () => {
  const openedUrls = [];
  const tool = await startSetupBrowserServer({
    openBrowser: url => {
      openedUrls.push(url);
    },
    statusOptions: {
      detectClients: () => ({ codex: true, claude: false }),
      readCredentials: () => ({ url: 'https://moodle.example.test', token: 'geheimer-token' }),
      readWorkspaceSetting: () => ({
        ok: true,
        status: 'configured',
        contextRoot: '/Users/test/Documents/Kurspilot',
      }),
      getClientSetupStatus: () => ({ codex: { needsRepair: false }, claude: { needsRepair: false } }),
    },
  });

  try {
    assert.match(tool.url, /^http:\/\/127\.0\.0\.1:\d+\/$/);
    assert.deepStrictEqual(openedUrls, [tool.url]);

    const response = await request(tool.url);

    assert.strictEqual(response.statusCode, 200);
    assert.match(response.headers['content-type'], /^text\/html; charset=utf-8/);
    assert.match(response.body, /Kurspilot konfigurieren/);
    assert.match(response.body, /Kurspilot-Status/);
    assert.match(response.body, /Codex wurde erkannt/);
    assert.match(response.body, /Claude wurde nicht erkannt/);
    assert.match(response.body, /Moodle-URL ist gespeichert/);
    assert.match(response.body, /Moodle-Token ist gespeichert/);
    assert.match(response.body, /Arbeitsbereich ist eingerichtet/);
    assert.match(response.body, /Aktueller Stand und Änderungen/);
    assert.match(response.body, /Kurspilot einrichten\/reparieren/);
    assert.match(response.body, /Moodle-Token erneuern/);
    assert.match(response.body, /Moodle-URL ändern/);
    assert.match(response.body, /Arbeitsbereich ändern/);
    assert.match(response.body, /Erkannte Clients/);
    assert.doesNotMatch(response.body, /name="client" value="claude"/);
    assert.match(response.body, /data-current="Gespeichert"/);
    assert.match(response.body, /data-selected="Wird geändert"/);
    assert.match(response.body, /Ordner wählen/);
    assert.match(response.body, /id="choose-workspace-button"/);
    assert.match(response.body, /button\.dataset\.busy/);
    assert.match(response.body, /button\.disabled = true/);
    assert.doesNotMatch(response.body, /Wartungsbereich-Auswahl/);
    assert.doesNotMatch(response.body, /<h2 id="values-heading">Werte<\/h2>/);
    assert.doesNotMatch(response.body, /Nichts aendern/);
    assert.doesNotMatch(response.body, /aendern|ausfuehren|bestaetigen|oeffnen|einfuegen/);
    assert.match(response.body, /value="https:\/\/moodle\.example\.test"/);
    assert.match(response.body, /Moodle-Token ist gespeichert/);
    assert.match(response.body, /name="moodleToken"[^>]*disabled/);
    assert.match(response.body, /Token-Anleitung/);
    assert.match(response.body, /Token erstellen oder erneuern/);
    assert.match(response.body, /src="\/assets\/setup\/token-help.svg"/);
    assert.doesNotMatch(response.body, /(href|src)="https?:\/\//);
    assert.doesNotMatch(response.body, /geheimer-token/);
  } finally {
    await tool.close();
  }
});

test('ImageMagick-Status und Installationsangebot werden auf Windows angezeigt, wenn nicht installiert', async () => {
  const tool = await startSetupBrowserServer({
    openBrowser: () => {},
    statusOptions: {
      detectClients: () => ({ codex: true, claude: false }),
      readCredentials: () => ({ url: 'https://moodle.example.test', token: 'token' }),
      readWorkspaceSetting: () => ({ ok: true, status: 'configured', contextRoot: '/Users/test/Kurspilot' }),
      getClientSetupStatus: () => ({ codex: { needsRepair: false }, claude: { needsRepair: false } }),
      platform: 'win32',
      isImageMagickAvailable: () => false,
    },
  });

  try {
    const response = await request(tool.url);

    assert.match(response.body, /ImageMagick ist nicht installiert/);
    assert.match(response.body, /ImageMagick installieren/);
    assert.match(response.body, /passgenau/);
    assert.doesNotMatch(response.body, /(href|src)="https?:\/\//);
  } finally {
    await tool.close();
  }
});

test('ImageMagick-Status zeigt "installiert" und bietet keine erneute Installation an, wenn schon vorhanden', async () => {
  const tool = await startSetupBrowserServer({
    openBrowser: () => {},
    statusOptions: {
      detectClients: () => ({ codex: true, claude: false }),
      readCredentials: () => ({ url: 'https://moodle.example.test', token: 'token' }),
      readWorkspaceSetting: () => ({ ok: true, status: 'configured', contextRoot: '/Users/test/Kurspilot' }),
      getClientSetupStatus: () => ({ codex: { needsRepair: false }, claude: { needsRepair: false } }),
      platform: 'win32',
      isImageMagickAvailable: () => true,
    },
  });

  try {
    const response = await request(tool.url);

    assert.match(response.body, /ImageMagick ist installiert/);
    assert.doesNotMatch(response.body, /name="maintenance" value="imagemagick-install"/);
  } finally {
    await tool.close();
  }
});

test('ImageMagick-Bereich wird auf nicht unterstuetzten Plattformen nicht angezeigt', async () => {
  const tool = await startSetupBrowserServer({
    openBrowser: () => {},
    statusOptions: {
      detectClients: () => ({ codex: true, claude: false }),
      readCredentials: () => ({ url: 'https://moodle.example.test', token: 'token' }),
      readWorkspaceSetting: () => ({ ok: true, status: 'configured', contextRoot: '/Users/test/Kurspilot' }),
      getClientSetupStatus: () => ({ codex: { needsRepair: false }, claude: { needsRepair: false } }),
      platform: 'darwin',
      isImageMagickAvailable: () => false,
    },
  });

  try {
    const response = await request(tool.url);

    assert.doesNotMatch(response.body, /ImageMagick/);
  } finally {
    await tool.close();
  }
});

test('Ordnerdialog schlaegt ohne vorhandenen Arbeitsbereich den Dokumente-Standardordner vor, nicht das Arbeitsverzeichnis', () => {
  const homeDir = process.platform === 'win32' ? 'C:\\Users\\test' : '/Users/test';
  const expectedDefault = path.join(homeDir, 'Documents', 'Kurspilot');
  let receivedCommand = null;

  defaultChooseWorkspaceFolder('', {
    homeDir,
    execFileSync: (command, args) => {
      receivedCommand = (args || []).join(' ');
      return '';
    },
  });

  assert.ok(
    receivedCommand && receivedCommand.includes(JSON.stringify(expectedDefault)),
    `Default-Ordner sollte ${expectedDefault} vorschlagen, war aber: ${receivedCommand}`
  );
});

test('macOS-Ordnerdialog wird vor dem Öffnen nach vorne geholt', () => {
  const source = require('node:fs').readFileSync(require.resolve('../lib/setup-browser-server'), 'utf8');
  assert.match(source, /tell application "Finder" to activate/);
  assert.match(source, /choose folder with prompt "Kurspilot-Arbeitsbereich wählen"/);
});

test('Arbeitsbereich kann ueber lokalen Ordnerdialog in das Browserformular uebernommen werden', async () => {
  const tool = await startSetupBrowserServer({
    openBrowser: () => {},
    chooseWorkspaceFolder: () => ({
      workspacePath: '/Users/test/Gewaehlt/Kurspilot',
      confirmed: true,
    }),
    statusOptions: {
      detectClients: () => ({ codex: false, claude: true }),
      readCredentials: () => ({ url: 'https://moodle.example.test', token: 'token' }),
      readWorkspaceSetting: () => ({
        ok: true,
        status: 'configured',
        contextRoot: '/Users/test/Alt/Kurspilot',
      }),
      getClientSetupStatus: () => ({ codex: { needsRepair: false }, claude: { needsRepair: false } }),
    },
  });

  try {
    const response = await request(new URL('/choose-workspace?current=/Users/test/Alt/Kurspilot', tool.url));

    assert.strictEqual(response.statusCode, 200);
    assert.match(response.headers['content-type'], /^application\/json; charset=utf-8/);
    assert.deepStrictEqual(JSON.parse(response.body), {
      workspacePath: '/Users/test/Gewaehlt/Kurspilot',
      confirmed: true,
    });
  } finally {
    await tool.close();
  }
});

test('Browser-Nebenanfragen und Abschlussantworten beenden sauber', async () => {
  const homeDir = `/tmp/kurspilot-browser-home-${process.pid}`;
  const workspacePath = `/tmp/kurspilot-browser-test-${process.pid}`;
  const tool = await startSetupBrowserServer({
    openBrowser: () => {},
    statusOptions: {
      detectClients: () => ({ codex: true, claude: false }),
      readCredentials: () => ({ url: 'https://moodle.example.test', token: 'token' }),
      readWorkspaceSetting: () => ({
        ok: true,
        status: 'configured',
        contextRoot: workspacePath,
      }),
      getClientSetupStatus: () => ({ codex: { needsRepair: false }, claude: { needsRepair: false } }),
    },
    flowOptions: {
      homeDir,
      detectClients: () => ({ codex: true, claude: false }),
      readCredentials: () => ({ url: 'https://moodle.example.test', token: 'token' }),
    },
  });

  const favicon = await request(new URL('/favicon.ico', tool.url));
  assert.strictEqual(favicon.statusCode, 204);

  const form = new URLSearchParams({
    maintenance: 'workspace-change',
    workspacePath,
    workspaceSelectionConfirmed: '1',
  });
  const done = await request(new URL('/done', tool.url), {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  });

  assert.strictEqual(done.statusCode, 200);
  assert.strictEqual(done.headers.connection, 'close');
  await tool.closed;
});

test('lokaler Browser-Dienst beendet sich nach Idle-Timeout', async () => {
  const tool = await startSetupBrowserServer({
    openBrowser: () => {},
    idleTimeoutMs: 20,
    statusOptions: {
      detectClients: () => ({ codex: true, claude: false }),
      readCredentials: () => null,
      readWorkspaceSetting: () => ({ ok: false, status: 'missing' }),
      getClientSetupStatus: () => ({ codex: { needsRepair: true }, claude: { needsRepair: false } }),
    },
  });

  await tool.closed;
});

test('lokaler Browser-Dienst nutzt standardmäßig zwei Stunden Idle-Timeout', () => {
  assert.strictEqual(DEFAULT_IDLE_TIMEOUT_MS, 2 * 60 * 60 * 1000);
});

test('Token-Anleitung wird als lokales Asset ausgeliefert und enthaelt keinen Token', async () => {
  const tool = await startSetupBrowserServer({
    openBrowser: () => {},
    statusOptions: {
      detectClients: () => ({ codex: true, claude: false }),
      readCredentials: () => ({ url: 'https://moodle.example.test', token: 'asset-token-darf-nicht-ausgeliefert-werden' }),
      readWorkspaceSetting: () => ({ ok: false, status: 'missing' }),
      getClientSetupStatus: () => ({ codex: { needsRepair: true }, claude: { needsRepair: false } }),
    },
  });

  try {
    const response = await request(new URL('/assets/setup/token-help.svg', tool.url));

    assert.strictEqual(response.statusCode, 200);
    assert.match(response.headers['content-type'], /^image\/svg\+xml; charset=utf-8/);
    assert.match(response.body, /Moodle-Token/);
    assert.doesNotMatch(response.body, /asset-token-darf-nicht-ausgeliefert-werden/);
    assert.doesNotMatch(response.body, /(href|src)="https?:\/\//);
  } finally {
    await tool.close();
  }
});

test('lokales Browser-Konfigurationstool zeigt den After-Install-Modus', async () => {
  const tool = await startSetupBrowserServer({
    openBrowser: () => {},
    startMode: 'after-install',
    statusOptions: {
      detectClients: () => ({ codex: true, claude: false }),
      readCredentials: () => ({ url: null, token: null }),
      readWorkspaceSetting: () => ({ ok: false, status: 'missing' }),
      getClientSetupStatus: () => ({ codex: { needsRepair: true }, claude: { needsRepair: false } }),
    },
  });

  try {
    const response = await request(tool.url);

    assert.strictEqual(response.statusCode, 200);
    assert.match(response.body, /Modus: Nach der Installation/);
  } finally {
    await tool.close();
  }
});

test('lokaler Dienst kann per HTTP-Abbruch sauber beendet werden', async () => {
  const tool = await startSetupBrowserServer({
    openBrowser: () => {},
    statusOptions: {
      detectClients: () => ({ codex: true, claude: true }),
      readCredentials: () => ({ url: null, token: null }),
      readWorkspaceSetting: () => ({ ok: false, status: 'missing' }),
      getClientSetupStatus: () => ({ codex: { needsRepair: true }, claude: { needsRepair: false } }),
    },
  });

  const response = await request(new URL('/abort', tool.url), { method: 'POST' });

  assert.strictEqual(response.statusCode, 200);
  assert.match(response.body, /Kurspilot-Konfiguration wurde beendet/);
  await tool.closed;
  await assert.rejects(request(tool.url), /ECONNREFUSED|ECONNRESET|socket hang up/);
});

test('Browser-Auswahl fuehrt nur gewaehlte Wartungsbereiche aus und nennt keinen Token', async () => {
  const calls = {
    setCredentials: [],
    setupCodexConfig: [],
    setupClaudeDesktopConfig: [],
    installSkills: [],
    writeWorkspaceSetting: [],
  };
  const tool = await startSetupBrowserServer({
    openBrowser: () => {},
    statusOptions: {
      detectClients: () => ({ codex: true, claude: true }),
      readCredentials: () => ({ url: 'https://old.example.test', token: 'bestehender-token' }),
      readWorkspaceSetting: () => ({
        ok: true,
        status: 'configured',
        contextRoot: '/Users/test/Documents/Kurspilot',
      }),
      getClientSetupStatus: () => ({ codex: { needsRepair: false }, claude: { needsRepair: false } }),
    },
    flowOptions: {
      homeDir: '/Users/test',
      detectClients: () => ({ codex: true, claude: true }),
      readCredentials: () => ({ url: 'https://old.example.test', token: 'bestehender-token' }),
      setCredentials: (url, token) => {
        calls.setCredentials.push({ url, token });
      },
      setupCodexConfig: (...args) => {
        calls.setupCodexConfig.push(args);
      },
      setupClaudeDesktopConfig: (...args) => {
        calls.setupClaudeDesktopConfig.push(args);
      },
      installSkillsForProvider: (...args) => {
        calls.installSkills.push(args);
      },
      writeWorkspaceSetting: (...args) => {
        calls.writeWorkspaceSetting.push(args);
        return { configPath: '/Users/test/.kurspilot/workspace.json' };
      },
    },
  });

  const secretToken = 'neuer-token-darf-nicht-in-antwort';
  const form = new URLSearchParams({
    maintenance: 'moodle-token-renewal',
    moodleToken: secretToken,
    workspacePath: '/Users/test/Unbestaetigter-Default',
  });

  const response = await request(new URL('/done', tool.url), {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  });

  assert.strictEqual(response.statusCode, 200);
  assert.match(response.body, /Moodle-Token erneuert/);
  assert.doesNotMatch(response.body, /neuer-token-darf-nicht-in-antwort/);
  assert.deepStrictEqual(calls.setCredentials, [
    { url: 'https://old.example.test', token: secretToken },
  ]);
  assert.strictEqual(calls.setupCodexConfig.length, 0);
  assert.strictEqual(calls.setupClaudeDesktopConfig.length, 0);
  assert.strictEqual(calls.installSkills.length, 0);
  assert.strictEqual(calls.writeWorkspaceSetting.length, 0);

  await tool.closed;
});

// --- Claude laeuft bereits: Warnbanner, gesperrter Submit, Beenden-Button (Issue #112) ---

test('Browser-Konfigurator zeigt Warnbanner und sperrt Submit, wenn Claude laeuft', async () => {
  const tool = await startSetupBrowserServer({
    openBrowser: () => {},
    statusOptions: {
      detectClients: () => ({ codex: false, claude: true }),
      isClaudeRunning: () => true,
      readCredentials: () => ({ url: 'https://moodle.example.test', token: 'token' }),
      readWorkspaceSetting: () => ({ ok: true, status: 'configured', contextRoot: '/Users/test/Kurspilot' }),
      getClientSetupStatus: () => ({ codex: { needsRepair: false }, claude: { needsRepair: false } }),
    },
  });

  try {
    const response = await request(tool.url);

    assert.strictEqual(response.statusCode, 200);
    assert.match(response.body, /Claude läuft noch/);
    assert.match(response.body, /<button type="submit" disabled>/);
    assert.match(response.body, /Claude jetzt beenden und fortfahren/);
    assert.match(response.body, /id="end-claude-button"/);
  } finally {
    await tool.close();
  }
});

test('Browser-Konfigurator zeigt kein Warnbanner und sperrt Submit nicht, wenn Claude nicht laeuft', async () => {
  const tool = await startSetupBrowserServer({
    openBrowser: () => {},
    statusOptions: {
      detectClients: () => ({ codex: false, claude: true }),
      isClaudeRunning: () => false,
      readCredentials: () => ({ url: 'https://moodle.example.test', token: 'token' }),
      readWorkspaceSetting: () => ({ ok: true, status: 'configured', contextRoot: '/Users/test/Kurspilot' }),
      getClientSetupStatus: () => ({ codex: { needsRepair: false }, claude: { needsRepair: false } }),
    },
  });

  try {
    const response = await request(tool.url);

    assert.doesNotMatch(response.body, /Claude läuft noch/);
    assert.match(response.body, /<button type="submit">/);
    assert.doesNotMatch(response.body, /id="end-claude-button"/);
  } finally {
    await tool.close();
  }
});

test('Beenden-Button ruft injizierten Claude-Beenden-Helfer auf und gibt das Schreiben frei', async () => {
  const endClaudeCalls = [];
  let claudeRunning = true;
  const tool = await startSetupBrowserServer({
    openBrowser: () => {},
    statusOptions: {
      detectClients: () => ({ codex: false, claude: true }),
      isClaudeRunning: () => claudeRunning,
      readCredentials: () => ({ url: 'https://moodle.example.test', token: 'token' }),
      readWorkspaceSetting: () => ({ ok: true, status: 'configured', contextRoot: '/Users/test/Kurspilot' }),
      getClientSetupStatus: () => ({ codex: { needsRepair: false }, claude: { needsRepair: false } }),
    },
    endClaudeDesktop: () => {
      endClaudeCalls.push(true);
      claudeRunning = false;
      return true;
    },
  });

  try {
    const endResponse = await request(new URL('/end-claude-and-continue', tool.url), { method: 'POST' });
    assert.strictEqual(endResponse.statusCode, 200);
    assert.strictEqual(endClaudeCalls.length, 1);

    const refreshed = await request(tool.url);
    assert.doesNotMatch(refreshed.body, /Claude läuft noch/);
    assert.match(refreshed.body, /<button type="submit">/);
  } finally {
    await tool.close();
  }
});

test('Beenden-Button wartet auf das tatsaechliche Prozessende, bevor das Schreiben freigegeben wird', async () => {
  let claudeRunning = true;
  const waitCalls = [];
  const tool = await startSetupBrowserServer({
    openBrowser: () => {},
    statusOptions: {
      detectClients: () => ({ codex: false, claude: true }),
      isClaudeRunning: () => claudeRunning,
      readCredentials: () => ({ url: 'https://moodle.example.test', token: 'token' }),
      readWorkspaceSetting: () => ({ ok: true, status: 'configured', contextRoot: '/Users/test/Kurspilot' }),
      getClientSetupStatus: () => ({ codex: { needsRepair: false }, claude: { needsRepair: false } }),
    },
    endClaudeDesktop: () => true,
    waitForClaudeToExit: async ({ isClaudeRunning }) => {
      waitCalls.push(isClaudeRunning());
      claudeRunning = false;
      waitCalls.push(isClaudeRunning());
      return true;
    },
  });

  try {
    const endResponse = await request(new URL('/end-claude-and-continue', tool.url), { method: 'POST' });
    assert.strictEqual(endResponse.statusCode, 200);
    assert.deepStrictEqual(waitCalls, [true, false]);
  } finally {
    await tool.close();
  }
});

test('Endbericht zeigt Claude-laeuft-Warnung, falls trotz Banner submittet wird', async () => {
  const tool = await startSetupBrowserServer({
    openBrowser: () => {},
    statusOptions: {
      detectClients: () => ({ codex: false, claude: true }),
      isClaudeRunning: () => true,
      readCredentials: () => ({ url: 'https://moodle.example.test', token: 'token' }),
      readWorkspaceSetting: () => ({ ok: true, status: 'configured', contextRoot: '/Users/test/Kurspilot' }),
      getClientSetupStatus: () => ({ codex: { needsRepair: false }, claude: { needsRepair: false } }),
    },
    flowOptions: {
      homeDir: '/Users/test',
      detectClients: () => ({ codex: false, claude: true }),
      isClaudeRunning: () => true,
      readCredentials: () => ({ url: 'https://moodle.example.test', token: 'token' }),
    },
  });

  const form = new URLSearchParams({ maintenance: 'kurspilot-setup-or-repair', client: 'claude' });
  const response = await request(new URL('/done', tool.url), {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  });

  assert.strictEqual(response.statusCode, 200);
  assert.match(response.body, /Warnungen:/);
  assert.match(response.body, /Claude/);
  await tool.closed;
});

test('Browser-Antwort zeigt ImageMagick-Installationsfehler als Warnung', async () => {
  const tool = await startSetupBrowserServer({
    openBrowser: () => {},
    statusOptions: {
      detectClients: () => ({ codex: true, claude: false }),
      readCredentials: () => ({ url: 'https://moodle.example.test', token: 'token' }),
      readWorkspaceSetting: () => ({ ok: true, status: 'configured', contextRoot: '/Users/test/Kurspilot' }),
      getClientSetupStatus: () => ({ codex: { needsRepair: false }, claude: { needsRepair: false } }),
      platform: 'win32',
      isImageMagickAvailable: () => false,
    },
    flowOptions: {
      homeDir: '/Users/test',
      detectClients: () => ({ codex: true, claude: false }),
      isImageMagickAvailable: () => false,
      installImageMagick: () => ({ installed: false, error: 'winget nicht gefunden' }),
    },
  });

  const form = new URLSearchParams({ maintenance: 'imagemagick-install' });
  const response = await request(new URL('/done', tool.url), {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  });

  assert.strictEqual(response.statusCode, 200);
  assert.match(response.body, /Warnungen:/);
  assert.match(response.body, /winget nicht gefunden/);
  await tool.closed;
});

test('Browser-Antwort zeigt Warnungen bei Skill-Konflikten sichtbar an', async () => {
  const tool = await startSetupBrowserServer({
    openBrowser: () => {},
    statusOptions: {
      detectClients: () => ({ codex: true, claude: false }),
      readCredentials: () => ({ url: 'https://moodle.example.test', token: 'token' }),
      readWorkspaceSetting: () => ({ ok: true, status: 'configured', contextRoot: '/Users/test/Kurspilot' }),
      getClientSetupStatus: () => ({ codex: { needsRepair: true }, claude: { needsRepair: false } }),
    },
    flowOptions: {
      homeDir: '/Users/test',
      detectClients: () => ({ codex: true, claude: false }),
      readCredentials: () => ({ url: 'https://moodle.example.test', token: 'token' }),
      setupCodexConfig: () => {},
      installSkillsForProvider: () => ({
        aborted: true,
        warnings: ['Verwalteter Kurspilot-Skill lokal verändert: kurspilot-einrichten/SKILL.md.'],
        conflicts: ['kurspilot-einrichten/SKILL.md'],
      }),
    },
  });

  const form = new URLSearchParams({
    maintenance: 'kurspilot-setup-or-repair',
    client: 'codex',
  });

  const response = await request(new URL('/done', tool.url), {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  });

  assert.strictEqual(response.statusCode, 200);
  assert.match(response.body, /Warnungen:/);
  assert.match(response.body, /kurspilot-einrichten\/SKILL\.md/);
  await tool.closed;
});

// --- Updates (Issue #128) ----------------------------------------------------

test('Startseite zeigt den Knopf "Nach Updates suchen"', async () => {
  const tool = await startSetupBrowserServer({
    openBrowser: () => {},
    statusOptions: {
      detectClients: () => ({ codex: true, claude: false }),
      readCredentials: () => ({ url: 'https://moodle.example.test', token: 'token' }),
      readWorkspaceSetting: () => ({ ok: true, status: 'configured', contextRoot: '/Users/test/Kurspilot' }),
      getClientSetupStatus: () => ({ codex: { needsRepair: false }, claude: { needsRepair: false } }),
    },
  });

  try {
    const response = await request(tool.url);
    assert.match(response.body, /Nach Updates suchen/);
    assert.match(response.body, /id="check-updates-button"/);
  } finally {
    await tool.close();
  }
});

test('GET /check-updates liefert App- und ImageMagick-Update-Status als JSON', async () => {
  const tool = await startSetupBrowserServer({
    openBrowser: () => {},
    statusOptions: {
      detectClients: () => ({ codex: true, claude: false }),
      readCredentials: () => ({ url: 'https://moodle.example.test', token: 'token' }),
      readWorkspaceSetting: () => ({ ok: true, status: 'configured', contextRoot: '/Users/test/Kurspilot' }),
      getClientSetupStatus: () => ({ codex: { needsRepair: false }, claude: { needsRepair: false } }),
    },
    updateOptions: {
      checkAppUpdate: async () => ({ updateAvailable: true, offline: false, error: null }),
      checkImageMagickUpdate: () => ({ updateAvailable: false, offline: false, supported: false, error: null }),
    },
  });

  try {
    const response = await request(new URL('/check-updates', tool.url));
    const result = JSON.parse(response.body);

    assert.strictEqual(response.statusCode, 200);
    assert.strictEqual(result.offline, false);
    assert.strictEqual(result.app.updateAvailable, true);
    assert.strictEqual(result.imageMagick.supported, false);
  } finally {
    await tool.close();
  }
});

test('GET /check-updates meldet Offline-Status verstaendlich, statt zu crashen', async () => {
  const tool = await startSetupBrowserServer({
    openBrowser: () => {},
    statusOptions: {
      detectClients: () => ({ codex: true, claude: false }),
      readCredentials: () => ({ url: null, token: null }),
      readWorkspaceSetting: () => ({ ok: false, status: 'missing' }),
      getClientSetupStatus: () => ({ codex: { needsRepair: false }, claude: { needsRepair: false } }),
    },
    updateOptions: {
      checkAppUpdate: async () => ({ updateAvailable: false, offline: true, error: 'Keine Verbindung: Update-Prüfung war nicht möglich.' }),
    },
  });

  try {
    const response = await request(new URL('/check-updates', tool.url));
    const result = JSON.parse(response.body);

    assert.strictEqual(response.statusCode, 200);
    assert.strictEqual(result.offline, true);
    assert.match(result.error, /[Vv]erbindung/);
  } finally {
    await tool.close();
  }
});

test('POST /apply-updates installiert Update und meldet Skill-Konflikt mit Skillname und fertigem Prompt', async () => {
  const tool = await startSetupBrowserServer({
    openBrowser: () => {},
    statusOptions: {
      detectClients: () => ({ codex: true, claude: false }),
      readCredentials: () => ({ url: 'https://moodle.example.test', token: 'token' }),
      readWorkspaceSetting: () => ({ ok: true, status: 'configured', contextRoot: '/Users/test/Kurspilot' }),
      getClientSetupStatus: () => ({ codex: { needsRepair: false }, claude: { needsRepair: false } }),
    },
    updateOptions: {
      checkImageMagickUpdate: () => ({ updateAvailable: false, offline: false, supported: false, error: null }),
      applyAppUpdate: async () => ({
        installed: true,
        offline: false,
        error: null,
        skillInstallAborted: true,
        skillInstallWarnings: ['Verwalteter Kurspilot-Skill lokal verändert: kurspilot-planen/SKILL.md.'],
        skillInstallConflicts: ['kurspilot-planen/SKILL.md'],
        skillInstallConflictPrompts: [
          { skillName: 'kurspilot-planen', prompt: 'Vergleiche meine Version von kurspilot-planen mit dem Kurspilot-Update und führe meine Anpassungen in die neue Version zusammen, dann benenne sie um.' },
        ],
      }),
    },
  });

  try {
    const response = await request(new URL('/apply-updates', tool.url), { method: 'POST' });
    const result = JSON.parse(response.body);

    assert.strictEqual(response.statusCode, 200);
    assert.strictEqual(result.installed, true);
    assert.strictEqual(result.skillInstallAborted, true);
    assert.strictEqual(result.skillInstallConflictPrompts.length, 1);
    assert.strictEqual(result.skillInstallConflictPrompts[0].skillName, 'kurspilot-planen');
    assert.match(result.skillInstallConflictPrompts[0].prompt, /kurspilot-planen/);
  } finally {
    await tool.close();
  }
});

test('POST /apply-updates meldet Offline-Status verstaendlich, statt zu crashen', async () => {
  const tool = await startSetupBrowserServer({
    openBrowser: () => {},
    statusOptions: {
      detectClients: () => ({ codex: true, claude: false }),
      readCredentials: () => ({ url: 'https://moodle.example.test', token: 'token' }),
      readWorkspaceSetting: () => ({ ok: true, status: 'configured', contextRoot: '/Users/test/Kurspilot' }),
      getClientSetupStatus: () => ({ codex: { needsRepair: false }, claude: { needsRepair: false } }),
    },
    updateOptions: {
      applyAppUpdate: async () => ({ installed: false, offline: true, error: 'Keine Verbindung: Update-Installation war nicht möglich.' }),
    },
  });

  try {
    const response = await request(new URL('/apply-updates', tool.url), { method: 'POST' });
    const result = JSON.parse(response.body);

    assert.strictEqual(response.statusCode, 200);
    assert.strictEqual(result.offline, true);
    assert.match(result.error, /[Vv]erbindung/);
  } finally {
    await tool.close();
  }
});
