const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

/**
 * Dokumentationstest fuer Issue #69: deckt den README-Abschnitt zur
 * macOS-Apple-Silicon-Installation ab (GitHub-Release-Download,
 * macOS-Gatekeeper-Hinweis, kostenfreier Verteilweg, gebundene
 * Kurspilot-Laufzeit). Verhindert Rueckfaelle auf alte Annahmen aus der
 * Zeit vor #68 (manuelles Node.js, ZIP-Entpacken, Tokens im Doku-Text).
 */

const repoRoot = path.join(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function extractSection(markdown, headingPattern) {
  const lines = markdown.split('\n');
  const startIndex = lines.findIndex((line) => headingPattern.test(line));
  assert.ok(startIndex !== -1, `Abschnitt "${headingPattern}" nicht gefunden`);

  const headingLevel = lines[startIndex].match(/^(#+)\s/)[1].length;
  let endIndex = lines.length;
  for (let i = startIndex + 1; i < lines.length; i += 1) {
    const match = lines[i].match(/^(#+)\s/);
    if (match && match[1].length <= headingLevel) {
      endIndex = i;
      break;
    }
  }

  return lines.slice(startIndex, endIndex).join('\n');
}

test('README documents the macOS Apple-Silicon installer release path with Gatekeeper guidance', () => {
  const readme = read('README.md');
  const section = extractSection(readme, /^#+\s*macOS-Installation \(Apple Silicon\)/);
  const normalized = section.replace(/\s+/g, ' ');

  assert.match(normalized, /GitHub-Releases-Seite|GitHub Release/);
  assert.match(normalized, /Gatekeeper/);
  assert.match(normalized, /Rechtsklick/);
  assert.match(normalized, /["“]?Oeffnen["”]?|["“]?Öffnen["”]?/);
  assert.match(normalized, /kostenfrei/i);
  assert.match(normalized, /ohne Apple Developer Account|kein.*Apple Developer Account/);
  assert.match(normalized, /Signierung|Signing/);
  assert.match(normalized, /[Nn]otariesi|[Nn]otarisi/);
  assert.match(normalized, /gebundene Kurspilot-Laufzeit|Gebundene Kurspilot-Laufzeit/);
  assert.match(normalized, /kein.*System-Node|System-Node.*nicht/i);
  assert.match(normalized, /Kurspilot-Konfigurationsprogramm/);
  assert.match(normalized, /scripts\/setup-kurspilot\.js/);
});

test('README macOS installer section avoids token examples and outdated manual-install assumptions', () => {
  const readme = read('README.md');
  const section = extractSection(readme, /^#+\s*macOS-Installation \(Apple Silicon\)/);

  // Keine konkreten Token-Beispiele oder Token-Variablen im neuen Abschnitt.
  assert.doesNotMatch(section, /MOODLE_TOKEN\s*=/);
  assert.doesNotMatch(section, /\.env/);
  assert.doesNotMatch(section, /dein-api-token/);

  // Keine ueberholten Vor-#68-Annahmen (manuelles Node, ZIP, npm install -g).
  assert.doesNotMatch(section, /Node\.js muss installiert sein/i);
  assert.doesNotMatch(section, /npm install -g/);
  assert.doesNotMatch(section, /ZIP[- ]?(Datei )?entpacken/i);

  // Terminal ist hier kein Lehrkraft-Normalweg.
  assert.doesNotMatch(section, /Terminal oeffnen/i);
  assert.doesNotMatch(section, /im Terminal ausfuehren/i);
});
