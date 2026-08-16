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
 * Externer Dienst und Webservice-Funktionen.
 *
 * Die Funktionsliste muss deckungsgleich mit
 * {@see \local_kurspilot\privacy_surface::ALLOWED_TOOLS} sein - erzwungen
 * durch tests/privacy_surface_test.php.
 *
 * @package    local_kurspilot
 * @copyright  2026 Kurspilot
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

defined('MOODLE_INTERNAL') || die();

$functions = [
    'local_kurspilot_list_courses' => [
        'classname'   => 'local_kurspilot\external\list_courses',
        'description' => 'Lists the courses the calling teacher may use Kurspilot in.',
        'type'        => 'read',
        'ajax'        => false,
        'capabilities' => 'local/kurspilot:use',
    ],
];

$services = [
    'Kurspilot' => [
        'functions' => ['local_kurspilot_list_courses'],
        'restrictedusers' => 0,
        'enabled' => 1,
        'shortname' => 'kurspilot',
    ],
];
