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
 * Selbstverwaltungsseite (#338): eine Lehrkraft sieht ausschliesslich die
 * eigenen aktiven Fernzugriffsverbindungen und kann einzelne widerrufen -
 * nie fremde, weil oauth_lib::active_tokens_for_user()/revoke_token() die
 * Eigentuemerschaft direkt in der Abfrage erzwingen, nicht nur in der
 * Anzeige. Aus dem Profil verlinkt (siehe lib.php,
 * local_kurspilot_myprofile_navigation()).
 *
 * Duenne Schale (#334-Muster): die eigentliche Logik lebt testbar in
 * {@see \local_kurspilot\oauth_lib}, diese Datei tut nur noch Ein-/Ausgabe.
 *
 * @package    local_kurspilot
 * @copyright  2026 Kurspilot
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

require(__DIR__ . '/../../config.php');

use local_kurspilot\oauth_lib;

require_login(null, false);

global $USER;
$context = context_system::instance();
$PAGE->set_context($context);
$PAGE->set_url(new moodle_url('/local/kurspilot/connections.php'));
$PAGE->set_pagelayout('standard');
$PAGE->set_title(get_string('myconnections', 'local_kurspilot'));
$PAGE->set_heading(get_string('myconnections', 'local_kurspilot'));

$revokeid = optional_param('revoke', 0, PARAM_INT);
if ($revokeid) {
    require_sesskey();
    // $USER->id als Eigentuemerfilter - eine fremde ID revoked hier nichts.
    oauth_lib::revoke_token($revokeid, (int) $USER->id);
    redirect(new moodle_url('/local/kurspilot/connections.php'));
}

$tokens = oauth_lib::active_tokens_for_user((int) $USER->id);

echo $OUTPUT->header();
echo html_writer::tag('p', get_string('myconnectionsintro', 'local_kurspilot'));

if (!$tokens) {
    echo $OUTPUT->notification(
        get_string('connectionnoconnections', 'local_kurspilot'),
        \core\output\notification::NOTIFY_INFO
    );
} else {
    $table = new html_table();
    $table->head = [
        get_string('connectionclient', 'local_kurspilot'),
        get_string('connectionsince', 'local_kurspilot'),
        get_string('connectionexpires', 'local_kurspilot'),
        '',
    ];
    foreach ($tokens as $tokenrecord) {
        $revokeurl = new moodle_url('/local/kurspilot/connections.php', [
            'revoke' => $tokenrecord->id,
            'sesskey' => sesskey(),
        ]);
        $table->data[] = [
            s($tokenrecord->clientname ?: $tokenrecord->clientid),
            userdate($tokenrecord->timecreated),
            userdate($tokenrecord->expires),
            html_writer::link($revokeurl, get_string('connectionrevoke', 'local_kurspilot')),
        ];
    }
    echo html_writer::table($table);
}

echo $OUTPUT->footer();
