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
 * Admin-Einstellungen: Notbremse fuer den Fernzugriff (#296, Punkt 2/3) und
 * die Personenbezugs-Freigabe fuer Kontextdateien (#298, Punkt 4).
 *
 * @package    local_kurspilot
 * @copyright  2026 Kurspilot
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

defined('MOODLE_INTERNAL') || die();

if ($hassiteconfig) {
    $settings = new admin_settingpage('local_kurspilot', get_string('pluginname', 'local_kurspilot'));
    $ADMIN->add('localplugins', $settings);

    // Notbremse: sperrt sofort, stateless - Tokens bleiben in der DB
    // gueltig, mcp.php prueft dieses Setting bei jedem Aufruf (#296, Punkt 3).
    $settings->add(new admin_setting_configcheckbox(
        'local_kurspilot/remoteaccess',
        get_string('settingremoteaccess', 'local_kurspilot'),
        get_string('settingremoteaccessdesc', 'local_kurspilot'),
        1
    ));

    // Standard aus (#298, Punkt 4). Noch ohne Wirkung: kein Kontextdatei-
    // Werkzeug ist in local_kurspilot bislang gebaut (V1-Oberflaeche ist nur
    // kurspilot_list_courses). Schon hier angelegt, damit der Consent-Screen
    // (#298 Textbaustein) den echten Stand zeigt statt eine Einstellung zu
    // erfinden, die es noch nicht gibt.
    $settings->add(new admin_setting_configcheckbox(
        'local_kurspilot/allowpersonaldata',
        get_string('settingallowpersonaldata', 'local_kurspilot'),
        get_string('settingallowpersonaldatadesc', 'local_kurspilot'),
        0
    ));
}
