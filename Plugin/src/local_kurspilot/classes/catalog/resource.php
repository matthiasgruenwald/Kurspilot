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
 * Feldkatalog fuer mod_resource (Spec 0015 §4.1/§4.3, gelb: Hauptdatei ist
 * Pflicht, `create_module` deshalb bis Spec 0018 gesperrt).
 *
 * Fallstricke aus dem Bestand (Ticket #380):
 * - "files" (Dateimanager-Draft-Itemid) ist ein Pseudofeld, vollstaendig
 *   katalogisiert, aber bis Spec 0018 gesperrt: *„Dateien kann Kurspilot ab
 *   Spec 0018. Lege die Datei von Hand an, dann kann ich alles Weitere."*
 * - Anders als bei folder erzeugt resource OHNE Hauptdatei eine kaputte
 *   Aktivitaetsseite (mod/resource/view.php:69-71: `resource_print_filenotfound()`
 *   wenn keine Datei vorhanden ist) - `create_module('resource')` bleibt
 *   deshalb bis Spec 0018 gesperrt, `update_module_settings` bleibt erlaubt
 *   (ausser den Dateifeldern selbst).
 * - "displayoptions" wird von resource_set_display_options() unmittelbar aus
 *   display/popupwidth/popupheight/printintro/showsize/showtype/showdate
 *   nachgerechnet und steht auf der Sperrliste.
 * - "revision" wird beim Update selbst hochgezaehlt (resource_update_instance():
 *   `$data->revision++;`) und steht auf der Sperrliste.
 * - "tobemigrated"/"legacyfiles"/"legacyfileslast" sind Migrations-Buchhaltung
 *   aus Moodle 1.9-Restores, kein Lehrkraft-Feld - gesperrt.
 *
 * @package    local_kurspilot
 * @copyright  2026 Kurspilot
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
final class resource implements module_catalog {

    public static function modname(): string {
        return 'resource';
    }

    public static function fields(): array {
        return [
            new field(
                'name',
                'PARAM_TEXT',
                'Anzeigename der Datei-Aktivitaet.',
                true,
                null,
                null,
                null,
                'mod/resource/mod_form.php:51-54 (PARAM_TEXT bzw. PARAM_CLEANHTML je nach $CFG->formatstringstriptags)'
            ),
            new field(
                'intro',
                'PARAM_RAW',
                'Beschreibungstext (Intro), optional oberhalb der Datei eingeblendet (Pseudofeld "printintro" '
                    . 'steuert ob, nur bei bestimmten display-Werten wirksam).',
                false,
                null,
                null,
                null,
                'mod/resource/db/install.xml (resource.intro, NOTNULL=false)'
            ),
            new field(
                'introformat',
                'PARAM_INT',
                'Textformat des Intros.',
                false,
                FORMAT_HTML,
                null,
                'format_text_menu()',
                'lib/weblib.php:464 (format_text_menu()); Spalte mod/resource/db/install.xml (resource.introformat)'
            ),
            new field(
                'display',
                'PARAM_INT',
                'Darstellung der Datei (z.B. automatisch, eingebettet, neues Fenster, Popup, direkt '
                    . 'oeffnen/herunterladen). Die tatsaechlich waehlbaren Optionen sind eine von der '
                    . 'Moodle-Administration konfigurierte Teilmenge, keine feste Liste.',
                false,
                0,
                null,
                'resourcelib_get_displayoptions()',
                'lib/resourcelib.php:30-42 (RESOURCELIB_DISPLAY_*-Konstanten), :111 (resourcelib_get_displayoptions()); '
                    . 'Teilmenge aus admin_setting_configmultiselect(\'resource/displayoptions\', ...) in '
                    . 'mod/resource/settings.php:28-42; Spalte mod/resource/db/install.xml (resource.display)'
            ),
            new field(
                'filterfiles',
                'PARAM_INT',
                'Textfilter auf den Dateiinhalt anwenden: kein Filter (0), alle Dateien (1) oder nur HTML-Dateien '
                    . '(2).',
                false,
                0,
                [0, 1, 2],
                null,
                'mod/resource/mod_form.php:132-134 (Optionsliste none/allfiles/htmlfilesonly); Spalte '
                    . 'mod/resource/db/install.xml (resource.filterfiles)'
            ),
        ];
    }

    public static function pseudofields(): array {
        return [
            new field(
                'files',
                'Draft-Itemid (Dateimanager)',
                'Die angehaengte(n) Datei(en), darunter die Hauptdatei. Vollstaendig katalogisiert, aber bis '
                    . 'Spec 0018 gesperrt: "Dateien kann Kurspilot ab Spec 0018. Lege die Datei von Hand an, dann '
                    . 'kann ich alles Weitere." OHNE Hauptdatei erzeugt resource eine kaputte Aktivitaetsseite - '
                    . 'anders als bei folder ist ein leerer Zustand hier ungueltig.',
                true,
                null,
                null,
                null,
                'mod/resource/locallib.php: resource_set_mainfile(); mod/resource/view.php:69-71 '
                    . '(resource_print_filenotfound() ohne Datei)'
            ),
            new field(
                'printintro',
                'PARAM_BOOL',
                'Intro zusaetzlich anzeigen - nur wirksam bei display=0 (Auto), 1 (Embed) oder 2 (Frame). Kein '
                    . 'DB-Feld - fliesst in die serialisierte "displayoptions"-Spalte ein.',
                false,
                0,
                [0, 1],
                null,
                'mod/resource/lib.php (resource_set_display_options(): nur gesetzt, wenn display in '
                    . '[AUTO, EMBED, FRAME])'
            ),
            new field(
                'popupwidth',
                'PARAM_INT',
                'Fensterbreite in Pixeln, nur wirksam bei display=6 (Popup). Kein DB-Feld - fliesst in '
                    . '"displayoptions" ein.',
                false,
                620,
                null,
                null,
                'mod/resource/lib.php (resource_set_display_options(): nur gesetzt, wenn '
                    . 'display==RESOURCELIB_DISPLAY_POPUP)'
            ),
            new field(
                'popupheight',
                'PARAM_INT',
                'Fensterhoehe in Pixeln, nur wirksam bei display=6 (Popup). Kein DB-Feld - fliesst in '
                    . '"displayoptions" ein.',
                false,
                450,
                null,
                null,
                'mod/resource/lib.php (resource_set_display_options(): nur gesetzt, wenn '
                    . 'display==RESOURCELIB_DISPLAY_POPUP)'
            ),
            new field(
                'showsize',
                'PARAM_BOOL',
                'Dateigroesse anzeigen. Kein DB-Feld - fliesst in "displayoptions" ein.',
                false,
                0,
                [0, 1],
                null,
                'mod/resource/lib.php (resource_set_display_options(): `$displayoptions[\'showsize\']`)'
            ),
            new field(
                'showtype',
                'PARAM_BOOL',
                'Dateityp anzeigen. Kein DB-Feld - fliesst in "displayoptions" ein.',
                false,
                0,
                [0, 1],
                null,
                'mod/resource/lib.php (resource_set_display_options(): `$displayoptions[\'showtype\']`)'
            ),
            new field(
                'showdate',
                'PARAM_BOOL',
                'Erstellungs-/Aenderungsdatum der Datei anzeigen. Kein DB-Feld - fliesst in "displayoptions" ein.',
                false,
                0,
                [0, 1],
                null,
                'mod/resource/lib.php (resource_set_display_options(): `$displayoptions[\'showdate\']`)'
            ),
        ];
    }

    public static function blocklist(): array {
        return [
            'revision',
            'displayoptions',
            'tobemigrated',
            'legacyfiles',
            'legacyfileslast',
            // Bis Spec 0018 gesperrt (§4.3) - vollstaendig katalogisiert in pseudofields(), s.o.
            'files',
        ];
    }

    public static function combination_rules(): array {
        return [];
    }

    public static function side_effects(): array {
        return [
            'resource bleibt bis Spec 0018 nicht anlegbar: ohne Hauptdatei entsteht eine kaputte '
                . 'Aktivitaetsseite (Spec 0015 §4.3). create_module ist fuer resource deshalb gesperrt, '
                . 'update_module_settings bleibt erlaubt (ausser den Dateifeldern).',
        ];
    }

    public static function bundles(): array {
        return [];
    }

    public static function schreibweg(): ?string {
        return null;
    }
}
