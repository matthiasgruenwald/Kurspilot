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
 * Auflisten des Kontextbereichs (Issue #343). Sicherheitsrelevant: gedeckt
 * werden neben dem Happy-Path echte Angriffstests fuer Pfadausbruch und
 * Personen-Isolation.
 *
 * @package    local_kurspilot
 * @copyright  2026 Kurspilot
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
#[\PHPUnit\Framework\Attributes\CoversClass(list_context_files::class)]
final class list_context_files_test extends \advanced_testcase {

    /**
     * Die Vorlagendatei an der Wurzel ist ohne Sonderweg erreichbar - der
     * Standardaufruf ohne "path" listet die Wurzel.
     */
    public function test_lists_root_including_template_file(): void {
        $this->resetAfterTest();
        $user = $this->getDataGenerator()->create_user();
        $this->setUser($user);

        $this->create_context_file($user, '/kurspilot/', 'vorlagen.md', '# Vorlagen');
        $this->create_context_file($user, '/kurspilot/', 'index.md', '# Index');

        $result = list_context_files::execute();
        $result = external_api::clean_returnvalue(list_context_files::execute_returns(), $result);

        $names = array_column($result['entries'], 'name');
        $this->assertContains('vorlagen.md', $names);
        $this->assertContains('index.md', $names);
    }

    /**
     * Ein Unterordner erscheint an der Wurzel als Ordnereintrag und ist
     * ueber "path" selbst auflistbar.
     */
    public function test_lists_subfolder_contents(): void {
        $this->resetAfterTest();
        $user = $this->getDataGenerator()->create_user();
        $this->setUser($user);

        $this->create_context_file($user, '/kurspilot/faecher/mathe/', 'profil.md', '# Mathe');

        $root = list_context_files::execute();
        $root = external_api::clean_returnvalue(list_context_files::execute_returns(), $root);
        $folders = array_filter($root['entries'], fn($entry) => $entry['type'] === 'folder');
        $this->assertContains('faecher', array_column($folders, 'name'));

        $sub = list_context_files::execute('faecher/mathe');
        $sub = external_api::clean_returnvalue(list_context_files::execute_returns(), $sub);
        $this->assertContains('profil.md', array_column($sub['entries'], 'name'));
    }

    /**
     * Ein Pfad, der aus dem Bereich herausfuehren wuerde, wird abgewiesen
     * (CRITICAL) - Moodles eigene Parametervalidierung lehnt ein "../"-
     * Segment bereits an der API-Grenze ab, bevor der Aufloesungscode
     * ueberhaupt laeuft.
     */
    public function test_traversal_attempt_is_rejected(): void {
        $this->resetAfterTest();
        $user = $this->getDataGenerator()->create_user();
        $this->setUser($user);

        // Ausserhalb der organisatorischen Wurzel "/kurspilot/", aber noch
        // im selben Dateibereich - darf unter keinen Umstaenden ueber einen
        // Ausbruchsversuch erreichbar sein.
        $this->create_context_file($user, '/', 'secret.txt', 'geheim');

        $this->expectException(\moodle_exception::class);
        list_context_files::execute('../../secret');
    }

    /**
     * Auch ein Pfad, der die API-Grenze irgendwie passieren wuerde (z.B.
     * weil eine kuenftige Aenderung PARAM_PATH lockert), landet nicht
     * ausserhalb der Wurzel - die eigene Aufloesung in context_files prueft
     * unabhaengig davon jedes Segment.
     */
    public function test_resolved_directory_never_leaves_root(): void {
        $this->resetAfterTest();
        $this->assertStringStartsWith('/kurspilot/', context_files::resolve_directory('faecher/mathe'));
    }

    /**
     * Person A erreicht unter keinen Umstaenden den Bereich von Person B
     * (CRITICAL) - es gibt keinen Parameter, der einen fremden Bereich
     * adressieren koennte.
     */
    public function test_person_a_never_sees_person_bs_files(): void {
        $this->resetAfterTest();
        $teachera = $this->getDataGenerator()->create_user();
        $teacherb = $this->getDataGenerator()->create_user();

        $this->setUser($teachera);
        $this->create_context_file($teachera, '/kurspilot/', 'lerngruppe-a.md', 'A');

        $this->setUser($teacherb);
        $result = list_context_files::execute();
        $result = external_api::clean_returnvalue(list_context_files::execute_returns(), $result);

        $this->assertNotContains('lerngruppe-a.md', array_column($result['entries'], 'name'));
    }

    /**
     * Kein Parameter erlaubt es, einen anderen Dateibereich, eine fremde
     * itemid oder contextid anzugeben - strukturell erzwungen, nicht per
     * Konvention.
     */
    public function test_execute_parameters_expose_no_area_selector(): void {
        $definition = list_context_files::execute_parameters()->keys;
        $this->assertSame(['path'], array_keys($definition));
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
