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
 * Der XML-Kern (Spec 0017 §7.1, Ticket #415).
 *
 * @package    local_kurspilot
 * @copyright  2026 Kurspilot
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
#[\PHPUnit\Framework\Attributes\CoversClass(import_questions_xml::class)]
final class import_questions_xml_test extends \advanced_testcase {

    /**
     * Erstimport ohne idnumber: legt einen neuen Bank-Eintrag mit
     * generierter idnumber an (Version 1).
     */
    public function test_first_import_creates_new_entry_with_generated_idnumber(): void {
        $this->resetAfterTest();

        [, $categoryid] = $this->setup_course_and_category();
        $xml = self::multichoice_xml('Erstimport-Frage', 'Was ist 2+2?', 'Allgemeines Feedback');

        $result = import_questions_xml::execute($categoryid, $xml);
        $result = external_api::clean_returnvalue(import_questions_xml::execute_returns(), $result);

        $this->assertCount(1, $result['questions']);
        $question = $result['questions'][0];
        $this->assertSame('erstimport', $question['status']);
        $this->assertSame('Erstimport-Frage', $question['name']);
        $this->assertSame(1, $question['version']);
        $this->assertGreaterThan(0, $question['questionbankentryid']);

        global $DB;
        $entry = $DB->get_record('question_bank_entries', ['id' => $question['questionbankentryid']], '*', MUST_EXIST);
        $this->assertNotEmpty($entry->idnumber, 'Eine idnumber wurde generiert.');
    }

    /**
     * Reimport mit passender idnumber: neue Version desselben Bank-Eintrags,
     * kein zweiter Eintrag.
     */
    public function test_reimport_with_matching_idnumber_creates_new_version(): void {
        $this->resetAfterTest();

        [, $categoryid] = $this->setup_course_and_category();
        // Erstimport ohne idnumber im XML - genau wie ein echter Erstimport,
        // eine idnumber wird generiert (siehe erster Test).
        $xml1 = self::multichoice_xml('Reimport-Frage', 'Alte Fassung', 'Feedback');

        $first = import_questions_xml::execute($categoryid, $xml1);
        $first = external_api::clean_returnvalue(import_questions_xml::execute_returns(), $first);
        $this->assertSame('erstimport', $first['questions'][0]['status']);
        $entryid = $first['questions'][0]['questionbankentryid'];

        global $DB;
        $generatedidnumber = $DB->get_field('question_bank_entries', 'idnumber', ['id' => $entryid], MUST_EXIST);

        // Reimport traegt dieselbe (generierte) idnumber mit - genau wie ein
        // Export/Korrektur-Zyklus derselben Frage.
        $xml2 = self::multichoice_xml('Reimport-Frage', 'Korrigierte Fassung', 'Feedback', $generatedidnumber);
        $second = import_questions_xml::execute($categoryid, $xml2);
        $second = external_api::clean_returnvalue(import_questions_xml::execute_returns(), $second);

        $this->assertSame('reimport', $second['questions'][0]['status']);
        $this->assertSame($entryid, $second['questions'][0]['questionbankentryid']);
        $this->assertSame(2, $second['questions'][0]['version']);

        global $DB;
        $versions = $DB->get_records('question_versions', ['questionbankentryid' => $entryid]);
        $this->assertCount(2, $versions, 'Genau eine neue Version, kein neuer Bank-Eintrag.');
    }

    /**
     * Ein Parse-Fehler bricht den gesamten Aufruf ab - kein Teilergebnis,
     * nichts geschrieben.
     */
    public function test_parse_error_aborts_whole_call(): void {
        $this->resetAfterTest();

        [, $categoryid] = $this->setup_course_and_category();

        global $DB;
        $countbefore = $DB->count_records('question_bank_entries', ['questioncategoryid' => $categoryid]);

        $this->expectException(\invalid_parameter_exception::class);
        try {
            import_questions_xml::execute($categoryid, 'das ist kein XML');
        } finally {
            $countafter = $DB->count_records('question_bank_entries', ['questioncategoryid' => $categoryid]);
            $this->assertSame($countbefore, $countafter, 'Nichts wurde geschrieben.');
        }
    }

    /**
     * Verdachtsfall: mitgebrachte idnumber ohne Treffer in der Zielkategorie
     * schreibt ohne Bestaetigung nichts.
     */
    public function test_suspect_case_without_confirmation_writes_nothing(): void {
        $this->resetAfterTest();

        [, $categoryid] = $this->setup_course_and_category();

        global $DB;
        $countbefore = $DB->count_records('question_bank_entries', ['questioncategoryid' => $categoryid]);

        $xml = self::multichoice_xml('Verdachtsfall-Frage', 'Fragetext', 'Feedback', 'q-415-unbekannt');
        $result = import_questions_xml::execute($categoryid, $xml);
        $result = external_api::clean_returnvalue(import_questions_xml::execute_returns(), $result);

        $question = $result['questions'][0];
        $this->assertSame('verdachtsfall', $question['status']);
        $this->assertSame(0, $question['questionbankentryid']);
        $this->assertSame('q-415-unbekannt', $question['idnumber']);
        $this->assertSame($categoryid, $question['categoryid']);

        $countafter = $DB->count_records('question_bank_entries', ['questioncategoryid' => $categoryid]);
        $this->assertSame($countbefore, $countafter, 'Nichts wurde geschrieben.');
    }

    /**
     * Bestaetigter Zweitaufruf legt den Verdachtsfall als neuen Eintrag an.
     */
    public function test_confirmed_call_creates_entry_despite_suspect_case(): void {
        $this->resetAfterTest();

        [, $categoryid] = $this->setup_course_and_category();

        $xml = self::multichoice_xml('Bestaetigte Frage', 'Fragetext', 'Feedback', 'q-415-bestaetigt');
        $unconfirmed = import_questions_xml::execute($categoryid, $xml);
        $unconfirmed = external_api::clean_returnvalue(import_questions_xml::execute_returns(), $unconfirmed);
        $this->assertSame('verdachtsfall', $unconfirmed['questions'][0]['status']);

        $confirmed = import_questions_xml::execute($categoryid, $xml, true);
        $confirmed = external_api::clean_returnvalue(import_questions_xml::execute_returns(), $confirmed);

        $this->assertSame('erstimport', $confirmed['questions'][0]['status']);
        $this->assertGreaterThan(0, $confirmed['questions'][0]['questionbankentryid']);

        global $DB;
        $entry = $DB->get_record(
            'question_bank_entries',
            ['id' => $confirmed['questions'][0]['questionbankentryid']],
            '*',
            MUST_EXIST
        );
        $this->assertSame('q-415-bestaetigt', $entry->idnumber);
    }

    /**
     * Eine fehlgeschlagene Round-Trip-Pruefung rollt alles zurueck - weder
     * Bank-Eintrag noch Version bleiben zurueck. Ausgeloest durch ein XML
     * ohne Fragenamen: question_type::save_question() generiert in diesem
     * Fall selbst einen Namen aus dem Fragetext - genau die Art stiller
     * Abweichung, die die Round-Trip-Pruefung fangen soll.
     */
    public function test_failed_roundtrip_check_leaves_nothing_behind(): void {
        $this->resetAfterTest();

        [, $categoryid] = $this->setup_course_and_category();

        global $DB;
        $countbefore = $DB->count_records('question_bank_entries', ['questioncategoryid' => $categoryid]);

        $xml = self::multichoice_xml('', 'Fragetext ohne Namen im XML', 'Feedback');

        $this->expectException(\moodle_exception::class);
        try {
            import_questions_xml::execute($categoryid, $xml);
        } finally {
            $countafter = $DB->count_records('question_bank_entries', ['questioncategoryid' => $categoryid]);
            $this->assertSame($countbefore, $countafter, 'Nichts wurde geschrieben.');
        }
    }

    /**
     * Baut Kurs + Lehrkraft + Fragensammlung + Kategorie auf und liefert
     * [$course, $categoryid].
     *
     * @return array{0: \stdClass, 1: int}
     */
    private function setup_course_and_category(): array {
        $course = $this->getDataGenerator()->create_course();
        $teacher = $this->getDataGenerator()->create_user();
        $this->getDataGenerator()->enrol_user($teacher->id, $course->id, 'editingteacher');
        $this->setUser($teacher);

        $bank = ensure_question_bank::execute($course->id, 'XML-Kern-Test');
        $bank = external_api::clean_returnvalue(ensure_question_bank::execute_returns(), $bank);

        $category = ensure_question_category::execute('Kategorie', (int) $bank['topcategoryid']);
        $category = external_api::clean_returnvalue(ensure_question_category::execute_returns(), $category);

        return [$course, (int) $category['id']];
    }

    /**
     * Baut ein minimales Moodle-XML mit einer einzelnen multichoice-Frage.
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
