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
 * Gemeinsame Vorbereitung des $moduleinfo-Feldobjekts fuer JEDEN Aufrufer von
 * update_moduleinfo() ausserhalb des echten Formularwegs (Ticket #388: erst
 * update_module_settings, Ticket #392: auch set_completion) - ohne diese
 * Ergaenzungen lesen etliche *_update_instance()-Funktionen eine undefinierte
 * Eigenschaft (PHP-Warning bis -Error, siehe {@see \local_kurspilot\catalog\page}-
 * Kommentar "unbedingtes Lesemuster"), weil get_moduleinfo_data() sie NICHT
 * liefert - das tut sonst ausschliesslich moodleform_mod::data_preprocessing(),
 * das hier nie laeuft.
 *
 * Extrahiert aus update_module_settings (#388), damit set_completion (#392)
 * dieselbe Vorbereitung nutzt, statt sie fuer jeden Modultyp zu wiederholen -
 * set_completion setzt selbst nur Vervollstaendigungsfelder, ruft aber
 * denselben update_moduleinfo()-Weg auf und braucht deshalb exakt dieselbe
 * Vorbereitung wie ein Patch, der gar kein Pseudofeld nennt.
 *
 * @package    local_kurspilot
 * @copyright  2026 Kurspilot
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
final class pseudofield_carry_forward {

    /**
     * Editor-Array-Pseudofelder, deren ABWESENHEIT die jeweilige
     * *_update_instance()-Funktion ungeschuetzt (ohne $mform-Wache) liest und
     * dabei den echten Inhalt auf null setzt (Spec 0015 §2.2 Kategorie 2,
     * hier konkret mod/page/lib.php: page_update_instance(): `$data->content
     * = $data->page['text'];` immer, nicht nur wenn 'page' im Patch steht) -
     * ohne diesen Formularweg-Ersatz waere JEDER Schreibvorgang auf "page"
     * destruktiv, auch einer, der "page" gar nicht nennt.
     *
     * ponytail: nur "page", die einzige unter den katalogisierten
     * Aktivitaetsarten mit diesem unbedingten Lesemuster (choice/resource/
     * folder/forum degradieren beim Fehlen ihrer Pseudofelder nachweislich
     * ohne Datenverlust, siehe Ticket #388) - bei einer weiteren
     * Aktivitaetsart mit demselben Muster hier ergaenzen.
     *
     * @var array<string, array{pseudofield: string, content: string, format: string}>
     */
    private const REQUIRED_EDITOR_PSEUDOFIELDS = [
        'page' => ['pseudofield' => 'page', 'content' => 'content', 'format' => 'contentformat'],
    ];

    /**
     * Fuehrt alle vier Ergaenzungen fuer $modname aus.
     *
     * @param string $modname
     * @param class-string<module_catalog> $catalogclass
     * @param \stdClass $moduleinfo Wird in-place ergaenzt.
     * @param array $before Ist-Stand vor dem Schreiben (fuer Editor-Pseudofelder).
     * @param \stdClass $cm
     * @param array $patch Vom Aufrufer selbst gesetzte Felder - hier nicht ueberschrieben.
     * @return void
     */
    public static function apply(
        string $modname,
        string $catalogclass,
        \stdClass $moduleinfo,
        array $before,
        \stdClass $cm,
        array $patch
    ): void {
        self::fill_pseudofield_defaults($catalogclass, $moduleinfo, $patch);
        self::carry_forward_required_editor_pseudofields($modname, $moduleinfo, $before, $patch);
        self::carry_forward_draft_file_pseudofield($modname, $moduleinfo, $patch);
        self::carry_forward_choice_options($modname, $moduleinfo, $cm, $patch);
    }

    /**
     * Fuellt Pseudofelder, die $moduleinfo (aus get_moduleinfo_data(), ohne
     * den Formularweg) unbekannt sind, mit ihrem katalogisierten
     * Formular-Default auf - genau das, was moodleform_mod beim Laden des
     * Formulars ohnehin taete. Ohne das entstehen fuer jedes optionale
     * Pseudofeld, das der Patch nicht erwaehnt (z.B. mod_page:
     * "printintro"), "Undefined property"-Warnungen und ein stiller
     * Reset auf null statt auf den dokumentierten Default.
     *
     * Pseudofelder mit Default null (durchweg die mit required=true, siehe
     * {@see self::REQUIRED_EDITOR_PSEUDOFIELDS}) bleiben hier aussen vor -
     * ein Nullwert waere kein sinnvoller Ersatz.
     *
     * @param class-string<module_catalog> $catalogclass
     * @param \stdClass $moduleinfo Wird in-place ergaenzt.
     * @param array $patch
     * @return void
     */
    private static function fill_pseudofield_defaults(string $catalogclass, \stdClass $moduleinfo, array $patch): void {
        foreach ($catalogclass::pseudofields() as $pseudofield) {
            if (array_key_exists($pseudofield->name, $patch) || property_exists($moduleinfo, $pseudofield->name)) {
                continue;
            }
            if ($pseudofield->default !== null) {
                $moduleinfo->{$pseudofield->name} = $pseudofield->default;
            }
        }
    }

    /**
     * Siehe {@see self::REQUIRED_EDITOR_PSEUDOFIELDS}: rekonstruiert ein
     * fehlendes Editor-Pseudofeld aus dem Vorher-Stand, damit ein
     * Schreibvorgang, der es nicht erwaehnt, den echten Inhalt nicht auf null
     * zieht.
     *
     * @param string $modname
     * @param \stdClass $moduleinfo Wird in-place ergaenzt.
     * @param array $before
     * @param array $patch
     * @return void
     */
    private static function carry_forward_required_editor_pseudofields(
        string $modname,
        \stdClass $moduleinfo,
        array $before,
        array $patch
    ): void {
        $spec = self::REQUIRED_EDITOR_PSEUDOFIELDS[$modname] ?? null;
        if ($spec === null || array_key_exists($spec['pseudofield'], $patch)) {
            return;
        }
        $moduleinfo->{$spec['pseudofield']} = [
            'text' => (string) ($before[$spec['content']] ?? ''),
            'format' => (int) ($before[$spec['format']] ?? FORMAT_HTML),
            'itemid' => 0,
        ];
    }

    /**
     * "files" (folder, resource) ist gesperrt (Blocklist) und hat keinen
     * Katalog-Default (null), bleibt also nach {@see self::fill_pseudofield_defaults()}
     * auf dem Feldobjekt unbelegt. Ohne diese Ergaenzung liest
     * folder_update_instance()/resource_set_mainfile() eine undefinierte
     * Eigenschaft (PHP-Warning) - der abgelesene Wert wird danach ohnehin
     * ignoriert oder durch file_get_submitted_draft_itemid() ueberschrieben
     * (kein Formularkontext hier), ein neutraler Platzhalter aendert also
     * nichts an bestehenden Dateien, silenced nur die Warnung.
     *
     * @param string $modname
     * @param \stdClass $moduleinfo Wird in-place ergaenzt.
     * @param array $patch
     * @return void
     */
    private static function carry_forward_draft_file_pseudofield(string $modname, \stdClass $moduleinfo, array $patch): void {
        if (!in_array($modname, ['folder', 'resource'], true) || array_key_exists('files', $patch)) {
            return;
        }
        if (!property_exists($moduleinfo, 'files')) {
            $moduleinfo->files = 0;
        }
    }

    /**
     * "option"/"limit"/"optionid" (choice) leben in choice_options, nicht in
     * der choice-Instanzzeile - get_moduleinfo_data() liefert sie deshalb
     * nicht (anders als bei "page", das ueber $before rekonstruierbar waere).
     * Ohne diese Ergaenzung liest choice_update_instance() eine undefinierte
     * Eigenschaft "option" (PHP-Warning) und die foreach-Schleife laeuft ins
     * Leere - bestehende Optionen bleiben zwar unangetastet (die Schleife tut
     * nichts), aber ein Schreibvorgang, der "option" gar nicht nennt, soll
     * sauber durchlaufen, nicht mit Warnings. Rekonstruktion identisch zu
     * mod_choice_mod_form::data_preprocessing() (mod/choice/mod_form.php).
     *
     * @param string $modname
     * @param \stdClass $moduleinfo Wird in-place ergaenzt.
     * @param \stdClass $cm
     * @param array $patch
     * @return void
     */
    private static function carry_forward_choice_options(string $modname, \stdClass $moduleinfo, \stdClass $cm, array $patch): void {
        global $DB;

        if ($modname !== 'choice' || array_key_exists('option', $patch)) {
            return;
        }
        $texts = $DB->get_records_menu('choice_options', ['choiceid' => $cm->instance], 'id', 'id,text');
        $limits = $DB->get_records_menu('choice_options', ['choiceid' => $cm->instance], 'id', 'id,maxanswers');
        if (!$texts) {
            return;
        }
        $ids = array_keys($texts);
        $moduleinfo->option = array_values($texts);
        $moduleinfo->limit = array_values($limits);
        $moduleinfo->optionid = $ids;
    }
}
