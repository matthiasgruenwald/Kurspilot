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

use local_kurspilot\event\tool_access_failed;
use local_kurspilot\event\tool_access_succeeded;

/**
 * Protokollierung von Kurspilot-Zugriffen ueber die Moodle-Ereignis-API,
 * mit vier einstellbaren Stufen (#339), damit die nativen Protokollberichte
 * bei vielen Nutzenden nicht ueberlaufen.
 *
 * Einziger Aufrufer: dispatcher.php, an den beiden vorhandenen Antwort-
 * Funnelpunkten (error() fuer alle Fehlerantworten, handle_tools_call() fuer
 * Werkzeugerfolg/-fehler) - ponytail: kein Observer/Hook-Mechanismus, es
 * gibt genau eine Aufrufstelle je Ergebnisart.
 *
 * @package    local_kurspilot
 * @copyright  2026 Kurspilot
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
final class access_log {

    /** @var int Kein Protokoll. */
    public const LEVEL_NONE = 0;

    /** @var int Nur Fehler. */
    public const LEVEL_ERRORS = 1;

    /** @var int Lesezugriffe und Fehler (Voreinstellung). */
    public const LEVEL_READS = 2;

    /** @var int Alles. */
    public const LEVEL_ALL = 3;

    /**
     * Die konfigurierte Protokollstufe, mit "Lesezugriffe und Fehler" als
     * Voreinstellung fuer eine frische Installation (Konfigwert nie gesetzt).
     *
     * @return int
     */
    public static function current_level(): int {
        $level = get_config('local_kurspilot', 'loglevel');
        if ($level === false || $level === '') {
            return self::LEVEL_READS;
        }
        return (int) $level;
    }

    /**
     * Protokolliert einen erfolgreichen Werkzeugaufruf, sofern die Stufe es
     * verlangt (>= LEVEL_READS).
     *
     * ponytail: aktuell sind alle erlaubten Werkzeuge Lesezugriffe
     * (privacy_surface::ALLOWED_TOOLS); eine Unterscheidung read/write
     * anhand external_api::external_function_info() erst nachruesten, wenn
     * das erste schreibende Werkzeug dazukommt.
     *
     * @param string $toolname
     * @return void
     */
    public static function log_success(string $toolname): void {
        if (self::current_level() < self::LEVEL_READS) {
            return;
        }
        tool_access_succeeded::create(['other' => ['toolname' => $toolname]])->trigger();
    }

    /**
     * Protokolliert einen fehlgeschlagenen Zugriff, sofern die Stufe es
     * verlangt (>= LEVEL_ERRORS).
     *
     * @param string $reason Kurze, geheimnisfreie Fehlerbeschreibung.
     * @param string|null $toolname
     * @return void
     */
    public static function log_failure(string $reason, ?string $toolname = null): void {
        if (self::current_level() < self::LEVEL_ERRORS) {
            return;
        }
        tool_access_failed::create(['other' => ['reason' => $reason, 'toolname' => $toolname]])->trigger();
    }
}
