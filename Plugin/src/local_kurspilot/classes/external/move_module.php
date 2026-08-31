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

use context_course;
use core_external\external_api;
use core_external\external_function_parameters;
use core_external\external_single_structure;
use core_external\external_value;
use moodle_exception;

defined('MOODLE_INTERNAL') || die();

/**
 * Schreibkern 13 (Spec 0015 Phase 3, Ticket #391): verschiebt eine Aktivitaet
 * in einen (anderen) Abschnitt, optional an eine bestimmte Position darin.
 *
 * Ticket #391 nennt cmactions::move_before()/move_end_section() als
 * Zielapi der 5.2-Nachfolge (MDL-86854). Auf dieser Instanz (echte
 * Moodle-5.0.8-Quelle, /opt/moodle/course/format/classes/local/cmactions.php)
 * fuehrt cmactions bisher nur rename()/set_visibility() - kein move. Der
 * tatsaechlich existierende, NICHT-deprecated Kommando-Bus fuer diese Aktion
 * ist {@see \core_courseformat\stateactions::cm_move()} - dieselbe Methode,
 * die core_courseformat\external\update_course ("core_courseformat_update_course",
 * von der JS-Kursbearbeitung genutzt) fuer die Aktion "cm_move" aufruft.
 * cm_move() prueft 'moodle/course:manageactivities' bereits selbst. Kein
 * direkter Aufruf von moveto_module() - das bleibt Moodles eigene interne
 * Implementierung hinter dieser Abstraktion.
 *
 * "position" bildet cmactions::move_before() nach: der Index (0-basiert) der
 * Aktivitaet im Zielabschnitt, VOR die verschoben wird. Ohne Angabe, mit
 * negativem Index oder mit Index >= Anzahl vorhandener Aktivitaeten entspricht
 * das move_end_section() - ans Ende des Zielabschnitts.
 *
 * @package    local_kurspilot
 * @copyright  2026 Kurspilot
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
final class move_module extends external_api {

    /**
     * @return external_function_parameters
     */
    public static function execute_parameters(): external_function_parameters {
        return new external_function_parameters([
            'cmid' => new external_value(PARAM_INT, 'Course module ID der zu verschiebenden Aktivitaet'),
            'sectionnum' => new external_value(PARAM_INT, 'Zielabschnittsnummer (0-basiert)'),
            'position' => new external_value(
                PARAM_INT,
                'Optionaler 0-basierter Zielindex im Zielabschnitt (vor die dort aktuell stehende Aktivitaet); '
                    . 'ohne Angabe ans Ende des Zielabschnitts',
                VALUE_DEFAULT,
                null,
                NULL_ALLOWED
            ),
        ]);
    }

    /**
     * @param int $cmid
     * @param int $sectionnum
     * @param int|null $position
     * @return array
     * @throws moodle_exception sectionnotfound
     */
    public static function execute(int $cmid, int $sectionnum, ?int $position = null): array {
        $params = self::validate_parameters(self::execute_parameters(), [
            'cmid' => $cmid,
            'sectionnum' => $sectionnum,
            'position' => $position,
        ]);

        $cm = get_coursemodule_from_id('', $params['cmid'], 0, false, MUST_EXIST);
        $context = context_course::instance($cm->course);
        self::validate_context($context);
        require_capability('local/kurspilot:use', $context);
        // Native Berechtigungspruefung: stateactions::cm_move() prueft
        // 'moodle/course:manageactivities' ohnehin selbst erneut - der
        // Aufruf hier ist billig und stellt sicher, dass eine fehlende
        // Berechtigung nicht hinter einer Positionsvalidierung versteckt
        // bleibt.
        require_capability('moodle/course:manageactivities', $context);

        $course = get_course($cm->course);
        $modinfo = get_fast_modinfo($course);
        $sections = $modinfo->get_section_info_all();
        // Eigene Kurspilot-Fehlermeldung statt get_section_info(...,
        // MUST_EXIST) - dieselbe Fehlerstrategie (deutsche, mit
        // describe-naheliegender Meldung) wie update_section/move_section
        // fuer denselben Fall "Zielabschnitt existiert nicht".
        if (!array_key_exists($params['sectionnum'], $sections)) {
            throw new moodle_exception('sectionnotfound', 'local_kurspilot', '', ['sectionnum' => $params['sectionnum']]);
        }
        $targetsection = $sections[$params['sectionnum']];

        $targetcmids = $modinfo->sections[$params['sectionnum']] ?? [];
        // Die eigene cmid darf im Zielabschnitt (Verschiebung innerhalb
        // desselben Abschnitts) nicht als "vor sich selbst"-Ziel gezaehlt
        // werden, sonst wird eine Positionsangabe hinter der eigenen
        // aktuellen Stelle um eins verschoben.
        $targetcmids = array_values(array_filter($targetcmids, static fn (int $id): bool => $id !== $cm->id));

        $position = $params['position'];
        $targetcmid = null;
        if ($position !== null && $position >= 0 && $position < count($targetcmids)) {
            $targetcmid = $targetcmids[$position];
        }

        $format = course_get_format($course);
        $updates = $format->get_stateupdates_instance();
        $actions = $format->get_stateactions_instance();
        $actions->cm_move($updates, $course, [$cm->id], $targetsection->id, $targetcmid);

        $sectionname = $format->get_section_name($targetsection);
        $positionmeldung = $targetcmid !== null
            ? " an Position {$position}"
            : '';

        return [
            'cmid' => (int) $cm->id,
            'sectionnum' => (int) $params['sectionnum'],
            'meldung' => "Aktivität \"{$cm->name}\" in Abschnitt \"{$sectionname}\"{$positionmeldung} verschoben.",
        ];
    }

    /**
     * @return external_single_structure
     */
    public static function execute_returns(): external_single_structure {
        return new external_single_structure([
            'cmid' => new external_value(PARAM_INT, 'Course module ID der verschobenen Aktivitaet'),
            'sectionnum' => new external_value(PARAM_INT, 'Zielabschnittsnummer'),
            'meldung' => new external_value(PARAM_RAW, 'Lehrkraft-deutsche Aenderungsmeldung'),
        ]);
    }
}
