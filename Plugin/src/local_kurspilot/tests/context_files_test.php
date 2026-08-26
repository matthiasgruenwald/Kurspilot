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
 * Pfadaufloesung des Kontextbereichs (Issue #343). Sicherheitsrelevant:
 * jeder Pfad, der aus der Wurzel herausfuehren wuerde, muss abgewiesen
 * werden - Angriffstests, nicht nur Happy-Path.
 *
 * @package    local_kurspilot
 * @copyright  2026 Kurspilot
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
#[\PHPUnit\Framework\Attributes\CoversClass(context_files::class)]
final class context_files_test extends \advanced_testcase {

    public function test_resolve_directory_defaults_to_root(): void {
        $this->resetAfterTest();
        $this->assertSame('/kurspilot/', context_files::resolve_directory(''));
    }

    public function test_resolve_directory_builds_subpath(): void {
        $this->resetAfterTest();
        $this->assertSame('/kurspilot/faecher/mathe/', context_files::resolve_directory('faecher/mathe'));
    }

    public function test_resolve_directory_rejects_dotdot_segment(): void {
        $this->resetAfterTest();
        $this->expectException(\moodle_exception::class);
        // Ein rohes '..'-Segment, wie es ankaeme, wenn PARAM_PATH es je nicht
        // schon vorher entfernt haette - die eigene Pruefung darf sich nicht
        // allein auf die Moodle-Parametersaeuberung verlassen.
        context_files::resolve_directory('faecher/../../../etc');
    }

    public function test_resolve_directory_rejects_single_dot_segment(): void {
        $this->resetAfterTest();
        $this->expectException(\moodle_exception::class);
        context_files::resolve_directory('./faecher');
    }

    public function test_resolve_file_splits_directory_and_filename(): void {
        $this->resetAfterTest();
        [$directory, $filename] = context_files::resolve_file('vorlagen.md');
        $this->assertSame('/kurspilot/', $directory);
        $this->assertSame('vorlagen.md', $filename);

        [$directory, $filename] = context_files::resolve_file('faecher/mathe/notiz.md');
        $this->assertSame('/kurspilot/faecher/mathe/', $directory);
        $this->assertSame('notiz.md', $filename);
    }

    public function test_resolve_file_rejects_traversal(): void {
        $this->resetAfterTest();
        $this->expectException(\moodle_exception::class);
        context_files::resolve_file('../secret.txt');
    }

    public function test_resolve_file_rejects_empty_path(): void {
        $this->resetAfterTest();
        $this->expectException(\moodle_exception::class);
        context_files::resolve_file('');
    }

    public function test_own_context_follows_current_user(): void {
        global $USER;

        $this->resetAfterTest();
        $user = $this->getDataGenerator()->create_user();
        $this->setUser($user);

        $this->assertEquals(\context_user::instance($user->id)->id, context_files::own_context()->id);
        $this->assertSame((int) $user->id, (int) $USER->id);
    }

    /**
     * Kein Toolname nennt einen Speicherort oder einen verbotenen
     * Namensbestandteil (Akzeptanzkriterium aus #343).
     */
    public function test_tool_names_reveal_no_storage_location(): void {
        $forbidden = ['private', 'pluginfile', 'nextcloud', 'webdav', 'moodlefile', 'filesystem'];
        $names = array_merge(
            array_keys(privacy_surface::allowed_tools()),
            array_values(privacy_surface::allowed_tools())
        );

        foreach ($names as $name) {
            foreach ($forbidden as $token) {
                $this->assertStringNotContainsStringIgnoringCase($token, $name, $name . ' nennt einen Speicherort.');
            }
        }
    }
}
