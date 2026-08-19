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
 * Token-Endpunkt (#313 Punkt 3): Authorization Code + Refresh mit Rotation,
 * 1h Access- / 30 Tage Refresh-Token (#295, Punkt 5).
 *
 * Fehlerantworten sind immer JSON (Moodles HTML-404 killt opencodes Parser,
 * Fund aus #312).
 *
 * @package    local_kurspilot
 * @copyright  2026 Kurspilot
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

define('NO_MOODLE_COOKIES', true);
define('NO_DEBUG_DISPLAY', true);

require(__DIR__ . '/../../../config.php');

use local_kurspilot\oauth_lib;

/**
 * Sendet eine JSON-Fehlerantwort (RFC 6749, Abschnitt 5.2).
 *
 * @param int $status
 * @param string $error
 */
function kurspilot_token_error(int $status, string $error): void {
    header('Content-Type: application/json');
    header('Cache-Control: no-store');
    http_response_code($status);
    echo json_encode(['error' => $error]);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    header('Allow: POST');
    kurspilot_token_error(405, 'invalid_request');
}

// Sowohl Formular- als auch JSON-Bodies zulassen - Clients unterscheiden
// sich hier (RFC 6749 verlangt application/x-www-form-urlencoded, manche
// MCP-Clients senden trotzdem JSON).
$contenttype = $_SERVER['CONTENT_TYPE'] ?? '';
if (str_contains($contenttype, 'application/json')) {
    $body = json_decode(file_get_contents('php://input'), true) ?? [];
} else {
    $body = $_POST;
}

$granttype = $body['grant_type'] ?? '';
$clientid = $body['client_id'] ?? '';
if ($clientid === '') {
    kurspilot_token_error(400, 'invalid_client');
}

// client_secret_post-Clients authentifizieren sich zusaetzlich (#291); PKCE
// deckt oeffentliche Clients bereits ab.
$client = oauth_lib::get_client($clientid);
if (!$client) {
    kurspilot_token_error(400, 'invalid_client');
}
if ($client->tokenendpointauthmethod === 'client_secret_post') {
    $secret = $body['client_secret'] ?? '';
    if ($secret === '' || !hash_equals((string) $client->clientsecret, (string) $secret)) {
        kurspilot_token_error(401, 'invalid_client');
    }
}

if ($granttype === 'authorization_code') {
    $code = $body['code'] ?? '';
    $redirecturi = $body['redirect_uri'] ?? '';
    $codeverifier = $body['code_verifier'] ?? '';
    if ($code === '' || $redirecturi === '' || $codeverifier === '') {
        kurspilot_token_error(400, 'invalid_request');
    }
    $tokens = oauth_lib::exchange_code($code, $clientid, $redirecturi, $codeverifier);
    if ($tokens === null) {
        kurspilot_token_error(400, 'invalid_grant');
    }
} else if ($granttype === 'refresh_token') {
    $refreshtoken = $body['refresh_token'] ?? '';
    if ($refreshtoken === '') {
        kurspilot_token_error(400, 'invalid_request');
    }
    $tokens = oauth_lib::rotate_refresh_token($refreshtoken, $clientid);
    if ($tokens === null) {
        kurspilot_token_error(400, 'invalid_grant');
    }
} else {
    kurspilot_token_error(400, 'unsupported_grant_type');
}

header('Content-Type: application/json');
header('Cache-Control: no-store');
header('Pragma: no-cache');
echo json_encode($tokens, JSON_UNESCAPED_SLASHES);
