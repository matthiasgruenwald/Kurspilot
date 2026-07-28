'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');

const {
  DEFAULT_IDLE_TIMEOUT_MS,
  DEFAULT_FIRST_REQUEST_TIMEOUT_MS,
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

function urlFor(tool, pathWithQuery) {
  const url = new URL(pathWithQuery, tool.url);
  const token = new URL(tool.url).searchParams.get('token');
  if (token && !url.searchParams.has('token')) {
    url.searchParams.set('token', token);
  }
  return url;
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
      getClientSetupStatus: () => ({ codex: { needsRepair: true }, claude: { needsRepair: false } }),
    },
  });

  try {
    assert.match(tool.url, /^http:\/\/127\.0\.0\.1:\d+\/\?token=[0-9a-f]{32}$/);
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
      getClientSetupStatus: () => ({ codex: { needsRepair: true }, claude: { needsRepair: false } }),
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

test('ImageMagick-Status zeigt "installiert" und bietet Reinstall/Reparatur als Opt-in an, wenn schon vorhanden (#138)', async () => {
  const tool = await startSetupBrowserServer({
    openBrowser: () => {},
    statusOptions: {
      detectClients: () => ({ codex: true, claude: false }),
      readCredentials: () => ({ url: 'https://moodle.example.test', token: 'token' }),
      readWorkspaceSetting: () => ({ ok: true, status: 'configured', contextRoot: '/Users/test/Kurspilot' }),
      getClientSetupStatus: () => ({ codex: { needsRepair: true }, claude: { needsRepair: false } }),
      platform: 'win32',
      isImageMagickAvailable: () => true,
    },
  });

  try {
    const response = await request(tool.url);

    assert.match(response.body, /ImageMagick ist installiert/);
    assert.match(response.body, /name="maintenance" value="imagemagick-install"/);
    assert.doesNotMatch(response.body, /name="maintenance" value="imagemagick-install"[^>]*checked/, 'Reinstall bleibt opt-in, keine Vorauswahl');
    assert.match(response.body, /neu installieren|reparieren/);
  } finally {
    await tool.close();
  }
});

test('ImageMagick-Bereich wird auf nicht unterstuetzten Plattformen (kein sips, kein Windows) nicht angezeigt', async () => {
  const tool = await startSetupBrowserServer({
    openBrowser: () => {},
    statusOptions: {
      detectClients: () => ({ codex: true, claude: false }),
      readCredentials: () => ({ url: 'https://moodle.example.test', token: 'token' }),
      readWorkspaceSetting: () => ({ ok: true, status: 'configured', contextRoot: '/Users/test/Kurspilot' }),
      getClientSetupStatus: () => ({ codex: { needsRepair: true }, claude: { needsRepair: false } }),
      platform: 'linux',
      isImageMagickAvailable: () => false,
      isSipsAvailable: () => false,
    },
  });

  try {
    const response = await request(tool.url);

    assert.doesNotMatch(response.body, /ImageMagick/);
  } finally {
    await tool.close();
  }
});

test('macOS-Wartungsseite zeigt sips als aktiven Standard ohne Alarm-Ton, ImageMagick als nachrangige Option', async () => {
  const tool = await startSetupBrowserServer({
    openBrowser: () => {},
    statusOptions: {
      detectClients: () => ({ codex: true, claude: false }),
      readCredentials: () => ({ url: 'https://moodle.example.test', token: 'token' }),
      readWorkspaceSetting: () => ({ ok: true, status: 'configured', contextRoot: '/Users/test/Kurspilot' }),
      getClientSetupStatus: () => ({ codex: { needsRepair: true }, claude: { needsRepair: false } }),
      platform: 'darwin',
      isImageMagickAvailable: () => false,
      isSipsAvailable: () => true,
    },
  });

  try {
    const response = await request(tool.url);

    // Positive Standard-Darstellung statt Alarm ("fehlt"/"Fehler").
    assert.match(response.body, /sips/);
    assert.match(response.body, /eingebaute macOS-Tool/);
    assert.doesNotMatch(response.body, /ImageMagick fehlt/);
    assert.doesNotMatch(response.body, /Fehler/);

    // Bekannte Einschraenkungen in einfacher Sprache (Issue #135).
    assert.match(response.body, /CMYK/);
    assert.match(response.body, /animierte GIFs|GIF/);

    // ImageMagick als klar nachrangige Option, nicht vorausgewaehlt.
    assert.match(response.body, /Nur bei diesen Problemen: ImageMagick installieren/);
    assert.doesNotMatch(response.body, /name="maintenance" value="imagemagick-install"[^>]*checked/);

    // #140: Installationsstatus muss in der Statusliste sichtbar sein, auch
    // wenn sips der aktive Standard ist - nicht nur auf Windows.
    assert.match(response.body, /ImageMagick ist nicht installiert/);
  } finally {
    await tool.close();
  }
});

test('macOS-Statusliste zeigt "ImageMagick ist installiert", wenn es bereits installiert ist (#140)', async () => {
  const tool = await startSetupBrowserServer({
    openBrowser: () => {},
    statusOptions: {
      detectClients: () => ({ codex: true, claude: false }),
      readCredentials: () => ({ url: 'https://moodle.example.test', token: 'token' }),
      readWorkspaceSetting: () => ({ ok: true, status: 'configured', contextRoot: '/Users/test/Kurspilot' }),
      getClientSetupStatus: () => ({ codex: { needsRepair: true }, claude: { needsRepair: false } }),
      platform: 'darwin',
      isImageMagickAvailable: () => true,
      isSipsAvailable: () => true,
    },
  });

  try {
    const response = await request(tool.url);

    assert.match(response.body, /Bildausschnitt läuft über das eingebaute macOS-Tool \(sips\)/);
    assert.match(response.body, /ImageMagick ist installiert/);
  } finally {
    await tool.close();
  }
});

test('macOS-Wartungsseite bietet ImageMagick-Reinstall/Reparatur an, wenn bereits installiert (#138)', async () => {
  const tool = await startSetupBrowserServer({
    openBrowser: () => {},
    statusOptions: {
      detectClients: () => ({ codex: true, claude: false }),
      readCredentials: () => ({ url: 'https://moodle.example.test', token: 'token' }),
      readWorkspaceSetting: () => ({ ok: true, status: 'configured', contextRoot: '/Users/test/Kurspilot' }),
      getClientSetupStatus: () => ({ codex: { needsRepair: true }, claude: { needsRepair: false } }),
      platform: 'darwin',
      isImageMagickAvailable: () => true,
      isSipsAvailable: () => true,
    },
  });

  try {
    const response = await request(tool.url);

    assert.match(response.body, /name="maintenance" value="imagemagick-install"/);
    assert.doesNotMatch(response.body, /name="maintenance" value="imagemagick-install"[^>]*checked/, 'Reinstall bleibt opt-in');
    assert.match(response.body, /neu installieren|reparieren/);
  } finally {
    await tool.close();
  }
});

test('Bildausschnitt-Werkzeug-Schalter erscheint nur, wenn beide Backends verfuegbar sind (#140)', async () => {
  const toolOnlySips = await startSetupBrowserServer({
    openBrowser: () => {},
    statusOptions: {
      detectClients: () => ({ codex: true, claude: false }),
      readCredentials: () => ({ url: 'https://moodle.example.test', token: 'token' }),
      readWorkspaceSetting: () => ({ ok: true, status: 'configured', contextRoot: '/Users/test/Kurspilot' }),
      getClientSetupStatus: () => ({ codex: { needsRepair: true }, claude: { needsRepair: false } }),
      platform: 'darwin',
      isImageMagickAvailable: () => false,
      isSipsAvailable: () => true,
    },
  });
  try {
    const response = await request(toolOnlySips.url);
    assert.doesNotMatch(response.body, /name="cropBackend"/);
  } finally {
    await toolOnlySips.close();
  }

  const toolBoth = await startSetupBrowserServer({
    openBrowser: () => {},
    statusOptions: {
      detectClients: () => ({ codex: true, claude: false }),
      readCredentials: () => ({ url: 'https://moodle.example.test', token: 'token' }),
      readWorkspaceSetting: () => ({ ok: true, status: 'configured', contextRoot: '/Users/test/Kurspilot' }),
      getClientSetupStatus: () => ({ codex: { needsRepair: true }, claude: { needsRepair: false } }),
      platform: 'darwin',
      isImageMagickAvailable: () => true,
      isSipsAvailable: () => true,
      readCropBackendPreference: () => null,
    },
  });
  try {
    const response = await request(toolBoth.url);
    assert.match(response.body, /name="cropBackend" value="sips"[^>]*checked/, 'ohne Praeferenz ist sips voreingestellt');
    assert.match(response.body, /name="cropBackend" value="imagemagick"(?!.*checked)/);
    assert.match(response.body, /Bildausschnitt-Werkzeug/);

    // #141: Schalter ist standardmaessig gesperrt (disabled) - sonst sendet
    // jede Formular-Abgabe den voreingestellten Wert erneut und ueberschreibt
    // die Praeferenz, auch ohne dass die Lehrkraft etwas geaendert hat.
    assert.match(response.body, /name="cropBackend" value="sips"[^>]*disabled/);
    assert.match(response.body, /name="cropBackend" value="imagemagick"[^>]*disabled/);
    assert.match(response.body, /data-enables="crop-backend-change"/, 'Freigabe-Checkbox zum Entsperren muss vorhanden sein');
  } finally {
    await toolBoth.close();
  }
});

test('Bildausschnitt-Werkzeug-Schalter bleibt ohne Freigabe-Checkbox gesperrt -> Formular sendet kein cropBackend (#141)', async () => {
  const writeCalls = [];
  const tool = await startSetupBrowserServer({
    openBrowser: () => {},
    statusOptions: {
      detectClients: () => ({ codex: true, claude: false }),
      readCredentials: () => ({ url: 'https://moodle.example.test', token: 'token' }),
      readWorkspaceSetting: () => ({ ok: true, status: 'configured', contextRoot: '/Users/test/Kurspilot' }),
      getClientSetupStatus: () => ({ codex: { needsRepair: true }, claude: { needsRepair: false } }),
      platform: 'darwin',
      isImageMagickAvailable: () => true,
      isSipsAvailable: () => true,
      readCropBackendPreference: () => 'imagemagick',
    },
    flowOptions: {
      homeDir: '/tmp',
      detectClients: () => ({ codex: true, claude: false }),
      readCredentials: () => ({ url: 'https://moodle.example.test', token: 'token' }),
      writeCropBackendPreference: (preference, options) => {
        writeCalls.push({ preference, options });
        return { configPath: '/fake/config.json', cropBackend: preference };
      },
    },
  });

  // Simuliert eine reale Browser-Abgabe ohne Schalter-Interaktion: ein
  // disabled-Radio wird vom Browser nie mitgeschickt, das Formular enthaelt
  // also kein "cropBackend"-Feld - hier nachgebildet, indem das Feld schlicht
  // fehlt (anders als bei einer expliziten Wahl, siehe Test oben).
  const form = new URLSearchParams({ maintenance: 'imagemagick-install' });
  const response = await request(urlFor(tool, '/done'), {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  });

  assert.strictEqual(response.statusCode, 200);
  assert.deepStrictEqual(writeCalls, [], 'ohne abgeschicktes cropBackend darf keine Praeferenz neu geschrieben werden');
  await tool.closed;
});

test('Bildausschnitt-Werkzeug-Schalter steht auf ImageMagick, wenn das als Praeferenz gespeichert ist (#140)', async () => {
  const tool = await startSetupBrowserServer({
    openBrowser: () => {},
    statusOptions: {
      detectClients: () => ({ codex: true, claude: false }),
      readCredentials: () => ({ url: 'https://moodle.example.test', token: 'token' }),
      readWorkspaceSetting: () => ({ ok: true, status: 'configured', contextRoot: '/Users/test/Kurspilot' }),
      getClientSetupStatus: () => ({ codex: { needsRepair: true }, claude: { needsRepair: false } }),
      platform: 'darwin',
      isImageMagickAvailable: () => true,
      isSipsAvailable: () => true,
      readCropBackendPreference: () => 'imagemagick',
    },
  });

  try {
    const response = await request(tool.url);
    assert.match(response.body, /name="cropBackend" value="imagemagick"[^>]*checked/);
    assert.doesNotMatch(response.body, /name="cropBackend" value="sips"[^>]*checked/);
  } finally {
    await tool.close();
  }
});

test('Wartungsbereich-Checkboxen verwenden weiterhin name="maintenance" (Schalter ist separat, kein Mischfeld) (#140)', async () => {
  const tool = await startSetupBrowserServer({
    openBrowser: () => {},
    statusOptions: {
      detectClients: () => ({ codex: true, claude: false }),
      readCredentials: () => ({ url: 'https://moodle.example.test', token: 'token' }),
      readWorkspaceSetting: () => ({ ok: true, status: 'configured', contextRoot: '/Users/test/Kurspilot' }),
      getClientSetupStatus: () => ({ codex: { needsRepair: true }, claude: { needsRepair: false } }),
      platform: 'darwin',
      isImageMagickAvailable: () => true,
      isSipsAvailable: () => true,
    },
  });
  try {
    const response = await request(tool.url);
    assert.doesNotMatch(response.body, /name="maintenance" value="crop-backend/);
  } finally {
    await tool.close();
  }
});

test('Reihenfolge: Werkzeug-Schalter direkt unter Arbeitsbereich, ImageMagick-Installation ganz unten (#142)', async () => {
  const tool = await startSetupBrowserServer({
    openBrowser: () => {},
    statusOptions: {
      detectClients: () => ({ codex: true, claude: false }),
      readCredentials: () => ({ url: 'https://moodle.example.test', token: 'token' }),
      readWorkspaceSetting: () => ({ ok: true, status: 'configured', contextRoot: '/Users/test/Kurspilot' }),
      getClientSetupStatus: () => ({ codex: { needsRepair: true }, claude: { needsRepair: false } }),
      platform: 'darwin',
      isImageMagickAvailable: () => true,
      isSipsAvailable: () => true,
    },
  });
  try {
    const response = await request(tool.url);
    const workspaceIndex = response.body.indexOf('workspace-change');
    const cropBackendIndex = response.body.indexOf('Bildausschnitt-Werkzeug');
    const imageMagickInstallIndex = response.body.indexOf('imagemagick-install');

    assert.ok(workspaceIndex < cropBackendIndex, 'Schalter muss nach Arbeitsbereich kommen');
    assert.ok(cropBackendIndex < imageMagickInstallIndex, 'ImageMagick-Installation muss ganz unten stehen');

    // #142: gesperrter Schalter sieht ausgegraut aus (nicht wie aktiv anklickbar),
    // freigeschaltete aktive Auswahl ist blau hervorgehoben statt dunkel.
    assert.match(response.body, /\.toggle-switch label \{ margin: 0; padding: [^;]+; color: #9aa5b1; cursor: not-allowed; \}/);
    assert.match(response.body, /\.toggle-switch label:has\(input:checked:not\(:disabled\)\) \{ background: #0a66ff;/);
  } finally {
    await tool.close();
  }
});

test('macOS-Wartungsseite zeigt vor der ImageMagick-Installation eine Speicherplatz-Postenliste mit Summe', async () => {
  const tool = await startSetupBrowserServer({
    openBrowser: () => {},
    statusOptions: {
      detectClients: () => ({ codex: true, claude: false }),
      readCredentials: () => ({ url: 'https://moodle.example.test', token: 'token' }),
      readWorkspaceSetting: () => ({ ok: true, status: 'configured', contextRoot: '/Users/test/Kurspilot' }),
      getClientSetupStatus: () => ({ codex: { needsRepair: true }, claude: { needsRepair: false } }),
      platform: 'darwin',
      isImageMagickAvailable: () => false,
      isSipsAvailable: () => true,
    },
  });

  try {
    const response = await request(tool.url);

    assert.match(response.body, /Homebrew/);
    assert.match(response.body, /ImageMagick[^<]*MB/);
    assert.match(response.body, /Summe[^<]*MB/);
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
      getClientSetupStatus: () => ({ codex: { needsRepair: true }, claude: { needsRepair: false } }),
    },
    flowOptions: {
      homeDir,
      detectClients: () => ({ codex: true, claude: false }),
      readCredentials: () => ({ url: 'https://moodle.example.test', token: 'token' }),
    },
  });

  const favicon = await request(urlFor(tool, '/favicon.ico'));
  assert.strictEqual(favicon.statusCode, 204);

  const form = new URLSearchParams({
    maintenance: 'workspace-change',
    workspacePath,
    workspaceSelectionConfirmed: '1',
  });
  const done = await request(urlFor(tool, '/done'), {
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

test('lokaler Browser-Dienst nutzt standardmäßig zwei Stunden Idle-Timeout', () => {
  assert.strictEqual(DEFAULT_IDLE_TIMEOUT_MS, 2 * 60 * 60 * 1000);
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

  const response = await request(urlFor(tool, '/abort'), { method: 'POST' });

  assert.strictEqual(response.statusCode, 200);
  assert.match(response.body, /✓ Beendet/);
  assert.match(response.body, /Kurspilot-Konfiguration wurde beendet/);
  assert.match(response.body, /Sie können diesen Tab jetzt schließen/);
  await tool.closed;
  await assert.rejects(request(tool.url), /ECONNREFUSED|ECONNRESET|socket hang up/);
});

test('POST /done: cropBackend-Formularfeld erreicht runSetupFlow als cropBackendChoice (#140)', async () => {
  const writeCalls = [];
  const tool = await startSetupBrowserServer({
    openBrowser: () => {},
    statusOptions: {
      detectClients: () => ({ codex: true, claude: false }),
      readCredentials: () => ({ url: 'https://moodle.example.test', token: 'token' }),
      readWorkspaceSetting: () => ({ ok: true, status: 'configured', contextRoot: '/Users/test/Kurspilot' }),
      getClientSetupStatus: () => ({ codex: { needsRepair: true }, claude: { needsRepair: false } }),
    },
    flowOptions: {
      homeDir: '/tmp',
      detectClients: () => ({ codex: true, claude: false }),
      readCredentials: () => ({ url: 'https://moodle.example.test', token: 'token' }),
      writeCropBackendPreference: (preference, options) => {
        writeCalls.push({ preference, options });
        return { configPath: '/fake/config.json', cropBackend: preference };
      },
    },
  });

  const form = new URLSearchParams({ cropBackend: 'imagemagick' });
  const response = await request(urlFor(tool, '/done'), {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  });

  assert.strictEqual(response.statusCode, 200);
  assert.deepStrictEqual(writeCalls.map(call => call.preference), ['imagemagick']);
  await tool.closed;
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
      getClientSetupStatus: () => ({ codex: { needsRepair: true }, claude: { needsRepair: false } }),
    },
    flowOptions: {
      homeDir: '/Users/test',
      detectClients: () => ({ codex: true, claude: true }),
      isCodexRunning: () => false,
      isClaudeRunning: () => false,
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

  const response = await request(urlFor(tool, '/done'), {
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

test('Tokenwechsel zeigt fuer laufenden Codex den Neustart-Hinweis im Endbericht', async () => {
  const tool = await startSetupBrowserServer({
    openBrowser: () => {},
    statusOptions: {
      detectClients: () => ({ codex: true, claude: false }),
      readCredentials: () => ({ url: 'https://old.example.test', token: 'bestehender-token' }),
      readWorkspaceSetting: () => ({
        ok: true,
        status: 'configured',
        contextRoot: '/Users/test/Documents/Kurspilot',
      }),
      getClientSetupStatus: () => ({ codex: { needsRepair: true }, claude: { needsRepair: false } }),
    },
    flowOptions: {
      homeDir: '/Users/test',
      detectClients: () => ({ codex: true, claude: false }),
      isCodexRunning: () => true,
      readCredentials: () => ({ url: 'https://old.example.test', token: 'bestehender-token' }),
      setCredentials: () => {},
    },
  });

  const response = await request(urlFor(tool, '/done'), {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      maintenance: 'moodle-token-renewal',
      moodleToken: 'neuer-token-darf-nicht-in-antwort',
    }).toString(),
  });

  assert.strictEqual(response.statusCode, 200);
  assert.match(response.body, /Moodle-Token erneuert/);
  assert.match(response.body, /Codex lief beim Speichern noch/);
  assert.match(response.body, /Codex jetzt beenden/);
  assert.match(response.body, /muss Codex einmal neu gestartet werden/);
  assert.doesNotMatch(response.body, /neuer-token-darf-nicht-in-antwort/);

  const skipResponse = await request(urlFor(tool, '/skip'), {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: 'client=codex',
  });
  assert.strictEqual(skipResponse.statusCode, 200);
  assert.strictEqual(JSON.parse(skipResponse.body).done, true);
  await tool.closed;
});

// --- Claude laeuft bereits: kein Blocker mehr, Speichern + Opt-in danach (Issue #130) ---

test('Browser-Konfigurator zeigt weder Warnbanner noch gesperrten Submit, auch wenn Claude laeuft', async () => {
  const tool = await startSetupBrowserServer({
    openBrowser: () => {},
    statusOptions: {
      detectClients: () => ({ codex: false, claude: true }),
      isClaudeRunning: () => true,
      readCredentials: () => ({ url: 'https://moodle.example.test', token: 'token' }),
      readWorkspaceSetting: () => ({ ok: true, status: 'configured', contextRoot: '/Users/test/Kurspilot' }),
      getClientSetupStatus: () => ({ codex: { needsRepair: true }, claude: { needsRepair: false } }),
    },
  });

  try {
    const response = await request(tool.url);

    assert.strictEqual(response.statusCode, 200);
    assert.doesNotMatch(response.body, /<button[^>]*type="submit"[^>]*disabled/);
    assert.match(response.body, /<button[^>]*type="submit"/);
  } finally {
    await tool.close();
  }
});

test('Speichern schreibt Claude-Config auch bei laufendem Claude (Issue #130: kein Blocker mehr vor dem Speichern)', async () => {
  const calls = { setupClaudeDesktopConfig: [] };
  const tool = await startSetupBrowserServer({
    openBrowser: () => {},
    statusOptions: {
      detectClients: () => ({ codex: false, claude: true }),
      isClaudeRunning: () => true,
      readCredentials: () => ({ url: 'https://moodle.example.test', token: 'token' }),
      readWorkspaceSetting: () => ({ ok: true, status: 'configured', contextRoot: '/Users/test/Kurspilot' }),
      getClientSetupStatus: () => ({ codex: { needsRepair: true }, claude: { needsRepair: false } }),
    },
    flowOptions: {
      homeDir: '/Users/test',
      detectClients: () => ({ codex: false, claude: true }),
      isClaudeRunning: () => true,
      readCredentials: () => ({ url: 'https://moodle.example.test', token: 'token' }),
      setupClaudeDesktopConfig: (...args) => {
        calls.setupClaudeDesktopConfig.push(args);
        return { created: true, backupPath: null, configPath: args[0] };
      },
      setupClaudeCodeConfig: () => ({ created: true, backupPath: null, configPath: '/Users/test/.claude.json' }),
      installSkillsForProvider: () => ({ written: [], unchanged: [] }),
    },
  });

  const form = new URLSearchParams({ maintenance: 'kurspilot-setup-or-repair', client: 'claude' });
  const response = await request(urlFor(tool, '/done'), {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  });

  assert.strictEqual(response.statusCode, 200);
  assert.strictEqual(calls.setupClaudeDesktopConfig.length, 1, 'muss trotz laufendem Claude schreiben');
  await tool.close();
});

test('Blocker bei keinem erkannten Client nennt opencode-Installationslink neben Codex/Claude (Issue #183)', async () => {
  const tool = await startSetupBrowserServer({
    openBrowser: () => {},
    statusOptions: {
      detectClients: () => ({ codex: false, claude: false, opencode: false }),
      readCredentials: () => null,
      readWorkspaceSetting: () => null,
      getClientSetupStatus: () => ({
        codex: { needsRepair: false },
        claude: { needsRepair: false },
        opencode: { needsRepair: false },
      }),
    },
    flowOptions: {
      homeDir: '/Users/test',
      detectClients: () => ({ codex: false, claude: false, opencode: false }),
    },
  });

  const form = new URLSearchParams({ maintenance: 'kurspilot-setup-or-repair' });
  const response = await request(urlFor(tool, '/done'), {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  });

  assert.strictEqual(response.statusCode, 400);
  assert.match(response.body, /kein Client erkannt/);
  assert.match(response.body, /codex: https:\/\//);
  assert.match(response.body, /claude: https:\/\//);
  assert.match(response.body, /opencode: https:\/\/opencode\.ai/);
  await tool.close();
});

test('Endbericht bietet nach dem Speichern Opt-in "Beenden"/"Spaeter von Hand" an, wenn Claude beim Speichern lief - kein Neustart-Button mehr', async () => {
  const tool = await startSetupBrowserServer({
    openBrowser: () => {},
    statusOptions: {
      detectClients: () => ({ codex: false, claude: true }),
      isClaudeRunning: () => true,
      readCredentials: () => ({ url: 'https://moodle.example.test', token: 'token' }),
      readWorkspaceSetting: () => ({ ok: true, status: 'configured', contextRoot: '/Users/test/Kurspilot' }),
      getClientSetupStatus: () => ({ codex: { needsRepair: true }, claude: { needsRepair: false } }),
    },
    flowOptions: {
      homeDir: '/Users/test',
      detectClients: () => ({ codex: false, claude: true }),
      isClaudeRunning: () => true,
      readCredentials: () => ({ url: 'https://moodle.example.test', token: 'token' }),
      setupClaudeDesktopConfig: () => ({ created: true, backupPath: null, configPath: '/x' }),
      setupClaudeCodeConfig: () => ({ created: true, backupPath: null, configPath: '/y' }),
      installSkillsForProvider: () => ({ written: [], unchanged: [] }),
    },
  });

  const form = new URLSearchParams({ maintenance: 'kurspilot-setup-or-repair', client: 'claude' });
  const response = await request(urlFor(tool, '/done'), {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  });

  assert.strictEqual(response.statusCode, 200);
  assert.match(response.body, /data-client="claude"[^>]*end-now-button|end-now-button[^>]*data-client="claude"/);
  assert.match(response.body, /Claude jetzt beenden/);
  assert.match(response.body, /Später von Hand/);
  assert.doesNotMatch(response.body, /neu starten/);
  assert.doesNotMatch(response.body, /restart-claude-now/);
  await tool.close();
});

test('Endbericht zeigt keine Beenden-Optionen, wenn weder Claude noch Codex beim Speichern liefen', async () => {
  const tool = await startSetupBrowserServer({
    openBrowser: () => {},
    statusOptions: {
      detectClients: () => ({ codex: false, claude: true }),
      isClaudeRunning: () => false,
      readCredentials: () => ({ url: 'https://moodle.example.test', token: 'token' }),
      readWorkspaceSetting: () => ({ ok: true, status: 'configured', contextRoot: '/Users/test/Kurspilot' }),
      getClientSetupStatus: () => ({ codex: { needsRepair: true }, claude: { needsRepair: false } }),
    },
    flowOptions: {
      homeDir: '/Users/test',
      detectClients: () => ({ codex: false, claude: true }),
      isClaudeRunning: () => false,
      readCredentials: () => ({ url: 'https://moodle.example.test', token: 'token' }),
      setupClaudeDesktopConfig: () => ({ created: true, backupPath: null, configPath: '/x' }),
      setupClaudeCodeConfig: () => ({ created: true, backupPath: null, configPath: '/y' }),
      installSkillsForProvider: () => ({ written: [], unchanged: [] }),
    },
  });

  const form = new URLSearchParams({ maintenance: 'kurspilot-setup-or-repair', client: 'claude' });
  const response = await request(urlFor(tool, '/done'), {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  });

  assert.strictEqual(response.statusCode, 200);
  assert.doesNotMatch(response.body, /<button class="end-now-button"/);
  assert.doesNotMatch(response.body, /action="\/finish-setup"/);
  assert.match(response.body, /✓ Fertig/);
  assert.match(response.body, /Sie können diesen Tab jetzt schließen/);
  assert.doesNotMatch(response.body, /Fertig und Tab schließen/);
  assert.doesNotMatch(response.body, /window\.close\(\)/);
  await tool.closed;
});

test('Liefen Codex und Claude beim Speichern beide: beide Sektionen sichtbar, Dienst bleibt offen bis beide bestaetigt sind', async () => {
  const endCalls = [];
  const tool = await startSetupBrowserServer({
    openBrowser: () => {},
    statusOptions: {
      detectClients: () => ({ codex: true, claude: true }),
      isClaudeRunning: () => true,
      readCredentials: () => ({ url: 'https://moodle.example.test', token: 'token' }),
      readWorkspaceSetting: () => ({ ok: true, status: 'configured', contextRoot: '/Users/test/Kurspilot' }),
      getClientSetupStatus: () => ({ codex: { needsRepair: true }, claude: { needsRepair: false } }),
    },
    flowOptions: {
      homeDir: '/Users/test',
      detectClients: () => ({ codex: true, claude: true }),
      isClaudeRunning: () => true,
      isCodexRunning: () => true,
      readCredentials: () => ({ url: 'https://moodle.example.test', token: 'token' }),
      setupCodexConfig: () => ({ created: true, backupPath: null, configPath: '/c' }),
      setupClaudeDesktopConfig: () => ({ created: true, backupPath: null, configPath: '/x' }),
      setupClaudeCodeConfig: () => ({ created: true, backupPath: null, configPath: '/y' }),
      installSkillsForProvider: () => ({ written: [], unchanged: [] }),
    },
    endClaudeDesktop: () => {
      endCalls.push('claude');
      return true;
    },
    endCodex: () => {
      endCalls.push('codex');
      return true;
    },
  });

  const form = new URLSearchParams();
  form.append('maintenance', 'kurspilot-setup-or-repair');
  form.append('client', 'codex');
  form.append('client', 'claude');
  const doneResponse = await request(urlFor(tool, '/done'), {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  });
  assert.match(doneResponse.body, /Codex jetzt beenden/);
  assert.match(doneResponse.body, /Claude jetzt beenden/);
  assert.match(doneResponse.body, /id="close-tab-notice"[^>]*hidden/);
  assert.match(doneResponse.body, /✓ Fertig/);
  assert.doesNotMatch(doneResponse.body, /Fertig und Tab schließen/);

  const codexAck = await request(urlFor(tool, '/end-now'), {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: 'client=codex',
  });
  const codexResult = JSON.parse(codexAck.body);
  assert.strictEqual(codexResult.done, false, 'Claude steht noch aus, Dienst darf noch nicht schliessen');
  assert.deepStrictEqual(endCalls, ['codex']);

  const claudeAck = await request(urlFor(tool, '/end-now'), {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: 'client=claude',
  });
  const claudeResult = JSON.parse(claudeAck.body);
  assert.strictEqual(claudeResult.done, true, 'beide Clients bestaetigt, Dienst darf jetzt schliessen');
  assert.deepStrictEqual(endCalls, ['codex', 'claude']);

  await tool.closed;
});

test('"Später von Hand" bestaetigt einen Client ohne Beenden-Aufruf', async () => {
  const endClaudeCalls = [];
  const tool = await startSetupBrowserServer({
    openBrowser: () => {},
    statusOptions: {
      detectClients: () => ({ codex: false, claude: true }),
      isClaudeRunning: () => true,
      readCredentials: () => ({ url: 'https://moodle.example.test', token: 'token' }),
      readWorkspaceSetting: () => ({ ok: true, status: 'configured', contextRoot: '/Users/test/Kurspilot' }),
      getClientSetupStatus: () => ({ codex: { needsRepair: true }, claude: { needsRepair: false } }),
    },
    flowOptions: {
      homeDir: '/Users/test',
      detectClients: () => ({ codex: false, claude: true }),
      isClaudeRunning: () => true,
      readCredentials: () => ({ url: 'https://moodle.example.test', token: 'token' }),
      setupClaudeDesktopConfig: () => ({ created: true, backupPath: null, configPath: '/x' }),
      setupClaudeCodeConfig: () => ({ created: true, backupPath: null, configPath: '/y' }),
      installSkillsForProvider: () => ({ written: [], unchanged: [] }),
    },
    endClaudeDesktop: () => {
      endClaudeCalls.push(true);
      return true;
    },
  });

  const form = new URLSearchParams({ maintenance: 'kurspilot-setup-or-repair', client: 'claude' });
  await request(urlFor(tool, '/done'), {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  });

  const skipResponse = await request(urlFor(tool, '/skip'), {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: 'client=claude',
  });
  const skipResult = JSON.parse(skipResponse.body);
  assert.strictEqual(skipResponse.statusCode, 200);
  assert.strictEqual(skipResult.done, true);
  assert.strictEqual(endClaudeCalls.length, 0);
  await tool.closed;
});

test('Browser-Antwort zeigt ImageMagick-Installationsfehler als Warnung', async () => {
  const tool = await startSetupBrowserServer({
    openBrowser: () => {},
    statusOptions: {
      detectClients: () => ({ codex: true, claude: false }),
      readCredentials: () => ({ url: 'https://moodle.example.test', token: 'token' }),
      readWorkspaceSetting: () => ({ ok: true, status: 'configured', contextRoot: '/Users/test/Kurspilot' }),
      getClientSetupStatus: () => ({ codex: { needsRepair: true }, claude: { needsRepair: false } }),
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
  const response = await request(urlFor(tool, '/done'), {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  });

  assert.strictEqual(response.statusCode, 200);
  assert.match(response.headers['content-type'], /^text\/html; charset=utf-8/);
  assert.match(response.body, /<h2>Warnungen<\/h2>/);
  assert.match(response.body, /winget nicht gefunden/);
  await tool.closed;
});

test('Browser-Antwort formatiert Homebrew-Terminalbefehl mit Kopierbutton', async () => {
  const command = '/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"';
  const tool = await startSetupBrowserServer({
    openBrowser: () => {},
    statusOptions: {
      detectClients: () => ({ codex: true, claude: false }),
      readCredentials: () => ({ url: 'https://moodle.example.test', token: 'token' }),
      readWorkspaceSetting: () => ({ ok: true, status: 'configured', contextRoot: '/Users/test/Kurspilot' }),
      getClientSetupStatus: () => ({ codex: { needsRepair: true }, claude: { needsRepair: false } }),
      platform: 'darwin',
      isImageMagickAvailable: () => false,
      isSipsAvailable: () => true,
    },
    flowOptions: {
      homeDir: '/Users/test',
      detectClients: () => ({ codex: true, claude: false }),
      isImageMagickAvailable: () => false,
      installImageMagick: () => ({
        installed: false,
        error: `ImageMagick bleibt optional. Terminalbefehl für eine manuelle Homebrew-Installation: ${command}`,
      }),
    },
  });

  const response = await request(urlFor(tool, '/done'), {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ maintenance: 'imagemagick-install' }).toString(),
  });

  assert.strictEqual(response.statusCode, 200);
  assert.match(response.body, /class="command-snippet"/);
  assert.match(response.body, /In Zwischenablage kopieren/);
  assert.match(response.body, /navigator\.clipboard/);
  assert.match(response.body, /\/bin\/bash -c &quot;\$\(curl -fsSL https:\/\/raw\.githubusercontent\.com\/Homebrew\/install\/HEAD\/install\.sh\)&quot;/);
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
      isCodexRunning: () => false,
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

  const response = await request(urlFor(tool, '/done'), {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  });

  assert.strictEqual(response.statusCode, 200);
  assert.match(response.body, /<h2>Warnungen<\/h2>/);
  assert.match(response.body, /kurspilot-einrichten\/SKILL\.md/);
  await tool.closed;
});

// --- Updates (Issue #128) ----------------------------------------------------

test('Startseite zeigt Update-Bereich mit automatischem Laufend-Hinweis (kein Knopf)', async () => {
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
    assert.match(response.body, /id="update-progress"/);
    assert.doesNotMatch(response.body, /check-updates-button/);
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

test('Startseite zeigt Aktivitaets-Checkliste mit Default-Auswahl (Textseite an, Forum exotisch aus)', async () => {
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

    assert.match(response.body, /name="activity" value="page"[^>]* checked/);
    assert.match(response.body, /name="activity" value="forum"(?![^>]*checked)/);
    assert.match(response.body, /Textseite/);
    assert.match(response.body, /Fragensammlung/);
  } finally {
    await tool.close();
  }
});

test('POST /done reicht ausgewaehlte Aktivitaeten als selectedActivityIds an die Client-Configs weiter', async () => {
  const calls = { setupCodexConfig: [] };
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
      isCodexRunning: () => false,
      setupCodexConfig: (...args) => {
        calls.setupCodexConfig.push(args);
      },
      installSkillsForProvider: () => {},
    },
  });

  const form = new URLSearchParams();
  form.append('maintenance', 'kurspilot-setup-or-repair');
  form.append('client', 'codex');
  form.append('activity', 'quiz');
  form.append('activitiesSubmitted', '1');

  const response = await request(urlFor(tool, '/done'), {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  });

  assert.strictEqual(response.statusCode, 200);
  assert.strictEqual(calls.setupCodexConfig.length, 1);
  const [, , , codexOptions] = calls.setupCodexConfig[0];
  assert.deepStrictEqual(codexOptions.selectedActivityIds, ['quiz']);

  await tool.closed;
});

test('POST /done ohne abgeschickte Aktivitaets-Checkliste laesst selectedActivityIds undefined (Default-Bundle greift)', async () => {
  const calls = { setupCodexConfig: [] };
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
      isCodexRunning: () => false,
      setupCodexConfig: (...args) => {
        calls.setupCodexConfig.push(args);
      },
      installSkillsForProvider: () => {},
    },
  });

  const form = new URLSearchParams();
  form.append('maintenance', 'kurspilot-setup-or-repair');
  form.append('client', 'codex');

  const response = await request(urlFor(tool, '/done'), {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  });

  assert.strictEqual(response.statusCode, 200);
  assert.strictEqual(calls.setupCodexConfig.length, 1);
  const [, , , codexOptions] = calls.setupCodexConfig[0];
  assert.strictEqual(codexOptions.selectedActivityIds, undefined);

  await tool.closed;
});

test('Aktivitaeten ohne Moodle-API (Forum) sind in der Checkliste deaktiviert und nicht ankreuzbar (Bugfix)', async () => {
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

    assert.match(response.body, /name="activity" value="forum"[^>]* disabled/);
    assert.doesNotMatch(response.body, /name="activity" value="forum"[^>]* checked/);
    assert.match(response.body, /noch keine Moodle-API/);
  } finally {
    await tool.close();
  }
});

test('Aktivitaeten-Checkliste zeigt tatsaechlich gespeicherte Auswahl statt immer das Default-Buendel (Issue #96-Folgefehler)', async () => {
  const tool = await startSetupBrowserServer({
    openBrowser: () => {},
    statusOptions: {
      detectClients: () => ({ codex: true, claude: false }),
      readCredentials: () => ({ url: 'https://moodle.example.test', token: 'token' }),
      readWorkspaceSetting: () => ({ ok: true, status: 'configured', contextRoot: '/Users/test/Kurspilot' }),
      getClientSetupStatus: () => ({ codex: { needsRepair: true }, claude: { needsRepair: false } }),
      readConfiguredActivityIds: () => ['quiz', 'fragensammlung'],
    },
  });

  try {
    const response = await request(tool.url);

    assert.match(response.body, /name="activity" value="quiz"[^>]* checked/);
    assert.match(response.body, /name="activity" value="fragensammlung"[^>]* checked/);
    assert.doesNotMatch(response.body, /name="activity" value="page"[^>]* checked/);
  } finally {
    await tool.close();
  }
});

// --- CSRF-Token-Pflicht (Issue #194) ----------------------------------------

const tokenStatusOptions = {
  detectClients: () => ({ codex: true, claude: false }),
  readCredentials: () => ({ url: 'https://moodle.example.test', token: 'token' }),
  readWorkspaceSetting: () => ({ ok: true, status: 'configured', contextRoot: '/Users/test/Kurspilot' }),
  // needsRepair: true haelt diesen Status unter der automatischen Ansichtswahl
  // (Issue #202) auf der Ersteinrichtungs-Seite - die CSRF-Tests pruefen das
  // gerenderte Setup-Page-Verhalten, nicht die Wartungs-Ansicht.
  getClientSetupStatus: () => ({ codex: { needsRepair: true }, claude: { needsRepair: false } }),
};

function withoutToken(tool, pathWithQuery) {
  return new URL(pathWithQuery, tool.url);
}

function withWrongToken(tool, pathWithQuery) {
  const url = new URL(pathWithQuery, tool.url);
  url.searchParams.set('token', 'f'.repeat(32));
  return url;
}

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

test('CSRF: POST /done ohne Token -> 403, mit falschem Token -> 403 (#194)', async () => {
  const tool = await startSetupBrowserServer({
    openBrowser: () => {},
    statusOptions: tokenStatusOptions,
    flowOptions: {
      homeDir: '/tmp',
      detectClients: () => ({ codex: true, claude: false }),
      readCredentials: () => ({ url: 'https://moodle.example.test', token: 'token' }),
    },
  });

  try {
    const body = new URLSearchParams({ maintenance: 'kurspilot-setup-or-repair' }).toString();
    const headers = { 'content-type': 'application/x-www-form-urlencoded' };

    const noToken = await request(withoutToken(tool, '/done'), { method: 'POST', headers, body });
    assert.strictEqual(noToken.statusCode, 403);
    assert.match(noToken.body, /Ungueltiges oder fehlendes Token/);

    const wrongToken = await request(withWrongToken(tool, '/done'), { method: 'POST', headers, body });
    assert.strictEqual(wrongToken.statusCode, 403);
  } finally {
    await tool.close();
  }
});

test('CSRF: POST /done mit gueltigem Token -> 200 (bestehendes Verhalten) (#194)', async () => {
  const tool = await startSetupBrowserServer({
    openBrowser: () => {},
    statusOptions: tokenStatusOptions,
    flowOptions: {
      homeDir: '/tmp',
      detectClients: () => ({ codex: true, claude: false }),
      readCredentials: () => ({ url: 'https://moodle.example.test', token: 'token' }),
    },
  });

  const body = new URLSearchParams({ maintenance: 'kurspilot-setup-or-repair' }).toString();
  const response = await request(urlFor(tool, '/done'), {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });

  assert.strictEqual(response.statusCode, 200);
  await tool.closed;
});

test('CSRF: weitere POST-Handler lehnen ohne Token mit 403 ab (#194)', async () => {
  const tool = await startSetupBrowserServer({
    openBrowser: () => {},
    statusOptions: tokenStatusOptions,
  });

  try {
    for (const path of ['/end-now', '/skip', '/finish-setup', '/apply-updates', '/abort']) {
      const response = await request(withoutToken(tool, path), {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: 'client=codex',
      });
      assert.strictEqual(response.statusCode, 403, `${path} ohne Token muss 403 sein`);
      assert.match(response.body, /Ungueltiges oder fehlendes Token/);
    }
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
    assert.match(response.body, /Ersteinrichtung wiederholen/);
    assert.match(response.body, /class="card-grid"/);
    assert.doesNotMatch(response.body, /Kurspilot konfigurieren/);
    assert.doesNotMatch(response.body, /Modus:/);
    const tokenValue = new URL(tool.url).searchParams.get('token');
    assert.ok(!response.body.includes(tokenValue), 'CSRF-Token-Wert darf nicht im HTML stehen');
  } finally {
    await tool.close();
  }
});

test('Auto-Wahl: Mindestkonfiguration nicht erfuellt -> GET / rendert Ersteinrichtungs-Ansicht (#202)', async () => {
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

    assert.strictEqual(response.statusCode, 200);
    assert.match(response.body, /Kurspilot konfigurieren/);
    assert.match(response.body, /Modus:/);
    assert.doesNotMatch(response.body, /Alles läuft/);
    assert.doesNotMatch(response.body, /Ersteinrichtung wiederholen/);
  } finally {
    await tool.close();
  }
});

test('POST /restart-setup erzwingt Ersteinrichtungs-Ansicht bei naechstem GET / (#202)', async () => {
  const tool = await startSetupBrowserServer({
    openBrowser: () => {},
    statusOptions: minimumConfiguredStatusOptions(),
  });

  try {
    const before = await request(tool.url);
    assert.match(before.body, /Alles läuft/, 'Vorher Wartungs-Ansicht');

    const restart = await request(urlFor(tool, '/restart-setup'), {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: '',
    });
    assert.strictEqual(restart.statusCode, 200);
    assert.deepStrictEqual(JSON.parse(restart.body), { ok: true });

    const after = await request(tool.url);
    assert.match(after.body, /Kurspilot konfigurieren/, 'Nachher Ersteinrichtungs-Ansicht');
    assert.match(after.body, /Modus:/);
    assert.doesNotMatch(after.body, /Alles läuft/);
  } finally {
    await tool.close();
  }
});

test('POST /restart-setup ohne Token -> 403 (#202, CSRF)', async () => {
  const tool = await startSetupBrowserServer({
    openBrowser: () => {},
    statusOptions: minimumConfiguredStatusOptions(),
  });

  try {
    const response = await request(withoutToken(tool, '/restart-setup'), {
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
  const tool = await startSetupBrowserServer({
    openBrowser: () => {},
    statusOptions: {
      ...minimumConfiguredStatusOptions(),
      readCredentials: () => ({ url: 'https://neu.example.test', token: 'neuer-token' }),
    },
    flowOptions: applyMoodleFlowOptions({
      setCredentials: (url, token) => { savedCredentials.push({ url, token }); },
    }),
  });

  try {
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
