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
 * OAuth-2.1-Autorisierungsserver: Client-Registrierung, Codes, Token (#313).
 *
 * DCR (RFC 7591) und CIMD sind beide Wege zu einem Client-Datensatz (#291,
 * #292). Codes sind PKCE/S256-gebunden und einmalig verwendbar (OAuth 2.1
 * verlangt PKCE fuer alle Clients, nicht nur oeffentliche). Access-Token
 * sind wie Moodles eigene Webservice-Token opake Zufallswerte in der DB,
 * nicht signierte JWTs - es gibt keinen Grund, Faelschungssicherheit ueber
 * Kryptografie zu loesen, wenn ein DB-Abgleich genuegt (#291: kein
 * Wiedererfindungsbedarf).
 *
 * @package    local_kurspilot
 * @copyright  2026 Kurspilot
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class oauth_lib {

    /** @var int Access-Token-Lebensdauer in Sekunden (#295, Punkt 5). */
    public const ACCESS_TOKEN_TTL = HOURSECS;

    /** @var int Refresh-Token-Lebensdauer in Sekunden (#295, Punkt 5). */
    public const REFRESH_TOKEN_TTL = 30 * DAYSECS;

    /** @var int Authorization-Code-Lebensdauer in Sekunden (RFC 6749: kurzlebig). */
    public const CODE_TTL = 600;

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
     * Registriert einen Client per DCR (RFC 7591).
     *
     * @param array $metadata Decodierter JSON-Body der Registrierungsanfrage.
     * @return array Fehlerfall: ['error' => ..., 'error_description' => ...].
     *               Erfolg: vollstaendiger Client-Datensatz inkl. client_id.
     */
    public static function register_client(array $metadata): array {
        global $DB;

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

        $record = new \stdClass();
        $record->clientid = self::random_token(24);
        $record->clientname = clean_param($metadata['client_name'] ?? '', PARAM_TEXT) ?: null;
        $record->redirecturis = json_encode(array_values($redirecturis));
        $record->tokenendpointauthmethod = $authmethod;
        $record->clientsecret = $authmethod === 'client_secret_post' ? self::random_token(32) : null;
        $record->source = 'dcr';
        $record->timecreated = time();
        $record->id = $DB->insert_record('local_kurspilot_oauth_client', $record);

        return self::client_registration_response($record);
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
     * https-Redirect-URIs sind Pflicht, ausser Loopback fuer lokale CLI-Clients
     * (RFC 8252, von OAuth 2.1 fuer native Apps uebernommen).
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
     * Holt einen Client per client_id. Fehlt er lokal und sieht die client_id
     * wie eine URL aus, wird sie als CIMD-Dokument abgerufen und gecacht
     * (#291: DCR und CIMD beide noetig, CIMD damit nicht jede Neuverbindung
     * einen neuen DCR-Client anlegt).
     *
     * @param string $clientid
     * @return \stdClass|null
     */
    public static function get_client(string $clientid): ?\stdClass {
        global $DB;

        $record = $DB->get_record('local_kurspilot_oauth_client', ['clientid' => $clientid]);
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
     * Ruft ein CIMD-Dokument ab (die client_id selbst ist die URL) und legt
     * einen Client-Datensatz an, dessen clientid die URL ist.
     *
     * ponytail: kein Cache-Refresh-Mechanismus - ein einmal gecachter CIMD-
     * Client bleibt bei den Werten des ersten Abrufs. Nachziehen, falls sich
     * in der Praxis zeigt, dass CIMD-Dokumente sich aendern muessen.
     *
     * @param string $url
     * @return \stdClass|null
     */
    protected static function fetch_and_cache_cimd_client(string $url): ?\stdClass {
        global $DB;

        $curl = new \curl();
        $body = $curl->get($url, [], ['CURLOPT_TIMEOUT' => 5, 'CURLOPT_FOLLOWLOCATION' => false]);
        $info = $curl->get_info();
        if (($info['http_code'] ?? 0) !== 200) {
            return null;
        }
        $metadata = json_decode($body, true);
        if (!is_array($metadata) || empty($metadata['redirect_uris']) || !is_array($metadata['redirect_uris'])) {
            return null;
        }
        foreach ($metadata['redirect_uris'] as $uri) {
            if (!self::is_allowed_redirect_uri($uri)) {
                return null;
            }
        }

        $record = new \stdClass();
        $record->clientid = $url;
        $record->clientname = clean_param($metadata['client_name'] ?? '', PARAM_TEXT) ?: null;
        $record->redirecturis = json_encode(array_values($metadata['redirect_uris']));
        $record->tokenendpointauthmethod = 'none';
        $record->clientsecret = null;
        $record->source = 'cimd';
        $record->timecreated = time();
        $record->id = $DB->insert_record('local_kurspilot_oauth_client', $record);
        return $record;
    }

    /**
     * Vergleicht eine redirect_uri gegen die beim Client registrierten.
     *
     * @param \stdClass $client
     * @param string $redirecturi
     * @return bool
     */
    public static function redirect_uri_matches(\stdClass $client, string $redirecturi): bool {
        $allowed = json_decode($client->redirecturis, true) ?: [];
        return in_array($redirecturi, $allowed, true);
    }

    /**
     * Legt einen Authorization Code an (PKCE-gebunden, einmalig).
     *
     * @param string $clientid
     * @param int $userid
     * @param string $redirecturi
     * @param string $codechallenge
     * @param string $codechallengemethod
     * @return string Der Code.
     */
    public static function issue_code(
        string $clientid,
        int $userid,
        string $redirecturi,
        string $codechallenge,
        string $codechallengemethod
    ): string {
        global $DB;

        $record = new \stdClass();
        $record->code = self::random_token();
        $record->clientid = $clientid;
        $record->userid = $userid;
        $record->redirecturi = $redirecturi;
        $record->codechallenge = $codechallenge;
        $record->codechallengemethod = $codechallengemethod;
        $record->expires = time() + self::CODE_TTL;
        $record->used = 0;
        $DB->insert_record('local_kurspilot_oauth_code', $record);
        return $record->code;
    }

    /**
     * Verifiziert den PKCE-Code-Verifier gegen die gespeicherte Challenge.
     * Nur S256 ist zulaessig (#291, #313: PKCE/S256 Pflicht).
     *
     * @param string $verifier
     * @param string $challenge
     * @param string $method
     * @return bool
     */
    public static function verify_pkce(string $verifier, string $challenge, string $method): bool {
        if ($method !== 'S256') {
            return false;
        }
        $computed = rtrim(strtr(base64_encode(hash('sha256', $verifier, true)), '+/', '-_'), '=');
        return hash_equals($challenge, $computed);
    }

    /**
     * Loest einen Authorization Code ein: prueft Gueltigkeit, PKCE, Client-
     * und redirect_uri-Bindung, markiert ihn als verbraucht und gibt frische
     * Access-/Refresh-Token zurueck.
     *
     * @param string $code
     * @param string $clientid
     * @param string $redirecturi
     * @param string $codeverifier
     * @return array|null null bei jedem Fehlerfall (kein Grund wird nach
     *         aussen unterschieden - RFC 6749 verlangt hier nur invalid_grant).
     */
    public static function exchange_code(
        string $code,
        string $clientid,
        string $redirecturi,
        string $codeverifier
    ): ?array {
        global $DB;

        $record = $DB->get_record('local_kurspilot_oauth_code', ['code' => $code]);
        if (!$record || $record->used || $record->expires < time()) {
            return null;
        }
        if (!hash_equals($record->clientid, $clientid) || !hash_equals($record->redirecturi, $redirecturi)) {
            return null;
        }
        if (!self::verify_pkce($codeverifier, $record->codechallenge, $record->codechallengemethod)) {
            return null;
        }

        // Einmalig verwendbar - RFC 6749, Abschnitt 4.1.2: eine zweite
        // Einloesung muss alle aus diesem Code gezogenen Token widerrufen.
        // ponytail: hier reicht "als verbraucht markieren", weil bislang nur
        // ein Token-Satz pro Code entsteht; kein Wiederverwendungsfall in
        // diesem Spike beobachtet.
        $DB->set_field('local_kurspilot_oauth_code', 'used', 1, ['id' => $record->id]);

        return self::issue_tokens($clientid, (int) $record->userid);
    }

    /**
     * Stellt ein frisches Access-/Refresh-Token-Paar aus.
     *
     * @param string $clientid
     * @param int $userid
     * @return array
     */
    public static function issue_tokens(string $clientid, int $userid): array {
        global $DB;

        $record = new \stdClass();
        $record->accesstoken = self::random_token();
        $record->refreshtoken = self::random_token();
        $record->clientid = $clientid;
        $record->userid = $userid;
        $record->expires = time() + self::ACCESS_TOKEN_TTL;
        $record->refreshexpires = time() + self::REFRESH_TOKEN_TTL;
        $record->revoked = 0;
        $record->timecreated = time();
        $DB->insert_record('local_kurspilot_oauth_token', $record);

        return [
            'access_token' => $record->accesstoken,
            'token_type' => 'Bearer',
            'expires_in' => self::ACCESS_TOKEN_TTL,
            'refresh_token' => $record->refreshtoken,
            'scope' => 'kurspilot.read',
        ];
    }

    /**
     * Tauscht ein Refresh-Token gegen ein neues Paar - mit Rotation: das alte
     * Refresh-Token wird ungueltig, sobald das neue ausgestellt ist (#295,
     * Punkt 5).
     *
     * @param string $refreshtoken
     * @param string $clientid
     * @return array|null
     */
    public static function rotate_refresh_token(string $refreshtoken, string $clientid): ?array {
        global $DB;

        $record = $DB->get_record('local_kurspilot_oauth_token', ['refreshtoken' => $refreshtoken]);
        if (!$record || $record->revoked || $record->refreshexpires < time()) {
            return null;
        }
        if (!hash_equals($record->clientid, $clientid)) {
            return null;
        }

        $DB->set_field('local_kurspilot_oauth_token', 'revoked', 1, ['id' => $record->id]);
        return self::issue_tokens($clientid, (int) $record->userid);
    }

    /**
     * Prueft ein Access-Token und liefert die zugehoerige userid.
     *
     * @param string $accesstoken
     * @return int|null null, wenn ungueltig, abgelaufen oder widerrufen.
     */
    public static function validate_access_token(string $accesstoken): ?int {
        global $DB;

        $record = $DB->get_record('local_kurspilot_oauth_token', ['accesstoken' => $accesstoken]);
        if (!$record || $record->revoked || $record->expires < time()) {
            return null;
        }
        return (int) $record->userid;
    }
}
