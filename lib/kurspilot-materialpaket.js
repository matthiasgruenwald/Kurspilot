/**
 * kurspilot-materialpaket.js
 *
 * Materialexport eines einzelnen Unterrichtsvorhabens als Weitergabepaket
 * (siehe docs/specs/0010, Abschnitt "Weitergabe" / "Material teilen";
 * docs/specs/0011, Implementation Decisions, "Materialexport folgt
 * ausschliesslich Metadaten"; Issue #276).
 *
 * Der Export ist reine Dateiauswahl nach Frontmatter: Dateien mit
 * `kurspilot.personenbezug: true` oder `kurspilot.weitergabe:
 * nicht_weitergeben` bleiben unveraendert draussen, Text wird nicht
 * redigiert. Alle uebrigen Dateien des Vorhaben-Unterbaums gehen
 * unveraendert mit, unabhaengig von ihrer Endung (Originaldateien,
 * Binaerdateien eingeschlossen). Ergaenzt wird das Paket um `manifest.md`
 * (Paket-Einstieg), `katalog.md` (auf das Vorhaben begrenztes Katalogblatt,
 * siehe docs/specs/0010 "Thematischer Index") und `AGENTS.md`
 * (Agentenhinweise).
 *
 * Eine Vorschau (options.confirmed nicht gesetzt) liest nur und schreibt
 * nichts. Ein bestaetigter Aufruf (options.confirmed: true) schreibt das
 * ZIP - ausser noetige Weitergabe-Metadaten fehlen, dann bleibt es bei der
 * Vorschau-Antwort mit `ok: false` und einer konkreten Nachforderung.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const {
  getUnterrichtsvorhabenContextFile,
  resolveLocalContextPath,
} = require('./local-context-paths');
const { readFrontmatterFile, NOT_YET_PROVIDED } = require('./kurspilot-frontmatter');
const { renderKatalogblatt } = require('./kurspilot-index');
const { writeZipFile } = require('./kurspilot-zip');

function requireNonEmptyText(value, label) {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  if (!trimmed) {
    throw new Error(`${label} darf nicht leer sein.`);
  }
  return trimmed;
}

function formatPortablePath(relPath) {
  return relPath.split(path.sep).join('/');
}

/**
 * Entscheidet rein anhand des Frontmatters, ob eine Datei aus dem
 * Materialpaket ausgeschlossen bleibt. Dateien ohne (lesbares) Frontmatter
 * -  also normale Materialdateien, Originaldokumente, Binaerdateien - werden
 * nie ausgeschlossen: die Regel greift ausschliesslich fuer Markdown-
 * Kontextdateien mit `kurspilot`-Block.
 *
 * @param {string} absFilePath
 * @returns {string|null} Ausschlussgrund oder null (Datei bleibt im Paket)
 */
function evaluateExclusionReason(absFilePath) {
  if (path.extname(absFilePath).toLowerCase() !== '.md') {
    return null;
  }

  let parsed;
  try {
    parsed = readFrontmatterFile(absFilePath);
  } catch {
    // Kein oder kaputtes Frontmatter: keine Kontextdatei im Sinne von
    // Spec 0010, sondern normales Material. Bleibt im Paket.
    return null;
  }

  const kurspilot = parsed.data.kurspilot || {};
  if (kurspilot.personenbezug === true) {
    return 'personenbezogen (Sidecar)';
  }
  if (kurspilot.weitergabe === 'nicht_weitergeben') {
    return 'als nicht_weitergeben markiert';
  }
  return null;
}

/**
 * Durchsucht den Unterbaum eines Unterrichtsvorhabens rekursiv und trennt
 * Dateien in "eingeschlossen" und "ausgeschlossen" (mit Grund). Symlinks,
 * die aus dem Vorhaben-Unterbaum herausverweisen, werden ebenfalls
 * ausgeschlossen (Traversal-/Verweisschutz).
 *
 * @param {string} vorhabenDir absoluter Pfad zum Vorhaben-Ordner
 * @returns {{included: string[], excluded: {path: string, reason: string}[]}}
 */
function walkVorhabenTree(vorhabenDir) {
  const included = [];
  const excluded = [];
  const rootReal = fs.realpathSync(vorhabenDir);

  function visit(absDir, relDir) {
    const entries = fs
      .readdirSync(absDir, { withFileTypes: true })
      .sort((a, b) => a.name.localeCompare(b.name));

    for (const entry of entries) {
      const absPath = path.join(absDir, entry.name);
      const relPath = relDir ? `${relDir}/${entry.name}` : entry.name;

      if (entry.isSymbolicLink()) {
        let real;
        try {
          real = fs.realpathSync(absPath);
        } catch {
          excluded.push({ path: relPath, reason: 'Verweis (Symlink) laesst sich nicht aufloesen' });
          continue;
        }
        const relToRoot = path.relative(rootReal, real);
        if (relToRoot.startsWith('..') || path.isAbsolute(relToRoot)) {
          excluded.push({ path: relPath, reason: 'Verweis (Symlink) zeigt ausserhalb des Vorhabens' });
          continue;
        }
        if (fs.statSync(absPath).isDirectory()) {
          visit(absPath, relPath);
          continue;
        }
      } else if (entry.isDirectory()) {
        visit(absPath, relPath);
        continue;
      } else if (!entry.isFile()) {
        // z.B. Sockets/Devices: keine sinnvolle Materialdatei.
        excluded.push({ path: relPath, reason: 'kein regulaeres Datei-/Ordnerobjekt' });
        continue;
      }

      const reason = evaluateExclusionReason(absPath);
      if (reason) {
        excluded.push({ path: relPath, reason });
      } else {
        included.push(relPath);
      }
    }
  }

  visit(vorhabenDir, '');
  return { included, excluded };
}

function hasUsableLicense(value) {
  return typeof value === 'string' && value.trim() && value.trim() !== NOT_YET_PROVIDED;
}

/**
 * Prueft die fuer eine Weitergabe noetigen Metadaten des Vorhabens
 * (docs/specs/0011: "Fehlt notwendige Weitergabe-Metadaten oder eine fuer
 * offene Weitergabe verlangte Lizenz, liefert die Vorschau eine konkrete
 * Nachforderung und schreibt kein Paket.").
 *
 * @param {{kurspilot: {weitergabe: string}, license?: string}} frontmatterData
 * @returns {{canExport: boolean, missingMetadata: string[]}}
 */
function checkWeitergabeMetadata(frontmatterData) {
  const missingMetadata = [];
  let canExport = true;
  const weitergabe = frontmatterData.kurspilot && frontmatterData.kurspilot.weitergabe;

  if (weitergabe === 'nicht_weitergeben') {
    canExport = false;
    missingMetadata.push(
      'Das Unterrichtsvorhaben ist als "nicht_weitergeben" markiert und kann nicht als Materialpaket exportiert werden.'
    );
  } else if (weitergabe === 'offen' && !hasUsableLicense(frontmatterData.license)) {
    canExport = false;
    missingMetadata.push(
      'Fuer eine offene Weitergabe fehlt eine Lizenzangabe (Feld "license" in der CONTEXT.md des Vorhabens).'
    );
  }

  return { canExport, missingMetadata };
}

function buildManifestMarkdown({ title, vorhabenFolderName, herkunft, absender, schule, license, created, included }) {
  const lines = [
    `# Materialpaket: ${title}`,
    '',
    '## Paket-Einstieg',
    '- Modus: Material',
    `- Titel: ${title}`,
    `- Herkunft: ${herkunft}`,
    `- Absender: ${absender || NOT_YET_PROVIDED}`,
    `- Schule: ${schule || NOT_YET_PROVIDED}`,
    `- Erstellungsdatum: ${created}`,
    `- Lizenz: ${hasUsableLicense(license) ? license : NOT_YET_PROVIDED}`,
    '',
    'Dieses Paket enthaelt genau einen nicht-personenbezogenen',
    'Unterrichtsvorhaben-Ordner. Personenbezogene Sidecars und als',
    '"nicht_weitergeben" markierte Dateien bleiben ausgeschlossen; siehe',
    '`katalog.md` fuer ein auf dieses Vorhaben begrenztes Katalogblatt und',
    '`AGENTS.md` fuer eine knappe Orientierung.',
    '',
    '## Inhaltsverzeichnis',
    ...included.map((relPath) => `- ${vorhabenFolderName}/${relPath}`),
    '',
  ];
  return lines.join('\n');
}

function buildAgentsMarkdown({ title }) {
  return [
    '# AGENTS.md',
    '',
    `Materialpaket "${title}" - werkzeugunabhaengiges Weitergabepaket eines`,
    'einzelnen Unterrichtsvorhabens (Kurspilot, docs/specs/0010).',
    '',
    '## Aufbau',
    '- `manifest.md`: menschenlesbarer Paket-Einstieg (dieser Ordner).',
    '- `katalog.md`: auf dieses Vorhaben begrenztes Katalogblatt (Fach,',
    '  Jahrgangsstufe, Tags, Kurzbeschreibung, Lizenz).',
    '- Ein Unterrichtsvorhaben-Ordner mit Plan-, Journal- und Materialdateien.',
    '',
    '## Lesereihenfolge',
    '1. `manifest.md` fuer Titel, Herkunft und Lizenz.',
    '2. `katalog.md` fuer eine kompakte thematische Einordnung.',
    '3. `CONTEXT.md` im Vorhaben-Ordner fuer den fachlichen Rahmen.',
    '4. Uebrige Dateien nach Bedarf.',
    '',
    '## Grenzen',
    '- Kein Fachprofil, keine Lerngruppendaten.',
    '- Keine personenbezogenen Sidecars.',
    '- Keine automatisierte Moodle-Befuellung: dieses Paket ist reines',
    '  Lesematerial, kein Moodle-Import.',
    '',
  ].join('\n');
}

/**
 * Erstellt eine Vorschau oder (nach Bestaetigung) ein Materialpaket-ZIP
 * fuer genau ein Unterrichtsvorhaben.
 *
 * @param {object} fields
 * @param {string} fields.schuljahr
 * @param {string} fields.klasseOderLerngruppe
 * @param {string} fields.unterrichtsordner
 * @param {string} fields.unterrichtsvorhaben
 * @param {string} [fields.outputPath] absoluter Zielpfad der ZIP-Datei (nur bei confirmed noetig)
 * @param {string} [fields.absender]
 * @param {string} [fields.schule]
 * @param {object} [options]
 * @param {boolean} [options.confirmed] true = tatsaechlich schreiben
 * @param {string} [options.contextRoot]
 * @param {Function} [options.readWorkspaceSetting]
 * @param {object} [options.workspaceConfigOptions]
 * @returns {{ok: true, status: 'preview'|'exported', ...}|{ok: false, message: string}}
 */
function erstelleMaterialpaket(fields = {}, options = {}) {
  try {
    const { schuljahr, klasseOderLerngruppe, unterrichtsordner, unterrichtsvorhaben } = fields;
    const relativeContextFile = getUnterrichtsvorhabenContextFile(
      schuljahr,
      klasseOderLerngruppe,
      unterrichtsordner,
      unterrichtsvorhaben
    );
    const resolution = resolveLocalContextPath(relativeContextFile, options);
    const contextFilePath = resolution.absolutePath;
    const vorhabenDir = path.dirname(contextFilePath);

    if (!fs.existsSync(contextFilePath)) {
      return {
        ok: false,
        message: `Unterrichtsvorhaben nicht gefunden (CONTEXT.md fehlt): ${contextFilePath}`,
      };
    }

    let main;
    try {
      main = readFrontmatterFile(contextFilePath);
    } catch (error) {
      return { ok: false, message: `CONTEXT.md des Vorhabens ist nicht lesbar: ${error.message}` };
    }

    const { canExport, missingMetadata } = checkWeitergabeMetadata(main.data);
    const { included, excluded } = walkVorhabenTree(vorhabenDir);
    const vorhabenFolderName = path.basename(vorhabenDir);
    const herkunft = formatPortablePath(path.relative(resolution.contextRoot, vorhabenDir));

    const previewResult = {
      ok: true,
      status: 'preview',
      contextRoot: resolution.contextRoot,
      vorhabenPath: vorhabenDir,
      title: main.data.title,
      herkunft,
      included: included.map((relPath) => `${vorhabenFolderName}/${relPath}`),
      excluded,
      missingMetadata,
      canExport,
      teacherFacingText: [
        `Vorschau Materialpaket: ${main.data.title}`,
        `Herkunft: ${herkunft}`,
        `Enthaelt ${included.length} Datei(en), ${excluded.length} ausgeschlossen.`,
        excluded.length > 0
          ? `Ausgeschlossen: ${excluded.map((entry) => `${entry.path} (${entry.reason})`).join('; ')}`
          : 'Keine Datei ausgeschlossen.',
        canExport
          ? 'Export moeglich: manifest.md, katalog.md und AGENTS.md werden ergaenzt.'
          : `Export noch nicht moeglich: ${missingMetadata.join(' ')}`,
      ].join('\n'),
    };

    if (!options.confirmed) {
      return previewResult;
    }

    if (!canExport) {
      return { ok: false, message: `Materialpaket wurde nicht geschrieben: ${missingMetadata.join(' ')}` };
    }

    const outputPath = path.resolve(requireNonEmptyText(fields.outputPath, 'outputPath'));
    const created = new Date().toISOString().slice(0, 10);

    const manifestMarkdown = buildManifestMarkdown({
      title: main.data.title,
      vorhabenFolderName,
      herkunft,
      absender: fields.absender,
      schule: fields.schule,
      license: main.data.license,
      created,
      included,
    });
    const agentsMarkdown = buildAgentsMarkdown({ title: main.data.title });
    const katalogblattMarkdown = renderKatalogblatt(main);

    const entries = [
      { name: 'manifest.md', data: Buffer.from(manifestMarkdown, 'utf8') },
      { name: 'katalog.md', data: Buffer.from(katalogblattMarkdown, 'utf8') },
      { name: 'AGENTS.md', data: Buffer.from(agentsMarkdown, 'utf8') },
      ...included.map((relPath) => ({
        name: `${vorhabenFolderName}/${relPath}`,
        data: fs.readFileSync(path.join(vorhabenDir, relPath)),
      })),
    ];

    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    writeZipFile(entries, outputPath, { date: new Date(created) });

    return {
      ok: true,
      status: 'exported',
      archivePath: outputPath,
      contextRoot: resolution.contextRoot,
      vorhabenPath: vorhabenDir,
      title: main.data.title,
      herkunft,
      included: previewResult.included,
      excluded,
      teacherFacingText: `Materialpaket geschrieben: ${outputPath}`,
    };
  } catch (error) {
    return { ok: false, message: error.message };
  }
}

module.exports = {
  erstelleMaterialpaket,
};
