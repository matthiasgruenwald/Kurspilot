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

namespace local_kurspilot\catalog;

/**
 * Feldkatalog fuer mod_folder (Spec 0015 §4.1, gruen: Pseudofeld "files" beim
 * Anlegen, Dateifelder gesperrt bis Spec 0018).
 *
 * Fallstricke aus dem Bestand (Ticket #380):
 * - "files" (Dateimanager-Draft-Itemid) ist ein Pseudofeld, vollstaendig
 *   katalogisiert, aber bis Spec 0018 gesperrt (§4.3): *„Dateien kann
 *   Kurspilot ab Spec 0018. Lege die Datei von Hand an, dann kann ich alles
 *   Weitere."*
 * - Anders als bei resource ist ein LEERER Ordner gueltig
 *   (mod/folder/lib.php: `$draftitemid = $data->files;` wird nur bei
 *   Wahrheitswert verarbeitet) - `create_module('folder')` bleibt deshalb bis
 *   Spec 0018 erlaubt, obwohl Dateien selbst gesperrt sind.
 * - display=1 (Inline) vertraegt sich nicht mit automatischer
 *   Abschluss-Verfolgung bei Ansicht - Moodle lehnt das im Formular ab.
 *
 * @package    local_kurspilot
 * @copyright  2026 Kurspilot
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
final class folder implements module_catalog {

    public static function modname(): string {
        return 'folder';
    }

    public static function fields(): array {
        return [
            new field(
                'name',
                'PARAM_TEXT',
                'Anzeigename des Verzeichnisses.',
                true,
                null,
                null,
                null,
                'mod/folder/mod_form.php:38-41 (PARAM_TEXT bzw. PARAM_CLEANHTML je nach $CFG->formatstringstriptags)'
            ),
            new field(
                'intro',
                'PARAM_RAW',
                'Beschreibungstext (Intro).',
                false,
                null,
                null,
                null,
                'mod/folder/db/install.xml (folder.intro, NOTNULL=false)'
            ),
            new field(
                'introformat',
                'PARAM_INT',
                'Textformat des Intros.',
                false,
                FORMAT_HTML,
                null,
                'format_text_menu()',
                'lib/weblib.php:464 (format_text_menu()); Spalte mod/folder/db/install.xml (folder.introformat)'
            ),
            new field(
                'display',
                'PARAM_INT',
                'Darstellung: eigene Seite (0) oder eingebettet auf der Kursseite (1, "Inline").',
                false,
                0,
                [0, 1],
                null,
                'mod/folder/lib.php:29,31 (FOLDER_DISPLAY_PAGE/FOLDER_DISPLAY_INLINE); Spalte '
                    . 'mod/folder/db/install.xml (folder.display)'
            ),
            new field(
                'showexpanded',
                'PARAM_BOOL',
                'Unterordner beim Oeffnen ein- (1) oder zusammengeklappt (0) anzeigen.',
                false,
                1,
                [0, 1],
                null,
                'mod/folder/db/install.xml (folder.showexpanded); Default get_config(\'folder\', \'showexpanded\')'
            ),
            new field(
                'showdownloadfolder',
                'PARAM_BOOL',
                'Schaltflaeche "Alles als ZIP herunterladen" anzeigen.',
                false,
                1,
                [0, 1],
                null,
                'mod/folder/db/install.xml (folder.showdownloadfolder)'
            ),
            new field(
                'forcedownload',
                'PARAM_BOOL',
                'Einzelne Dateien beim Anklicken herunterladen statt im Browser oeffnen.',
                false,
                1,
                [0, 1],
                null,
                'mod/folder/db/install.xml (folder.forcedownload)'
            ),
        ];
    }

    public static function common_field_names(): array {
        return array_map(static fn (field $f): string => $f->name, self::fields());
    }

    public static function pseudofields(): array {
        return [
            new field(
                'files',
                'Draft-Itemid (Dateimanager)',
                'Die im Ordner abgelegten Dateien. Vollstaendig katalogisiert, aber bis Spec 0018 gesperrt: '
                    . '"Dateien kann Kurspilot ab Spec 0018. Lege die Datei von Hand an, dann kann ich alles '
                    . 'Weitere." Ein LEERER Ordner ist gueltig - anders als bei resource blockiert das Fehlen '
                    . 'einer Datei das Anlegen nicht.',
                false,
                null,
                null,
                null,
                'mod/folder/lib.php (folder_add_instance()/folder_update_instance(): $data->files als Draft-Itemid)'
            ),
        ];
    }

    public static function blocklist(): array {
        return [
            'revision',
            // Bis Spec 0018 gesperrt (§4.3) - vollstaendig katalogisiert in pseudofields(), s.o.
            'files',
        ];
    }

    public static function combination_rules(): array {
        return [
            'display=1 (Inline) vertraegt sich nicht mit automatischer Abschluss-Verfolgung bei Ansicht '
                . '(completion=automatic + completionview) - Moodle lehnt das im Formular ab '
                . '(mod/folder/mod_form.php: validation()).',
        ];
    }

    public static function side_effects(): array {
        return [
            'folder bleibt bis Spec 0018 anlegbar - ein leerer Ordner ist gueltig, anders als resource ohne '
                . 'Hauptdatei (Spec 0015 §4.3).',
        ];
    }

    public static function bundles(): array {
        return [];
    }

    public static function schreibweg(): ?string {
        return null;
    }
}
