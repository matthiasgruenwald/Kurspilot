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

test('kurspilot_get_course_catalog is a self-contained port with the same contract fields as the local tool, no cross-plugin dependency', () => {
  assert.ok(fs.existsSync(NATIVE_CATALOG_PATH), 'natives get_course_catalog fehlt');

  const source = read(NATIVE_CATALOG_PATH);

  assert.match(source, /namespace local_kurspilot\\external;/);
  assert.match(source, /class get_course_catalog extends external_api/);
  assert.match(source, /aus Moodle gelesen/);
  assert.match(source, /sectionnum/);
  assert.match(source, /modname/);
  assert.match(source, /detail/);
  assert.match(source, /course_sections/);
  assert.match(source, /course_modules/);
  assert.match(source, /completionpassgrade/);
  assert.match(source, /availability/);
  assert.match(source, /quiz_slots/);
  assert.match(source, /question_references/);

  // Eigene Capability-Pruefung, konsistent mit db/services.php/privacy_surface.
  assert.match(source, /require_capability\('local\/kurspilot:use', \$context\)/);

  // Spec 0012: local_kurspilot hat "keine Abhaengigkeit zu
  // local_coursepilot" - ein `use`-Import daraus ist auf der
  // Spike-Testinstanz (traegt ausschliesslich local_kurspilot) ein Fatal
  // Error "Class ... not found" (Fund aus dem PHPUnit-Lauf zu #341). Prosa in
  // Kommentaren, die local_coursepilot als Portierungsvorbild nennt, ist
  // erlaubt - verboten ist nur ein tatsaechlicher PHP-Import.
  assert.doesNotMatch(source, /^use local_coursepilot/m);

  // Maskierung ueber die eigene, geteilte reine Funktion, nicht inline im
  // Katalogcode dupliziert.
  assert.match(source, /use local_kurspilot\\availability_privacy;/);
  assert.match(source, /availability_privacy::sanitize\(/);
});

test('availability_privacy is a self-contained shared pure function within local_kurspilot, no cross-plugin dependency', () => {
  const path_ = path.join(repoRoot, 'Plugin', 'src', 'local_kurspilot', 'classes', 'availability_privacy.php');
  assert.ok(fs.existsSync(path_), 'local_kurspilot availability_privacy fehlt');

  const source = read(path_);
  assert.match(source, /namespace local_kurspilot;/);
  assert.match(source, /class availability_privacy/);
  assert.match(source, /function sanitize\(string \$availability\): string/);
  assert.match(source, /'\*\*\*'/);
  assert.doesNotMatch(source, /^use local_coursepilot/m);
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
