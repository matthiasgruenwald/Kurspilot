'use strict';

const { test } = require('node:test');
const assert = require('node:assert');

const { buildMaterialPage } = require('../lib/material-page');

const OCR_TEXT = '<p>Photosynthese ist die Umwandlung von Lichtenergie in chemische Energie.</p>';

test('buildMaterialPage uebernimmt ocrText unveraendert in den Inhalt', () => {
  const page = buildMaterialPage(OCR_TEXT);

  assert.ok(page.content.includes(OCR_TEXT));
  assert.deepStrictEqual(page.images, []);
});

test('buildMaterialPage zeigt Quellenhinweis fuer externe Quelle sichtbar an', () => {
  const page = buildMaterialPage(OCR_TEXT, [
    { type: 'external', url: 'https://example.org/photosynthese', title: 'Photosynthese-Erklaerung', accessedAt: '2026-06-13' },
  ]);

  assert.ok(page.content.includes('Quelle:'));
  assert.ok(page.content.includes('Photosynthese-Erklaerung'));
  assert.ok(page.content.includes('https://example.org/photosynthese'));
  assert.ok(page.content.includes('abgerufen am 2026-06-13'));
});

test('buildMaterialPage zeigt Lehrwerkverweis im Format "<Werk>, S. <Seite>" an', () => {
  const page = buildMaterialPage(OCR_TEXT, [
    { type: 'lehrwerk', title: 'Bio heute 1', page: 42 },
  ]);

  assert.ok(page.content.includes('Quelle:'));
  assert.ok(page.content.includes('Bio heute 1, S. 42'));
});

test('buildMaterialPage unterstuetzt mehrere Quellen (externe + Lehrwerk)', () => {
  const page = buildMaterialPage(OCR_TEXT, [
    { type: 'external', url: 'https://example.org/quelle' },
    { type: 'lehrwerk', title: 'Bio heute 1', page: '42-43' },
  ]);

  assert.ok(page.content.includes('https://example.org/quelle'));
  assert.ok(page.content.includes('Bio heute 1, S. 42-43'));
});

test('buildMaterialPage gibt Fachabbildungen getrennt vom Fließtext zurueck (kein Textduplikat)', () => {
  const page = buildMaterialPage(OCR_TEXT, [], {
    images: [{ imagePath: 'materials/biologie/blatt-zellaufbau.png', altText: 'Querschnitt eines Laubblatts mit Chloroplasten' }],
  });

  assert.deepStrictEqual(page.images, [
    { imagePath: 'materials/biologie/blatt-zellaufbau.png', altText: 'Querschnitt eines Laubblatts mit Chloroplasten' },
  ]);
  assert.ok(!page.content.includes('Querschnitt eines Laubblatts'));
});

test('buildMaterialPage ohne Quellen fuegt keinen Quellenhinweis-Block ein', () => {
  const page = buildMaterialPage(OCR_TEXT);

  assert.ok(!page.content.includes('Quelle:'));
  assert.ok(!page.content.includes('quellenhinweis'));
});

test('buildMaterialPage escaped HTML in externen Quellenangaben', () => {
  const page = buildMaterialPage(OCR_TEXT, [
    { type: 'external', url: 'https://example.org/x', title: '<script>alert(1)</script>' },
  ]);

  assert.ok(!page.content.includes('<script>'));
  assert.ok(page.content.includes('&lt;script&gt;'));
});

test('buildMaterialPage wirft fuer fehlenden/leeren ocrText', () => {
  assert.throws(() => buildMaterialPage(''), /ocrText/);
  assert.throws(() => buildMaterialPage(null), /ocrText/);
});

test('buildMaterialPage wirft fuer unbekannten Quellentyp', () => {
  assert.throws(() => buildMaterialPage(OCR_TEXT, [{ type: 'sonstwas', url: 'x' }]), /Quellentyp/);
});

test('buildMaterialPage wirft fuer Lehrwerkverweis ohne Seitenangabe', () => {
  assert.throws(() => buildMaterialPage(OCR_TEXT, [{ type: 'lehrwerk', title: 'Bio heute 1' }]), /page/);
});
