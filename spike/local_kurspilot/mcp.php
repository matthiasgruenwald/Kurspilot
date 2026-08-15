<?php
// SPIKE — Wegwerfcode zu Issue #294. Kein Produktionscode.
//
// Ein MCP-Endpunkt aus einem Moodle-Plugin: POST-only, JSON-Antwort,
// zustandslos, dual-era (Legacy 2025-* mit initialize-Handshake und
// modern 2026-07-28 mit server/discover). Vorlage: Recherche #290, Abschnitt 8.

define('WS_SERVER', true);        // setzt NO_MOODLE_COOKIES implizit (lib/setup.php)
define('NO_DEBUG_DISPLAY', true); // kein HTML-Debug im JSON-Strom

require(__DIR__ . '/../../config.php');

use core_external\external_api;

const KURSPILOT_SPIKE_LEGACY_VERSION = '2025-06-18';
const KURSPILOT_SPIKE_MODERN_VERSION = '2026-07-28';

raise_memory_limit(MEMORY_EXTRA);
external_api::set_timeout();

/**
 * Sendet eine JSON-Antwort und beendet die Anfrage.
 */
function kurspilot_spike_send(int $status, ?array $payload): void {
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
 */
function kurspilot_spike_error(int $status, $id, int $code, string $message): void {
    kurspilot_spike_send($status, [
        'jsonrpc' => '2.0',
        'id' => $id,
        'error' => ['code' => $code, 'message' => $message],
    ]);
}

/**
 * Liest das Bearer-Token. Unter CGI/FastCGI kommt der Authorization-Header
 * teils nur als REDIRECT_HTTP_AUTHORIZATION an (siehe Recherche #290, 6.1).
 */
function kurspilot_spike_bearer_token(): ?string {
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
 * ponytail: bewusst ein Moodle-Webservice-Token statt OAuth — der Spike soll den
 * Transport klären, nicht den Autorisierungsserver (der ist Aufwand aus #291).
 * Im Produkt ersetzt OAuth 2.1 diesen Block vollständig (#292).
 */
function kurspilot_spike_authenticate(): bool {
    global $DB;

    $token = kurspilot_spike_bearer_token();
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
    $user = $DB->get_record('user', ['id' => $record->userid, 'deleted' => 0, 'suspended' => 0]);
    if (!$user) {
        return false;
    }

    \core\session\manager::set_user($user);
    external_api::set_context_restriction(context_system::instance());
    return true;
}

/**
 * Die Werkzeugliste des Spikes: genau ein Lese-Tool.
 */
function kurspilot_spike_tools(): array {
    return [[
        'name' => 'kurspilot_list_courses',
        'title' => 'Kurse auflisten',
        'description' => 'Listet die Moodle-Kurse, in denen die angemeldete Lehrkraft Kurspilot nutzen darf.',
        'inputSchema' => [
            'type' => 'object',
            'properties' => new stdClass(),
            'additionalProperties' => false,
        ],
    ]];
}

// --- Transport ------------------------------------------------------------

// Origin-Prüfung: Pflicht laut Spezifikation, greift nur bei vorhandenem Header.
$origin = $_SERVER['HTTP_ORIGIN'] ?? null;
if ($origin !== null) {
    $allowed = [rtrim($CFG->wwwroot, '/'), 'https://claude.ai', 'https://chatgpt.com'];
    if (!in_array(rtrim($origin, '/'), $allowed, true)) {
        kurspilot_spike_send(403, ['error' => 'Origin not allowed']);
    }
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    header('Allow: POST');
    kurspilot_spike_send(405, ['error' => 'Method Not Allowed — MCP over HTTP is POST only']);
}

$request = json_decode(file_get_contents('php://input'), true);
if (!is_array($request)) {
    kurspilot_spike_error(400, null, -32700, 'Parse error');
}

$id = $request['id'] ?? null;
$method = $request['method'] ?? '';
$params = $request['params'] ?? [];
// Dual-era: der moderne Client schickt kein initialize, sondern server/discover
// plus _meta.io.modelcontextprotocol/protocolVersion. Beide Methodensätze werden
// unten bedient, eine Fallunterscheidung braucht es dafür nicht.

$serverinfo = ['name' => 'local_kurspilot (spike)', 'version' => '0.0.1-spike'];

switch ($method) {
    // Legacy-Ära: Handshake.
    case 'initialize':
        kurspilot_spike_send(200, [
            'jsonrpc' => '2.0',
            'id' => $id,
            'result' => [
                'protocolVersion' => $params['protocolVersion'] ?? KURSPILOT_SPIKE_LEGACY_VERSION,
                'capabilities' => ['tools' => new stdClass()],
                'serverInfo' => $serverinfo,
            ],
        ]);
        // no break — send() beendet.

    case 'notifications/initialized':
    case 'notifications/cancelled':
        kurspilot_spike_send(202, null);

    case 'ping':
        kurspilot_spike_send(200, ['jsonrpc' => '2.0', 'id' => $id, 'result' => new stdClass()]);

    // Moderne Ära: Discovery statt Handshake.
    case 'server/discover':
        kurspilot_spike_send(200, [
            'jsonrpc' => '2.0',
            'id' => $id,
            'result' => [
                'supportedVersions' => [KURSPILOT_SPIKE_MODERN_VERSION, KURSPILOT_SPIKE_LEGACY_VERSION],
                'capabilities' => ['tools' => new stdClass()],
                'serverInfo' => $serverinfo,
            ],
        ]);

    case 'tools/list':
        if (!kurspilot_spike_authenticate()) {
            header('WWW-Authenticate: Bearer');
            kurspilot_spike_error(401, $id, -32001, 'AUTHENTICATION_FAILED');
        }
        kurspilot_spike_send(200, [
            'jsonrpc' => '2.0',
            'id' => $id,
            'result' => ['tools' => kurspilot_spike_tools()],
        ]);

    case 'tools/call':
        if (!kurspilot_spike_authenticate()) {
            header('WWW-Authenticate: Bearer');
            kurspilot_spike_error(401, $id, -32001, 'AUTHENTICATION_FAILED');
        }
        if (($params['name'] ?? '') !== 'kurspilot_list_courses') {
            kurspilot_spike_error(404, $id, -32601, 'Unknown tool: ' . ($params['name'] ?? ''));
        }

        // Der Tool-Call läuft über Moodles Webservice-Schicht — die externe
        // Funktion prüft Capabilities und Kontext selbst (Kartenentscheidung #295).
        $response = external_api::call_external_function('local_kurspilot_list_courses', []);
        if ($response['error']) {
            kurspilot_spike_send(200, [
                'jsonrpc' => '2.0',
                'id' => $id,
                'result' => [
                    'isError' => true,
                    'content' => [['type' => 'text', 'text' => $response['exception']->message ?? 'error']],
                ],
            ]);
        }
        $data = $response['data'];
        kurspilot_spike_send(200, [
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
        kurspilot_spike_error(404, $id, -32601, 'Method not found: ' . $method);
}
