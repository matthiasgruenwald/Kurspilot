const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.join(__dirname, '..');
const NATIVE_CATALOG_PATH = path.join(
  repoRoot, 'Plugin', 'src', 'local_kurspilot', 'classes', 'external', 'get_course_catalog.php'
);
const PRIVACY_SURFACE_PATH = path.join(repoRoot, 'Plugin', 'src', 'local_kurspilot', 'classes', 'privacy_surface.php');
const SERVICES_PATH = path.join(repoRoot, 'Plugin', 'src', 'local_kurspilot', 'db', 'services.php');
const DISPATCHER_PATH = path.join(repoRoot, 'Plugin', 'src', 'local_kurspilot', 'classes', 'dispatcher.php');

function read(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

// Extracts the concatenated PHP string literal assigned to a
// TOOL_DESCRIPTIONS entry, e.g. 'key' => 'a' . 'b' . 'c'.
function extractToolDescription(source, toolName) {
  const re = new RegExp(
    `'${toolName}'\\s*=>\\s*((?:'(?:[^'\\\\]|\\\\.)*'\\s*(?:\\.\\s*)?)+)`
  );
  const match = source.match(re);
  assert.ok(match, `Beschreibung fuer ${toolName} nicht gefunden`);
  const parts = match[1].match(/'(?:[^'\\]|\\.)*'/g);
  return parts.map((p) => p.slice(1, -1)).join('');
}

test('kurspilot_get_course_catalog delegates 1:1 to the local plugin contract', () => {
  assert.ok(fs.existsSync(NATIVE_CATALOG_PATH), 'natives get_course_catalog fehlt');

  const source = read(NATIVE_CATALOG_PATH);

  assert.match(source, /namespace local_kurspilot\\external;/);
  assert.match(source, /use local_coursepilot\\external\\get_course_catalog as coursepilot_catalog;/);
  assert.match(source, /class get_course_catalog extends external_api/);
  assert.match(source, /return coursepilot_catalog::execute_parameters\(\);/);
  assert.match(source, /return coursepilot_catalog::execute\(\$courseid, \$sectionnum, \$modname, \$detail\);/);
  assert.match(source, /return coursepilot_catalog::execute_returns\(\);/);

  // Keine eigene Datenlogik/-abfrage - reine Delegation, keine Duplikation.
  assert.doesNotMatch(source, /course_sections/);
  assert.doesNotMatch(source, /course_modules/);

  // Eigene Capability-Pruefung vor der Delegation (Code-Review-Fund #341):
  // die delegierte Klasse prueft lokal/coursepilot:use, nicht
  // local/kurspilot:use - ohne eigenen Check waere die in db/services.php
  // deklarierte Capability wirkungslose Metadaten.
  assert.match(source, /require_capability\('local\/kurspilot:use', \$context\)/);
});

test('kurspilot_get_course_catalog is registered as a read-only tool and Moodle webservice function', () => {
  const surface = read(PRIVACY_SURFACE_PATH);
  assert.match(surface, /'kurspilot_get_course_catalog'\s*=>\s*'local_kurspilot_get_course_catalog'/);

  const services = read(SERVICES_PATH);
  assert.match(services, /'local_kurspilot_get_course_catalog'\s*=>/);
  assert.match(services, /'classname'\s*=>\s*'local_kurspilot\\external\\get_course_catalog'/);
  assert.match(services, /'type'\s*=>\s*'read'/);
  assert.match(services, /'local_kurspilot_get_course_catalog'/);

  // Muss auch tatsaechlich im Kurspilot-Dienst gelistet sein, nicht nur
  // definiert - sonst ist es gelistet, aber nicht aufrufbar.
  const servicesBlockMatch = services.match(/\$services\s*=\s*\[[\s\S]*?\];/);
  assert.ok(servicesBlockMatch);
  assert.match(servicesBlockMatch[0], /'local_kurspilot_get_course_catalog'/);
});

test('kurspilot_get_course_catalog tool description documents source, detail levels, masking, and explicit grouping', () => {
  const dispatcher = read(DISPATCHER_PATH);
  const description = extractToolDescription(dispatcher, 'kurspilot_get_course_catalog');

  assert.match(description, /aus Moodle gelesen/);
  assert.match(description, /full/);
  assert.match(description, /compact/);
  assert.match(description, /maskiert/);
  assert.match(description, /Gruppennamen/);
  assert.match(description, /ausdruecklich/);

  const byteLength = Buffer.byteLength(description, 'utf8');
  assert.ok(byteLength < 2048, `Beschreibung ist ${byteLength} Bytes lang, muss unter 2 KB bleiben`);
});

test('tools() builds a real inputSchema for kurspilot_get_course_catalog instead of an empty one', () => {
  const dispatcher = read(DISPATCHER_PATH);

  assert.match(dispatcher, /TOOL_SCHEMAS/);
  assert.match(dispatcher, /'kurspilot_get_course_catalog'\s*=>\s*\[/);
  assert.match(dispatcher, /'courseid'\s*=>\s*\['type'\s*=>\s*'number'/);
  assert.match(dispatcher, /'required'\s*=>\s*\['courseid'\]/);
});
