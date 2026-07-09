# Referenz: Implementierungsplan-Workflow

Lies diese Datei vor jedem schreibenden Moodle-Zugriff (`moodle_create_*`,
`moodle_update_*`, `moodle_move_section`, `moodle_move_module`,
`moodle_set_completion`, `moodle_set_restriction`) – also beim Aufbau und bei
der Ausfuehrung eines Implementierungsplans in `kurspilot-planen` und
`kurspilot-umsetzen`.

## Grundprinzipien fuer die Phasenanalyse

### Phasenanzahl ist flexibel

Es gibt KEINE feste Anzahl von Phasen. Analysiere die vorliegende
Unterrichtseinheit oder das Unterthema und erstelle so viele Phasen wie darin
beschrieben sind. Typisch sind 3-6 Phasen – aber es koennen auch 2 oder 8 sein.

### Phasen-Design ist frei waehlbar

Phasen muessen keinem starren Schema folgen. Moegliche Phasenmodelle:
- Handlungsorientiert: Informieren / Planen / Durchfuehren / Kontrollieren / Reflektieren
- Projektbasiert: Analyse / Konzept / Implementierung / Test / Abnahme
- Problembasiert: Problem / Hypothese / Experiment / Auswertung
- Eigene Struktur aus der Unterrichtseinheit oder dem Unterthema ableiten

### Inhalte aus der Unterrichtseinheit ableiten

Alle Texte, Aufgaben und Materialien werden AUS DER VORLIEGENDEN UNTERRICHTSEINHEIT
bzw. dem Unterthema abgeleitet. Nicht erfinden, nicht aus Beispielen kopieren.

Fuer Planung und Umsetzung gilt dabei durchgaengig die **Planstrenge** (siehe
Ankerbegriffe in `kurspilot-core.md`).

## Implementierungsplan-Workflow (Pflicht vor jedem Schreibzugriff)

Bevor irgendein schreibendes MCP-Tool aufgerufen wird, wird immer zuerst ein
**Implementierungsplan** erstellt und der Lehrkraft als **gestufte Vorschau**
gezeigt. Erst nach expliziter Freigabe ("ja, so umsetzen", "Plan ist gut, leg
los", "freigegeben") werden die Aenderungen in Moodle geschrieben.

Die Plan-Datenstruktur und die Vorschau-Aufbereitung leben in
`lib/implementation-plan.js` (isoliert testbar, keine Moodle-Abhaengigkeit,
siehe `test/implementation-plan.test.js`).

### Natuerliche Startformulierungen

Diese Formulierungen starten den Plan-Workflow (statt direkt Tools aufzurufen):

- "Plane den Abschnitt fuer ..."
- "Erstelle mir einen Implementierungsplan fuer ..."
- "Wie wuerdest du den Kurs befuellen? Zeig mir erst den Plan."
- "Bevor du loslegst: was ist der Plan?"

### Ablauf

1. **Plan aufbauen** (`createPlan`, `setQuestionBank`, `addSection`,
   `addActivity` aus `lib/implementation-plan.js`): Zuerst die benannte
   Kurs-/Projekt-Fragensammlung als eigene Planungsentscheidung festlegen
   (`setQuestionBank(plan, { courseName, projectName, topicName, ... })`,
   siehe `quiz-und-fragenbank.md`). Fuer jede geplante Aktivitaet danach Typ,
   Name, Inhalt/Beschreibung, ob sie ein Lernpfad-Gate ist und ob eine
   digitale Abgabe vorgesehen ist (`isGate`, `hasDigitalSubmission`) angeben.
   `addActivity` leitet daraus automatisch die passende Completion-Konfiguration
   ab (siehe Planungsgrundsaetze unten).
2. **Kurzuebersicht zeigen** (`getOverview`): Zeigt Abschnitte, Aktivitaeten
   in Reihenfolge, Typ, Gate-Status, Completion/Restriction sowie die benannte
   Fragensammlung (Name + Struktur) und die Liste der Planungsgrundsaetze und
   Planabweichungen – OHNE Volltext (z.B. ganze Textseiteninhalte).
3. **Volltext nur auf Nachfrage** (`getActivityDetail(plan, activityId)`):
   Wenn die Lehrkraft z.B. "Zeig mir den ganzen Text der Infoseite" sagt,
   wird der vollstaendige Inhalt einer einzelnen Aktivitaet nachgeliefert.
4. **Freigabe abwarten**: Erst wenn die Lehrkraft den Plan ausdruecklich
   bestaetigt, werden die Aenderungen ausgefuehrt (`applyPlan(plan, { approved: true, client })`).
   Ohne `approved: true` wirft `applyPlan` einen Fehler und ruft KEIN
   schreibendes Tool auf.

### Abschnitts- und Aktivitaetsverschiebung

Fuer eine reine **Abschnittsverschiebung** wird die geplante neue
Abschnittsreihenfolge zuerst in `plan.md` nachgefuehrt und von der Lehrkraft
bestaetigt; erst danach wird `moodle_move_section` ausgefuehrt. Eine
planexterne Ausnahme ist nur erlaubt, wenn die Lehrkraft ausdruecklich
bestaetigt, dass der freigegebene Plan fachlich unveraendert bleibt und nur
der bestehende Moodle-Kurs organisatorisch sortiert werden soll. Dann ist vor
dem Moodle-Schreibzugriff ein Journal-Eintrag Pflicht (siehe `journal.md`),
und es werden keine weiteren Abschnittsinhalte oder Sichtbarkeiten
mitveraendert.

Fuer eine reine **Aktivitaetsverschiebung** gilt dieselbe Planbindung:
`moodle_move_module` verschiebt nur eine bestehende Aktivitaet per `cmid`
vor/nach eine andere Aktivitaet oder ans Abschnittsende. Das Tool darf keine
Inhalte, Sichtbarkeit, Abschlussbedingungen, Voraussetzungen, Quizsettings,
Fragenreferenzen oder Fragedaten aendern.

### Planungsgrundsaetze (werden nicht pro Aktivitaet wiederholt)

- **Aufgabe ohne Abgabe als Gate** -> manuelle Schueler-Abschlussmarkierung
  (`completion=1`).
- **Aufgabe mit digitaler Abgabe als Gate** -> Abgabe-Completion
  (`completion=2`, `completionsubmit=1`).
- **Textseite ohne Gate per Default**; manuelle Abschlussmarkierung nur wenn
  die Textseite explizit als Pflichtlektuere geplant ist.
- **Freigabe-Voraussetzung (Restriction)** wird nur gesetzt, wenn sie im Plan
  ausdruecklich geplant und begruendet ist.

### Planabweichungen

Weicht eine Aktivitaet von einem Planungsgrundsatz ab (z.B. Textseite als
Pflichtlektuere mit Gate, oder eine zusaetzliche Restriction), MUSS beim
Hinzufuegen eine kurze Begruendung (`deviationReason`) mitgegeben werden.
`addActivity` wirft sonst einen Fehler. Die Abweichung erscheint danach in
`plan.deviations` und damit auch in der Kurzuebersicht – fuer die Lehrkraft
gut sichtbar mit Begruendung, statt versteckt in einer langen Liste.

## Ausfuehrung: Schrittfolge in Moodle

### Schritt 1: Unterrichtseinheit oder Unterthema analysieren

Vor dem ersten API-Aufruf die Unterrichtseinheit bzw. das Unterthema lesen und notieren:
- Wie viele Phasen gibt es? Wie heissen sie?
- Welche Farbe bekommt jede Phase? (Frei waehlbar, aber konsistent)
- Welche Aktivitaeten gehoeren zu welcher Phase?
- Was muessen SuS NUR LESEN? Was muessen sie ABGEBEN?

### Schritt 2: Kursstruktur pruefen

```
moodle_get_sections(courseid=KURS_ID)
```

Geplanten Zielabschnitt mit dem freigegebenen Plan abgleichen. Abschnitt 0
beziehungsweise "Allgemeines" ist ein normaler fachlicher Kursabschnitt und
kein technischer Ablageort fuer Kurspilot-Versionierung, Status, Debug-Hinweise
oder sonstige Prozessdaten. Ohne freigegebenen Plan keinen "freien Abschnitt"
als Default befuellen.

### Schritt 3: Abschnitt benennen und nur bei Planbezug einen Abschnittseinstieg setzen

```
moodle_update_section(courseid, sectionnum, name, summary)
```

Ein Abschnittseinstieg im `summary` ist kein automatischer Default. Nutze ihn
nur, wenn der freigegebene Plan fuer genau diesen Abschnitt einen sichtbaren
Einstieg vorsieht.

### Schritt 4: Pro Phase die geplanten Elemente anlegen

Fuer jede Phase der Unterrichtseinheit bzw. des Unterthemas:
1. `moodle_create_label` – nur wenn ein sichtbarer Phasen-Trenner geplant ist
2. Je nach Inhalt: `moodle_create_page`, `moodle_create_url`, `moodle_create_assign`

## Aktivitaetstypen waehlen

| Situation | Tool |
|---|---|
| SuS liest nur (Infoblatt, Leitfaden, Anleitung, Codebeispiel) | `moodle_create_page` |
| SuS fuellt etwas aus / gibt etwas ab / reflektiert | `moodle_create_assign` |
| Externe Dokumentation, GitHub, MDN, Referenz | `moodle_create_url` |
| Phasen-Trenner (direkt auf Kursseite sichtbar) | `moodle_create_label` |

**GOLDENE REGEL:** Sobald SuS irgendetwas ausfullen, eintragen, ankreuzen
oder hochladen sollen -> IMMER `moodle_create_assign`, NIEMALS `moodle_create_page`!
