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

use local_kurspilot\gd_support;
use local_kurspilot\material_files;

defined('MOODLE_INTERNAL') || die();

/**
 * Bildvorschau einer Materialdatei (Spec 0018 §3, Issue #430): laengste
 * Kante 768px, JPEG. Nicht-Bilddatei ist kein Fehler ("available": false
 * plus Meldung), eine fehlende Datei bleibt ein Fehler (wie bei den
 * uebrigen Materialordner-Werkzeugen).
 *
 * @package    local_kurspilot
 * @copyright  2026 Kurspilot
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
#[\PHPUnit\Framework\Attributes\CoversClass(preview_material_file::class)]
final class preview_material_file_test extends \advanced_testcase {

    /**
     * @param string $filename
     * @param int $width
     * @param int $height
     * @return void
     */
    private function store_png(string $filename, int $width = 1600, int $height = 100): void {
        $image = imagecreatetruecolor($width, $height);
        imagefill($image, 0, 0, imagecolorallocate($image, 10, 120, 200));
        ob_start();
        imagepng($image);
        $png = ob_get_clean();
        imagedestroy($image);

        get_file_storage()->create_file_from_string([
            'contextid' => material_files::own_context()->id,
            'component' => material_files::COMPONENT,
            'filearea' => material_files::FILEAREA,
            'itemid' => material_files::ITEMID,
            'filepath' => '/kurspilot-material/',
            'filename' => $filename,
        ], $png);
    }

    public function test_shrinks_wide_image_to_768px_longest_edge_jpeg(): void {
        $this->resetAfterTest();
        $this->setUser($this->getDataGenerator()->create_user());
        $this->store_png('bild.png', 1600, 100);

        $result = preview_material_file::execute('bild.png');

        $this->assertTrue($result['available']);
        $this->assertSame('image/jpeg', $result['mimetype']);
        $this->assertSame(768, $result['width']);
        $this->assertSame(48, $result['height']);

        $decoded = base64_decode($result['image_base64'], true);
        $info = getimagesizefromstring($decoded);
        $this->assertSame(IMAGETYPE_JPEG, $info[2]);
        $this->assertSame(768, $info[0]);
    }

    public function test_small_image_is_not_upscaled(): void {
        $this->resetAfterTest();
        $this->setUser($this->getDataGenerator()->create_user());
        $this->store_png('klein.png', 100, 50);

        $result = preview_material_file::execute('klein.png');

        $this->assertSame(100, $result['width']);
        $this->assertSame(50, $result['height']);
    }

    public function test_non_image_file_returns_message_instead_of_error(): void {
        $this->resetAfterTest();
        $this->setUser($this->getDataGenerator()->create_user());
        get_file_storage()->create_file_from_string([
            'contextid' => material_files::own_context()->id,
            'component' => material_files::COMPONENT,
            'filearea' => material_files::FILEAREA,
            'itemid' => material_files::ITEMID,
            'filepath' => '/kurspilot-material/',
            'filename' => 'blatt.pdf',
        ], 'kein echtes PDF, reicht fuer den Test');

        $result = preview_material_file::execute('blatt.pdf');

        $this->assertFalse($result['available']);
        $this->assertNotEmpty($result['message']);
        $this->assertNull($result['image_base64']);
    }

    public function test_missing_file_throws(): void {
        $this->resetAfterTest();
        $this->setUser($this->getDataGenerator()->create_user());

        $this->expectException(\moodle_exception::class);
        preview_material_file::execute('nichtvorhanden.png');
    }

    /**
     * Spec 0018 §3.3: fehlt GD, ist die Vorschau gesperrt, mit klarer
     * Meldung (kein stiller Fallback).
     */
    public function test_missing_gd_blocks_preview_with_clear_message(): void {
        $this->resetAfterTest();
        $this->setUser($this->getDataGenerator()->create_user());
        $this->store_png('bild.png');
        gd_support::override_for_testing(false);

        try {
            preview_material_file::execute('bild.png');
            $this->fail('materialgdmissing haette geworfen werden muessen.');
        } catch (\moodle_exception $e) {
            $this->assertSame('materialgdmissing', $e->errorcode);
        } finally {
            gd_support::override_for_testing(null);
        }
    }

    /**
     * Spec 0018 §3, Abnahmekriterium "Vorschau einer Nicht-Bilddatei ⇒
     * klare Meldung statt Fehler": gilt auch fuer eine Datei mit Bildendung,
     * die GD nicht als Rasterbild lesen kann (z.B. defekte Bytes) - kein
     * Fehler, sondern "available": false plus Meldung.
     */
    public function test_unreadable_image_bytes_return_message_instead_of_error(): void {
        $this->resetAfterTest();
        $this->setUser($this->getDataGenerator()->create_user());
        get_file_storage()->create_file_from_string([
            'contextid' => material_files::own_context()->id,
            'component' => material_files::COMPONENT,
            'filearea' => material_files::FILEAREA,
            'itemid' => material_files::ITEMID,
            'filepath' => '/kurspilot-material/',
            'filename' => 'kaputt.png',
        ], 'das sind keine echten PNG-Bytes');

        $result = preview_material_file::execute('kaputt.png');

        $this->assertFalse($result['available']);
        $this->assertNotEmpty($result['message']);
        $this->assertNull($result['image_base64']);
    }
}
