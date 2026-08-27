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
 * Die einzige Werkzeug-Registrierung (#378, Prefactor vor Spec 0015 Phase 1).
 *
 * Vorher: ein Werkzeug wurde an vier auseinanderlaufenden Stellen eingetragen
 * (db/services.php, dispatcher::TOOL_DESCRIPTIONS, dispatcher::TOOL_SCHEMAS,
 * privacy_surface::ALLOWED_TOOLS). Jetzt: ein Eintrag hier je Werkzeug, die
 * vier Listen werden daraus abgeleitet. Aus Lehrkraft-/Client-Sicht aendert
 * sich nichts - dieselben neun Werkzeuge, dieselben Beschreibungen, dieselben
 * Schemata.
 *
 * Reine Datenstruktur plus reine Ableitungsfunktionen - kein Moodle-Zugriff.
 *
 * @package    local_kurspilot
 * @copyright  2026 Kurspilot
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
final class tool_registry {

    /**
     * Ein Eintrag je Werkzeug: MCP-Toolname => Webservice-Funktionsname,
     * externe Klasse, Moodle-Dienstbeschreibung, MCP-Beschreibung,
     * inputSchema (properties/required) und Capability fuer
     * db/services.php.
     *
     * wsdescription vs. description: unterschiedliche Zielgruppen, nicht
     * dieselbe Angabe zweimal. wsdescription ist Moodles Webservice-
     * Beschreibung (Site administration > Server > Web services, englisch
     * wie die uebrigen Moodle-Kernfunktionen). description ist der
     * MCP-Werkzeugtext, den die Lehrkraft im Client sieht (deutsch, siehe
     * CLAUDE.md: UI-/CLI-sichtbare Strings deutsch).
     *
     * @var array<string, array{
     *     function: string,
     *     classname: string,
     *     wsdescription: string,
     *     description: string,
     *     schema: ?array{properties: array, required?: array},
     *     capability: ?string,
     *     write?: bool,
     * }>
     */
    private const TOOLS = [
        'kurspilot_list_courses' => [
            'function' => 'local_kurspilot_list_courses',
            'classname' => 'local_kurspilot\external\list_courses',
            'wsdescription' => 'Lists the courses the calling teacher may use Kurspilot in.',
            'description' => 'Listet die Moodle-Kurse, in denen die angemeldete Lehrkraft Kurspilot nutzen darf.',
            'schema' => null,
            'capability' => 'local/kurspilot:use',
        ],
        'kurspilot_get_course_catalog' => [
            'function' => 'local_kurspilot_get_course_catalog',
            'classname' => 'local_kurspilot\external\get_course_catalog',
            'wsdescription' => 'Reads a compact, filterable Moodle course catalog (sections, content, completion, '
                . 'restrictions) for course planning.',
            'description' => 'Liest eine kompakte, filterbare Moodle-Katalogansicht: Abschnitte, sichtbare '
                . 'Inhalte, Teststruktur, Sichtbarkeit, Abschluss und Voraussetzungen. Quelle ist klar als "aus Moodle '
                . 'gelesen" markiert; detail="full" liefert gezielt Vollinhalte, "compact" (Standard) nur eine Vorschau. '
                . 'Eine Beschraenkung auf ein Profilmerkmal (z.B. Fachgruppe) erscheint maskiert: Typ, Feld und Operator '
                . 'bleiben sichtbar, der Wert ist ersetzt. Gruppennamen werden nie geliefert, nur Gruppenmodus und '
                . 'Kennungen (cmid/sectionnum) - eine Gruppierung ist nur dann anzunehmen, wenn die Lehrkraft sie '
                . 'ausdruecklich nennt, niemals erraten.',
            'schema' => [
                'properties' => [
                    'courseid' => ['type' => 'number', 'description' => 'Kurs-ID'],
                    'sectionnum' => ['type' => 'number', 'description' => 'Abschnittsnummer (0-basiert, -1 = alle Abschnitte)'],
                    'modname' => ['type' => 'string', 'description' => 'Optionaler Aktivitaetstyp-Filter, z.B. page, label, assign, quiz, url'],
                    'detail' => ['type' => 'string', 'enum' => ['compact', 'full'], 'description' => 'compact = Vorschau, full = Vollinhalte'],
                ],
                'required' => ['courseid'],
            ],
            'capability' => 'local/kurspilot:use',
        ],
        'kurspilot_get_modules' => [
            'function' => 'local_kurspilot_get_modules',
            'classname' => 'local_kurspilot\external\get_modules',
            'wsdescription' => 'Lists the activities of a course or section (cmid, type, name) for targeted access.',
            'description' => 'Gibt alle Aktivitaeten eines Kurses oder Abschnitts zurueck - mit cmid, Typ und '
                . 'Name. Verwenden um cmids fuer gezielte Zugriffe zu ermitteln.',
            'schema' => [
                'properties' => [
                    'courseid' => ['type' => 'number', 'description' => 'Kurs-ID'],
                    'sectionnum' => ['type' => 'number', 'description' => 'Abschnittsnummer (0-basiert, -1 = alle Abschnitte)'],
                ],
                'required' => ['courseid'],
            ],
            'capability' => 'local/kurspilot:use',
        ],
        'kurspilot_get_module_settings' => [
            'function' => 'local_kurspilot_get_module_settings',
            'classname' => 'local_kurspilot\external\get_module_settings',
            'wsdescription' => 'Reads the full current state of one activity as get_moduleinfo_data() would '
                . 'return it, for update_module_settings to build a patch on top of.',
            'description' => 'Liefert den vollstaendigen Ist-Stand einer einzelnen Aktivitaet als JSON - '
                . 'dieselbe Form, die eine spaetere Aenderung zuruecknimmt. Kein eigenes Kurspilot-Schema, keine '
                . 'Markdown-Zusammenfassung: die KI liest die rohen Moodle-Feldnamen. coursepagevisibility, '
                . 'visibleoncoursepage und availability_status heissen wie in get_course_catalog/get_modules. '
                . 'Eine Beschraenkung auf ein Profilmerkmal erscheint maskiert: Typ, Feld und Operator bleiben '
                . 'sichtbar, der Wert ist ersetzt. Vor einer Aenderung aufrufen statt eine bestehende Einstellung '
                . 'anzunehmen.',
            'schema' => [
                'properties' => [
                    'cmid' => ['type' => 'number', 'description' => 'Course module ID der Aktivitaet'],
                ],
                'required' => ['cmid'],
            ],
            'capability' => 'local/kurspilot:use',
        ],
        'kurspilot_update_module_settings' => [
            'function' => 'local_kurspilot_update_module_settings',
            'classname' => 'local_kurspilot\external\update_module_settings',
            'wsdescription' => 'Patches individual settings of an existing activity via update_moduleinfo() - '
                . 'only the transmitted fields change, everything else survives untouched.',
            'description' => 'Aendert einzelne Einstellungen einer bestehenden Aktivitaet - ein Patch: nur die '
                . 'uebergebenen Felder aendern sich, alle uebrigen bleiben unangetastet. Vorher get_module_settings '
                . 'aufrufen statt einen Wert zu erraten. Unbekannter Feldname, unerlaubter Wert, gesperrtes Feld '
                . 'oder verletzte Kombinationsregel: nichts wird geschrieben, die Meldung nennt das betroffene Feld '
                . 'und verweist auf describe_module_fields. Die Antwort nennt Vorher- und Nachher-Wert je '
                . 'geaendertem Feld und spricht ausgeloeste Nebenwirkungen ausdruecklich aus (z.B. "Alle '
                . 'Kursteilnehmenden wurden fuer dieses Forum abonniert"). Geprueft wird die native '
                . 'Moodle-Bearbeiten-Berechtigung im Kurs, keine eigene Kurspilot-Schreibrechte.',
            'schema' => [
                'properties' => [
                    'cmid' => ['type' => 'number', 'description' => 'Course module ID der Aktivitaet'],
                    'felder_json' => [
                        'type' => 'string',
                        'description' => 'JSON-Objekt Feldname => neuer Wert, nur die zu aendernden Felder',
                    ],
                ],
                'required' => ['cmid', 'felder_json'],
            ],
            'capability' => 'local/kurspilot:use',
            'write' => true,
        ],
        'kurspilot_get_sections' => [
            'function' => 'local_kurspilot_get_sections',
            'classname' => 'local_kurspilot\external\get_sections',
            'wsdescription' => 'Lists the sections of a course (id, number, name) for targeted access.',
            'description' => 'Gibt alle Abschnitte eines Moodle-Kurses zurueck (Name, Nummer, ID).',
            'schema' => [
                'properties' => [
                    'courseid' => ['type' => 'number', 'description' => 'Die Kurs-ID (steht in der URL: ?id=XX)'],
                ],
                'required' => ['courseid'],
            ],
            'capability' => 'local/kurspilot:use',
        ],
        'kurspilot_get_question_categories' => [
            'function' => 'local_kurspilot_get_question_categories',
            'classname' => 'local_kurspilot\external\get_question_categories',
            'wsdescription' => 'Lists the question bank categories of a named question bank, for reuse instead of '
                . 'duplication.',
            'description' => 'Listet alle Fragenbank-Kategorien der ausgewaehlten benannten '
                . 'Kurs-/Projekt-Fragensammlung (inkl. der Top-Kategorie) mit id, Name und uebergeordneter '
                . 'Kategorie-ID - fuer Wiederverwendung statt Doppelanlage.',
            'schema' => [
                'properties' => [
                    'courseid' => ['type' => 'number', 'description' => 'Kurs-ID'],
                    'questionbankid' => ['type' => 'number', 'description' => 'ID der benannten Fragensammlung (CMID)'],
                ],
                'required' => ['courseid', 'questionbankid'],
            ],
            'capability' => 'local/kurspilot:use',
        ],
        'kurspilot_get_question' => [
            'function' => 'local_kurspilot_get_question',
            'classname' => 'local_kurspilot\external\get_question',
            'wsdescription' => 'Reads the latest version of a single question, identified by name or questionid.',
            'description' => 'Liefert die latest version einer Frage in einer Kategorie - eindeutig '
                . 'identifiziert per Name ODER per questionid. Vor einer Bearbeitung aufrufen, um die aktuelle '
                . 'questionid und questionbankentryid zu kennen.',
            'schema' => [
                'properties' => [
                    'categoryid' => ['type' => 'number', 'description' => 'ID der Fragenbank-Kategorie'],
                    'name' => ['type' => 'string', 'description' => 'Name der Frage (alternativ zu questionid)'],
                    'questionid' => ['type' => 'number', 'description' => 'questionid einer beliebigen Version der Frage (alternativ zu name)'],
                ],
                'required' => ['categoryid'],
            ],
            'capability' => 'local/kurspilot:use',
        ],
        'kurspilot_plan_quiz_cleanup' => [
            'function' => 'local_kurspilot_get_quiz_cleanup_plan',
            'classname' => 'local_kurspilot\external\get_quiz_cleanup_plan',
            'wsdescription' => 'Builds a manual, non-destructive cleanup plan for obsolete quiz slots - names '
                . 'findings and links, deletes nothing.',
            'description' => 'Plant eine manuelle Bereinigung, wenn eine neue Quizversion weniger '
                . 'Fragen enthaelt. Kurspilot loescht weder Quiz-Slots noch Fragen: Die Antwort nennt jeden '
                . 'betroffenen Slot, Frage und Kategorie sowie den direkten Moodle-Link. Dort nur aus dem Quiz '
                . 'entfernen, nicht aus der Fragensammlung loeschen; die Fragen bleiben wiederverwendbar.',
            'schema' => [
                'properties' => [
                    'cmid' => ['type' => 'number', 'description' => 'Course module ID des Quiz'],
                    'keep_questionbankentryids' => [
                        'type' => 'array',
                        'items' => ['type' => 'number'],
                        'description' => 'questionbankentryid-Werte, die in der neuen Quizversion verbleiben; alle anderen Slots werden ausschliesslich als manuelle Schritte ausgegeben.',
                    ],
                ],
                'required' => ['cmid', 'keep_questionbankentryids'],
            ],
            'capability' => 'local/kurspilot:use',
        ],
        'kurspilot_list_context_files' => [
            'function' => 'local_kurspilot_list_context_files',
            'classname' => 'local_kurspilot\external\list_context_files',
            'wsdescription' => 'Lists the calling teacher\'s Kurspilot context area (own working area only).',
            'description' => 'Listet den eigenen Kontextbereich der angemeldeten Lehrkraft auf '
                . '(Lerngruppenprofile, Fachprofile, gemerkte Vorlagen). "path" waehlt optional einen Unterordner, leer '
                . 'liefert die Wurzel. Nur der eigene Bereich der aufrufenden Person ist erreichbar.',
            'schema' => [
                'properties' => [
                    'path' => ['type' => 'string', 'description' => 'Optionaler Unterordner, leer fuer die Wurzel'],
                ],
            ],
            'capability' => null,
        ],
        'kurspilot_describe_module_fields' => [
            'function' => 'local_kurspilot_describe_module_fields',
            'classname' => 'local_kurspilot\external\describe_module_fields',
            'wsdescription' => 'Reads the field catalog for a module type (fields, presets) or, without a '
                . 'modname, the list of module types Kurspilot catalogs at all.',
            'description' => 'Liefert den Feldkatalog: was eine Aktivitaetsart einstellen kann, mit deutscher '
                . 'Bedeutung je Feld statt englischer Namen ohne Erklaerung. Ohne "modname" die Liste der von '
                . 'Kurspilot gefuehrten Aktivitaetsarten (z.B. label). Mit "modname" die haeufig gesetzten Felder '
                . 'plus Feldbuendel und einen Hinweis, dass es mehr gibt; mit "vollstaendig": true zusaetzlich '
                . 'Pseudofelder, Sperrliste, Kombinationsregeln und Nebenwirkungsvermerke. Rein lesend.',
            'schema' => [
                'properties' => [
                    'modname' => ['type' => 'string', 'description' => 'Aktivitaetstyp, z.B. label. Leer fuer die Liste der gefuehrten Arten'],
                    'vollstaendig' => ['type' => 'boolean', 'description' => 'true fuer alle fuenf Katalogkategorien'],
                ],
            ],
            'capability' => null,
        ],
        'kurspilot_read_context_file' => [
            'function' => 'local_kurspilot_read_context_file',
            'classname' => 'local_kurspilot\external\read_context_file',
            'wsdescription' => 'Reads one file from the calling teacher\'s Kurspilot context area (own working '
                . 'area only).',
            'description' => 'Liest eine einzelne Datei aus dem eigenen Kontextbereich der angemeldeten '
                . 'Lehrkraft, z.B. "vorlagen.md" an der Wurzel fuer gemerkte Vorlagenentscheidungen. Rein lesend - '
                . 'Schreiben ist ueber dieses Werkzeug nicht moeglich.',
            'schema' => [
                'properties' => [
                    'path' => ['type' => 'string', 'description' => 'Dateipfad relativ zur Wurzel, z.B. "vorlagen.md"'],
                ],
                'required' => ['path'],
            ],
            'capability' => null,
        ],
    ];

    /**
     * MCP-Toolname => Webservice-Funktionsname (privacy_surface::ALLOWED_TOOLS).
     *
     * @return array<string, string>
     */
    public static function allowed_tools(): array {
        return array_map(static fn (array $tool): string => $tool['function'], self::TOOLS);
    }

    /**
     * MCP-Toolname => Beschreibung (dispatcher::TOOL_DESCRIPTIONS).
     *
     * @return array<string, string>
     */
    public static function descriptions(): array {
        return array_map(static fn (array $tool): string => $tool['description'], self::TOOLS);
    }

    /**
     * MCP-Toolname => inputSchema-Properties, nur wo vorhanden
     * (dispatcher::TOOL_SCHEMAS).
     *
     * @return array<string, array{properties: array, required?: array}>
     */
    public static function schemas(): array {
        $out = [];
        foreach (self::TOOLS as $name => $tool) {
            if ($tool['schema'] !== null) {
                $out[$name] = $tool['schema'];
            }
        }
        return $out;
    }

    /**
     * $functions-Array fuer db/services.php.
     *
     * @return array<string, array<string, mixed>>
     */
    public static function service_functions(): array {
        $functions = [];
        foreach (self::TOOLS as $tool) {
            $entry = [
                'classname' => $tool['classname'],
                'description' => $tool['wsdescription'],
                'type' => ($tool['write'] ?? false) ? 'write' : 'read',
                'ajax' => false,
            ];
            if ($tool['capability'] !== null) {
                $entry['capabilities'] = $tool['capability'];
            }
            $functions[$tool['function']] = $entry;
        }
        return $functions;
    }

    /**
     * Ist dieses Werkzeug ein Schreibzugriff (#388, Protokollstufen-Schwelle
     * in {@see \local_kurspilot\access_log::log_success()})?
     *
     * @param string $toolname
     * @return bool
     */
    public static function is_write(string $toolname): bool {
        return self::TOOLS[$toolname]['write'] ?? false;
    }

    /**
     * Webservice-Funktionsnamen in Registrierungsreihenfolge, fuer
     * $services['Kurspilot']['functions'] in db/services.php.
     *
     * @return string[]
     */
    public static function service_function_names(): array {
        return array_column(self::TOOLS, 'function');
    }
}
