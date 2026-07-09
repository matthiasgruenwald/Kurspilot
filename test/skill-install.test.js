'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const {
  installKurspilotSkillsForProvider,
  removeKurspilotSkillsForProvider,
  cleanLegacyCodexSkills,
  SKILL_NAMES,
} = require('../lib/skill-install');

const REPO_ROOT = path.join(__dirname, '..');
const INSTALL_CLI = path.join(__dirname, '..', 'scripts', 'install-skills.js');

function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'kurspilot-skill-install-test-'));
}

function makeSkillPackage() {
  const repoRoot = makeTmpDir();
  const providerRoot = path.join(repoRoot, '.claude', 'skills');

  for (const skillName of SKILL_NAMES) {
    const skillDir = path.join(providerRoot, skillName);
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(
      path.join(skillDir, 'SKILL.md'),
      `---\nname: ${skillName}\n---\nCore ../../../skills/kurspilot-core.md\n`
    );
  }

  fs.mkdirSync(path.join(repoRoot, 'skills'), { recursive: true });
  fs.writeFileSync(path.join(repoRoot, 'skills', 'kurspilot-core.md'), 'Core v1\n');

  return { repoRoot, providerRoot };
}

// --- installKurspilotSkillsForProvider (lib) --------------------------------

test('installKurspilotSkillsForProvider legt alle vier Adapter + geteilten Kern in leerem Zielordner an', () => {
  const targetRoot = path.join(makeTmpDir(), '.claude', 'skills');

  const result = installKurspilotSkillsForProvider(REPO_ROOT, '.claude/skills', targetRoot);

  for (const skillName of SKILL_NAMES) {
    const skillFile = path.join(targetRoot, skillName, 'SKILL.md');
    assert.ok(fs.existsSync(skillFile), `${skillFile} sollte existieren`);
  }
  assert.ok(fs.existsSync(path.join(targetRoot, 'kurspilot-shared', 'kurspilot-core.md')));
  assert.ok(!fs.existsSync(path.join(targetRoot, 'kurspilot-shared', 'SKILL.md')));
  assert.ok(result.written.length > 0);
  assert.strictEqual(result.unchanged.length, 0);
});

test('installKurspilotSkillsForProvider speichert Metadaten fuer verwaltete Kurspilot-Dateien', () => {
  const targetRoot = path.join(makeTmpDir(), '.claude', 'skills');

  installKurspilotSkillsForProvider(REPO_ROOT, '.claude/skills', targetRoot);

  const manifestPath = path.join(targetRoot, 'kurspilot-shared', 'managed-skills.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

  assert.strictEqual(manifest.managedBy, 'kurspilot');
  assert.ok(manifest.files['kurspilot/SKILL.md'].sha256);
  assert.ok(manifest.files['kurspilot-shared/kurspilot-core.md'].sha256);
});

test('installKurspilotSkillsForProvider aktualisiert unveraenderte verwaltete Kurspilot-Skills aus dem Paket', () => {
  const { repoRoot, providerRoot } = makeSkillPackage();
  const targetRoot = path.join(makeTmpDir(), '.claude', 'skills');

  installKurspilotSkillsForProvider(repoRoot, providerRoot, targetRoot);
  fs.writeFileSync(path.join(providerRoot, 'kurspilot', 'SKILL.md'), '---\nname: kurspilot\n---\nPaket v2\n');

  const result = installKurspilotSkillsForProvider(repoRoot, providerRoot, targetRoot);

  assert.strictEqual(
    fs.readFileSync(path.join(targetRoot, 'kurspilot', 'SKILL.md'), 'utf8'),
    '---\nname: kurspilot\n---\nPaket v2\n'
  );
  assert.ok(result.written.includes(path.join(targetRoot, 'kurspilot', 'SKILL.md')));
});

test('installKurspilotSkillsForProvider warnt und bricht bei lokal veraenderten verwalteten Skills ab', () => {
  const { repoRoot, providerRoot } = makeSkillPackage();
  const targetRoot = path.join(makeTmpDir(), '.claude', 'skills');
  const targetSkill = path.join(targetRoot, 'kurspilot', 'SKILL.md');

  installKurspilotSkillsForProvider(repoRoot, providerRoot, targetRoot);
  fs.writeFileSync(targetSkill, 'Lokale Aenderung, nicht ueberschreiben\n');
  fs.writeFileSync(path.join(providerRoot, 'kurspilot', 'SKILL.md'), '---\nname: kurspilot\n---\nPaket v2\n');

  const result = installKurspilotSkillsForProvider(repoRoot, providerRoot, targetRoot);

  assert.strictEqual(result.aborted, true);
  assert.deepStrictEqual(result.conflicts, ['kurspilot/SKILL.md']);
  assert.match(result.warnings[0], /lokal verändert/);
  assert.strictEqual(fs.readFileSync(targetSkill, 'utf8'), 'Lokale Aenderung, nicht ueberschreiben\n');
});

test('installKurspilotSkillsForProvider bricht bei vorhandenem abweichendem Skill ohne Manifest ab', () => {
  const { repoRoot, providerRoot } = makeSkillPackage();
  const targetRoot = path.join(makeTmpDir(), '.claude', 'skills');
  const targetSkill = path.join(targetRoot, 'kurspilot', 'SKILL.md');
  fs.mkdirSync(path.dirname(targetSkill), { recursive: true });
  fs.writeFileSync(targetSkill, 'Lokale Aenderung vor Manifest\n');

  const result = installKurspilotSkillsForProvider(repoRoot, providerRoot, targetRoot);

  assert.strictEqual(result.aborted, true);
  assert.deepStrictEqual(result.conflicts, ['kurspilot/SKILL.md']);
  assert.match(result.warnings[0], /lokal verändert/);
  assert.strictEqual(fs.readFileSync(targetSkill, 'utf8'), 'Lokale Aenderung vor Manifest\n');
});

test('installKurspilotSkillsForProvider schreibt Manifest nach, wenn vorhandener Skill ohne Manifest identisch ist', () => {
  const { repoRoot, providerRoot } = makeSkillPackage();
  const targetRoot = path.join(makeTmpDir(), '.claude', 'skills');

  installKurspilotSkillsForProvider(repoRoot, providerRoot, targetRoot);
  fs.rmSync(path.join(targetRoot, 'kurspilot-shared', 'managed-skills.json'));

  const result = installKurspilotSkillsForProvider(repoRoot, providerRoot, targetRoot);

  assert.strictEqual(result.aborted, false);
  assert.ok(fs.existsSync(path.join(targetRoot, 'kurspilot-shared', 'managed-skills.json')));
});

test('installierte SKILL.md verweist auf mitkopierten kurspilot-shared-Ordner statt auf Repo-relative Pfade', () => {
  const targetRoot = path.join(makeTmpDir(), '.claude', 'skills');

  installKurspilotSkillsForProvider(REPO_ROOT, '.claude/skills', targetRoot);

  const installedSkill = fs.readFileSync(path.join(targetRoot, 'kurspilot', 'SKILL.md'), 'utf8');
  assert.match(installedSkill, /\.\.\/kurspilot-shared\/kurspilot-core\.md/);
  assert.ok(!installedSkill.includes('../../../skills/kurspilot-core.md'));
});

test('installKurspilotSkillsForProvider entfernt obsolete indexierbare Shared-SKILL.md', () => {
  const targetRoot = path.join(makeTmpDir(), '.claude', 'skills');
  const obsoleteSkill = path.join(targetRoot, 'kurspilot-shared', 'SKILL.md');
  fs.mkdirSync(path.dirname(obsoleteSkill), { recursive: true });
  fs.writeFileSync(obsoleteSkill, '---\nname: kurspilot\n---\nAlt');

  installKurspilotSkillsForProvider(REPO_ROOT, '.claude/skills', targetRoot);

  assert.ok(!fs.existsSync(obsoleteSkill));
  assert.ok(fs.existsSync(path.join(targetRoot, 'kurspilot-shared', 'kurspilot-core.md')));
});

test('installKurspilotSkillsForProvider laesst fremde und separat benannte eigene Skills unberuehrt', () => {
  const targetRoot = path.join(makeTmpDir(), '.claude', 'skills');
  fs.mkdirSync(path.join(targetRoot, 'fremder-skill'), { recursive: true });
  fs.writeFileSync(path.join(targetRoot, 'fremder-skill', 'SKILL.md'), '---\nname: fremder-skill\n---\nFremder Inhalt');
  fs.mkdirSync(path.join(targetRoot, 'kurspilot-mein-eigener-skill'), { recursive: true });
  fs.writeFileSync(
    path.join(targetRoot, 'kurspilot-mein-eigener-skill', 'SKILL.md'),
    'Mein eigener Kurspilot-Skill'
  );

  installKurspilotSkillsForProvider(REPO_ROOT, '.claude/skills', targetRoot);

  const foreignContent = fs.readFileSync(path.join(targetRoot, 'fremder-skill', 'SKILL.md'), 'utf8');
  assert.strictEqual(foreignContent, '---\nname: fremder-skill\n---\nFremder Inhalt');
  const ownContent = fs.readFileSync(path.join(targetRoot, 'kurspilot-mein-eigener-skill', 'SKILL.md'), 'utf8');
  assert.strictEqual(ownContent, 'Mein eigener Kurspilot-Skill');
});

test('installKurspilotSkillsForProvider ist idempotent: zweiter Lauf erzeugt keine Duplikate und gleichen Inhalt', () => {
  const targetRoot = path.join(makeTmpDir(), '.claude', 'skills');

  const firstResult = installKurspilotSkillsForProvider(REPO_ROOT, '.claude/skills', targetRoot);
  assert.ok(firstResult.written.length > 0);

  const contentsAfterFirst = {};
  for (const skillName of SKILL_NAMES) {
    contentsAfterFirst[skillName] = fs.readFileSync(path.join(targetRoot, skillName, 'SKILL.md'), 'utf8');
  }

  const secondResult = installKurspilotSkillsForProvider(REPO_ROOT, '.claude/skills', targetRoot);

  assert.strictEqual(secondResult.written.length, 0, 'zweiter Lauf sollte nichts mehr schreiben (Inhalt unveraendert)');
  assert.strictEqual(secondResult.unchanged.length, firstResult.written.length);

  for (const skillName of SKILL_NAMES) {
    const contentAfterSecond = fs.readFileSync(path.join(targetRoot, skillName, 'SKILL.md'), 'utf8');
    assert.strictEqual(contentAfterSecond, contentsAfterFirst[skillName], 'Inhalt darf sich durch erneuten Lauf nicht aendern');
  }
});

test('installKurspilotSkillsForProvider fuer Codex-Quelle (.agents/skills) installiert alle vier Adapter nach ~/.agents/skills', () => {
  const targetRoot = path.join(makeTmpDir(), '.agents', 'skills');

  installKurspilotSkillsForProvider(REPO_ROOT, '.agents/skills', targetRoot);

  for (const skillName of SKILL_NAMES) {
    assert.ok(fs.existsSync(path.join(targetRoot, skillName, 'SKILL.md')));
  }
  assert.ok(fs.existsSync(path.join(targetRoot, 'kurspilot-shared', 'kurspilot-core.md')));
});

// --- dynamische Shared-Dateiliste (Issue #157) ------------------------------

test('installKurspilotSkillsForProvider kopiert neue Datei im gemeinsamen Quellordner ohne Installer-Code-Aenderung', () => {
  const { repoRoot, providerRoot } = makeSkillPackage();
  fs.writeFileSync(path.join(repoRoot, 'skills', 'kurspilot-neu.md'), 'Neuer gemeinsamer Inhalt\n');
  const targetRoot = path.join(makeTmpDir(), '.claude', 'skills');

  const result = installKurspilotSkillsForProvider(repoRoot, providerRoot, targetRoot);

  const targetFile = path.join(targetRoot, 'kurspilot-shared', 'kurspilot-neu.md');
  assert.strictEqual(fs.readFileSync(targetFile, 'utf8'), 'Neuer gemeinsamer Inhalt\n');
  assert.ok(result.written.includes(targetFile));

  const manifest = JSON.parse(
    fs.readFileSync(path.join(targetRoot, 'kurspilot-shared', 'managed-skills.json'), 'utf8')
  );
  assert.ok(manifest.files['kurspilot-shared/kurspilot-neu.md'].sha256);
});

test('installKurspilotSkillsForProvider entfernt Ziel und Manifest-Eintrag fuer im Quellordner geloeschte Datei', () => {
  const { repoRoot, providerRoot } = makeSkillPackage();
  fs.writeFileSync(path.join(repoRoot, 'skills', 'kurspilot-temp.md'), 'Temp\n');
  const targetRoot = path.join(makeTmpDir(), '.claude', 'skills');

  installKurspilotSkillsForProvider(repoRoot, providerRoot, targetRoot);
  const targetFile = path.join(targetRoot, 'kurspilot-shared', 'kurspilot-temp.md');
  assert.ok(fs.existsSync(targetFile));

  fs.rmSync(path.join(repoRoot, 'skills', 'kurspilot-temp.md'));
  installKurspilotSkillsForProvider(repoRoot, providerRoot, targetRoot);

  assert.ok(!fs.existsSync(targetFile), 'verwaiste Zieldatei sollte entfernt sein');
  const manifest = JSON.parse(
    fs.readFileSync(path.join(targetRoot, 'kurspilot-shared', 'managed-skills.json'), 'utf8')
  );
  assert.ok(!manifest.files['kurspilot-shared/kurspilot-temp.md'], 'verwaister Manifest-Eintrag sollte fehlen');
});

test('installKurspilotSkillsForProvider bricht weiterhin ab, wenn eine dynamisch verteilte Shared-Datei lokal veraendert wurde', () => {
  const { repoRoot, providerRoot } = makeSkillPackage();
  fs.writeFileSync(path.join(repoRoot, 'skills', 'kurspilot-neu.md'), 'Original\n');
  const targetRoot = path.join(makeTmpDir(), '.claude', 'skills');

  installKurspilotSkillsForProvider(repoRoot, providerRoot, targetRoot);
  const targetFile = path.join(targetRoot, 'kurspilot-shared', 'kurspilot-neu.md');
  fs.writeFileSync(targetFile, 'Lokal veraendert\n');
  fs.writeFileSync(path.join(repoRoot, 'skills', 'kurspilot-neu.md'), 'Update aus Paket\n');

  const result = installKurspilotSkillsForProvider(repoRoot, providerRoot, targetRoot);

  assert.strictEqual(result.aborted, true);
  assert.ok(result.conflicts.includes('kurspilot-shared/kurspilot-neu.md'));
  assert.strictEqual(fs.readFileSync(targetFile, 'utf8'), 'Lokal veraendert\n');
});

test('installKurspilotSkillsForProvider bricht ab statt eine lokal veraenderte verwaiste Datei zu loeschen', () => {
  const { repoRoot, providerRoot } = makeSkillPackage();
  fs.writeFileSync(path.join(repoRoot, 'skills', 'kurspilot-temp.md'), 'Temp\n');
  const targetRoot = path.join(makeTmpDir(), '.claude', 'skills');

  installKurspilotSkillsForProvider(repoRoot, providerRoot, targetRoot);
  const targetFile = path.join(targetRoot, 'kurspilot-shared', 'kurspilot-temp.md');
  assert.ok(fs.existsSync(targetFile));

  fs.writeFileSync(targetFile, 'Lokal veraendert, sollte nicht geloescht werden\n');
  fs.rmSync(path.join(repoRoot, 'skills', 'kurspilot-temp.md'));

  const result = installKurspilotSkillsForProvider(repoRoot, providerRoot, targetRoot);

  assert.strictEqual(result.aborted, true);
  assert.ok(result.conflicts.includes('kurspilot-shared/kurspilot-temp.md'));
  assert.ok(fs.existsSync(targetFile), 'lokal veraenderte verwaiste Datei darf nicht geloescht werden');
  assert.strictEqual(fs.readFileSync(targetFile, 'utf8'), 'Lokal veraendert, sollte nicht geloescht werden\n');

  const manifest = JSON.parse(
    fs.readFileSync(path.join(targetRoot, 'kurspilot-shared', 'managed-skills.json'), 'utf8')
  );
  assert.ok(manifest.files['kurspilot-shared/kurspilot-temp.md'], 'Manifest-Eintrag bleibt bei Abbruch erhalten');
});

// --- removeKurspilotSkillsForProvider ---------------------------------------

test('removeKurspilotSkillsForProvider entfernt alle vier Adapter + kurspilot-shared, fremde Skills bleiben', () => {
  const targetRoot = path.join(makeTmpDir(), '.claude', 'skills');
  installKurspilotSkillsForProvider(REPO_ROOT, '.claude/skills', targetRoot);
  fs.mkdirSync(path.join(targetRoot, 'fremder-skill'), { recursive: true });
  fs.writeFileSync(path.join(targetRoot, 'fremder-skill', 'SKILL.md'), 'Fremder Inhalt');

  const result = removeKurspilotSkillsForProvider(targetRoot);

  for (const skillName of SKILL_NAMES) {
    assert.ok(!fs.existsSync(path.join(targetRoot, skillName)), `${skillName} sollte entfernt sein`);
  }
  assert.ok(!fs.existsSync(path.join(targetRoot, 'kurspilot-shared')));
  assert.ok(fs.existsSync(path.join(targetRoot, 'fremder-skill', 'SKILL.md')), 'fremder Skill muss erhalten bleiben');
  assert.ok(result.removed.length > 0);
});

test('removeKurspilotSkillsForProvider ist No-Op, wenn nichts installiert war', () => {
  const targetRoot = path.join(makeTmpDir(), '.claude', 'skills');

  const result = removeKurspilotSkillsForProvider(targetRoot);

  assert.deepStrictEqual(result.removed, []);
});

// --- CLI scripts/install-skills.js (temp-HOME via --home) -------------------

test('CLI install-skills.js installiert beide Anbieter in ein temporaeres --home-Verzeichnis', () => {
  const tmpHome = makeTmpDir();

  execFileSync('node', [INSTALL_CLI, '--home', tmpHome], { encoding: 'utf8' });

  for (const skillName of SKILL_NAMES) {
    assert.ok(fs.existsSync(path.join(tmpHome, '.claude', 'skills', skillName, 'SKILL.md')));
    assert.ok(fs.existsSync(path.join(tmpHome, '.agents', 'skills', skillName, 'SKILL.md')));
  }
  assert.ok(fs.existsSync(path.join(tmpHome, '.claude', 'skills', 'kurspilot-shared', 'kurspilot-core.md')));
  assert.ok(fs.existsSync(path.join(tmpHome, '.agents', 'skills', 'kurspilot-shared', 'kurspilot-core.md')));
});

test('CLI install-skills.js respektiert KURSPILOT_INSTALL_HOME env-Override', () => {
  const tmpHome = makeTmpDir();

  execFileSync('node', [INSTALL_CLI, '--client', 'claude'], {
    encoding: 'utf8',
    env: { ...process.env, KURSPILOT_INSTALL_HOME: tmpHome },
  });

  assert.ok(fs.existsSync(path.join(tmpHome, '.claude', 'skills', 'kurspilot', 'SKILL.md')));
  assert.ok(!fs.existsSync(path.join(tmpHome, '.codex', 'skills')));
});

test('CLI install-skills.js --client claude installiert nur Claude', () => {
  const tmpHome = makeTmpDir();

  execFileSync('node', [INSTALL_CLI, '--home', tmpHome, '--client', 'claude'], { encoding: 'utf8' });

  assert.ok(fs.existsSync(path.join(tmpHome, '.claude', 'skills', 'kurspilot', 'SKILL.md')));
  assert.ok(!fs.existsSync(path.join(tmpHome, '.codex', 'skills')));
});

test('CLI install-skills.js bewahrt fremde Dateien im Zielverzeichnis bei wiederholtem Lauf (kein destruktives Ueberschreiben)', () => {
  const tmpHome = makeTmpDir();
  const foreignSkillDir = path.join(tmpHome, '.claude', 'skills', 'mein-anderer-skill');
  fs.mkdirSync(foreignSkillDir, { recursive: true });
  fs.writeFileSync(path.join(foreignSkillDir, 'SKILL.md'), 'Mein eigener Skill, bitte nicht anfassen.');

  execFileSync('node', [INSTALL_CLI, '--home', tmpHome, '--client', 'claude'], { encoding: 'utf8' });
  execFileSync('node', [INSTALL_CLI, '--home', tmpHome, '--client', 'claude'], { encoding: 'utf8' });

  const foreignContent = fs.readFileSync(path.join(foreignSkillDir, 'SKILL.md'), 'utf8');
  assert.strictEqual(foreignContent, 'Mein eigener Skill, bitte nicht anfassen.');
});

// --- cleanLegacyCodexSkills (Alt-Ort ~/.codex/skills aufräumen) -------------

test('cleanLegacyCodexSkills entfernt unveraenderte Kurspilot-Ordner am Alt-Ort', () => {
  const { repoRoot, providerRoot } = makeSkillPackage();
  const legacyRoot = path.join(makeTmpDir(), '.codex', 'skills');

  installKurspilotSkillsForProvider(repoRoot, providerRoot, legacyRoot);
  assert.ok(fs.existsSync(path.join(legacyRoot, 'kurspilot', 'SKILL.md')));

  const result = cleanLegacyCodexSkills(legacyRoot);

  assert.ok(result.removed.length > 0);
  assert.deepStrictEqual(result.conflicts, []);
  for (const skillName of SKILL_NAMES) {
    assert.ok(!fs.existsSync(path.join(legacyRoot, skillName)), `${skillName} sollte entfernt sein`);
  }
  assert.ok(!fs.existsSync(path.join(legacyRoot, 'kurspilot-shared')));
});

test('cleanLegacyCodexSkills meldet Konflikt und loescht NICHT bei lokal veraendertem Alt-Ort-Skill', () => {
  const { repoRoot, providerRoot } = makeSkillPackage();
  const legacyRoot = path.join(makeTmpDir(), '.codex', 'skills');

  installKurspilotSkillsForProvider(repoRoot, providerRoot, legacyRoot);
  const modifiedFile = path.join(legacyRoot, 'kurspilot', 'SKILL.md');
  fs.writeFileSync(modifiedFile, 'Lokale Änderung am Alt-Ort\n');

  const result = cleanLegacyCodexSkills(legacyRoot);

  assert.deepStrictEqual(result.removed, []);
  assert.ok(result.conflicts.includes('kurspilot/SKILL.md'));
  assert.ok(result.warnings.length > 0);
  assert.strictEqual(fs.readFileSync(modifiedFile, 'utf8'), 'Lokale Änderung am Alt-Ort\n');
});

test('cleanLegacyCodexSkills laesst fremde Ordner am Alt-Ort unangetastet', () => {
  const { repoRoot, providerRoot } = makeSkillPackage();
  const legacyRoot = path.join(makeTmpDir(), '.codex', 'skills');

  installKurspilotSkillsForProvider(repoRoot, providerRoot, legacyRoot);
  const foreignDir = path.join(legacyRoot, 'mein-fremder-skill');
  fs.mkdirSync(foreignDir, { recursive: true });
  fs.writeFileSync(path.join(foreignDir, 'SKILL.md'), 'Fremder Inhalt');

  cleanLegacyCodexSkills(legacyRoot);

  assert.ok(fs.existsSync(path.join(foreignDir, 'SKILL.md')), 'fremder Ordner muss erhalten bleiben');
});

test('cleanLegacyCodexSkills ist No-Op ohne Manifest am Alt-Ort', () => {
  const legacyRoot = path.join(makeTmpDir(), '.codex', 'skills');
  fs.mkdirSync(path.join(legacyRoot, 'kurspilot'), { recursive: true });
  fs.writeFileSync(path.join(legacyRoot, 'kurspilot', 'SKILL.md'), 'Kein Manifest');

  const result = cleanLegacyCodexSkills(legacyRoot);

  assert.deepStrictEqual(result.removed, []);
  assert.deepStrictEqual(result.conflicts, []);
  assert.ok(fs.existsSync(path.join(legacyRoot, 'kurspilot', 'SKILL.md')), 'ohne Manifest kein Löschen');
});

test('CLI install-skills.js räumt unveraenderte Kurspilot-Ordner am Alt-Ort (~/.codex/skills) auf', () => {
  const { repoRoot, providerRoot } = makeSkillPackage();
  const tmpHome = makeTmpDir();
  const legacyRoot = path.join(tmpHome, '.codex', 'skills');

  // Alte Installation simulieren
  installKurspilotSkillsForProvider(repoRoot, providerRoot, legacyRoot);
  assert.ok(fs.existsSync(path.join(legacyRoot, 'kurspilot', 'SKILL.md')));

  // Neue Installation via CLI (realer Repo-Root, aber selbes tmpHome)
  execFileSync('node', [INSTALL_CLI, '--home', tmpHome, '--client', 'codex'], { encoding: 'utf8' });

  // Kurspilot-Ordner am Alt-Ort müssen entfernt sein
  for (const skillName of SKILL_NAMES) {
    assert.ok(!fs.existsSync(path.join(legacyRoot, skillName)), `${skillName} am Alt-Ort sollte entfernt sein`);
  }
  assert.ok(!fs.existsSync(path.join(legacyRoot, 'kurspilot-shared')));
  // Neuer Ort hat die Skills
  assert.ok(fs.existsSync(path.join(tmpHome, '.agents', 'skills', 'kurspilot', 'SKILL.md')));
});

test('CLI install-skills.js meldet lokal veraenderte verwaltete Skills und bricht ab', () => {
  const tmpHome = makeTmpDir();
  const targetSkill = path.join(tmpHome, '.claude', 'skills', 'kurspilot', 'SKILL.md');

  execFileSync('node', [INSTALL_CLI, '--home', tmpHome, '--client', 'claude'], { encoding: 'utf8' });
  fs.writeFileSync(targetSkill, 'Lokale Aenderung\n');

  assert.throws(
    () => execFileSync('node', [INSTALL_CLI, '--home', tmpHome, '--client', 'claude'], { encoding: 'utf8' }),
    error => {
      assert.strictEqual(error.status, 1);
      assert.match(error.stderr.toString(), /lokal verändert/);
      return true;
    }
  );
  assert.strictEqual(fs.readFileSync(targetSkill, 'utf8'), 'Lokale Aenderung\n');
});
