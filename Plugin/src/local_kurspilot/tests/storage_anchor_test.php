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
 * Der Zweitort-Beweis (Issue #444): ersetzt den frueheren Konstantenvergleich
 * zwischen {@see context_files} und {@see material_files} (der nur zeigte,
 * dass die beiden EINZIGEN heute existierenden Bereiche verschiedene Wurzeln
 * haben koennen). Hier tritt ein DRITTER, ausschliesslich in diesem Test
 * definierter {@see storage_area} gegen den gemeinsamen {@see storage_anchor}
 * an - ohne dass context_files, material_files oder irgendein Endpunkt
 * angefasst wird (die Fehlerschluessel des Testbereichs leihen sich zwar
 * vorhandene Sprachstrings von context_files, siehe {@see second_place()},
 * aber Einstellungsname/Standardwurzel/Namensregel sind frei erfunden). Das
 * belegt, dass der Anker wirklich bereichsunabhaengig ist, nicht nur, dass
 * zwei feste Bereiche sich nicht gegenseitig stoeren.
 *
 * @package    local_kurspilot
 * @copyright  2026 Kurspilot
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
#[\PHPUnit\Framework\Attributes\CoversClass(storage_anchor::class)]
final class storage_anchor_test extends \advanced_testcase {

    /**
     * Ein frei erfundener zweiter Ablageort: eigene Einstellung, eigene
     * Standardwurzel, eigene Namensregel (nur `.txt`-Dateien statt `.md` oder
     * einer Endungs-Whitelist) - diese drei Groessen kommen aus keinem der
     * beiden bestehenden Bereiche. Die Fehlerschluessel leihen sich bewusst
     * die vorhandenen, generischen Sprachstrings von context_files (kein
     * Test-Bereich rechtfertigt eigene lang-Strings); der Beweis betrifft
     * die Bereichsunabhaengigkeit von storage_anchor, nicht die Wortwahl der
     * Fehlermeldung.
     *
     * @return storage_area
     */
    private function second_place(): storage_area {
        return new storage_area(
            rootsetting: 'zweitortroot',
            defaultroot: 'zweitort',
            invalidpathkey: 'invalidcontextpath',
            quotaerrorkey: 'contextquotaexceeded',
            checkwritablename: static function (string $filename): void {
                if (!preg_match('/^[A-Za-z0-9_-]+\.txt$/', $filename)) {
                    throw new \moodle_exception('contextfilenotmarkdown', 'local_kurspilot', '', $filename);
                }
            },
        );
    }

    public function test_second_place_resolves_its_own_default_root(): void {
        $this->resetAfterTest();
        $this->assertSame('/zweitort/', storage_anchor::resolve_directory($this->second_place(), ''));
    }

    public function test_second_place_root_is_configurable_independently(): void {
        $this->resetAfterTest();
        set_config('zweitortroot', 'anderswo', 'local_kurspilot');
        set_config('contextroot', 'unveraendert', 'local_kurspilot');

        $this->assertSame('/anderswo/', storage_anchor::resolve_directory($this->second_place(), ''));
        $this->assertSame('/unveraendert/', context_files::resolve_directory(''));
    }

    public function test_second_place_rejects_traversal_segments(): void {
        $this->resetAfterTest();
        $this->expectException(\moodle_exception::class);
        storage_anchor::resolve_directory($this->second_place(), 'ordner/../../../etc');
    }

    public function test_second_place_resolves_file_in_both_directions(): void {
        $this->resetAfterTest();
        $area = $this->second_place();

        [$directory, $filename] = storage_anchor::resolve_file($area, 'faecher/mathe/notiz.txt');
        $this->assertSame('/zweitort/faecher/mathe/', $directory);
        $this->assertSame('notiz.txt', $filename);

        $this->assertSame(
            'faecher/mathe/notiz.txt',
            storage_anchor::relative_file($area, $directory, $filename)
        );
    }

    public function test_second_place_applies_its_own_writable_name_rule(): void {
        $this->resetAfterTest();
        $area = $this->second_place();

        [$directory, $filename] = storage_anchor::resolve_writable_file($area, 'notiz.txt');
        $this->assertSame('/zweitort/', $directory);
        $this->assertSame('notiz.txt', $filename);

        try {
            storage_anchor::resolve_writable_file($area, 'notiz.md');
            $this->fail('Die .md-Regel des Kontextbereichs haette hier nicht gelten duerfen.');
        } catch (\moodle_exception $e) {
            $this->assertStringContainsString('notiz.md', $e->getMessage());
        }
    }

    public function test_second_place_enforces_its_own_quota_error_key(): void {
        global $CFG;

        $this->resetAfterTest();
        $this->setUser($this->getDataGenerator()->create_user());
        $CFG->userquota = 100;

        $this->expectException(\moodle_exception::class);
        storage_anchor::require_quota($this->second_place(), 200);
    }

    public function test_second_place_writes_and_reads_back_via_replace(): void {
        $this->resetAfterTest();
        $area = $this->second_place();
        $this->setUser($this->getDataGenerator()->create_user());
        $contextid = storage_anchor::own_context()->id;
        [$directory, $filename] = storage_anchor::resolve_writable_file($area, 'notiz.txt');

        storage_anchor::replace(
            null,
            storage_anchor::filerecord($contextid, $directory, $filename),
            'Inhalt am zweiten Ort'
        );

        $stored = get_file_storage()->get_file(
            $contextid,
            storage_anchor::COMPONENT,
            storage_anchor::FILEAREA,
            storage_anchor::ITEMID,
            $directory,
            $filename
        );
        $this->assertNotFalse($stored);
        $this->assertSame('Inhalt am zweiten Ort', $stored->get_content());

        // Beweis, dass es tatsaechlich ein ANDERER Ort ist: der Kontextbereich
        // sieht die Datei unter demselben relativen Pfad nicht.
        $this->assertFalse(get_file_storage()->get_file(
            $contextid,
            context_files::COMPONENT,
            context_files::FILEAREA,
            context_files::ITEMID,
            '/kurspilot/',
            'notiz.txt'
        ));
    }
}
