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

const { dispatchTool } = require('./tool-registry');

/**
 * Setzt die Sichtbarkeit eines Course Modules ueber Moodles Core-Kursseiten-
 * API (core_courseformat_update_course, Action cm_show/cm_hide). Gemeinsam
 * genutzt von moodle_update_activity_settings und moodle_clone_activity, um
 * die Aufrufform nicht zweimal zu pflegen.
 */
async function setCmVisibility(callMoodle, courseid, cmid, visible) {
  await callMoodle("core_courseformat_update_course", {
    action: visible ? "cm_show" : "cm_hide",
    courseid,
    "ids[0]": cmid,
  });
}

/**
 * Benennt eine geklonte Aktivitaet auf den effektiven Titel um: Aufgabe und
 * Quiz ueber ihr jeweiliges Kurspilot-Update-Tool (deckungsgleich mit den
 * MCP-Tools moodle_update_assign/moodle_update_quiz_settings), alle anderen
 * Typen generisch ueber Moodles Core-Rename (core_update_inplace_editable,
 * intern set_coursemodule_name() - funktioniert fuer jeden Aktivitaetstyp).
 * Gibt einen Hinweistext zurueck, wenn kein dediziertes Update-Tool existiert
 * und daher weitere Anpassungen nur direkt in Moodle moeglich sind.
 */
async function renameClonedModule(callMoodle, modname, cmid, title) {
  if (modname === "assign") {
    await callMoodle("local_coursepilot_update_assign", { cmid, name: title });
    return undefined;
  }
  if (modname === "quiz") {
    await callMoodle("local_coursepilot_update_quiz_settings", { cmid, name: title });
    return undefined;
  }
  await callMoodle("core_update_inplace_editable", {
    component: "core_course",
    itemtype: "activityname",
    itemid: cmid,
    value: title,
  });
  return `Aktivitaetstyp '${modname}' hat kein eigenes MCP-Update-Tool - Titel wurde gesetzt, weitere Anpassungen nur direkt in Moodle moeglich.`;
}

/**
 * Baut die Hinweise auf geerbte Abschlussverfolgung/Voraussetzungen einer
 * geklonten Aktivitaet - gemeinsam genutzt von beiden moodle_clone_activity-
 * Pfaden (Intra-Kurs und kursuebergreifend), damit die Formulierungen nicht
 * zweimal gepflegt werden.
 */
function inheritedSettingsNotes(source) {
  const notes = [];
  if (source.completion > 0) {
    notes.push(`Abschlussverfolgung wurde von der Quelle uebernommen (completion=${source.completion}, completionpassgrade=${source.completionpassgrade ?? 0}, completionview=${source.completionview ?? 0}, completionexpected=${source.completionexpected ?? 0}) - pruefen, ob sie fuer den Klon noch passt.`);
  }
  if (source.availability) {
    notes.push("Voraussetzungen (availability) wurden von der Quelle uebernommen - pruefen, ob sie fuer den Klon noch passen.");
  }
  return notes;
}

/**
 * Kursuebergreifender Pfad von moodle_clone_activity (Issue #329, Spec 0013
 * KP-010): kein Core-Webservice dupliziert eine Aktivitaet in einen anderen
 * Kurs, daher uebernimmt der lokale Adapter local_coursepilot_clone_activity_
 * to_course (Backup/Restore, siehe Plugin-Klasse clone_activity_to_course)
 * das Duplizieren. Titel-/Sichtbarkeits-Nachbearbeitung ist identisch zum
 * Intra-Kurs-Pfad (#328) und wird ueber renameClonedModule/setCmVisibility
 * wiederverwendet statt dupliziert.
 */
async function cloneActivityToOtherCourse(args, source, callMoodle) {
  const { cmid: newcmid, courseid: targetCourseid, sectionnum: targetSectionnum } =
    await callMoodle("local_coursepilot_clone_activity_to_course", {
      cmid: args.cmid,
      targetcourseid: args.courseid,
      targetsectionnum: args.sectionnum ?? -1,
    });

  const effectiveTitle = (args.title && args.title.trim()) || source.name;
  const manualFollowUp = await renameClonedModule(callMoodle, source.modname, newcmid, effectiveTitle);

  const visible = args.visible ?? 1;
  await setCmVisibility(callMoodle, targetCourseid, newcmid, visible);

  const notes = inheritedSettingsNotes(source);
  if (manualFollowUp) {
    notes.push(manualFollowUp);
  }

  return {
    cmid: newcmid,
    modname: source.modname,
    title: effectiveTitle,
    courseid: targetCourseid,
    sectionnum: targetSectionnum,
    visible,
    notes,
  };
}

const CORE_TOOLS = [
  {
    name: "moodle_update_activity_settings",
    description: "Setzt Sichtbarkeit und/oder Gruppenmodus einer bestehenden Aktivität. Die Änderung nutzt Moodles Core-Kursseiten-API; danach moodle_get_course_catalog zum frischen Read-back aufrufen.",
    inputSchema: {
      type: "object",
      properties: {
        courseid: { type: "number", description: "Kurs-ID" },
        cmid: { type: "number", description: "Course Module ID der Aktivität" },
        visible: { type: "number", enum: [0, 1], description: "0 = versteckt, 1 = sichtbar" },
        groupmode: { type: "number", enum: [0, 1, 2], description: "0 = keine Gruppen, 1 = getrennte Gruppen, 2 = sichtbare Gruppen" },
      },
      required: ["courseid", "cmid"],
    },
    async handler(args, callMoodle) {
      if (args.visible === undefined && args.groupmode === undefined) {
        throw new Error("moodle_update_activity_settings: visible oder groupmode muss angegeben werden.");
      }
      if (args.visible !== undefined) {
        await setCmVisibility(callMoodle, args.courseid, args.cmid, args.visible);
      }
      if (args.groupmode !== undefined) {
        await callMoodle("core_courseformat_update_course", {
          action: ["cm_nogroups", "cm_separategroups", "cm_visiblegroups"][args.groupmode],
          courseid: args.courseid,
          "ids[0]": args.cmid,
        });
      }
    },
  },
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
    readOnly: true,
    async handler(args, callMoodle) {
      return await callMoodle("local_coursepilot_get_modules", {
        courseid:   args.courseid,
        sectionnum: args.sectionnum ?? -1,
      });
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
    readOnly: true,
    async handler(args, callMoodle) {
      return await callMoodle("local_coursepilot_get_course_catalog", {
        courseid:   args.courseid,
        sectionnum: args.sectionnum ?? -1,
        modname:    args.modname || "",
        detail:     args.detail || "compact",
      });
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
    async handler(args, callMoodle) {
      return await callMoodle("local_coursepilot_set_completion", {
        cmid:                args.cmid,
        completion:          args.completion          ?? 1,
        completionsubmit:    args.completionsubmit    ?? 0,
        completionpassgrade: args.completionpassgrade ?? 0,
      });
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
    async handler(args, callMoodle) {
      const req = args.require_cmids || [];
      return await callMoodle("local_coursepilot_set_restriction", {
        cmid:                  args.cmid,
        show_locked:           args.show_locked           ?? 1,
        operator:              args.operator              || "AND",
        condition_type:        args.condition_type        || "",
        condition_target_cmid: args.condition_target_cmid ?? 0,
        ...Object.fromEntries(req.map((id, i) => [`require_cmids[${i}]`, id])),
      });
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
    readOnly: true,
    async handler(args, callMoodle) {
      const result = await callMoodle("local_coursepilot_get_sections", {
        courseid: args.courseid,
      });
      return result.map(s => ({
        sectionnum: s.sectionnum,
        id: s.id,
        name: s.name || `(Abschnitt ${s.sectionnum})`,
        visible: s.visible,
      }));
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
    async handler(args, callMoodle) {
      return await callMoodle("local_coursepilot_update_section", {
        courseid:   args.courseid,
        sectionnum: args.sectionnum,
        name:       args.name       || "",
        summary:    args.summary    || "",
        visible:    args.visible    ?? 1,
      });
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
    async handler(args, callMoodle) {
      return await callMoodle("local_coursepilot_ensure_section", {
        courseid:   args.courseid,
        sectionnum: args.sectionnum,
        name:       args.name    || "",
        summary:    args.summary || "",
        visible:    args.visible ?? -1,
      });
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
    async handler(args, callMoodle) {
      return await callMoodle("local_coursepilot_move_section", {
        courseid:         args.courseid,
        sectionnum:       args.sectionnum,
        targetsectionnum: args.targetsectionnum,
      });
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
    async handler(args, callMoodle) {
      return await callMoodle("local_coursepilot_move_module", {
        courseid:         args.courseid,
        cmid:             args.cmid,
        beforecmid:       args.beforecmid ?? 0,
        aftercmid:        args.aftercmid ?? 0,
        targetsectionnum: args.targetsectionnum ?? -1,
      });
    },
  },
  {
    name: "moodle_clone_activity",
    description: "Dupliziert eine Aktivitaet im selben Kurs (Moodle-Core cm_duplicate) oder kursuebergreifend in einen anderen Kurs (lokaler Backup/Restore-Adapter, Spec 0013 KP-010) inkl. Plugin-Konfigurationen (z.B. Abgabetypen bei Aufgaben), Bewertungsfeldern, Completion und Voraussetzungen. Entfernt automatisch das „(Kopie)“-Suffix bzw. setzt title, und macht den Klon sichtbar (visible=1), sofern nicht explizit visible=0 angegeben. Der Pfad wird automatisch anhand courseid gewaehlt (Default: selber Kurs). Enthaelt bereits einen Hinweis, falls Voraussetzungen oder Abschlussregeln von der Quelle uebernommen wurden - diesen Hinweis an die Lehrkraft weitergeben. Fuer Aktivitaetstypen ohne eigenes MCP-Update-Tool (nur Titel setzbar) manuelle Nacharbeit in Moodle beschreiben.",
    inputSchema: {
      type: "object",
      properties: {
        cmid:       { type: "number", description: "Course Module ID der zu klonenden Quellaktivitaet" },
        title:      { type: "string", description: "Titel des Klons. Weglassen = Quelltitel (ohne „(Kopie)“-Suffix)" },
        sectionnum: { type: "number", description: "Ziel-Abschnittsnummer (0-basiert) im Zielkurs. Weglassen = selber Abschnitt wie Quelle (Intra-Kurs) bzw. dort, wo der kursuebergreifende Import die Aktivitaet platziert" },
        courseid:   { type: "number", description: "Zielkurs. Weglassen oder identisch mit dem Quellkurs = Intra-Kurs-Klon; abweichender Wert = kursuebergreifender Klon (erfordert moodle/backup:backuptargetimport im Quellkurs sowie moodle/restore:restoretargetimport und moodle/course:manageactivities im Zielkurs)" },
        visible:    { type: "number", enum: [0, 1], description: "Sichtbarkeit des Klons", default: 1 },
      },
      required: ["cmid"],
    },
    async handler(args, callMoodle) {
      const { cm: source } = await callMoodle("core_course_get_course_module", { cmid: args.cmid });

      if (args.courseid !== undefined && args.courseid !== source.course) {
        return await cloneActivityToOtherCourse(args, source, callMoodle);
      }

      const targetSectionnum = args.sectionnum ?? source.sectionnum;
      let targetsectionid;
      if (targetSectionnum !== source.sectionnum) {
        const sections = await callMoodle("local_coursepilot_get_sections", { courseid: source.course });
        const targetSection = sections.find(s => s.sectionnum === targetSectionnum);
        if (!targetSection) {
          throw new Error(`moodle_clone_activity: Zielabschnitt ${targetSectionnum} existiert nicht im Kurs ${source.course}.`);
        }
        targetsectionid = targetSection.id;
      }

      // cm_duplicate liefert die neue cmid nicht zuverlaessig im JSON-Response
      // zurueck (Moodle laesst 'cm'-Updates aus, wenn die Aktivitaet - wie bei
      // einer versteckten Quelle - im Moment des Duplizierens nicht sichtbar
      // ist). Robuster: Modulliste des Zielabschnitts vor/nach dem Duplizieren
      // vergleichen und die neu hinzugekommene cmid uebernehmen.
      const before = await callMoodle("local_coursepilot_get_modules", { courseid: source.course, sectionnum: targetSectionnum });
      const beforeIds = new Set(before.map(m => m.cmid));

      const duplicateParams = { action: "cm_duplicate", courseid: source.course, "ids[0]": args.cmid };
      if (targetsectionid !== undefined) {
        duplicateParams.targetsectionid = targetsectionid;
      }
      await callMoodle("core_courseformat_update_course", duplicateParams);

      const after = await callMoodle("local_coursepilot_get_modules", { courseid: source.course, sectionnum: targetSectionnum });
      const created = after.filter(m => !beforeIds.has(m.cmid));
      if (created.length !== 1) {
        throw new Error(`moodle_clone_activity: neue cmid nach dem Duplizieren nicht eindeutig bestimmbar (${created.length} Kandidaten).`);
      }
      const newcmid = created[0].cmid;

      const effectiveTitle = (args.title && args.title.trim()) || source.name;
      const manualFollowUp = await renameClonedModule(callMoodle, source.modname, newcmid, effectiveTitle);

      const visible = args.visible ?? 1;
      await setCmVisibility(callMoodle, source.course, newcmid, visible);

      const notes = inheritedSettingsNotes(source);
      if (manualFollowUp) {
        notes.push(manualFollowUp);
      }

      return {
        cmid: newcmid,
        modname: source.modname,
        title: effectiveTitle,
        courseid: source.course,
        sectionnum: targetSectionnum,
        visible,
        notes,
      };
    },
  },
];

const CORE_TOOL_NAMES = new Set(CORE_TOOLS.map(tool => tool.name));

const CORE_READ_ONLY_TOOL_NAMES = new Set(
  CORE_TOOLS.filter(tool => tool.readOnly).map(tool => tool.name)
);

/**
 * Fuehrt ein Core-Tool aus. Wirft, falls `name` kein Core-Tool ist - der
 * Aufrufer (moodle-mcp.js bzw. moodle-mcp-core.js) entscheidet per
 * isCoreTool(), ob er ueberhaupt hierher dispatcht.
 */
async function executeCoreTool(callMoodle, name, args) {
  return await dispatchTool(CORE_TOOLS, name, args, callMoodle, `Unbekanntes Core-Tool: ${name}`);
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
