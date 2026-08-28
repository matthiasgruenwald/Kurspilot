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

use context_module;
use core_external\external_api;
use core_external\external_function_parameters;
use core_external\external_multiple_structure;
use core_external\external_single_structure;
use core_external\external_value;
use local_kurspilot\history\version_history;

defined('MOODLE_INTERNAL') || die();

/**
 * Mehrversionen-Ueberblick des Aenderungsverlaufs (Spec 0015 §10.6, Ticket
 * #394): alle Versionen einer Aktivitaet mit je einem serverseitig
 * berechneten Einzeiler gegenueber dem Vorgaenger. Rein lesend, eigene
 * Faehigkeit 'local/kurspilot:viewhistory' statt 'local/kurspilot:use'
 * (Spec 0015 §10.6 sieht fuer den Verlauf ausdruecklich eigene Faehigkeiten
 * vor).
 *
 * @package    local_kurspilot
 * @copyright  2026 Kurspilot
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class list_activity_versions extends external_api {

    /**
     * @return external_function_parameters
     */
    public static function execute_parameters(): external_function_parameters {
        return new external_function_parameters([
            'cmid' => new external_value(PARAM_INT, 'Course module ID der Aktivitaet'),
        ]);
    }

    /**
     * @param int $cmid
     * @return array
     */
    public static function execute(int $cmid): array {
        $params = self::validate_parameters(self::execute_parameters(), ['cmid' => $cmid]);

        $cm = get_coursemodule_from_id('', $params['cmid'], 0, false, MUST_EXIST);
        $context = context_module::instance($cm->id);
        self::validate_context($context);
        require_capability('local/kurspilot:viewhistory', $context);

        return version_history::list_versions($params['cmid']);
    }

    /**
     * @return external_single_structure
     */
    public static function execute_returns(): external_single_structure {
        return new external_single_structure([
            'cmid' => new external_value(PARAM_INT, 'Course module ID'),
            'modname' => new external_value(PARAM_TEXT, 'Aktivitaetstyp'),
            'versionen' => new external_multiple_structure(
                new external_single_structure([
                    'version' => new external_value(PARAM_INT, 'Fortlaufende Versionsnummer je cmid, beginnend bei 1'),
                    'quelle' => new external_value(
                        PARAM_TEXT,
                        '"moodle" (normaler Schreibvorgang) oder "vorgefunden" (rueckwirkend angelegter Ausgangsstand vor Kurspilot)'
                    ),
                    'vorgefunden' => new external_value(
                        PARAM_BOOL,
                        'true, wenn dieser Stand rueckwirkend als Ausgangsstand angelegt wurde (source = "vorgefunden")'
                    ),
                    'userid' => new external_value(PARAM_INT, 'Nutzer-ID, unter der der Schreibvorgang lief'),
                    'nutzer' => new external_value(PARAM_TEXT, 'Voller Name dieser Nutzerin/dieses Nutzers'),
                    'zeitpunkt' => new external_value(PARAM_INT, 'Unix-Zeitstempel des Schreibvorgangs'),
                    'einzeiler' => new external_value(
                        PARAM_TEXT,
                        'Serverseitig aus den Vollstaenden berechnete Lehrkraft-deutsche Aenderungszeile '
                            . 'gegenueber dem direkten Vorgaenger (wer, wann, wodurch)'
                    ),
                ]),
                'Je Version ein Eintrag, aufsteigend nach Versionsnummer sortiert'
            ),
            'hinweis_luecken' => new external_value(
                PARAM_TEXT,
                'Fester Hinweis auf die strukturellen Luecken des Verlaufs - nicht pro Version berechnet'
            ),
        ]);
    }
}
