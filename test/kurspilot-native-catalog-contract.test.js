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
const TOOL_REGISTRY_PATH = path.join(repoRoot, 'Plugin', 'src', 'local_kurspilot', 'classes', 'tool_registry.php');

function read(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

// Seit #378 gibt es eine einzige Werkzeug-Registrierung
// (classes/tool_registry.php); dispatcher.php, db/services.php und
// privacy_surface.php leiten ihre Listen daraus ab statt eigene Kopien zu
// fuehren. Extrahiert den TOOLS-Eintrag eines Werkzeugs (8-Leerzeichen-
// Einrueckung fuer Schluessel und schliessende Klammer).
function extractRegistryEntry(source, toolName) {
  const re = new RegExp(`'${toolName}'\\s*=>\\s*\\[([\\s\\S]*?)\\n {8}\\],`);
  const match = source.match(re);
  assert.ok(match, `Registry-Eintrag fuer ${toolName} nicht gefunden`);
  return match[1];
}

// Extracts the concatenated PHP string literal assigned to a
// tool_registry TOOLS key, e.g. 'key' => 'a' . 'b' . 'c'.
function extractToolField(entry, fieldName) {
  const re = new RegExp(
    `'${fieldName}'\\s*=>\\s*((?:'(?:[^'\\\\]|\\\\.)*'\\s*(?:\\.\\s*)?)+)`
  );
  const match = entry.match(re);
  assert.ok(match, `Feld ${fieldName} nicht gefunden`);
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
  const registry = read(TOOL_REGISTRY_PATH);
  const entry = extractRegistryEntry(registry, 'kurspilot_get_course_catalog');

  assert.match(entry, /'function'\s*=>\s*'local_kurspilot_get_course_catalog'/);
  assert.match(entry, /'classname'\s*=>\s*'local_kurspilot\\external\\get_course_catalog'/);
  assert.doesNotMatch(entry, /'write'\s*=>\s*true/);

  // privacy_surface und db/services.php muessen tatsaechlich aus der
  // Registry ableiten (#378), nicht eigene Kopien fuehren - sonst kann die
  // eine Quelle wieder auseinanderlaufen.
  const surface = read(PRIVACY_SURFACE_PATH);
  assert.match(surface, /tool_registry::allowed_tools\(\)/);

  const services = read(SERVICES_PATH);
  assert.match(services, /tool_registry::service_functions\(\)/);
  assert.match(services, /tool_registry::service_function_names\(\)/);
});

test('kurspilot_get_course_catalog tool description documents source, detail levels, masking, and explicit grouping', () => {
  const registry = read(TOOL_REGISTRY_PATH);
  const entry = extractRegistryEntry(registry, 'kurspilot_get_course_catalog');
  const description = extractToolField(entry, 'description');

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
  const registry = read(TOOL_REGISTRY_PATH);
  const entry = extractRegistryEntry(registry, 'kurspilot_get_course_catalog');

  assert.match(entry, /'schema'\s*=>\s*\[/);
  assert.match(entry, /'courseid'\s*=>\s*\['type'\s*=>\s*'number'/);
  assert.match(entry, /'required'\s*=>\s*\['courseid'\]/);
});
