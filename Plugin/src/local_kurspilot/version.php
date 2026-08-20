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

/**
 * Kurspilot: MCP-Endpunkt auf dem Moodle-Server.
 *
 * @package    local_kurspilot
 * @copyright  2026 Kurspilot
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

defined('MOODLE_INTERNAL') || die();

$plugin->component = 'local_kurspilot';
$plugin->version   = 2026082005;
// Nur Moodle 5.0 wird zugesagt (#300, Punkt 10). Keine aeltere Version.
$plugin->requires  = 2025041400;
$plugin->maturity  = MATURITY_ALPHA;
$plugin->release   = '0.1.0';
// #341: kurspilot_get_course_catalog delegiert an local_coursepilot\external\
// get_course_catalog - harte Abhaengigkeit, sonst Fatal Error statt sauberer
// Fehlermeldung, wenn local_coursepilot fehlt (Fund aus dem Code-Review).
$plugin->dependencies = [
    'local_coursepilot' => 2026081002,
];
