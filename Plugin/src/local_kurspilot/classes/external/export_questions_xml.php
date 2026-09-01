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
use qformat_xml;
use question_bank;

defined('MOODLE_INTERNAL') || die();

require_once($CFG->libdir . '/questionlib.php');
require_once($CFG->dirroot . '/question/format.php');
require_once($CFG->dirroot . '/question/format/xml/format.php');

/**
 * Export-Gegenpart zum XML-Kern (Spec 0017 §7.1, Ticket #417): liest eine
 * oder mehrere Fragen als Moodle-XML - derselbe Formatter (qformat_xml),
 * den die Round-Trip-Pruefung in {@see import_questions_xml} ohnehin
 * serverseitig verwendet, hier als eigenstaendiges Werkzeug herausgefuehrt.
 *
 * Eingebettete Dateien (<file>-Bloecke mit Base64-Inhalt) werden NICHT
 * mitexportiert, sondern durch einen benannten XML-Kommentar-Platzhalter
 * ersetzt - sonst waere ausgerechnet der Weg, den die KI selbst aufruft
 * (Vorlage aus dem eigenen Bestand holen), der teuerste: eine Frage mit
 * Diagrammen kaeme als Base64 zurueck und fraesse den Kontext. Der
 * Platzhalter beginnt bewusst NICHT mit "<file", damit ein Export nicht an
 * import_questions_xml::guard_no_embedded_files() haengen bleibt.
 *
 * @package    local_kurspilot
 * @copyright  2026 Kurspilot
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
final class export_questions_xml extends external_api {

    /**
     * @return external_function_parameters
     */
    public static function execute_parameters(): external_function_parameters {
        return new external_function_parameters([
            'questionids' => new external_multiple_structure(
                new external_value(PARAM_INT, 'questionid einer beliebigen Version der zu exportierenden Frage'),
                'Liste von questionids (mindestens eine)'
            ),
        ]);
    }

    /**
     * @param int[] $questionids
     * @return array
     */
    public static function execute(array $questionids): array {
        $params = self::validate_parameters(self::execute_parameters(), ['questionids' => $questionids]);
        $ids = $params['questionids'];

        if (empty($ids)) {
            throw new \invalid_parameter_exception('Es muss mindestens eine questionid angegeben werden.');
        }

        $parts = [];
        $missing = [];
        foreach ($ids as $questionid) {
            [$xml, $name, $filenames] = self::export_one((int) $questionid);
            $parts[] = $xml;
            if (!empty($filenames)) {
                $missing[] = ['name' => $name, 'files' => $filenames];
            }
        }

        $xml = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<quiz>\n" . implode("\n", $parts) . "\n</quiz>\n";

        return [
            'xml' => $xml,
            'anzahl' => count($ids),
            'meldung' => self::build_meldung(count($ids), $missing),
        ];
    }

    /**
     * Loest eine questionid (beliebige Version) auf die neueste Version
     * ihres Bank-Eintrags auf, prueft die native Lese-Capability im
     * Kategoriekontext und exportiert die Frage ueber qformat_xml -
     * dasselbe Vorgehen wie import_questions_xml::verify_roundtrip(), hier
     * fuer eine bereits bestehende Frage statt einer frisch geschriebenen.
     *
     * @param int $questionid
     * @return array{0: string, 1: string, 2: string[]} [XML-Fragment, Fragename, entfernte Dateinamen]
     */
    private static function export_one(int $questionid): array {
        [$question, $category, $context] = self::resolve_native_question($questionid);
        self::validate_context($context);
        require_capability('local/kurspilot:use', $context);
        // moodle/question:view existiert nicht (mehr); Moodle kennt nur
        // viewmine/viewall (siehe get_question.php). viewall passt zur
        // Lese-Capability hier - Export ist ein Lesevorgang.
        require_capability('moodle/question:viewall', $context);

        [$xml, $filenames] = self::question_to_xml($question, $category, $context);

        return [$xml, (string) $question->name, $filenames];
    }

    /**
     * Laedt die neueste Version einer Frage in genau der nativen Objektform,
     * die {@see \qformat_xml::writequestion()} erwartet (question-Zeile plus
     * qtype-Optionen ueber {@see \question_type::get_question_options()}) -
     * OHNE Capability-Pruefung, das bleibt Sache des Aufrufers (Export prueft
     * eine Lese-, {@see \local_kurspilot\external\update_mc_question} eine
     * Schreib-Capability).
     *
     * Wiederverwendet von update_mc_question (Ticket #419): dort wird NICHT
     * die XML gepatcht, sondern gezielt einzelne Properties auf diesem
     * nativen Objekt ueberschrieben (name/questiontext/generalfeedback/
     * defaultmark/options->single/options->answers) - alles andere (penalty,
     * shuffleanswers, answernumbering, Kombi-Feedback, Tags, Hints, ...)
     * bleibt dadurch automatisch unangetastet, weil es nie angefasst wird.
     *
     * @param int $questionid
     * @return array{0: \stdClass, 1: \stdClass, 2: \context} [natives Fragenobjekt, Kategorie, Kontext]
     */
    public static function resolve_native_question(int $questionid): array {
        global $DB;

        $version = $DB->get_record('question_versions', ['questionid' => $questionid]);
        if (!$version) {
            throw new \moodle_exception('notfound', 'error', '',
                null, 'Keine Frage mit questionid ' . $questionid . ' gefunden.');
        }

        $latest = $DB->get_record_sql(
            'SELECT * FROM {question_versions} WHERE questionbankentryid = ? ORDER BY version DESC',
            [$version->questionbankentryid],
            IGNORE_MULTIPLE
        );

        $entry = $DB->get_record('question_bank_entries', ['id' => $latest->questionbankentryid], '*', MUST_EXIST);
        $category = $DB->get_record('question_categories', ['id' => $entry->questioncategoryid], '*', MUST_EXIST);
        $context = context::instance_by_id((int) $category->contextid);

        $question = $DB->get_record('question', ['id' => $latest->questionid], '*', MUST_EXIST);
        $question->export_process = true;
        $question->categoryobject = $category;

        $qtype = question_bank::get_qtype($question->qtype);
        $qtype->get_question_options($question);

        $question->contextid = (int) $context->id;
        $question->idnumber = (string) $entry->idnumber;

        return [$question, $category, $context];
    }

    /**
     * Schreibt ein natives Fragenobjekt (siehe {@see self::resolve_native_question()})
     * ueber qformat_xml als XML - eingebettete Dateien entfernt (siehe
     * Klassendoku), fuer Wiederverwendung ausserhalb dieser Klasse public.
     *
     * @param \stdClass $question
     * @param \stdClass $category
     * @param \context $context
     * @return array{0: string, 1: string[]} [XML-Fragment, entfernte Dateinamen]
     */
    public static function question_to_xml(\stdClass $question, \stdClass $category, \context $context): array {
        $qformat = new qformat_xml();
        $qformat->setCategory($category);
        $qformat->setContexts([$context]);

        $xml = $qformat->writequestion($question);
        return self::strip_embedded_files($xml);
    }

    /**
     * Ersetzt jeden <file>-Block (Base64-Dateiinhalt) durch einen
     * XML-Kommentar-Platzhalter, der den urspruenglichen Dateinamen nennt.
     * Bewusst KEIN Strippen ohne Spur - die Lehrkraft/KI muss sehen, dass
     * und welche Datei fehlt (Spec 0017 "Bilder und Groessen").
     *
     * @param string $xml
     * @return array{0: string, 1: string[]} [bereinigtes XML, entfernte Dateinamen]
     */
    private static function strip_embedded_files(string $xml): array {
        $filenames = [];
        $cleaned = preg_replace_callback(
            '/<file\b[^>]*\bname="([^"]*)"[^>]*>.*?<\/file>\n?/s',
            static function (array $m) use (&$filenames): string {
                $filename = $m[1];
                $filenames[] = $filename;
                // "--" wuerde den XML-Kommentar vorzeitig beenden.
                $safe = str_replace('--', '- -', $filename);
                return '<!-- Datei entfernt (kein Binaertransport im Export): ' . $safe . " -->\n";
            },
            $xml
        );

        return [$cleaned ?? $xml, $filenames];
    }

    /**
     * Baut die Lehrkraft-deutsche Gesamtmeldung - sagt bei fehlenden
     * Dateien AUSDRUECKLICH, welche Frage(n) betroffen sind und dass die
     * Dateien nicht mitexportiert wurden.
     *
     * @param int $count
     * @param array<int, array{name: string, files: string[]}> $missing
     * @return string
     */
    private static function build_meldung(int $count, array $missing): string {
        $base = $count === 1 ? '1 Frage exportiert.' : $count . ' Fragen exportiert.';

        if (empty($missing)) {
            return $base;
        }

        $details = [];
        foreach ($missing as $entry) {
            $details[] = 'Frage "' . $entry['name'] . '": ' . implode(', ', $entry['files']);
        }

        return $base . ' ACHTUNG: Eingebettete Dateien fehlen im Export und wurden durch Platzhalter ersetzt ('
            . implode('; ', $details) . ').';
    }

    /**
     * @return external_single_structure
     */
    public static function execute_returns(): external_single_structure {
        return new external_single_structure([
            'xml' => new external_value(
                PARAM_RAW,
                'Moodle-XML-Fragenexport (ein <quiz>-Wurzelelement mit einer <question> je angeforderter Frage); '
                    . 'eingebettete Dateien sind durch benannte Kommentar-Platzhalter ersetzt'
            ),
            'anzahl' => new external_value(PARAM_INT, 'Anzahl exportierter Fragen'),
            'meldung' => new external_value(
                PARAM_RAW,
                'Lehrkraft-deutsche Meldung; nennt ausdruecklich, wenn und bei welcher Frage Dateien fehlen'
            ),
        ]);
    }
}
