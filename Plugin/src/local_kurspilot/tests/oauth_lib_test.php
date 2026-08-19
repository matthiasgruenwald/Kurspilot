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
 * OAuth-2.1-Kern (#313): DCR-Validierung, PKCE, Code-Einloesung, Rotation.
 *
 * @package    local_kurspilot
 * @copyright  2026 Kurspilot
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
#[\PHPUnit\Framework\Attributes\CoversClass(oauth_lib::class)]
final class oauth_lib_test extends \advanced_testcase {

    public function test_register_client_rejects_missing_redirect_uris(): void {
        $this->resetAfterTest();
        $result = oauth_lib::register_client(['client_name' => 'Test']);
        $this->assertSame('invalid_client_metadata', $result['error']);
    }

    public function test_register_client_rejects_plain_http_redirect_uri(): void {
        $this->resetAfterTest();
        $result = oauth_lib::register_client(['redirect_uris' => ['http://example.com/callback']]);
        $this->assertSame('invalid_redirect_uri', $result['error']);
    }

    public function test_register_client_accepts_https_and_loopback(): void {
        $this->resetAfterTest();
        $result = oauth_lib::register_client([
            'client_name' => 'Codex CLI',
            'redirect_uris' => ['https://example.com/callback', 'http://127.0.0.1:8080/cb'],
        ]);
        $this->assertArrayNotHasKey('error', $result);
        $this->assertNotEmpty($result['client_id']);
        $this->assertArrayNotHasKey('client_secret', $result, 'token_endpoint_auth_method=none darf kein Secret ausgeben.');
    }

    public function test_verify_pkce_accepts_matching_s256_pair(): void {
        $verifier = 'a-random-verifier-of-sufficient-length-1234567890';
        $challenge = rtrim(strtr(base64_encode(hash('sha256', $verifier, true)), '+/', '-_'), '=');
        $this->assertTrue(oauth_lib::verify_pkce($verifier, $challenge, 'S256'));
    }

    public function test_verify_pkce_rejects_wrong_verifier(): void {
        $challenge = rtrim(strtr(base64_encode(hash('sha256', 'correct', true)), '+/', '-_'), '=');
        $this->assertFalse(oauth_lib::verify_pkce('wrong', $challenge, 'S256'));
    }

    public function test_verify_pkce_rejects_plain_method(): void {
        $this->assertFalse(oauth_lib::verify_pkce('verifier', 'verifier', 'plain'));
    }

    public function test_exchange_code_full_roundtrip_and_single_use(): void {
        global $DB;

        $this->resetAfterTest();
        $user = $this->getDataGenerator()->create_user();

        $client = oauth_lib::register_client(['redirect_uris' => ['https://example.com/callback']]);
        $clientid = $client['client_id'];

        $verifier = 'a-random-verifier-of-sufficient-length-1234567890';
        $challenge = rtrim(strtr(base64_encode(hash('sha256', $verifier, true)), '+/', '-_'), '=');

        $code = oauth_lib::issue_code($clientid, (int) $user->id, 'https://example.com/callback', $challenge, 'S256');

        $tokens = oauth_lib::exchange_code($code, $clientid, 'https://example.com/callback', $verifier);
        $this->assertNotNull($tokens);
        $this->assertSame('Bearer', $tokens['token_type']);
        $this->assertSame((int) $user->id, oauth_lib::validate_access_token($tokens['access_token']));

        // Derselbe Code darf kein zweites Mal eingeloest werden.
        $second = oauth_lib::exchange_code($code, $clientid, 'https://example.com/callback', $verifier);
        $this->assertNull($second, 'Ein Authorization Code muss einmalig verwendbar sein.');
    }

    public function test_exchange_code_rejects_wrong_verifier(): void {
        $this->resetAfterTest();
        $user = $this->getDataGenerator()->create_user();
        $client = oauth_lib::register_client(['redirect_uris' => ['https://example.com/callback']]);
        $clientid = $client['client_id'];

        $challenge = rtrim(strtr(base64_encode(hash('sha256', 'correct-verifier', true)), '+/', '-_'), '=');
        $code = oauth_lib::issue_code($clientid, (int) $user->id, 'https://example.com/callback', $challenge, 'S256');

        $tokens = oauth_lib::exchange_code($code, $clientid, 'https://example.com/callback', 'wrong-verifier');
        $this->assertNull($tokens);
    }

    public function test_exchange_code_rejects_redirect_uri_mismatch(): void {
        $this->resetAfterTest();
        $user = $this->getDataGenerator()->create_user();
        $client = oauth_lib::register_client(['redirect_uris' => ['https://example.com/callback']]);
        $clientid = $client['client_id'];

        $verifier = 'a-random-verifier-of-sufficient-length-1234567890';
        $challenge = rtrim(strtr(base64_encode(hash('sha256', $verifier, true)), '+/', '-_'), '=');
        $code = oauth_lib::issue_code($clientid, (int) $user->id, 'https://example.com/callback', $challenge, 'S256');

        $tokens = oauth_lib::exchange_code($code, $clientid, 'https://attacker.example/callback', $verifier);
        $this->assertNull($tokens, 'redirect_uri muss beim Einloesen identisch zur autorisierten sein (RFC 6749 4.1.3).');
    }

    public function test_refresh_token_rotation_invalidates_old_token(): void {
        $this->resetAfterTest();
        $user = $this->getDataGenerator()->create_user();
        $tokens = oauth_lib::issue_tokens('client-x', (int) $user->id);

        $rotated = oauth_lib::rotate_refresh_token($tokens['refresh_token'], 'client-x');
        $this->assertNotNull($rotated);
        $this->assertNotSame($tokens['access_token'], $rotated['access_token']);

        // Das alte Refresh-Token ist nach Rotation tot.
        $reuse = oauth_lib::rotate_refresh_token($tokens['refresh_token'], 'client-x');
        $this->assertNull($reuse, 'Ein rotiertes Refresh-Token darf kein zweites Mal funktionieren.');
    }

    public function test_validate_access_token_rejects_unknown_token(): void {
        $this->resetAfterTest();
        $this->assertNull(oauth_lib::validate_access_token('does-not-exist'));
    }
}
