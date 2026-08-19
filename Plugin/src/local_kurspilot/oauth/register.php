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
 * Dynamic Client Registration (RFC 7591, #313 Punkt 1).
 *
 * Unauthentifiziert erreichbar wie bei jedem DCR-Endpunkt - der Schutz liegt
 * bei authorize.php (Moodle-Login) und token.php (PKCE), nicht hier.
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
 * Sendet eine JSON-Fehlerantwort (RFC 7591, Abschnitt 3.2.2).
 *
 * @param int $status
 * @param string $error
 * @param string $description
 */
function kurspilot_register_error(int $status, string $error, string $description): void {
    header('Content-Type: application/json');
    http_response_code($status);
    echo json_encode(['error' => $error, 'error_description' => $description]);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    header('Allow: POST');
    kurspilot_register_error(405, 'invalid_request', 'Nur POST ist erlaubt.');
}

$body = json_decode(file_get_contents('php://input'), true);
if (!is_array($body)) {
    kurspilot_register_error(400, 'invalid_client_metadata', 'Ungueltiges JSON.');
}

$result = oauth_lib::register_client($body);
if (isset($result['error'])) {
    kurspilot_register_error(400, $result['error'], $result['error_description']);
}

header('Content-Type: application/json');
header('Cache-Control: no-store');
http_response_code(201);
echo json_encode($result, JSON_UNESCAPED_SLASHES);
