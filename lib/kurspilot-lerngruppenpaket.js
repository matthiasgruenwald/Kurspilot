/**
 * kurspilot-lerngruppenpaket.js
 *
 * Lerngruppenexport: genau ein Lerngruppenordner fuer ein benanntes
 * Schuljahr als sichtbar `INTERN` gekennzeichnetes Weitergabepaket (siehe
 * docs/specs/0010, Abschnitt "Lerngruppe uebergeben"; docs/specs/0011,
 * Implementation Decisions; Issue #277 - Schwesterfeature zum
 * Materialpaket aus Issue #276).
 *
 * Anders als beim Materialpaket bleiben personenbezogene Sidecars und das
 * Lerngruppenprofil selbst (immer `kurspilot.personenbezug: true`, siehe
 * docs/adr/0003 und lib/local-context-setup.js#renderLerngruppenprofil) im
 * Paket: Das Paket ist ohnehin durchgehend als schulintern (`INTERN`)
 * gekennzeichnet, Personenbezug ist hier kein Ausschlussgrund. Ausgeschlossen
 * bleiben ausschliesslich Dateien mit `kurspilot.weitergabe:
 * nicht_weitergeben`. Vorjahre werden nie implizit mitgenommen: der Export
 * liest nur den Unterbaum von genau `<schuljahr>/<klasseOderLerngruppe>`.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const {
  getLerngruppenContextFile,
  getLerngruppenPath,
  resolveLocalContextPath,
} = require('./local-context-paths');
const { readFrontmatterFile, NOT_YET_PROVIDED } = require('./kurspilot-frontmatter');
const { writeZipFile } = require('./kurspilot-zip');
const { walkPaketTree } = require('./kurspilot-paket-tree');

const INTERN_MARKER = 'INTERN';

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

function valueOrNotYetProvided(value) {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  return trimmed || NOT_YET_PROVIDED;
}

/**
 * Entscheidet rein anhand des Frontmatters, ob eine Datei aus dem
 * Lerngruppenpaket ausgeschlossen bleibt. Anders als beim Materialpaket ist
 * Personenbezug allein kein Ausschlussgrund (siehe Moduldoku oben) -
 * ausschliesslich `kurspilot.weitergabe: nicht_weitergeben` schliesst eine
 * Datei aus.
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
  if (kurspilot.weitergabe === 'nicht_weitergeben') {
    return 'als nicht_weitergeben markiert';
  }
  return null;
}

/**
 * Prueft, ob das Lerngruppenprofil selbst eine Weitergabe (auch schulintern)
 * zulaesst. Ist es ausdruecklich als `nicht_weitergeben` markiert, wird kein
 * Paket geschrieben (docs/specs/0011: "Fehlt notwendige Weitergabe-Metadaten
 * ..., liefert die Vorschau eine konkrete Nachforderung und schreibt kein
 * Paket."). Zweck/Zustaendigkeit/Pruefzeitpunkt werden nicht erzwungen -
 * Kurspilot erfindet dafuer keine Werte (docs/specs/0010).
 *
 * @param {{kurspilot?: {weitergabe?: string}}} frontmatterData
 * @returns {{canExport: boolean, missingMetadata: string[]}}
 */
function checkWeitergabeMetadata(frontmatterData) {
  const weitergabe = frontmatterData.kurspilot && frontmatterData.kurspilot.weitergabe;

  if (weitergabe === 'nicht_weitergeben') {
    return {
      canExport: false,
      missingMetadata: [
        'Das Lerngruppenprofil ist als "nicht_weitergeben" markiert und kann nicht als Lerngruppenpaket exportiert werden.',
      ],
    };
  }

  return { canExport: true, missingMetadata: [] };
}

function buildManifestMarkdown({
  title,
  lerngruppenFolderName,
  herkunft,
  absender,
  schule,
  zweck,
  zustaendigkeit,
  pruefzeitpunkt,
  created,
  included,
}) {
  const lines = [
    `# Lerngruppenpaket (${INTERN_MARKER}): ${title}`,
    '',
    '## Paket-Einstieg',
    '- Modus: Lerngruppe',
    `- Kennzeichnung: ${INTERN_MARKER}`,
    '- Weitergabe: schulintern',
    `- Titel: ${title}`,
    `- Herkunft: ${herkunft}`,
    `- Absender: ${valueOrNotYetProvided(absender)}`,
    `- Schule: ${valueOrNotYetProvided(schule)}`,
    `- Erstellungsdatum: ${created}`,
    `- Zweck: ${valueOrNotYetProvided(zweck)}`,
    `- Zustaendigkeit: ${valueOrNotYetProvided(zustaendigkeit)}`,
    `- Pruefzeitpunkt: ${valueOrNotYetProvided(pruefzeitpunkt)}`,
    '',
    `Dieses Paket ist ${INTERN_MARKER} und ausschliesslich fuer die schulinterne`,
    'Weitergabe bestimmt. Es enthaelt genau den Lerngruppenordner eines',
    'benannten Schuljahres (Profil, Fachordner, Vorhaben und berechtigte',
    'personenbezogene Sidecars); fruehere Schuljahre sind keine implizite',
    'Beigabe. Als "nicht_weitergeben" markierte Dateien bleiben ausgeschlossen.',
    '',
    'Speicherort und Uebergabekanal sind nicht Teil dieses Formats: Die',
    'uebergebende Lehrkraft klaert vor der Weitergabe selbst den von Schule',
    'oder Traeger freigegebenen Speicherort und zulaessigen Uebergabekanal.',
    'Kurspilot prueft dies nicht automatisch und erzwingt keine Loeschfrist',
    'oder Freigabeliste.',
    '',
    '## Inhaltsverzeichnis',
    ...included.map((relPath) => `- ${lerngruppenFolderName}/${relPath}`),
    '',
  ];
  return lines.join('\n');
}

function buildAgentsMarkdown({ title }) {
  return [
    '# AGENTS.md',
    '',
    `Lerngruppenpaket "${title}" (${INTERN_MARKER}) - werkzeugunabhaengiges`,
    'schulinternes Weitergabepaket einer Lerngruppe fuer ein Schuljahr',
    '(Kurspilot, docs/specs/0010).',
    '',
    '## Aufbau',
    '- `manifest.md`: menschenlesbarer Paket-Einstieg (dieser Ordner).',
    '- Ein Lerngruppenordner mit Profil, Fachordnern, Unterrichtsvorhaben und',
    '  berechtigten personenbezogenen Sidecars.',
    '',
    '## Lesereihenfolge',
    '1. `manifest.md` fuer Titel, Zweck, Zustaendigkeit und Pruefzeitpunkt.',
    '2. `CONTEXT.md` im Lerngruppenordner fuer das Profil.',
    '3. Uebrige Dateien nach Bedarf.',
    '',
    '## Grenzen',
    `- ${INTERN_MARKER}: ausschliesslich fuer schulinterne Weitergabe bestimmt,`,
    '  enthaelt personenbezogene Daten.',
    '- Kein automatischer Import: Die empfangende Lehrkraft entpackt dieses',
    '  Paket zunaechst unveraendert als Eingangspaket und ueberfuehrt es erst',
    '  danach bewusst in ihre eigene Chronologie (datiertes Schuljahresarchiv).',
    '- Keine automatisierte Moodle-Befuellung: dieses Paket ist reines',
    '  Lesematerial, kein Moodle-Import.',
    '',
  ].join('\n');
}

/**
 * Erstellt eine Vorschau oder (nach Bestaetigung) ein Lerngruppenpaket-ZIP
 * fuer genau eine Lerngruppe in genau einem Schuljahr.
 *
 * @param {object} fields
 * @param {string} fields.schuljahr
 * @param {string} fields.klasseOderLerngruppe
 * @param {string} [fields.outputPath] absoluter Zielpfad der ZIP-Datei (nur bei confirmed noetig); Dateiname muss "INTERN" enthalten
 * @param {string} [fields.absender]
 * @param {string} [fields.schule]
 * @param {string} [fields.zweck]
 * @param {string} [fields.zustaendigkeit]
 * @param {string} [fields.pruefzeitpunkt]
 * @param {object} [options]
 * @param {boolean} [options.confirmed] true = tatsaechlich schreiben
 * @param {string} [options.contextRoot]
 * @param {Function} [options.readWorkspaceSetting]
 * @param {object} [options.workspaceConfigOptions]
 * @returns {{ok: true, status: 'preview'|'exported', ...}|{ok: false, message: string}}
 */
function erstelleLerngruppenpaket(fields = {}, options = {}) {
  try {
    const { schuljahr, klasseOderLerngruppe } = fields;
    const relativeContextFile = getLerngruppenContextFile(schuljahr, klasseOderLerngruppe);
    const resolution = resolveLocalContextPath(relativeContextFile, options);
    const contextFilePath = resolution.absolutePath;
    const lerngruppenDir = path.dirname(contextFilePath);

    if (!fs.existsSync(contextFilePath)) {
      return {
        ok: false,
        message: `Lerngruppenprofil nicht gefunden (CONTEXT.md fehlt): ${contextFilePath}`,
      };
    }

    let main;
    try {
      main = readFrontmatterFile(contextFilePath);
    } catch (error) {
      return { ok: false, message: `CONTEXT.md des Lerngruppenprofils ist nicht lesbar: ${error.message}` };
    }

    const { canExport, missingMetadata } = checkWeitergabeMetadata(main.data);
    const { included, excluded } = walkPaketTree(lerngruppenDir, evaluateExclusionReason);
    const lerngruppenFolderName = formatPortablePath(getLerngruppenPath(schuljahr, klasseOderLerngruppe));
    const herkunft = formatPortablePath(path.relative(resolution.contextRoot, lerngruppenDir));

    const previewResult = {
      ok: true,
      status: 'preview',
      contextRoot: resolution.contextRoot,
      lerngruppenPath: lerngruppenDir,
      title: main.data.title,
      herkunft,
      included: included.map((relPath) => `${lerngruppenFolderName}/${relPath}`),
      excluded,
      missingMetadata,
      canExport,
      teacherFacingText: [
        `Vorschau Lerngruppenpaket (${INTERN_MARKER}): ${main.data.title}, Schuljahr ${schuljahr}`,
        `Herkunft: ${herkunft}`,
        `Enthaelt ${included.length} Datei(en), ${excluded.length} ausgeschlossen.`,
        excluded.length > 0
          ? `Ausgeschlossen: ${excluded.map((entry) => `${entry.path} (${entry.reason})`).join('; ')}`
          : 'Keine Datei ausgeschlossen.',
        canExport
          ? `Export moeglich: manifest.md und AGENTS.md werden ergaenzt, Archivname und Manifest tragen ${INTERN_MARKER}.`
          : `Export noch nicht moeglich: ${missingMetadata.join(' ')}`,
        `Achtung ${INTERN_MARKER}: Speicherort und Uebergabekanal muss die uebergebende Lehrkraft selbst mit ` +
          'der Schule/dem Traeger klaeren - Kurspilot prueft das nicht automatisch.',
      ].join('\n'),
    };

    if (!options.confirmed) {
      return previewResult;
    }

    if (!canExport) {
      return { ok: false, message: `Lerngruppenpaket wurde nicht geschrieben: ${missingMetadata.join(' ')}` };
    }

    const rawOutputPath = requireNonEmptyText(fields.outputPath, 'outputPath');
    if (!path.basename(rawOutputPath).toUpperCase().includes(INTERN_MARKER)) {
      return {
        ok: false,
        message: `Der Dateiname des Lerngruppenpakets muss "${INTERN_MARKER}" sichtbar enthalten (docs/specs/0010: Paketname und Manifest sind mit ${INTERN_MARKER} gekennzeichnet).`,
      };
    }
    const outputPath = path.resolve(rawOutputPath);
    const created = new Date().toISOString().slice(0, 10);

    const manifestMarkdown = buildManifestMarkdown({
      title: main.data.title,
      lerngruppenFolderName,
      herkunft,
      absender: fields.absender,
      schule: fields.schule,
      zweck: fields.zweck,
      zustaendigkeit: fields.zustaendigkeit,
      pruefzeitpunkt: fields.pruefzeitpunkt,
      created,
      included,
    });
    const agentsMarkdown = buildAgentsMarkdown({ title: main.data.title });

    const entries = [
      { name: 'manifest.md', data: Buffer.from(manifestMarkdown, 'utf8') },
      { name: 'AGENTS.md', data: Buffer.from(agentsMarkdown, 'utf8') },
      ...included.map((relPath) => ({
        name: `${lerngruppenFolderName}/${relPath}`,
        data: fs.readFileSync(path.join(lerngruppenDir, relPath)),
      })),
    ];

    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    writeZipFile(entries, outputPath, { date: new Date(created) });

    return {
      ok: true,
      status: 'exported',
      archivePath: outputPath,
      contextRoot: resolution.contextRoot,
      lerngruppenPath: lerngruppenDir,
      title: main.data.title,
      herkunft,
      included: previewResult.included,
      excluded,
      teacherFacingText: `Lerngruppenpaket (${INTERN_MARKER}) geschrieben: ${outputPath}`,
    };
  } catch (error) {
    return { ok: false, message: error.message };
  }
}

module.exports = {
  erstelleLerngruppenpaket,
};
