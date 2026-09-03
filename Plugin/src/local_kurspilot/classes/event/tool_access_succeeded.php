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

namespace local_kurspilot\event;

/**
 * Ein Kurspilot-Werkzeugaufruf ueber den MCP-Endpunkt ist erfolgreich
 * durchgelaufen (#339).
 *
 * Ueber die Moodle-Ereignis-API ausgeloest, damit der Zugriff nativ in den
 * Protokollberichten der Administration erscheint - kein zweites Werkzeug
 * noetig. Wird nur ausgeloest, wenn die Protokollstufe
 * ({@see \local_kurspilot\access_log}) mindestens "Lesezugriffe und Fehler"
 * ist.
 *
 * @property-read array $other {
 *      - string toolname: Name des aufgerufenen MCP-Werkzeugs.
 *      - string|null path: Dateipfad, wenn das Werkzeug einen Kontext- oder
 *        Materialordner-Pfad berührt hat (Spec 0018 §9.2), sonst null.
 * }
 *
 * @package    local_kurspilot
 * @copyright  2026 Kurspilot
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class tool_access_succeeded extends \core\event\base {

    /**
     * @return string
     */
    public function get_description() {
        return "Das Kurspilot-Werkzeug '{$this->other['toolname']}' wurde von Nutzer/in mit ID {$this->userid} erfolgreich aufgerufen.";
    }

    /**
     * @return string
     */
    public static function get_name() {
        return get_string('event_tool_access_succeeded', 'local_kurspilot');
    }

    /**
     * @return void
     */
    protected function init() {
        $this->data['crud'] = 'r';
        $this->data['edulevel'] = self::LEVEL_OTHER;
        $this->context = \context_system::instance();
    }

    /**
     * @return void
     * @throws \coding_exception
     */
    protected function validate_data() {
        parent::validate_data();
        if (!isset($this->other['toolname'])) {
            throw new \coding_exception('The \'toolname\' value must be set in other.');
        }
    }

    /**
     * @return false
     */
    public static function get_other_mapping() {
        return false;
    }
}
