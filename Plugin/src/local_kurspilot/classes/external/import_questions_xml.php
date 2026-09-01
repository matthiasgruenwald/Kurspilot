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

use context;
use core_external\external_api;
use core_external\external_function_parameters;
use core_external\external_multiple_structure;
use core_external\external_single_structure;
use core_external\external_value;
use core_question\local\bank\question_version_status;
use local_kurspilot\question_suspect_gate;
use qformat_xml;
use question_bank;

defined('MOODLE_INTERNAL') || die();

require_once($CFG->libdir . '/questionlib.php');
require_once($CFG->dirroot . '/question/format.php');
require_once($CFG->dirroot . '/question/format/xml/format.php');

/**
 * Der XML-Kern (Spec 0017 §7.1, Ticket #415): importiert Moodle-XML-Fragen
 * beliebigen Typs versionstreu - "die Lehrkraft erfaehrt vom Server, ob es
 * funktioniert, nicht erst vor der Klasse".
 *
 * Parst ueber die oeffentliche, reine Parse-API qformat_xml::readquestions()
 * (kein DB-Zugriff) - ein Parse-Fehler bricht den GESAMTEN Aufruf ab, kein
 * Teilergebnis. Schreibt gezielt ueber question_type::save_question() mit
 * gesetzter $question->id fuer einen wiedererkannten Bank-Eintrag ⇒ neue
 * Version unter bestehender questionbankentryid (ADR 0001).
 * importprocess() wird NICHT verwendet - legt bei jedem Aufruf einen neuen
 * question_bank_entries-Datensatz an und kennt kein Matching gegen
 * bestehende Eintraege.
 *
 * Round-Trip-Pruefung in derselben Transaktion: die frisch geschriebene
 * Frage wird ueber denselben Formatter wieder als XML exportiert
 * (qformat_xml::writequestion()) und erneut ueber readquestions()
 * zurueckgeparst - dieselbe Importer-Funktion produziert damit auf beiden
 * Seiten dieselbe Objektform, ein generischer Feldvergleich wird moeglich,
 * ohne fuer jeden Fragetyp eigenen Abgleichscode zu schreiben. Verglichen
 * werden die Kernfelder (name, idnumber, Fragetext, Antwortoptionen mit
 * Bruchteilen, Feedback je Option, allgemeines Feedback) - keine
 * Byte-Gleichheit, Moodle normalisiert IDs, Reihenfolgen und Dateipfade.
 * Jede Abweichung oder Ausnahme wirft und rollt damit die gesamte
 * Transaktion zurueck (Moodle rollt eine delegierte Transaktion automatisch
 * zurueck, wenn sie ohne allow_commit() verlassen wird, Muster aus
 * update_question_category.php) - nach dem Aufruf existiert weder
 * Bank-Eintrag noch Version.
 *
 * Wiedererkennung ausschliesslich innerhalb der Zielkategorie ueber
 * idnumber (ADR 0015). Bringt das XML eine idnumber mit, die in der
 * Zielkategorie keinen Treffer hat, ist das ein Verdachtsfall - das
 * gemeinsame Gate-Antwortformat aus move_question.php/T3
 * ({@see \local_kurspilot\question_suspect_gate}) wird uebernommen, auch
 * wenn die Kollisionsrichtung hier umgekehrt ist (dort: idnumber bereits
 * vergeben; hier: idnumber ohne Treffer). Nichts wird geschrieben, bis ein
 * erneuter Aufruf mit "bestaetigt": true das bestaetigt. Fehlt die
 * idnumber ganz, ist das ein echter Erstimport - eine neue wird generiert,
 * kein Gate.
 *
 * @package    local_kurspilot
 * @copyright  2026 Kurspilot
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
final class import_questions_xml extends external_api {

    /**
     * @return external_function_parameters
     */
    public static function execute_parameters(): external_function_parameters {
        return new external_function_parameters([
            'categoryid' => new external_value(PARAM_INT, 'ID der Ziel-Fragenbank-Kategorie'),
            'xmlcontent' => new external_value(PARAM_RAW, 'Moodle-XML-Fragenexport als Text'),
            'bestaetigt' => new external_value(
                PARAM_BOOL,
                'true bestaetigt ausdruecklich einen zuvor gemeldeten Verdachtsfall (mitgebrachte idnumber ohne '
                    . 'Treffer in der Zielkategorie) und legt die Frage trotzdem als neuen Eintrag an. Beim ersten '
                    . 'Aufruf weglassen oder false.',
                VALUE_DEFAULT,
                false
            ),
        ]);
    }

    /**
     * @param int $categoryid
     * @param string $xmlcontent
     * @param bool $bestaetigt
     * @return array
     */
    public static function execute(int $categoryid, string $xmlcontent, bool $bestaetigt = false): array {
        global $DB;

        $params = self::validate_parameters(self::execute_parameters(), [
            'categoryid' => $categoryid,
            'xmlcontent' => $xmlcontent,
            'bestaetigt' => $bestaetigt,
        ]);

        $category = $DB->get_record('question_categories', ['id' => $params['categoryid']], '*', MUST_EXIST);
        $context = context::instance_by_id((int) $category->contextid);
        self::validate_context($context);
        require_capability('local/kurspilot:use', $context);
        require_capability('moodle/question:add', $context);

        // Reines Parsen, kein DB-Zugriff: ein ungueltiges XML wirft hier,
        // BEVOR irgendetwas geschrieben wird - kein Teilergebnis moeglich.
        $questions = self::parse($category, $context, $params['xmlcontent']);

        // moodle_transaction hat keinen Destruktor - anders als in
        // manchen anderen Endpunkten muss hier explizit zurueckgerollt
        // werden, weil Fehler (Round-Trip-Abweichung) bewusst ERST NACH dem
        // Schreiben auftreten, nicht schon in der Validierung davor.
        $transaction = $DB->start_delegated_transaction();

        try {
            $results = [];
            foreach ($questions as $question) {
                $results[] = self::import_one($category, $context, $question, $params['bestaetigt']);
            }
        } catch (\Throwable $e) {
            $transaction->rollback($e);
        }

        $transaction->allow_commit();

        return ['questions' => $results];
    }

    /**
     * Parst das XML ausschliesslich lesend ueber qformat_xml::readquestions().
     * Wirft bei jedem Parse-Problem eine Exception - der gesamte Aufruf
     * bricht damit ab.
     *
     * @param \stdClass $category
     * @param \context $context
     * @param string $xmlcontent
     * @return \stdClass[]
     */
    private static function parse(\stdClass $category, \context $context, string $xmlcontent): array {
        $qformat = new qformat_xml();
        $qformat->setCategory($category);
        $qformat->setContexts([$context]);
        $qformat->setStoponerror(true);
        $qformat->setMatchgrades('grade');
        $qformat->setCatfromfile(false);
        $qformat->setContextfromfile(false);

        $lines = explode("\n", str_replace(["\r\n", "\r"], "\n", $xmlcontent));

        // qformat_xml::readquestions() wirft bei einem Parse-Fehler NICHT -
        // es echot eine Fehlermeldung (qformat_default::error()) und liefert
        // false zurueck. Die Ausgabe wird abgefangen (kein HTML-Leck in die
        // Webservice-Antwort) und stattdessen als Exception geworfen.
        ob_start();
        try {
            $questions = $qformat->readquestions($lines);
        } catch (\Throwable $e) {
            ob_end_clean();
            throw new \invalid_parameter_exception('Ungueltiges Moodle-XML: ' . $e->getMessage());
        }
        $errortext = trim(strip_tags((string) ob_get_clean()));

        if ($questions === false || !is_array($questions) || $qformat->importerrors > 0) {
            throw new \invalid_parameter_exception('Ungueltiges Moodle-XML' . ($errortext !== '' ? ': ' . $errortext : '.'));
        }

        // Kategorie-Direktiven ($CATEGORY:) sind keine Fragen; dieser Endpunkt
        // schreibt ausschliesslich in die uebergebene categoryid.
        $questions = array_values(array_filter((array) $questions, static function ($question) {
            return !isset($question->qtype) || $question->qtype !== 'category';
        }));

        if (empty($questions)) {
            throw new \invalid_parameter_exception('Das XML enthaelt keine importierbaren Fragen.');
        }

        return $questions;
    }

    /**
     * Wiedererkennung + Schreiben + Round-Trip-Pruefung einer einzelnen
     * geparsten Frage.
     *
     * @param \stdClass $category
     * @param \context $context
     * @param \stdClass $question
     * @param bool $bestaetigt
     * @return array
     */
    private static function import_one(
        \stdClass $category,
        \context $context,
        \stdClass $question,
        bool $bestaetigt
    ): array {
        global $DB;

        $name = (string) ($question->name ?? '');
        $xmlidnumber = trim((string) ($question->idnumber ?? ''));

        if ($xmlidnumber === '') {
            // Echter Erstimport: keine idnumber im XML, kein Gate.
            $idnumber = self::generate_idnumber();
            $saved = self::save($category, $context, $question, null, $idnumber);
            self::verify_roundtrip($category, $context, $question, $saved, $idnumber);
            return self::result($saved, 'erstimport', $name);
        }

        $entry = $DB->get_record('question_bank_entries', [
            'questioncategoryid' => $category->id,
            'idnumber' => $xmlidnumber,
        ]);

        if ($entry) {
            // Eindeutiger idnumber-Treffer: neue Version desselben Eintrags.
            $latest = self::latest_version_question((int) $entry->id);
            $saved = self::save($category, $context, $question, (int) $latest->id, $xmlidnumber);
            self::verify_roundtrip($category, $context, $question, $saved, $xmlidnumber);
            return self::result($saved, 'reimport', $name);
        }

        if (!$bestaetigt) {
            // Verdachtsfall: mitgebrachte idnumber ohne Treffer in der
            // Zielkategorie - nichts wird geschrieben (ADR 0015, Spec 0017 §7.1).
            $candidates = self::find_name_candidates((int) $category->id, $name);
            $newquestiontext = self::text_of($question->questiontext ?? '');

            return array_merge(
                [
                    'name' => $name,
                    'questionbankentryid' => 0,
                    'version' => 0,
                    'status' => 'verdachtsfall',
                    'meldung' => 'Verdachtsfall: Die mitgebrachte idnumber "' . $xmlidnumber . '" hat keinen '
                        . 'Treffer in der Zielkategorie. Nichts wurde importiert. Zum Anlegen als neuer Eintrag '
                        . 'trotzdem erneut mit bestaetigt=true aufrufen.',
                ],
                [
                    'idnumber' => $xmlidnumber,
                    'categoryid' => (int) $category->id,
                    'candidates' => $candidates,
                    'questiontext_old' => '',
                    'questiontext_new' => $newquestiontext,
                ]
            );
        }

        // Bestaetigter Verdachtsfall: neuer Eintrag mit der mitgebrachten idnumber.
        $saved = self::save($category, $context, $question, null, $xmlidnumber);
        self::verify_roundtrip($category, $context, $question, $saved, $xmlidnumber);
        return self::result($saved, 'erstimport', $name);
    }

    /**
     * Nahe Kandidaten fuer den Verdachtsfall: gleichnamige Eintraege in der
     * Zielkategorie (deren idnumber offensichtlich eine andere ist, sonst
     * waeren sie kein Verdachtsfall).
     *
     * @param int $categoryid
     * @param string $name
     * @return array
     */
    private static function find_name_candidates(int $categoryid, string $name): array {
        global $DB;

        $sql = 'SELECT DISTINCT qbe.id AS entryid, qbe.idnumber AS idnumber
                  FROM {question_bank_entries} qbe
                  JOIN {question_versions} qv ON qv.questionbankentryid = qbe.id
                  JOIN {question} q           ON q.id = qv.questionid
                 WHERE qbe.questioncategoryid = :catid
                   AND q.name = :name';
        $rows = $DB->get_records_sql($sql, ['catid' => $categoryid, 'name' => $name]);

        $candidates = [];
        foreach ($rows as $row) {
            $latest = self::latest_version_question((int) $row->entryid);
            $candidates[] = [
                'questionid' => (int) $latest->id,
                'name' => (string) $latest->name,
                'idnumber' => (string) ($row->idnumber ?? ''),
            ];
        }
        return $candidates;
    }

    /**
     * Laedt die question-Zeile der neuesten Version eines Fragenbank-Eintrags.
     *
     * @param int $entryid
     * @return \stdClass
     */
    private static function latest_version_question(int $entryid): \stdClass {
        global $DB;
        $version = $DB->get_record_sql(
            'SELECT * FROM {question_versions} WHERE questionbankentryid = ? ORDER BY version DESC',
            [$entryid],
            IGNORE_MULTIPLE
        );
        return $DB->get_record('question', ['id' => $version->questionid], '*', MUST_EXIST);
    }

    /**
     * Ruft question_type::save_question() auf - mit $question->id fuer eine
     * neue Version eines bestehenden Eintrags, ohne fuer einen neuen Eintrag.
     *
     * @param \stdClass $category
     * @param \context $context
     * @param \stdClass $question
     * @param int|null $oldquestionid
     * @param string $idnumber
     * @return \stdClass
     */
    private static function save(
        \stdClass $category,
        \context $context,
        \stdClass $question,
        ?int $oldquestionid,
        string $idnumber
    ): \stdClass {
        $form = clone $question;
        $form->category = $category->id . ',' . $context->id;
        $form->status = question_version_status::QUESTION_STATUS_READY;
        $form->idnumber = $idnumber;
        $form->questiontext = self::as_text_array(
            $question->questiontext ?? '', $question->questiontextformat ?? FORMAT_HTML);
        $form->generalfeedback = self::as_text_array(
            $question->generalfeedback ?? '', $question->generalfeedbackformat ?? FORMAT_HTML);
        if (!isset($form->defaultmark)) {
            // Moodle-XML-Export nutzt historisch das Feld <defaultgrade>.
            $form->defaultmark = $question->defaultgrade ?? 1.0;
        }
        if (!isset($form->penalty)) {
            $form->penalty = 0.0;
        }

        $towrite = new \stdClass();
        $towrite->qtype = $question->qtype;
        if ($oldquestionid !== null) {
            $towrite->id = $oldquestionid;
        }

        $qtype = question_bank::get_qtype($question->qtype);
        return $qtype->save_question($towrite, $form);
    }

    /**
     * Round-Trip-Pruefung (Spec 0017 §7.1): exportiert die frisch
     * geschriebene Frage wieder ueber qformat_xml und parst sie erneut -
     * dieselbe Importer-Funktion liefert damit auf beiden Seiten dieselbe
     * Objektform. Wirft bei jeder Abweichung eine Exception, die die
     * umgebende Transaktion zurueckrollt.
     *
     * @param \stdClass $category
     * @param \context $context
     * @param \stdClass $original Vom Aufruf geparste Eingabe-Frage
     * @param \stdClass $saved Rueckgabe von question_type::save_question()
     * @param string $expectedidnumber Die diesem Schreibvorgang zugewiesene idnumber
     * @return void
     */
    private static function verify_roundtrip(
        \stdClass $category,
        \context $context,
        \stdClass $original,
        \stdClass $saved,
        string $expectedidnumber
    ): void {
        global $DB;

        $reloaded = $DB->get_record('question', ['id' => $saved->id], '*', MUST_EXIST);
        $reloaded->export_process = true;
        $reloaded->categoryobject = $category;

        $qtype = question_bank::get_qtype($reloaded->qtype);
        $qtype->get_question_options($reloaded);

        $reloaded->contextid = (int) $context->id;
        $entry = get_question_bank_entry((int) $reloaded->id);
        $reloaded->idnumber = $entry->idnumber;

        $qformat = new qformat_xml();
        $qformat->setCategory($category);
        $qformat->setContexts([$context]);

        $xml = $qformat->writequestion($reloaded);

        // writequestion() liefert nur den <question>-Block, readquestions()
        // erwartet aber ein <quiz>-Wurzelelement (xmlize-Struktur $xml['quiz']).
        $wrapped = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<quiz>\n" . $xml . "\n</quiz>";

        $reparser = new qformat_xml();
        $reparser->setCategory($category);
        $reparser->setContexts([$context]);
        $reparser->setStoponerror(true);
        $reparser->setMatchgrades('grade');
        $reparser->setCatfromfile(false);
        $reparser->setContextfromfile(false);

        ob_start();
        try {
            $reparsed = $reparser->readquestions(explode("\n", $wrapped));
        } catch (\Throwable $e) {
            ob_end_clean();
            throw self::roundtrip_exception('parse', $e->getMessage());
        }
        $errortext = trim(strip_tags((string) ob_get_clean()));

        if ($reparsed === false || !is_array($reparsed) || $reparser->importerrors > 0) {
            throw self::roundtrip_exception('parse', $errortext !== '' ? $errortext : 'Parse-Fehler');
        }
        $reparsedquestion = reset($reparsed);
        if (!$reparsedquestion) {
            throw self::roundtrip_exception('parse', 'keine Frage im zurueckgelesenen XML');
        }

        $mismatch = self::find_mismatch($original, $reparsedquestion, $expectedidnumber);
        if ($mismatch !== null) {
            throw self::roundtrip_exception($mismatch);
        }
    }

    /**
     * Baut die moodle_exception fuer eine fehlgeschlagene Round-Trip-Pruefung.
     *
     * @param string $field Name des abweichenden Feldes ("parse" bei einem Reparse-Fehler)
     * @param string $detail Zusatzinfo, leer wenn keine vorhanden
     * @return \moodle_exception
     */
    private static function roundtrip_exception(string $field, string $detail = ''): \moodle_exception {
        return new \moodle_exception(
            'roundtripmismatch',
            'local_kurspilot',
            '',
            (object) ['field' => $field, 'detail' => $detail !== '' ? ' (' . $detail . ')' : '']
        );
    }

    /**
     * Kernfeld-Vergleich zwischen der Eingabe-Frage und der zurueckgelesenen
     * Frage (Spec 0017 §7.1): name, idnumber, Fragetext, allgemeines
     * Feedback, Antwortoptionen mit Bruchteilen und Feedbacktexte je Option.
     * Keine Byte-Gleichheit - IDs, Reihenfolgen und Dateipfade werden von
     * Moodle normalisiert und sind hier bewusst aussen vor.
     *
     * @param \stdClass $expected
     * @param \stdClass $actual
     * @param string $expectedidnumber
     * @return string|null Name des abweichenden Feldes, oder null bei Uebereinstimmung
     */
    private static function find_mismatch(\stdClass $expected, \stdClass $actual, string $expectedidnumber): ?string {
        if (trim((string) ($expected->name ?? '')) !== trim((string) ($actual->name ?? ''))) {
            return 'name';
        }
        if ($expectedidnumber !== trim((string) ($actual->idnumber ?? ''))) {
            return 'idnumber';
        }
        if (self::text_of($expected->questiontext ?? '') !== self::text_of($actual->questiontext ?? '')) {
            return 'questiontext';
        }
        if (self::text_of($expected->generalfeedback ?? '') !== self::text_of($actual->generalfeedback ?? '')) {
            return 'generalfeedback';
        }

        $expectedanswers = self::extract_answer_list($expected);
        $actualanswers = self::extract_answer_list($actual);
        if (count($expectedanswers) !== count($actualanswers)) {
            return 'answers';
        }
        foreach ($expectedanswers as $i => $answer) {
            $other = $actualanswers[$i];
            if ($answer['text'] !== $other['text']
                || abs($answer['fraction'] - $other['fraction']) > 0.00001
                || $answer['feedback'] !== $other['feedback']
            ) {
                return 'answers';
            }
        }

        return null;
    }

    /**
     * Normalisiert die Antwortoptionen eines qformat_xml-Frageobjekts
     * (Text, Bruchteil, Feedback) unabhaengig vom konkreten Fragetyp -
     * deckt sowohl das parallele Array-Format (multichoice, shortanswer,
     * numerical, ...) als auch das truefalse-Sonderformat ab. Beide Seiten
     * der Round-Trip-Pruefung durchlaufen dieselbe qformat_xml-Importer-
     * Funktion, liefern also dieselbe Form.
     *
     * @param \stdClass $qo
     * @return array<int, array{text: string, fraction: float, feedback: string}>
     */
    private static function extract_answer_list(\stdClass $qo): array {
        if (isset($qo->answer) && is_array($qo->answer)) {
            $list = [];
            foreach ($qo->answer as $i => $answer) {
                $list[] = [
                    'text' => self::text_of($answer),
                    'fraction' => round((float) ($qo->fraction[$i] ?? 0), 5),
                    'feedback' => self::text_of($qo->feedback[$i] ?? ''),
                ];
            }
            return $list;
        }

        if (isset($qo->answer) && is_bool($qo->answer)) {
            // truefalse: ein einzelnes Bool ("true" ist die richtige
            // Antwort"), Feedback getrennt je Option.
            return [
                [
                    'text' => 'true',
                    'fraction' => $qo->answer ? 1.0 : 0.0,
                    'feedback' => self::text_of($qo->feedbacktrue ?? ''),
                ],
                [
                    'text' => 'false',
                    'fraction' => $qo->answer ? 0.0 : 1.0,
                    'feedback' => self::text_of($qo->feedbackfalse ?? ''),
                ],
            ];
        }

        return [];
    }

    /**
     * @param \stdClass $saved
     * @param string $status
     * @param string $name
     * @return array
     */
    private static function result(\stdClass $saved, string $status, string $name): array {
        global $DB;

        $version = $DB->get_record('question_versions', ['questionid' => $saved->id], '*', MUST_EXIST);
        $meldung = $status === 'erstimport'
            ? 'Frage "' . $name . '" neu angelegt (Version ' . $version->version . ').'
            : 'Frage "' . $name . '" als neue Version (Version ' . $version->version . ') desselben Bank-Eintrags importiert.';

        return array_merge(
            [
                'name' => $name,
                'questionbankentryid' => (int) $version->questionbankentryid,
                'version' => (int) $version->version,
                'status' => $status,
                'meldung' => $meldung,
            ],
            question_suspect_gate::empty_result()
        );
    }

    /** Extrahiert reinen Text aus einem qformat-Feld (String oder ['text'=>...]-Array). */
    private static function text_of($value): string {
        if (is_array($value)) {
            return (string) ($value['text'] ?? '');
        }
        if (is_object($value) && isset($value->text)) {
            return (string) $value->text;
        }
        return (string) $value;
    }

    /** Baut die von save_question() erwartete ['text','format','itemid']-Struktur. */
    private static function as_text_array($value, $format): array {
        if (is_array($value) && array_key_exists('text', $value)) {
            return [
                'text' => (string) $value['text'],
                'format' => $value['format'] ?? $format,
                'itemid' => $value['itemid'] ?? 0,
            ];
        }
        return ['text' => self::text_of($value), 'format' => $format ?? FORMAT_HTML, 'itemid' => 0];
    }

    /** Generiert eine neue, eindeutige idnumber (gleiches Schema wie mc_question_version). */
    private static function generate_idnumber(): string {
        return 'kp-' . bin2hex(random_bytes(8));
    }

    /**
     * @return external_single_structure
     */
    public static function execute_returns(): external_single_structure {
        return new external_single_structure([
            'questions' => new external_multiple_structure(
                new external_single_structure(array_merge(
                    [
                        'name' => new external_value(PARAM_TEXT, 'Name der importierten Frage'),
                        'questionbankentryid' => new external_value(
                            PARAM_INT,
                            'ID des question_bank_entries (0 bei "verdachtsfall")'
                        ),
                        'version' => new external_value(
                            PARAM_INT,
                            'Neue Versionsnummer (0 bei "verdachtsfall")'
                        ),
                        'status' => new external_value(PARAM_ALPHA, '"erstimport" | "reimport" | "verdachtsfall"'),
                        'meldung' => new external_value(PARAM_RAW, 'Lehrkraft-deutsche Meldung'),
                    ],
                    question_suspect_gate::response_fields()
                )),
                'Ein Ergebnis-Eintrag je importierter Frage im XML'
            ),
        ]);
    }
}
