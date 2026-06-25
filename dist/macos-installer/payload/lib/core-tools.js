'use strict';

/**
 * Core-MCP-Tools (Issue #89, ADR 0007 "Aktivitaets-MCP-Aufteilung").
 *
 * Aktivitaetsunabhaengige Moodle-Tools: Abschnitte lesen/aendern/verschieben,
 * Module verschieben, Abschlussverfolgung (Completion), Voraussetzungen
 * (Restriction), Kurskatalog und Modulliste.
 *
 * Reine Verschiebung aus moodle-mcp.js (keine Verhaltensaenderung). Wird von
 * moodle-mcp-core.js (eigener stdio-Prozess) UND moodle-mcp.js (bestehender
 * Rest-MCP, vorerst weiter mit ausgeliefert) genutzt, um Code-Duplikation zu
 * vermeiden.
 */

const CORE_TOOLS = [
  {
    name: "moodle_get_modules",
    description: "Gibt alle Aktivitäten eines Kurses oder Abschnitts zurück – mit cmid, Typ und Name. Verwenden um cmids für Update-Aufrufe zu ermitteln.",
    inputSchema: {
      type: "object",
      properties: {
        courseid:   { type: "number", description: "Kurs-ID" },
        sectionnum: { type: "number", description: "Abschnittsnummer (0-basiert, -1 = alle Abschnitte)", default: -1 },
      },
      required: ["courseid"],
    },
  },
  {
    name: "moodle_get_course_catalog",
    description: "Liest eine kompakte, filterbare Moodle-Katalogansicht fuer kurspilot-planen: Abschnitte, sichtbare Inhalte, Teststruktur, Sichtbarkeit, Abschluss und Voraussetzungen. Quelle ist klar als 'aus Moodle gelesen' markiert; detail='full' liefert gezielt Vollinhalte.",
    inputSchema: {
      type: "object",
      properties: {
        courseid:   { type: "number", description: "Kurs-ID" },
        sectionnum: { type: "number", description: "Abschnittsnummer (0-basiert, -1 = alle Abschnitte)", default: -1 },
        modname:    { type: "string", description: "Optionaler Aktivitaetstyp-Filter, z.B. page, label, assign, quiz, url", default: "" },
        detail:     { type: "string", enum: ["compact", "full"], description: "compact = Vorschau, full = HTML-Detailinhalte fuer gezielte Entscheidungen", default: "compact" },
      },
      required: ["courseid"],
    },
  },
  {
    name: "moodle_set_completion",
    description: "Aktiviert die Abschlussverfolgung fuer eine Aktivitaet. completion=1: SuS klickt manuell 'Abgeschlossen'. completion=2+completionsubmit=1: automatisch bei Einreichung (nur Aufgaben). completion=2+completionpassgrade=1: automatisch wenn Bestehensgrenze erreicht (nur Module mit gradepass, z.B. Quiz). Muss vor moodle_set_restriction aufgerufen werden.",
    inputSchema: {
      type: "object",
      properties: {
        cmid:                { type: "number", description: "Course Module ID der Aktivitaet" },
        completion:          { type: "number", description: "0=keine, 1=manuell, 2=automatisch", default: 1 },
        completionsubmit:    { type: "number", description: "1=bei Einreichung abschliessen (nur mod_assign)", default: 0 },
        completionpassgrade: { type: "number", description: "1=abgeschlossen sobald Bestehensgrenze erreicht (nur Module mit gradepass, z.B. Quiz). Erfordert completion=2.", default: 0 },
      },
      required: ["cmid"],
    },
  },
  {
    name: "moodle_set_restriction",
    description: "Sperrt eine Aktivitaet bis Voraussetzungen erfuellt sind. Standardmodus: Liste von cmids die abgeschlossen sein muessen (AND/OR). Spezialmodus condition_type='quiz_passed': Folgeaktivitaet erst sichtbar, wenn das Ziel-Quiz (condition_target_cmid) die Bestehensgrenze erreicht hat (Notenbedingung). Ohne expliziten Aufruf wird keine Sperre gesetzt.",
    inputSchema: {
      type: "object",
      properties: {
        cmid:                  { type: "number", description: "Course Module ID der zu sperrenden Aktivitaet" },
        require_cmids:         { type: "array", items: { type: "number" }, description: "cmids die abgeschlossen sein muessen (Standardmodus). Leer/weglassen fuer condition_type='quiz_passed'." },
        show_locked:           { type: "number", description: "1=ausgegraut anzeigen (Standard), 0=komplett verstecken", default: 1 },
        operator:              { type: "string", description: "AND=alle Bedingungen muessen erfuellt sein, OR=eine reicht", default: "AND" },
        condition_type:        { type: "string", description: "Spezialmodus: '' (Standard, completion-basiert) oder 'quiz_passed' (Notenbedingung Bestehensgrenze)", default: "" },
        condition_target_cmid: { type: "number", description: "Ziel-cmid fuer Spezialmodus (z.B. cmid des Quiz fuer 'quiz_passed'). 0=nicht verwendet.", default: 0 },
      },
      required: ["cmid"],
    },
  },
  {
    name: "moodle_get_sections",
    description: "Gibt alle Abschnitte eines Moodle-Kurses zurück (Name, Nummer, ID).",
    inputSchema: {
      type: "object",
      properties: {
        courseid: { type: "number", description: "Die Kurs-ID (steht in der URL: ?id=XX)" },
      },
      required: ["courseid"],
    },
  },
  {
    name: "moodle_update_section",
    description: "Setzt Name und Beschreibung (HTML) eines Kursabschnitts.",
    inputSchema: {
      type: "object",
      properties: {
        courseid:   { type: "number", description: "Kurs-ID" },
        sectionnum: { type: "number", description: "Abschnittsnummer (0-basiert)" },
        name:       { type: "string", description: "Name des Abschnitts, z.B. 'LS 7.2 – ESP32 Webserver'" },
        summary:    { type: "string", description: "HTML-Inhalt der Abschnittsbeschreibung (Handlungssituation-Card)" },
      },
      required: ["courseid", "sectionnum", "name"],
    },
  },
  {
    name: "moodle_ensure_section",
    description: "Legt fehlenden Kursabschnitt bei Bedarf an und setzt optional Name/Beschreibung; verwenden, wenn moodle_update_section mit invalidrecord scheitert.",
    inputSchema: {
      type: "object",
      properties: {
        courseid:   { type: "number", description: "Kurs-ID" },
        sectionnum: { type: "number", description: "Abschnittsnummer (0-basiert)" },
        name:       { type: "string", description: "Optionaler Abschnittsname" },
        summary:    { type: "string", description: "Optionale Abschnittsbeschreibung (HTML)" },
        visible:    { type: "number", description: "1 = sichtbar, 0 = versteckt, weglassen = nicht ändern" },
      },
      required: ["courseid", "sectionnum"],
    },
  },
  {
    name: "moodle_move_section",
    description: "Verschiebt einen bestehenden Kursabschnitt an eine neue Position, ohne Name, Beschreibung, Aktivitaeten oder Sichtbarkeit zu aendern. Fuer Abschnittsverschiebungen erst nach aktualisiertem plan.md verwenden; Abschnitt 0 ('Allgemeines') ist nicht verschiebbar.",
    inputSchema: {
      type: "object",
      properties: {
        courseid:         { type: "number", description: "Kurs-ID" },
        sectionnum:       { type: "number", description: "Aktuelle Abschnittsnummer (0-basiert, Abschnitt 0 ist ausgeschlossen)" },
        targetsectionnum: { type: "number", description: "Ziel-Abschnittsnummer nach dem Verschieben (0-basiert, Abschnitt 0 ist ausgeschlossen)" },
      },
      required: ["courseid", "sectionnum", "targetsectionnum"],
    },
  },
  {
    name: "moodle_move_module",
    description: "Verschiebt eine bestehende Aktivitaet per cmid vor/nach eine andere Aktivitaet oder ans Ende eines Abschnitts, ohne Inhalt, Sichtbarkeit, Abschlussbedingungen, Voraussetzungen, Quizsettings oder Fragen zu aendern. Fuer reine organisatorische Sortierung erst nach plan.md-Update oder dokumentierter Journal-Ausnahme verwenden.",
    inputSchema: {
      type: "object",
      properties: {
        courseid:         { type: "number", description: "Kurs-ID" },
        cmid:             { type: "number", description: "Course Module ID der zu verschiebenden Aktivitaet" },
        beforecmid:       { type: "number", description: "Direkt vor diese Course Module ID verschieben (0 = nicht verwenden)", default: 0 },
        aftercmid:        { type: "number", description: "Direkt nach diese Course Module ID verschieben (0 = nicht verwenden)", default: 0 },
        targetsectionnum: { type: "number", description: "Zielabschnitt fuer Verschieben ans Abschnittsende oder zur Plausibilisierung von before/after (-1 = ableiten)", default: -1 },
      },
      required: ["courseid", "cmid"],
    },
  },
];

const CORE_TOOL_NAMES = new Set(CORE_TOOLS.map(tool => tool.name));

const CORE_READ_ONLY_TOOL_NAMES = new Set([
  "moodle_get_modules",
  "moodle_get_sections",
  "moodle_get_course_catalog",
]);

/**
 * Fuehrt ein Core-Tool aus. Wirft, falls `name` kein Core-Tool ist - der
 * Aufrufer (moodle-mcp.js bzw. moodle-mcp-core.js) entscheidet per
 * isCoreTool(), ob er ueberhaupt hierher dispatcht.
 */
async function executeCoreTool(callMoodle, name, args) {
  switch (name) {

    case "moodle_set_completion": {
      return await callMoodle("local_aicoursecreator_set_completion", {
        cmid:                args.cmid,
        completion:          args.completion          ?? 1,
        completionsubmit:    args.completionsubmit    ?? 0,
        completionpassgrade: args.completionpassgrade ?? 0,
      });
    }

    case "moodle_set_restriction": {
      const req = args.require_cmids || [];
      return await callMoodle("local_aicoursecreator_set_restriction", {
        cmid:                  args.cmid,
        show_locked:           args.show_locked           ?? 1,
        operator:              args.operator              || "AND",
        condition_type:        args.condition_type        || "",
        condition_target_cmid: args.condition_target_cmid ?? 0,
        ...Object.fromEntries(req.map((id, i) => [`require_cmids[${i}]`, id])),
      });
    }

    case "moodle_get_modules": {
      return await callMoodle("local_aicoursecreator_get_modules", {
        courseid:   args.courseid,
        sectionnum: args.sectionnum ?? -1,
      });
    }

    case "moodle_get_course_catalog": {
      return await callMoodle("local_aicoursecreator_get_course_catalog", {
        courseid:   args.courseid,
        sectionnum: args.sectionnum ?? -1,
        modname:    args.modname || "",
        detail:     args.detail || "compact",
      });
    }

    case "moodle_get_sections": {
      const result = await callMoodle("local_aicoursecreator_get_sections", {
        courseid: args.courseid,
      });
      return result.map(s => ({
        sectionnum: s.sectionnum,
        id: s.id,
        name: s.name || `(Abschnitt ${s.sectionnum})`,
        visible: s.visible,
      }));
    }

    case "moodle_update_section": {
      return await callMoodle("local_aicoursecreator_update_section", {
        courseid:   args.courseid,
        sectionnum: args.sectionnum,
        name:       args.name       || "",
        summary:    args.summary    || "",
        visible:    args.visible    ?? 1,
      });
    }

    case "moodle_ensure_section": {
      return await callMoodle("local_aicoursecreator_ensure_section", {
        courseid:   args.courseid,
        sectionnum: args.sectionnum,
        name:       args.name    || "",
        summary:    args.summary || "",
        visible:    args.visible ?? -1,
      });
    }

    case "moodle_move_section": {
      return await callMoodle("local_aicoursecreator_move_section", {
        courseid:         args.courseid,
        sectionnum:       args.sectionnum,
        targetsectionnum: args.targetsectionnum,
      });
    }

    case "moodle_move_module": {
      return await callMoodle("local_aicoursecreator_move_module", {
        courseid:         args.courseid,
        cmid:             args.cmid,
        beforecmid:       args.beforecmid ?? 0,
        aftercmid:        args.aftercmid ?? 0,
        targetsectionnum: args.targetsectionnum ?? -1,
      });
    }

    default:
      throw new Error(`Unbekanntes Core-Tool: ${name}`);
  }
}

function isCoreTool(name) {
  return CORE_TOOL_NAMES.has(name);
}

function isCoreReadOnlyTool(name) {
  return CORE_READ_ONLY_TOOL_NAMES.has(name);
}

module.exports = {
  CORE_TOOLS,
  CORE_TOOL_NAMES,
  CORE_READ_ONLY_TOOL_NAMES,
  executeCoreTool,
  isCoreTool,
  isCoreReadOnlyTool,
};
