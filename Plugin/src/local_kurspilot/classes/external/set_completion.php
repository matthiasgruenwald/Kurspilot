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

use coding_exception;
use completion_info;
use context_module;
use core_external\external_api;
use core_external\external_function_parameters;
use core_external\external_multiple_structure;
use core_external\external_single_structure;
use core_external\external_value;
use local_kurspilot\catalog\pseudofield_carry_forward;
use local_kurspilot\catalog\registry;
use moodle_exception;

defined('MOODLE_INTERNAL') || die();

/**
 * Der einzige Schreibweg fuer Vervollstaendigungsfelder (Spec 0015 §8,
 * Ticket #392): die fuenf "completion*"-Felder sind auf der Sperrliste von
 * update_module_settings/create_module (shared_block::BLOCKLIST) - ein
 * beilaeufiger Patch darf keine Lernendendaten loeschen koennen.
 *
 * Der Grund liegt in course/modlib.php::update_moduleinfo(): ohne
 * "completionunlocked" verwirft Moodle die Felder still (Zeile ~625: nur
 * innerhalb `if (!empty($moduleinfo->completionunlocked))` werden completion/
 * completionview/completionusegrade/completionpassgrade/
 * completiongradeitemnumber tatsaechlich geschrieben); mit "completionunlocked"
 * ruft dieselbe Funktion anschliessend IMMER
 * `completion_info::reset_all_state()` auf (Zeile ~745, unabhaengig davon, ob
 * sich ein Feld tatsaechlich geaendert hat) - das loescht bei manueller
 * Vervollstaendigung (COMPLETION_TRACKING_MANUAL) endgueltig jede
 * course_modules_completion-Zeile dieser Aktivitaet, bei automatischer
 * Vervollstaendigung werden sie geloescht und aus dem aktuellen Zustand neu
 * berechnet (lib/completionlib.php::reset_all_state()/delete_all_state()).
 *
 * "completionexpected" ist die einzige Ausnahme: Moodle schreibt es
 * unabhaengig vom Sperrzustand (modlib.php Zeile ~637, "does not affect users
 * who have completed the activity") - deshalb nie Teil des Datenverlust-
 * Zweitakts.
 *
 * Benannter Zweitakt (Spec 0015 §8): scheitert die Datenverlust-Pruefung
 * (bereits vorhandene Vervollstaendigungsdaten fuer diese cmid UND eine der
 * vier Sperrfeld-Werte aendert sich tatsaechlich) und ist `bestaetigt` nicht
 * ausdruecklich true, wird NICHTS geschrieben - die Meldung nennt die Anzahl
 * betroffener Lernender. Erst der zweite Aufruf mit `bestaetigt: true` fuehrt
 * aus. Ohne Datenverlustrisiko (keine vorhandenen Daten, oder nur
 * "completionexpected" geaendert) laeuft der Aufruf ohne Zweitakt durch.
 *
 * "completionunlocked" wird ausschliesslich hier und nur unmittelbar vor dem
 * bestaetigten Schreiben gesetzt - nie automatisch, nie in
 * update_module_settings/create_module (dort steht es auf der Sperrliste).
 *
 * @package    local_kurspilot
 * @copyright  2026 Kurspilot
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
final class set_completion extends external_api {

    /**
     * Von der Lehrkraft/KI ueber felder_json setzbare Vervollstaendigungsfelder
     * mit ihrem erlaubten Wertebereich (null = kein fester Wertebereich, z.B.
     * ein Zeitstempel). "completiongradeitemnumber" ist bewusst nicht dabei
     * (wie "cmidnumber" bei update_module_settings): es wird aus dem
     * Endzustand von "completionusegrade" abgeleitet (0 wenn
     * completionusegrade=1, sonst null - genau die Regel aus
     * course/modlib.php Zeile ~628-631).
     *
     * @var array<string, ?int[]>
     */
    private const ALLOWED_FIELDS = [
        'completion' => [0, 1, 2],
        'completionview' => [0, 1],
        'completionusegrade' => [0, 1],
        'completionpassgrade' => [0, 1],
        'completionexpected' => null,
    ];

    /**
     * Die vier Felder, deren tatsaechliche Aenderung "completionunlocked"
     * braucht (Sperrfelder) - und damit dem Datenverlust-Zweitakt unterliegen.
     * "completionexpected" ist ausgenommen (s. Klassendoku).
     *
     * @var string[]
     */
    private const LOCKED_FIELDS = ['completion', 'completionview', 'completionusegrade', 'completionpassgrade'];

    /**
     * @return external_function_parameters
     */
    public static function execute_parameters(): external_function_parameters {
        return new external_function_parameters([
            'cmid' => new external_value(PARAM_INT, 'Course module ID der Aktivitaet'),
            'felder_json' => new external_value(
                PARAM_RAW,
                'JSON-Objekt mit "completion" (0=aus,1=manuell,2=automatisch), "completionview", '
                    . '"completionusegrade", "completionpassgrade" und/oder "completionexpected" - nur die zu '
                    . 'aendernden Felder (Patch)'
            ),
            'bestaetigt' => new external_value(
                PARAM_BOOL,
                'true bestaetigt ausdruecklich das Loeschen bestehender Vervollstaendigungsdaten der Lernenden '
                    . '(zweiter Aufruf des Zweitakts). Beim ersten Aufruf weglassen oder false.',
                VALUE_DEFAULT,
                false
            ),
        ]);
    }

    /**
     * @param int $cmid
     * @param string $felderjson
     * @param bool $bestaetigt
     * @return array
     */
    public static function execute(int $cmid, string $felderjson, bool $bestaetigt = false): array {
        global $CFG, $DB;

        $params = self::validate_parameters(self::execute_parameters(), [
            'cmid' => $cmid,
            'felder_json' => $felderjson,
            'bestaetigt' => $bestaetigt,
        ]);

        $cm = get_coursemodule_from_id('', $params['cmid'], 0, false, MUST_EXIST);
        $context = context_module::instance($cm->id);
        self::validate_context($context);
        require_capability('local/kurspilot:use', $context);
        // Native Berechtigungspruefung im Kurskontext (Spec 0015 §3.3/§9.2),
        // identisch zu update_module_settings/create_module - keine eigene
        // Kurspilot-Schreib-Capability.
        require_capability('moodle/course:manageactivities', $context);

        $modname = (string) $cm->modname;
        $catalogclass = registry::for($modname);
        if ($catalogclass === null) {
            throw new moodle_exception(
                'unknownmodname',
                'local_kurspilot',
                '',
                ['modname' => $modname, 'aktivitaetsarten' => implode(', ', registry::known_modnames())]
            );
        }

        $patch = json_decode($params['felder_json'], true);
        if (!is_array($patch) || json_last_error() !== JSON_ERROR_NONE) {
            throw new moodle_exception('invalidpatchjson', 'local_kurspilot');
        }
        self::validate_patch($patch);

        $course = get_course((int) $cm->course);
        $completion = new completion_info($course);
        if (!$completion->is_enabled()) {
            // Ohne kurs-/instanzweit aktivierte Abschlussverfolgung wuerde
            // Moodle jedes dieser Felder ohnehin verwerfen (completionlib.php:
            // is_enabled()) - klare Meldung statt stillem No-op.
            throw new moodle_exception('completionnotenabled', 'local_kurspilot');
        }

        $before = self::read_settings($cmid);
        $changedlocked = self::changed_fields($before, $patch, self::LOCKED_FIELDS);
        $changedexpected = self::changed_fields($before, $patch, ['completionexpected']);

        if (!$changedlocked && !$changedexpected) {
            return [
                'cmid' => (int) $cmid,
                'modname' => (string) $cm->modname,
                'meldung' => 'Keine Aenderung: der Patch stimmte bereits mit dem aktuellen Stand ueberein.',
                'aenderungen' => [],
            ];
        }

        if ($changedlocked) {
            $betroffenelernende = (int) $DB->count_records('course_modules_completion', ['coursemoduleid' => $cmid]);
            if ($betroffenelernende > 0 && !$params['bestaetigt']) {
                // Erster Takt: melden, nicht ausfuehren (Spec 0015 §8).
                throw new moodle_exception(
                    'completiondatalossconfirmationrequired',
                    'local_kurspilot',
                    '',
                    ['betroffene_lernende' => $betroffenelernende]
                );
            }
        }

        require_once($CFG->dirroot . '/course/modlib.php');
        [, , , $moduleinfo] = \get_moduleinfo_data($cm, $course);
        pseudofield_carry_forward::apply($modname, $catalogclass, $moduleinfo, $before, $cm, $patch);
        self::apply_patch($moduleinfo, $before, $patch, (bool) $changedlocked);

        \update_moduleinfo($cm, $moduleinfo, $course);

        $after = self::read_settings($cmid);
        $changes = self::diff(array_merge($changedlocked, $changedexpected), $before, $after);

        return [
            'cmid' => (int) $cmid,
            'modname' => (string) $cm->modname,
            'meldung' => self::build_message($changes),
            'aenderungen' => $changes,
        ];
    }

    /**
     * Unbekanntes Feld oder Wert ausserhalb des erlaubten Bereichs scheitert
     * VOR jedem Schreibzugriff (alles-oder-nichts, wie update_module_settings).
     *
     * @param array $patch
     * @return void
     * @throws coding_exception|moodle_exception completionunknownfield|completioninvalidfieldvalue
     */
    private static function validate_patch(array $patch): void {
        foreach ($patch as $fieldname => $value) {
            if (!is_string($fieldname)) {
                throw new coding_exception('felder_json muss ein JSON-Objekt sein, kein Array.');
            }
            if (!array_key_exists($fieldname, self::ALLOWED_FIELDS)) {
                throw new moodle_exception('completionunknownfield', 'local_kurspilot', '', ['field' => $fieldname]);
            }
            if (!is_int($value)) {
                throw new moodle_exception(
                    'completioninvalidfieldvalue',
                    'local_kurspilot',
                    '',
                    ['field' => $fieldname, 'value' => json_encode($value)]
                );
            }
            $allowedvalues = self::ALLOWED_FIELDS[$fieldname];
            if ($allowedvalues !== null && !in_array($value, $allowedvalues, true)) {
                throw new moodle_exception(
                    'completioninvalidfieldvalue',
                    'local_kurspilot',
                    '',
                    ['field' => $fieldname, 'value' => json_encode($value)]
                );
            }
        }
    }

    /**
     * @param int $cmid
     * @return array Ist-Stand, dieselbe Form wie get_module_settings (enthaelt
     *         bereits alle fuenf completion*-Felder).
     */
    private static function read_settings(int $cmid): array {
        $result = get_module_settings::execute($cmid);
        return json_decode($result['settings_json'], true);
    }

    /**
     * Welche der genannten Felder patcht $patch UND aendert dabei tatsaechlich
     * den Wert gegenueber $before? Ein Patch, der den bestehenden Wert nur
     * wiederholt, loest weder den Zweitakt noch "completionunlocked" aus.
     *
     * @param array $before
     * @param array $patch
     * @param string[] $fields
     * @return string[]
     */
    private static function changed_fields(array $before, array $patch, array $fields): array {
        $changed = [];
        foreach ($fields as $field) {
            if (!array_key_exists($field, $patch)) {
                continue;
            }
            if ((int) ($before[$field] ?? 0) !== (int) $patch[$field]) {
                $changed[] = $field;
            }
        }
        return $changed;
    }

    /**
     * Ueberlagert $moduleinfo mit dem Endzustand (before + patch) fuer alle
     * fuenf Felder - "completiongradeitemnumber" wird aus dem Endzustand von
     * "completionusegrade" abgeleitet (course/modlib.php Zeile ~628-631).
     * "completionunlocked" wird NUR gesetzt, wenn sich mindestens ein
     * Sperrfeld tatsaechlich aendert - sonst bliebe "completionexpected" der
     * einzige Aenderungsgrund und Moodle riefe trotzdem
     * `reset_all_state()` auf, obwohl gar keine Sperrfeld-Aenderung vorliegt.
     *
     * @param \stdClass $moduleinfo Wird in-place ergaenzt.
     * @param array $before
     * @param array $patch
     * @param bool $lockedchanged
     * @return void
     */
    private static function apply_patch(\stdClass $moduleinfo, array $before, array $patch, bool $lockedchanged): void {
        $final = [];
        foreach (array_keys(self::ALLOWED_FIELDS) as $field) {
            $final[$field] = array_key_exists($field, $patch) ? (int) $patch[$field] : (int) ($before[$field] ?? 0);
        }

        $moduleinfo->completion = $final['completion'];
        $moduleinfo->completionview = $final['completionview'];
        $moduleinfo->completionexpected = $final['completionexpected'];
        $moduleinfo->completionusegrade = $final['completionusegrade'];
        $moduleinfo->completionpassgrade = $final['completionpassgrade'];
        $moduleinfo->completiongradeitemnumber = $final['completionusegrade'] ? 0 : null;

        if ($lockedchanged) {
            $moduleinfo->completionunlocked = 1;
        }
    }

    /**
     * Vorher-/Nachher-Werte je tatsaechlich geaendertem Feld - echter
     * Vorher-/Nachher-Vergleich wie update_module_settings::diff_and_side_effects().
     *
     * @param string[] $fields
     * @param array $before
     * @param array $after
     * @return array
     */
    private static function diff(array $fields, array $before, array $after): array {
        $changes = [];
        foreach (array_unique($fields) as $fieldname) {
            $oldvalue = $before[$fieldname] ?? null;
            $newvalue = $after[$fieldname] ?? null;
            if ($oldvalue != $newvalue) {
                $changes[] = [
                    'feld' => $fieldname,
                    'von_json' => json_encode($oldvalue, JSON_UNESCAPED_UNICODE),
                    'auf_json' => json_encode($newvalue, JSON_UNESCAPED_UNICODE),
                ];
            }
        }
        return $changes;
    }

    /**
     * @param array $changes
     * @return string
     */
    private static function build_message(array $changes): string {
        if (!$changes) {
            return 'Keine Aenderung: der Patch stimmte bereits mit dem aktuellen Stand ueberein.';
        }
        $parts = [];
        foreach ($changes as $change) {
            $parts[] = '"' . $change['feld'] . '" von ' . $change['von_json'] . ' auf ' . $change['auf_json'];
        }
        return 'Vervollstaendigung geaendert: ' . implode(', ', $parts) . '.';
    }

    /**
     * @return external_single_structure
     */
    public static function execute_returns(): external_single_structure {
        return new external_single_structure([
            'cmid' => new external_value(PARAM_INT, 'Course module ID'),
            'modname' => new external_value(PARAM_TEXT, 'Aktivitaetstyp'),
            'meldung' => new external_value(PARAM_RAW, 'Lehrkraft-deutsche Aenderungsmeldung'),
            'aenderungen' => new external_multiple_structure(
                new external_single_structure([
                    'feld' => new external_value(PARAM_TEXT, 'Feldname'),
                    'von_json' => new external_value(PARAM_RAW, 'JSON-kodierter Wert vor dem Schreiben'),
                    'auf_json' => new external_value(PARAM_RAW, 'JSON-kodierter Wert nach dem Schreiben'),
                ]),
                'Je tatsaechlich geaendertem Feld ein Eintrag'
            ),
        ]);
    }
}
