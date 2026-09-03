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

    /**
     * Legt einen Kontextpointer im festen Anker ab (Issue #445) - derselbe
     * Ordner, in dem der Kontextbereich ohne Pointer ohnehin liegt.
     *
     * @param string $content Roher Dateiinhalt.
     */
    private function put_pointer(string $content): void {
        get_file_storage()->create_file_from_string([
            'contextid' => storage_anchor::own_context()->id,
            'component' => storage_anchor::COMPONENT,
            'filearea' => storage_anchor::FILEAREA,
            'itemid' => storage_anchor::ITEMID,
            'filepath' => '/kurspilot/',
            'filename' => storage_anchor::POINTER_FILENAME,
        ], $content);
    }

    public function test_missing_pointer_leaves_default_roots_untouched(): void {
        $this->resetAfterTest();
        $this->setUser($this->getDataGenerator()->create_user());

        $this->assertSame('/kurspilot/', context_files::resolve_directory(''));
        $this->assertSame('/kurspilot-material/', material_files::resolve_directory(''));
    }

    public function test_valid_pointer_redirects_both_areas_together(): void {
        $this->resetAfterTest();
        $this->setUser($this->getDataGenerator()->create_user());
        $this->put_pointer(json_encode([
            'kontextbereich' => 'custom-context',
            'materialordner' => 'custom-material',
        ]));

        $this->assertSame('/custom-context/', context_files::resolve_directory(''));
        $this->assertSame('/custom-material/', material_files::resolve_directory(''));
    }

    public function test_unreadable_pointer_throws_named_error_without_fallback(): void {
        $this->resetAfterTest();
        $this->setUser($this->getDataGenerator()->create_user());
        $this->put_pointer('das ist kein JSON {');

        try {
            context_files::resolve_directory('');
            $this->fail('Ein unlesbarer Pointer haette werfen muessen, statt auf den Standard zurueckzufallen.');
        } catch (\moodle_exception $e) {
            $this->assertStringContainsString(storage_anchor::POINTER_FILENAME, $e->getMessage());
        }
    }

    public function test_incomplete_pointer_throws_even_for_the_present_field(): void {
        $this->resetAfterTest();
        $this->setUser($this->getDataGenerator()->create_user());
        // Nur "kontextbereich" gesetzt - context_files braucht genau dieses
        // Feld, muss aber trotzdem scheitern: beide Felder ziehen gemeinsam
        // um, ein Pointer mit nur einem der beiden ist immer unvollstaendig.
        $this->put_pointer(json_encode(['kontextbereich' => 'custom-context']));

        try {
            context_files::resolve_directory('');
            $this->fail('Ein unvollstaendiger Pointer haette werfen muessen, statt auf den Standard zurueckzufallen.');
        } catch (\moodle_exception $e) {
            $this->assertStringContainsString(storage_anchor::POINTER_FILENAME, $e->getMessage());
        }
    }

    /**
     * write_pointer() (Issue #446) legt eine Pointer-Datei an, die
     * resolve_pointer() (ueber context_files/material_files) unveraendert
     * zurueckliest - derselbe Mechanismus, den der Zustimmungsdialog nutzt.
     */
    public function test_write_pointer_is_readable_back_via_resolve_directory(): void {
        $this->resetAfterTest();
        $this->setUser($this->getDataGenerator()->create_user());

        storage_anchor::write_pointer('mein-kontext', 'mein-material');

        $this->assertSame('/mein-kontext/', context_files::resolve_directory(''));
        $this->assertSame('/mein-material/', material_files::resolve_directory(''));
    }

    /**
     * write_pointer() wendet dieselbe Segmentpruefung wie resolve_pointer()
     * an - ein Ortswechsel mit Traversal-Segment scheitert sofort beim
     * Schreiben, statt erst beim naechsten Lesen.
     */
    public function test_write_pointer_rejects_traversal_segment(): void {
        $this->resetAfterTest();
        $this->setUser($this->getDataGenerator()->create_user());

        $this->expectException(\moodle_exception::class);
        storage_anchor::write_pointer('../etc', 'mein-material');
    }

    /**
     * write_pointer() weist einen leeren Ordnernamen ab statt eine kaputte
     * Pointer-Datei anzulegen.
     */
    public function test_write_pointer_rejects_empty_value(): void {
        $this->resetAfterTest();
        $this->setUser($this->getDataGenerator()->create_user());

        $this->expectException(\moodle_exception::class);
        storage_anchor::write_pointer('', 'mein-material');
    }

    public function test_pointer_with_traversal_segment_throws_without_fallback(): void {
        $this->resetAfterTest();
        $this->setUser($this->getDataGenerator()->create_user());
        $this->put_pointer(json_encode([
            'kontextbereich' => '../etc',
            'materialordner' => 'custom-material',
        ]));

        try {
            context_files::resolve_directory('');
            $this->fail('Ein unerreichbarer Pointer-Ort haette werfen muessen, statt auf den Standard zurueckzufallen.');
        } catch (\moodle_exception $e) {
            $this->assertStringContainsString(storage_anchor::POINTER_FILENAME, $e->getMessage());
        }
    }
}
