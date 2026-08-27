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
 * Aenderungsverlauf (#385/#386/#387, Spec 0015 §10): jedes course_module_updated
 * schnappt einen Vollstand, egal ob Formularweg, Kursseite,
 * Massenbearbeitung, Handaenderung oder spaeter ein Kurspilot-Schreibvorgang
 * ueber denselben Weg. course_module_created legt Version 1 direkt beim
 * Anlegen an (#386) - fuer Bestandsaktivitaeten ohne dieses Ereignis holt
 * course_module_updated die fehlende Version rueckwirkend als
 * Vorgefunden-Stand nach. course_module_deleted und course_deleted loeschen
 * den Verlauf mit (#387, Kaskade).
 *
 * @package    local_kurspilot
 * @copyright  2026 Kurspilot
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

defined('MOODLE_INTERNAL') || die();

$observers = [
    [
        'eventname' => '\core\event\course_module_created',
        'callback' => '\local_kurspilot\observer::course_module_created',
    ],
    [
        'eventname' => '\core\event\course_module_updated',
        'callback' => '\local_kurspilot\observer::course_module_updated',
    ],
    [
        'eventname' => '\core\event\course_module_deleted',
        'callback' => '\local_kurspilot\observer::course_module_deleted',
    ],
    [
        'eventname' => '\core\event\course_deleted',
        'callback' => '\local_kurspilot\observer::course_deleted',
    ],
];
