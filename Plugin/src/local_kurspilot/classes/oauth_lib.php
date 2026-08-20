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

/**
 * OAuth-2.1-Discovery und Client-Registrierung (#335).
 *
 * Scope bewusst eng gehalten: Discovery-Metadaten (RFC 8414 + RFC 9728),
 * Dynamic Client Registration (RFC 7591) und Client ID Metadata Document
 * (CIMD) als zweiter Registrierungsweg. Authorize/Consent/Token-Ausgabe
 * folgen erst in #336 - diese Klasse legt keine Codes oder Access-Token an.
 *
 * Seam-Muster wie {@see dispatcher} (#334): jede handle_*-Methode ist eine
 * reine Funktion (Werte rein, Antwortwert raus, kein exit, keine HTTP-
 * Superglobals), per PHPUnit ohne laufenden Webserver pruefbar. Die duennen
 * PHP-Dateien unter oauth/ und oauth.php tun nur noch Ein-/Ausgabe.
 *
 * @package    local_kurspilot
 * @copyright  2026 Kurspilot
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
final class oauth_lib {

    /** @var string DB-Tabelle der per DCR/CIMD registrierten Clients. */
    private const CLIENT_TABLE = 'local_kurspilot_oauth_client';

    /**
     * Autorisierungsserver-Metadaten (RFC 8414). Reine Funktion des
     * Ausstellers - kein globaler Zugriff, damit ohne Moodle-Bootstrap
     * pruefbar.
     *
     * @param string $wwwroot
     * @return array
     */
    public static function authorization_server_metadata(string $wwwroot): array {
        return [
            // RFC 8414.
            'issuer' => $wwwroot . '/local/kurspilot/oauth.php',
            'authorization_endpoint' => $wwwroot . '/local/kurspilot/oauth/authorize.php',
            'token_endpoint' => $wwwroot . '/local/kurspilot/oauth/token.php',
            'registration_endpoint' => $wwwroot . '/local/kurspilot/oauth/register.php',
            'response_types_supported' => ['code'],
            'grant_types_supported' => ['authorization_code', 'refresh_token'],
            'code_challenge_methods_supported' => ['S256'],
            'token_endpoint_auth_methods_supported' => ['none', 'client_secret_post'],
            'scopes_supported' => ['kurspilot.read'],
            // OIDC-Pflichtfelder - erzwungen durch den Namensraum, obwohl das
            // Plugin kein OIDC-Provider ist (#302, Punkt 2).
            'jwks_uri' => $wwwroot . '/local/kurspilot/oauth/jwks.php',
            'subject_types_supported' => ['public'],
            'id_token_signing_alg_values_supported' => ['RS256'],
        ];
    }

    /**
     * Metadaten der geschuetzten Ressource (RFC 9728). Wird unter zwei
     * Adressen ausgeliefert (#312, #335): oauth/protected-resource.php (aus
     * dem WWW-Authenticate-Header verlinkt) und als PATH_INFO auf mcp.php
     * selbst (von Clients, die den Header nie lesen und den Pfad aus der
     * Ressourcen-URL ableiten) - beide rufen diese eine Quelle auf.
     *
     * @param string $wwwroot
     * @return array
     */
    public static function protected_resource_metadata(string $wwwroot): array {
        return [
            'resource' => $wwwroot . '/local/kurspilot/mcp.php',
            'authorization_servers' => [$wwwroot . '/local/kurspilot/oauth.php'],
            'scopes_supported' => ['kurspilot.read'],
            'bearer_methods_supported' => ['header'],
        ];
    }

    /**
     * Discovery-Handler fuer oauth.php: bedient ausschliesslich die beiden
     * bekannten Namen unter PATH_INFO (OAuth- und OIDC-Namensraum, #302).
     * Alles andere ist ein Irrlaeufer und liefert 404 als JSON, nie HTML.
     *
     * @param string $wwwroot
     * @param string $pathinfo Bereits getrimmter PATH_INFO-Wert.
     * @return array{status: int, headers: array<string, string>, body: array}
     */
    public static function handle_discovery(string $wwwroot, string $pathinfo): array {
        $known = ['', '.well-known/openid-configuration', '.well-known/oauth-authorization-server'];
        if (!in_array($pathinfo, $known, true)) {
            return self::result(404, [], ['error' => 'not_found', 'path_info' => $pathinfo]);
        }
        return self::result(200, ['Cache-Control' => 'no-store'], self::authorization_server_metadata($wwwroot));
    }

    /**
     * Registriert einen Client per DCR (RFC 7591).
     *
     * @param array $metadata Decodierter JSON-Body der Registrierungsanfrage.
     * @return array Fehlerfall: ['error' => ..., 'error_description' => ...].
     *               Erfolg: vollstaendiger Client-Datensatz inkl. client_id.
     */
    public static function register_client(array $metadata): array {
        $redirecturis = $metadata['redirect_uris'] ?? null;
        if (!is_array($redirecturis) || empty($redirecturis)) {
            return ['error' => 'invalid_client_metadata', 'error_description' => 'redirect_uris ist Pflicht.'];
        }
        foreach ($redirecturis as $uri) {
            if (!self::is_allowed_redirect_uri($uri)) {
                return [
                    'error' => 'invalid_redirect_uri',
                    'error_description' => 'redirect_uri muss https sein oder ein Loopback (http://127.0.0.1 / http://localhost).',
                ];
            }
        }

        $authmethod = $metadata['token_endpoint_auth_method'] ?? 'none';
        if (!in_array($authmethod, ['none', 'client_secret_post'], true)) {
            $authmethod = 'none';
        }
        $clientname = clean_param($metadata['client_name'] ?? '', PARAM_TEXT) ?: null;
        $clientsecret = $authmethod === 'client_secret_post' ? self::random_token(32) : null;

        $record = self::persist_client(self::random_token(24), $clientname, $redirecturis, $authmethod, $clientsecret, 'dcr');
        return self::client_registration_response($record);
    }

    /**
     * Legt einen Client-Datensatz an - gemeinsamer letzter Schritt fuer DCR
     * (register_client()) und CIMD (cache_cimd_client()), die sich nur in
     * Herkunft und ein paar Feldwerten unterscheiden.
     *
     * @param string $clientid
     * @param string|null $clientname
     * @param array $redirecturis
     * @param string $tokenendpointauthmethod
     * @param string|null $clientsecret
     * @param string $source 'dcr' oder 'cimd'.
     * @return \stdClass
     */
    private static function persist_client(
        string $clientid,
        ?string $clientname,
        array $redirecturis,
        string $tokenendpointauthmethod,
        ?string $clientsecret,
        string $source
    ): \stdClass {
        global $DB;

        $record = new \stdClass();
        $record->clientid = $clientid;
        $record->clientname = $clientname;
        $record->redirecturis = json_encode(array_values($redirecturis));
        $record->tokenendpointauthmethod = $tokenendpointauthmethod;
        $record->clientsecret = $clientsecret;
        $record->source = $source;
        $record->timecreated = time();
        $record->id = $DB->insert_record(self::CLIENT_TABLE, $record);
        return $record;
    }

    /**
     * Registrierungs-Handler fuer oauth/register.php: Methodenpruefung,
     * JSON-Parsing, Aufruf von register_client(), einheitliches
     * Antwortformat - Fehlerantworten immer JSON (RFC 7591, Abschnitt 3.2.2).
     *
     * @param string $method
     * @param array|null $body Bereits dekodierter JSON-Rumpf, oder null bei
     *        Parse-Fehler.
     * @return array{status: int, headers: array<string, string>, body: array}
     */
    public static function handle_registration(string $method, ?array $body): array {
        if ($method !== 'POST') {
            return self::result(405, ['Allow' => 'POST'], [
                'error' => 'invalid_request',
                'error_description' => 'Nur POST ist erlaubt.',
            ]);
        }
        if ($body === null) {
            return self::result(400, [], [
                'error' => 'invalid_client_metadata',
                'error_description' => 'Ungueltiges JSON.',
            ]);
        }

        $result = self::register_client($body);
        if (isset($result['error'])) {
            return self::result(400, [], $result);
        }
        return self::result(201, ['Cache-Control' => 'no-store'], $result);
    }

    /**
     * Formt einen Client-Datensatz in die RFC-7591-Antwortform.
     *
     * @param \stdClass $record
     * @return array
     */
    public static function client_registration_response(\stdClass $record): array {
        $response = [
            'client_id' => $record->clientid,
            'client_name' => $record->clientname,
            'redirect_uris' => json_decode($record->redirecturis, true),
            'token_endpoint_auth_method' => $record->tokenendpointauthmethod,
            'grant_types' => ['authorization_code', 'refresh_token'],
            'response_types' => ['code'],
        ];
        if ($record->clientsecret !== null) {
            $response['client_secret'] = $record->clientsecret;
        }
        return $response;
    }

    /**
     * https-Redirect-URIs sind Pflicht, ausser Loopback fuer lokale
     * CLI-Clients (RFC 8252, von OAuth 2.1 fuer native Apps uebernommen).
     *
     * @param mixed $uri
     * @return bool
     */
    public static function is_allowed_redirect_uri($uri): bool {
        if (!is_string($uri) || $uri === '') {
            return false;
        }
        $parts = parse_url($uri);
        if ($parts === false || empty($parts['scheme']) || empty($parts['host'])) {
            return false;
        }
        if ($parts['scheme'] === 'https') {
            return true;
        }
        if ($parts['scheme'] === 'http' && in_array($parts['host'], ['127.0.0.1', 'localhost', '::1'], true)) {
            return true;
        }
        return false;
    }

    /**
     * Holt einen Client per client_id. Fehlt er lokal und sieht die
     * client_id wie eine URL aus, wird sie als CIMD-Dokument abgerufen und
     * gecacht - der zweite, DCR-lose Registrierungsweg (#291, #335): sonst
     * legt jede Neuverbindung eines CIMD-Clients einen weiteren
     * DCR-Client an.
     *
     * @param string $clientid
     * @return \stdClass|null
     */
    public static function get_client(string $clientid): ?\stdClass {
        global $DB;

        $record = $DB->get_record(self::CLIENT_TABLE, ['clientid' => $clientid]);
        if ($record) {
            return $record;
        }
        if (!self::looks_like_cimd_url($clientid)) {
            return null;
        }
        return self::fetch_and_cache_cimd_client($clientid);
    }

    /**
     * Ist diese client_id eine https-URL (CIMD-Kandidat)?
     *
     * @param string $clientid
     * @return bool
     */
    protected static function looks_like_cimd_url(string $clientid): bool {
        $parts = parse_url($clientid);
        return $parts !== false && ($parts['scheme'] ?? '') === 'https' && !empty($parts['host']);
    }

    /**
     * Ruft ein CIMD-Dokument per HTTP ab. Duenne Netzwerk-Schale um
     * {@see cache_cimd_client()} - die eigentliche Pruef-/Persistierlogik ist
     * dort, netzwerkfrei und damit per PHPUnit ohne echten HTTP-Request
     * pruefbar (#335: Erfolgsfall zuvor ungetestet, da nur ueber Netzwerk
     * erreichbar).
     *
     * @param string $url
     * @return \stdClass|null
     */
    protected static function fetch_and_cache_cimd_client(string $url): ?\stdClass {
        $curl = new \curl();
        $body = $curl->get($url, [], ['CURLOPT_TIMEOUT' => 5, 'CURLOPT_FOLLOWLOCATION' => false]);
        $info = $curl->get_info();
        if (($info['http_code'] ?? 0) !== 200) {
            return null;
        }
        $metadata = json_decode($body, true);
        if (!is_array($metadata)) {
            return null;
        }
        return self::cache_cimd_client($url, $metadata);
    }

    /**
     * Prueft ein bereits dekodiertes CIMD-Dokument und legt bei Gueltigkeit
     * einen Client-Datensatz an, dessen clientid die URL selbst ist.
     *
     * ponytail: kein Cache-Refresh-Mechanismus - ein einmal gecachter
     * CIMD-Client bleibt bei den Werten des ersten Abrufs. Nachziehen, falls
     * sich in der Praxis zeigt, dass CIMD-Dokumente sich aendern muessen.
     *
     * @param string $url Die client_id (= CIMD-URL).
     * @param array $metadata Dekodiertes CIMD-Dokument.
     * @return \stdClass|null null bei ungueltigen/fehlenden redirect_uris.
     */
    public static function cache_cimd_client(string $url, array $metadata): ?\stdClass {
        $redirecturis = $metadata['redirect_uris'] ?? null;
        if (!is_array($redirecturis) || empty($redirecturis)) {
            return null;
        }
        foreach ($redirecturis as $uri) {
            if (!self::is_allowed_redirect_uri($uri)) {
                return null;
            }
        }

        $clientname = clean_param($metadata['client_name'] ?? '', PARAM_TEXT) ?: null;
        return self::persist_client($url, $clientname, $redirecturis, 'none', null, 'cimd');
    }

    /**
     * Kryptografisch zufaelliger Token als Hex-String.
     *
     * @param int $bytes
     * @return string
     */
    public static function random_token(int $bytes = 32): string {
        return bin2hex(random_bytes($bytes));
    }

    /**
     * @param array<string, string> $headers
     * @param array $body
     * @return array{status: int, headers: array<string, string>, body: array}
     */
    private static function result(int $status, array $headers, array $body): array {
        return ['status' => $status, 'headers' => $headers, 'body' => $body];
    }
}
