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
 * Autorisierungsserver-Metadaten unter dem PATH_INFO-Pfad (#302, Punkt 1+2).
 *
 * Issuer ist diese Datei selbst:
 *   https://<wwwroot>/local/kurspilot/oauth.php
 * Die OIDC-Pfadanhaengung landet damit als PATH_INFO hier:
 *   .../oauth.php/.well-known/openid-configuration
 *   .../oauth.php/.well-known/oauth-authorization-server
 *
 * Stand #312: reines Dummy-Dokument. Es beantwortet ausschliesslich die
 * Frage, ob die Zielclients die dritte Discovery-Prioritaet ueberhaupt
 * erreichen - Consent, DCR und Token-Ausgabe folgen spaeter.
 *
 * ponytail: keine Endpunkt-Implementierung, nur Metadaten. Kommt mit dem
 * OAuth-Bau (#291).
 *
 * @package    local_kurspilot
 * @copyright  2026 Kurspilot
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

define('NO_MOODLE_COOKIES', true);
define('NO_DEBUG_DISPLAY', true);

require(__DIR__ . '/../../config.php');

$issuer = $CFG->wwwroot . '/local/kurspilot/oauth.php';

// Nur die beiden bekannten Discovery-Namen bedienen; alles andere unter
// diesem Pfad ist ein Irrlaeufer und soll als solcher im Log auffallen.
$pathinfo = trim($_SERVER['PATH_INFO'] ?? '', '/');
$known = [
    '',
    '.well-known/openid-configuration',
    '.well-known/oauth-authorization-server',
];
if (!in_array($pathinfo, $known, true)) {
    header('Content-Type: application/json');
    http_response_code(404);
    echo json_encode(['error' => 'not_found', 'path_info' => $pathinfo]);
    exit;
}

$metadata = [
    // RFC 8414.
    'issuer' => $issuer,
    'authorization_endpoint' => $CFG->wwwroot . '/local/kurspilot/oauth/authorize.php',
    'token_endpoint' => $CFG->wwwroot . '/local/kurspilot/oauth/token.php',
    'registration_endpoint' => $CFG->wwwroot . '/local/kurspilot/oauth/register.php',
    'response_types_supported' => ['code'],
    'grant_types_supported' => ['authorization_code', 'refresh_token'],
    'code_challenge_methods_supported' => ['S256'],
    'token_endpoint_auth_methods_supported' => ['none', 'client_secret_post'],
    'scopes_supported' => ['kurspilot.read'],
    // OIDC-Pflichtfelder - erzwungen durch den Namensraum, obwohl das Plugin
    // kein OIDC-Provider ist (#302, Punkt 2).
    'jwks_uri' => $CFG->wwwroot . '/local/kurspilot/oauth/jwks.php',
    'subject_types_supported' => ['public'],
    'id_token_signing_alg_values_supported' => ['RS256'],
];

header('Content-Type: application/json');
header('Cache-Control: no-store');
echo json_encode($metadata, JSON_UNESCAPED_SLASHES);
