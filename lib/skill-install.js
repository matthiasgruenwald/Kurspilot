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
 *   <zielwurzel>/kurspilot-shared/SKILL.md
 *
 * Die Projekt-SKILL.md-Dateien verweisen relativ auf
 * `../../../skills/kurspilot-core.md` und `../../../SKILL.md` (Repo-Root,
 * drei Ebenen ueber .claude/skills/<skill>/). Im nutzerweiten Ziel gibt es
 * keinen Repo-Checkout - deshalb wird beim Kopieren der Pfad auf
 * `../kurspilot-shared/...` umgeschrieben und der Kern (`kurspilot-core.md`)
 * plus die Langfassung (`SKILL.md`) in `kurspilot-shared/` mitkopiert, damit
 * die Skills ohne Repo funktionieren (siehe Issue #66, Akzeptanzkriterium 3).
 *
 * Idempotent und nicht-destruktiv: nur Dateien innerhalb der Kurspilot-eigenen
 * Unterordner (`kurspilot*`, `kurspilot-shared`) werden geschrieben/ersetzt.
 * Fremde Skills oder Dateien im selben Skills-Verzeichnis bleiben unberuehrt.
 */

const fs = require('node:fs');
const path = require('node:path');

const SKILL_NAMES = ['kurspilot', 'kurspilot-einrichten', 'kurspilot-planen', 'kurspilot-umsetzen'];
const SHARED_DIR_NAME = 'kurspilot-shared';

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

/**
 * Schreibt die SKILL.md-Adapter eines Anbieters (Codex oder Claude/Cowork)
 * in die nutzerweite Zielwurzel und passt dabei die relativen Pfadverweise
 * auf den mitkopierten `kurspilot-shared`-Ordner an.
 *
 * @param {string} sourceProviderRoot Repo-Pfad, z.B. .claude/skills
 * @param {string} targetRoot Nutzerweite Zielwurzel, z.B. ~/.claude/skills
 * @returns {{written: string[], unchanged: string[]}}
 */
function installSkillAdapters(sourceProviderRoot, targetRoot) {
  const written = [];
  const unchanged = [];

  for (const skillName of SKILL_NAMES) {
    const sourcePath = path.join(sourceProviderRoot, skillName, 'SKILL.md');
    const targetPath = path.join(targetRoot, skillName, 'SKILL.md');

    const rawContent = fs.readFileSync(sourcePath, 'utf8');
    const rewrittenContent = rawContent
      .replace(CORE_REFERENCE_PATTERN, `../${SHARED_DIR_NAME}/kurspilot-core.md`)
      .replace(LEGACY_SKILL_REFERENCE_PATTERN, `../${SHARED_DIR_NAME}/SKILL.md`);

    const didWrite = writeFileIfChanged(targetPath, rewrittenContent);
    (didWrite ? written : unchanged).push(targetPath);
  }

  return { written, unchanged };
}

/**
 * Kopiert den gemeinsamen Kurspilot-Kern und die historische Langfassung in
 * den `kurspilot-shared`-Ordner der nutzerweiten Zielwurzel.
 *
 * @param {string} repoRoot Repo-Wurzel (enthaelt skills/kurspilot-core.md, SKILL.md)
 * @param {string} targetRoot Nutzerweite Zielwurzel
 */
function installSharedCore(repoRoot, targetRoot) {
  const written = [];
  const unchanged = [];

  const sharedFiles = [
    { source: path.join(repoRoot, 'skills', 'kurspilot-core.md'), targetName: 'kurspilot-core.md' },
    { source: path.join(repoRoot, 'SKILL.md'), targetName: 'SKILL.md' },
  ];

  for (const { source, targetName } of sharedFiles) {
    const targetPath = path.join(targetRoot, SHARED_DIR_NAME, targetName);
    const content = fs.readFileSync(source, 'utf8');
    const didWrite = writeFileIfChanged(targetPath, content);
    (didWrite ? written : unchanged).push(targetPath);
  }

  return { written, unchanged };
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

  const adapterResult = installSkillAdapters(absoluteSourceProviderRoot, targetRoot);
  const sharedResult = installSharedCore(repoRoot, targetRoot);

  return {
    targetRoot,
    written: [...adapterResult.written, ...sharedResult.written],
    unchanged: [...adapterResult.unchanged, ...sharedResult.unchanged],
  };
}

module.exports = {
  SKILL_NAMES,
  SHARED_DIR_NAME,
  installKurspilotSkillsForProvider,
};
