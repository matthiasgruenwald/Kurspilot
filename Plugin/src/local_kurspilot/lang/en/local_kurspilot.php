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

// OAuth (#313).
$string['settingremoteaccess'] = 'Allow remote access';
$string['settingremoteaccessdesc'] = 'Emergency brake: when off, the MCP endpoint stops accepting access tokens immediately, regardless of how long they would otherwise remain valid. Existing connections must reauthorize once this is switched back on.';
$string['settingallowpersonaldata'] = 'Transfer personal-data context files';
$string['settingallowpersonaldatadesc'] = 'Allows transferring context files marked as personal data (personenbezug: true) to the AI provider. Off by default. Has no effect yet, since local_kurspilot does not offer any context-file tools - added early so the consent screen shows the real state.';
$string['authorizetitle'] = 'Connect Kurspilot';
$string['remoteaccessdisabled'] = 'Remote access to Kurspilot is currently switched off on this site.';
$string['invalidauthorizerequest'] = 'Incomplete authorization request.';
$string['pkcerequired'] = 'PKCE with S256 is required.';
$string['unknownclient'] = 'Unknown client.';
$string['redirecturimismatch'] = 'This redirect_uri is not registered for this client.';
$string['consentintro'] = 'You are allowing <strong>{$a}</strong> to access your Moodle courses on your behalf. Your own permissions still apply - you will not see anything you could not already see.';
$string['consentgranted'] = '<strong>Shared:</strong> course list, sections, activities and their content (page text, assignment instructions, questions) plus your Kurspilot context files.';
$string['consentdenied'] = '<strong>Not shared:</strong> submissions, forum posts, quiz attempts, grades, participant lists.';
$string['consenttransfer'] = '<strong>Transfer to the AI provider:</strong> everything Kurspilot reads on request is transferred to and processed by the AI provider. Nothing runs in the background - only what a tool returns on request is transferred.';
$string['consentpersonaldataoff'] = 'This Moodle site does <strong>not</strong> transfer context files marked as personal data (personenbezug: true). Such files are shown to you as locked.';
$string['consentpersonaldataon'] = 'This Moodle site <strong>also</strong> transfers context files marked as personal data (personenbezug: true) - e.g. class profiles with student names. Your school has explicitly allowed this.';
$string['consentabbreviate'] = 'What personal information you may record in context files follows your school\'s policy and your state\'s data protection rules. Kurspilot does not check this. Use abbreviations instead of names wherever that is enough for planning.';
$string['consentrevoke'] = 'You can revoke this connection at any time under Profile → My Kurspilot connections.';
$string['consentconfirm'] = 'Connect';
