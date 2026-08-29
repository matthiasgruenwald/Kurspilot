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
 * Capabilities (Kartenentscheidung #296).
 *
 * @package    local_kurspilot
 * @copyright  2026 Kurspilot
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

defined('MOODLE_INTERNAL') || die();

$capabilities = [
    // Kursbezogene Tool-Calls.
    'local/kurspilot:use' => [
        'captype' => 'read',
        'contextlevel' => CONTEXT_COURSE,
        'archetypes' => [
            'editingteacher' => CAP_ALLOW,
            'teacher' => CAP_ALLOW,
        ],
    ],
    // Fernzugriff ueber den MCP-Endpunkt - systemweit abschaltbar, ohne
    // einzelne Kurse anzufassen (#296, Punkt 1).
    'local/kurspilot:useremote' => [
        'captype' => 'read',
        'contextlevel' => CONTEXT_SYSTEM,
        'archetypes' => [
            'editingteacher' => CAP_ALLOW,
            'teacher' => CAP_ALLOW,
        ],
    ],
    // Einsicht in den Aenderungsverlauf einer Aktivitaet (#394, Spec 0015
    // §10.6) - eigene Faehigkeit statt local/kurspilot:use, weil Spec 0015
    // §10.6 fuer den Verlauf ausdruecklich eigene Faehigkeiten vorsieht.
    'local/kurspilot:viewhistory' => [
        'captype' => 'read',
        'contextlevel' => CONTEXT_COURSE,
        'archetypes' => [
            'editingteacher' => CAP_ALLOW,
            'teacher' => CAP_ALLOW,
        ],
    ],
    // Rueckkehr zu einer frueheren Version einer Aktivitaet (#395, Spec 0015
    // §10.7) - eigene Faehigkeit wie local/kurspilot:use bei allen anderen
    // Schreibwerkzeugen: prueft nur "darf dieses Werkzeug ueberhaupt nutzen",
    // die eigentliche Schreibberechtigung liefert zusaetzlich
    // moodle/course:manageactivities.
    'local/kurspilot:restoreversion' => [
        'captype' => 'read',
        'contextlevel' => CONTEXT_COURSE,
        'archetypes' => [
            'editingteacher' => CAP_ALLOW,
            'teacher' => CAP_ALLOW,
        ],
    ],
];
