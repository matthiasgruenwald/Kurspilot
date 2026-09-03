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

use local_kurspilot\material_files;

defined('MOODLE_INTERNAL') || die();

/**
 * Auflisten des Materialordners (Spec 0018 §2, Issue #428): Pfad, Groesse,
 * `contenthash`, Aenderungszeit je Datei, plus verbleibender Speicherplatz.
 *
 * @package    local_kurspilot
 * @copyright  2026 Kurspilot
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
#[\PHPUnit\Framework\Attributes\CoversClass(list_material_files::class)]
final class list_material_files_test extends \advanced_testcase {

    public function test_lists_empty_root(): void {
        $this->resetAfterTest();
        $this->setUser($this->getDataGenerator()->create_user());

        $result = list_material_files::execute();

        $this->assertSame('', $result['path']);
        $this->assertSame([], $result['entries']);
    }

    public function test_lists_uploaded_file_with_metadata(): void {
        global $CFG;

        $this->resetAfterTest();
        $this->setUser($this->getDataGenerator()->create_user());
        $CFG->userquota = 1000;
        $stored = get_file_storage()->create_file_from_string([
            'contextid' => material_files::own_context()->id,
            'component' => material_files::COMPONENT,
            'filearea' => material_files::FILEAREA,
            'itemid' => material_files::ITEMID,
            'filepath' => '/kurspilot-material/',
            'filename' => 'blatt.pdf',
        ], 'Inhalt');

        $result = list_material_files::execute();

        $this->assertCount(1, $result['entries']);
        $entry = $result['entries'][0];
        $this->assertSame('blatt.pdf', $entry['name']);
        $this->assertSame('file', $entry['type']);
        $this->assertSame(strlen('Inhalt'), $entry['size']);
        $this->assertSame($stored->get_contenthash(), $entry['contenthash']);
        $this->assertGreaterThan(0, $entry['timemodified']);
    }

    /**
     * Verbleibender Speicherplatz ist Teil der Antwort (Issue #428 - "mit
     * ... verbleibendem Speicherplatz").
     */
    public function test_reports_remaining_quota(): void {
        global $CFG;

        $this->resetAfterTest();
        $this->setUser($this->getDataGenerator()->create_user());
        $CFG->userquota = 1000;

        $result = list_material_files::execute();

        $this->assertNotNull($result['remaining_quota_mb']);
    }

    public function test_remaining_quota_is_null_without_quota(): void {
        global $CFG;

        $this->resetAfterTest();
        $this->setUser($this->getDataGenerator()->create_user());
        $CFG->userquota = 0;

        $result = list_material_files::execute();

        $this->assertNull($result['remaining_quota_mb']);
    }

    public function test_lists_subfolder(): void {
        $this->resetAfterTest();
        $this->setUser($this->getDataGenerator()->create_user());
        get_file_storage()->create_file_from_string([
            'contextid' => material_files::own_context()->id,
            'component' => material_files::COMPONENT,
            'filearea' => material_files::FILEAREA,
            'itemid' => material_files::ITEMID,
            'filepath' => '/kurspilot-material/faecher/mathe/',
            'filename' => 'blatt.pdf',
        ], 'Inhalt');

        $result = list_material_files::execute('faecher/mathe');

        $this->assertSame('faecher/mathe', $result['path']);
        $this->assertSame('blatt.pdf', $result['entries'][0]['name']);
    }

    public function test_rejects_traversal_path(): void {
        $this->resetAfterTest();
        $this->setUser($this->getDataGenerator()->create_user());

        $this->expectException(\moodle_exception::class);
        list_material_files::execute('../../../etc');
    }

    /**
     * Der Kontextpointer (Issue #445) liegt physisch im Kontextbereich-
     * Anker, nicht im Materialordner - dieselbe Ausschluss-Regel gilt hier
     * trotzdem defensiv, falls Anker und Materialordner je zusammenfallen.
     */
    public function test_pointer_file_is_excluded_from_listing(): void {
        $this->resetAfterTest();
        $this->setUser($this->getDataGenerator()->create_user());
        get_file_storage()->create_file_from_string([
            'contextid' => material_files::own_context()->id,
            'component' => material_files::COMPONENT,
            'filearea' => material_files::FILEAREA,
            'itemid' => material_files::ITEMID,
            'filepath' => '/kurspilot-material/',
            'filename' => \local_kurspilot\storage_anchor::POINTER_FILENAME,
        ], '{"kontextbereich":"kurspilot","materialordner":"kurspilot-material"}');

        $result = list_material_files::execute();

        $this->assertSame([], $result['entries']);
    }
}
