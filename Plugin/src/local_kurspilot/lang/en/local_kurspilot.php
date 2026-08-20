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
 * English strings.
 *
 * @package    local_kurspilot
 * @copyright  2026 Kurspilot
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

defined('MOODLE_INTERNAL') || die();

$string['pluginname'] = 'Kurspilot';
$string['kurspilot:use'] = 'Use Kurspilot in a course';
$string['kurspilot:useremote'] = 'Connect an AI chat to Kurspilot (remote access)';
$string['capabilitymissing'] = 'CAPABILITY_MISSING:{$a}';

// surface.php.
$string['surface'] = 'Kurspilot data surface';
$string['surfaceintro'] = 'Kurspilot only exposes teacher-facing course design. This page shows the agreed surface and compares it with what is actually registered on this site.';
$string['surfaceallowed'] = 'Allowed tools';
$string['surfaceforbidden'] = 'Forbidden name parts';
$string['surfaceregistered'] = 'Actually registered web service functions';
$string['surfacestatus'] = 'Status';
$string['surfaceok'] = 'The registered surface matches the contract.';
$string['surfaceviolations'] = 'The registered surface violates the contract:';

// oauth/authorize.php, oauth/token.php (#336).
$string['authorizetitle'] = 'Connect Kurspilot';
$string['authorizetitleclient'] = 'Connect Kurspilot with {$a}';
$string['authorizeerror'] = 'Authorization error: {$a}';
$string['consentconfirm'] = 'Allow connection';
$string['consentdeny'] = 'Deny';
$string['consentintro'] = 'You are allowing <strong>{$a}</strong> to access your Moodle courses on your behalf. Your own permissions apply — you will not see anything you could not already see.';
$string['consentgranted'] = '<strong>Shared:</strong> course list, sections, activities and their content (page text, assignment instructions, questions), and your Kurspilot context files.';
$string['consentdenied'] = '<strong>Not shared:</strong> submissions, forum posts, quiz attempts, grades, participant lists.';
$string['consenttransfer'] = '<strong>Transfer to the AI provider:</strong> everything Kurspilot reads on request is transferred to and processed by the AI provider. Nothing runs in the background — only what a tool returns on request is transferred.';
$string['consentpersonaldataoff'] = 'This Moodle site transfers <strong>no</strong> context files marked as containing personal data (personenbezug: true). Such files are shown to you as locked.';
$string['consentpersonaldataon'] = 'This Moodle site <strong>also</strong> transfers context files marked as containing personal data (personenbezug: true) — for example class profiles with student names. Your school has explicitly enabled this.';
$string['consentabbreviate'] = 'What personal information you may put in context files is governed by your school and your jurisdiction\'s data protection rules. Kurspilot does not check this. Use abbreviations instead of names where that suffices for planning.';
$string['consentrevoke'] = 'You can revoke this connection at any time under Profile → My Kurspilot connections.';

// classes/privacy/provider.php (#336).
$string['privacy:metadata:oauth_code'] = 'Short-lived, PKCE-bound authorization codes for the OAuth consent dialog.';
$string['privacy:metadata:oauth_code:clientid'] = 'The AI client id the code was issued for.';
$string['privacy:metadata:oauth_code:userid'] = 'The user id of the teacher who granted consent.';
$string['privacy:metadata:oauth_code:redirecturi'] = 'The client redirect target.';
$string['privacy:metadata:oauth_code:codechallenge'] = 'The client PKCE S256 challenge.';
$string['privacy:metadata:oauth_code:expires'] = 'Expiry time of the code.';
$string['privacy:metadata:oauth_code:used'] = 'Whether the code has already been redeemed.';
$string['privacy:metadata:oauth_token'] = 'Access and refresh tokens an AI client uses to access Kurspilot on the teacher\'s behalf.';
$string['privacy:metadata:oauth_token:clientid'] = 'The AI client id.';
$string['privacy:metadata:oauth_token:userid'] = 'The user id of the teacher the client acts on behalf of.';
$string['privacy:metadata:oauth_token:expires'] = 'Expiry time of the access token.';
$string['privacy:metadata:oauth_token:refreshexpires'] = 'Expiry time of the refresh token.';
$string['privacy:metadata:oauth_token:revoked'] = 'Whether the token has been revoked or invalidated by rotation.';
$string['privacy:metadata:oauth_token:timecreated'] = 'Issuance time.';
