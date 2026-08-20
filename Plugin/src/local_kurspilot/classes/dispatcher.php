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

namespace local_kurspilot;

use core_external\external_api;

/**
 * Die Dispatcher-Seam (#334): dieselbe Entscheidungslogik, die vorher
 * prozedural in mcp.php lag - Origin-Pruefung, Discovery-Sonderfall,
 * Methodenpruefung, Parse-Fehler, Auth-Gate, Protokoll-Switch - jetzt als
 * reine(re) Funktion: Werte rein, Antwortwert (Status, Kopfzeilen, Rumpf)
 * raus. Kein exit, kein Zugriff auf HTTP-Superglobals ($_SERVER, php://input),
 * kein HTTP-Wissen - damit per PHPUnit ohne laufenden Webserver aufrufbar.
 *
 * Reste an Moodle-Bindung ($DB/$CFG, external_api::call_external_function())
 * bleiben bewusst hier statt injiziert - advanced_testcase bringt DB und
 * $USER bereits mit, eine Callback-Abstraktion waere unbenutzte Flexibilitaet
 * (YAGNI). Das sind Moodle-Framework-Globals, keine HTTP-Superglobals - die
 * Trennung, um die es in #334 geht. Die HTTP-Header-Extraktion selbst
 * (Authorization-Header lesen, REDIRECT_HTTP_AUTHORIZATION-Fallback,
 * getallheaders()) bleibt in mcp.php - das ist Ein-/Ausgabe, keine Entscheidung.
 *
 * @package    local_kurspilot
 * @copyright  2026 Kurspilot
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
final class dispatcher {

    /** @var string Protokoll-Revision der Legacy-Aera (initialize-Handshake). */
    public const LEGACY_VERSION = '2025-06-18';

    /** @var string Protokoll-Revision der modernen Aera (server/discover). */
    public const MODERN_VERSION = '2026-07-28';

    /** @var string[] Zusaetzlich erlaubte Origins neben $CFG->wwwroot. */
    private const EXTRA_ALLOWED_ORIGINS = ['https://claude.ai', 'https://chatgpt.com'];

    /** @var array<string, string> MCP-Toolname => Beschreibung (#292, 2-KB-Grenze je Beschreibung). */
    private const TOOL_DESCRIPTIONS = [
        'kurspilot_list_courses' => 'Listet die Moodle-Kurse, in denen die angemeldete Lehrkraft Kurspilot nutzen darf.',
    ];

    /**
     * Die Seam: bearbeitet eine MCP-Anfrage vollstaendig und liefert das
     * Ergebnis als Wert zurueck statt es auszugeben.
     *
     * @param array|null $request Der bereits dekodierte JSON-Rumpf, oder
     *        null, wenn das Dekodieren fehlgeschlagen ist (Parse-Fehler-Fall).
     * @param string|null $token Das bereits aus dem Authorization-Header
     *        extrahierte Bearer-Token.
     * @param array{origin: ?string, pathinfo: ?string, method: ?string} $headers
     * @return array{status: int, headers: array<string, string>, body: array|null}
     */
    public static function handle(?array $request, ?string $token, array $headers): array {
        global $CFG;

        // Origin-Pruefung: greift nur bei vorhandenem Header (offener Punkt
        // aus #294 fuer die Pflege der Allowlist).
        $origin = $headers['origin'] ?? null;
        if ($origin !== null) {
            $allowed = array_merge([rtrim($CFG->wwwroot, '/')], self::EXTRA_ALLOWED_ORIGINS);
            if (!in_array(rtrim($origin, '/'), $allowed, true)) {
                return self::result(403, [], ['error' => 'Origin not allowed']);
            }
        }

        // Protected-Resource-Metadaten am Ressourcenpfad selbst (RFC 9728,
        // Abschnitt 3) - Fund aus #312.
        $pathinfo = trim($headers['pathinfo'] ?? '', '/');
        if ($pathinfo === '.well-known/oauth-protected-resource') {
            return self::result(200, ['Cache-Control' => 'no-store'], [
                'resource' => $CFG->wwwroot . '/local/kurspilot/mcp.php',
                'authorization_servers' => [$CFG->wwwroot . '/local/kurspilot/oauth.php'],
                'scopes_supported' => ['kurspilot.read'],
                'bearer_methods_supported' => ['header'],
            ]);
        }

        $method = $headers['method'] ?? 'POST';
        if ($method !== 'POST') {
            return self::result(405, ['Allow' => 'POST'], ['error' => 'Method Not Allowed - MCP over HTTP is POST only']);
        }

        if ($request === null) {
            return self::error(400, null, -32700, 'Parse error');
        }

        $id = $request['id'] ?? null;
        $rpcmethod = $request['method'] ?? '';
        $params = $request['params'] ?? [];

        // Auth-Gate vor dem Handshake: erst ein 401 mit resource_metadata
        // bringt die Clients dazu, die Discovery-Kette ueberhaupt zu starten
        // (RFC 9728, #302).
        if (!self::authenticate($token)) {
            return self::error(401, $id, -32001, 'AUTHENTICATION_FAILED', [
                'WWW-Authenticate' => 'Bearer resource_metadata="'
                    . $CFG->wwwroot . '/local/kurspilot/oauth/protected-resource.php"',
            ]);
        }

        $serverinfo = ['name' => 'local_kurspilot', 'version' => '0.1.0'];

        switch ($rpcmethod) {
            // Legacy-Aera: Handshake.
            case 'initialize':
                return self::result(200, [], [
                    'jsonrpc' => '2.0',
                    'id' => $id,
                    'result' => [
                        'protocolVersion' => $params['protocolVersion'] ?? self::LEGACY_VERSION,
                        'capabilities' => ['tools' => new \stdClass()],
                        'serverInfo' => $serverinfo,
                    ],
                ]);

            case 'notifications/initialized':
            case 'notifications/cancelled':
                return self::result(202, [], null);

            case 'ping':
                return self::result(200, [], ['jsonrpc' => '2.0', 'id' => $id, 'result' => new \stdClass()]);

            // Moderne Aera: Discovery statt Handshake.
            case 'server/discover':
                return self::result(200, [], [
                    'jsonrpc' => '2.0',
                    'id' => $id,
                    'result' => [
                        'supportedVersions' => [self::MODERN_VERSION, self::LEGACY_VERSION],
                        'capabilities' => ['tools' => new \stdClass()],
                        'serverInfo' => $serverinfo,
                    ],
                ]);

            case 'tools/list':
                return self::result(200, [], [
                    'jsonrpc' => '2.0',
                    'id' => $id,
                    'result' => ['tools' => self::tools()],
                ]);

            case 'tools/call':
                return self::handle_tools_call($id, $params);

            default:
                return self::error(404, $id, -32601, 'Method not found: ' . $rpcmethod);
        }
    }

    /**
     * tools/call: Laufzeitpruefung des Vertrags, dann der eigentliche
     * Aufruf ueber Moodles Webservice-Schicht (#295, Punkt 1).
     *
     * @param mixed $id
     * @param array $params
     * @return array{status: int, headers: array<string, string>, body: array|null}
     */
    private static function handle_tools_call($id, array $params): array {
        $toolname = (string) ($params['name'] ?? '');
        $function = privacy_surface::function_for_tool($toolname);
        if ($function === null) {
            return self::error(404, $id, -32601, 'Unknown tool: ' . $toolname);
        }

        $response = external_api::call_external_function($function, $params['arguments'] ?? []);
        if ($response['error']) {
            return self::result(200, [], [
                'jsonrpc' => '2.0',
                'id' => $id,
                'result' => [
                    'isError' => true,
                    'content' => [['type' => 'text', 'text' => $response['exception']->message ?? 'error']],
                ],
            ]);
        }

        $data = $response['data'];
        return self::result(200, [], [
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
    }

    /**
     * Bildet ein Bearer-Token auf einen Moodle-Nutzer ab und richtet $USER
     * ein.
     *
     * ponytail: bewusst noch ein Moodle-Webservice-Token statt OAuth. Im
     * Produkt ersetzt der OAuth-2.1-Autorisierungsserver (#291/#292) diesen
     * Block vollstaendig; bis dahin traegt die Kruecke den Endpunkt auf der
     * Spike-Instanz.
     *
     * @param string|null $token
     * @return bool
     */
    private static function authenticate(?string $token): bool {
        global $DB;

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
        external_api::set_context_restriction(\context_system::instance());
        return true;
    }

    /**
     * Die Werkzeugliste - direkt aus der Allowlist abgeleitet, damit
     * gelistet und aufrufbar dieselbe Menge sind.
     *
     * @return array
     */
    private static function tools(): array {
        $tools = [];
        foreach (array_keys(privacy_surface::ALLOWED_TOOLS) as $name) {
            $tools[] = [
                'name' => $name,
                'description' => self::TOOL_DESCRIPTIONS[$name] ?? '',
                'inputSchema' => [
                    'type' => 'object',
                    'properties' => new \stdClass(),
                    'additionalProperties' => false,
                ],
            ];
        }
        return $tools;
    }

    /**
     * @param mixed $id
     * @param array<string, string> $extraheaders
     * @return array{status: int, headers: array<string, string>, body: array|null}
     */
    private static function error(int $status, $id, int $code, string $message, array $extraheaders = []): array {
        return self::result($status, $extraheaders, [
            'jsonrpc' => '2.0',
            'id' => $id,
            'error' => ['code' => $code, 'message' => $message],
        ]);
    }

    /**
     * @param array<string, string> $headers
     * @param array|null $body
     * @return array{status: int, headers: array<string, string>, body: array|null}
     */
    private static function result(int $status, array $headers, ?array $body): array {
        return ['status' => $status, 'headers' => $headers, 'body' => $body];
    }
}
