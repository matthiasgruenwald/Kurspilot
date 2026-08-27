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

namespace local_kurspilot\history;

defined('MOODLE_INTERNAL') || die();

/**
 * Schnappschuss-Speicher des Aenderungsverlaufs (#385, Spec 0015 §10.4/§10.8).
 *
 * Baut absichtlich NICHT auf course/modlib.php::get_moduleinfo_data() auf:
 * die Funktion verlangt can_update_moduleinfo() (moodle/course:manageactivities)
 * und legt bei jedem Aufruf einen neuen Draft-Dateibereich fuer introeditor an
 * - ein Schreib-Nebeneffekt, den ein Beobachter, der nur lesen/serialisieren
 * soll, nicht ausloesen darf. Die Feldzusammenstellung ist deshalb hier
 * dupliziert (gleiches Vorgehen wie {@see \local_kurspilot\external\get_module_settings}),
 * ergaenzt um die dort bewusst ausgeklammerten gradepass/gradecat/Outcome-Felder,
 * die Spec 0015 §10.4 fuer den Verlauf ausdruecklich verlangt.
 *
 * Intro-Dateien laufen nicht ueber introeditor/Draftbereich, sondern wie alle
 * anderen Dateien des Modulkontexts durch {@see self::capture_files()} -
 * Metadaten only, dedupliziert in local_kurspilot_cm_file.
 *
 * @package    local_kurspilot
 * @copyright  2026 Kurspilot
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
final class version_writer {

    /** @var string Ursprung, solange nur der native Moodle-Schreibweg beobachtet wird. */
    public const SOURCE_MOODLE = 'moodle';

    /**
     * Schnappt den Ist-Stand einer Aktivitaet als neue Version.
     *
     * @param int $cmid
     * @param int $userid Nutzer/in, unter der der Schreibvorgang lief (Event-userid).
     * @param string $source
     * @return int id der neu angelegten Version
     */
    public static function capture(int $cmid, int $userid, string $source = self::SOURCE_MOODLE): int {
        global $DB;

        $cm = get_coursemodule_from_id('', $cmid, 0, false, MUST_EXIST);
        $context = \context_module::instance($cm->id);

        $nextversion = (int) $DB->get_field_sql(
            'SELECT COALESCE(MAX(version), 0) + 1 FROM {local_kurspilot_cm_version} WHERE cmid = ?',
            [$cm->id]
        );

        $versionid = (int) $DB->insert_record('local_kurspilot_cm_version', (object) [
            'cmid' => $cm->id,
            'version' => $nextversion,
            'source' => $source,
            'userid' => $userid,
            'moduleinfo_json' => json_encode(self::build_moduleinfo($cm), JSON_UNESCAPED_UNICODE),
            'coursemodule_json' => json_encode(
                (array) $DB->get_record('course_modules', ['id' => $cm->id], '*', MUST_EXIST),
                JSON_UNESCAPED_UNICODE
            ),
            'timecreated' => time(),
        ]);

        self::capture_files($versionid, $context->id, (string) $cm->modname);

        return $versionid;
    }

    /**
     * Repliziert das get_moduleinfo_data()-Feldobjekt (Instanz-Record, Tags,
     * availability, gradepass/gradecat/Outcomes), ohne dessen
     * Formular-Nebenwirkungen auszuloesen.
     *
     * @param \stdClass $cm
     * @return array
     */
    private static function build_moduleinfo(\stdClass $cm): array {
        global $CFG, $DB;

        $cw = $DB->get_record('course_sections', ['id' => $cm->section], 'section', MUST_EXIST);
        $instance = (array) $DB->get_record($cm->modname, ['id' => $cm->instance], '*', MUST_EXIST);

        $data = array_merge($instance, [
            'coursemodule' => (int) $cm->id,
            'section' => (int) $cw->section,
            'visible' => (int) $cm->visible,
            'visibleoncoursepage' => (int) $cm->visibleoncoursepage,
            'cmidnumber' => (string) $cm->idnumber,
            'groupmode' => (int) groups_get_activity_groupmode($cm),
            'groupingid' => (int) $cm->groupingid,
            'course' => (int) $cm->course,
            'module' => (int) $cm->module,
            'modulename' => (string) $cm->modname,
            'instance' => (int) $cm->instance,
            'completion' => (int) $cm->completion,
            'completionview' => (int) $cm->completionview,
            'completionexpected' => (int) $cm->completionexpected,
            'completionusegrade' => $cm->completiongradeitemnumber === null ? 0 : 1,
            'completionpassgrade' => (int) $cm->completionpassgrade,
            'completiongradeitemnumber' => $cm->completiongradeitemnumber,
            'showdescription' => (int) $cm->showdescription,
            'downloadcontent' => $cm->downloadcontent,
            'lang' => (string) $cm->lang,
            'tags' => \core_tag_tag::get_item_tags_array('core', 'course_modules', $cm->id),
        ]);

        if (!empty($CFG->enableavailability)) {
            // Rohe Bedingungen wie get_moduleinfo_data(); die Profil-Maskierung
            // (ADR 0011) ist Sache der kuenftigen Ansichts-Werkzeuge, nicht der
            // Speicherung - "das Diff wird beim Ansehen berechnet" (Spec 0015 §10.1).
            $data['availabilityconditionsjson'] = (string) ($cm->availability ?? '');
        }

        self::add_grade_fields($data, $cm);

        return $data;
    }

    /**
     * gradepass/gradecat/Outcome-Felder wie course/modlib.php::get_moduleinfo_data()
     * (Zeilen 848-885), bewusst ausserhalb von get_module_settings gehalten.
     *
     * @param array $data
     * @param \stdClass $cm
     * @return void
     */
    private static function add_grade_fields(array &$data, \stdClass $cm): void {
        global $CFG;
        require_once($CFG->libdir . '/gradelib.php');

        $component = 'mod_' . $cm->modname;
        $items = \grade_item::fetch_all([
            'itemtype' => 'mod',
            'itemmodule' => $cm->modname,
            'iteminstance' => $cm->instance,
            'courseid' => $cm->course,
        ]);

        if (!$items) {
            return;
        }

        foreach ($items as $item) {
            if (!empty($item->outcomeid)) {
                $data['outcome_' . $item->outcomeid] = 1;
            } else if (isset($item->gradepass)) {
                $fieldname = \core_grades\component_gradeitems::get_field_name_for_itemnumber(
                    $component,
                    $item->itemnumber,
                    'gradepass'
                );
                $data[$fieldname] = format_float($item->gradepass, $item->get_decimals());
            }
        }

        $gradecat = [];
        foreach ($items as $item) {
            if (!isset($gradecat[$item->itemnumber])) {
                $gradecat[$item->itemnumber] = $item->categoryid;
            } else if ($gradecat[$item->itemnumber] != $item->categoryid) {
                $gradecat[$item->itemnumber] = false; // Gemischte Kategorien - nicht setzen.
            }
        }
        foreach ($gradecat as $itemnumber => $cat) {
            if ($cat !== false) {
                $fieldname = \core_grades\component_gradeitems::get_field_name_for_itemnumber(
                    $component,
                    $itemnumber,
                    'gradecat'
                );
                $data[$fieldname] = $cat;
            }
        }
    }

    /**
     * Datei-Zeilen des Modulkontexts, nur Metadaten. Intro-Dateien sind
     * rueckschreibbar (gap=0), alles andere ist eine ausgewiesene Luecke
     * (gap=1) - Dateiinhalte ausserhalb der Beschreibung sind nicht
     * rueckschreibbar (Spec 0015 §10.4).
     *
     * @param int $versionid
     * @param int $contextid
     * @param string $modname
     * @return void
     */
    private static function capture_files(int $versionid, int $contextid, string $modname): void {
        global $DB;

        $introcomponent = 'mod_' . $modname;
        $files = $DB->get_records_select('files', 'contextid = ? AND filename <> ?', [$contextid, '.']);

        foreach ($files as $file) {
            $fileid = self::dedup_file($file);
            $gap = ($file->component === $introcomponent && $file->filearea === 'intro') ? 0 : 1;
            $DB->insert_record('local_kurspilot_cm_version_file', (object) [
                'versionid' => $versionid,
                'fileid' => $fileid,
                'gap' => $gap,
            ], false);
        }
    }

    /**
     * Legt Datei-Metadaten nur an, wenn diese Kombination aus pathnamehash
     * und contenthash noch nicht bekannt ist - Dedup ueber mehrere Staende
     * hinweg. Nur der pathnamehash zu dedupen wuerde bei einer inhaltlich
     * geaenderten Datei am gleichen Pfad (z.B. ausgetauschtes Intro-Bild)
     * die veralteten Metadaten (Groesse, Mimetype, contenthash) an neuere
     * Staende zurueckgeben - der contenthash muss deshalb Teil des
     * Dedup-Schluessels sein.
     *
     * @param \stdClass $file
     * @return int
     */
    private static function dedup_file(\stdClass $file): int {
        global $DB;

        $existing = $DB->get_record('local_kurspilot_cm_file', [
            'pathnamehash' => $file->pathnamehash,
            'contenthash' => $file->contenthash,
        ], 'id');
        if ($existing) {
            return (int) $existing->id;
        }

        return (int) $DB->insert_record('local_kurspilot_cm_file', (object) [
            'pathnamehash' => $file->pathnamehash,
            'contenthash' => $file->contenthash,
            'component' => $file->component,
            'filearea' => $file->filearea,
            'itemid' => $file->itemid,
            'filepath' => $file->filepath,
            'filename' => $file->filename,
            'filesize' => $file->filesize,
            'mimetype' => (string) ($file->mimetype ?? ''),
            'timemodified' => $file->timemodified,
        ]);
    }
}
