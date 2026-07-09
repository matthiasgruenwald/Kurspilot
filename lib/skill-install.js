'use strict';

/**
 * Installiert die Kurspilot-Skills nutzerweit fuer Codex und Claude
 * (Issue #66, Parent #57: "Nutzerweite Kurspilot-Installation" aus
 * CONTEXT.md). Kopiert ausschliesslich die vier Kurspilot-Skill-Adapter
 * (`kurspilot`, `kurspilot-einrichten`, `kurspilot-planen`,
 * `kurspilot-umsetzen`) und den gemeinsamen Kern samt Referenzdateien, statt
 * die Skill-Inhalte neu zu gestalten (karpathy-guidelines: kein Redesign in
 * dieser Slice).
 *
 * Quelle im Repo:
 *   - Claude-Adapter: .claude/skills/kurspilot-<name>/SKILL.md
 *   - Codex-Adapter:         .agents/skills/kurspilot-<name>/SKILL.md
 *   - Gemeinsamer Kern + thematische Referenzdateien: skills/*.md
 *
 * Ziel (nutzerweit), je Anbieter z.B. unter ~/.claude/skills/ bzw.
 * ~/.codex/skills/ (Annahme fuer Codex - siehe README, Issue #66):
 *   <zielwurzel>/kurspilot/SKILL.md
 *   <zielwurzel>/kurspilot-einrichten/SKILL.md
 *   <zielwurzel>/kurspilot-planen/SKILL.md
 *   <zielwurzel>/kurspilot-umsetzen/SKILL.md
 *   <zielwurzel>/kurspilot-shared/kurspilot-core.md
 *   <zielwurzel>/kurspilot-shared/<weitere skills/*.md-Dateien>
 *
 * Die Projekt-SKILL.md-Dateien verweisen relativ auf
 * `../../../skills/kurspilot-core.md` (drei Ebenen ueber
 * .claude/skills/<skill>/) und ggf. weitere `../../../skills/*.md`
 * Referenzdateien. Im nutzerweiten Ziel gibt es keinen Repo-Checkout -
 * deshalb wird beim Kopieren der Pfad auf `../kurspilot-shared/...`
 * umgeschrieben und der gesamte gemeinsame Quellordner (`skills/`)
 * mitkopiert, damit die Skills ohne Repo funktionieren (siehe Issue #66,
 * Akzeptanzkriterium 3, und Issue #157 fuer die dynamische Dateiliste).
 *
 * Idempotent und nicht-destruktiv: nur Dateien innerhalb der Kurspilot-eigenen
 * Unterordner (`kurspilot*`, `kurspilot-shared`) werden geschrieben/ersetzt.
 * Fremde Skills oder Dateien im selben Skills-Verzeichnis bleiben unberuehrt.
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const SKILL_NAMES = ['kurspilot', 'kurspilot-einrichten', 'kurspilot-planen', 'kurspilot-umsetzen'];
const SHARED_DIR_NAME = 'kurspilot-shared';
const MANAGED_SKILLS_MANIFEST_NAME = 'managed-skills.json';

/**
 * Matcht jeden Repo-relativen Verweis auf eine Datei im gemeinsamen
 * Quellordner (`skills/kurspilot-core.md`, `skills/mcp-tools.md`, ...), egal
 * welche der thematischen Referenzdateien es ist - kein Sonderfall pro Datei
 * noetig (Issue #157/#160).
 */
const SHARED_REFERENCE_PATTERN = /\.\.\/\.\.\/\.\.\/skills\/([\w.-]+\.md)/g;

/**
 * Kopiert eine Datei nur, wenn Zielinhalt abweicht oder fehlt - vermeidet
 * unnoetige mtime-Aenderungen bei wiederholten idempotenten Laeufen.
 */
function writeFileIfChanged(targetPath, content) {
  if (fs.existsSync(targetPath) && fs.readFileSync(targetPath, 'utf8') === content) {
    return false;
  }
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, content);
  return true;
}

function sha256(content) {
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}

function writeManagedSkillsManifest(targetRoot, managedFiles) {
  const files = {};

  for (const { relativePath, content } of managedFiles) {
    files[relativePath] = { sha256: sha256(content) };
  }

  const manifest = {
    managedBy: 'kurspilot',
    version: 1,
    files,
  };
  const manifestPath = path.join(targetRoot, SHARED_DIR_NAME, MANAGED_SKILLS_MANIFEST_NAME);
  const manifestContent = `${JSON.stringify(manifest, null, 2)}\n`;
  const didWrite = writeFileIfChanged(manifestPath, manifestContent);

  return { path: manifestPath, didWrite };
}

function readManagedSkillsManifest(targetRoot) {
  const manifestPath = path.join(targetRoot, SHARED_DIR_NAME, MANAGED_SKILLS_MANIFEST_NAME);
  try {
    return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * Skillname aus einem relativen Pfad wie "kurspilot-planen/SKILL.md" oder
 * "kurspilot-shared/kurspilot-core.md" ableiten (erstes Pfadsegment).
 */
function skillNameFromRelativePath(relativePath) {
  return relativePath.split('/')[0];
}

/**
 * Fertiger, copy-paste-faehiger Prompt fuer die KI bei einem
 * Skill-Konflikt (Issue #128, ADR 0008 "Updates und Skill-Konflikte"):
 * keine eigene 3-Wege-Merge-Logik im Code - das Zusammenfuehren delegiert
 * Kurspilot an die KI, die der Lehrkraft ohnehin zur Verfuegung steht.
 */
function buildSkillConflictPrompt(skillName) {
  return (
    `Vergleiche meine Version von ${skillName} mit dem Kurspilot-Update und ` +
    `führe meine Anpassungen in die neue Version zusammen, dann benenne sie um.`
  );
}

function detectManagedSkillConflicts(targetRoot, desiredFiles) {
  const manifest = readManagedSkillsManifest(targetRoot);
  if (!manifest || manifest.managedBy !== 'kurspilot' || !manifest.files) {
    return desiredFiles
      .filter(desiredFile =>
        fs.existsSync(desiredFile.targetPath) &&
        fs.readFileSync(desiredFile.targetPath, 'utf8') !== desiredFile.content
      )
      .map(desiredFile => desiredFile.relativePath);
  }

  const conflicts = [];
  for (const desiredFile of desiredFiles) {
    const managedFile = manifest.files[desiredFile.relativePath];
    if (!managedFile || !managedFile.sha256 || !fs.existsSync(desiredFile.targetPath)) {
      continue;
    }

    const currentContent = fs.readFileSync(desiredFile.targetPath, 'utf8');
    if (sha256(currentContent) !== managedFile.sha256 && currentContent !== desiredFile.content) {
      conflicts.push(desiredFile.relativePath);
    }
  }

  return conflicts;
}

/**
 * Prueft verwaiste verwaltete Dateien (im Manifest, aber nicht mehr in
 * desiredFiles) auf lokale Abweichung vom Manifest-Hash, bevor sie geloescht
 * werden (Issue #168, Nachtrag zu #157). Ohne diese Pruefung wuerde eine
 * lokal editierte, aber verwaiste Zieldatei kommentarlos geloescht statt wie
 * bei weiterhin gewuenschten Dateien einen Konflikt/Abbruch auszuloesen.
 */
function detectOrphanedFileConflicts(targetRoot, desiredFiles) {
  const manifest = readManagedSkillsManifest(targetRoot);
  if (!manifest || !manifest.files) {
    return [];
  }

  const desiredRelativePaths = new Set(desiredFiles.map(file => file.relativePath));
  const conflicts = [];

  for (const [relativePath, managedFile] of Object.entries(manifest.files)) {
    if (desiredRelativePaths.has(relativePath) || !managedFile || !managedFile.sha256) {
      continue;
    }
    const filePath = path.join(targetRoot, relativePath);
    if (!fs.existsSync(filePath)) {
      continue;
    }
    const currentContent = fs.readFileSync(filePath, 'utf8');
    if (sha256(currentContent) !== managedFile.sha256) {
      conflicts.push(relativePath);
    }
  }

  return conflicts;
}

function writeDesiredFiles(desiredFiles) {
  const written = [];
  const unchanged = [];

  for (const { targetPath, content } of desiredFiles) {
    const didWrite = writeFileIfChanged(targetPath, content);
    (didWrite ? written : unchanged).push(targetPath);
  }

  return { written, unchanged };
}

/**
 * Baut die SKILL.md-Adapter eines Anbieters (Codex oder Claude)
 * fuer die nutzerweite Zielwurzel und passt dabei die relativen Pfadverweise
 * auf den mitkopierten `kurspilot-shared`-Ordner an.
 *
 * @param {string} sourceProviderRoot Repo-Pfad, z.B. .claude/skills
 * @param {string} targetRoot Nutzerweite Zielwurzel, z.B. ~/.claude/skills
 * @returns {{relativePath: string, targetPath: string, content: string}[]}
 */
function buildSkillAdapterFiles(sourceProviderRoot, targetRoot) {
  const desiredFiles = [];

  for (const skillName of SKILL_NAMES) {
    const sourcePath = path.join(sourceProviderRoot, skillName, 'SKILL.md');
    const targetPath = path.join(targetRoot, skillName, 'SKILL.md');
    const relativePath = `${skillName}/SKILL.md`;

    const rawContent = fs.readFileSync(sourcePath, 'utf8');
    const rewrittenContent = rawContent.replace(
      SHARED_REFERENCE_PATTERN,
      (_match, fileName) => `../${SHARED_DIR_NAME}/${fileName}`
    );
    desiredFiles.push({ relativePath, targetPath, content: rewrittenContent });
  }

  return desiredFiles;
}

/**
 * Baut den gemeinsamen Kurspilot-Kern und die thematischen Referenzdateien
 * fuer den `kurspilot-shared`-Ordner der nutzerweiten Zielwurzel.
 *
 * Der gemeinsame Quellordner (`repoRoot/skills/`) wird dynamisch eingelesen
 * (Issue #157): jede `.md`-Datei dort landet automatisch im Ziel, ohne dass
 * diese Funktion angepasst werden muss - auch neue thematische
 * Referenzdateien aus der Aufspaltung der frueheren Langfassung (Issue #160).
 *
 * @param {string} repoRoot Repo-Wurzel (enthaelt skills/)
 * @param {string} targetRoot Nutzerweite Zielwurzel
 * @returns {{relativePath: string, targetPath: string, content: string}[]}
 */
function buildSharedCoreFiles(repoRoot, targetRoot) {
  const sharedSourceDir = path.join(repoRoot, 'skills');
  const sharedFileNames = fs.existsSync(sharedSourceDir)
    ? fs.readdirSync(sharedSourceDir).filter(name => name.endsWith('.md')).sort()
    : [];

  return sharedFileNames.map(fileName => ({
    relativePath: `${SHARED_DIR_NAME}/${fileName}`,
    targetPath: path.join(targetRoot, SHARED_DIR_NAME, fileName),
    content: fs.readFileSync(path.join(sharedSourceDir, fileName), 'utf8'),
  }));
}

/**
 * Entfernt Zieldateien + Manifest-Eintraege fuer verwaltete Dateien, die im
 * aktuellen Lauf nicht mehr Teil der gewuenschten Dateien sind (z.B. eine im
 * gemeinsamen Quellordner geloeschte Datei). Verhindert verwaiste Eintraege
 * im Manifest (Issue #157, Akzeptanzkriterium 2).
 *
 * Setzt voraus, dass lokal veraenderte verwaiste Dateien bereits vorab per
 * detectOrphanedFileConflicts() erkannt und der Aufrufer entsprechend
 * abgebrochen hat (Issue #168) - hier werden nur konfliktfreie Dateien
 * geloescht.
 */
function removeOrphanedManagedFiles(targetRoot, desiredFiles) {
  const manifest = readManagedSkillsManifest(targetRoot);
  if (!manifest || !manifest.files) {
    return [];
  }

  const desiredRelativePaths = new Set(desiredFiles.map(file => file.relativePath));
  const removed = [];

  for (const relativePath of Object.keys(manifest.files)) {
    if (desiredRelativePaths.has(relativePath)) {
      continue;
    }
    const filePath = path.join(targetRoot, relativePath);
    if (fs.existsSync(filePath)) {
      fs.rmSync(filePath);
      removed.push(filePath);
    }
  }

  return removed;
}

function removeObsoleteIndexedLegacySkill(targetRoot) {
  const obsoleteIndexedLegacyPath = path.join(targetRoot, SHARED_DIR_NAME, 'SKILL.md');
  if (fs.existsSync(obsoleteIndexedLegacyPath)) {
    fs.rmSync(obsoleteIndexedLegacyPath);
    return [obsoleteIndexedLegacyPath];
  }
  return [];
}

/**
 * Installiert das komplette Kurspilot-Skillpaket (vier Adapter + geteilter
 * Kern) fuer einen Anbieter in dessen nutzerweite Skill-Zielwurzel.
 *
 * @param {string} repoRoot Repo-Wurzel
 * @param {string} sourceProviderRoot Repo-relativer Adapter-Ordner (z.B. '.claude/skills')
 * @param {string} targetRoot Nutzerweite Zielwurzel (z.B. ~/.claude/skills)
 */
function installKurspilotSkillsForProvider(repoRoot, sourceProviderRoot, targetRoot) {
  const absoluteSourceProviderRoot = path.isAbsolute(sourceProviderRoot)
    ? sourceProviderRoot
    : path.join(repoRoot, sourceProviderRoot);

  const desiredFiles = [
    ...buildSkillAdapterFiles(absoluteSourceProviderRoot, targetRoot),
    ...buildSharedCoreFiles(repoRoot, targetRoot),
  ];
  const conflicts = [
    ...detectManagedSkillConflicts(targetRoot, desiredFiles),
    ...detectOrphanedFileConflicts(targetRoot, desiredFiles),
  ];
  if (conflicts.length > 0) {
    const conflictSkillNames = [...new Set(conflicts.map(skillNameFromRelativePath))];
    return {
      targetRoot,
      written: [],
      unchanged: [],
      aborted: true,
      conflicts,
      conflictSkillNames,
      conflictPrompts: conflictSkillNames.map(skillName => ({
        skillName,
        prompt: buildSkillConflictPrompt(skillName),
      })),
      warnings: conflicts.map(
        relativePath =>
          `Verwalteter Kurspilot-Skill lokal verändert: ${relativePath}. Installation abgebrochen. Eigene Änderungen dürfen nicht im verwalteten Systemskill bleiben; bitte der KI sagen, dass sie daraus einen Skill mit neuem Namen anlegt. Danach kann Kurspilot wieder aktualisiert werden.`
      ),
    };
  }

  // Alias→Kopie-Migration (Issue #164): Symlinks entfernen, bevor echte Dateien
  // geschrieben werden. Muss vor removeOrphanedManagedFiles stehen, damit das
  // Manifest danach aus dem echten Dateisystem gelesen werden kann.
  const removedAliases = removeAliasLinksInTarget(targetRoot);

  const orphanedFiles = removeOrphanedManagedFiles(targetRoot, desiredFiles);
  const fileResult = writeDesiredFiles(desiredFiles);
  const removedObsoleteFiles = removeObsoleteIndexedLegacySkill(targetRoot);
  const manifestResult = writeManagedSkillsManifest(targetRoot, desiredFiles);

  return {
    targetRoot,
    aborted: false,
    conflicts: [],
    conflictSkillNames: [],
    conflictPrompts: [],
    warnings: [],
    written: [
      ...fileResult.written,
      ...removedObsoleteFiles,
      ...orphanedFiles,
      ...removedAliases,
      ...(manifestResult.didWrite ? [manifestResult.path] : []),
    ],
    unchanged: [
      ...fileResult.unchanged,
      ...(manifestResult.didWrite ? [] : [manifestResult.path]),
    ],
  };
}

/**
 * Entfernt die vier Kurspilot-Skill-Adapter und den `kurspilot-shared`-Ordner
 * wieder aus der nutzerweiten Zielwurzel. Fremde Skills im selben Verzeichnis
 * bleiben unberuehrt. Fuer den Uninstall-Flow (lib/uninstall-flow.js).
 *
 * @param {string} targetRoot Nutzerweite Zielwurzel (z.B. ~/.claude/skills)
 * @returns {{removed: string[]}}
 */
function removeKurspilotSkillsForProvider(targetRoot) {
  const removed = [];

  for (const dirName of [...SKILL_NAMES, SHARED_DIR_NAME]) {
    const dirPath = path.join(targetRoot, dirName);
    // ponytail: lstatSync statt existsSync – erkennt auch gebrochene Symlinks
    // (existsSync folgt dem Link und gibt false zurueck, wenn Ziel fehlt)
    try { fs.lstatSync(dirPath); } catch { continue; }
    fs.rmSync(dirPath, { recursive: true, force: true });
    removed.push(dirPath);
  }

  return { removed };
}

/**
 * Prueft am Alt-Ort (~/.codex/skills), ob Kurspilot-Ordner unverändert sind
 * (Hash-Vergleich per Manifest), und löscht sie wenn ja. Veränderte Ordner
 * werden als Konflikte gemeldet (kein Delete). Fremde Ordner bleiben
 * unangetastet. Kein Manifest = kein Delete (konservativ).
 *
 * @param {string} legacyRoot ~/.codex/skills
 * @returns {{ removed: string[], conflicts: string[], conflictSkillNames: string[], conflictPrompts: object[], warnings: string[] }}
 */
function cleanLegacyCodexSkills(legacyRoot) {
  const manifest = readManagedSkillsManifest(legacyRoot);

  // ponytail: kein Manifest = kann nicht verifizieren, kein Löschen
  if (!manifest || !manifest.files) {
    return { removed: [], conflicts: [], conflictSkillNames: [], conflictPrompts: [], warnings: [] };
  }

  const modifiedFiles = [];
  for (const [relativePath, managedFile] of Object.entries(manifest.files)) {
    const filePath = path.join(legacyRoot, relativePath);
    if (!fs.existsSync(filePath) || !managedFile || !managedFile.sha256) {
      continue;
    }
    const currentHash = sha256(fs.readFileSync(filePath, 'utf8'));
    if (currentHash !== managedFile.sha256) {
      modifiedFiles.push(relativePath);
    }
  }

  if (modifiedFiles.length > 0) {
    const conflictSkillNames = [...new Set(modifiedFiles.map(skillNameFromRelativePath))];
    return {
      removed: [],
      conflicts: modifiedFiles,
      conflictSkillNames,
      conflictPrompts: conflictSkillNames.map(skillName => ({
        skillName,
        prompt: buildSkillConflictPrompt(skillName),
      })),
      warnings: modifiedFiles.map(
        relativePath =>
          `Alt-Ort: Verwalteter Kurspilot-Skill lokal verändert: ${relativePath}. Bitte Änderungen sichern und danach manuell löschen (${path.join(legacyRoot, relativePath)}).`
      ),
    };
  }

  const removed = [];
  for (const dirName of [...SKILL_NAMES, SHARED_DIR_NAME]) {
    const dirPath = path.join(legacyRoot, dirName);
    if (fs.existsSync(dirPath)) {
      fs.rmSync(dirPath, { recursive: true, force: true });
      removed.push(dirPath);
    }
  }

  return { removed, conflicts: [], conflictSkillNames: [], conflictPrompts: [], warnings: [] };
}

// ---------- Moduswechsel-Migration (Issue #164) -----------------------------

/**
 * Klassifiziert einen echten Ordner (kein Alias) in claudeRoot: Sind alle
 * dort verwalteten Kurspilot-Dateien laut Manifest unveraendert?
 *
 * @returns {'unmodified'|'modified'|'no-manifest'}
 */
function classifyRealDir(claudeRoot, dirName) {
  const manifest = readManagedSkillsManifest(claudeRoot);
  if (!manifest || !manifest.files) return 'no-manifest';

  const prefix = `${dirName}/`;
  const entries = Object.entries(manifest.files).filter(([rel]) => rel.startsWith(prefix));
  if (entries.length === 0) return 'no-manifest';

  for (const [relativePath, entry] of entries) {
    if (!entry || !entry.sha256) return 'no-manifest';
    const filePath = path.join(claudeRoot, relativePath);
    if (!fs.existsSync(filePath)) continue; // fehlende Datei gilt nicht als modifiziert
    if (sha256(fs.readFileSync(filePath, 'utf8')) !== entry.sha256) return 'modified';
  }
  return 'unmodified';
}

/**
 * Entfernt Alias-Links (Symlinks/Junctions) fuer Kurspilot-Ordner in
 * targetRoot. Echte Verzeichnisse und fehlende Pfade bleiben unberuehrt.
 * Aufruf vor dem Schreiben echter Kopien (Alias→Kopie-Migration).
 *
 * @returns {string[]} Pfade der entfernten Links
 */
function removeAliasLinksInTarget(targetRoot) {
  const removed = [];
  for (const dirName of ALIAS_DIRS) {
    const dirPath = path.join(targetRoot, dirName);
    let stat;
    try { stat = fs.lstatSync(dirPath); } catch { continue; }
    let isLink = stat.isSymbolicLink();
    if (!isLink) {
      // Windows-Junction: readlinkSync gelingt, auch wenn !isSymbolicLink()
      try { fs.readlinkSync(dirPath); isLink = true; } catch { /* echter Ordner */ }
    }
    if (isLink) {
      fs.rmSync(dirPath, { recursive: true, force: true });
      removed.push(dirPath);
    }
  }
  return removed;
}

// ---------- Alias-Modus (Issue #163) ----------------------------------------

/**
 * Alle Verzeichnisse, fuer die im Claude-Skill-Ordner ein Alias angelegt wird.
 */
const ALIAS_DIRS = [...SKILL_NAMES, SHARED_DIR_NAME];

/**
 * Prueft ob linkPath ein gueltiger Alias (Symlink oder Junction) auf
 * canonicalPath ist.
 *
 * @returns {'ok'|'wrong-target'|'not-a-link'|'missing'}
 */
function checkAliasIntegrity(linkPath, canonicalPath) {
  let stat;
  try {
    stat = fs.lstatSync(linkPath); // folgt NICHT dem Symlink
  } catch {
    return 'missing';
  }

  let linkTarget;
  try {
    linkTarget = fs.readlinkSync(linkPath);
  } catch {
    // readlinkSync wirft bei echten Verzeichnissen/Dateien (kein Reparse-Point)
    return 'not-a-link';
  }

  if (stat.isSymbolicLink()) {
    // Unix-Symlink: direkter Vergleich
    return linkTarget === canonicalPath ? 'ok' : 'wrong-target';
  }

  // Windows-Junction: Pfad hat \??\ -Praefix
  const normalized = linkTarget.replace(/^\\\?\?\\/, '');
  return normalized === canonicalPath ? 'ok' : 'wrong-target';
}

/**
 * Standard-Link-Erzeuger: Symlink auf macOS/Linux, Directory Junction auf
 * Windows (ohne Adminrechte auf lokalem NTFS).
 * ponytail: injectable fuer Windows-Tests ohne echtes Windows-Dateisystem
 *
 * @param {string} canonicalPath Absoluter Pfad des Zielverzeichnisses (Quelle)
 * @param {string} linkPath      Absoluter Pfad des anzulegenden Links
 */
function defaultCreateLink(canonicalPath, linkPath) {
  if (process.platform === 'win32') {
    const { execFileSync } = require('node:child_process');
    execFileSync('cmd', ['/c', 'mklink', '/J', linkPath, canonicalPath]);
  } else {
    fs.symlinkSync(canonicalPath, linkPath, 'dir');
  }
}

/**
 * Installiert Kurspilot-Skills im Alias-Modus: legt je Kurspilot-Ordner
 * einen Alias (Symlink auf macOS/Linux, Junction auf Windows) im
 * Claude-Skill-Verzeichnis an, der auf die kanonische Ablage zeigt.
 *
 * Voraussetzung: Die kanonische Ablage (canonicalRoot, typischerweise
 * ~/.agents/skills/) ist bereits per installKurspilotSkillsForProvider
 * bespielt worden. Das Hash-Manifest bleibt ausschliesslich dort - kein
 * zweites Manifest im Claude-Verzeichnis (Issue #163, AC 2).
 *
 * Integritaetspruefung (Issue #163, AC 3): Findet der Installer einen echten
 * Ordner statt eines Alias, bricht er mit dem Konflikt-Flow ab.
 * Bei technischem Fehlschlag des Alias-Anlegens (Issue #163, AC 4) wird
 * ebenfalls abgebrochen und auf den Kopier-Modus als Ausweg hingewiesen.
 *
 * @param {string} canonicalRoot     Kanonische Skill-Ablage (z.B. ~/.agents/skills)
 * @param {string} claudeTargetRoot  Claude-Skill-Verzeichnis (z.B. ~/.claude/skills)
 * @param {{ createLink?: (canonicalPath: string, linkPath: string) => void }} options
 */
function installKurspilotSkillsAliasForClaude(
  canonicalRoot,
  claudeTargetRoot,
  { createLink = defaultCreateLink } = {}
) {
  const aliases = ALIAS_DIRS.map(dirName => ({
    dirName,
    canonicalPath: path.join(canonicalRoot, dirName),
    linkPath: path.join(claudeTargetRoot, dirName),
  }));

  // Kopie→Alias-Migration (Issue #164): echte Ordner klassifizieren.
  // Unveraenderte Kopien werden automatisch ersetzt; veraenderte loesen den
  // Konflikt-Flow aus.
  const conflictDirs = [];
  const dirsToMigrate = []; // unveraenderte Kopien → werden durch Alias ersetzt

  for (const { dirName, canonicalPath, linkPath } of aliases) {
    const status = checkAliasIntegrity(linkPath, canonicalPath);
    if (status === 'ok' || status === 'missing') continue;
    if (status === 'wrong-target') {
      conflictDirs.push(dirName);
      continue;
    }
    // 'not-a-link': echter Ordner – Inhalt pruefen (Issue #164)
    const cls = classifyRealDir(claudeTargetRoot, dirName);
    if (cls === 'unmodified') {
      dirsToMigrate.push(linkPath);
    } else {
      conflictDirs.push(dirName);
    }
  }

  if (conflictDirs.length > 0) {
    return {
      targetRoot: claudeTargetRoot,
      written: [],
      unchanged: [],
      aborted: true,
      aliasError: false,
      conflicts: conflictDirs,
      conflictSkillNames: conflictDirs,
      conflictPrompts: conflictDirs.map(skillName => ({
        skillName,
        prompt: buildSkillConflictPrompt(skillName),
      })),
      warnings: conflictDirs.map(
        dirName =>
          `Kurspilot-Alias durch echten Ordner ersetzt: ${dirName}. Installation abgebrochen. ` +
          `Eigene Änderungen sichern, Ordner entfernen (${path.join(claudeTargetRoot, dirName)}), ` +
          `dann erneut installieren.`
      ),
    };
  }

  // Unveraenderte Kopien entfernen, damit Aliase angelegt werden koennen
  for (const linkPath of dirsToMigrate) {
    fs.rmSync(linkPath, { recursive: true, force: true });
  }

  // Zielverzeichnis anlegen, fehlende Aliase setzen
  fs.mkdirSync(claudeTargetRoot, { recursive: true });
  const written = [];
  const unchanged = [];

  for (const { dirName, canonicalPath, linkPath } of aliases) {
    if (checkAliasIntegrity(linkPath, canonicalPath) === 'ok') {
      unchanged.push(linkPath);
      continue;
    }
    // Status 'missing' → anlegen
    try {
      createLink(canonicalPath, linkPath);
      written.push(linkPath);
    } catch (err) {
      return {
        targetRoot: claudeTargetRoot,
        written: [],
        unchanged: [],
        aborted: true,
        aliasError: true,
        conflicts: [],
        conflictSkillNames: [],
        conflictPrompts: [],
        warnings: [
          `Alias-Anlegen fehlgeschlagen für ${dirName}: ${err.message}. ` +
          `Führen Sie den Installer ohne --alias aus, um getrennte Kopien zu installieren.`,
        ],
      };
    }
  }

  return {
    targetRoot: claudeTargetRoot,
    aborted: false,
    aliasError: false,
    conflicts: [],
    conflictSkillNames: [],
    conflictPrompts: [],
    warnings: [],
    written,
    unchanged,
  };
}

module.exports = {
  SKILL_NAMES,
  SHARED_DIR_NAME,
  MANAGED_SKILLS_MANIFEST_NAME,
  installKurspilotSkillsForProvider,
  removeKurspilotSkillsForProvider,
  cleanLegacyCodexSkills,
  buildSkillConflictPrompt,
  // Alias-Modus (Issue #163)
  ALIAS_DIRS,
  checkAliasIntegrity,
  defaultCreateLink,
  installKurspilotSkillsAliasForClaude,
  // Moduswechsel-Migration (Issue #164)
  classifyRealDir,
  removeAliasLinksInTarget,
};
