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
use local_coursepilot\external\get_course_catalog as coursepilot_catalog;

defined('MOODLE_INTERNAL') || die();

/**
 * Kurskatalog serverseitig (#341): reine Delegation an das bereits
 * vertraglich geprüfte lokale Werkzeug lokal_coursepilot_get_course_catalog.
 *
 * Absichtlich KEINE eigene Datenlogik: Feldnamen, Maskierung des
 * Personenbezugs (local_coursepilot\availability_privacy::sanitize(),
 * bereits von der delegierten Klasse aufgerufen) und
 * detail=compact/full-Verhalten sind damit garantiert identisch zum lokalen
 * Werkzeug, statt es zu duplizieren und driften zu lassen (#341,
 * Vertragskriterium).
 *
 * Die Capability-Pruefung bleibt trotzdem EIGENE Verantwortung dieser
 * Klasse: db/services.php und privacy_surface::ALLOWED_TOOLS deklarieren
 * lokal/kurspilot:use fuer diesen Webservice - waere execute() eine reine
 * Weiterleitung ohne eigene Pruefung, wuerde ausschliesslich
 * local/coursepilot:use (die Capability der delegierten Klasse) durchsetzen
 * und die eigene Capability-Deklaration waere reine Metadaten ohne
 * Wirkung (Fund aus dem Code-Review zu #341). Analog zu list_courses.php.
 *
 * @package    local_kurspilot
 * @copyright  2026 Kurspilot
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class get_course_catalog extends external_api {

    /**
     * @return external_function_parameters
     */
    public static function execute_parameters(): external_function_parameters {
        return coursepilot_catalog::execute_parameters();
    }

    /**
     * @param int $courseid
     * @param int $sectionnum
     * @param string $modname
     * @param string $detail
     * @return array
     */
    public static function execute(
        int $courseid,
        int $sectionnum = -1,
        string $modname = '',
        string $detail = 'compact'
    ): array {
        $context = context_course::instance($courseid);
        self::validate_context($context);
        require_capability('local/kurspilot:use', $context);

        return coursepilot_catalog::execute($courseid, $sectionnum, $modname, $detail);
    }

    /**
     * @return external_single_structure
     */
    public static function execute_returns(): external_single_structure {
        return coursepilot_catalog::execute_returns();
    }
}
