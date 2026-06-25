'use strict';

/**
 * Aktivitaetsregister (Issue #88, ADR 0007 "Aktivitaets-MCP-Aufteilung").
 *
 * Statische, release-gebundene Datenstruktur: pro Aktivitaets-MCP Name,
 * Abhaengigkeiten (z.B. Quiz -> Fragensammlung), Default an/aus und ob die
 * Aktivitaet aktuell per API/Plugin unterstuetzt ist. Wird vom Setup-Tool
 * fuer die Auswahl-Checkliste (#93) und die Werkzeuglueckenerkennung (#94)
 * genutzt.
 *
 * Kein Moodle-Zugriff, keine Seiteneffekte - reine Funktionen ueber dieser
 * Datenstruktur (karpathy-guidelines).
 */

const ACTIVITIES = Object.freeze({
  page: Object.freeze({
    id: 'page',
    label: 'Seite',
    dependsOn: [],
    default: true,
    apiSupported: true,
  }),
  label: Object.freeze({
    id: 'label',
    label: 'Textfeld',
    dependsOn: [],
    default: true,
    apiSupported: true,
  }),
  url: Object.freeze({
    id: 'url',
    label: 'URL',
    dependsOn: [],
    default: true,
    apiSupported: true,
  }),
  assign: Object.freeze({
    id: 'assign',
    label: 'Aufgabe',
    dependsOn: [],
    default: true,
    apiSupported: true,
  }),
  quiz: Object.freeze({
    id: 'quiz',
    label: 'Test',
    dependsOn: ['fragensammlung'],
    default: true,
    apiSupported: true,
  }),
  fragensammlung: Object.freeze({
    id: 'fragensammlung',
    label: 'Fragensammlung',
    dependsOn: [],
    default: true,
    apiSupported: true,
  }),
  forum: Object.freeze({
    id: 'forum',
    label: 'Forum',
    dependsOn: [],
    default: false,
    apiSupported: false,
    manualSteps: Object.freeze([
      'Im Moodle-Kurs den Bearbeitungsmodus einschalten und den Zielabschnitt oeffnen.',
      'Im Zielabschnitt "Aktivitaet oder Material anlegen" waehlen.',
      'Die Aktivitaet "Forum" auswaehlen und auf "Hinzufuegen" klicken.',
      'Name, Beschreibung sowie das passende Forumformat eintragen und die gewuenschten Einstellungen pruefen.',
      'Mit "Speichern und zum Kurs" abschliessen und danach Sichtbarkeit sowie Abschlussbedingungen im Kurs kontrollieren.',
    ]),
  }),
});

function getActivity(id) {
  const activity = ACTIVITIES[id];
  if (!activity) {
    throw new Error(`Unbekannte Aktivitaet: "${id}"`);
  }
  return activity;
}

function listActivities() {
  return Object.values(ACTIVITIES);
}

function normalizeActivityToken(token) {
  return String(token).trim().toLowerCase();
}

function resolveActivityId(token) {
  const normalized = normalizeActivityToken(token);
  const activity = listActivities().find((candidate) =>
    candidate.id.toLowerCase() === normalized ||
    candidate.label.toLowerCase() === normalized
  );
  if (!activity) {
    throw new Error(`Unbekannte Aktivitaet: "${token}"`);
  }
  return activity.id;
}

function resolveActivitySelection(tokens) {
  return resolveDependencies(tokens.map(resolveActivityId));
}

function getDefaultBundle() {
  return listActivities()
    .filter((activity) => activity.default)
    .map((activity) => activity.id);
}

/**
 * Loest Abhaengigkeiten transitiv auf: wer z.B. "quiz" waehlt, bekommt
 * "fragensammlung" automatisch dazu. Gibt ein neues, deduplizierte Array
 * zurueck - mutiert die Eingabe nicht.
 */
function resolveDependencies(selectedIds) {
  const resolved = new Set();

  function addWithDependencies(id) {
    const activity = getActivity(id);
    if (resolved.has(id)) {
      return;
    }
    resolved.add(id);
    for (const dependencyId of activity.dependsOn) {
      addWithDependencies(dependencyId);
    }
  }

  for (const id of selectedIds) {
    addWithDependencies(id);
  }

  return [...resolved];
}

function isApiSupported(id) {
  return getActivity(id).apiSupported;
}

function lookupActivitySupport(id) {
  const activity = ACTIVITIES[id];
  if (!activity) {
    return {
      id,
      known: false,
      apiSupported: false,
      label: null,
      manualSteps: [],
    };
  }

  return {
    id: activity.id,
    known: true,
    apiSupported: activity.apiSupported,
    label: activity.label,
    manualSteps: activity.apiSupported ? [] : [...(activity.manualSteps || [])],
  };
}

module.exports = {
  ACTIVITIES,
  getActivity,
  listActivities,
  getDefaultBundle,
  resolveActivityId,
  resolveActivitySelection,
  resolveDependencies,
  isApiSupported,
  lookupActivitySupport,
};
