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

// Remote access governance (#338).
$string['remoteaccessdisabled'] = 'Remote access has been temporarily disabled by the administration.';
$string['settingremoteaccessenabled'] = 'Allow remote access';
$string['settingremoteaccessenabled_desc'] = 'Kill switch: immediately blocks any further access through the MCP endpoint. Already-issued access tokens remain valid — for a security incident, also use the bulk revoke on the connections overview. The normal Moodle login is not affected by this setting.';
// Event logging (#339).
$string['settingloglevel'] = 'Logging level';
$string['settingloglevel_desc'] = 'Controls which Kurspilot accesses are logged through the Moodle events API, so they appear in the usual log reports.';
$string['loglevelnone'] = 'No logging';
$string['loglevelerrors'] = 'Errors only';
$string['loglevelreads'] = 'Reads and errors';
$string['loglevelall'] = 'Everything';
$string['event_tool_access_succeeded'] = 'Kurspilot tool call succeeded';
$string['event_tool_access_failed'] = 'Kurspilot access failed';

// Context area (#297, issue #343).
$string['settingcontextroot'] = 'Context area root folder';
$string['settingcontextroot_desc'] = 'Purely organisational, not a security boundary. Changes only affect newly created files.';
$string['invalidcontextpath'] = 'Invalid path.';
$string['contextfilenotfound'] = 'File not found: {$a}';
$string['contextfilelocked'] = 'File locked: {$a} — marked as containing personal data (personenbezug: true), the switch for personal context data is off.';

// Switch for personal context data (#344, ADR 0011).
$string['settingallowpersonaldata'] = 'Transfer personal context data';
$string['settingallowpersonaldata_desc'] = 'Acts on the marking (frontmatter "personenbezug: true"), not on the content. While off, files marked this way are unreadable by any read tool and appear in listings as locked, not omitted. Default: off.';

$string['connections'] = 'Kurspilot connections';
$string['connectionsintro'] = 'All active remote-access connections on this site. Revoking a connection invalidates its token immediately — any further access then fails.';
$string['myconnections'] = 'My Kurspilot connections';
$string['myconnectionsintro'] = 'AI applications you have connected to Kurspilot. Revoking a connection invalidates it immediately.';
$string['connectionnoconnections'] = 'No active connections.';
$string['connectionclient'] = 'Application';
$string['connectionperson'] = 'Person';
$string['connectionsince'] = 'Connected since';
$string['connectionexpires'] = 'Access token valid until';
$string['connectionrevoke'] = 'Revoke';
$string['connectionrevokeall'] = 'Revoke all connections';
$string['connectionrevokeallconfirm'] = 'Really invalidate every issued access and refresh token? Each connection will need to be re-established afterwards.';

// surface.php.
$string['surface'] = 'Kurspilot data surface';
$string['surfaceintro'] = 'Kurspilot only exposes teacher-facing course design. This page shows the agreed surface and compares it with what is actually registered on this site.';
$string['surfaceallowed'] = 'Allowed tools';
$string['surfaceforbidden'] = 'Forbidden name parts';
$string['surfaceregistered'] = 'Actually registered web service functions';
$string['surfacestatus'] = 'Status';
$string['surfaceok'] = 'The registered surface matches the contract.';
$string['surfaceviolations'] = 'The registered surface violates the contract:';

// surface.php: instance check via self-fetch (#340).
$string['surfaceinstance'] = 'Instance prerequisites for remote access';
$string['surfaceinstanceintro'] = 'For AI tools to reach this instance it needs public HTTPS, egress to the provider, and working PATH_INFO. This page does not check that by looking at configuration, but by actually fetching the discovery address itself — reverse proxies and disabled PATH_INFO would otherwise only show up on a client\'s first connection attempt.';
$string['surfacereqhttps'] = 'Public HTTPS';
$string['surfacereqegress'] = 'Egress to the provider (outbound connections allowed)';
$string['surfacereqpathinfo'] = 'PATH_INFO is passed through to PHP files';
$string['selfcheckurl'] = 'Checked address: {$a}';
$string['selfcheckok'] = 'Self-check succeeded — the discovery address is reachable from this instance.';
$string['selfcheckrequireshttps'] = 'Self-check failed — the instance is not reachable over HTTPS (public HTTPS is a prerequisite).';
$string['selfcheckrequestfailed'] = 'Self-check failed — no response from the server (timeout, DNS, or TLS error).';
$string['selfcheckunexpectedstatus'] = 'Self-check failed — the discovery address did not answer with HTTP 200.';
$string['selfcheckinvalidbody'] = 'Self-check failed — the response did not contain valid discovery metadata.';
$string['surfaceinstanceemergencyexit'] = 'Emergency-exit rule as a documented deviation: the goal is zero web server intervention, but if PATH_INFO does not arrive, a web server rule such as "{$a}" (Apache) in this instance\'s virtual host helps — not the intended path, but a documented exception.';

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

// classes/privacy/provider.php: context files (#343, #345).
$string['privacy:metadata:core_files'] = 'Kurspilot context files in the teacher\'s private file area.';

// Field catalog (#379).
$string['unknownmodname'] = 'Unknown activity type "{$a->modname}". Kurspilot catalogs: {$a->aktivitaetsarten}.';
