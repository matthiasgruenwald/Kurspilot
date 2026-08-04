'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');

const {
  DEFAULT_IDLE_TIMEOUT_MS,
  DEFAULT_FIRST_REQUEST_TIMEOUT_MS,
  startSetupBrowserServer,
  launchSetupBrowserServer,
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

function urlFor(tool, pathWithQuery) {
  const url = new URL(pathWithQuery, tool.url);
  const token = new URL(tool.url).searchParams.get('token');
  if (token && !url.searchParams.has('token')) {
    url.searchParams.set('token', token);
  }
  return url;
}

function withoutToken(tool, pathWithQuery) {
  return new URL(pathWithQuery, tool.url);
}

function withWrongToken(tool, pathWithQuery) {
  const url = new URL(pathWithQuery, tool.url);
  url.searchParams.set('token', 'f'.repeat(32));
  return url;
}

const tokenStatusOptions = {
  detectClients: () => ({ codex: true, claude: false }),
  readCredentials: () => ({ url: 'https://moodle.example.test', token: 'token' }),
  readWorkspaceSetting: () => ({ ok: true, status: 'configured', contextRoot: '/Users/test/Kurspilot' }),
  getClientSetupStatus: () => ({ codex: { needsRepair: true }, claude: { needsRepair: false } }),
};

test('lokales Browser-Konfigurationstool bindet lokal auf automatischem Port und zeigt Wartungsansicht', async () => {
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
      getClientSetupStatus: () => ({ codex: { needsRepair: true }, claude: { needsRepair: false } }),
    },
  });

  try {
    assert.match(tool.url, /^http:\/\/127\.0\.0\.1:\d+\/\?token=[0-9a-f]{32}$/);
    assert.deepStrictEqual(openedUrls, [tool.url]);

    const response = await request(tool.url);

    assert.strictEqual(response.statusCode, 200);
    assert.match(response.headers['content-type'], /^text\/html; charset=utf-8/);
    assert.match(response.body, /<h1>Kurspilot<\/h1>/);
    assert.match(response.body, /Alles läuft/);
    assert.match(response.body, /class="card-grid"/);
    assert.match(response.body, /data-card-id="moodle"/);
    assert.match(response.body, /data-card-id="workspace"/);
    assert.match(response.body, /data-card-id="clients"/);
    assert.doesNotMatch(response.body, /geheimer-token/);
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
    platform: 'darwin',
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

test('macOS-Ordnerdialog nutzt Standard-Dialog ohne Finder-Automation', () => {
  const source = require('node:fs').readFileSync(require.resolve('../lib/setup-browser-server'), 'utf8');
  assert.doesNotMatch(source, /tell application "Finder"/);
  assert.match(source, /choose folder with prompt "Kurspilot-Arbeitsbereich wählen"/);
});

test('macOS-Ordnerdialog gibt AppleScript-Fehler sichtbar an den Browser zurueck', () => {
  const result = defaultChooseWorkspaceFolder('/Users/test/Documents/Kurspilot', {
    platform: 'darwin',
    execFileSync: () => 'ERROR:Terminal darf Finder nicht steuern\n',
  });

  assert.deepStrictEqual(result, {
    workspacePath: null,
    confirmed: false,
    error: 'Terminal darf Finder nicht steuern',
  });
});

test('macOS-Ordnerdialog gibt nach Timeout eine sichtbare Fehlermeldung zurueck', () => {
  const result = defaultChooseWorkspaceFolder('/Users/test/Documents/Kurspilot', {
    platform: 'darwin',
    execFileSync: () => {
      const err = new Error('Command failed: osascript');
      err.signal = 'SIGTERM';
      throw err;
    },
  });

  assert.deepStrictEqual(result, {
    workspacePath: null,
    confirmed: false,
    error: 'Ordnerdialog wurde von macOS nicht geöffnet. Pfad bitte direkt ins Textfeld eintragen.',
  });
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
      getClientSetupStatus: () => ({ codex: { needsRepair: true }, claude: { needsRepair: false } }),
    },
  });

  try {
    const response = await request(urlFor(tool, '/choose-workspace?current=/Users/test/Alt/Kurspilot'));

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

test('lokaler Browser-Dienst beendet sich nach Idle-Timeout', async () => {
  const tool = await startSetupBrowserServer({
    openBrowser: () => {},
    idleTimeoutMs: 20,
    firstRequestTimeoutMs: 20,
    statusOptions: {
      detectClients: () => ({ codex: true, claude: false }),
      readCredentials: () => null,
      readWorkspaceSetting: () => ({ ok: false, status: 'missing' }),
      getClientSetupStatus: () => ({ codex: { needsRepair: true }, claude: { needsRepair: false } }),
    },
  });

  await tool.closed;
});

test('lokaler Browser-Dienst beendet sich schnell, wenn der Browser nie verbindet', async () => {
  const tool = await startSetupBrowserServer({
    openBrowser: () => {},
    firstRequestTimeoutMs: 20,
    idleTimeoutMs: 1000,
    statusOptions: {
      detectClients: () => ({ codex: true, claude: false }),
      readCredentials: () => null,
      readWorkspaceSetting: () => ({ ok: false, status: 'missing' }),
      getClientSetupStatus: () => ({ codex: { needsRepair: true }, claude: { needsRepair: false } }),
    },
  });

  const reason = await tool.closed;
  assert.strictEqual(reason, 'no-browser-connection');
});

test('lokaler Browser-Dienst beendet sich zwei Minuten nach dem letzten Tab-Poll', () => {
  assert.strictEqual(DEFAULT_IDLE_TIMEOUT_MS, 2 * 60 * 1000);
});

test('lokaler Browser-Dienst nutzt standardmäßig 60 Sekunden bis zur ersten Browser-Anfrage', () => {
  assert.strictEqual(DEFAULT_FIRST_REQUEST_TIMEOUT_MS, 60 * 1000);
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
    const response = await request(urlFor(tool, '/assets/setup/token-help.svg'));

    assert.strictEqual(response.statusCode, 200);
    assert.match(response.headers['content-type'], /^image\/svg\+xml; charset=utf-8/);
    assert.match(response.body, /Moodle-Token/);
    assert.doesNotMatch(response.body, /asset-token-darf-nicht-ausgeliefert-werden/);
    assert.doesNotMatch(response.body, /(href|src)="https?:\/\//);
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

  const response = await request(urlFor(tool, '/abort'), { method: 'POST' });

  assert.strictEqual(response.statusCode, 200);
  assert.match(response.body, /✓ Beendet/);
  assert.match(response.body, /Kurspilot-Konfiguration wurde beendet/);
  assert.match(response.body, /Sie können diesen Tab jetzt schließen/);
  await tool.closed;
  await assert.rejects(request(tool.url), /ECONNREFUSED|ECONNRESET|socket hang up/);
});

test('GET /check-updates liefert App- und ImageMagick-Update-Status als JSON', async () => {
  const tool = await startSetupBrowserServer({
    openBrowser: () => {},
    statusOptions: {
      detectClients: () => ({ codex: true, claude: false }),
      readCredentials: () => ({ url: 'https://moodle.example.test', token: 'token' }),
      readWorkspaceSetting: () => ({ ok: true, status: 'configured', contextRoot: '/Users/test/Kurspilot' }),
      getClientSetupStatus: () => ({ codex: { needsRepair: true }, claude: { needsRepair: false } }),
    },
    updateOptions: {
      checkAppUpdate: async () => ({ updateAvailable: true, offline: false, error: null }),
      checkImageMagickUpdate: () => ({ updateAvailable: false, offline: false, supported: false, error: null }),
    },
  });

  try {
    const response = await request(urlFor(tool, '/check-updates'));
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
      getClientSetupStatus: () => ({ codex: { needsRepair: true }, claude: { needsRepair: false } }),
    },
    updateOptions: {
      checkAppUpdate: async () => ({ updateAvailable: false, offline: true, error: 'Keine Verbindung: Update-Prüfung war nicht möglich.' }),
    },
  });

  try {
    const response = await request(urlFor(tool, '/check-updates'));
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
      getClientSetupStatus: () => ({ codex: { needsRepair: true }, claude: { needsRepair: false } }),
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
    const response = await request(urlFor(tool, '/apply-updates'), { method: 'POST' });
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
      getClientSetupStatus: () => ({ codex: { needsRepair: true }, claude: { needsRepair: false } }),
    },
    updateOptions: {
      applyAppUpdate: async () => ({ installed: false, offline: true, error: 'Keine Verbindung: Update-Installation war nicht möglich.' }),
    },
  });

  try {
    const response = await request(urlFor(tool, '/apply-updates'), { method: 'POST' });
    const result = JSON.parse(response.body);

    assert.strictEqual(response.statusCode, 200);
    assert.strictEqual(result.offline, true);
    assert.match(result.error, /[Vv]erbindung/);
  } finally {
    await tool.close();
  }
});

// --- Aktivitaets-MCP-Auswahl im Hauptflow (Issue #96) -----------------------

test('Forum ist API-unterstuetzt und in der Checkliste aktivierbar (#224)', async () => {
  const tool = await startSetupBrowserServer({
    openBrowser: () => {},
    statusOptions: {
      detectClients: () => ({ codex: true, claude: false }),
      readCredentials: () => ({ url: 'https://moodle.example.test', token: 'token' }),
      readWorkspaceSetting: () => ({ ok: true, status: 'configured', contextRoot: '/Users/test/Kurspilot' }),
      getClientSetupStatus: () => ({ codex: { needsRepair: true }, claude: { needsRepair: false } }),
    },
  });

  try {
    const response = await request(tool.url);

    assert.match(response.body, /name="activity" value="forum"/);
  } finally {
    await tool.close();
  }
});

test('CSRF: Token ist 32 Hex-Zeichen lang und openBrowser erhaelt die URL mit Token-Param (#194)', async () => {
  const fixedToken = 'ab'.repeat(16);
  const openedUrls = [];
  const tool = await startSetupBrowserServer({
    openBrowser: url => {
      openedUrls.push(url);
    },
    generateToken: () => fixedToken,
    statusOptions: tokenStatusOptions,
  });

  try {
    assert.match(new URL(tool.url).searchParams.get('token'), /^[0-9a-f]{32}$/);
    assert.strictEqual(new URL(tool.url).searchParams.get('token'), fixedToken);
    assert.deepStrictEqual(openedUrls, [tool.url]);
    assert.match(openedUrls[0], /\?token=[0-9a-f]{32}$/);
  } finally {
    await tool.close();
  }
});

test('CSRF: GET / ohne Token -> 403 Klartext (#194)', async () => {
  const tool = await startSetupBrowserServer({
    openBrowser: () => {},
    statusOptions: tokenStatusOptions,
  });

  try {
    const response = await request(withoutToken(tool, '/'));
    assert.strictEqual(response.statusCode, 403);
    assert.match(response.headers['content-type'], /^text\/plain; charset=utf-8/);
    assert.match(response.body, /Ungueltiges oder fehlendes Token/);
    assert.match(response.body, /URL aus dem Terminal/);
  } finally {
    await tool.close();
  }
});

test('CSRF: GET / mit falschem Token -> 403 (#194)', async () => {
  const tool = await startSetupBrowserServer({
    openBrowser: () => {},
    statusOptions: tokenStatusOptions,
  });

  try {
    const response = await request(withWrongToken(tool, '/'));
    assert.strictEqual(response.statusCode, 403);
    assert.match(response.body, /Ungueltiges oder fehlendes Token/);
  } finally {
    await tool.close();
  }
});

test('CSRF: GET / mit gueltigem Token -> 200 und Seite wird gerendert (#194)', async () => {
  const tool = await startSetupBrowserServer({
    openBrowser: () => {},
    statusOptions: tokenStatusOptions,
  });

  try {
    const response = await request(tool.url);
    assert.strictEqual(response.statusCode, 200);
    assert.match(response.body, /Kurspilot konfigurieren/);
  } finally {
    await tool.close();
  }
});

test('CSRF: GET /launch ohne Token -> 403, mit Token -> 200 (#194)', async () => {
  const tool = await startSetupBrowserServer({
    openBrowser: () => {},
    statusOptions: tokenStatusOptions,
  });

  try {
    const forbidden = await request(withoutToken(tool, '/launch'));
    assert.strictEqual(forbidden.statusCode, 403);

    const ok = await request(urlFor(tool, '/launch'));
    assert.strictEqual(ok.statusCode, 200);
    assert.match(ok.body, /Kurspilot konfigurieren/);
  } finally {
    await tool.close();
  }
});

test('CSRF: /favicon.ico, /check-updates und Token-Help-Asset bleiben tokenfrei (#194)', async () => {
  const tool = await startSetupBrowserServer({
    openBrowser: () => {},
    statusOptions: tokenStatusOptions,
    updateOptions: {
      checkAppUpdate: async () => ({ updateAvailable: false, offline: false, error: null }),
      checkImageMagickUpdate: () => ({ updateAvailable: false, offline: false, supported: false, error: null }),
    },
  });

  try {
    const favicon = await request(withoutToken(tool, '/favicon.ico'));
    assert.strictEqual(favicon.statusCode, 204);

    const updates = await request(withoutToken(tool, '/check-updates'));
    assert.strictEqual(updates.statusCode, 200);

    const asset = await request(withoutToken(tool, '/assets/setup/token-help.svg'));
    assert.strictEqual(asset.statusCode, 200);
    assert.match(asset.headers['content-type'], /^image\/svg\+xml; charset=utf-8/);
  } finally {
    await tool.close();
  }
});

// --- Automatische Ansichtswahl + Wartungs-Skelett (Issue #202, Spec 0005) ---

function minimumConfiguredStatusOptions() {
  return {
    detectClients: () => ({ codex: true, claude: false }),
    readCredentials: () => ({ url: 'https://moodle.example.test', token: 'token' }),
    readWorkspaceSetting: () => ({ ok: true, status: 'configured', contextRoot: '/Users/test/Kurspilot' }),
    getClientSetupStatus: () => ({ codex: { needsRepair: false }, claude: { needsRepair: false } }),
    readConfiguredActivityIds: () => null,
  };
}

test('Auto-Wahl: Mindestkonfiguration erfuellt -> GET / rendert Wartungs-Ansicht (#202)', async () => {
  const tool = await startSetupBrowserServer({
    openBrowser: () => {},
    statusOptions: minimumConfiguredStatusOptions(),
  });

  try {
    const response = await request(tool.url);

    assert.strictEqual(response.statusCode, 200);
    assert.match(response.headers['content-type'], /^text\/html; charset=utf-8/);
    assert.match(response.body, /<h1>Kurspilot<\/h1>/);
    assert.match(response.body, /Alles läuft/);
    assert.match(response.body, /class="card-grid"/);
    const tokenValue = new URL(tool.url).searchParams.get('token');
    assert.ok(!response.body.includes(tokenValue), 'CSRF-Token-Wert darf nicht im HTML stehen');
  } finally {
    await tool.close();
  }
});

test('Wartungs-Ansicht bei vollständigem Fortschritt (6/6) zeigt kein Fortschrittsband (#230)', async () => {
  const tool = await startSetupBrowserServer({
    openBrowser: () => {},
    statusOptions: minimumConfiguredStatusOptions(),
  });

  try {
    const response = await request(tool.url);

    assert.strictEqual(response.statusCode, 200);
    assert.match(response.body, /Alles läuft/, 'Wartungs-Ansicht gerendert');
    assert.doesNotMatch(response.body, /<div class="maintenance-progress" role="status" data-maintenance-progress>/, 'kein Fortschrittsband bei 6/6');
    assert.doesNotMatch(response.body, /<button class="btn-primary maintenance-progress-next"[^>]*>Weiter zu:/, 'kein Weiter-Button bei 6/6');
  } finally {
    await tool.close();
  }
});

test('Wartungs-Ansicht: Session startete bei 6/6 -> weder Fortschrittsband noch Erfolgsbanner (#231)', async () => {
  const tool = await startSetupBrowserServer({
    openBrowser: () => {},
    statusOptions: minimumConfiguredStatusOptions(),
  });

  try {
    const response = await request(tool.url);

    assert.strictEqual(response.statusCode, 200);
    assert.match(response.body, /Alles läuft/, 'Wartungs-Ansicht gerendert');
    assert.doesNotMatch(response.body, /<div class="maintenance-success-banner" role="status" data-maintenance-success>/, 'kein Banner ohne vorheriges <6/6');
    assert.doesNotMatch(response.body, /<div class="maintenance-progress" role="status" data-maintenance-progress>/, 'kein Fortschrittsband bei 6/6');
  } finally {
    await tool.close();
  }
});

test('POST /reset-settings ohne Token -> 403 (#236, CSRF)', async () => {
  const tool = await startSetupBrowserServer({
    openBrowser: () => {},
    statusOptions: minimumConfiguredStatusOptions(),
    uninstallFlow: () => ({ credentialsRemoved: true, configsCleaned: [], skillsRemoved: [] }),
  });

  try {
    const response = await request(withoutToken(tool, '/reset-settings'), {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: '',
    });
    assert.strictEqual(response.statusCode, 403);
    assert.match(response.body, /Ungueltiges oder fehlendes Token/);
  } finally {
    await tool.close();
  }
});

// --- Card 'Moodle-Zugang' mit Instant-Save (Issue #203, Spec 0005) ---

function applyMoodleFlowOptions(overrides = {}) {
  return {
    detectClients: () => ({ codex: true, claude: false }),
    setCredentials: () => {},
    readCredentials: () => ({ url: 'https://moodle.example.test', token: 'token' }),
    installConfiguratorShortcut: () => ({ shortcutPath: null }),
    ...overrides,
  };
}

test('POST /apply/moodle speichert Moodle-URL und Token, liefert restartRequired: [] (#203)', async () => {
  const savedCredentials = [];
  let credentialsSaved = false;
  const tool = await startSetupBrowserServer({
    openBrowser: () => {},
    statusOptions: {
      ...minimumConfiguredStatusOptions(),
      readCredentials: () => credentialsSaved
        ? { url: 'https://neu.example.test', token: 'neuer-token' }
        : { url: null, token: null },
    },
    flowOptions: applyMoodleFlowOptions({
      setCredentials: (url, token) => {
        savedCredentials.push({ url, token });
        credentialsSaved = true;
      },
    }),
  });

  try {
    await request(tool.url);
    const form = new URLSearchParams({ moodleUrl: 'https://neu.example.test', moodleToken: 'neuer-token' });
    const response = await request(urlFor(tool, '/apply/moodle'), {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    });

    assert.strictEqual(response.statusCode, 200);
    const result = JSON.parse(response.body);
    assert.strictEqual(result.ok, true);
    assert.deepStrictEqual(result.restartRequired, []);
    assert.ok(result.newStatus, 'newStatus fehlt in der Antwort');
    assert.strictEqual(result.newStatus.moodle.url, 'https://neu.example.test');
    assert.strictEqual(result.newStatus.moodle.tokenPresent, true);
    assert.deepStrictEqual(result.progress, { done: 6, total: 6 }, 'Fortschritt muss nach dem Speichern neu berechnet werden');
    assert.strictEqual(result.nextCondition, null, 'bei vollständigem Setup gibt es kein weiteres Ziel');
    assert.strictEqual(result.wasIncomplete, true, 'der Abschluss nach unvollständigem Seitenaufruf aktiviert den Erfolgsbanner-Status');
    assert.deepStrictEqual(savedCredentials, [{ url: 'https://neu.example.test', token: 'neuer-token' }]);
  } finally {
    await tool.close();
  }
});

test('POST /apply/unbekannt -> 400 (#203)', async () => {
  const tool = await startSetupBrowserServer({
    openBrowser: () => {},
    statusOptions: minimumConfiguredStatusOptions(),
  });

  try {
    const response = await request(urlFor(tool, '/apply/unbekannt'), {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: '',
    });
    assert.strictEqual(response.statusCode, 400);
    const result = JSON.parse(response.body);
    assert.strictEqual(result.ok, false);
  } finally {
    await tool.close();
  }
});

test('Server bleibt nach POST /apply/moodle offen (kein close) (#203)', async () => {
  const tool = await startSetupBrowserServer({
    openBrowser: () => {},
    statusOptions: minimumConfiguredStatusOptions(),
    flowOptions: applyMoodleFlowOptions(),
  });

  try {
    const form = new URLSearchParams({ moodleUrl: 'https://moodle.example.test', moodleToken: 'token' });
    await request(urlFor(tool, '/apply/moodle'), {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    });

    const after = await request(tool.url);
    assert.strictEqual(after.statusCode, 200);
  } finally {
    await tool.close();
  }
});

test('POST /apply/moodle ohne Token -> 403 (#203, CSRF)', async () => {
  const tool = await startSetupBrowserServer({
    openBrowser: () => {},
    statusOptions: minimumConfiguredStatusOptions(),
  });

  try {
    const response = await request(withoutToken(tool, '/apply/moodle'), {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: '',
    });
    assert.strictEqual(response.statusCode, 403);
  } finally {
    await tool.close();
  }
});

test('Wartungs-Ansicht zeigt Moodle-Card mit Ändern-Button und Card-Grid (#203)', async () => {
  const tool = await startSetupBrowserServer({
    openBrowser: () => {},
    statusOptions: minimumConfiguredStatusOptions(),
  });

  try {
    const response = await request(tool.url);

    assert.strictEqual(response.statusCode, 200);
    assert.match(response.body, /data-card-id="moodle"/);
    assert.match(response.body, /Moodle-Zugang/);
    assert.match(response.body, /Ändern/);
    assert.match(response.body, /repeat\(auto-fit, minmax\(280px, 1fr\)\)/);
    assert.match(response.body, /https:\/\/moodle\.example\.test/);
    assert.doesNotMatch(response.body, /aendern|ausfuehren|bestaetigen|oeffnen|einfuegen/);
  } finally {
    await tool.close();
  }
});

// --- Cards S4: Arbeitsordner + Bildbearbeitung + Version (Issue #204, Spec 0005 S4) ---

test('POST /apply/workspace speichert Arbeitsordner und liefert restartRequired: [] (#204)', async () => {
  const workspacePath = `/tmp/kurspilot-apply-workspace-${process.pid}`;
  const writtenPaths = [];
  const tool = await startSetupBrowserServer({
    openBrowser: () => {},
    statusOptions: {
      ...minimumConfiguredStatusOptions(),
      readWorkspaceSetting: () => ({ ok: true, status: 'configured', contextRoot: workspacePath }),
    },
    flowOptions: {
      detectClients: () => ({ codex: true, claude: false }),
      readCredentials: () => ({ url: 'https://moodle.example.test', token: 'token' }),
      writeWorkspaceSetting: (path, options) => {
        writtenPaths.push({ path, options });
        return { configPath: '/Users/test/.kurspilot/workspace.json' };
      },
    },
  });

  try {
    const form = new URLSearchParams({ workspacePath });
    const response = await request(urlFor(tool, '/apply/workspace'), {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    });

    assert.strictEqual(response.statusCode, 200);
    const result = JSON.parse(response.body);
    assert.strictEqual(result.ok, true);
    assert.deepStrictEqual(result.restartRequired, []);
    assert.ok(result.newStatus, 'newStatus fehlt in der Antwort');
    assert.strictEqual(result.newStatus.workspace.path, workspacePath);
    assert.deepStrictEqual(writtenPaths.map(call => call.path), [workspacePath]);
  } finally {
    await tool.close();
    require('node:fs').rmSync(workspacePath, { recursive: true, force: true });
  }
});

test('POST /apply/crop-backend schreibt Praeferenz und liefert restartRequired: [] (#204)', async () => {
  const writeCalls = [];
  const tool = await startSetupBrowserServer({
    openBrowser: () => {},
    statusOptions: {
      ...minimumConfiguredStatusOptions(),
      platform: 'darwin',
      isImageMagickAvailable: () => true,
      isSipsAvailable: () => true,
      readCropBackendPreference: () => 'imagemagick',
    },
    flowOptions: {
      detectClients: () => ({ codex: true, claude: false }),
      readCredentials: () => ({ url: 'https://moodle.example.test', token: 'token' }),
      writeCropBackendPreference: (preference, options) => {
        writeCalls.push({ preference, options });
        return { configPath: '/fake/config.json', cropBackend: preference };
      },
    },
  });

  try {
    const form = new URLSearchParams({ cropBackend: 'imagemagick' });
    const response = await request(urlFor(tool, '/apply/crop-backend'), {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    });

    assert.strictEqual(response.statusCode, 200);
    const result = JSON.parse(response.body);
    assert.strictEqual(result.ok, true);
    assert.deepStrictEqual(result.restartRequired, []);
    assert.ok(result.newStatus, 'newStatus fehlt in der Antwort');
    assert.strictEqual(result.newStatus.imageMagick.preferredBackend, 'imagemagick');
    assert.deepStrictEqual(writeCalls.map(call => call.preference), ['imagemagick']);
  } finally {
    await tool.close();
  }
});

test('POST /apply/crop-backend ohne Client -> 400 (#204)', async () => {
  const tool = await startSetupBrowserServer({
    openBrowser: () => {},
    statusOptions: minimumConfiguredStatusOptions(),
    flowOptions: {
      detectClients: () => ({ codex: false, claude: false, opencode: false }),
    },
  });

  try {
    const response = await request(urlFor(tool, '/apply/crop-backend'), {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ cropBackend: 'sips' }).toString(),
    });
    assert.strictEqual(response.statusCode, 400);
    assert.strictEqual(JSON.parse(response.body).ok, false);
  } finally {
    await tool.close();
  }
});

test('Server bleibt nach POST /apply/workspace und /apply/crop-backend offen (#204)', async () => {
  const workspacePath = `/tmp/kurspilot-apply-ws-open-${process.pid}`;
  const tool = await startSetupBrowserServer({
    openBrowser: () => {},
    statusOptions: {
      ...minimumConfiguredStatusOptions(),
      readWorkspaceSetting: () => ({ ok: true, status: 'configured', contextRoot: workspacePath }),
      platform: 'darwin',
      isImageMagickAvailable: () => true,
      isSipsAvailable: () => true,
      readCropBackendPreference: () => null,
    },
    flowOptions: {
      detectClients: () => ({ codex: true, claude: false }),
      readCredentials: () => ({ url: 'https://moodle.example.test', token: 'token' }),
      writeWorkspaceSetting: () => ({ configPath: '/x/workspace.json' }),
      writeCropBackendPreference: () => ({ configPath: '/x/config.json' }),
    },
  });

  try {
    await request(urlFor(tool, '/apply/workspace'), {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ workspacePath }).toString(),
    });
    await request(urlFor(tool, '/apply/crop-backend'), {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ cropBackend: 'sips' }).toString(),
    });

    const after = await request(tool.url);
    assert.strictEqual(after.statusCode, 200);
  } finally {
    await tool.close();
    require('node:fs').rmSync(workspacePath, { recursive: true, force: true });
  }
});

test('POST /apply/workspace und /apply/crop-backend ohne Token -> 403 (#204, CSRF)', async () => {
  const tool = await startSetupBrowserServer({
    openBrowser: () => {},
    statusOptions: minimumConfiguredStatusOptions(),
  });

  try {
    for (const path of ['/apply/workspace', '/apply/crop-backend', '/apply/clients']) {
      const response = await request(withoutToken(tool, path), {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: 'workspacePath=/tmp/x',
      });
      assert.strictEqual(response.statusCode, 403, `${path} ohne Token muss 403 sein`);
    }
  } finally {
    await tool.close();
  }
});

// --- Asynchrone ImageMagick-Installation mit Polling (#234) ------------------

test('POST /apply/crop-backend mit installImageMagick=1 auf macOS antwortet sofort mit installing: true (#234)', async () => {
  const tool = await startSetupBrowserServer({
    openBrowser: () => {},
    statusOptions: {
      ...minimumConfiguredStatusOptions(),
      platform: 'darwin',
      isImageMagickAvailable: () => false,
      isSipsAvailable: () => true,
      readCropBackendPreference: () => null,
    },
    flowOptions: {
      detectClients: () => ({ codex: true, claude: false }),
    },
  });

  try {
    const form = new URLSearchParams({ installImageMagick: '1' });
    const response = await request(urlFor(tool, '/apply/crop-backend'), {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    });

    assert.strictEqual(response.statusCode, 200);
    const result = JSON.parse(response.body);
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.installing, true);
  } finally {
    await tool.close();
  }
});

test('GET /install-status liefert Installationszustand (#234)', async () => {
  const tool = await startSetupBrowserServer({
    openBrowser: () => {},
    statusOptions: minimumConfiguredStatusOptions(),
  });

  try {
    const response = await request(urlFor(tool, '/install-status'));
    assert.strictEqual(response.statusCode, 200);
    const state = JSON.parse(response.body);
    assert.strictEqual(state.status, 'idle');
    assert.strictEqual(state.error, null);
  } finally {
    await tool.close();
  }
});

test('GET /install-status ohne Token -> 403 (#234)', async () => {
  const tool = await startSetupBrowserServer({
    openBrowser: () => {},
    statusOptions: minimumConfiguredStatusOptions(),
  });

  try {
    const response = await request(withoutToken(tool, '/install-status'));
    assert.strictEqual(response.statusCode, 403);
  } finally {
    await tool.close();
  }
});

test('Wartungs-Ansicht zeigt data-install-state bei laufender Installation (#234)', async () => {
  const tool = await startSetupBrowserServer({
    openBrowser: () => {},
    statusOptions: {
      ...minimumConfiguredStatusOptions(),
      platform: 'darwin',
      isImageMagickAvailable: () => false,
      isSipsAvailable: () => true,
      readCropBackendPreference: () => null,
    },
    flowOptions: {
      detectClients: () => ({ codex: true, claude: false }),
    },
  });

  try {
    const form = new URLSearchParams({ installImageMagick: '1' });
    await request(urlFor(tool, '/apply/crop-backend'), {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    });

    const pageResponse = await request(tool.url);
    assert.strictEqual(pageResponse.statusCode, 200);
    assert.match(pageResponse.body, /data-install-state="running"/);
  } finally {
    await tool.close();
  }
});

test('Wartungs-Ansicht zeigt die drei S4-Cards (#204)', async () => {
  const tool = await startSetupBrowserServer({
    openBrowser: () => {},
    statusOptions: {
      ...minimumConfiguredStatusOptions(),
      platform: 'darwin',
      isImageMagickAvailable: () => true,
      isSipsAvailable: () => true,
      readCropBackendPreference: () => null,
    },
  });

  try {
    const response = await request(tool.url);
    assert.strictEqual(response.statusCode, 200);
    assert.match(response.body, /data-card-id="workspace"/);
    assert.match(response.body, /Arbeitsordner/);
    assert.match(response.body, /Ordner wählen…/);
    assert.match(response.body, /data-card-id="crop-backend"/);
    assert.match(response.body, /name="cropBackend" value="sips"/);
    assert.match(response.body, /data-card-id="version"/);
    assert.match(response.body, /erneut prüfen/);
    assert.doesNotMatch(response.body, /aendern|ausfuehren|bestaetigen|oeffnen|einfuegen/);
  } finally {
    await tool.close();
  }
});

test('Version-Card: gemockter /check-updates-Response (Update verfuegbar) erreicht die Wartungs-Ansicht (#204)', async () => {
  const tool = await startSetupBrowserServer({
    openBrowser: () => {},
    statusOptions: minimumConfiguredStatusOptions(),
    updateOptions: {
      checkAppUpdate: async () => ({
        updateAvailable: true,
        offline: false,
        error: null,
        versionCurrent: 'aaaa1111',
        versionNew: 'bbbb2222',
      }),
      checkImageMagickUpdate: () => ({ updateAvailable: false, offline: false, supported: false, error: null }),
      applyAppUpdate: async () => ({
        installed: true,
        offline: false,
        error: null,
        skillInstallAborted: false,
        skillInstallWarnings: [],
        skillInstallConflicts: [],
        skillInstallConflictPrompts: [],
      }),
    },
  });

  try {
    const page = await request(tool.url);
    assert.match(page.body, /data-card-id="version"/);
    assert.match(page.body, /fetch\("\/check-updates"\)/);
    assert.match(page.body, /button\.textContent = "Installieren"/);

    const check = await request(urlFor(tool, '/check-updates'));
    const checkResult = JSON.parse(check.body);
    assert.strictEqual(checkResult.app.updateAvailable, true);
    assert.strictEqual(checkResult.app.versionCurrent, 'aaaa1111');
    assert.strictEqual(checkResult.app.versionNew, 'bbbb2222');

    const apply = await request(urlFor(tool, '/apply-updates'), { method: 'POST' });
    const applyResult = JSON.parse(apply.body);
    assert.strictEqual(applyResult.installed, true);
  } finally {
    await tool.close();
  }
});

// --- Card 'KI-Clients' + /restart-client (Issue #205, Spec 0005 S5) ---------

function applyClientsFlowOptions(overrides = {}) {
  return {
    homeDir: '/Users/test',
    detectClients: () => ({ codex: true, claude: true, opencode: true }),
    isCodexRunning: () => true,
    isClaudeRunning: () => true,
    readCredentials: () => ({ url: 'https://moodle.example.test', token: 'token' }),
    setupCodexConfig: () => ({ created: true, backupPath: null, configPath: '/c' }),
    setupClaudeDesktopConfig: () => ({ created: true, backupPath: null, configPath: '/x' }),
    setupClaudeCodeConfig: () => ({ created: true, backupPath: null, configPath: '/y' }),
    setupOpenCodeConfig: () => ({ created: true, backupPath: null, configPath: '/z' }),
    installSkillsForProvider: () => ({ written: [], unchanged: [] }),
    installSkillsAliasForClaude: () => ({ written: [], unchanged: [] }),
    installConfiguratorShortcut: () => ({ shortcutPath: null }),
    ...overrides,
  };
}

test('POST /restart-client mit client=claude ruft injizierten Handler (#205)', async () => {
  const endCalls = [];
  const tool = await startSetupBrowserServer({
    openBrowser: () => {},
    statusOptions: minimumConfiguredStatusOptions(),
    endClaudeDesktop: () => {
      endCalls.push('claude');
      return true;
    },
    endCodex: () => {
      endCalls.push('codex');
      return true;
    },
  });

  try {
    const response = await request(urlFor(tool, '/restart-client'), {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'client=claude',
    });

    assert.strictEqual(response.statusCode, 200);
    const result = JSON.parse(response.body);
    assert.strictEqual(result.done, true);
    assert.strictEqual(result.kind, 'button');
    assert.deepStrictEqual(endCalls, ['claude']);
  } finally {
    await tool.close();
  }
});

test('POST /restart-client mit client=codex ruft injizierten Codex-Handler (#205)', async () => {
  const endCalls = [];
  const tool = await startSetupBrowserServer({
    openBrowser: () => {},
    statusOptions: minimumConfiguredStatusOptions(),
    endClaudeDesktop: () => {
      endCalls.push('claude');
      return true;
    },
    endCodex: () => {
      endCalls.push('codex');
      return true;
    },
  });

  try {
    const response = await request(urlFor(tool, '/restart-client'), {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'client=codex',
    });

    assert.strictEqual(response.statusCode, 200);
    assert.strictEqual(JSON.parse(response.body).kind, 'button');
    assert.deepStrictEqual(endCalls, ['codex']);
  } finally {
    await tool.close();
  }
});

test('POST /restart-client mit client=opencode liefert kind notice ohne Handler-Aufruf (#205)', async () => {
  const endCalls = [];
  const tool = await startSetupBrowserServer({
    openBrowser: () => {},
    statusOptions: minimumConfiguredStatusOptions(),
    endClaudeDesktop: () => {
      endCalls.push('claude');
      return true;
    },
    endCodex: () => {
      endCalls.push('codex');
      return true;
    },
  });

  try {
    const response = await request(urlFor(tool, '/restart-client'), {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'client=opencode',
    });

    assert.strictEqual(response.statusCode, 200);
    assert.deepStrictEqual(JSON.parse(response.body), { done: true, kind: 'notice' });
    assert.deepStrictEqual(endCalls, [], 'opencode darf keinen end-Handler aufrufen');
  } finally {
    await tool.close();
  }
});

test('POST /restart-client mit unbekanntem Client -> 400 (#205)', async () => {
  const tool = await startSetupBrowserServer({
    openBrowser: () => {},
    statusOptions: minimumConfiguredStatusOptions(),
  });

  try {
    const response = await request(urlFor(tool, '/restart-client'), {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'client=unbekannt',
    });
    assert.strictEqual(response.statusCode, 400);
    assert.strictEqual(JSON.parse(response.body).ok, false);
  } finally {
    await tool.close();
  }
});

test('POST /restart-client ohne Token -> 403 (#205, CSRF)', async () => {
  const tool = await startSetupBrowserServer({
    openBrowser: () => {},
    statusOptions: minimumConfiguredStatusOptions(),
  });

  try {
    const response = await request(withoutToken(tool, '/restart-client'), {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'client=claude',
    });
    assert.strictEqual(response.statusCode, 403);
    assert.match(response.body, /Ungueltiges oder fehlendes Token/);
  } finally {
    await tool.close();
  }
});

test('POST /apply/clients liefert kind button fuer laufende Clients und notice fuer opencode (#205)', async () => {
  const tool = await startSetupBrowserServer({
    openBrowser: () => {},
    statusOptions: minimumConfiguredStatusOptions(),
    flowOptions: applyClientsFlowOptions(),
  });

  try {
    const form = new URLSearchParams();
    form.append('client', 'codex');
    form.append('client', 'claude');
    form.append('client', 'opencode');
    const response = await request(urlFor(tool, '/apply/clients'), {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    });

    assert.strictEqual(response.statusCode, 200);
    const result = JSON.parse(response.body);
    assert.strictEqual(result.ok, true);
    const byClient = Object.fromEntries(result.restartRequired.map(entry => [entry.client, entry.kind]));
    assert.strictEqual(byClient.codex, 'button');
    assert.strictEqual(byClient.claude, 'button');
    assert.strictEqual(byClient.opencode, 'notice');
    assert.ok(result.newStatus, 'newStatus fehlt in der Antwort');
  } finally {
    await tool.close();
  }
});

test('POST /apply/clients ohne laufende Clients: nur opencode-Hinweis, keine Buttons (#205)', async () => {
  const tool = await startSetupBrowserServer({
    openBrowser: () => {},
    statusOptions: minimumConfiguredStatusOptions(),
    flowOptions: applyClientsFlowOptions({
      isCodexRunning: () => false,
      isClaudeRunning: () => false,
    }),
  });

  try {
    const form = new URLSearchParams();
    form.append('client', 'codex');
    form.append('client', 'claude');
    form.append('client', 'opencode');
    const response = await request(urlFor(tool, '/apply/clients'), {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    });

    assert.strictEqual(response.statusCode, 200);
    const result = JSON.parse(response.body);
    assert.deepStrictEqual(result.restartRequired, [{ client: 'opencode', kind: 'notice' }]);
  } finally {
    await tool.close();
  }
});

test('Server bleibt nach POST /apply/clients und /restart-client offen (#205)', async () => {
  const tool = await startSetupBrowserServer({
    openBrowser: () => {},
    statusOptions: minimumConfiguredStatusOptions(),
    flowOptions: applyClientsFlowOptions(),
    endClaudeDesktop: () => true,
  });

  try {
    await request(urlFor(tool, '/apply/clients'), {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client: 'opencode' }).toString(),
    });
    await request(urlFor(tool, '/restart-client'), {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'client=claude',
    });

    const after = await request(tool.url);
    assert.strictEqual(after.statusCode, 200);
  } finally {
    await tool.close();
  }
});

// --- Card 'MCP-Aktivitäten' + /apply/activities (Issue #206, Spec 0005 S6) ---

test('POST /apply/activities liefert kind button fuer laufende Clients und notice fuer opencode (#206)', async () => {
  const tool = await startSetupBrowserServer({
    openBrowser: () => {},
    statusOptions: minimumConfiguredStatusOptions(),
    flowOptions: applyClientsFlowOptions(),
  });

  try {
    const form = new URLSearchParams();
    form.append('activity', 'page');
    form.append('activity', 'quiz');
    const response = await request(urlFor(tool, '/apply/activities'), {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    });

    assert.strictEqual(response.statusCode, 200);
    const result = JSON.parse(response.body);
    assert.strictEqual(result.ok, true);
    const byClient = Object.fromEntries(result.restartRequired.map(entry => [entry.client, entry.kind]));
    assert.strictEqual(byClient.codex, 'button');
    assert.strictEqual(byClient.claude, 'button');
    assert.strictEqual(byClient.opencode, 'notice');
    assert.ok(result.newStatus, 'newStatus fehlt in der Antwort');
  } finally {
    await tool.close();
  }
});

test('POST /apply/activities ohne laufende Clients: nur opencode-Hinweis (#206)', async () => {
  const tool = await startSetupBrowserServer({
    openBrowser: () => {},
    statusOptions: minimumConfiguredStatusOptions(),
    flowOptions: applyClientsFlowOptions({
      isCodexRunning: () => false,
      isClaudeRunning: () => false,
    }),
  });

  try {
    const form = new URLSearchParams();
    form.append('activity', 'page');
    const response = await request(urlFor(tool, '/apply/activities'), {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    });

    assert.strictEqual(response.statusCode, 200);
    const result = JSON.parse(response.body);
    assert.deepStrictEqual(result.restartRequired, [{ client: 'opencode', kind: 'notice' }]);
  } finally {
    await tool.close();
  }
});

test('POST /apply/activities ohne Token -> 403 (#206, CSRF)', async () => {
  const tool = await startSetupBrowserServer({
    openBrowser: () => {},
    statusOptions: minimumConfiguredStatusOptions(),
  });

  try {
    const response = await request(withoutToken(tool, '/apply/activities'), {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'activity=page',
    });
    assert.strictEqual(response.statusCode, 403);
    assert.match(response.body, /Ungueltiges oder fehlendes Token/);
  } finally {
    await tool.close();
  }
});

test('Wartungs-Ansicht zeigt MCP-Aktivitäten-Card mit 6 Checkboxen, alle Namen sichtbar (#206)', async () => {
  const tool = await startSetupBrowserServer({
    openBrowser: () => {},
    statusOptions: minimumConfiguredStatusOptions(),
  });

  try {
    const response = await request(tool.url);

    assert.strictEqual(response.statusCode, 200);
    assert.match(response.body, /data-card-id="activities"/);
    assert.match(response.body, /<h2>MCP-Aktivitäten<\/h2>/);
    assert.match(response.body, /name="activity" value="page"/);
    assert.match(response.body, /name="activity" value="label"/);
    assert.match(response.body, /name="activity" value="url"/);
    assert.match(response.body, /name="activity" value="assign"/);
    assert.match(response.body, /name="activity" value="quiz"/);
    assert.match(response.body, /name="activity" value="fragensammlung"/);
    assert.match(response.body, /Textseite/);
    assert.match(response.body, /Textfeld/);
    assert.match(response.body, /Aufgabe/);
    assert.match(response.body, /Fragensammlung/);
    assert.match(response.body, /data-card-restart="activities"/);
    assert.match(response.body, /data-card-save-status="activities"/);
    assert.doesNotMatch(response.body, /aendern|ausfuehren|bestaetigen|oeffnen|einfuegen/);
  } finally {
    await tool.close();
  }
});

test('Wartungs-Ansicht: Activities-Summary zeigt Anzahl und alle Namen kompakt (#213)', async () => {
  const tool = await startSetupBrowserServer({
    openBrowser: () => {},
    statusOptions: minimumConfiguredStatusOptions(),
  });

  try {
    const response = await request(tool.url);

    assert.strictEqual(response.statusCode, 200);
    const summaryMatch = response.body.match(/data-card-summary="activities">([^<]*)</);
    assert.ok(summaryMatch, 'Activities-Summary im HTML vorhanden');
    const summaryText = summaryMatch[1];
    assert.match(summaryText, /^6 Aktivitäten: /, 'Anzahl und Doppelpunkt');
    assert.match(summaryText, /Textseite · Textfeld · URL · Aufgabe · Test · Fragensammlung/, 'alle Namen mit Mittelpunkt');
    assert.doesNotMatch(summaryText, /checkbox|type="checkbox"/i, 'keine Checkbox in Summary');
    assert.doesNotMatch(summaryText, /✓|✔|☑|\.\.\.|…/, 'keine Haken oder Auslassungspunkte');
    assert.match(response.body, /\.card-summary \{[^}]*overflow-wrap: break-word/, 'Summary bricht um ohne horizontalen Scroll');
  } finally {
    await tool.close();
  }
});

test('Wartungs-Ansicht zeigt KI-Clients-Card mit Checkboxen statt Platzhalter (#205)', async () => {
  const tool = await startSetupBrowserServer({
    openBrowser: () => {},
    statusOptions: {
      ...minimumConfiguredStatusOptions(),
      detectClients: () => ({ codex: true, claude: true, opencode: true }),
    },
  });

  try {
    const response = await request(tool.url);

    assert.strictEqual(response.statusCode, 200);
    assert.match(response.body, /data-card-id="clients"/);
    assert.match(response.body, /<h2>KI-Clients<\/h2>/);
    assert.match(response.body, /name="client" value="codex"[^>]*checked/);
    assert.match(response.body, /name="client" value="claude"[^>]*checked/);
    assert.match(response.body, /name="client" value="opencode"[^>]*checked/);
    assert.match(response.body, /card-save" type="button" data-card-id="clients"/);
    assert.match(response.body, /data-card-restart="clients"/);
    assert.match(response.body, /\/restart-client\?token=/);
    assert.match(response.body, /Beim nächsten opencode-Chat aktiv — kein Neustart nötig/);
    assert.doesNotMatch(response.body, /aendern|ausfuehren|bestaetigen|oeffnen|einfuegen/);
  } finally {
    await tool.close();
  }
});

test('Health-Check antwortet ohne Token mit ok (#209)', async () => {
  const tool = await startSetupBrowserServer({
    openBrowser: () => {},
    statusOptions: minimumConfiguredStatusOptions(),
  });

  try {
    const healthUrl = new URL('/health', tool.url);
    healthUrl.search = '';
    const response = await request(healthUrl.toString());

    assert.strictEqual(response.statusCode, 200);
    assert.deepStrictEqual(JSON.parse(response.body), { ok: true });
  } finally {
    await tool.close();
  }
});

test('Laufzeitstatus wird beim Start mit PID, Port und Token geschrieben (#209)', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kurspilot-rt-'));
  const runtimeStatePath = path.join(dir, 'setup-server.json');
  const tool = await startSetupBrowserServer({
    openBrowser: () => {},
    runtimeStatePath,
    statusOptions: minimumConfiguredStatusOptions(),
  });

  try {
    const state = JSON.parse(fs.readFileSync(runtimeStatePath, 'utf8'));
    const url = new URL(tool.url);
    assert.strictEqual(state.pid, process.pid);
    assert.strictEqual(state.port, Number(url.port));
    assert.strictEqual(state.token, url.searchParams.get('token'));

    const mode = fs.statSync(runtimeStatePath).mode & 0o777;
    assert.strictEqual(mode, 0o600);
  } finally {
    await tool.close();
  }
});

test('Laufzeitstatus wird beim Beenden entfernt (#209)', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kurspilot-rt-'));
  const runtimeStatePath = path.join(dir, 'setup-server.json');
  const tool = await startSetupBrowserServer({
    openBrowser: () => {},
    runtimeStatePath,
    statusOptions: minimumConfiguredStatusOptions(),
  });

  assert.ok(fs.existsSync(runtimeStatePath));
  await tool.close();
  assert.strictEqual(fs.existsSync(runtimeStatePath), false);
});

test('App-Start ersetzt einen laufenden Server durch eine frische Konfigurationsseite', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kurspilot-rt-'));
  const runtimeStatePath = path.join(dir, 'setup-server.json');
  const existing = await startSetupBrowserServer({
    openBrowser: () => {},
    runtimeStatePath,
    statusOptions: minimumConfiguredStatusOptions(),
  });

  const openedUrls = [];
  let launched;
  try {
    launched = await launchSetupBrowserServer({
      runtimeStatePath,
      openBrowser: url => {
        openedUrls.push(url);
      },
      statusOptions: minimumConfiguredStatusOptions(),
    });

    assert.strictEqual(launched.reused, false);
    assert.notStrictEqual(launched.url, existing.url);
    assert.deepStrictEqual(openedUrls, [launched.url]);
    await existing.closed;
    await assert.rejects(request(new URL('/health', existing.url).toString()), /ECONNREFUSED|ECONNRESET|socket hang up/);
  } finally {
    await launched?.close();
    await existing.close();
  }
});

test('App-Start entfernt veralteten Status (tote PID) und startet neu (#209)', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kurspilot-rt-'));
  const runtimeStatePath = path.join(dir, 'setup-server.json');
  fs.writeFileSync(runtimeStatePath, JSON.stringify({ pid: 999999, port: 1, token: 'tot' }));

  const openedUrls = [];
  const launched = await launchSetupBrowserServer({
    runtimeStatePath,
    isPidAlive: () => false,
    checkHealth: async () => true,
    openBrowser: url => {
      openedUrls.push(url);
    },
    statusOptions: minimumConfiguredStatusOptions(),
  });

  try {
    assert.strictEqual(launched.reused, false);
    assert.deepStrictEqual(openedUrls, [launched.url]);

    const state = JSON.parse(fs.readFileSync(runtimeStatePath, 'utf8'));
    assert.strictEqual(state.pid, process.pid);
    assert.strictEqual(state.port, Number(new URL(launched.url).port));
  } finally {
    await launched.close();
  }
});

test('App-Start entfernt veralteten Status (nicht erreichbar) und startet neu (#209)', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kurspilot-rt-'));
  const runtimeStatePath = path.join(dir, 'setup-server.json');
  fs.writeFileSync(runtimeStatePath, JSON.stringify({ pid: process.pid, port: 1, token: 'tot' }));

  const launched = await launchSetupBrowserServer({
    runtimeStatePath,
    isPidAlive: () => true,
    checkHealth: async () => false,
    openBrowser: () => {},
    statusOptions: minimumConfiguredStatusOptions(),
  });

  try {
    assert.strictEqual(launched.reused, false);
    const state = JSON.parse(fs.readFileSync(runtimeStatePath, 'utf8'));
    assert.strictEqual(state.port, Number(new URL(launched.url).port));
  } finally {
    await launched.close();
  }
});

test('App-Start startet neuen Server, wenn kein Status existiert (#209)', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kurspilot-rt-'));
  const runtimeStatePath = path.join(dir, 'setup-server.json');

  const launched = await launchSetupBrowserServer({
    runtimeStatePath,
    openBrowser: () => {},
    statusOptions: minimumConfiguredStatusOptions(),
  });

  try {
    assert.strictEqual(launched.reused, false);
    assert.match(launched.url, /^http:\/\/127\.0\.0\.1:\d+\/\?token=[0-9a-f]{32}$/);
    assert.ok(fs.existsSync(runtimeStatePath));
  } finally {
    await launched.close();
  }
});

// --- Card 'KI-Clients': sharedSkillStorage (Issue #233) -----------------------

test('POST /apply/clients mit sharedSkillStorage=1 nutzt Alias-Modus (#233)', async () => {
  const aliasCalls = [];
  const tool = await startSetupBrowserServer({
    openBrowser: () => {},
    statusOptions: minimumConfiguredStatusOptions(),
    flowOptions: applyClientsFlowOptions({
      isCodexRunning: () => false,
      isClaudeRunning: () => false,
      installSkillsAliasForClaude: () => { aliasCalls.push('alias'); return { written: [], unchanged: [] }; },
    }),
  });

  try {
    const form = new URLSearchParams();
    form.append('client', 'codex');
    form.append('client', 'claude');
    form.append('sharedSkillStorage', '1');
    const response = await request(urlFor(tool, '/apply/clients'), {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    });

    assert.strictEqual(response.statusCode, 200);
    assert.strictEqual(JSON.parse(response.body).ok, true);
    assert.strictEqual(aliasCalls.length, 1, 'Alias-Modus erwartet');
  } finally {
    await tool.close();
  }
});

test('POST /apply/clients ohne sharedSkillStorage bei >=2 Clients: Abwahl bleibt erhalten (#233)', async () => {
  const aliasCalls = [];
  const copyCalls = [];
  const tool = await startSetupBrowserServer({
    openBrowser: () => {},
    statusOptions: minimumConfiguredStatusOptions(),
    flowOptions: applyClientsFlowOptions({
      isCodexRunning: () => false,
      isClaudeRunning: () => false,
      installSkillsAliasForClaude: () => { aliasCalls.push('alias'); return { written: [], unchanged: [] }; },
      installSkillsForProvider: () => { copyCalls.push('copy'); return { written: [], unchanged: [] }; },
    }),
  });

  try {
    const form = new URLSearchParams();
    form.append('client', 'codex');
    form.append('client', 'claude');
    const response = await request(urlFor(tool, '/apply/clients'), {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    });

    assert.strictEqual(response.statusCode, 200);
    assert.strictEqual(JSON.parse(response.body).ok, true);
    assert.strictEqual(aliasCalls.length, 0, 'Kein Alias-Modus bei abgewählter Option');
    assert.ok(copyCalls.length >= 1, 'Copy-Modus erwartet');
  } finally {
    await tool.close();
  }
});

test('POST /apply/clients mit nur einem Client: sharedSkillStorage nicht nötig, Serverdefault greift (#233)', async () => {
  const tool = await startSetupBrowserServer({
    openBrowser: () => {},
    statusOptions: minimumConfiguredStatusOptions(),
    flowOptions: applyClientsFlowOptions({
      isCodexRunning: () => false,
      isClaudeRunning: () => false,
    }),
  });

  try {
    const form = new URLSearchParams();
    form.append('client', 'codex');
    const response = await request(urlFor(tool, '/apply/clients'), {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    });

    assert.strictEqual(response.statusCode, 200);
    assert.strictEqual(JSON.parse(response.body).ok, true);
  } finally {
    await tool.close();
  }
});
