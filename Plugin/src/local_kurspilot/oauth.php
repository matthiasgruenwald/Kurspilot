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
 * Reine Schale (#334-Muster): liest PATH_INFO ein, uebergibt an
 * {@see \local_kurspilot\oauth_lib::handle_discovery()}. registration_endpoint
 * ist seit #335 ein echter Endpunkt (oauth/register.php), authorize_endpoint
 * und token_endpoint seit #336 (oauth/authorize.php, oauth/token.php).
 *
 * @package    local_kurspilot
 * @copyright  2026 Kurspilot
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

define('NO_MOODLE_COOKIES', true);
define('NO_DEBUG_DISPLAY', true);

require(__DIR__ . '/../../config.php');

use local_kurspilot\oauth_lib;

$pathinfo = trim($_SERVER['PATH_INFO'] ?? '', '/');
$response = oauth_lib::handle_discovery($CFG->wwwroot, $pathinfo);

http_response_code($response['status']);
foreach ($response['headers'] as $name => $value) {
    header($name . ': ' . $value);
}
header('Content-Type: application/json');
echo json_encode($response['body'], JSON_UNESCAPED_SLASHES);
