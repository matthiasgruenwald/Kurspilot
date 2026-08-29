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
 * Moodle-Callback-Bibliothek.
 *
 * @package    local_kurspilot
 * @copyright  2026 Kurspilot
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

defined('MOODLE_INTERNAL') || die();

/**
 * Verlinkt die Selbstverwaltungsseite (#338) im eigenen Profil - nur in der
 * eigenen Ansicht, nie im fremden Profil (Moodle ruft diesen Callback pro
 * betrachtetem Profil auf; $iscurrentuser unterscheidet).
 *
 * @param \core_user\output\myprofile\tree $tree
 * @param stdClass $user
 * @param bool $iscurrentuser
 * @param stdClass|null $course
 * @return bool
 */
function local_kurspilot_myprofile_navigation(
    \core_user\output\myprofile\tree $tree,
    $user,
    $iscurrentuser,
    $course
): bool {
    if (!$iscurrentuser) {
        return false;
    }

    $node = new \core_user\output\myprofile\node(
        'miscellaneous',
        'local_kurspilot_connections',
        get_string('myconnections', 'local_kurspilot'),
        null,
        new moodle_url('/local/kurspilot/connections.php')
    );
    $tree->add_node($node);
    return true;
}

/**
 * Verlinkt die Verlaufsseite (#397, Spec 0015 §10.6/§10.7) in der
 * Kursnavigation - nur sichtbar mit local/kurspilot:viewhistory, damit die
 * Seite fuer Nutzer ohne diese Faehigkeit gar nicht erst als Link auftaucht
 * (require_capability() auf history.php selbst greift zusaetzlich, auch bei
 * direktem URL-Aufruf).
 *
 * @param \navigation_node $navigation
 * @param \stdClass $course
 * @param \context_course $context
 * @return void
 */
function local_kurspilot_extend_navigation_course(
    \navigation_node $navigation,
    \stdClass $course,
    \context_course $context
): void {
    if (!has_capability('local/kurspilot:viewhistory', $context)) {
        return;
    }

    $navigation->add(
        get_string('historynavnode', 'local_kurspilot'),
        new moodle_url('/local/kurspilot/history.php', ['id' => $course->id]),
        \navigation_node::TYPE_SETTING,
        null,
        'local_kurspilot_history'
    );
}
