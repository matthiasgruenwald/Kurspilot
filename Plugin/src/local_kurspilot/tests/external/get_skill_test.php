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

namespace local_kurspilot\external;

use core_external\external_api;
use PHPUnit\Framework\Attributes\CoversClass;
use PHPUnit\Framework\Attributes\DataProvider;

defined('MOODLE_INTERNAL') || die();

/**
 * Die Lieferung eines Skill-Korpus-Eintrags (Spec 0020 §4, Issue #450): ohne
 * Kursbindung, 'local/kurspilot:use' im Systemkontext genuegt.
 *
 * @package    local_kurspilot
 * @copyright  2026 Kurspilot
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
#[CoversClass(get_skill::class)]
final class get_skill_test extends \advanced_testcase {

    /**
     * Liefert Inhalt, referenzierte Teile und Korpus-Stand.
     */
    public function test_returns_content_referenced_parts_and_corpus_stand(): void {
        $this->resetAfterTest();
        $user = $this->getDataGenerator()->create_user();
        $this->getDataGenerator()->role_assign('editingteacher', $user->id, \context_system::instance()->id);
        $this->setUser($user);

        $result = get_skill::execute('kurspilot');
        $result = external_api::clean_returnvalue(get_skill::execute_returns(), $result);

        $this->assertStringContainsString('kurspilot-core', $result['content']);
        $this->assertContains('kurspilot-core', $result['referenzierte_teile']);
        $this->assertNotSame('', $result['korpus_stand']);
    }

    /**
     * Unbekannter Name: die Meldung nennt die gueltigen Namen statt eines
     * leeren Ergebnisses.
     */
    public function test_unknown_name_names_valid_names(): void {
        $this->resetAfterTest();
        $user = $this->getDataGenerator()->create_user();
        $this->getDataGenerator()->role_assign('editingteacher', $user->id, \context_system::instance()->id);
        $this->setUser($user);

        try {
            get_skill::execute('gibtsnicht');
            $this->fail('moodle_exception erwartet.');
        } catch (\moodle_exception $e) {
            $this->assertStringContainsString('kurspilot-core', $e->getMessage());
        }
    }

    /**
     * Ein Name mit Pfadanteilen wird abgewiesen - geprueft gegen die
     * Verzeichnisliste, nicht per Zeichenfilter.
     *
     * @param string $name
     */
    #[DataProvider('path_like_name_provider')]
    public function test_path_like_name_is_rejected(string $name): void {
        $this->resetAfterTest();
        $user = $this->getDataGenerator()->create_user();
        $this->getDataGenerator()->role_assign('editingteacher', $user->id, \context_system::instance()->id);
        $this->setUser($user);

        $this->expectException(\moodle_exception::class);
        get_skill::execute($name);
    }

    /**
     * @return array<string, string[]>
     */
    public static function path_like_name_provider(): array {
        return [
            'dot-dot-slash' => ['../../../etc/passwd'],
            'leading-slash' => ['/etc/passwd'],
            'backslash' => ['..\\..\\kurspilot-core'],
            'encoded' => ['%2e%2e%2fkurspilot-core'],
            'suffixed-real-name' => ['kurspilot-core/../../../etc/passwd'],
        ];
    }

    /**
     * Ohne 'local/kurspilot:use' im Systemkontext wird abgewiesen.
     */
    public function test_without_capability_is_rejected(): void {
        $this->resetAfterTest();
        $this->setUser($this->getDataGenerator()->create_user());

        $this->expectException(\required_capability_exception::class);
        get_skill::execute('kurspilot');
    }
}
