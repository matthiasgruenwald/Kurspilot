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
        'kurspilot_get_course_catalog' => 'Liest eine kompakte, filterbare Moodle-Katalogansicht: Abschnitte, sichtbare '
            . 'Inhalte, Teststruktur, Sichtbarkeit, Abschluss und Voraussetzungen. Quelle ist klar als "aus Moodle '
            . 'gelesen" markiert; detail="full" liefert gezielt Vollinhalte, "compact" (Standard) nur eine Vorschau. '
            . 'Eine Beschraenkung auf ein Profilmerkmal (z.B. Fachgruppe) erscheint maskiert: Typ, Feld und Operator '
            . 'bleiben sichtbar, der Wert ist ersetzt. Gruppennamen werden nie geliefert, nur Gruppenmodus und '
            . 'Kennungen (cmid/sectionnum) - eine Gruppierung ist nur dann anzunehmen, wenn die Lehrkraft sie '
            . 'ausdruecklich nennt, niemals erraten.',
        'kurspilot_get_modules' => 'Gibt alle Aktivitaeten eines Kurses oder Abschnitts zurueck - mit cmid, Typ und '
            . 'Name. Verwenden um cmids fuer gezielte Zugriffe zu ermitteln.',
        'kurspilot_get_sections' => 'Gibt alle Abschnitte eines Moodle-Kurses zurueck (Name, Nummer, ID).',
        'kurspilot_get_question_categories' => 'Listet alle Fragenbank-Kategorien der ausgewaehlten benannten '
            . 'Kurs-/Projekt-Fragensammlung (inkl. der Top-Kategorie) mit id, Name und uebergeordneter '
            . 'Kategorie-ID - fuer Wiederverwendung statt Doppelanlage.',
        'kurspilot_get_question' => 'Liefert die latest version einer Frage in einer Kategorie - eindeutig '
            . 'identifiziert per Name ODER per questionid. Vor einer Bearbeitung aufrufen, um die aktuelle '
            . 'questionid und questionbankentryid zu kennen.',
        'kurspilot_plan_quiz_cleanup' => 'Plant eine manuelle Bereinigung, wenn eine neue Quizversion weniger '
            . 'Fragen enthaelt. Kurspilot loescht weder Quiz-Slots noch Fragen: Die Antwort nennt jeden '
            . 'betroffenen Slot, Frage und Kategorie sowie den direkten Moodle-Link. Dort nur aus dem Quiz '
            . 'entfernen, nicht aus der Fragensammlung loeschen; die Fragen bleiben wiederverwendbar.',
        'kurspilot_list_context_files' => 'Listet den eigenen Kontextbereich der angemeldeten Lehrkraft auf '
            . '(Lerngruppenprofile, Fachprofile, gemerkte Vorlagen). "path" waehlt optional einen Unterordner, leer '
            . 'liefert die Wurzel. Nur der eigene Bereich der aufrufenden Person ist erreichbar.',
        'kurspilot_read_context_file' => 'Liest eine einzelne Datei aus dem eigenen Kontextbereich der angemeldeten '
            . 'Lehrkraft, z.B. "vorlagen.md" an der Wurzel fuer gemerkte Vorlagenentscheidungen. Rein lesend - '
            . 'Schreiben ist ueber dieses Werkzeug nicht moeglich.',
    ];

    /** @var array<string, array<string, mixed>> MCP-Toolname => zusaetzliche inputSchema-Properties (#341). */
    private const TOOL_SCHEMAS = [
        'kurspilot_get_course_catalog' => [
            'properties' => [
                'courseid' => ['type' => 'number', 'description' => 'Kurs-ID'],
                'sectionnum' => ['type' => 'number', 'description' => 'Abschnittsnummer (0-basiert, -1 = alle Abschnitte)'],
                'modname' => ['type' => 'string', 'description' => 'Optionaler Aktivitaetstyp-Filter, z.B. page, label, assign, quiz, url'],
                'detail' => ['type' => 'string', 'enum' => ['compact', 'full'], 'description' => 'compact = Vorschau, full = Vollinhalte'],
            ],
            'required' => ['courseid'],
        ],
        'kurspilot_get_modules' => [
            'properties' => [
                'courseid' => ['type' => 'number', 'description' => 'Kurs-ID'],
                'sectionnum' => ['type' => 'number', 'description' => 'Abschnittsnummer (0-basiert, -1 = alle Abschnitte)'],
            ],
            'required' => ['courseid'],
        ],
        'kurspilot_get_sections' => [
            'properties' => [
                'courseid' => ['type' => 'number', 'description' => 'Die Kurs-ID (steht in der URL: ?id=XX)'],
            ],
            'required' => ['courseid'],
        ],
        'kurspilot_get_question_categories' => [
            'properties' => [
                'courseid' => ['type' => 'number', 'description' => 'Kurs-ID'],
                'questionbankid' => ['type' => 'number', 'description' => 'ID der benannten Fragensammlung (CMID)'],
            ],
            'required' => ['courseid', 'questionbankid'],
        ],
        'kurspilot_get_question' => [
            'properties' => [
                'categoryid' => ['type' => 'number', 'description' => 'ID der Fragenbank-Kategorie'],
                'name' => ['type' => 'string', 'description' => 'Name der Frage (alternativ zu questionid)'],
                'questionid' => ['type' => 'number', 'description' => 'questionid einer beliebigen Version der Frage (alternativ zu name)'],
            ],
            'required' => ['categoryid'],
        ],
        'kurspilot_plan_quiz_cleanup' => [
            'properties' => [
                'cmid' => ['type' => 'number', 'description' => 'Course module ID des Quiz'],
                'keep_questionbankentryids' => [
                    'type' => 'array',
                    'items' => ['type' => 'number'],
                    'description' => 'questionbankentryid-Werte, die in der neuen Quizversion verbleiben; alle anderen Slots werden ausschliesslich als manuelle Schritte ausgegeben.',
                ],
            ],
            'required' => ['cmid', 'keep_questionbankentryids'],
        ],
        'kurspilot_list_context_files' => [
            'properties' => [
                'path' => ['type' => 'string', 'description' => 'Optionaler Unterordner, leer fuer die Wurzel'],
            ],
        ],
        'kurspilot_read_context_file' => [
            'properties' => [
                'path' => ['type' => 'string', 'description' => 'Dateipfad relativ zur Wurzel, z.B. "vorlagen.md"'],
            ],
            'required' => ['path'],
        ],
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
                // #339: eigener Aufruf, nicht ueber error() - dieser Zweig
                // liegt vor handle_authorized() und antwortet nicht im
                // JSON-RPC-Fehlerformat.
                access_log::log_failure('Origin not allowed');
                return self::result(403, [], ['error' => 'Origin not allowed']);
            }
        }
        $corsheaders = $origin !== null ? ['Access-Control-Allow-Origin' => $origin, 'Vary' => 'Origin'] : [];

        // CORS-Preflight (#337-Nachtrag): der Custom Connector von Claude.ai
        // ruft mcp.php per Browser-fetch() mit Authorization-Header auf -
        // ohne Antwort auf den OPTIONS-Preflight blockt der Browser den
        // eigentlichen POST clientseitig, bevor er je hier ankommt (per
        // curl/Server-Log nicht sichtbar, nur am Verbindungsfehler auf
        // Claude-Seite erkennbar).
        if (($headers['method'] ?? 'POST') === 'OPTIONS') {
            return self::result(204, $corsheaders + [
                'Access-Control-Allow-Methods' => 'POST, OPTIONS',
                'Access-Control-Allow-Headers' => 'Authorization, Content-Type',
                'Access-Control-Max-Age' => '86400',
            ], null);
        }

        $result = self::handle_authorized($request, $token, $headers);
        $result['headers'] = $corsheaders + $result['headers'];
        return $result;
    }

    /**
     * Der eigentliche Anfrage-Ablauf nach Origin-Pruefung und CORS-Preflight
     * (#337-Nachtrag: aus handle() ausgelagert, damit CORS-Kopfzeilen an
     * genau einer Stelle auf jede Antwort angewendet werden, statt an jedem
     * einzelnen return).
     *
     * @param array|null $request
     * @param string|null $token
     * @param array{origin: ?string, pathinfo: ?string, method: ?string} $headers
     * @return array{status: int, headers: array<string, string>, body: array|null}
     */
    private static function handle_authorized(?array $request, ?string $token, array $headers): array {
        global $CFG;

        // Globale Notbremse (#338): sperrt jeden weiteren MCP-Zugriff sofort,
        // unabhaengig von Token-Gueltigkeit oder Capability - deshalb vor
        // allem anderen geprueft. Ausgegebene Token bleiben dabei bestehen
        // (Unterschied zum Sammelwiderruf in oauth_lib::revoke_all_tokens()).
        // Rein eine Einstellung dieses einen Endpunkts - der normale
        // Moodle-Login (require_login() auf den uebrigen Seiten) ist davon
        // nicht betroffen. Standard (kein Konfigwert gesetzt) ist
        // eingeschaltet, deshalb der Vergleich auf explizit '0'.
        if ((string) get_config('local_kurspilot', 'remoteaccessenabled') === '0') {
            return self::error(403, $request['id'] ?? null, -32003, get_string('remoteaccessdisabled', 'local_kurspilot'));
        }

        // Protected-Resource-Metadaten am Ressourcenpfad selbst (RFC 9728,
        // Abschnitt 3) - Fund aus #312.
        $pathinfo = trim($headers['pathinfo'] ?? '', '/');
        if ($pathinfo === '.well-known/oauth-protected-resource') {
            return self::result(
                200,
                ['Cache-Control' => 'no-store'],
                oauth_lib::protected_resource_metadata($CFG->wwwroot)
            );
        }

        $method = $headers['method'] ?? 'POST';
        if ($method !== 'POST') {
            // #339: bewusst ungeloggt - kein JSON-RPC-Zugriffsversuch (kein
            // geparster Rumpf, kein Werkzeugbezug), sondern ein falsch
            // konfigurierter HTTP-Client.
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

        // Fernzugriffs-Notbremse (#296, #337): getrennt von local/kurspilot:use,
        // damit ein Admin den Fernzugriff systemweit sperren kann, ohne
        // einzelne Kurse anzufassen. Anders als der vage Auth-Fehler oben ist
        // dieser Fehler konkret - ein gueltiges Token allein reicht nicht.
        if (!has_capability('local/kurspilot:useremote', \context_system::instance())) {
            return self::error(403, $id, -32002, get_string('capabilitymissing', 'local_kurspilot', 'local/kurspilot:useremote'));
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
                    'result' => [
                        'tools' => self::tools(),
                        // Von der Revision 2026-07-28 verlangt (#337-Nachtrag,
                        // Fund aus dem Claude-Code-Livetest: ohne dieses Feld
                        // verwirft ein 2026-07-28-Client die Antwort als
                        // ungueltig - "missing required resultType", derselbe
                        // Grund, aus dem Claude.ai nach dem Token-Erhalt
                        // stillschweigend abbrach). 'data' (wie bei
                        // tools/call) ist fuer tools/list kein gueltiger Wert
                        // ("Unsupported result type 'data' for tools/list") -
                        // die Liste ist vollstaendig, nicht paginiert, also
                        // 'complete'. ttlMs/cacheScope wie tools/call
                        // Pflichtfelder desselben Schemas (Fund direkt im
                        // Anschluss: "expected number, received undefined"
                        // fuer ttlMs, cacheScope nur "public"|"private", nicht
                        // "session" - private, weil hinter Auth/Capability-
                        // Pruefung, wie bei tools/call.
                        'resultType' => 'complete',
                        'ttlMs' => 300000,
                        'cacheScope' => 'private',
                    ],
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
            // ponytail: $message ist die rohe Exception-Message der
            // aufgerufenen Werkzeugfunktion - aktuell unbedenklich, da das
            // einzige Werkzeug (kurspilot_list_courses) ohne Argumente
            // auskommt und seine Fehler nur feste Capability-Codes liefert.
            // Sobald ein Werkzeug mit sensiblen Parametern dazukommt, hier
            // pruefen/kuerzen statt der Annahme "Moodle-Exceptions sind
            // immer geheimnisfrei" weiter zu vertrauen.
            $message = $response['exception']->message ?? 'error';
            access_log::log_failure($message, $toolname);
            return self::result(200, [], [
                'jsonrpc' => '2.0',
                'id' => $id,
                'result' => [
                    'isError' => true,
                    'content' => [['type' => 'text', 'text' => $message]],
                ],
            ]);
        }

        access_log::log_success($toolname);
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
                // cacheScope kennt nur "public"/"private" (#337-Nachtrag,
                // Fund aus dem Claude-Code-Livetest: "session" war ungueltig
                // und liess jeden tools/call-Aufruf an der Client-Validierung
                // scheitern) - "private", weil personenbezogene Kursdaten der
                // aufrufenden Lehrkraft.
                'resultType' => 'data',
                'ttlMs' => 60000,
                'cacheScope' => 'private',
            ],
        ]);
    }

    /**
     * Bildet ein Bearer-Token auf einen Moodle-Nutzer ab und richtet $USER
     * ein (#337).
     *
     * Akzeptiert ausschliesslich OAuth-Access-Token aus
     * {@see oauth_lib::authenticate_access_token()} - die fruehere
     * Webservice-Token-Kruecke (external_tokens) aus dem Prototypen entfaellt
     * vollstaendig, der OAuth-2.1-Autorisierungsserver (#335/#336) ist ihr
     * einziger Ersatz.
     *
     * @param string|null $token
     * @return bool
     */
    private static function authenticate(?string $token): bool {
        global $DB, $USER;

        if ($token === null) {
            return false;
        }
        $userid = oauth_lib::authenticate_access_token($token);
        if ($userid === null) {
            return false;
        }
        $usr = $DB->get_record('user', ['id' => $userid, 'deleted' => 0, 'suspended' => 0]);
        if (!$usr) {
            return false;
        }

        \core\session\manager::set_user($usr);
        // Bearer-Token-Auth ist zustandslos (kein Cookie/Session-Vertrauen,
        // jeder POST validiert das Token neu, #337/Spec 0012 Abschnitt 3) -
        // die CSRF-Abwehr per sesskey adressiert ein Cookie-Session-Risiko
        // (Ambient Authority ueber Browser-Cookies), das hier nicht existiert:
        // ein Angreifer kann den Authorization-Header nicht faelschen lassen.
        // Noetig, weil external_api::call_external_function() sesskey nur
        // dann uebergeht, wenn WS_SERVER=true ist (mcp.php setzt das vor dem
        // Moodle-Bootstrap) - in PHPUnit ist die Konstante zu diesem
        // Zeitpunkt bereits unveraenderlich auf false gesetzt, siehe
        // dispatcher_test.php.
        $USER->ignoresesskey = true;
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
            $schema = self::TOOL_SCHEMAS[$name] ?? null;
            $inputschema = [
                'type' => 'object',
                'properties' => $schema ? $schema['properties'] : new \stdClass(),
                'additionalProperties' => false,
            ];
            if ($schema && !empty($schema['required'])) {
                $inputschema['required'] = $schema['required'];
            }
            $tools[] = [
                'name' => $name,
                'description' => self::TOOL_DESCRIPTIONS[$name] ?? '',
                'inputSchema' => $inputschema,
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
        // Zentraler Funnelpunkt fuer jede JSON-RPC-Fehlerantwort (#339): Auth-
        // Gate, Capability-Gate, Notbremse, Parse-Fehler, unbekannte
        // Methode/Werkzeug laufen alle hier durch (Origin-Ablehnung und
        // Method-Not-Allowed antworten NICHT im JSON-RPC-Format und damit
        // nicht ueber error() - Origin-Ablehnung hat einen eigenen
        // access_log::log_failure()-Aufruf in handle(), 405 bleibt bewusst
        // ungeloggt, siehe Kommentar dort). $message ist stets ein fester
        // Text/Code, nie das Zugriffstoken (das taucht an keiner Stelle des
        // Aufrufpfads in einer Fehlermeldung auf).
        access_log::log_failure($message);
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
