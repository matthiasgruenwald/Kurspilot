'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

const {
  LOCAL_CONTEXT_ROOT,
  getLerngruppenPath,
  getLerngruppenContextFile,
  getFachprofilPath,
  getFachprofilContextFile,
} = require('../lib/local-context-paths');

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
