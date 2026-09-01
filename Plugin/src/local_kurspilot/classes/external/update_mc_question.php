<?php
// This file is part of Moodle - http://moodle.org/
//
// Moodle is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// Moodle is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with Moodle.  If not, see <http://www.gnu.org/licenses/>.

namespace local_kurspilot\external;

use core_external\external_api;
use core_external\external_function_parameters;
use core_external\external_single_structure;
use core_external\external_value;
use local_kurspilot\question_suspect_gate;
use moodle_exception;

defined('MOODLE_INTERNAL') || die();

require_once($CFG->libdir . '/questionlib.php');

/**
 * Read-modify-write fuer eine Multiple-Choice-Frage (Spec 0017 §7.1, Ticket
 * #419): "felder_json" ist ein PATCH, kein Vollstand (gleiches Vokabular wie
 * {@see update_module_settings}/{@see update_quiz_settings}) - nicht
 * mitgeschickte Felder duerfen NICHT verloren gehen.
 *
 * Anders als eine simple Text-basierte XML-Vorlage (wie
 * {@see create_mc_question::build_xml()}, die fuer eine NEUE Frage bewusst
 * feste Werte fuer penalty/shuffleanswers/answernumbering/Kombi-Feedback
 * setzt) liest dieser Endpunkt die Frage ueber
 * {@see export_questions_xml::resolve_native_question()} als NATIVES
 * Objekt ein - exakt die Form, die {@see \qformat_xml::writequestion()}
 * auch fuer den echten Export nutzt. Nur die im Patch genannten Properties
 * werden ueberschrieben (name, questiontext, generalfeedback, defaultmark,
 * options->single, options->answers); alles andere (penalty, hidden,
 * shuffleanswers, answernumbering, Kombi-Feedback, Tags, Hints, ...) bleibt
 * unangetastet, weil es nie angefasst wird - kein Rekonstruktions- oder
 * Rate-Risiko. Der VOLLSTAND wird anschliessend ueber denselben XML-Kern wie
 * {@see import_questions_xml} zurueckgeschrieben (inkl. Round-Trip-Pruefung
 * und Rollback).
 *
 * idnumber-Backfill (genau EINE Frage, kein Massenlauf): traegt die
 * vorgefundene Frage noch keine idnumber - z.B. aus einem Fremdbestand -,
 * wird beim ersten Schreibzugriff genau fuer DIESEN Bank-Eintrag eine
 * generiert und direkt in question_bank_entries geschrieben, BEVOR die XML
 * gebaut wird. Nur so erkennt import_questions_xml die geschriebene XML als
 * neue Version DESSELBEN Eintrags (Match ueber idnumber in der Kategorie,
 * ADR 0015) statt als neuen Eintrag. Backfill + Schreibvorgang laufen in
 * einer gemeinsamen Transaktion (gleiches Muster wie import_questions_xml
 * selbst) - schlaegt der Rundlauf fehl, wird auch die frisch vergebene
 * idnumber zurueckgerollt (siehe Kommentar bei $transaction unten).
 *
 * @package    local_kurspilot
 * @copyright  2026 Kurspilot
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
final class update_mc_question extends external_api {

    /** @var string[] Erlaubte Patch-Felder - alles andere ist ein Fehler (Trust-Boundary). */
    private const PATCHABLE_FIELDS = [
        'name', 'questiontext', 'selectionmode', 'answers', 'defaultmark', 'generalfeedback',
    ];

    /**
     * @return external_function_parameters
     */
    public static function execute_parameters(): external_function_parameters {
        return new external_function_parameters([
            'questionid' => new external_value(PARAM_INT, 'questionid einer beliebigen Version der zu aendernden Frage'),
            'felder_json' => new external_value(
                PARAM_RAW,
                'JSON-Objekt Feldname => neuer Wert - nur die zu aendernden Felder (Patch, kein Vollstand). '
                    . 'Erlaubt: name, questiontext, selectionmode, answers, defaultmark, generalfeedback. '
                    . 'Nicht genannte Felder bleiben unveraendert.'
            ),
            'bestaetigt' => new external_value(
                PARAM_BOOL,
                'true bestaetigt ausdruecklich einen zuvor gemeldeten Verdachtsfall des XML-Kerns. Beim ersten '
                    . 'Aufruf weglassen oder false.',
                VALUE_DEFAULT,
                false
            ),
        ]);
    }

    /**
     * @param int $questionid
     * @param string $felderjson
     * @param bool $bestaetigt
     * @return array
     */
    public static function execute(int $questionid, string $felderjson, bool $bestaetigt = false): array {
        global $DB;

        $params = self::validate_parameters(self::execute_parameters(), [
            'questionid' => $questionid,
            'felder_json' => $felderjson,
            'bestaetigt' => $bestaetigt,
        ]);

        [$question, $category, $context] = export_questions_xml::resolve_native_question($params['questionid']);
        self::validate_context($context);
        require_capability('local/kurspilot:use', $context);
        // Dieselbe Capability wie fuer eine neue Version in import_questions_xml/
        // create_mc_question - eine neue Version zu schreiben ist derselbe
        // Schreibvorgang, keine eigene "edit"-Kurspilot-Berechtigung.
        require_capability('moodle/question:add', $context);

        if ($question->qtype !== 'multichoice') {
            throw new \invalid_parameter_exception(
                'update_mc_question funktioniert nur fuer Multiple-Choice-Fragen (qtype "multichoice"); '
                    . 'diese Frage ist "' . $question->qtype . '".');
        }

        $patch = self::decode_patch($params['felder_json']);
        self::apply_patch($question, $patch);

        $categoryid = (int) $category->id;
        $entry = get_question_bank_entry((int) $question->id);

        // Kein eigenes try/catch+rollback hier: import_questions_xml::execute()
        // rollt seine EIGENE (verschachtelte) Transaktion bei einem
        // Rundlauf-Fehler bereits selbst zurueck und wirft die Exception
        // weiter - ein zweiter rollback()-Aufruf auf dieser (dann bereits
        // beendeten) Transaktion wuerde selbst eine dml_transaction_exception
        // werfen. Bleibt DIESE Transaktion ohne allow_commit() verlassen
        // (weil die Exception unbehandelt durchgereicht wird), rollt Moodle
        // sie automatisch zurueck (Muster wie import_questions_xml
        // dokumentiert) - inklusive des eben vergebenen Backfills.
        $transaction = $DB->start_delegated_transaction();
        $backfilled = false;

        $idnumber = trim((string) ($entry->idnumber ?? ''));
        if ($idnumber === '') {
            // Backfill NUR fuer diesen einen Bank-Eintrag (Ticket #419) -
            // kein Massenlauf ueber Kategorie/Fragenbank.
            $idnumber = self::generate_idnumber();
            $DB->set_field('question_bank_entries', 'idnumber', $idnumber, ['id' => $entry->id]);
            $backfilled = true;
        }
        $question->idnumber = $idnumber;

        [$xml, $missingfiles] = export_questions_xml::question_to_xml($question, $category, $context);
        $wrapped = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<quiz>\n" . $xml . "\n</quiz>\n";

        $imported = import_questions_xml::execute($categoryid, $wrapped, $params['bestaetigt']);
        $imported = external_api::clean_returnvalue(import_questions_xml::execute_returns(), $imported);

        $transaction->allow_commit();

        $result = $imported['questions'][0];

        if ($result['status'] === 'verdachtsfall') {
            // Kann nur bei einem gleichzeitigen fremden Eingriff auf denselben
            // Bank-Eintrag auftreten (die soeben zugewiesene idnumber passt
            // per Konstruktion) - dasselbe Antwortformat wie create_mc_question.
            return [
                'name' => $result['name'],
                'questionid' => 0,
                'questionbankentryid' => 0,
                'version' => 0,
                'status' => 'verdachtsfall',
                'idnumber_nachgetragen' => false,
                'meldung' => $result['meldung'],
                'idnumber' => $result['idnumber'],
                'categoryid' => $result['categoryid'],
                'candidates' => $result['candidates'],
                'questiontext_old' => $result['questiontext_old'],
                'questiontext_new' => $result['questiontext_new'],
            ];
        }

        $latest = question_suspect_gate::latest_version_question((int) $entry->id);

        $meldung = 'MC-Frage "' . $question->name . '" aktualisiert (Bank-Eintrag ' . $result['questionbankentryid']
            . ', neue Version ' . $result['version'] . ').';
        if ($backfilled) {
            $meldung .= ' idnumber "' . $idnumber . '" wurde nachtraeglich vergeben (Frage hatte zuvor keine).';
        }
        if (!empty($missingfiles)) {
            // Gleiche Transparenzpflicht wie export_questions_xml: eingebettete
            // Dateien werden NICHT stillschweigend verloren, sondern die
            // Meldung nennt sie ausdruecklich (Binaertransport folgt in einem
            // spaeteren Spec, siehe import_questions_xml::guard_no_embedded_files()).
            $meldung .= ' ACHTUNG: Die Frage enthielt eingebettete Dateien, die dabei entfernt wurden: '
                . implode(', ', $missingfiles) . '.';
        }

        return array_merge(
            [
                'name' => $result['name'],
                'questionid' => (int) $latest->id,
                'questionbankentryid' => (int) $result['questionbankentryid'],
                'version' => (int) $result['version'],
                'status' => 'aktualisiert',
                'idnumber_nachgetragen' => $backfilled,
                'meldung' => $meldung,
            ],
            question_suspect_gate::empty_result()
        );
    }

    /**
     * Dekodiert und validiert felder_json: muss ein JSON-Objekt sein, dessen
     * Schluessel eine Teilmenge von {@see self::PATCHABLE_FIELDS} sind -
     * unbekannte Felder brechen den Aufruf ab (Trust-Boundary), statt still
     * ignoriert zu werden.
     *
     * @param string $felderjson
     * @return array<string, mixed>
     */
    private static function decode_patch(string $felderjson): array {
        $patch = json_decode($felderjson, true);
        if (!is_array($patch) || json_last_error() !== JSON_ERROR_NONE || ($patch !== [] && array_is_list($patch))) {
            throw new moodle_exception('invalidpatchjson', 'local_kurspilot');
        }

        foreach (array_keys($patch) as $fieldname) {
            if (!in_array($fieldname, self::PATCHABLE_FIELDS, true)) {
                throw new \invalid_parameter_exception(
                    'Unbekanntes Feld "' . $fieldname . '" in felder_json. Erlaubt: '
                        . implode(', ', self::PATCHABLE_FIELDS) . '.');
            }
        }

        return $patch;
    }

    /**
     * Ueberschreibt auf dem NATIVEN Fragenobjekt (siehe
     * {@see export_questions_xml::resolve_native_question()}) nur die im
     * Patch genannten Properties - alles andere bleibt exakt erhalten
     * (Kerntest dieses Tickets), weil es nie angefasst wird. Validiert
     * anschliessend den (gepatchten oder unveraenderten) Antworten-/
     * Auswahlmodus-Stand mit denselben Regeln wie eine Neuanlage
     * ({@see create_mc_question::validate_answers()}).
     *
     * @param \stdClass $question Wird in-place veraendert.
     * @param array<string, mixed> $patch
     * @return void
     */
    private static function apply_patch(\stdClass $question, array $patch): void {
        if (array_key_exists('name', $patch)) {
            $question->name = (string) $patch['name'];
        }
        if (array_key_exists('questiontext', $patch)) {
            $question->questiontext = (string) $patch['questiontext'];
        }
        if (array_key_exists('generalfeedback', $patch)) {
            $question->generalfeedback = (string) $patch['generalfeedback'];
        }
        if (array_key_exists('defaultmark', $patch)) {
            $question->defaultmark = (float) $patch['defaultmark'];
        }
        if (array_key_exists('selectionmode', $patch)) {
            $mode = (string) $patch['selectionmode'];
            if (!in_array($mode, ['single', 'multiple'], true)) {
                throw new \invalid_parameter_exception('selectionmode muss single oder multiple sein.');
            }
            $question->options->single = $mode === 'single' ? 1 : 0;
        }
        if (array_key_exists('answers', $patch)) {
            $question->options->answers = self::build_answer_objects($patch['answers']);
        }

        // Nur validieren, wenn answers/selectionmode TATSAECHLICH im Patch
        // stehen: eine vorgefundene Fremdbestand-Frage, deren Antworten
        // Kurspilots striktere Anlage-Regeln (validate_answers) nicht
        // erfuellen, darf trotzdem in anderen Feldern gepatcht werden - sonst
        // wuerde ein reiner questiontext-Patch an genau der unangetasteten
        // Antwortstruktur scheitern, die dieses Ticket erhalten soll.
        if (array_key_exists('answers', $patch) || array_key_exists('selectionmode', $patch)) {
            $answersforvalidation = array_map(static fn(\stdClass $a): array => [
                'answer' => $a->answer,
                'fraction' => $a->fraction,
                'feedback' => $a->feedback,
            ], array_values((array) $question->options->answers));
            $selectionmode = empty($question->options->single) ? 'multiple' : 'single';
            create_mc_question::validate_answers($answersforvalidation, $selectionmode);
        }
    }

    /**
     * Baut die von {@see \qformat_xml::write_answer()} erwartete Objektform
     * je Antwort (answer/answerformat/fraction/feedback/feedbackformat/id -
     * id nur fuer Datei-Lookups verwendet, negative Platzhalter-IDs kommen
     * nie mit echten DB-IDs in Konflikt) aus den rohen Patch-Daten.
     *
     * @param mixed $answers
     * @return \stdClass[]
     */
    private static function build_answer_objects($answers): array {
        if (!is_array($answers) || $answers === []) {
            throw new \invalid_parameter_exception('"answers" muss eine nicht-leere Liste von Antwortoptionen sein.');
        }
        $objects = [];
        foreach (array_values($answers) as $i => $answer) {
            if (!is_array($answer) || !array_key_exists('answer', $answer) || !array_key_exists('fraction', $answer)) {
                throw new \invalid_parameter_exception(
                    'Jede Antwortoption in "answers" braucht "answer" und "fraction".');
            }
            $object = new \stdClass();
            $object->id = -($i + 1);
            $object->answer = (string) $answer['answer'];
            $object->answerformat = FORMAT_HTML;
            $object->fraction = (float) $answer['fraction'];
            $object->feedback = isset($answer['feedback']) ? (string) $answer['feedback'] : '';
            $object->feedbackformat = FORMAT_HTML;
            $objects[] = $object;
        }
        return $objects;
    }

    /** Generiert eine neue, eindeutige idnumber (gleiches Schema wie import_questions_xml). */
    private static function generate_idnumber(): string {
        return 'kp-' . bin2hex(random_bytes(8));
    }

    /**
     * @return external_single_structure
     */
    public static function execute_returns(): external_single_structure {
        return new external_single_structure(array_merge(
            [
                'name' => new external_value(PARAM_TEXT, 'Name der Frage'),
                'questionid' => new external_value(PARAM_INT, 'ID der neuen question-Zeile (0 bei "verdachtsfall")'),
                'questionbankentryid' => new external_value(
                    PARAM_INT,
                    'ID des question_bank_entries (Frage-Identitaet, unveraendert; 0 bei "verdachtsfall")'
                ),
                'version' => new external_value(PARAM_INT, 'Neue Versionsnummer (0 bei "verdachtsfall")'),
                'status' => new external_value(PARAM_ALPHA, '"aktualisiert" | "verdachtsfall"'),
                'idnumber_nachgetragen' => new external_value(
                    PARAM_BOOL,
                    'true, wenn diese Frage zuvor keine idnumber hatte und beim Schreiben genau eine bekam'
                ),
                'meldung' => new external_value(PARAM_RAW, 'Lehrkraft-deutsche Meldung mit Bank-Eintrag und Version'),
            ],
            question_suspect_gate::response_fields()
        ));
    }
}
