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
use context_module;
use core_external\external_api;
use core_external\external_function_parameters;
use core_external\external_multiple_structure;
use core_external\external_single_structure;
use core_external\external_value;
use local_kurspilot\catalog\module_catalog;
use local_kurspilot\catalog\pseudofield_carry_forward;
use local_kurspilot\catalog\registry;
use local_kurspilot\catalog\shared_block;
use local_kurspilot\write_gate;
use moodle_exception;

defined('MOODLE_INTERNAL') || die();

/**
 * Der erste Schreibvorgang (Spec 0015 §3.3, Ticket #388, Phase 3): patcht
 * einzelne Einstellungen einer bestehenden Aktivitaet ueber den nativen
 * Formularweg (get_moduleinfo_data() lesen, ueberlagern, update_moduleinfo()
 * schreiben) - kein Konfliktschutz, kein expected_version, eine parallele
 * Handaenderung an einem ANDEREN Feld ueberlebt (Spec 0015 §3.3).
 *
 * Alles oder nichts: jede Validierung (unbekanntes Feld, gesperrtes Feld,
 * unerlaubter Wert, Kombinationsregel) laeuft VOR dem einzigen Schreibaufruf
 * - kein Teilergebnis moeglich.
 *
 * Keine eigene Kurspilot-Schreib-Capability: get_moduleinfo_data() ruft
 * intern can_update_moduleinfo(), das 'moodle/course:manageactivities' im
 * Modulkontext verlangt - das ist die native Pruefung, die Spec 0015 §3.3
 * verlangt. 'local/kurspilot:use' bleibt die Basis-Zugriffspruefung wie bei
 * jedem anderen Werkzeug.
 *
 * Direkte DB-Schreibung wird bewusst nicht genutzt (ADR 0016): sie loest
 * kein course_module_updated aus, der Aenderungsverlauf (#385-387) bliebe
 * dafuer blind.
 *
 * @package    local_kurspilot
 * @copyright  2026 Kurspilot
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class update_module_settings extends external_api {

    /**
     * Modul-lokale Kombinationsregeln, die sich als einfacher
     * "$field darf/muss nicht vor $reference liegen"-Zeitvergleich pruefen
     * lassen (Spec 0015 §2.2 Kategorie 4 nennt die Regeln nur als Text fuer
     * describe_module_fields - Moodles eigene validation() laeuft auf dem
     * Formularweg nicht mit, also muss dieser Endpunkt sie selbst pruefen).
     *
     * ponytail: nur die Regeln der drei Aktivitaetsarten, deren
     * Kombinationsregeln reine Datumspaar-Vergleiche sind (forum, choice,
     * assign) - quiz wird ueber schreibweg() ohnehin ausgeschlossen, die
     * uebrigen Regeln (choice limit[]/option[]-Laenge, quiz
     * feedbackboundaries[]) sind keine einfachen Paarvergleiche und bleiben
     * vorerst nur dokumentiert statt erzwungen. Bei Bedarf erweitern, sobald
     * eine weitere Aktivitaetsart eine pruefbare Regel braucht.
     *
     * Die Verstoss-Meldung wird generisch aus reference/field/mode gebaut
     * (siehe {@see self::rule_violation_message()}) statt als eigener Text
     * dupliziert zu werden - sonst liefe sie beim naechsten Wortlaut-Update
     * der Katalogtexte in forum::combination_rules()/assign::combination_rules()
     * still auseinander.
     *
     * @var array<string, array<int, array{reference: string, field: string, mode: string}>>
     */
    private const DATE_ORDER_RULES = [
        'forum' => [
            ['reference' => 'duedate', 'field' => 'cutoffdate', 'mode' => 'not_before'],
        ],
        'choice' => [
            ['reference' => 'timeopen', 'field' => 'timeclose', 'mode' => 'not_before'],
        ],
        'assign' => [
            ['reference' => 'allowsubmissionsfromdate', 'field' => 'duedate', 'mode' => 'must_be_after'],
            ['reference' => 'duedate', 'field' => 'cutoffdate', 'mode' => 'not_before'],
            ['reference' => 'allowsubmissionsfromdate', 'field' => 'cutoffdate', 'mode' => 'not_before'],
            ['reference' => 'allowsubmissionsfromdate', 'field' => 'gradingduedate', 'mode' => 'must_be_after'],
        ],
    ];

    /**
     * Nebenwirkungen, die abhaengig vom neuen Feldwert ausdruecklich in der
     * Antwort ausgesprochen werden (Spec 0015 §3.3, Katalogkategorie 5) -
     * nur beim tatsaechlichen Wechsel auf den Ausloesewert (Moodle wiederholt
     * die Nebenwirkung nicht, wenn der Wert schon vorher galt, siehe
     * mod/forum/lib.php: `$oldforum->forcesubscribe <> $forum->forcesubscribe`).
     *
     * @var array<string, array<string, array<int|string, string>>>
     */
    private const SIDE_EFFECT_TRIGGERS = [
        'forum' => [
            'forcesubscribe' => [
                2 => 'Alle Kursteilnehmenden wurden für dieses Forum abonniert.',
            ],
        ],
    ];

    /**
     * @return external_function_parameters
     */
    public static function execute_parameters(): external_function_parameters {
        return new external_function_parameters([
            'cmid' => new external_value(PARAM_INT, 'Course module ID der Aktivitaet'),
            'felder_json' => new external_value(
                PARAM_RAW,
                'JSON-Objekt Feldname => neuer Wert - nur die zu aendernden Felder (Patch, kein Vollstand)'
            ),
        ]);
    }

    /**
     * @param int $cmid
     * @param string $felderjson
     * @return array
     */
    public static function execute(int $cmid, string $felderjson): array {
        global $CFG;

        $params = self::validate_parameters(self::execute_parameters(), [
            'cmid' => $cmid,
            'felder_json' => $felderjson,
        ]);

        $cm = get_coursemodule_from_id('', $params['cmid'], 0, false, MUST_EXIST);
        $context = context_module::instance($cm->id);
        self::validate_context($context);
        require_capability('local/kurspilot:use', $context);
        // Native Berechtigungspruefung vorgezogen (Spec 0015 §3.3: "im Kurs
        // einer Kollegin: lesen ja, schreiben nein - mit klarer Meldung").
        // get_moduleinfo_data() prueft dieselbe Capability spaeter ohnehin
        // erneut ueber can_update_moduleinfo() - der Aufruf hier ist billig
        // (nur require_capability(), kein DB-Zugriff) und stellt sicher, dass
        // eine fehlende Bearbeiten-Berechtigung nicht hinter einer
        // Feldvalidierungsmeldung versteckt bleibt.
        require_capability('moodle/course:manageactivities', $context);

        $modname = (string) $cm->modname;
        $catalogclass = self::catalog_for($modname);
        // Billigteil der Selbstfreigabe (Spec 0015 §11, ADR 0017, Ticket #399):
        // sperrt nur DIESE Aktivitaetsart, wenn ein erkannter Moodle-Versionswechsel
        // eine Katalogabweichung ergeben hat. Lesen bleibt unberuehrt (kein
        // Lese-Werkzeug ruft assert_writable() auf).
        write_gate::assert_writable($modname);

        $patch = json_decode($params['felder_json'], true);
        if (!is_array($patch) || json_last_error() !== JSON_ERROR_NONE) {
            throw new moodle_exception('invalidpatchjson', 'local_kurspilot');
        }

        $before = self::read_settings($cmid);
        self::validate_patch($modname, $catalogclass, $before, $patch);

        $course = get_course((int) $cm->course);
        require_once($CFG->dirroot . '/course/modlib.php');
        // get_moduleinfo_data() gibt das Tupel [cm, context, module, data, cw]
        // zurueck (course/modlib.php) - "data" (Positon 3) ist das
        // Formularweg-Feldobjekt, das ueberlagert und zurueckgeschrieben wird.
        [, , , $moduleinfo] = \get_moduleinfo_data($cm, $course);
        pseudofield_carry_forward::apply($modname, $catalogclass, $moduleinfo, $before, $cm, $patch);
        foreach ($patch as $fieldname => $value) {
            $moduleinfo->{self::moduleinfo_property($fieldname)} = $value;
        }

        \update_moduleinfo($cm, $moduleinfo, $course);

        $after = self::read_settings($cmid);
        [$changes, $sideeffects] = self::diff_and_side_effects($modname, $patch, $before, $after);

        return [
            'cmid' => (int) $cmid,
            'modname' => $modname,
            'meldung' => self::build_message($changes, $sideeffects),
            'aenderungen' => $changes,
            'nebenwirkungen' => $sideeffects,
        ];
    }

    /**
     * Katalogfeldname => tatsaechlicher $moduleinfo-Eigenschaftsname -
     * identische Abbildung wie {@see create_module::moduleinfo_property()}.
     * Einzige Ausnahme "idnumber": get_moduleinfo_data() liefert das
     * Feldobjekt bereits mit der realen Formularweg-Eigenschaft
     * "cmidnumber" (course/modlib.php: `$data->cmidnumber = $cm->idnumber`),
     * update_moduleinfo() liest ebenso nur `$moduleinfo->cmidnumber`
     * (course/modlib.php:70) - ein Patch, der stattdessen "idnumber" auf das
     * Objekt schreibt, würde folgenlos verpuffen (das ungenutzte
     * "cmidnumber" bliebe unveraendert). "idnumber" bleibt trotzdem der
     * lehrkraftverstaendliche Katalogname (Spec 0015 §2.3, Ticket #390).
     *
     * @param string $fieldname
     * @return string
     */
    private static function moduleinfo_property(string $fieldname): string {
        return $fieldname === 'idnumber' ? 'cmidnumber' : $fieldname;
    }

    /**
     * Die Katalogklasse fuer $modname, sofern der Schreibweg dieser Endpunkt
     * ist (Spec 0015 §3.1: manche Aktivitaetsarten haben ein eigenes
     * Einzelwerkzeug, z.B. quiz -> update_quiz_settings).
     *
     * @param string $modname
     * @return class-string<module_catalog>
     * @throws moodle_exception unknownmodname|writevehicleblocked
     */
    private static function catalog_for(string $modname): string {
        $catalogclass = registry::for($modname);
        if ($catalogclass === null) {
            throw new moodle_exception(
                'unknownmodname',
                'local_kurspilot',
                '',
                ['modname' => $modname, 'aktivitaetsarten' => implode(', ', registry::known_modnames())]
            );
        }
        $schreibweg = $catalogclass::schreibweg();
        if ($schreibweg !== null) {
            throw new moodle_exception(
                'writevehicleblocked',
                'local_kurspilot',
                '',
                ['modname' => $modname, 'schreibweg' => $schreibweg]
            );
        }
        return $catalogclass;
    }

    /**
     * Ist-Stand als assoziatives Array - dieselbe Zusammenstellung wie
     * {@see get_module_settings}, ueber deren settings_json wiederverwendet
     * statt dupliziert (Ticket #384: "gleiche Bauform fuer Read-Teil
     * wiederverwendbar").
     *
     * @param int $cmid
     * @return array
     */
    private static function read_settings(int $cmid): array {
        $result = get_module_settings::execute($cmid);
        return json_decode($result['settings_json'], true);
    }

    /**
     * Alles-oder-nichts-Pruefung VOR dem Schreiben: unbekanntes Feld,
     * gesperrtes Feld, unerlaubter Wert, verletzte Kombinationsregel.
     *
     * @param string $modname
     * @param class-string<module_catalog> $catalogclass
     * @param array $before Ist-Stand vor dem Patch (fuer Kombinationsregeln).
     * @param array $patch
     * @return void
     * @throws moodle_exception blockedfield|unknownfield|invalidfieldvalue|combinationruleviolation|stealthnotallowed
     */
    private static function validate_patch(string $modname, string $catalogclass, array $before, array $patch): void {
        $blocklist = array_unique(array_merge(shared_block::BLOCKLIST, $catalogclass::blocklist()));

        $settablefields = array_merge(
            shared_block::fields(),
            $catalogclass::fields(),
            $catalogclass::pseudofields()
        );
        $fieldsbyname = [];
        foreach ($settablefields as $settablefield) {
            $fieldsbyname[$settablefield->name] = $settablefield;
        }

        foreach ($patch as $fieldname => $value) {
            if (!is_string($fieldname)) {
                throw new coding_exception('felder_json muss ein JSON-Objekt sein, kein Array.');
            }
            if (in_array($fieldname, $blocklist, true)) {
                throw new moodle_exception(
                    'blockedfield',
                    'local_kurspilot',
                    '',
                    ['field' => $fieldname, 'modname' => $modname]
                );
            }
            if (!array_key_exists($fieldname, $fieldsbyname)) {
                throw new moodle_exception(
                    'unknownfield',
                    'local_kurspilot',
                    '',
                    ['field' => $fieldname, 'modname' => $modname]
                );
            }

            $field = $fieldsbyname[$fieldname];
            if ($field->values !== null && !in_array($value, $field->values, false)) {
                throw new moodle_exception(
                    'invalidfieldvalue',
                    'local_kurspilot',
                    '',
                    ['field' => $fieldname, 'modname' => $modname, 'value' => json_encode($value)]
                );
            }
        }

        self::validate_combination_rules($modname, $before, $patch);
        self::assert_stealth_allowed($patch);
    }

    /**
     * Stealth (Spec 0015 §7, Ticket #390) setzt voraus, dass die Instanz
     * "allowstealth" erlaubt - sonst ignoriert Moodles eigener Formularweg
     * visibleoncoursepage=0 kommentarlos (course/modlib.php:
     * set_moduleinfo_defaults() faellt auf 1 zurueck), der Schreibvorgang
     * wuerde also still wirkungslos bleiben statt zu scheitern. Nur der
     * Zielwert 0 ist betroffen - visibleoncoursepage=1 (zurueck auf normal)
     * bleibt immer erlaubt.
     *
     * @param array $patch
     * @return void
     * @throws moodle_exception stealthnotallowed
     */
    private static function assert_stealth_allowed(array $patch): void {
        if (($patch['visibleoncoursepage'] ?? null) !== 0) {
            return;
        }
        if (get_config(null, 'allowstealth')) {
            return;
        }
        throw new moodle_exception('stealthnotallowed', 'local_kurspilot');
    }

    /**
     * @param string $modname
     * @param array $before
     * @param array $patch
     * @return void
     * @throws moodle_exception combinationruleviolation
     */
    private static function validate_combination_rules(string $modname, array $before, array $patch): void {
        $rules = self::DATE_ORDER_RULES[$modname] ?? [];
        if (!$rules) {
            return;
        }

        $merged = array_merge($before, $patch);
        foreach ($rules as $rule) {
            // Nur pruefen, wenn der Patch tatsaechlich eines der beiden
            // Felder beruehrt - unveraendert bleibende, bereits vorhandene
            // Altdaten werden durch einen unabhaengigen Patch nicht neu
            // bewertet.
            if (!array_key_exists($rule['reference'], $patch) && !array_key_exists($rule['field'], $patch)) {
                continue;
            }
            $reference = (int) ($merged[$rule['reference']] ?? 0);
            $value = (int) ($merged[$rule['field']] ?? 0);
            if ($reference === 0 || $value === 0) {
                continue;
            }

            $violated = $rule['mode'] === 'must_be_after' ? ($value <= $reference) : ($value < $reference);
            if ($violated) {
                throw new moodle_exception(
                    'combinationruleviolation',
                    'local_kurspilot',
                    '',
                    ['modname' => $modname, 'message' => self::rule_violation_message($rule)]
                );
            }
        }
    }

    /**
     * Generischer Verstoss-Text aus reference/field/mode statt eines
     * separat gepflegten Zitats der Katalogtexte (DRY, siehe
     * {@see self::DATE_ORDER_RULES}).
     *
     * @param array{reference: string, field: string, mode: string} $rule
     * @return string
     */
    private static function rule_violation_message(array $rule): string {
        return $rule['mode'] === 'must_be_after'
            ? '"' . $rule['field'] . '" muss nach "' . $rule['reference'] . '" liegen.'
            : '"' . $rule['field'] . '" darf nicht vor "' . $rule['reference'] . '" liegen.';
    }

    /**
     * Vorher-/Nachher-Werte je tatsaechlich geaendertem Feld, plus
     * ausgeloeste Nebenwirkungen - aus einem echten Vorher-/Nachher-Vergleich
     * (nicht aus dem Patch selbst uebernommen), damit eine parallele
     * Handaenderung an einem anderen Feld korrekt unerwaehnt bleibt und ein
     * Patch, der den bestehenden Wert nur wiederholt, nicht als Aenderung
     * gemeldet wird.
     *
     * @param string $modname
     * @param array $patch
     * @param array $before
     * @param array $after
     * @return array{0: array, 1: string[]}
     */
    private static function diff_and_side_effects(string $modname, array $patch, array $before, array $after): array {
        $changes = [];
        $sideeffects = [];
        $triggers = self::SIDE_EFFECT_TRIGGERS[$modname] ?? [];

        foreach (array_keys($patch) as $fieldname) {
            $oldvalue = $before[$fieldname] ?? null;
            $newvalue = $after[$fieldname] ?? null;
            if ($oldvalue != $newvalue) {
                $changes[] = [
                    'feld' => $fieldname,
                    'von_json' => json_encode($oldvalue, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
                    'auf_json' => json_encode($newvalue, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
                ];
            }

            if (isset($triggers[$fieldname][$newvalue]) && $oldvalue != $newvalue) {
                $sideeffects[] = $triggers[$fieldname][$newvalue];
            }
        }

        return [$changes, $sideeffects];
    }

    /**
     * Die Lehrkraft-deutsche Aenderungsmeldung (Spec 0015 §3.3: "die Antwort
     * ist die Aenderungsmeldung").
     *
     * @param array $changes
     * @param string[] $sideeffects
     * @return string
     */
    private static function build_message(array $changes, array $sideeffects): string {
        if (!$changes) {
            return 'Keine Aenderung: der Patch stimmte bereits mit dem aktuellen Stand ueberein.';
        }

        $parts = [];
        foreach ($changes as $change) {
            $parts[] = '"' . $change['feld'] . '" von ' . $change['von_json'] . ' auf ' . $change['auf_json'];
        }
        $message = 'Geaendert: ' . implode(', ', $parts) . '.';

        if ($sideeffects) {
            $message .= ' ' . implode(' ', $sideeffects);
        }

        return $message;
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
            'nebenwirkungen' => new external_multiple_structure(
                new external_value(PARAM_TEXT, 'Nebenwirkungsvermerk in Lehrkraft-Deutsch'),
                'Ausgeloeste Nebenwirkungen aus Katalogkategorie 5, leer wenn keine ausgeloest wurden'
            ),
        ]);
    }
}
