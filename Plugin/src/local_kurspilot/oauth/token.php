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
 * Token-Endpunkt (#336): Authorization Code + Refresh mit Rotation, 1h
 * Zugriffs- / 30 Tage Erneuerungstoken.
 *
 * Duenne Schale (#334-Muster): liest Methode, Content-Type und Rumpf ein
 * (Formular- oder JSON-Body - das Unterscheiden ist Ein-/Ausgabe), uebergibt
 * an {@see \local_kurspilot\oauth_lib::handle_token()}. Die eigentliche
 * Entscheidungslogik (Grant-Type-Dispatch, client_secret_post-Pruefung,
 * Pflichtfeld-Validierung) lebt dort als reine, per PHPUnit ohne laufenden
 * Webserver pruefbare Methode - kein exit() in der Entscheidungslogik, nur
 * hier in der Schale. Fehlerantworten sind immer JSON (Moodles HTML-404
 * killt opencodes Parser, Fund aus #312).
 *
 * @package    local_kurspilot
 * @copyright  2026 Kurspilot
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

define('NO_MOODLE_COOKIES', true);
define('NO_DEBUG_DISPLAY', true);

require(__DIR__ . '/../../../config.php');

use local_kurspilot\oauth_lib;

// Sowohl Formular- als auch JSON-Bodies zulassen - RFC 6749 verlangt
// application/x-www-form-urlencoded, manche MCP-Clients senden trotzdem JSON.
$contenttype = $_SERVER['CONTENT_TYPE'] ?? '';
if (str_contains($contenttype, 'application/json')) {
    $decoded = json_decode(file_get_contents('php://input'), true);
    $body = is_array($decoded) ? $decoded : null;
} else {
    $body = $_POST;
}

$response = oauth_lib::handle_token($_SERVER['REQUEST_METHOD'] ?? 'POST', $body);

http_response_code($response['status']);
foreach ($response['headers'] as $name => $value) {
    header($name . ': ' . $value);
}
header('Content-Type: application/json');
echo json_encode($response['body'], JSON_UNESCAPED_SLASHES);
