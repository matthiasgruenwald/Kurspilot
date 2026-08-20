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

use PHPUnit\Framework\Attributes\CoversClass;

/**
 * OAuth-Discovery und DCR/CIMD-Registrierung (#335), Seam-Muster wie #334:
 * ohne laufenden Webserver per PHPUnit gegen die reinen Handler-Methoden
 * pruefbar.
 *
 * @package    local_kurspilot
 * @copyright  2026 Kurspilot
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
#[CoversClass(oauth_lib::class)]
final class oauth_lib_test extends \advanced_testcase {

    private const WWWROOT = 'https://kurspilot.example';

    /**
     * Discovery liefert unter beiden bekannten Namen dieselben, echten
     * Metadaten - kein Dummy mehr, registration_endpoint ist ein echter
     * Endpunkt.
     */
    public function test_discovery_serves_both_wellknown_names(): void {
        $oidc = oauth_lib::handle_discovery(self::WWWROOT, '.well-known/openid-configuration');
        $oauth = oauth_lib::handle_discovery(self::WWWROOT, '.well-known/oauth-authorization-server');

        $this->assertSame(200, $oidc['status']);
        $this->assertSame(200, $oauth['status']);
        $this->assertSame($oidc['body'], $oauth['body']);
        $this->assertSame(
            self::WWWROOT . '/local/kurspilot/oauth/register.php',
            $oidc['body']['registration_endpoint']
        );
    }

    /**
     * Unbekannte PATH_INFO-Werte unter oauth.php sind ein Irrlaeufer -
     * 404 als JSON, kein Rewrite noetig.
     */
    public function test_discovery_rejects_unknown_path(): void {
        $response = oauth_lib::handle_discovery(self::WWWROOT, 'nonsense');

        $this->assertSame(404, $response['status']);
        $this->assertSame('not_found', $response['body']['error']);
    }

    /**
     * Protected-Resource-Metadaten sind unter beiden Adressen identisch -
     * dieselbe Quelle wird von oauth/protected-resource.php und von
     * dispatcher::handle() (PATH_INFO auf mcp.php) aufgerufen.
     */
    public function test_protected_resource_metadata_is_stable_across_both_addresses(): void {
        global $CFG;

        $this->resetAfterTest();

        $direct = oauth_lib::protected_resource_metadata($CFG->wwwroot);
        $viadispatcher = dispatcher::handle(
            null,
            null,
            ['origin' => null, 'pathinfo' => '.well-known/oauth-protected-resource', 'method' => 'POST']
        );

        $this->assertSame($direct['resource'], $viadispatcher['body']['resource']);
        $this->assertSame($direct['authorization_servers'], $viadispatcher['body']['authorization_servers']);
    }

    /**
     * Eine gueltige Registrierung legt einen Client an und gibt die Kennung
     * samt Metadaten zurueck (RFC 7591).
     */
    public function test_register_client_creates_client_and_returns_metadata(): void {
        $this->resetAfterTest();

        $response = oauth_lib::handle_registration('POST', [
            'client_name' => 'Testclient',
            'redirect_uris' => ['https://claude.ai/api/mcp/auth_callback'],
        ]);

        $this->assertSame(201, $response['status']);
        $this->assertNotEmpty($response['body']['client_id']);
        $this->assertSame('Testclient', $response['body']['client_name']);
        $this->assertSame(['https://claude.ai/api/mcp/auth_callback'], $response['body']['redirect_uris']);

        $client = oauth_lib::get_client($response['body']['client_id']);
        $this->assertNotNull($client, 'Client muss in der DB angelegt sein.');
        $this->assertSame('dcr', $client->source);
    }

    /**
     * Ein nicht erlaubtes Umleitungsziel (kein https, kein Loopback) wird
     * abgewiesen.
     */
    public function test_register_client_rejects_disallowed_redirect_uri(): void {
        $this->resetAfterTest();

        $response = oauth_lib::handle_registration('POST', [
            'redirect_uris' => ['http://evil.example/callback'],
        ]);

        $this->assertSame(400, $response['status']);
        $this->assertSame('invalid_redirect_uri', $response['body']['error']);
    }

    /**
     * Loopback-Redirect-URIs sind erlaubt (RFC 8252, native/CLI-Clients).
     */
    public function test_register_client_allows_loopback_redirect_uri(): void {
        $this->resetAfterTest();

        $response = oauth_lib::handle_registration('POST', [
            'redirect_uris' => ['http://127.0.0.1:51000/callback'],
        ]);

        $this->assertSame(201, $response['status']);
    }

    /**
     * Fehlende redirect_uris sind ein Registrierungsfehler, nicht eine
     * PHP-Warnung.
     */
    public function test_register_client_requires_redirect_uris(): void {
        $this->resetAfterTest();

        $response = oauth_lib::handle_registration('POST', []);

        $this->assertSame(400, $response['status']);
        $this->assertSame('invalid_client_metadata', $response['body']['error']);
    }

    /**
     * Nur POST ist erlaubt - alles andere ist ein Registrierungsfehler,
     * JSON, kein HTML.
     */
    public function test_registration_rejects_non_post_method(): void {
        $response = oauth_lib::handle_registration('GET', []);

        $this->assertSame(405, $response['status']);
        $this->assertIsArray($response['body']);
    }

    /**
     * Ungueltiges JSON im Registrierungsrumpf ist ein Fehler, keine
     * PHP-Exception.
     */
    public function test_registration_rejects_invalid_json(): void {
        $response = oauth_lib::handle_registration('POST', null);

        $this->assertSame(400, $response['status']);
        $this->assertSame('invalid_client_metadata', $response['body']['error']);
    }

    /**
     * Fehlerantworten aller Handler sind JSON-faehige Arrays, nie HTML.
     */
    public function test_error_responses_are_json_not_html(): void {
        $this->resetAfterTest();

        $responses = [
            oauth_lib::handle_discovery(self::WWWROOT, 'nonsense'),
            oauth_lib::handle_registration('GET', []),
            oauth_lib::handle_registration('POST', null),
            oauth_lib::handle_registration('POST', ['redirect_uris' => ['not a uri']]),
        ];

        foreach ($responses as $response) {
            $encoded = json_encode($response['body']);
            $this->assertIsString($encoded);
            $this->assertStringNotContainsString('<html', strtolower($encoded));
        }
    }

    /**
     * CIMD: eine https-URL als client_id ohne lokalen DCR-Datensatz wird
     * als Metadaten-Dokument abgerufen. Eine unbekannte, nicht wie eine URL
     * aussehende client_id liefert null, keine Exception.
     */
    public function test_get_client_returns_null_for_unknown_non_url_clientid(): void {
        $this->resetAfterTest();

        $this->assertNull(oauth_lib::get_client('not-a-registered-client'));
    }

    /**
     * CIMD-Erfolgsfall: ein gueltiges, bereits dekodiertes Dokument legt
     * einen Client an, dessen clientid die URL selbst ist - netzwerkfrei
     * pruefbar (#335), die HTTP-Abholung selbst bleibt in
     * fetch_and_cache_cimd_client() und ist eine duenne Schale darum.
     */
    public function test_cache_cimd_client_persists_valid_metadata(): void {
        $this->resetAfterTest();

        $url = 'https://client.example/cimd.json';
        $record = oauth_lib::cache_cimd_client($url, [
            'client_name' => 'CIMD-Testclient',
            'redirect_uris' => ['https://client.example/callback'],
        ]);

        $this->assertNotNull($record);
        $this->assertSame($url, $record->clientid);
        $this->assertSame('cimd', $record->source);
        $this->assertSame(['https://client.example/callback'], json_decode($record->redirecturis, true));

        // get_client() findet den gecachten Datensatz danach direkt in der DB.
        $found = oauth_lib::get_client($url);
        $this->assertNotNull($found);
        $this->assertSame($url, $found->clientid);
    }

    /**
     * CIMD-Dokument mit nicht erlaubtem Umleitungsziel wird abgewiesen,
     * genau wie bei der DCR-Registrierung.
     */
    public function test_cache_cimd_client_rejects_disallowed_redirect_uri(): void {
        $this->resetAfterTest();

        $record = oauth_lib::cache_cimd_client('https://client.example/cimd.json', [
            'redirect_uris' => ['http://evil.example/callback'],
        ]);

        $this->assertNull($record);
    }

    /**
     * CIMD-Dokument ohne redirect_uris ist ungueltig.
     */
    public function test_cache_cimd_client_rejects_missing_redirect_uris(): void {
        $this->resetAfterTest();

        $this->assertNull(oauth_lib::cache_cimd_client('https://client.example/cimd.json', []));
    }

    /**
     * is_allowed_redirect_uri: die Grenzfaelle direkt geprueft.
     */
    public function test_is_allowed_redirect_uri_boundary_cases(): void {
        $this->assertTrue(oauth_lib::is_allowed_redirect_uri('https://claude.ai/callback'));
        $this->assertTrue(oauth_lib::is_allowed_redirect_uri('http://localhost:8080/cb'));
        $this->assertTrue(oauth_lib::is_allowed_redirect_uri('http://127.0.0.1/cb'));
        $this->assertFalse(oauth_lib::is_allowed_redirect_uri('http://evil.example/cb'));
        $this->assertFalse(oauth_lib::is_allowed_redirect_uri('not-a-uri'));
        $this->assertFalse(oauth_lib::is_allowed_redirect_uri(''));
        $this->assertFalse(oauth_lib::is_allowed_redirect_uri(123));
    }
}
