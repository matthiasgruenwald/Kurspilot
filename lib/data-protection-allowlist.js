'use strict';

/**
 * Positive Allowlist der erlaubten Kurspilot-Datenoberflaeche (Issue #187,
 * Parent #146, docs/specs/0003-coursepilot-marketplace-readiness.md Abschnitt
 * "Datenschutz und Datenzugriff").
 *
 * Coursepilot gibt ausschliesslich lehrkraftbezogene Kursgestaltung frei.
 * Von Lernenden erzeugte oder personenbezogene Daten (Aufgabenabgaben,
 * Forenbeitraege, Quizversuche, Bewertungen, Teilnehmendenlisten) sind weder
 * ueber MCP-Tools noch ueber Moodle-Webservices erreichbar.
 *
 * Ein spaeter hinzugefuegtes Tool oder eine neue Webservice-Funktion ist nur
 * nach ausdruecklicher Pruefung zulaessig: der Vertragstest
 * test/data-protection-contract.test.js vergleicht die reale Oberflaeche mit
 * dieser Allowlist und scheitert, solange ein neuer Eintrag hier fehlt.
 *
 * Kein Moodle-Zugriff, keine Seiteneffekte - reine Datenstruktur (Vorbild:
 * lib/activity-registry.js).
 */

// Erlaubte MCP-Tools (Vollprofil, moodle-mcp.js tools/list).
const ALLOWED_MCP_TOOLS = Object.freeze([
  'moodle_add_questions_to_quiz',
  'moodle_create_assign',
  'moodle_create_folder',
  'moodle_create_label',
  'moodle_create_mc_question',
  'moodle_create_page',
  'moodle_create_question_category',
  'moodle_create_quiz',
  'moodle_create_resource',
  'moodle_create_url',
  'moodle_crop_image',
  'moodle_embed_assign_image',
  'moodle_ensure_question_bank',
  'moodle_ensure_section',
  'moodle_get_course_catalog',
  'moodle_get_modules',
  'moodle_get_question',
  'moodle_get_question_categories',
  'moodle_get_sections',
  'moodle_move_module',
  'moodle_move_section',
  'moodle_set_completion',
  'moodle_set_restriction',
  'moodle_update_assign',
  'moodle_update_folder',
  'moodle_update_label',
  'moodle_update_mc_question',
  'moodle_update_page',
  'moodle_update_question_category',
  'moodle_update_quiz_settings',
  'moodle_update_resource',
  'moodle_update_section',
  'moodle_update_url',
  'moodle_upload_assignfile',
  'moodle_upload_folder_file',
]);

// Erlaubte Webservice-Funktionen des Coursepilot-Dienstes (db/services.php).
// mod_quiz_get_quizzes_by_courses ist eine Moodle-Core-Funktion (lesen von
// Quiz-Einstellungen, keine Versuche/Bewertungen), die der Dienst zusaetzlich
// freigibt.
const ALLOWED_WEBSERVICE_FUNCTIONS = Object.freeze([
  'local_coursepilot_add_questions_to_quiz',
  'local_coursepilot_create_assign',
  'local_coursepilot_create_folder',
  'local_coursepilot_create_label',
  'local_coursepilot_create_mc_question',
  'local_coursepilot_create_page',
  'local_coursepilot_create_question_category',
  'local_coursepilot_create_quiz',
  'local_coursepilot_create_resource',
  'local_coursepilot_create_url',
  'local_coursepilot_ensure_question_bank',
  'local_coursepilot_ensure_section',
  'local_coursepilot_get_course_catalog',
  'local_coursepilot_get_modules',
  'local_coursepilot_get_question',
  'local_coursepilot_get_question_categories',
  'local_coursepilot_get_sections',
  'local_coursepilot_move_module',
  'local_coursepilot_move_section',
  'local_coursepilot_set_completion',
  'local_coursepilot_set_restriction',
  'local_coursepilot_update_assign',
  'local_coursepilot_update_folder',
  'local_coursepilot_update_label',
  'local_coursepilot_update_mc_question',
  'local_coursepilot_update_page',
  'local_coursepilot_update_question_category',
  'local_coursepilot_update_quiz_settings',
  'local_coursepilot_update_resource',
  'local_coursepilot_update_section',
  'local_coursepilot_update_url',
  'local_coursepilot_upload_assign_intro_image',
  'local_coursepilot_upload_assignfile',
  'local_coursepilot_upload_folder_file',
  'mod_quiz_get_quizzes_by_courses',
]);

// Die einzigen Webservice-Funktionen mit 'type' => 'read' - allesamt
// Lehrkraftinhalte (Abschnitte, Module, Kursstruktur, Fragenkategorien,
// Fragen). Keine Abgaben, Versuche, Bewertungen oder Teilnehmendenlisten.
const READ_WEBSERVICE_FUNCTIONS = Object.freeze([
  'local_coursepilot_get_course_catalog',
  'local_coursepilot_get_modules',
  'local_coursepilot_get_question',
  'local_coursepilot_get_question_categories',
  'local_coursepilot_get_sections',
]);

// Namensbestandteile, die in keinem erlaubten Tool- oder Webservice-Namen
// vorkommen duerfen: Sie bezeichnen Lernendendaten- oder Personenoberflaechen.
// "grade" deckt Bewertungen/Noten ab - keines der heutigen Kursgestaltungs-
// Werkzeuge traegt "grade" im Namen; ein kuenftiges Werkzeug mit "grade" im
// Namen erfordert eine bewusste Allowlist-Entscheidung.
const FORBIDDEN_SURFACE_TOKENS = Object.freeze([
  'submission',
  'forum',
  'attempt',
  'participant',
  'enrol',
  'grade',
  'user',
]);

/**
 * Gibt alle Namen zurueck, die einen verbotenen Lernendendaten-Bestandteil
 * enthalten - leer, wenn die Oberflaeche sauber ist.
 */
function findForbiddenNames(names) {
  const violations = [];
  for (const name of names) {
    const lower = name.toLowerCase();
    for (const token of FORBIDDEN_SURFACE_TOKENS) {
      if (lower.includes(token)) {
        violations.push({ name, token });
      }
    }
  }
  return violations;
}

module.exports = {
  ALLOWED_MCP_TOOLS,
  ALLOWED_WEBSERVICE_FUNCTIONS,
  READ_WEBSERVICE_FUNCTIONS,
  FORBIDDEN_SURFACE_TOKENS,
  findForbiddenNames,
};
