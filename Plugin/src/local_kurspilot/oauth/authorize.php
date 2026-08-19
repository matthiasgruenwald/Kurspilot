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
 * Authorization-Endpunkt (#313 Punkt 2): Moodle-Login (LDAP/SSO der Instanz
 * greift ueber require_login()), Consent-Screen mit den Textbausteinen aus
 * #298, PKCE/S256 Pflicht.
 *
 * @package    local_kurspilot
 * @copyright  2026 Kurspilot
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

require(__DIR__ . '/../../../config.php');

use local_kurspilot\oauth_lib;

require_login(null, false);

$context = context_system::instance();
$PAGE->set_url('/local/kurspilot/oauth/authorize.php');
$PAGE->set_context($context);
$PAGE->set_pagelayout('standard');
$PAGE->set_title(get_string('authorizetitle', 'local_kurspilot'));

// Notbremse zuerst (#296, Punkt 3): stateless, greift sofort unabhaengig von
// bereits ausgestellten Tokens.
if (!get_config('local_kurspilot', 'remoteaccess')) {
    print_error('remoteaccessdisabled', 'local_kurspilot');
}

// local/kurspilot:useremote gate den Fernzugriff insgesamt (#296, Punkt 1) -
// Autorisierungsserver-Fehlerform (RFC 6749, 4.1.2.1), da wir noch keinen
// verifizierten redirect_uri haben, auf den ein Fehler-Redirect sicher waere.
require_capability('local/kurspilot:useremote', $context);

$responsetype = optional_param('response_type', '', PARAM_ALPHA);
$clientid = optional_param('client_id', '', PARAM_RAW_TRIMMED);
$redirecturi = optional_param('redirect_uri', '', PARAM_URL);
$state = optional_param('state', '', PARAM_RAW_TRIMMED);
$codechallenge = optional_param('code_challenge', '', PARAM_RAW_TRIMMED);
$codechallengemethod = optional_param('code_challenge_method', '', PARAM_ALPHANUMEXT);
$confirm = optional_param('confirm', 0, PARAM_BOOL);

if ($responsetype !== 'code' || $clientid === '' || $redirecturi === '' || $codechallenge === '') {
    print_error('invalidauthorizerequest', 'local_kurspilot');
}
if ($codechallengemethod !== 'S256') {
    // OAuth 2.1: PKCE ist fuer alle Clients Pflicht, plain ist nicht erlaubt.
    print_error('pkcerequired', 'local_kurspilot');
}

$client = oauth_lib::get_client($clientid);
if (!$client) {
    print_error('unknownclient', 'local_kurspilot');
}
if (!oauth_lib::redirect_uri_matches($client, $redirecturi)) {
    // Kein Redirect zu einer unverifizierten Ziel-URI (OAuth Security BCP).
    print_error('redirecturimismatch', 'local_kurspilot');
}

if ($confirm) {
    require_sesskey();
    $code = oauth_lib::issue_code($clientid, (int) $USER->id, $redirecturi, $codechallenge, $codechallengemethod);
    $target = new moodle_url($redirecturi, array_filter(['code' => $code, 'state' => $state !== '' ? $state : null]));
    redirect($target->out(false));
}

echo $OUTPUT->header();
echo $OUTPUT->heading(get_string('authorizetitle', 'local_kurspilot'));

$clientname = $client->clientname ?: $clientid;
$allowpersonaldata = (bool) get_config('local_kurspilot', 'allowpersonaldata');
echo html_writer::div(
    get_string('consentintro', 'local_kurspilot', $clientname) . '<br><br>'
    . get_string('consentgranted', 'local_kurspilot') . '<br>'
    . get_string('consentdenied', 'local_kurspilot') . '<br><br>'
    . get_string('consenttransfer', 'local_kurspilot') . '<br><br>'
    . ($allowpersonaldata
        ? get_string('consentpersonaldataon', 'local_kurspilot')
        : get_string('consentpersonaldataoff', 'local_kurspilot'))
    . '<br><br>'
    . get_string('consentabbreviate', 'local_kurspilot') . '<br><br>'
    . get_string('consentrevoke', 'local_kurspilot'),
    'kurspilot-consent'
);

$formurl = new moodle_url('/local/kurspilot/oauth/authorize.php');
echo html_writer::start_tag('form', ['method' => 'post', 'action' => $formurl->out(false)]);
echo html_writer::empty_tag('input', ['type' => 'hidden', 'name' => 'response_type', 'value' => 'code']);
echo html_writer::empty_tag('input', ['type' => 'hidden', 'name' => 'client_id', 'value' => $clientid]);
echo html_writer::empty_tag('input', ['type' => 'hidden', 'name' => 'redirect_uri', 'value' => $redirecturi]);
echo html_writer::empty_tag('input', ['type' => 'hidden', 'name' => 'state', 'value' => $state]);
echo html_writer::empty_tag('input', ['type' => 'hidden', 'name' => 'code_challenge', 'value' => $codechallenge]);
echo html_writer::empty_tag('input', ['type' => 'hidden', 'name' => 'code_challenge_method', 'value' => $codechallengemethod]);
echo html_writer::empty_tag('input', ['type' => 'hidden', 'name' => 'confirm', 'value' => 1]);
echo html_writer::empty_tag('input', ['type' => 'hidden', 'name' => 'sesskey', 'value' => sesskey()]);
echo html_writer::empty_tag('input', ['type' => 'submit', 'value' => get_string('consentconfirm', 'local_kurspilot')]);
echo html_writer::end_tag('form');

echo $OUTPUT->footer();
