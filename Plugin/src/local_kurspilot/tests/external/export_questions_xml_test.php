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

/**
 * Export-Gegenpart zum XML-Kern (Spec 0017 §7.1, Ticket #417).
 *
 * @package    local_kurspilot
 * @copyright  2026 Kurspilot
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
#[\PHPUnit\Framework\Attributes\CoversClass(export_questions_xml::class)]
final class export_questions_xml_test extends \advanced_testcase {

    /**
     * Rundlauf: eine importierte Frage wird exportiert, das Export-XML ist
     * ueber import_questions_xml wieder importierbar. Reimport in
     * DIESELBE Kategorie erkennt die mitexportierte idnumber wieder und
     * legt eine neue Version DESSELBEN Bank-Eintrags an ("reimport") -
     * genau das beweist, dass die exportierte Struktur vollstaendig und
     * identitaetstreu ist.
     */
    public function test_export_then_import_roundtrip(): void {
        $this->resetAfterTest();

        [, $categoryid] = $this->setup_course_and_category();

        $xml = self::multichoice_xml('Rundlauf-Frage', 'Was ist 2+2?', 'Allgemeines Feedback');
        $imported = import_questions_xml::execute($categoryid, $xml);
        $imported = external_api::clean_returnvalue(import_questions_xml::execute_returns(), $imported);
        $this->assertSame('erstimport', $imported['questions'][0]['status']);

        global $DB;
        $entryid = $imported['questions'][0]['questionbankentryid'];
        $version = $DB->get_record('question_versions', ['questionbankentryid' => $entryid], '*', MUST_EXIST);

        $exported = export_questions_xml::execute([(int) $version->questionid]);
        $exported = external_api::clean_returnvalue(export_questions_xml::execute_returns(), $exported);

        $this->assertSame(1, $exported['anzahl']);
        $this->assertStringContainsString('<quiz>', $exported['xml']);
        $this->assertStringContainsString('Rundlauf-Frage', $exported['xml']);
        $this->assertSame('1 Frage exportiert.', $exported['meldung']);

        $reimported = import_questions_xml::execute($categoryid, $exported['xml']);
        $reimported = external_api::clean_returnvalue(import_questions_xml::execute_returns(), $reimported);

        $this->assertSame('reimport', $reimported['questions'][0]['status']);
        $this->assertSame('Rundlauf-Frage', $reimported['questions'][0]['name']);
        $this->assertSame($entryid, $reimported['questions'][0]['questionbankentryid'], 'Derselbe Bank-Eintrag, neue Version.');
        $this->assertSame(2, $reimported['questions'][0]['version']);
    }

    /**
     * Eine Frage mit eingebetteter Datei liefert einen benannten Platzhalter
     * statt Base64-Inhalt und die Meldung nennt ausdruecklich, dass und bei
     * welcher Frage eine Datei fehlt.
     */
    public function test_question_with_file_gets_placeholder_and_names_it_in_meldung(): void {
        $this->resetAfterTest();

        [, $categoryid] = $this->setup_course_and_category();

        $xml = self::multichoice_xml('Frage mit Bild', 'Siehe Diagramm', 'Feedback');
        $imported = import_questions_xml::execute($categoryid, $xml);
        $imported = external_api::clean_returnvalue(import_questions_xml::execute_returns(), $imported);

        global $DB;
        $entryid = $imported['questions'][0]['questionbankentryid'];
        $version = $DB->get_record('question_versions', ['questionbankentryid' => $entryid], '*', MUST_EXIST);
        $question = $DB->get_record('question', ['id' => $version->questionid], '*', MUST_EXIST);

        // Datei direkt ueber die Dateispeicher-API anheften - unabhaengig vom
        // Import-Weg, um den Export-Platzhalter isoliert zu testen.
        $category = $DB->get_record('question_categories', ['id' => $categoryid], '*', MUST_EXIST);
        $contextid = (int) $category->contextid;
        get_file_storage()->create_file_from_string([
            'contextid' => $contextid,
            'component' => 'question',
            'filearea' => 'questiontext',
            'itemid' => $question->id,
            'filepath' => '/',
            'filename' => 'diagramm.png',
        ], 'fake-bildinhalt');

        $exported = export_questions_xml::execute([(int) $question->id]);
        $exported = external_api::clean_returnvalue(export_questions_xml::execute_returns(), $exported);

        $this->assertStringNotContainsString('<file', $exported['xml'], 'kein <file>-Block, nur der Platzhalter');
        $this->assertStringNotContainsString('fake-bildinhalt', $exported['xml'], 'kein Base64-Dateiinhalt');
        $this->assertStringContainsString('diagramm.png', $exported['xml'], 'Platzhalter nennt den Dateinamen');
        $this->assertStringContainsString('Frage mit Bild', $exported['meldung']);
        $this->assertStringContainsString('diagramm.png', $exported['meldung']);
    }

    /**
     * Mindestens eine questionid ist Pflicht.
     */
    public function test_requires_at_least_one_questionid(): void {
        $this->resetAfterTest();
        [, $categoryid] = $this->setup_course_and_category();
        $this->getDataGenerator();

        $this->expectException(\invalid_parameter_exception::class);
        export_questions_xml::execute([]);
    }

    /**
     * Capability-Pruefung im Kategoriekontext: ohne moodle/question:viewall
     * schlaegt der Export fehl statt Fragedaten zu liefern.
     */
    public function test_rejects_user_without_viewall_capability(): void {
        $this->resetAfterTest();

        [$course, $categoryid] = $this->setup_course_and_category();

        $xml = self::multichoice_xml('Geschuetzte Frage', 'Fragetext', 'Feedback');
        $imported = import_questions_xml::execute($categoryid, $xml);
        $imported = external_api::clean_returnvalue(import_questions_xml::execute_returns(), $imported);

        global $DB;
        $entryid = $imported['questions'][0]['questionbankentryid'];
        $version = $DB->get_record('question_versions', ['questionbankentryid' => $entryid], '*', MUST_EXIST);

        $secondteacher = $this->getDataGenerator()->create_user();
        $this->getDataGenerator()->enrol_user($secondteacher->id, $course->id, 'editingteacher');
        $roleid = $this->get_role_id('editingteacher');
        assign_capability(
            'moodle/question:viewall',
            CAP_PROHIBIT,
            $roleid,
            \context_course::instance($course->id)->id,
            true
        );
        $this->setUser($secondteacher);

        $this->expectException(\required_capability_exception::class);
        export_questions_xml::execute([(int) $version->questionid]);
    }

    /**
     * Baut Kurs + Lehrkraft + Fragensammlung + Kategorie auf und liefert
     * [$course, $categoryid, $topcategoryid].
     *
     * @return array{0: \stdClass, 1: int, 2: int}
     */
    private function setup_course_and_category(): array {
        $course = $this->getDataGenerator()->create_course();
        $teacher = $this->getDataGenerator()->create_user();
        $this->getDataGenerator()->enrol_user($teacher->id, $course->id, 'editingteacher');
        $this->setUser($teacher);

        $bank = ensure_question_bank::execute($course->id, 'Export-Test');
        $bank = external_api::clean_returnvalue(ensure_question_bank::execute_returns(), $bank);

        $category = ensure_question_category::execute('Kategorie', (int) $bank['topcategoryid']);
        $category = external_api::clean_returnvalue(ensure_question_category::execute_returns(), $category);

        return [$course, (int) $category['id'], (int) $bank['topcategoryid']];
    }

    /**
     * @return int
     */
    private function get_role_id(string $shortname): int {
        global $DB;
        return (int) $DB->get_field('role', 'id', ['shortname' => $shortname], MUST_EXIST);
    }

    /**
     * Baut ein minimales Moodle-XML mit einer einzelnen multichoice-Frage
     * (identisch zum Muster in import_questions_xml_test.php).
     *
     * @param string $name
     * @param string $questiontext
     * @param string $generalfeedback
     * @param string $idnumber
     * @return string
     */
    private static function multichoice_xml(
        string $name,
        string $questiontext,
        string $generalfeedback,
        string $idnumber = ''
    ): string {
        return <<<XML
<?xml version="1.0" encoding="UTF-8"?>
<quiz>
  <question type="multichoice">
    <name><text>{$name}</text></name>
    <questiontext format="html"><text><![CDATA[{$questiontext}]]></text></questiontext>
    <generalfeedback format="html"><text><![CDATA[{$generalfeedback}]]></text></generalfeedback>
    <defaultgrade>1.0000000</defaultgrade>
    <penalty>0.3333333</penalty>
    <hidden>0</hidden>
    <idnumber>{$idnumber}</idnumber>
    <single>true</single>
    <shuffleanswers>true</shuffleanswers>
    <answernumbering>abc</answernumbering>
    <correctfeedback format="html"><text></text></correctfeedback>
    <partiallycorrectfeedback format="html"><text></text></partiallycorrectfeedback>
    <incorrectfeedback format="html"><text></text></incorrectfeedback>
    <answer fraction="100" format="html">
      <text><![CDATA[4]]></text>
      <feedback format="html"><text><![CDATA[Richtig]]></text></feedback>
    </answer>
    <answer fraction="0" format="html">
      <text><![CDATA[5]]></text>
      <feedback format="html"><text><![CDATA[Falsch]]></text></feedback>
    </answer>
  </question>
</quiz>
XML;
    }
}
