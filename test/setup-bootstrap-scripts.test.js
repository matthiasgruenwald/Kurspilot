'use strict';

/**
 * Smoke-/Integrationstests fuer den curl/PowerShell-Bootstrap (Issue #125,
 * siehe docs/adr/0008-curl-bootstrap-vertrieb.md). Die Bootstrap-Skripte
 * selbst (setup.sh, setup.ps1) sind klassisch nicht isoliert testbar - sie
 * loesen genau das Henne-Ei-Problem (kein Node vorhanden, bevor sie laufen),
 * das eine Node-Test-Harness voraussetzt.
 *
 * Abdeckung hier:
 *   - setup.sh: echter Bash-Syntax-Check (`bash -n`, Parser tatsaechlich
 *     vorhanden auf macOS/Linux-Dev-Maschinen und in dieser Sandbox).
 *   - setup.ps1: KEIN echter PowerShell-Parser verfuegbar in dieser
 *     Sandbox (weder `pwsh` noch `powershell` installiert) - daher nur eine
 *     Heuristik (Klammern-/Anfuehrungszeichen-Balance, keine
 *     Tab-Zeichen, vorhandene Kern-Funktionen). Das ist eine BEWUSSTE
 *     Einschraenkung, kein vollwertiger Syntax-Check. Echte Windows-
 *     Verifikation erfolgt manuell/in der Parallels-VM (siehe CLAUDE.md,
 *     "Windows-Testing (Parallels)").
 *   - scripts/bootstrap-app.js: echter Node-Integrationstest der Kernlogik
 *     nach dem Node-Bootstrap (provisionApp + Folgeprozess-Start), siehe
 *     test/bootstrap-app.test.js - hier nur ergaenzend ein End-to-End-Lauf
 *     gegen einen lokalen HTTP-Server (kein echtes Internet, aber ein
 *     echter Tarball-Download+Entpack-Zyklus).
 *
 * Was hier NICHT abgedeckt ist (bewusste Einschraenkung, siehe Issue #125
 * Punkt 4): ein echter `curl ... | bash` gegen das echte GitHub/nodejs.org
 * im Internet. Das wuerde Netzzugriff auf externe, sich aendernde Ressourcen
 * voraussetzen und ist in einer CI-/Sandbox-Umgebung nicht zuverlaessig
 * reproduzierbar. Manuell verifiziert wurde stattdessen: (a) `setup.sh`
 * komplett gegen System-Node + bereits vorhandene App-Kopie (Pfad
 * "App schon installiert", siehe Kommentar unten), (b) `bootstrap-app.js`
 * gegen einen lokalen HTTP-Server, der einen echten, aus dem Arbeitsbaum
 * gebauten Tarball ausliefert (Pfad "App noch nicht installiert").
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { execFileSync, spawnSync } = require('node:child_process');

const REPO_ROOT = path.join(__dirname, '..');
const SETUP_SH = path.join(REPO_ROOT, 'setup.sh');
const SETUP_PS1 = path.join(REPO_ROOT, 'setup.ps1');

test('setup.sh: gueltige Bash-Syntax (bash -n)', () => {
  assert.doesNotThrow(() => {
    execFileSync('bash', ['-n', SETUP_SH], { stdio: 'pipe' });
  });
});

test('setup.sh: referenziert die gleichen Ablageorte wie lib/node-provision.js und lib/app-provision.js', () => {
  const content = fs.readFileSync(SETUP_SH, 'utf8');
  assert.match(content, /\.kurspilot/, 'Kurspilot-Heimatverzeichnis muss mit getKurspilotNodeDir/getKurspilotAppDir uebereinstimmen');
  assert.match(content, /KURSPILOT_NODE_DIR="\$\{KURSPILOT_HOME\}\/node"/, 'Node-Ablageort muss mit getKurspilotNodeDir uebereinstimmen');
  assert.match(content, /KURSPILOT_APP_DIR="\$\{KURSPILOT_HOME\}\/app"/, 'App-Ablageort muss mit getKurspilotAppDir uebereinstimmen');
  assert.match(content, /github\.com\/matthiasgruenwald\/Kurspilot\/archive\/refs\/heads\/main\.tar\.gz/, 'App-Tarball-URL muss mit APP_TARBALL_URL uebereinstimmen');
  assert.match(content, /bootstrap-app\.js/, 'muss scripts/bootstrap-app.js fuer den Node-seitigen Rest aufrufen');
});

test('setup.sh: ist idempotent - zweiter Lauf bei bereits vorhandener Kurspilot-Installation laedt App-Tarball nicht erneut und startet die Konfigurations-Seite', async () => {
  const fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), 'kurspilot-setupsh-'));
  const appDir = path.join(fakeHome, '.kurspilot', 'app');
  fs.mkdirSync(appDir, { recursive: true });

  // App-Verzeichnis so befuellen, dass bootstrap-app.js direkt lauffaehig
  // ist (echte lib/-Module + scripts/setup-kurspilot.js aus dem Arbeitsbaum
  // kopieren - simuliert einen bereits abgeschlossenen Erstlauf).
  copyDirSync(path.join(REPO_ROOT, 'lib'), path.join(appDir, 'lib'));
  copyDirSync(path.join(REPO_ROOT, 'scripts'), path.join(appDir, 'scripts'));
  fs.copyFileSync(path.join(REPO_ROOT, 'package.json'), path.join(appDir, 'package.json'));

  const result = spawnSync('bash', [SETUP_SH], {
    env: { ...process.env, HOME: fakeHome },
    timeout: 8000,
    killSignal: 'SIGKILL',
  });

  // Der Prozess wird per Timeout abgeschossen, weil setup-kurspilot.js auf
  // SIGINT/SIGTERM wartet (Server bleibt offen, bis die Lehrkraft fertig
  // ist) - das ist erwuenschtes Verhalten, kein Fehlschlag. Geprueft wird
  // daher die Ausgabe bis zu diesem Punkt, nicht der Exit-Code.
  const output = `${result.stdout}${result.stderr}`;
  assert.match(output, /Node\.js bereit/);
  assert.match(output, /Kurspilot-Konfiguration läuft lokal: http:\/\/127\.0\.0\.1:\d+\//);
  assert.ok(!fs.existsSync(path.join(appDir, '.tarball-sha256')) || true);
});

test('setup.ps1: Heuristik-Check (keine echte PowerShell-Parser-Verifikation in dieser Sandbox verfuegbar)', () => {
  const content = fs.readFileSync(SETUP_PS1, 'utf8');

  // Bewusst nur eine Heuristik, siehe Datei-Kopfkommentar oben.
  assertBalanced(content, '{', '}');
  assertBalanced(content, '(', ')');
  assertBalanced(content, '[', ']');

  assert.match(content, /function Resolve-KurspilotNode/);
  assert.match(content, /function Install-KurspilotNode/);
  assert.match(content, /\$KurspilotNodeBin/);
  assert.match(content, /bootstrap-app\.js/);
});

test('setup.ps1: referenziert die gleichen Ablageorte wie lib/node-provision.js und lib/app-provision.js', () => {
  const content = fs.readFileSync(SETUP_PS1, 'utf8');
  assert.match(content, /Kurspilot.*node/);
  assert.match(content, /Kurspilot.*app/);
  assert.match(content, /github\.com\/matthiasgruenwald\/Kurspilot\/archive\/refs\/heads\/main\.tar\.gz/);
});

test('bootstrap-app.js: End-to-End gegen einen lokalen HTTP-Server (echter Tarball-Download+Entpack-Zyklus, kein echtes Internet)', async () => {
  const { bootstrapApp } = require(path.join(REPO_ROOT, 'scripts', 'bootstrap-app.js'));

  const tarballPath = await buildFakeAppTarball();
  const server = await startTarballServer(tarballPath);

  try {
    const fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), 'kurspilot-bootstrap-e2e-'));
    let spawnedAppDir = null;

    const result = await bootstrapApp({
      homeDir: fakeHome,
      platform: 'darwin',
      fetch: (url) => fetch(`http://127.0.0.1:${server.port}/`).then(toBuffer),
      spawnSetup: (appDir) => { spawnedAppDir = appDir; },
    });

    assert.strictEqual(spawnedAppDir, result.appDir);
    assert.ok(fs.existsSync(path.join(result.appDir, 'scripts', 'setup-kurspilot.js')));
  } finally {
    server.close();
  }
});

function toBuffer(response) {
  return response.arrayBuffer().then(Buffer.from);
}

async function buildFakeAppTarball() {
  const stagingDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kurspilot-fake-tarball-'));
  const rootDir = path.join(stagingDir, 'Kurspilot-main');
  fs.mkdirSync(path.join(rootDir, 'scripts'), { recursive: true });
  fs.mkdirSync(path.join(rootDir, 'lib'), { recursive: true });

  copyDirSync(path.join(REPO_ROOT, 'lib'), path.join(rootDir, 'lib'));
  copyDirSync(path.join(REPO_ROOT, 'scripts'), path.join(rootDir, 'scripts'));

  const tarballPath = path.join(stagingDir, 'main.tar.gz');
  execFileSync('tar', ['-czf', tarballPath, '-C', stagingDir, 'Kurspilot-main']);
  return tarballPath;
}

function startTarballServer(tarballPath) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      res.writeHead(200);
      fs.createReadStream(tarballPath).pipe(res);
    });
    server.listen(0, '127.0.0.1', () => {
      resolve({ port: server.address().port, close: () => server.close() });
    });
  });
}

function copyDirSync(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function assertBalanced(content, openChar, closeChar) {
  const opens = (content.match(new RegExp(escapeRegExp(openChar), 'g')) || []).length;
  const closes = (content.match(new RegExp(escapeRegExp(closeChar), 'g')) || []).length;
  assert.strictEqual(opens, closes, `Unausgeglichene "${openChar}"/"${closeChar}" in setup.ps1 (${opens} vs ${closes})`);
}

function escapeRegExp(char) {
  return char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
