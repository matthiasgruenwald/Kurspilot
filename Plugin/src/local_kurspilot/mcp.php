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
 * MCP-Endpunkt: POST-only, JSON, zustandslos, dual-era (Legacy 2025-* mit
 * initialize-Handshake, modern 2026-07-28 mit server/discover).
 *
 * Belegt durch Recherche #290 und Prototyp #294.
 *
 * Laufzeitprueflung des Datenschutz-Vertrags (#300, Punkt 5): gelistet und
 * gerufen wird ausschliesslich, was in
 * {@see \local_kurspilot\privacy_surface::ALLOWED_TOOLS} steht. Kein Abbruch
 * zur Installationszeit - der Endpunkt bleibt betriebsfaehig, liefert aber
 * nichts Ungelistetes aus.
 *
 * @package    local_kurspilot
 * @copyright  2026 Kurspilot
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

// WS_SERVER ist Pflicht, nicht NO_MOODLE_COOKIES: ohne WS_SERVER scheitert
// external_api::call_external_function() an 'servicerequireslogin'
// (external_api.php:216) - Fund aus dem Prototypen #294.
define('WS_SERVER', true);
define('NO_DEBUG_DISPLAY', true);

require(__DIR__ . '/../../config.php');

use core_external\external_api;
use local_kurspilot\privacy_surface;

const KURSPILOT_MCP_LEGACY_VERSION = '2025-06-18';
const KURSPILOT_MCP_MODERN_VERSION = '2026-07-28';

raise_memory_limit(MEMORY_EXTRA);
external_api::set_timeout();

/**
 * Sendet eine JSON-Antwort und beendet die Anfrage.
 *
 * @param int $status
 * @param array|null $payload
 */
function kurspilot_mcp_send(int $status, ?array $payload): void {
    http_response_code($status);
    if ($payload === null) {
        exit;
    }
    header('Content-Type: application/json');
    echo json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

/**
 * Sendet einen JSON-RPC-Fehler.
 *
 * @param int $status
 * @param mixed $id
 * @param int $code
 * @param string $message
 */
function kurspilot_mcp_error(int $status, $id, int $code, string $message): void {
    kurspilot_mcp_send($status, [
        'jsonrpc' => '2.0',
        'id' => $id,
        'error' => ['code' => $code, 'message' => $message],
    ]);
}

/**
 * Liest das Bearer-Token. Unter CGI/FastCGI kommt der Authorization-Header
 * teils nur als REDIRECT_HTTP_AUTHORIZATION an (Recherche #290, 6.1).
 *
 * @return string|null
 */
function kurspilot_mcp_bearer_token(): ?string {
    $header = $_SERVER['HTTP_AUTHORIZATION']
        ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION']
        ?? '';
    if ($header === '' && function_exists('getallheaders')) {
        foreach (getallheaders() as $name => $value) {
            if (strcasecmp($name, 'Authorization') === 0) {
                $header = $value;
                break;
            }
        }
    }
    if (preg_match('/^Bearer\s+(\S+)$/i', trim($header), $matches)) {
        return $matches[1];
    }
    return null;
}

/**
 * Bildet das Bearer-Token auf einen Moodle-Nutzer ab und richtet $USER ein.
 *
 * ponytail: bewusst noch ein Moodle-Webservice-Token statt OAuth. Im Produkt
 * ersetzt der OAuth-2.1-Autorisierungsserver (#291/#292) diesen Block
 * vollstaendig; bis dahin traegt die Kruecke den Endpunkt auf der
 * Spike-Instanz.
 *
 * @return bool
 */
function kurspilot_mcp_authenticate(): bool {
    global $DB;

    $token = kurspilot_mcp_bearer_token();
    if ($token === null) {
        return false;
    }
    $record = $DB->get_record('external_tokens', [
        'token' => $token,
        'tokentype' => EXTERNAL_TOKEN_PERMANENT,
    ]);
    if (!$record || ($record->validuntil && $record->validuntil < time())) {
        return false;
    }
    $usr = $DB->get_record('user', ['id' => $record->userid, 'deleted' => 0, 'suspended' => 0]);
    if (!$usr) {
        return false;
    }

    \core\session\manager::set_user($usr);
    external_api::set_context_restriction(context_system::instance());
    return true;
}

/**
 * Die Werkzeugliste - direkt aus der Allowlist abgeleitet, damit gelistet und
 * aufrufbar dieselbe Menge sind.
 *
 * @return array
 */
function kurspilot_mcp_tools(): array {
    // Beschreibungen sind statischer Text und nicht Teil des Vertrags
    // (#300, Punkt 4); die 2-KB-Grenze aus #292 gilt je Beschreibung.
    $descriptions = [
        'kurspilot_list_courses' => 'Listet die Moodle-Kurse, in denen die angemeldete Lehrkraft Kurspilot nutzen darf.',
    ];

    $tools = [];
    foreach (array_keys(privacy_surface::ALLOWED_TOOLS) as $name) {
        $tools[] = [
            'name' => $name,
            'description' => $descriptions[$name] ?? '',
            'inputSchema' => [
                'type' => 'object',
                'properties' => new stdClass(),
                'additionalProperties' => false,
            ],
        ];
    }
    return $tools;
}

// --- Transport ------------------------------------------------------------

// Origin-Pruefung: greift nur bei vorhandenem Header. Pflege der Allowlist
// gehoert in die Spec (offener Punkt aus #294).
$origin = $_SERVER['HTTP_ORIGIN'] ?? null;
if ($origin !== null) {
    $allowed = [rtrim($CFG->wwwroot, '/'), 'https://claude.ai', 'https://chatgpt.com'];
    if (!in_array(rtrim($origin, '/'), $allowed, true)) {
        kurspilot_mcp_send(403, ['error' => 'Origin not allowed']);
    }
}

// Protected-Resource-Metadaten am Ressourcenpfad selbst (RFC 9728, Abschnitt 3):
// Codex fragt sie per GET *unter der MCP-URL* ab und liest den
// WWW-Authenticate-Header gar nicht erst - Fund aus #312. PATH_INFO traegt
// das ohne Rewrite-Regel.
if (trim($_SERVER['PATH_INFO'] ?? '', '/') === '.well-known/oauth-protected-resource') {
    header('Cache-Control: no-store');
    kurspilot_mcp_send(200, [
        'resource' => $CFG->wwwroot . '/local/kurspilot/mcp.php',
        'authorization_servers' => [$CFG->wwwroot . '/local/kurspilot/oauth.php'],
        'scopes_supported' => ['kurspilot.read'],
        'bearer_methods_supported' => ['header'],
    ]);
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    header('Allow: POST');
    kurspilot_mcp_send(405, ['error' => 'Method Not Allowed - MCP over HTTP is POST only']);
}

$request = json_decode(file_get_contents('php://input'), true);
if (!is_array($request)) {
    kurspilot_mcp_error(400, null, -32700, 'Parse error');
}

$id = $request['id'] ?? null;
$method = $request['method'] ?? '';
$params = $request['params'] ?? [];

// Auth-Gate vor dem Handshake: erst ein 401 mit resource_metadata bringt die
// Clients dazu, die Discovery-Kette ueberhaupt zu starten (RFC 9728, #302).
if (!kurspilot_mcp_authenticate()) {
    header('WWW-Authenticate: Bearer resource_metadata="'
        . $CFG->wwwroot . '/local/kurspilot/oauth/protected-resource.php"');
    kurspilot_mcp_error(401, $id, -32001, 'AUTHENTICATION_FAILED');
}

$serverinfo = ['name' => 'local_kurspilot', 'version' => '0.1.0'];

switch ($method) {
    // Legacy-Aera: Handshake.
    case 'initialize':
        kurspilot_mcp_send(200, [
            'jsonrpc' => '2.0',
            'id' => $id,
            'result' => [
                'protocolVersion' => $params['protocolVersion'] ?? KURSPILOT_MCP_LEGACY_VERSION,
                'capabilities' => ['tools' => new stdClass()],
                'serverInfo' => $serverinfo,
            ],
        ]);
        // No break - send() beendet die Anfrage.

    case 'notifications/initialized':
    case 'notifications/cancelled':
        kurspilot_mcp_send(202, null);

    case 'ping':
        kurspilot_mcp_send(200, ['jsonrpc' => '2.0', 'id' => $id, 'result' => new stdClass()]);

    // Moderne Aera: Discovery statt Handshake.
    case 'server/discover':
        kurspilot_mcp_send(200, [
            'jsonrpc' => '2.0',
            'id' => $id,
            'result' => [
                'supportedVersions' => [KURSPILOT_MCP_MODERN_VERSION, KURSPILOT_MCP_LEGACY_VERSION],
                'capabilities' => ['tools' => new stdClass()],
                'serverInfo' => $serverinfo,
            ],
        ]);

    case 'tools/list':
        kurspilot_mcp_send(200, [
            'jsonrpc' => '2.0',
            'id' => $id,
            'result' => ['tools' => kurspilot_mcp_tools()],
        ]);

    case 'tools/call':
        // Laufzeitpruefung des Vertrags: nur Gelistetes ist aufrufbar.
        $toolname = (string) ($params['name'] ?? '');
        $function = privacy_surface::function_for_tool($toolname);
        if ($function === null) {
            kurspilot_mcp_error(404, $id, -32601, 'Unknown tool: ' . $toolname);
        }

        // Der Tool-Call laeuft ueber Moodles Webservice-Schicht - die externe
        // Funktion prueft Capabilities und Kontext selbst (#295, Punkt 1).
        $response = external_api::call_external_function($function, $params['arguments'] ?? []);
        if ($response['error']) {
            kurspilot_mcp_send(200, [
                'jsonrpc' => '2.0',
                'id' => $id,
                'result' => [
                    'isError' => true,
                    'content' => [['type' => 'text', 'text' => $response['exception']->message ?? 'error']],
                ],
            ]);
        }
        $data = $response['data'];
        kurspilot_mcp_send(200, [
            'jsonrpc' => '2.0',
            'id' => $id,
            'result' => [
                'content' => [[
                    'type' => 'text',
                    'text' => json_encode($data, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE),
                ]],
                'structuredContent' => $data,
                // Von der Revision 2026-07-28 verlangte Ergebnis-Metadaten.
                'resultType' => 'data',
                'ttlMs' => 60000,
                'cacheScope' => 'session',
            ],
        ]);

    default:
        kurspilot_mcp_error(404, $id, -32601, 'Method not found: ' . $method);
}
