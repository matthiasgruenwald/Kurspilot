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
$string['kurspilot:viewhistory'] = 'View the change history of activities';
$string['kurspilot:restoreversion'] = 'Restore activities to an earlier version';
$string['capabilitymissing'] = 'CAPABILITY_MISSING:{$a}';

// history.php: history page in the course navigation (#397, Spec 0015 §10.6/§10.7).
$string['historynavnode'] = 'Kurspilot: change history';
$string['historytitle'] = 'Change history';
$string['historyintro'] = 'This shows the recorded change history and lets you restore an earlier version - independent of whether a Kurspilot chat is currently running.';
$string['historynoactivities'] = 'No activity in this course has a recorded change history.';
$string['historycolversion'] = 'Version';
$string['historycoluser'] = 'User';
$string['historycoltime'] = 'Time';
$string['historycolchange'] = 'Change';
$string['historycolname'] = 'Activity';
$string['historycoltype'] = 'Type';
$string['historyview'] = 'View history';
$string['historyrestore'] = 'Restore';
$string['historyrestoreconfirm'] = 'Really restore this activity to version {$a}? The old state is written forward as the new latest version, no additional activity is created.';
$string['historydatalossconfirm'] = '{$a} Really continue and delete existing completion data?';
$string['historyquizhint'] = 'Note: on quizzes, questions always show in their latest version, no version is pinned retroactively.';
$string['historybacktolist'] = 'Back to activity list';

// Remote access governance (#338).
$string['remoteaccessdisabled'] = 'Remote access has been temporarily disabled by the administration.';
$string['settingremoteaccessenabled'] = 'Allow remote access';
$string['settingremoteaccessenabled_desc'] = 'Kill switch: immediately blocks any further access through the MCP endpoint. Already-issued access tokens remain valid — for a security incident, also use the bulk revoke on the connections overview. The normal Moodle login is not affected by this setting.';
// Event logging (#339).
$string['settingloglevel'] = 'Logging level';
$string['settingloglevel_desc'] = 'Controls which Kurspilot accesses are logged through the Moodle events API, so they appear in the usual log reports.';
$string['loglevelnone'] = 'No logging';
$string['loglevelerrors'] = 'Writes and errors';
$string['loglevelreads'] = 'Additionally reads';
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

// Change history: retention/deletion deadline (#387).
$string['settinghistoryretentiondays'] = 'Change history retention period (days)';
$string['settinghistoryretentiondays_desc'] = 'How long change-history states are kept per activity before being deleted on the next write to that same activity. No cron needed - cleanup runs alongside every write. At least 1 day; "no limit" is not an option.';

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

// classes/privacy/provider.php: change history (#385/#386/#387).
$string['privacy:metadata:cm_version'] = 'Change history of activities: a full settings snapshot per write, with the user id of the teacher who triggered the write. Automatically deleted at most 1 year after the write (shortenable by the administration via the "Change history retention period" setting), and immediately when the activity or course is deleted.';
$string['privacy:metadata:cm_version:cmid'] = 'The activity this state belongs to.';
$string['privacy:metadata:cm_version:courseid'] = 'The course this activity belonged to at the time of the write.';
$string['privacy:metadata:cm_version:userid'] = 'The user id of the teacher the write ran under.';
$string['privacy:metadata:cm_version:timecreated'] = 'Time of the write.';
$string['privacy:metadata:cm_version_file'] = 'Links a history state to the files the activity had at that time (metadata only, see local_kurspilot_cm_file). Deleted along with its state.';
$string['privacy:metadata:cm_file'] = 'Deduplicated file metadata (name, size, path) for the change history, without file content.';

// Field catalog (#379).
$string['unknownmodname'] = 'Unknown activity type "{$a->modname}". Kurspilot catalogs: {$a->aktivitaetsarten}.';

// Write core: update_module_settings (#388).
$string['writevehicleblocked'] = '"{$a->modname}" is not written via update_module_settings, but via {$a->schreibweg}. Nothing was written.';
$string['invalidpatchjson'] = 'felder_json is not a valid JSON object. Nothing was written.';
$string['unknownfield'] = 'Unknown field "{$a->field}" for activity type "{$a->modname}". describe_module_fields(modname: "{$a->modname}", vollstaendig: true) shows the allowed fields. Nothing was written.';
$string['blockedfield'] = 'Field "{$a->field}" is locked for activity type "{$a->modname}" and cannot be set via patch. describe_module_fields(modname: "{$a->modname}", vollstaendig: true) shows the block list. Nothing was written.';
$string['invalidfieldvalue'] = 'Invalid value "{$a->value}" for field "{$a->field}" on activity type "{$a->modname}". describe_module_fields(modname: "{$a->modname}", vollstaendig: true) shows the allowed range. Nothing was written.';
$string['combinationruleviolation'] = 'Combination rule violated for activity type "{$a->modname}": {$a->message} describe_module_fields(modname: "{$a->modname}", vollstaendig: true) shows all combination rules. Nothing was written.';

// Visibility/stealth/group mode via the shared block (#390).
$string['stealthnotallowed'] = 'Stealth ("visibleoncoursepage" = 0) is disabled on this Moodle instance (setting "allowstealth"). The activity can be hidden (visible = 0) or shown, but not made reachable while unlisted on the course page. Nothing was written.';

// Write core: create_quiz/update_quiz_settings (#398).
$string['unknownmode'] = 'Unknown mode "{$a->mode}". Allowed: {$a->modi}. Nothing was written.';

// Write core: create_module (#389).
$string['resourcecreateblocked'] = '"resource" cannot be created yet (planned for Spec 0018): without a main file the activity page is broken. Add the file by hand for now (Add an activity > File), then use update_module_settings for every other setting. "folder" can still be created.';
$string['requiredfieldwithoutdefault'] = 'These required fields for activity type "{$a->modname}" have no form default and must be supplied: {$a->field}. Nothing was created.';
$string['readonlyvocabularyfield'] = 'Field "{$a->field}" is read vocabulary of the reading tools, not a writable field for activity type "{$a->modname}". To set it, use: {$a->hint}. Nothing was written.';

// Write core: structure and positions (#391).
$string['invalidsectionnum'] = 'Invalid section number "{$a->sectionnum}". Nothing was written.';
$string['sectionnotfound'] = 'Section "{$a->sectionnum}" does not exist.';
$string['sectionunknownfield'] = 'Unknown field "{$a->field}" for sections. Allowed: {$a->felder}. Nothing was written.';
$string['sectioninvalidvisible'] = 'Invalid value "{$a->value}" for "visible" - only 0 or 1 are allowed. Nothing was written.';
$string['sectionnotmovable'] = 'Section "{$a->sectionnum}" does not exist or is the general section (0) - it cannot be moved.';

// Write core: set_completion (#392).
$string['completionunknownfield'] = 'Unknown completion field "{$a->field}". Allowed: completion, completionview, completionusegrade, completionpassgrade, completionexpected. Nothing was written.';
$string['completioninvalidfieldvalue'] = 'Invalid value "{$a->value}" for completion field "{$a->field}". Nothing was written.';
$string['completionnotenabled'] = 'Completion tracking is disabled for this course (or the whole site). Moodle would silently discard these fields either way. Enable completion tracking for the course first. Nothing was written.';
$string['completiondatalossconfirmationrequired'] = 'This change would delete the existing completion data of {$a->betroffene_lernende} learner(s) for this activity - Moodle wipes and recalculates it as soon as this write unlocks completion. Nothing was written. Call set_completion again with "bestaetigt": true to proceed anyway.';
$string['sectiontargetoutofrange'] = 'Target position "{$a->nach}" is out of the valid range (1 to {$a->max}).';

// Write core: set_restriction (#393).
$string['restrictionsnotenabled'] = 'Conditional availability is disabled on this Moodle instance (setting "enableavailability"). Moodle would discard restrictions either way. Nothing was written.';
$string['invalidrestrictionjson'] = 'bedingungen_json is not a valid JSON array of condition objects. Nothing was written.';
$string['restrictionunknowntype'] = 'Invalid value {$a->value} for "{$a->field}". Allowed: "abschluss", "datum", "gruppe". Nothing was written.';
$string['restrictionactivitynotfound'] = 'Invalid value {$a->value} for "{$a->field}": no activity with this cmid in the same course. Nothing was written.';
$string['restrictioninvalidstatus'] = 'Invalid value {$a->value} for "{$a->field}". Allowed: abgeschlossen, nicht_abgeschlossen, bestanden, nicht_bestanden. Nothing was written.';
$string['restrictioninvaliddate'] = 'Invalid date condition ({$a->value}). "richtung" must be "ab" or "bis", "zeitstempel" a Unix timestamp (integer). Nothing was written.';
$string['restrictiongroupnotfound'] = 'Invalid value {$a->value} for "{$a->field}": no group with this id in the same course. Nothing was written.';

// Write core: change history surface (#394).
$string['versionnotfound'] = 'Version {$a->version} does not exist for this activity (cmid {$a->cmid}).';

// Write core: quiz arrangement snapshot in change history (#396).
$string['arrangementrestoreblocked'] = 'The question arrangement of this quiz (quizid {$a->quizid}) cannot be restored: attempts already exist. From now on the recorded arrangement is history only, no longer restorable.';

// Write core: drift check and admin status page (#399, ADR 0017).
$string['modnamedriftlocked'] = 'I cannot change activity type "{$a->modname}" right now - please report this to the administration. Other activity types remain writable, reading and lookups also remain possible.';
$string['driftcheckname'] = 'Kurspilot field catalog: {$a}';
$string['driftstatusgeprueft'] = 'Reviewed: field catalog manually reviewed for this Moodle major version, no drift.';
$string['driftstatusautomatischgeprueft'] = 'Automatically reviewed: columns, callable sources and constants match, but this Moodle major version has not been manually reviewed yet (value lists, combination rules, side effects).';
$string['driftstatusbrauchtarbeit'] = 'Needs work: the field catalog no longer matches this Moodle instance, the activity type is locked for writing.';
