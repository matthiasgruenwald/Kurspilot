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
 * Lesen aus dem Kontextbereich (Issue #343). Sicherheitsrelevant: neben dem
 * Happy-Path echte Angriffstests fuer Pfadausbruch, fremde Bereiche und
 * Personen-Isolation; ausserdem der Beleg, dass kein Schreibpfad existiert.
 *
 * @package    local_kurspilot
 * @copyright  2026 Kurspilot
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
#[\PHPUnit\Framework\Attributes\CoversClass(read_context_file::class)]
final class read_context_file_test extends \advanced_testcase {

    /**
     * Die Vorlagendatei an der Wurzel ist mit demselben Vertrag lesbar wie
     * jede andere Kontextdatei - kein Sonderweg.
     */
    public function test_reads_root_template_file(): void {
        $this->resetAfterTest();
        $user = $this->getDataGenerator()->create_user();
        $this->setUser($user);

        $this->create_context_file($user, '/kurspilot/', 'vorlagen.md', '# Gemerkte Vorlagen');

        $result = read_context_file::execute('vorlagen.md');
        $result = external_api::clean_returnvalue(read_context_file::execute_returns(), $result);

        $this->assertSame('# Gemerkte Vorlagen', $result['content']);
        $this->assertSame('vorlagen.md', $result['filename']);
    }

    /**
     * Eine Datei in einem Unterordner ist ohne Sonderfall lesbar.
     */
    public function test_reads_subfolder_file(): void {
        $this->resetAfterTest();
        $user = $this->getDataGenerator()->create_user();
        $this->setUser($user);

        $this->create_context_file($user, '/kurspilot/faecher/mathe/', 'profil.md', '# Mathe-Fachprofil');

        $result = read_context_file::execute('faecher/mathe/profil.md');
        $result = external_api::clean_returnvalue(read_context_file::execute_returns(), $result);

        $this->assertSame('# Mathe-Fachprofil', $result['content']);
    }

    /**
     * Ein Pfad, der aus dem Bereich herausfuehren wuerde, wird abgewiesen
     * (CRITICAL) - Moodles Parametervalidierung lehnt das "../"-Segment
     * bereits an der API-Grenze ab; eine Datei ausserhalb der Wurzel bleibt
     * so unerreichbar.
     */
    public function test_traversal_attempt_is_rejected(): void {
        $this->resetAfterTest();
        $user = $this->getDataGenerator()->create_user();
        $this->setUser($user);

        $this->create_context_file($user, '/', 'secret.txt', 'geheim');

        $this->expectException(\moodle_exception::class);
        read_context_file::execute('../secret.txt');
    }

    /**
     * Person A erreicht unter keinen Umstaenden eine Datei von Person B
     * (CRITICAL), selbst wenn der exakte Dateiname bekannt ist.
     */
    public function test_person_a_cannot_read_person_bs_file(): void {
        $this->resetAfterTest();
        $teachera = $this->getDataGenerator()->create_user();
        $teacherb = $this->getDataGenerator()->create_user();

        $this->setUser($teachera);
        $this->create_context_file($teachera, '/kurspilot/', 'lerngruppe-a.md', 'Vertraulich A');

        $this->setUser($teacherb);
        $this->expectException(\moodle_exception::class);
        read_context_file::execute('lerngruppe-a.md');
    }

    /**
     * Kein Parameter erlaubt es, contextid/itemid/component zu manipulieren
     * - "path" ist der einzige Parameter.
     */
    public function test_execute_parameters_expose_no_area_selector(): void {
        $definition = read_context_file::execute_parameters()->keys;
        $this->assertSame(['path'], array_keys($definition));
    }

    /**
     * Schreiben ist ueber die Werkzeugoberflaeche nicht moeglich - es gibt
     * schlicht keine Werkzeugklasse dafuer.
     */
    public function test_no_write_tool_is_registered(): void {
        foreach (\local_kurspilot\privacy_surface::ALLOWED_TOOLS as $toolname => $functionname) {
            $this->assertStringNotContainsStringIgnoringCase('write', $toolname);
            $this->assertStringNotContainsStringIgnoringCase('write', $functionname);
            $this->assertStringNotContainsStringIgnoringCase('save', $toolname);
            $this->assertStringNotContainsStringIgnoringCase('upload', $toolname);
        }
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
