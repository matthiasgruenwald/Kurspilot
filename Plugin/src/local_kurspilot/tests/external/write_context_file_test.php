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
use local_kurspilot\context_files;

defined('MOODLE_INTERNAL') || die();

/**
 * Schreiben in den Kontextbereich (Issue #408, Spec 0016 Paragraph 4.1).
 * Neben dem Happy-Path die Absagen, die das Werkzeug eng halten: Pfad,
 * Dateiendung, Groesse, Gleichzeitigkeit, Personenbezug, Quote.
 *
 * @package    local_kurspilot
 * @copyright  2026 Kurspilot
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
#[\PHPUnit\Framework\Attributes\CoversClass(write_context_file::class)]
final class write_context_file_test extends \advanced_testcase {

    /**
     * Eine neue Datei entsteht, und die Antwort sagt ausdruecklich "neu
     * angelegt" - damit ein Tippfehler im Pfad im Chat sichtbar wird.
     */
    public function test_creates_new_file(): void {
        $this->resetAfterTest();
        $user = $this->getDataGenerator()->create_user();
        $this->setUser($user);

        $result = $this->write('plan.md', '# Plan');

        $this->assertTrue($result['created']);
        $this->assertSame(
            get_string('contextfilecreated', 'local_kurspilot', 'kurspilot/plan.md'),
            $result['message']
        );
        $this->assertSame('# Plan', $this->read_stored($user, '/kurspilot/', 'plan.md'));
        $this->assertSame(6, $result['size']);
    }

    /**
     * Auch ein Unterordner entsteht ohne Sonderfall.
     */
    public function test_creates_file_in_subfolder(): void {
        $this->resetAfterTest();
        $user = $this->getDataGenerator()->create_user();
        $this->setUser($user);

        $this->write('faecher/mathe/profil.md', '# Mathe');

        $this->assertSame('# Mathe', $this->read_stored($user, '/kurspilot/faecher/mathe/', 'profil.md'));
    }

    /**
     * Ueberschreiben nennt vorherige und neue Groesse (Spec 0016 §5.4).
     */
    public function test_overwrites_existing_file(): void {
        $this->resetAfterTest();
        $user = $this->getDataGenerator()->create_user();
        $this->setUser($user);
        $this->create_context_file($user, '/kurspilot/', 'plan.md', 'alt');

        $result = $this->write('plan.md', '# Neuer Plan');

        $this->assertFalse($result['created']);
        $this->assertSame(
            get_string('contextfileoverwritten', 'local_kurspilot', (object) [
                'path' => 'kurspilot/plan.md',
                'before' => 3,
                'after' => 12,
            ]),
            $result['message']
        );
        $this->assertSame('# Neuer Plan', $this->read_stored($user, '/kurspilot/', 'plan.md'));
    }

    /**
     * Ein Pfadsegment ausserhalb [A-Za-z0-9_-] wird abgewiesen.
     */
    public function test_rejects_invalid_path_segment(): void {
        $this->resetAfterTest();
        $this->setUser($this->getDataGenerator()->create_user());

        $this->expectException(\moodle_exception::class);
        $this->write('faecher/ma the/profil.md', '# Mathe');
    }

    /**
     * "../" fuehrt nicht aus dem Bereich heraus.
     */
    public function test_rejects_traversal(): void {
        $this->resetAfterTest();
        $this->setUser($this->getDataGenerator()->create_user());

        $this->expectException(\moodle_exception::class);
        $this->write('../plan.md', '# Plan');
    }

    /**
     * Nur .md - der Kontextbereich nimmt kein Material auf (Spec 0016 §5.1).
     */
    public function test_rejects_non_markdown_extension(): void {
        $this->resetAfterTest();
        $this->setUser($this->getDataGenerator()->create_user());

        $this->expectException(\moodle_exception::class);
        $this->write('notiz.txt', 'Text');
    }

    /**
     * Ueber 1 MB je Vorgang ist ein harter Fehler (Spec 0016 §5.2).
     */
    public function test_rejects_oversized_content(): void {
        $this->resetAfterTest();
        $this->setUser($this->getDataGenerator()->create_user());

        $this->expectException(\moodle_exception::class);
        $this->write('plan.md', str_repeat('x', 1024 * 1024 + 1));
    }

    /**
     * Genau 1 MB geht noch durch - die Grenze ist einschliessend.
     */
    public function test_accepts_content_at_the_size_limit(): void {
        $this->resetAfterTest();
        $this->setUser($this->getDataGenerator()->create_user());

        $result = $this->write('plan.md', str_repeat('x', 1024 * 1024));

        $this->assertSame(1024 * 1024, $result['size']);
    }

    /**
     * Passt der uebergebene contenthash, geht der Vorgang durch.
     */
    public function test_accepts_matching_contenthash(): void {
        $this->resetAfterTest();
        $user = $this->getDataGenerator()->create_user();
        $this->setUser($user);
        $this->create_context_file($user, '/kurspilot/', 'plan.md', 'alt');

        $result = $this->write('plan.md', 'neu', sha1('alt'));

        $this->assertFalse($result['created']);
    }

    /**
     * Weicht er ab, bricht der Vorgang ab - und die Datei bleibt unangetastet
     * (alles-oder-nichts).
     */
    public function test_rejects_stale_contenthash_and_leaves_file_untouched(): void {
        $this->resetAfterTest();
        $user = $this->getDataGenerator()->create_user();
        $this->setUser($user);
        $this->create_context_file($user, '/kurspilot/', 'plan.md', 'zwischendurch von Hand geaendert');

        try {
            $this->write('plan.md', 'neu', sha1('alt'));
            $this->fail('Konflikt haette abgewiesen werden muessen.');
        } catch (\moodle_exception $e) {
            $this->assertSame('contextfilechanged', $e->errorcode);
        }

        $this->assertSame(
            'zwischendurch von Hand geaendert',
            $this->read_stored($user, '/kurspilot/', 'plan.md')
        );
    }

    /**
     * Ein contenthash fuer eine Datei, die es nicht (mehr) gibt, ist
     * ebenfalls ein Konflikt - sie wurde zwischendurch geloescht.
     */
    public function test_rejects_contenthash_for_missing_file(): void {
        $this->resetAfterTest();
        $this->setUser($this->getDataGenerator()->create_user());

        $this->expectException(\moodle_exception::class);
        $this->write('plan.md', 'neu', sha1('alt'));
    }

    /**
     * Personenbezogen markierter Inhalt geht bei ausgeschaltetem
     * #344-Schalter nicht durch, und es entsteht keine Datei.
     */
    public function test_rejects_personal_data_when_switch_off(): void {
        $this->resetAfterTest();
        $user = $this->getDataGenerator()->create_user();
        $this->setUser($user);

        try {
            $this->write('lerngruppe.md', $this->marked_content());
            $this->fail('Personenbezug haette abgewiesen werden muessen.');
        } catch (\moodle_exception $e) {
            $this->assertStringContainsString('personenbezug', strtolower($e->getMessage()));
        }

        $this->assertNull($this->stored_file($user, '/kurspilot/', 'lerngruppe.md'));
    }

    /**
     * Was bei ausgeschaltetem Schalter nicht lesbar ist, darf auch nicht
     * ueberschrieben werden - sonst waere die #344-Grenze auf dem
     * zerstoerenden Weg offen (Spec 0016 §4.2 begruendet das fuer Append).
     */
    public function test_rejects_overwriting_a_marked_file_when_switch_off(): void {
        $this->resetAfterTest();
        $user = $this->getDataGenerator()->create_user();
        $this->setUser($user);
        $this->create_context_file($user, '/kurspilot/', 'lerngruppe.md', $this->marked_content());

        try {
            $this->write('lerngruppe.md', '# harmlos');
            $this->fail('Ueberschreiben haette abgewiesen werden muessen.');
        } catch (\moodle_exception $e) {
            $this->assertSame('contextfilelocked', $e->errorcode);
        }

        $this->assertSame(
            $this->marked_content(),
            $this->read_stored($user, '/kurspilot/', 'lerngruppe.md')
        );
    }

    /**
     * Bei eingeschaltetem Schalter geht derselbe Inhalt durch.
     */
    public function test_accepts_personal_data_when_switch_on(): void {
        $this->resetAfterTest();
        set_config('allowpersonaldata', 1, 'local_kurspilot');
        $user = $this->getDataGenerator()->create_user();
        $this->setUser($user);

        $content = $this->marked_content();
        $this->write('lerngruppe.md', $content);

        $this->assertSame($content, $this->read_stored($user, '/kurspilot/', 'lerngruppe.md'));
    }

    /**
     * Ohne moodle/user:manageownfiles kein Schreibzugriff (Spec 0016 §1.1).
     */
    public function test_rejects_missing_manageownfiles_capability(): void {
        global $DB;
        $this->resetAfterTest();
        $user = $this->getDataGenerator()->create_user();
        $this->setUser($user);

        $roleid = $DB->get_field('role', 'id', ['shortname' => 'user'], MUST_EXIST);
        assign_capability(
            'moodle/user:manageownfiles',
            CAP_PROHIBIT,
            $roleid,
            \context_user::instance($user->id)->id,
            true
        );

        $this->expectException(\required_capability_exception::class);
        $this->write('plan.md', '# Plan');
    }

    /**
     * Reicht die Nutzerquote nicht, nennt die Absage den Restplatz in MB
     * (Spec 0016 §1.3).
     */
    public function test_rejects_when_user_quota_exceeded(): void {
        global $CFG;
        $this->resetAfterTest();
        $CFG->userquota = 1024;
        $this->setUser($this->getDataGenerator()->create_user());

        try {
            $this->write('plan.md', str_repeat('x', 2048));
            $this->fail('Quotenueberschreitung haette abgewiesen werden muessen.');
        } catch (\moodle_exception $e) {
            $this->assertStringContainsString('MB', $e->getMessage());
        }
    }

    /**
     * Die Lehrkraft liest die Antwort auf Deutsch - dort muss ausdruecklich
     * "neu angelegt" bzw. "ueberschrieben" mit vorheriger und neuer Groesse
     * stehen (Spec 0016 §5.4). Geprueft am deutschen Sprachpaket, weil die
     * PHPUnit-Instanz nur Englisch aufgeloest bekommt.
     */
    public function test_german_messages_carry_the_required_wording(): void {
        $string = [];
        require(__DIR__ . '/../../lang/de/local_kurspilot.php');

        $this->assertStringContainsString('neu angelegt', $string['contextfilecreated']);
        $this->assertStringContainsString('überschrieben', $string['contextfileoverwritten']);
        $this->assertStringContainsString('{$a->before}', $string['contextfileoverwritten']);
        $this->assertStringContainsString('{$a->after}', $string['contextfileoverwritten']);
        $this->assertStringContainsString('neu lesen', $string['contextfilechanged']);
        $this->assertStringContainsString('MB', $string['contextquotaexceeded']);
    }

    /**
     * Der Endpunkt haengt am Kurspilot-Dienst und steht in der Allowlist.
     */
    public function test_registered_in_service_and_allowlist(): void {
        $this->assertArrayHasKey(
            'kurspilot_write_context_file',
            \local_kurspilot\privacy_surface::allowed_tools()
        );
        $this->assertContains(
            'local_kurspilot_write_context_file',
            \local_kurspilot\tool_registry::service_function_names()
        );
        $this->assertTrue(\local_kurspilot\tool_registry::is_write('kurspilot_write_context_file'));
    }

    /**
     * Kein Parameter erlaubt es, contextid/itemid/component zu waehlen.
     */
    public function test_execute_parameters_expose_no_area_selector(): void {
        $this->assertSame(
            ['path', 'content', 'expected_contenthash'],
            array_keys(write_context_file::execute_parameters()->keys)
        );
    }

    /**
     * Person A schreibt nie in den Bereich von Person B - der Schreibvorgang
     * landet im eigenen Nutzerkontext.
     */
    public function test_writes_only_into_own_area(): void {
        $this->resetAfterTest();
        $teachera = $this->getDataGenerator()->create_user();
        $teacherb = $this->getDataGenerator()->create_user();

        $this->setUser($teacherb);
        $this->write('plan.md', '# B');

        $this->assertNull($this->stored_file($teachera, '/kurspilot/', 'plan.md'));
        $this->assertSame('# B', $this->read_stored($teacherb, '/kurspilot/', 'plan.md'));
    }

    /**
     * @param string $path
     * @param string $content
     * @param string $expectedcontenthash
     * @return array Bereinigte Antwort des Endpunkts.
     */
    private function write(string $path, string $content, string $expectedcontenthash = ''): array {
        $result = write_context_file::execute($path, $content, $expectedcontenthash);
        return external_api::clean_returnvalue(write_context_file::execute_returns(), $result);
    }

    /**
     * @return string Inhalt mit Frontmatter-Markierung "personenbezug: true".
     */
    private function marked_content(): string {
        return "---\ntype: lerngruppe\nkurspilot:\n  personenbezug: true\n---\n# S. M., 7a";
    }

    /**
     * @param \stdClass $user
     * @param string $filepath
     * @param string $filename
     * @return \stored_file|null
     */
    private function stored_file(\stdClass $user, string $filepath, string $filename): ?\stored_file {
        $file = get_file_storage()->get_file(
            \context_user::instance($user->id)->id,
            context_files::COMPONENT,
            context_files::FILEAREA,
            context_files::ITEMID,
            $filepath,
            $filename
        );
        return $file ?: null;
    }

    /**
     * @param \stdClass $user
     * @param string $filepath
     * @param string $filename
     * @return string
     */
    private function read_stored(\stdClass $user, string $filepath, string $filename): string {
        $file = $this->stored_file($user, $filepath, $filename);
        $this->assertNotNull($file, 'Erwartete Datei fehlt: ' . $filepath . $filename);
        return $file->get_content();
    }

    /**
     * @param \stdClass $user
     * @param string $filepath
     * @param string $filename
     * @param string $content
     */
    private function create_context_file(\stdClass $user, string $filepath, string $filename, string $content): void {
        get_file_storage()->create_file_from_string([
            'contextid' => \context_user::instance($user->id)->id,
            'component' => context_files::COMPONENT,
            'filearea' => context_files::FILEAREA,
            'itemid' => context_files::ITEMID,
            'filepath' => $filepath,
            'filename' => $filename,
        ], $content);
    }
}
