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

use local_kurspilot\history\version_writer;

defined('MOODLE_INTERNAL') || die();

/**
 * Beobachter fuer den Aenderungsverlauf (#385, Spec 0015 §10.8): serialisiert
 * nur den Ist-Stand in die Schnappschuss-Tabellen, ruft weder MCP-Werkzeuge
 * noch Webservices auf.
 *
 * @package    local_kurspilot
 * @copyright  2026 Kurspilot
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
final class observer {

    /**
     * Version 1 entsteht beim Anlegen (#386, Spec 0015 §10.3): fuer Aktivitaeten,
     * die es erst seit Einfuehrung des Verlaufs gibt, greift beim ersten
     * course_module_updated deshalb nicht mehr die Vorgefunden-Logik.
     *
     * @param \core\event\course_module_created $event
     * @return void
     */
    public static function course_module_created(\core\event\course_module_created $event): void {
        version_writer::capture((int) $event->objectid, (int) $event->userid);
    }

    /**
     * @param \core\event\course_module_updated $event
     * @return void
     */
    public static function course_module_updated(\core\event\course_module_updated $event): void {
        version_writer::capture_on_update((int) $event->objectid, (int) $event->userid);
    }
}
