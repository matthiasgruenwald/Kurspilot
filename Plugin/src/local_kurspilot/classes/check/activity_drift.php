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

namespace local_kurspilot\check;

use core\check\check;
use core\check\result;
use local_kurspilot\write_gate;

defined('MOODLE_INTERNAL') || die();

/**
 * Eine Moodle-Admin-Statusprüfung (Standard-Callback
 * "<component>_status_checks()", siehe local_kurspilot/lib.php) je
 * katalogisierter Aktivitätsart (Ticket #399: "Admin-Statusprüfung zeigt je
 * Aktivitätsart einen der drei Zustände").
 *
 * Rechnet bei jedem Seitenaufruf frisch (ueber {@see write_gate::status_for()},
 * dessen eigene Versions-Zwischenspeicherung bereits dafuer sorgt, dass kein
 * unnoetiger DB-/Reflection-Aufwand entsteht) - kein Cron, "jederzeit
 * abrufbar" ist einfach: die Statusseite neu laden.
 *
 * @package    local_kurspilot
 * @copyright  2026 Kurspilot
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
final class activity_drift extends check {

    /**
     * @param string $modname Moodle-Modulname (mod_XXX ohne Praefix).
     */
    public function __construct(private readonly string $modname) {
    }

    /**
     * Eindeutig je Instanz (Ticket #399: eine Pruefung je Aktivitätsart).
     *
     * @return string
     */
    public function get_id(): string {
        return 'activity_drift_' . $this->modname;
    }

    /**
     * @return string
     */
    public function get_name(): string {
        return get_string('driftcheckname', 'local_kurspilot', $this->modname);
    }

    /**
     * @return result
     */
    public function get_result(): result {
        $status = write_gate::status_for($this->modname);

        return match ($status['zustand']) {
            'geprueft' => new result(result::OK, get_string('driftstatusgeprueft', 'local_kurspilot')),
            'automatisch_geprueft' => new result(
                result::OK,
                get_string('driftstatusautomatischgeprueft', 'local_kurspilot')
            ),
            default => new result(
                result::ERROR,
                get_string('driftstatusbrauchtarbeit', 'local_kurspilot'),
                implode("\n", $status['verstoesse'])
            ),
        };
    }
}
