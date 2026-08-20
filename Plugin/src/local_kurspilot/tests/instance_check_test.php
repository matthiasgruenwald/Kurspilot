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
 * Urteilsteil der Instanzpruefung (#340): rein, ohne echten HTTP-Request
 * pruefbar. Der Selbstabruf selbst ({@see instance_check::self_check()}) ist
 * absichtlich nicht Teil dieser Suite - er braucht eine erreichbare Instanz
 * und wird ueber die Anzeigeseite (surface.php) manuell verifiziert.
 *
 * @package    local_kurspilot
 * @copyright  2026 Kurspilot
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
#[CoversClass(instance_check::class)]
final class instance_check_test extends \advanced_testcase {

    public function test_successful_json_response_is_ok(): void {
        $judgement = instance_check::evaluate(200, '{"issuer":"https://example.test"}');

        $this->assertTrue($judgement['ok']);
    }

    public function test_failed_request_without_httpcode_is_not_ok(): void {
        $judgement = instance_check::evaluate(null, '');

        $this->assertFalse($judgement['ok']);
        $this->assertSame('selfcheckrequestfailed', $judgement['detail']);
    }

    public function test_unexpected_status_is_not_ok(): void {
        $judgement = instance_check::evaluate(404, 'Not Found');

        $this->assertFalse($judgement['ok']);
        $this->assertSame('selfcheckunexpectedstatus', $judgement['detail']);
    }

    public function test_non_json_body_is_not_ok(): void {
        $judgement = instance_check::evaluate(200, 'not json');

        $this->assertFalse($judgement['ok']);
        $this->assertSame('selfcheckinvalidbody', $judgement['detail']);
    }

    public function test_empty_json_body_is_not_ok(): void {
        $judgement = instance_check::evaluate(200, '{}');

        $this->assertFalse($judgement['ok']);
        $this->assertSame('selfcheckinvalidbody', $judgement['detail']);
    }

    public function test_json_body_without_issuer_is_not_ok(): void {
        $judgement = instance_check::evaluate(200, '{"token_endpoint":"https://example.test/token"}');

        $this->assertFalse($judgement['ok']);
        $this->assertSame('selfcheckinvalidbody', $judgement['detail']);
    }

    public function test_non_https_url_is_not_ok_even_with_valid_response(): void {
        $judgement = instance_check::evaluate(200, '{"issuer":"http://example.test"}', 'http://example.test/oauth.php/...');

        $this->assertFalse($judgement['ok']);
        $this->assertSame('selfcheckrequireshttps', $judgement['detail']);
    }

    public function test_discovery_url_appends_wellknown_path_via_pathinfo(): void {
        $url = instance_check::discovery_url('https://moodle.example/');

        $this->assertSame(
            'https://moodle.example/local/kurspilot/oauth.php/.well-known/openid-configuration',
            $url
        );
    }

    public function test_requirements_name_the_three_prerequisites(): void {
        $this->assertSame(['https', 'egress', 'pathinfo'], instance_check::REQUIREMENTS);
    }
}
