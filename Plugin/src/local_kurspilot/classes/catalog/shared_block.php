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

namespace local_kurspilot\catalog;

/**
 * Der modulübergreifende Block (Spec 0015 §2.3): Sichtbarkeit, Stealth,
 * Gruppenmodus, Gruppierung, idnumber und Abschnittszuordnung liegen in
 * {course_modules}, nicht in der Instanztabelle, laufen aber durch denselben
 * update_moduleinfo()-Formularweg. Er steht hier EINMAL und wird von
 * describe_module_fields jeder Aktivitätsart angehängt - keine
 * Modultyp-Klasse dupliziert ihn (Abnahmekriterium #379).
 *
 * "coursepagevisibility" ist kein DB-Feld, sondern die von den Lese-Werkzeugen
 * (get_course_catalog, lib/core-tools.js) verwendete Vokabel fuer den aus
 * visible/visibleoncoursepage abgeleiteten Zustand - hier als Pseudofeld
 * gefuehrt, damit Katalog und Lese-Tools dasselbe Wort benutzen (Spec 0015
 * §3.5 "ein Vokabular").
 *
 * @package    local_kurspilot
 * @copyright  2026 Kurspilot
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
final class shared_block {

    /**
     * Durchgängig gesperrte Felder (Spec 0015 §2.2, Kategorie 3): jedes
     * Modul rechnet sie selbst nach, ein Patch darf sie nicht setzen.
     *
     * Die fünf "completion*"-Spalten (Spec 0015 §8, Ticket #382) sind
     * course_modules-Spalten wie visible/groupmode - modulübergreifend, aber
     * gesperrt statt im gemeinsamen Block als Feld geführt: ohne
     * "completionunlocked" verwirft Moodle sie still, mit ihm löscht es die
     * Vervollständigungsdaten der Lernenden. Geschrieben wird erst über den
     * künftigen `set_completion`-Endpunkt im benannten Zweitakt.
     *
     * @var string[]
     */
    public const BLOCKLIST = [
        'timemodified',
        'timecreated',
        'course',
        'completion',
        'completionview',
        'completionexpected',
        'completiongradeitemnumber',
        'completionpassgrade',
    ];

    /**
     * Kategorie 1 des gemeinsamen Blocks: echte course_modules-Spalten.
     *
     * @return field[]
     */
    public static function fields(): array {
        return [
            new field(
                'visible',
                'PARAM_BOOL',
                'Im Kurs sichtbar (1) oder fuer Lernende verborgen (0).',
                false,
                1,
                [0, 1],
                null,
                'lib/db/install.xml:333 (course_modules.visible)'
            ),
            new field(
                'visibleoncoursepage',
                'PARAM_BOOL',
                'Stealth: bei 0 ist die Aktivitaet erreichbar (falls verlinkt oder als Voraussetzung '
                    . 'genutzt), erscheint aber nicht in der Kursseitenliste.',
                false,
                1,
                [0, 1],
                null,
                'lib/db/install.xml:334 (course_modules.visibleoncoursepage)'
            ),
            new field(
                'groupmode',
                'PARAM_INT',
                'Gruppenmodus: keine Gruppen, getrennte Gruppen oder sichtbare Gruppen.',
                false,
                0,
                [0, 1, 2],
                null,
                'lib/grouplib.php:29,34,39 (NOGROUPS/SEPARATEGROUPS/VISIBLEGROUPS); Spalte lib/db/install.xml:336'
            ),
            new field(
                'groupingid',
                'PARAM_INT',
                'Gruppierung, der die Aktivitaet zugeordnet ist (0 = keine). Nur IDs, keine Namen.',
                false,
                0,
                null,
                null,
                'lib/db/install.xml:337 (course_modules.groupingid)'
            ),
            new field(
                'idnumber',
                'PARAM_RAW',
                'Frei vergebene Kennung der Aktivitaet, u.a. fuer Bewertungsberechnungen.',
                false,
                '',
                null,
                null,
                'lib/db/install.xml:329 (course_modules.idnumber)'
            ),
            new field(
                'sectionnum',
                'PARAM_INT',
                'Abschnittsnummer (0-basiert), der die Aktivitaet zugeordnet ist.',
                false,
                null,
                null,
                null,
                'course/modlib.php:799 (Formularfeld "section", relative Abschnittsnummer, nicht die course_sections-ID)'
            ),
        ];
    }

    /**
     * Kategorie 2 des gemeinsamen Blocks.
     *
     * @return field[]
     */
    public static function pseudofields(): array {
        return [
            new field(
                'coursepagevisibility',
                'string',
                'Von den Lese-Werkzeugen verwendeter, aus visible/visibleoncoursepage abgeleiteter Zustand: '
                    . '"shown" (normal auf der Kursseite) oder "stealth" (verfuegbar, aber nicht gelistet).',
                false,
                'shown',
                ['shown', 'stealth'],
                null,
                'lib/core-tools.js (Kurspilot-Vokabular, keine eigene Moodle-Spalte; wirkt auf visibleoncoursepage)'
            ),
        ];
    }

    /**
     * Kategorie 5 des gemeinsamen Blocks.
     *
     * @return string[]
     */
    public static function side_effects(): array {
        return [
            'Stealth setzt voraus, dass die Instanz allowstealth erlaubt; ist es aus, scheitert der '
                . 'Schreibvorgang mit einer klaren Meldung statt still zu wirken (Spec 0015 §7).',
            'Ein unsichtbarer Abschnitt macht seine Aktivitaeten unsichtbar, unabhaengig von deren '
                . 'eigenem visible-Wert (Spec 0015 §6).',
        ];
    }
}
