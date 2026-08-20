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
 * Datenschutz-Vertrag der Kurspilot-Oberflaeche (Karte #289, Ticket #300).
 *
 * Kurspilot gibt ausschliesslich lehrkraftbezogene Kursgestaltung frei. Von
 * Lernenden erzeugte oder personenbezogene Daten (Abgaben, Forenbeitraege,
 * Quizversuche, Bewertungen, Teilnehmendenlisten) sind weder ueber MCP-Tools
 * noch ueber Moodle-Webservices erreichbar.
 *
 * Eine Prueffunktion, drei Aufrufer (#300, Punkte 1/5/6):
 *  - Test:     tests/privacy_surface_test.php prueft gegen die real
 *              registrierte Oberflaeche einer laufenden Instanz.
 *  - Laufzeit: mcp.php listet und ruft nur Gelistetes.
 *  - Anzeige:  surface.php zeigt Allowlist, verbotene Bestandteile und
 *              Abgleichstatus.
 *
 * Reine Datenstruktur plus reine Funktionen - kein Moodle-Zugriff ausser in
 * registered_functions(), damit die Prueflogik selbst testbar bleibt.
 *
 * @package    local_kurspilot
 * @copyright  2026 Kurspilot
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class privacy_surface {

    /** @var string Shortname des externen Dienstes aus db/services.php. */
    public const SERVICE_SHORTNAME = 'kurspilot';

    /**
     * Positive Allowlist: MCP-Toolname => Webservice-Funktionsname.
     *
     * Einzige Wahrheit der Oberflaeche. Ein neues Tool ist nur nach
     * ausdruecklicher Pruefung zulaessig - der Vertragstest scheitert,
     * solange ein registrierter Name hier fehlt oder umgekehrt.
     *
     * @var array<string, string>
     */
    public const ALLOWED_TOOLS = [
        'kurspilot_list_courses' => 'local_kurspilot_list_courses',
        'kurspilot_get_course_catalog' => 'local_kurspilot_get_course_catalog',
        'kurspilot_get_modules' => 'local_kurspilot_get_modules',
        'kurspilot_get_sections' => 'local_kurspilot_get_sections',
        'kurspilot_get_question_categories' => 'local_kurspilot_get_question_categories',
        'kurspilot_get_question' => 'local_kurspilot_get_question',
        'kurspilot_plan_quiz_cleanup' => 'local_kurspilot_get_quiz_cleanup_plan',
        'kurspilot_list_context_files' => 'local_kurspilot_list_context_files',
        'kurspilot_read_context_file' => 'local_kurspilot_read_context_file',
    ];

    /**
     * Namensbestandteile, die in keinem registrierten Namen vorkommen duerfen.
     *
     * Sie bezeichnen Lernendendaten- oder Personenoberflaechen. Der
     * Geltungsbereich sind **registrierte Namen** (Tools, Webservice-
     * Funktionen), nicht intern aufgerufene PHP-Funktionen: ein
     * enrol_get_my_courses() im Rumpf einer erlaubten Funktion ist zulaessig
     * (#300, Punkt 3).
     *
     * "discussion" statt "forum": das Anlegen einer Forum-Aktivitaet ist
     * erlaubte Kursgestaltung, das Lesen von Beitraegen nicht - Moodles
     * forum-lesende Webservices heissen durchgaengig "...discussion(s)/...posts".
     *
     * @var string[]
     */
    public const FORBIDDEN_TOKENS = [
        'submission',
        'discussion',
        'attempt',
        'participant',
        'enrol',
        'grade',
        'user',
    ];

    /**
     * Ist dieser MCP-Toolname freigegeben?
     *
     * @param string $toolname
     * @return bool
     */
    public static function is_allowed_tool(string $toolname): bool {
        return isset(self::ALLOWED_TOOLS[$toolname]);
    }

    /**
     * Webservice-Funktion zu einem freigegebenen Toolnamen.
     *
     * @param string $toolname
     * @return string|null null, wenn der Toolname nicht freigegeben ist.
     */
    public static function function_for_tool(string $toolname): ?string {
        return self::ALLOWED_TOOLS[$toolname] ?? null;
    }

    /**
     * Die Webservice-Funktionen, die auf der laufenden Instanz tatsaechlich
     * am Kurspilot-Dienst haengen.
     *
     * Das ist der Fall, den kein Repo-Test fangen kann: ein Admin haengt dem
     * Dienst nachtraeglich eine Funktion an (#300, Punkt 1).
     *
     * @return string[] sortierte Funktionsnamen; leer, wenn der Dienst fehlt.
     */
    public static function registered_functions(): array {
        global $DB;

        $service = $DB->get_record('external_services', ['shortname' => self::SERVICE_SHORTNAME]);
        if (!$service) {
            return [];
        }
        $names = $DB->get_fieldset_select(
            'external_services_functions',
            'functionname',
            'externalserviceid = :id',
            ['id' => $service->id]
        );
        sort($names);
        return $names;
    }

    /**
     * Gleicht die real registrierte Oberflaeche gegen die Allowlist und die
     * verbotenen Namensbestandteile ab.
     *
     * Rein: bekommt die registrierte Liste herein, greift selbst nicht auf
     * Moodle zu. Test, Laufzeit und Anzeige rufen dieselbe Funktion.
     *
     * @param string[] $registered Real registrierte Webservice-Funktionsnamen.
     * @return array<int, array{type: string, name: string, detail: string}>
     *         Leer, wenn die Oberflaeche dem Vertrag entspricht.
     */
    public static function check(array $registered): array {
        $violations = [];
        $allowed = array_values(self::ALLOWED_TOOLS);

        foreach (array_diff($registered, $allowed) as $name) {
            $violations[] = [
                'type' => 'unexpected',
                'name' => $name,
                'detail' => 'Registriert, aber nicht in der Allowlist.',
            ];
        }

        foreach (array_diff($allowed, $registered) as $name) {
            $violations[] = [
                'type' => 'missing',
                'name' => $name,
                'detail' => 'In der Allowlist, aber nicht registriert.',
            ];
        }

        // Verbotene Bestandteile gelten fuer beide Namensraeume: die
        // registrierten Funktionen und die nach aussen sichtbaren Toolnamen.
        $checknames = array_unique(array_merge($registered, array_keys(self::ALLOWED_TOOLS), $allowed));
        foreach ($checknames as $name) {
            foreach (self::FORBIDDEN_TOKENS as $token) {
                if (strpos(strtolower($name), $token) !== false) {
                    $violations[] = [
                        'type' => 'forbidden_token',
                        'name' => $name,
                        'detail' => 'Enthaelt den verbotenen Bestandteil "' . $token . '".',
                    ];
                }
            }
        }

        return $violations;
    }
}
