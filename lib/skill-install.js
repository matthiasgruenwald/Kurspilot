'use strict';

/**
 * Installiert die Kurspilot-Skills nutzerweit fuer Codex und Claude/Cowork
 * (Issue #66, Parent #57: "Nutzerweite Kurspilot-Installation" aus
 * CONTEXT.md). Kopiert ausschliesslich die vier Kurspilot-Skill-Adapter
 * (`kurspilot`, `kurspilot-einrichten`, `kurspilot-planen`,
 * `kurspilot-umsetzen`) und den gemeinsamen Kern, statt die Skill-Inhalte
 * neu zu gestalten (karpathy-guidelines: kein Redesign in dieser Slice).
 *
 * Quelle im Repo:
 *   - Claude/Cowork-Adapter: .claude/skills/kurspilot-<name>/SKILL.md
 *   - Codex-Adapter:         .agents/skills/kurspilot-<name>/SKILL.md
 *   - Gemeinsamer Kern:      skills/kurspilot-core.md
 *   - Historische Langfassung: SKILL.md (Repo-Root)
 *
 * Ziel (nutzerweit), je Anbieter z.B. unter ~/.claude/skills/ bzw.
 * ~/.codex/skills/ (Annahme fuer Codex - siehe README, Issue #66):
 *   <zielwurzel>/kurspilot/SKILL.md
 *   <zielwurzel>/kurspilot-einrichten/SKILL.md
 *   <zielwurzel>/kurspilot-planen/SKILL.md
 *   <zielwurzel>/kurspilot-umsetzen/SKILL.md
 *   <zielwurzel>/kurspilot-shared/kurspilot-core.md
 *   <zielwurzel>/kurspilot-shared/legacy-kurspilot.md
 *
 * Die Projekt-SKILL.md-Dateien verweisen relativ auf
 * `../../../skills/kurspilot-core.md` und `../../../SKILL.md` (Repo-Root,
 * drei Ebenen ueber .claude/skills/<skill>/). Im nutzerweiten Ziel gibt es
 * keinen Repo-Checkout - deshalb wird beim Kopieren der Pfad auf
 * `../kurspilot-shared/...` umgeschrieben und der Kern (`kurspilot-core.md`)
 * plus die Langfassung (`legacy-kurspilot.md`) in `kurspilot-shared/`
 * mitkopiert, damit die Skills ohne Repo funktionieren (siehe Issue #66,
 * Akzeptanzkriterium 3). Die Langfassung heisst im Ziel bewusst nicht
 * `SKILL.md`, damit Codex sie nicht als zweiten sichtbaren Kurspilot-Skill
 * indexiert.
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
const LEGACY_SKILL_TARGET_NAME = 'legacy-kurspilot.md';
const MANAGED_SKILLS_MANIFEST_NAME = 'managed-skills.json';

const CORE_REFERENCE_PATTERN = /\.\.\/\.\.\/\.\.\/skills\/kurspilot-core\.md/g;
const LEGACY_SKILL_REFERENCE_PATTERN = /\.\.\/\.\.\/\.\.\/SKILL\.md/g;

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
 * Baut die SKILL.md-Adapter eines Anbieters (Codex oder Claude/Cowork)
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
    const rewrittenContent = rawContent
      .replace(CORE_REFERENCE_PATTERN, `../${SHARED_DIR_NAME}/kurspilot-core.md`)
      .replace(LEGACY_SKILL_REFERENCE_PATTERN, `../${SHARED_DIR_NAME}/${LEGACY_SKILL_TARGET_NAME}`);
    desiredFiles.push({ relativePath, targetPath, content: rewrittenContent });
  }

  return desiredFiles;
}

/**
 * Baut den gemeinsamen Kurspilot-Kern und die historische Langfassung fuer
 * den `kurspilot-shared`-Ordner der nutzerweiten Zielwurzel.
 *
 * @param {string} repoRoot Repo-Wurzel (enthaelt skills/kurspilot-core.md, SKILL.md)
 * @param {string} targetRoot Nutzerweite Zielwurzel
 * @returns {{relativePath: string, targetPath: string, content: string}[]}
 */
function buildSharedCoreFiles(repoRoot, targetRoot) {
  const desiredFiles = [];
  const sharedFiles = [
    { source: path.join(repoRoot, 'skills', 'kurspilot-core.md'), targetName: 'kurspilot-core.md' },
    { source: path.join(repoRoot, 'SKILL.md'), targetName: LEGACY_SKILL_TARGET_NAME },
  ];

  for (const { source, targetName } of sharedFiles) {
    const targetPath = path.join(targetRoot, SHARED_DIR_NAME, targetName);
    const relativePath = `${SHARED_DIR_NAME}/${targetName}`;
    const content = fs.readFileSync(source, 'utf8');
    desiredFiles.push({ relativePath, targetPath, content });
  }

  return desiredFiles;
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
  const conflicts = detectManagedSkillConflicts(targetRoot, desiredFiles);
  if (conflicts.length > 0) {
    return {
      targetRoot,
      written: [],
      unchanged: [],
      aborted: true,
      conflicts,
      warnings: conflicts.map(
        relativePath =>
          `Verwalteter Kurspilot-Skill lokal verändert: ${relativePath}. Installation abgebrochen. Eigene Änderungen dürfen nicht im verwalteten Systemskill bleiben; bitte der KI sagen, dass sie daraus einen Skill mit neuem Namen anlegt. Danach kann Kurspilot wieder aktualisiert werden.`
      ),
    };
  }

  const fileResult = writeDesiredFiles(desiredFiles);
  const removedObsoleteFiles = removeObsoleteIndexedLegacySkill(targetRoot);
  const manifestResult = writeManagedSkillsManifest(targetRoot, desiredFiles);

  return {
    targetRoot,
    aborted: false,
    conflicts: [],
    warnings: [],
    written: [
      ...fileResult.written,
      ...removedObsoleteFiles,
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
    if (fs.existsSync(dirPath)) {
      fs.rmSync(dirPath, { recursive: true, force: true });
      removed.push(dirPath);
    }
  }

  return { removed };
}

module.exports = {
  SKILL_NAMES,
  SHARED_DIR_NAME,
  LEGACY_SKILL_TARGET_NAME,
  MANAGED_SKILLS_MANIFEST_NAME,
  installKurspilotSkillsForProvider,
  removeKurspilotSkillsForProvider,
};
