'use strict';

const { test } = require('node:test');
const assert = require('node:assert');

const {
  renderUnterrichtsvorhabenStatus,
  parseUnterrichtsvorhabenStatus,
  transitionUnterrichtsvorhabenStatus,
  STATUS_VALUES,
} = require('../lib/unterrichtsvorhaben-status');

test('status renderer schreibt den Mindestinhalt als Markdown und der Parser liest den Status wieder aus', () => {
  const content = renderUnterrichtsvorhabenStatus({
    unterrichtsvorhaben: 'photosynthese',
    status: 'in_planung',
    lastUpdateDate: '2026-06-15',
    updatingSkill: 'Kurspilot',
    planState: 'Planentwurf angelegt',
    moodleTarget: 'Moodle-Kurs 7a / naturwissenschaften',
    openPoints: ['_(noch nicht erfasst)_'],
    nextRecommendedStep: 'Plan mit der Lehrkraft bestaetigen.',
  });

  assert.match(content, /^# Status zum Unterrichtsvorhaben: photosynthese/m);
  assert.match(content, /## Aktueller Status/);
  assert.match(content, /\| Aktueller Status \| in_planung \|/);
  assert.match(content, /\| Letzte Aktualisierung \| 2026-06-15 \|/);
  assert.match(content, /\| Aktualisierender Skill \| Kurspilot \|/);
  assert.match(content, /\| Planstand \| Planentwurf angelegt \|/);
  assert.match(content, /\| Moodle-Ziel \| Moodle-Kurs 7a \/ naturwissenschaften \|/);
  assert.match(content, /## Offene Punkte/);
  assert.match(content, /## Naechster empfohlener Schritt/);
  assert.doesNotMatch(content, /^---$/m);
  assert.doesNotMatch(content, /^\s*\{/m);
  assert.strictEqual(parseUnterrichtsvorhabenStatus(content), 'in_planung');
});

test('Statuswerte werden nur als V1-Werte erkannt', () => {
  assert.deepStrictEqual(STATUS_VALUES, [
    'in_planung',
    'freigegeben',
    'teilweise_umgesetzt',
    'umgesetzt',
    'blockiert',
  ]);

  const unknownStatus = renderUnterrichtsvorhabenStatus({
    unterrichtsvorhaben: 'photosynthese',
    status: 'in_planung',
    lastUpdateDate: '2026-06-15',
    updatingSkill: 'Kurspilot',
    planState: 'Planentwurf angelegt',
    moodleTarget: 'Moodle-Kurs 7a / naturwissenschaften',
    openPoints: [],
    nextRecommendedStep: 'Plan mit der Lehrkraft bestaetigen.',
  }).replace('| Aktueller Status | in_planung |', '| Aktueller Status | draft |');

  assert.strictEqual(parseUnterrichtsvorhabenStatus(unknownStatus), null);
});

test('Status-Transitionen decken Freigabe, Ueberarbeitung, Teilumsetzung, Abschluss und Blockade ab', () => {
  assert.strictEqual(transitionUnterrichtsvorhabenStatus(null, 'new_plan'), 'in_planung');
  assert.strictEqual(transitionUnterrichtsvorhabenStatus('in_planung', 'approval'), 'freigegeben');
  assert.strictEqual(
    transitionUnterrichtsvorhabenStatus('freigegeben', 'approved_plan_edit'),
    'in_planung'
  );
  assert.strictEqual(
    transitionUnterrichtsvorhabenStatus('freigegeben', 'partial_implementation'),
    'teilweise_umgesetzt'
  );
  assert.strictEqual(
    transitionUnterrichtsvorhabenStatus('teilweise_umgesetzt', 'completion'),
    'umgesetzt'
  );
  assert.strictEqual(transitionUnterrichtsvorhabenStatus('freigegeben', 'blocker'), 'blockiert');
});
