'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  LOCAL_CONTEXT_ROOT,
  getLerngruppenPath,
  getLerngruppenContextFile,
  getFachprofilPath,
  getFachprofilContextFile,
  getUnterrichtsvorhabenPath,
  resolveKurspilotContextRoot,
  resolveKurspilotStartkontextFromWegweiser,
  setupKurspilotWegweiser,
  resolveLocalContextPath,
} = require('../lib/local-context-paths');

function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'local-context-paths-test-'));
}

test('LOCAL_CONTEXT_ROOT ist "local-context"', () => {
  assert.strictEqual(LOCAL_CONTEXT_ROOT, 'local-context');
});

test('getLerngruppenPath baut Pfad aus Schuljahr und Klasse', () => {
  const result = getLerngruppenPath('2025-26', '7a');
  assert.strictEqual(result, path.join('local-context', '2025-26', '7a'));
});

test('getLerngruppenContextFile haengt CONTEXT.md an den Lerngruppen-Pfad an', () => {
  const result = getLerngruppenContextFile('2025-26', '7a');
  assert.strictEqual(result, path.join('local-context', '2025-26', '7a', 'CONTEXT.md'));
});

test('Teilgruppen sind eigenstaendige Ordner direkt unter dem Schuljahr, nicht unter der Stammklasse', () => {
  const teilgruppe = getLerngruppenPath('2025-26', '7a-e-kurs-nawi');
  const stammklasse = getLerngruppenPath('2025-26', '7a');

  assert.strictEqual(teilgruppe, path.join('local-context', '2025-26', '7a-e-kurs-nawi'));
  // Teilgruppe liegt NICHT unterhalb der Stammklasse
  assert.ok(!teilgruppe.startsWith(stammklasse + path.sep));
});

test('getFachprofilPath haengt Unterrichtsordner an den Lerngruppen-Pfad an', () => {
  const result = getFachprofilPath('2025-26', '7a', 'naturwissenschaften');
  assert.strictEqual(
    result,
    path.join('local-context', '2025-26', '7a', 'naturwissenschaften')
  );
});

test('getFachprofilContextFile haengt CONTEXT.md an den Fachprofil-Pfad an', () => {
  const result = getFachprofilContextFile('2025-26', '7a', 'naturwissenschaften');
  assert.strictEqual(
    result,
    path.join('local-context', '2025-26', '7a', 'naturwissenschaften', 'CONTEXT.md')
  );
});

test('Fachprofil einer Teilgruppe liegt unter dem Teilgruppen-Ordner', () => {
  const result = getFachprofilContextFile('2025-26', '7a-e-kurs-nawi', 'naturwissenschaften');
  assert.strictEqual(
    result,
    path.join('local-context', '2025-26', '7a-e-kurs-nawi', 'naturwissenschaften', 'CONTEXT.md')
  );
});

test('Unterrichtsvorhaben liegt direkt unter dem Unterrichtsordner', () => {
  const result = getUnterrichtsvorhabenPath('2025-26', '7a', 'naturwissenschaften', 'photosynthese');
  assert.strictEqual(
    result,
    path.join('local-context', '2025-26', '7a', 'naturwissenschaften', 'photosynthese')
  );
  assert.ok(!result.includes(`${path.sep}vorhaben${path.sep}`));
});

test('Pflichtfelder duerfen nicht leer sein', () => {
  assert.throws(() => getLerngruppenPath('', '7a'), /Schuljahr/);
  assert.throws(() => getLerngruppenPath('2025-26', ''), /Klasse|Lerngruppe/);
  assert.throws(() => getFachprofilPath('2025-26', '7a', ''), /Unterrichtsordner|Fach/);
});

test('Pfadbestandteile duerfen keine Pfadtraversierung enthalten', () => {
  assert.throws(() => getLerngruppenPath('../etc', '7a'), /ungueltig/i);
  assert.throws(() => getLerngruppenPath('2025-26', '..'), /ungueltig/i);
  assert.throws(() => getLerngruppenPath('2025-26', '7a/../../etc'), /ungueltig/i);
  assert.throws(() => getFachprofilPath('2025-26', '7a', '../naturwissenschaften'), /ungueltig/i);
});

test('Pfadbestandteile duerfen keine Pfadtrenner enthalten', () => {
  assert.throws(() => getLerngruppenPath('2025-26', '7a/b'), /ungueltig/i);
  assert.throws(() => getLerngruppenPath('2025-26', '7a\\b'), /ungueltig/i);
});

test('resolveKurspilotContextRoot liest den Arbeitsbereich aus der Arbeitsbereich-Einstellung', () => {
  const configuredRoot = path.join('/tmp', 'Lehrkraft', 'Kurspilot');

  const result = resolveKurspilotContextRoot({
    readWorkspaceSetting: () => ({
      ok: true,
      status: 'configured',
      configPath: '/tmp/config.json',
      contextRoot: configuredRoot,
    }),
  });

  assert.strictEqual(result, configuredRoot);
});

test('resolveKurspilotContextRoot verweist bei fehlender Arbeitsbereich-Einstellung aufs Konfigurationsprogramm', () => {
  assert.throws(
    () => resolveKurspilotContextRoot({
      readWorkspaceSetting: () => ({
        ok: false,
        status: 'missing',
        message: 'Arbeitsbereich-Einstellung fehlt. Bitte das Kurspilot-Konfigurationsprogramm ausfuehren.',
      }),
    }),
    /Konfigurationsprogramm/
  );
});

test('resolveLocalContextPath kombiniert relativen local-context-Pfad mit dem konfigurierten Arbeitsbereich', () => {
  const configuredRoot = path.join('/tmp', 'Lehrkraft', 'Kurspilot');

  const result = resolveLocalContextPath(
    getFachprofilContextFile('2025-26', '7a', 'naturwissenschaften'),
    {
      readWorkspaceSetting: () => ({
        ok: true,
        status: 'configured',
        configPath: '/tmp/config.json',
        contextRoot: configuredRoot,
      }),
    }
  );

  assert.deepStrictEqual(result, {
    contextRoot: configuredRoot,
    relativePath: path.join('local-context', '2025-26', '7a', 'naturwissenschaften', 'CONTEXT.md'),
    absolutePath: path.join(
      configuredRoot,
      'local-context',
      '2025-26',
      '7a',
      'naturwissenschaften',
      'CONTEXT.md'
    ),
  });
});

test('resolveLocalContextPath lehnt Schreibziele ausserhalb von local-context ab', () => {
  const configuredRoot = makeTmpDir();

  assert.throws(
    () => resolveLocalContextPath('../Lehrkraftmaterial/plan.md', {
      contextRoot: configuredRoot,
    }),
    /local-context|Kurspilot-Arbeitsbereich/
  );
});

test('resolveKurspilotStartkontextFromWegweiser liest KURSPILOT.md im aktuellen Materialordner', () => {
  const baseDir = makeTmpDir();
  const workspaceRoot = path.join(baseDir, 'Kurspilot');
  const materialDir = path.join(baseDir, 'Material', 'Photosynthese');
  fs.mkdirSync(materialDir, { recursive: true });
  fs.writeFileSync(
    path.join(materialDir, 'KURSPILOT.md'),
    'Startkontext: local-context/2025-26/7a/naturwissenschaften/CONTEXT.md\n',
    'utf8'
  );

  const result = resolveKurspilotStartkontextFromWegweiser(materialDir, {
    readWorkspaceSetting: () => ({
      ok: true,
      status: 'configured',
      configPath: path.join(baseDir, 'config.json'),
      contextRoot: workspaceRoot,
    }),
  });

  assert.deepStrictEqual(result, {
    contextRoot: workspaceRoot,
    wegweiserPath: path.join(materialDir, 'KURSPILOT.md'),
    relativePath: path.join('local-context', '2025-26', '7a', 'naturwissenschaften', 'CONTEXT.md'),
    absolutePath: path.join(
      workspaceRoot,
      'local-context',
      '2025-26',
      '7a',
      'naturwissenschaften',
      'CONTEXT.md'
    ),
  });
});

test('resolveKurspilotStartkontextFromWegweiser findet den naechsten Eltern-Wegweiser', () => {
  const baseDir = makeTmpDir();
  const workspaceRoot = path.join(baseDir, 'Kurspilot');
  const parentMaterialDir = path.join(baseDir, 'Material', 'Nawi');
  const childMaterialDir = path.join(parentMaterialDir, 'Photosynthese', 'Bilder');
  fs.mkdirSync(childMaterialDir, { recursive: true });
  fs.writeFileSync(
    path.join(parentMaterialDir, 'KURSPILOT.md'),
    'Startkontext: local-context/2025-26/7a/naturwissenschaften/CONTEXT.md\n',
    'utf8'
  );

  const result = resolveKurspilotStartkontextFromWegweiser(childMaterialDir, {
    readWorkspaceSetting: () => ({
      ok: true,
      status: 'configured',
      configPath: path.join(baseDir, 'config.json'),
      contextRoot: workspaceRoot,
    }),
  });

  assert.strictEqual(result.wegweiserPath, path.join(parentMaterialDir, 'KURSPILOT.md'));
  assert.strictEqual(
    result.absolutePath,
    path.join(workspaceRoot, 'local-context', '2025-26', '7a', 'naturwissenschaften', 'CONTEXT.md')
  );
});

test('resolveKurspilotStartkontextFromWegweiser lehnt Ziele ausserhalb von local-context ab', () => {
  const baseDir = makeTmpDir();
  const materialDir = path.join(baseDir, 'Material');
  fs.mkdirSync(materialDir, { recursive: true });
  fs.writeFileSync(path.join(materialDir, 'KURSPILOT.md'), 'Startkontext: ../Privat/CONTEXT.md\n', 'utf8');

  assert.throws(
    () => resolveKurspilotStartkontextFromWegweiser(materialDir, {
      readWorkspaceSetting: () => ({
        ok: true,
        status: 'configured',
        configPath: path.join(baseDir, 'config.json'),
        contextRoot: path.join(baseDir, 'Kurspilot'),
      }),
    }),
    /Kurspilot einrichten|Konfigurationsprogramm/
  );
});

test('resolveKurspilotStartkontextFromWegweiser lehnt mehrdeutige Startkontext-Pfade ab', () => {
  const baseDir = makeTmpDir();
  const materialDir = path.join(baseDir, 'Material');
  fs.mkdirSync(materialDir, { recursive: true });
  fs.writeFileSync(
    path.join(materialDir, 'KURSPILOT.md'),
    'Startkontext: local-context/2025-26/../7a/CONTEXT.md\n',
    'utf8'
  );

  assert.throws(
    () => resolveKurspilotStartkontextFromWegweiser(materialDir, {
      readWorkspaceSetting: () => ({
        ok: true,
        status: 'configured',
        configPath: path.join(baseDir, 'config.json'),
        contextRoot: path.join(baseDir, 'Kurspilot'),
      }),
    }),
    /Kurspilot einrichten|Konfigurationsprogramm/
  );
});

test('resolveKurspilotStartkontextFromWegweiser verweist bei fehlendem Wegweiser aufs Setup', () => {
  const baseDir = makeTmpDir();
  const materialDir = path.join(baseDir, 'Material');
  fs.mkdirSync(materialDir, { recursive: true });

  assert.throws(
    () => resolveKurspilotStartkontextFromWegweiser(materialDir, {
      readWorkspaceSetting: () => ({
        ok: true,
        status: 'configured',
        configPath: path.join(baseDir, 'config.json'),
        contextRoot: path.join(baseDir, 'Kurspilot'),
      }),
    }),
    /Kurspilot einrichten|Pfad im Chat/
  );
});

test('resolveKurspilotStartkontextFromWegweiser verweist bei invalidem Wegweiser aufs Setup', () => {
  const baseDir = makeTmpDir();
  const materialDir = path.join(baseDir, 'Material');
  fs.mkdirSync(materialDir, { recursive: true });
  fs.writeFileSync(path.join(materialDir, 'KURSPILOT.md'), '# Ohne Startkontext\n', 'utf8');

  assert.throws(
    () => resolveKurspilotStartkontextFromWegweiser(materialDir, {
      readWorkspaceSetting: () => ({
        ok: true,
        status: 'configured',
        configPath: path.join(baseDir, 'config.json'),
        contextRoot: path.join(baseDir, 'Kurspilot'),
      }),
    }),
    /Kurspilot einrichten|Konfigurationsprogramm/
  );
});

test('resolveKurspilotStartkontextFromWegweiser verweist bei unlesbarem Wegweiser aufs Setup', () => {
  const baseDir = makeTmpDir();
  const materialDir = path.join(baseDir, 'Material');
  fs.mkdirSync(path.join(materialDir, 'KURSPILOT.md'), { recursive: true });

  assert.throws(
    () => resolveKurspilotStartkontextFromWegweiser(materialDir, {
      readWorkspaceSetting: () => ({
        ok: true,
        status: 'configured',
        configPath: path.join(baseDir, 'config.json'),
        contextRoot: path.join(baseDir, 'Kurspilot'),
      }),
    }),
    /Kurspilot einrichten|Konfigurationsprogramm/
  );
});

test('resolveKurspilotStartkontextFromWegweiser verweist bei fehlender Arbeitsbereich-Einstellung aufs Setup', () => {
  const baseDir = makeTmpDir();
  const materialDir = path.join(baseDir, 'Material');
  fs.mkdirSync(materialDir, { recursive: true });
  fs.writeFileSync(
    path.join(materialDir, 'KURSPILOT.md'),
    'Startkontext: local-context/2025-26/7a/naturwissenschaften/CONTEXT.md\n',
    'utf8'
  );

  assert.throws(
    () => resolveKurspilotStartkontextFromWegweiser(materialDir, {
      readWorkspaceSetting: () => ({
        ok: false,
        status: 'missing',
        message: 'Arbeitsbereich-Einstellung fehlt. Bitte das Kurspilot-Konfigurationsprogramm ausfuehren.',
      }),
    }),
    /Konfigurationsprogramm/
  );
});

test('setupKurspilotWegweiser zeigt vor dem Schreiben eine Vorschau ohne Datei anzulegen', () => {
  const baseDir = makeTmpDir();
  const workspaceRoot = path.join(baseDir, 'Kurspilot');
  const materialDir = path.join(baseDir, 'Lehrkraftmaterial', 'Nawi');
  fs.mkdirSync(materialDir, { recursive: true });

  const result = setupKurspilotWegweiser({
    materialFolder: materialDir,
    startkontext: 'local-context/2025-26/7a/naturwissenschaften/CONTEXT.md',
  }, {
    confirmed: false,
    readWorkspaceSetting: () => ({
      ok: true,
      status: 'configured',
      configPath: path.join(baseDir, 'config.json'),
      contextRoot: workspaceRoot,
    }),
  });

  assert.strictEqual(result.status, 'preview');
  assert.strictEqual(result.wegweiserPath, path.join(materialDir, 'KURSPILOT.md'));
  assert.deepStrictEqual(result.writtenFiles, []);
  assert.match(
    result.teacherFacingText,
    new RegExp(materialDir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  );
  assert.match(
    result.teacherFacingText,
    new RegExp(workspaceRoot.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  );
  assert.match(
    result.teacherFacingText,
    /Startkontext: local-context\/2025-26\/7a\/naturwissenschaften\/CONTEXT\.md/
  );
  assert.ok(!fs.existsSync(path.join(materialDir, 'KURSPILOT.md')));
});

test('setupKurspilotWegweiser schreibt nach Bestaetigung genau KURSPILOT.md in den Materialordner', () => {
  const baseDir = makeTmpDir();
  const workspaceRoot = path.join(baseDir, 'Kurspilot');
  const materialDir = path.join(baseDir, 'Lehrkraftmaterial', 'Nawi');
  fs.mkdirSync(materialDir, { recursive: true });

  const result = setupKurspilotWegweiser({
    materialFolder: materialDir,
    startkontext: 'local-context/2025-26/7a/naturwissenschaften/CONTEXT.md',
  }, {
    confirmed: true,
    readWorkspaceSetting: () => ({
      ok: true,
      status: 'configured',
      configPath: path.join(baseDir, 'config.json'),
      contextRoot: workspaceRoot,
    }),
  });

  const wegweiserPath = path.join(materialDir, 'KURSPILOT.md');
  const materialFiles = fs.readdirSync(materialDir).sort();
  const content = fs.readFileSync(wegweiserPath, 'utf8');

  assert.strictEqual(result.status, 'written');
  assert.deepStrictEqual(result.writtenFiles, [wegweiserPath]);
  assert.deepStrictEqual(materialFiles, ['KURSPILOT.md']);
  assert.match(
    content,
    /^Startkontext: local-context\/2025-26\/7a\/naturwissenschaften\/CONTEXT\.md$/m
  );
  assert.match(content, /zentralen Kurspilot-Arbeitsbereich/);
  assert.match(content, /keine plan\.md, status\.md oder Journale/);
  assert.ok(!fs.existsSync(path.join(materialDir, 'plan.md')));
  assert.ok(!fs.existsSync(path.join(materialDir, 'status.md')));
});

test('setupKurspilotWegweiser aktualisiert vorhandenes KURSPILOT.md idempotent ohne Duplikate', () => {
  const baseDir = makeTmpDir();
  const workspaceRoot = path.join(baseDir, 'Kurspilot');
  const materialDir = path.join(baseDir, 'Lehrkraftmaterial', 'Nawi');
  const wegweiserPath = path.join(materialDir, 'KURSPILOT.md');
  fs.mkdirSync(materialDir, { recursive: true });
  fs.writeFileSync(
    wegweiserPath,
    [
      'Startkontext: local-context/alt/CONTEXT.md',
      '',
      'Startkontext: local-context/alt/CONTEXT.md',
      'Alte Hinweise.',
      '',
    ].join('\n'),
    'utf8'
  );

  const fields = {
    materialFolder: materialDir,
    startkontext: 'local-context/2025-26/7a/naturwissenschaften/CONTEXT.md',
  };
  const options = {
    confirmed: true,
    readWorkspaceSetting: () => ({
      ok: true,
      status: 'configured',
      configPath: path.join(baseDir, 'config.json'),
      contextRoot: workspaceRoot,
    }),
  };

  const firstResult = setupKurspilotWegweiser(fields, options);
  const firstContent = fs.readFileSync(wegweiserPath, 'utf8');
  const secondResult = setupKurspilotWegweiser(fields, options);
  const secondContent = fs.readFileSync(wegweiserPath, 'utf8');
  const startkontextMatches = secondContent.match(/^Startkontext:/gm) || [];

  assert.strictEqual(firstResult.status, 'updated');
  assert.strictEqual(secondResult.status, 'updated');
  assert.strictEqual(firstContent, secondContent);
  assert.strictEqual(startkontextMatches.length, 1);
  assert.match(
    secondContent,
    /^Startkontext: local-context\/2025-26\/7a\/naturwissenschaften\/CONTEXT\.md$/m
  );
  assert.doesNotMatch(secondContent, /local-context\/alt/);
});

test('setupKurspilotWegweiser schreibt keine anderen Materialordner-Dateien', () => {
  const baseDir = makeTmpDir();
  const workspaceRoot = path.join(baseDir, 'Kurspilot');
  const materialDir = path.join(baseDir, 'Lehrkraftmaterial', 'Nawi');
  const childMaterialDir = path.join(materialDir, 'Unterlagen');
  const existingMaterialFile = path.join(materialDir, 'arbeitsblatt.txt');
  const childWegweiser = path.join(childMaterialDir, 'KURSPILOT.md');
  fs.mkdirSync(childMaterialDir, { recursive: true });
  fs.writeFileSync(existingMaterialFile, 'Bleibt unveraendert.', 'utf8');
  fs.writeFileSync(childWegweiser, 'Startkontext: local-context/alt/CONTEXT.md\n', 'utf8');

  const result = setupKurspilotWegweiser({
    materialFolder: materialDir,
    startkontext: 'local-context/2025-26/7a/naturwissenschaften/CONTEXT.md',
  }, {
    confirmed: true,
    readWorkspaceSetting: () => ({
      ok: true,
      status: 'configured',
      configPath: path.join(baseDir, 'config.json'),
      contextRoot: workspaceRoot,
    }),
  });

  assert.deepStrictEqual(result.writtenFiles, [path.join(materialDir, 'KURSPILOT.md')]);
  assert.strictEqual(fs.readFileSync(existingMaterialFile, 'utf8'), 'Bleibt unveraendert.');
  assert.strictEqual(
    fs.readFileSync(childWegweiser, 'utf8'),
    'Startkontext: local-context/alt/CONTEXT.md\n'
  );
  assert.ok(!fs.existsSync(path.join(materialDir, 'plan.md')));
  assert.ok(!fs.existsSync(path.join(materialDir, 'status.md')));
});
