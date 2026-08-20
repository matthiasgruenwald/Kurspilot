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
 * Dispatcher-Seam (#334): dieselbe Entscheidungslogik wie bisher in mcp.php,
 * jetzt ohne exit/Superglobals per PHPUnit ohne laufenden Webserver
 * aufrufbar.
 *
 * @package    local_kurspilot
 * @copyright  2026 Kurspilot
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
#[CoversClass(dispatcher::class)]
final class dispatcher_test extends \advanced_testcase {

    /**
     * Legt einen Nutzer mit gueltigem Bearer-Token fuer den Kurspilot-Dienst
     * an.
     *
     * @return array{0: \stdClass, 1: string} Nutzer und Token.
     */
    private function create_authenticated_user(): array {
        global $DB;

        $user = $this->getDataGenerator()->create_user();
        $service = $DB->get_record('external_services', ['shortname' => privacy_surface::SERVICE_SHORTNAME]);
        $token = \core_external\util::generate_token(
            EXTERNAL_TOKEN_PERMANENT,
            $service,
            $user->id,
            \context_system::instance()
        );
        return [$user, $token];
    }

    /**
     * @return array{origin: null, pathinfo: string, method: string}
     */
    private function headers(array $overrides = []): array {
        return array_merge(['origin' => null, 'pathinfo' => '', 'method' => 'POST'], $overrides);
    }

    /**
     * Auth-Gate greift vor dem Handshake: initialize unauthentifiziert
     * liefert 401, nicht die Serverinfo.
     */
    public function test_initialize_without_token_returns_401(): void {
        $this->resetAfterTest();

        $response = dispatcher::handle(['id' => 1, 'method' => 'initialize'], null, $this->headers());

        $this->assertSame(401, $response['status']);
        $this->assertArrayHasKey('error', $response['body']);
        $this->assertSame(-32001, $response['body']['error']['code']);
        $this->assertArrayNotHasKey('result', $response['body']);
    }

    /**
     * Legacy-Aera: initialize liefert die Serverinfo nach gueltiger Auth.
     */
    public function test_initialize_returns_serverinfo_when_authenticated(): void {
        $this->resetAfterTest();
        [, $token] = $this->create_authenticated_user();

        $response = dispatcher::handle(['id' => 1, 'method' => 'initialize'], $token, $this->headers());

        $this->assertSame(200, $response['status']);
        $this->assertSame('local_kurspilot', $response['body']['result']['serverInfo']['name']);
    }

    /**
     * Moderne Aera: server/discover wird ebenfalls bedient.
     */
    public function test_server_discover_returns_supported_versions(): void {
        $this->resetAfterTest();
        [, $token] = $this->create_authenticated_user();

        $response = dispatcher::handle(['id' => 1, 'method' => 'server/discover'], $token, $this->headers());

        $this->assertSame(200, $response['status']);
        $this->assertContains(
            dispatcher::MODERN_VERSION,
            $response['body']['result']['supportedVersions']
        );
        $this->assertContains(
            dispatcher::LEGACY_VERSION,
            $response['body']['result']['supportedVersions']
        );
    }

    /**
     * tools/list leitet sich aus der Allowlist ab.
     */
    public function test_tools_list_is_derived_from_allowlist(): void {
        $this->resetAfterTest();
        [, $token] = $this->create_authenticated_user();

        $response = dispatcher::handle(['id' => 1, 'method' => 'tools/list'], $token, $this->headers());

        $names = array_column($response['body']['result']['tools'], 'name');
        $this->assertSame(array_keys(privacy_surface::ALLOWED_TOOLS), $names);
    }

    /**
     * tools/call weist ein nicht gelistetes Werkzeug ab.
     */
    public function test_tools_call_rejects_unlisted_tool(): void {
        $this->resetAfterTest();
        [, $token] = $this->create_authenticated_user();

        $response = dispatcher::handle(
            ['id' => 1, 'method' => 'tools/call', 'params' => ['name' => 'not_a_real_tool']],
            $token,
            $this->headers()
        );

        $this->assertSame(404, $response['status']);
        $this->assertSame(-32601, $response['body']['error']['code']);
    }

    /**
     * Ohne Origin-Header greift die Origin-Pruefung nicht.
     */
    public function test_origin_check_is_skipped_without_header(): void {
        $this->resetAfterTest();

        $response = dispatcher::handle(['id' => 1, 'method' => 'ping'], null, $this->headers(['origin' => null]));

        $this->assertNotSame(403, $response['status']);
    }

    /**
     * Mit vorhandenem, nicht erlaubtem Origin-Header greift die Pruefung.
     */
    public function test_origin_check_rejects_disallowed_origin(): void {
        $this->resetAfterTest();

        $response = dispatcher::handle(
            ['id' => 1, 'method' => 'ping'],
            null,
            $this->headers(['origin' => 'https://evil.example'])
        );

        $this->assertSame(403, $response['status']);
    }

    /**
     * Fehlerantworten sind JSON-faehige Arrays, nie HTML.
     */
    public function test_error_responses_are_json_not_html(): void {
        $this->resetAfterTest();

        $response = dispatcher::handle(null, null, $this->headers());

        $this->assertIsArray($response['body']);
        $encoded = json_encode($response['body']);
        $this->assertIsString($encoded);
        $this->assertStringNotContainsString('<html', strtolower($encoded));
    }
}
