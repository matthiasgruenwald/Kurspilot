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
 * Read-modify-write plus idnumber-Backfill fuer MC-Fragen (Spec 0017 §7.1,
 * Ticket #419).
 *
 * @package    local_kurspilot
 * @copyright  2026 Kurspilot
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
#[\PHPUnit\Framework\Attributes\CoversClass(update_mc_question::class)]
final class update_mc_question_test extends \advanced_testcase {

    /**
     * Kerntest: ein Patch, der nur "questiontext" nennt, laesst Name,
     * Antwortoptionen, Feedbacktexte und Teilbewertungen unveraendert - und
     * schreibt eine neue Version DESSELBEN Bank-Eintrags, keinen neuen.
     */
    public function test_partial_patch_preserves_untouched_fields_as_new_version_of_same_entry(): void {
        $this->resetAfterTest();

        [, $categoryid] = $this->setup_course_and_category();

        $created = create_mc_question::execute(
            $categoryid,
            'Additionsfrage',
            'Was ist 2+2?',
            'single',
            [
                ['answer' => '4', 'fraction' => 1.0, 'feedback' => 'Richtig'],
                ['answer' => '5', 'fraction' => 0.0, 'feedback' => 'Falsch'],
            ],
            2.5,
            'Allgemeines Feedback'
        );
        $created = external_api::clean_returnvalue(create_mc_question::execute_returns(), $created);
        $entryid = $created['questionbankentryid'];

        global $DB;
        $countbefore = $DB->count_records('question_bank_entries', ['questioncategoryid' => $categoryid]);

        $result = update_mc_question::execute(
            $created['questionid'],
            json_encode(['questiontext' => 'Was ist 3+4?'])
        );
        $result = external_api::clean_returnvalue(update_mc_question::execute_returns(), $result);

        $this->assertSame('aktualisiert', $result['status']);
        $this->assertSame($entryid, $result['questionbankentryid'], 'Neue Version DESSELBEN Bank-Eintrags.');
        $this->assertSame(2, $result['version']);
        $this->assertFalse($result['idnumber_nachgetragen']);

        $countafter = $DB->count_records('question_bank_entries', ['questioncategoryid' => $categoryid]);
        $this->assertSame($countbefore, $countafter, 'Kein neuer Bank-Eintrag, nur eine neue Version.');

        $readback = get_question::execute($categoryid, '', $result['questionid']);
        $readback = external_api::clean_returnvalue(get_question::execute_returns(), $readback);

        // Gepatchtes Feld geaendert ...
        $this->assertSame('Was ist 3+4?', $readback['questiontext']);
        // ... alles Uebrige unangetastet: Name, Teilbewertung (defaultmark),
        // allgemeines Feedback, Antwortoptionen inkl. Feedbacktexte.
        $this->assertSame('Additionsfrage', $readback['name']);
        $this->assertEqualsWithDelta(2.5, $readback['defaultmark'], 0.0001);
        $this->assertSame('Allgemeines Feedback', $readback['generalfeedback']);
        $this->assertSame('single', $readback['selectionmode']);
        $this->assertCount(2, $readback['answers']);
        $this->assertSame('4', $readback['answers'][0]['answer']);
        $this->assertEqualsWithDelta(1.0, $readback['answers'][0]['fraction'], 0.0001);
        $this->assertSame('Richtig', $readback['answers'][0]['feedback']);
        $this->assertSame('5', $readback['answers'][1]['answer']);
        $this->assertEqualsWithDelta(0.0, $readback['answers'][1]['fraction'], 0.0001);
        $this->assertSame('Falsch', $readback['answers'][1]['feedback']);
    }

    /**
     * Kein Rekonstruktionsrisiko: Felder, die weder von felder_json NOCH von
     * create_mc_question::build_xml()'s Vorlagenwerten abgedeckt sind
     * (penalty, shuffleanswers, answernumbering - vom Lehrkraft-Vokabular
     * dieses Endpunkts gar nicht adressierbar), bleiben exakt erhalten, weil
     * der native Fragenobjekt-Weg sie nie anfasst - anders als eine erneute
     * Text-XML-Vorlage, die sie stillschweigend auf feste Werte zuruecksetzen
     * wuerde.
     */
    public function test_patch_preserves_fields_outside_the_patchable_vocabulary(): void {
        $this->resetAfterTest();
        global $DB;

        [, $categoryid] = $this->setup_course_and_category();

        $created = create_mc_question::execute(
            $categoryid,
            'Vorlagenfrage',
            'Fragetext',
            'single',
            [
                ['answer' => 'a', 'fraction' => 1.0, 'feedback' => ''],
                ['answer' => 'b', 'fraction' => 0.0, 'feedback' => ''],
            ]
        );
        $created = external_api::clean_returnvalue(create_mc_question::execute_returns(), $created);

        // Sentinel-Werte, die von create_mc_question::build_xml() NIE gesetzt
        // werden (dort fest: penalty 0.3333333, shuffleanswers true,
        // answernumbering "abc") - direkt in der DB gesetzt, um einen
        // Fremdbestand mit abweichenden Werten zu simulieren.
        $DB->set_field('question', 'penalty', 0.5, ['id' => $created['questionid']]);
        $DB->set_field('qtype_multichoice_options', 'shuffleanswers', 0, ['questionid' => $created['questionid']]);
        $DB->set_field('qtype_multichoice_options', 'answernumbering', '123', ['questionid' => $created['questionid']]);

        $result = update_mc_question::execute(
            $created['questionid'],
            json_encode(['defaultmark' => 3.0])
        );
        $result = external_api::clean_returnvalue(update_mc_question::execute_returns(), $result);
        $this->assertSame('aktualisiert', $result['status']);

        $newpenalty = $DB->get_field('question', 'penalty', ['id' => $result['questionid']], MUST_EXIST);
        $newoptions = $DB->get_record(
            'qtype_multichoice_options', ['questionid' => $result['questionid']], '*', MUST_EXIST);

        $this->assertEqualsWithDelta(0.5, (float) $newpenalty, 0.0001, 'penalty blieb erhalten.');
        $this->assertEquals(0, $newoptions->shuffleanswers, 'shuffleanswers blieb erhalten.');
        $this->assertSame('123', $newoptions->answernumbering, 'answernumbering blieb erhalten.');
    }

    /**
     * idnumber-Backfill: eine vorgefundene Frage ohne idnumber (simulierter
     * Fremdbestand) bekommt beim ersten Schreibzugriff genau fuer sich eine
     * generiert - eine Nachbarfrage in derselben Kategorie bleibt unberuehrt.
     */
    public function test_idnumber_backfill_touches_only_the_one_question(): void {
        $this->resetAfterTest();
        global $DB;

        [, $categoryid] = $this->setup_course_and_category();

        $answers = [
            ['answer' => 'a', 'fraction' => 1.0, 'feedback' => ''],
            ['answer' => 'b', 'fraction' => 0.0, 'feedback' => ''],
        ];

        $target = create_mc_question::execute($categoryid, 'Fremdbestand-Frage', 'Frage A', 'single', $answers);
        $target = external_api::clean_returnvalue(create_mc_question::execute_returns(), $target);

        $neighbour = create_mc_question::execute($categoryid, 'Nachbarfrage', 'Frage B', 'single', $answers);
        $neighbour = external_api::clean_returnvalue(create_mc_question::execute_returns(), $neighbour);
        $neighbouridnumber = $DB->get_field(
            'question_bank_entries', 'idnumber', ['id' => $neighbour['questionbankentryid']], MUST_EXIST);

        // Simuliert einen Fremdbestand: die idnumber der Zielfrage fehlt.
        $DB->set_field('question_bank_entries', 'idnumber', null, ['id' => $target['questionbankentryid']]);
        $this->assertEmpty(
            $DB->get_field('question_bank_entries', 'idnumber', ['id' => $target['questionbankentryid']], MUST_EXIST));

        $result = update_mc_question::execute(
            $target['questionid'],
            json_encode(['name' => 'Frage A (korrigiert)'])
        );
        $result = external_api::clean_returnvalue(update_mc_question::execute_returns(), $result);

        $this->assertSame('aktualisiert', $result['status']);
        $this->assertTrue($result['idnumber_nachgetragen']);
        $this->assertSame($target['questionbankentryid'], $result['questionbankentryid'], 'Neue Version, kein neuer Eintrag.');

        $newidnumber = $DB->get_field(
            'question_bank_entries', 'idnumber', ['id' => $target['questionbankentryid']], MUST_EXIST);
        $this->assertNotEmpty($newidnumber, 'Genau diese eine Frage hat jetzt eine idnumber.');

        // Nachbarfrage in derselben Kategorie blieb unberuehrt.
        $unchangedneighbouridnumber = $DB->get_field(
            'question_bank_entries', 'idnumber', ['id' => $neighbour['questionbankentryid']], MUST_EXIST);
        $this->assertSame($neighbouridnumber, $unchangedneighbouridnumber);
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

        $bank = ensure_question_bank::execute($course->id, 'Update-MC-Test');
        $bank = external_api::clean_returnvalue(ensure_question_bank::execute_returns(), $bank);

        $category = ensure_question_category::execute('Kategorie', (int) $bank['topcategoryid']);
        $category = external_api::clean_returnvalue(ensure_question_category::execute_returns(), $category);

        return [$course, (int) $category['id']];
    }
}
