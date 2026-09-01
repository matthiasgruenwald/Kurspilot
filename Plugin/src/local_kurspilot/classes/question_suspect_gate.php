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

namespace local_kurspilot;

use core_external\external_multiple_structure;
use core_external\external_single_structure;
use core_external\external_value;

defined('MOODLE_INTERNAL') || die();

/**
 * Das gemeinsame Verdachtsfall-Gate-Antwortformat (ADR 0015, Spec 0017 §7.1,
 * Ticket #414) - "ein Gate, das je Endpunkt anders aussieht, sind vier
 * Gates". Ab diesem Ticket traegt {@see \local_kurspilot\external\move_question}
 * dieses Format; import_questions_xml, create_mc_question und die
 * Klon-Nachbereitung sollen es spaeter uebernehmen statt eigene Formen zu
 * bauen.
 *
 * Ein Verdachtsfall schreibt nichts - die Antwort nennt die mitgebrachte
 * idnumber, die Zielkategorie, nahe Kandidaten und, wo vorhanden, alten und
 * neuen Fragetext. Erst der erneute, ausdruecklich bestaetigte Aufruf
 * schreibt (Parameter "bestaetigt" je Endpunkt, wie ueberall im Bestand
 * z.B. set_completion, restore_activity_version).
 *
 * @package    local_kurspilot
 * @copyright  2026 Kurspilot
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
final class question_suspect_gate {

    /**
     * Felddefinitionen des Gates - von jedem Endpunkt in die eigene
     * execute_returns()-Struktur zu mischen (array_merge). Immer vorhanden
     * (mit leeren Standardwerten ausserhalb eines Verdachtsfalls), damit
     * jeder Endpunkt dieselbe feste Antwortform hat, unabhaengig davon, ob
     * gerade ein Verdachtsfall vorliegt.
     *
     * @return array<string, \core_external\external_description>
     */
    public static function response_fields(): array {
        return [
            'idnumber' => new external_value(
                PARAM_TEXT,
                'Mitgebrachte idnumber des Verdachtsfalls (leer ausserhalb eines Verdachtsfalls)',
                VALUE_DEFAULT,
                ''
            ),
            'categoryid' => new external_value(
                PARAM_INT,
                'Zielkategorie des Verdachtsfalls (0 ausserhalb eines Verdachtsfalls)',
                VALUE_DEFAULT,
                0
            ),
            'candidates' => new external_multiple_structure(
                new external_single_structure([
                    'questionid' => new external_value(PARAM_INT, 'questionid der aktuellsten Version des Kandidaten'),
                    'name' => new external_value(PARAM_TEXT, 'Fragename des Kandidaten'),
                    'idnumber' => new external_value(PARAM_TEXT, 'idnumber des Kandidaten'),
                ]),
                'Nahe Kandidaten in der Zielkategorie (leer ausserhalb eines Verdachtsfalls)',
                VALUE_DEFAULT,
                []
            ),
            'questiontext_old' => new external_value(
                PARAM_RAW,
                'Fragetext des bestehenden Kandidaten, wo vorhanden',
                VALUE_DEFAULT,
                ''
            ),
            'questiontext_new' => new external_value(
                PARAM_RAW,
                'Fragetext der zu schreibenden/verschobenen Frage, wo vorhanden',
                VALUE_DEFAULT,
                ''
            ),
        ];
    }

    /**
     * Leere Gate-Felder fuer den Nicht-Verdachtsfall - denselben Schluesseln
     * wie {@see response_fields()}, damit jeder Endpunkt eine feste
     * Antwortform ausliefert.
     *
     * @return array{idnumber: string, categoryid: int, candidates: array, questiontext_old: string, questiontext_new: string}
     */
    public static function empty_result(): array {
        return [
            'idnumber' => '',
            'categoryid' => 0,
            'candidates' => [],
            'questiontext_old' => '',
            'questiontext_new' => '',
        ];
    }

    /**
     * Sucht einen bestehenden Fragenbank-Eintrag mit derselben idnumber in
     * der Zielkategorie - ausser dem eigenen Eintrag (sonst waere jeder
     * Umzug einer Frage mit idnumber in ihre eigene Kategorie ein falscher
     * Treffer). Die (questioncategoryid, idnumber)-Kombination ist in Moodle
     * eindeutig indiziert - es kann also hoechstens einen Kandidaten geben.
     *
     * @param int $categoryid
     * @param string $idnumber
     * @param int $excludeentryid questionbankentryid, der nie als Kollision zaehlt
     * @return \stdClass|null {entryid, questionid, name, idnumber, questiontext} oder null ohne Kollision
     */
    public static function find_idnumber_collision(int $categoryid, string $idnumber, int $excludeentryid): ?\stdClass {
        global $DB;

        if ($idnumber === '') {
            return null;
        }

        $sql = 'SELECT qbe.id AS entryid, qbe.idnumber AS idnumber, q.id AS questionid, q.name AS name,
                       q.questiontext AS questiontext
                  FROM {question_bank_entries} qbe
                  JOIN {question_versions} qv ON qv.questionbankentryid = qbe.id
                  JOIN {question} q ON q.id = qv.questionid
                 WHERE qbe.questioncategoryid = :catid
                   AND qbe.idnumber = :idnumber
                   AND qbe.id <> :excludeentryid
              ORDER BY qv.version DESC';
        $rows = $DB->get_records_sql($sql, [
            'catid' => $categoryid,
            'idnumber' => $idnumber,
            'excludeentryid' => $excludeentryid,
        ], 0, 1);

        return $rows ? reset($rows) : null;
    }

    /**
     * Baut die Gate-Antwort (Verdachtsfall) aus einem Kollisionstreffer.
     *
     * @param \stdClass $collision Ergebnis von {@see find_idnumber_collision()}
     * @param int $categoryid Zielkategorie
     * @param string $newquestiontext Fragetext der zu schreibenden/verschobenen Frage
     * @return array{idnumber: string, categoryid: int, candidates: array, questiontext_old: string, questiontext_new: string}
     */
    public static function response(\stdClass $collision, int $categoryid, string $newquestiontext): array {
        return [
            'idnumber' => (string) $collision->idnumber,
            'categoryid' => $categoryid,
            'candidates' => [[
                'questionid' => (int) $collision->questionid,
                'name' => (string) $collision->name,
                'idnumber' => (string) $collision->idnumber,
            ]],
            'questiontext_old' => (string) $collision->questiontext,
            'questiontext_new' => $newquestiontext,
        ];
    }
}
