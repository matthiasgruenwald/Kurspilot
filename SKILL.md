---
name: kurspilot
description: >
  Erstellt vollständige Moodle-Kursabschnitte für Unterrichtseinheiten und
  Unterthemen via Moodle MCP Server. Unterstützt beliebig viele Phasen
  (nicht zwingend 5) und frei waehlbare Phasenmodelle für unterschiedliche Faecher.
  Verwende diesen Skill IMMER wenn der Benutzer sagt: "erstelle einen Moodle-Kurs",
  "baue den Kurs auf", "Moodle-Kurs für die Unterrichtseinheit", "lege das Thema in
  Moodle an", "Moodle-Abschnitt erstellen", "Kurs befüllen", oder wenn eine
  Unterrichtseinheit oder ein Unterthema (als Datei oder Text) vorliegt und eine
  Kurs-ID genannt wird.
---

# Skill: Kurspilot

> **Hinweis zur Herkunft:** Dieser Skill ist Teil der IGS-Arbeitsversion (Fork von
> [`jtuttas/MoodleMcp`](https://github.com/jtuttas/MoodleMcp), siehe
> `docs/adr/0002-use-an-igs-fork-as-training-version.md`). Der Upstream nutzt fuer
> denselben Workflow den Begriff "Lernsituation" (BBS-Kontext) – in dieser
> Arbeitsversion heisst das Pendant **Unterrichtseinheit** bzw. **Unterthema**.
>
> **Kurspilot in Lehrkraftsprache:** In den Doku- und Lehrkrafttexten heisst diese
> Skill-Familie **Kurspilot**. `kurspilot` ist der sichtbare Einstieg; je nach
> Anliegen wechselt der Skill transparent zu `kurspilot-einrichten`,
> `kurspilot-planen` oder `kurspilot-umsetzen` und nennt dabei den Grund. In
> V1 gibt es kein separates `kurspilot-fortsetzen` und kein separates
> `kurspilot-materialien`.

Erstellt einen vollständigen Moodle-Kursabschnitt auf Basis einer Unterrichtseinheit
oder eines Unterthemas. Nutzt ausschliesslich den **Moodle MCP Server** – kein
Browser, keine Klicks.

---

## Natuerliche Startformulierungen

Lehrkraefte muessen keinen technischen Befehl auswendig kennen. Folgende
alltagssprachlichen Formulierungen reichen, um Setup, Weiterarbeiten oder Planung zu
starten:

**Setup / Einstieg (Kontext-Onboarding):**
> "Richte mir den Moodle-Zugang fuer meine 7a in Naturwissenschaften ein."
> "Ich will Kurspilot zum ersten Mal fuer meine Klasse nutzen."

**Weiterarbeiten (je nach Stand):**
> "Setze meine Planung fuer 7a Nawi fort."
> "Mach mit Bio weiter."
Der Skill prueft dabei den aktuellen Stand und wechselt offen in den passenden
Modus, zum Beispiel zu `kurspilot-planen` bei einem vorhandenen Entwurf oder zu
`kurspilot-umsetzen` bei einem freigegebenen Plan.

**Planungsstart (Alignment-Prozess / Kursbefuellung):**
> "Baue in Kurs 42 die Unterrichtseinheit zum Thema Stromkreise auf."
> "Lege das Unterthema Photosynthese in Moodle an (Kurs-ID: 17)."

Der sichtbare Wechsel wird dabei kurz benannt, etwa: "Ich nutze jetzt
`kurspilot-planen`, weil bereits ein Planentwurf vorliegt und erst freigegeben
werden muss."

### Kurze Kontextklaerung bei Mehrdeutigkeit

Wenn eine Startformulierung mehrere Klassen, Faecher oder Themen meinen koennte,
stellt der Skill eine kurze Rueckfrage mit wenigen passenden Kandidaten – statt
den falschen Kontext stillschweigend anzunehmen oder lange Rueckfragen zu stellen.

Beispiel:
> **Lehrkraft:** "Mach mit Bio weiter."
> **Skill:** "Ich habe zwei offene Planungen fuer Bio gefunden: 7a (Photosynthese)
> und 7c (Zellaufbau). Welche meinst du?"

---

## Grundprinzipien

### Phasenanzahl ist flexibel
Es gibt KEINE feste Anzahl von Phasen. Der Skill analysiert die vorliegende
Unterrichtseinheit oder das Unterthema und erstellt so viele Phasen wie darin
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

### Planstrenge
Planung und Umsetzung enthalten nur, was aus Lehrkraftauftrag,
bereitgestelltem Material, lokalem Kontext und freigegebenem
Implementierungsplan nachvollziehbar folgt. Keine ungefragten Extras, keine
stillen Design-Upgrades und keine Zusatzaktivitaeten nur weil sie technisch
moeglich oder eindrucksvoll waeren.

Neue sichtbare Elemente, Aktivitaeten, Materialien, Dateien, Bewertungen oder
Kurslogik muessen als Planoption benannt oder rueckgefragt werden. Kleine
Ausformulierungen innerhalb eines bereits geplanten Inhalts sind erlaubt.
Sichtbare Zusatzelemente wie Ausgangssituations-Cards, farbige Phasen-Header,
PDF-/Print-Hinweise, Zusatzbuttons, Gamification oder sonstige Deko nur
verwenden, wenn sie im Material stehen, im Plan begruendet sind oder von der
Lehrkraft ausdruecklich freigegeben wurden.

---

## Kontext-Onboarding (lokaler Lehrkraft-Kontext)

Bevor eine Lernsituation in Moodle aufgebaut wird, kann passender **Kurskontext**
aus `local-context/` genutzt werden (Lerngruppenprofil + Fachprofil). Dieser
Ordner ist **nicht** Teil des Git-Repos (siehe `.gitignore` und
`docs/adr/0003-allow-local-student-names-in-teacher-context.md`) und darf echte
Schuelernamen enthalten.
Der Grundordner wird nicht aus dem aktuellen Repo oder Chat geraten, sondern vor
jeder lokalen Dateioperation aus der gespeicherten **Arbeitsbereich-Einstellung**
des Kurspilot-Konfigurationsprogramms gelesen. Fehlt diese Einstellung oder ist
sie nicht lesbar, verweist Kurspilot auf das Konfigurationsprogramm statt nach
einem Ersatzpfad im Chat zu fragen.

### Wann startet das Setup?

Nur als bewusst gestartete **Setup-Option** – nicht automatisch. Typische
Ausloeser sind natuerliche Formulierungen wie:

- "Richte den Kontext fuer 7a Nawi ein"
- "Lege ein Lerngruppenprofil fuer die 7a an"
- "Setup fuer meine Klasse/Lerngruppe"

Wenn `local-context/<schuljahr>/<klasse>/CONTEXT.md` bereits existiert, das
Setup nicht erneut anbieten, sondern auf den vorhandenen Kontext hinweisen.

### Pflichtkontext (immer abfragen)

Nur diese drei Angaben sind zwingend:

1. **Schuljahr** (z.B. `2025-26`)
2. **Klasse oder Lerngruppe** (z.B. `7a`; bei geteilten/gemischten Gruppen ein
   eigener Lerngruppenname als **eigenstaendige Teilgruppe**, z.B.
   `7a-e-kurs-nawi` – liegt als eigener Ordner direkt unter dem Schuljahr,
   NICHT verschachtelt unter `7a`)
3. **Fach/Unterrichtsordner** (z.B. `naturwissenschaften`) – nur wenn ein
   Fachprofil angelegt werden soll

Erlaubt sind Buchstaben, Ziffern, `-` und `_`. Keine Pfadtrenner oder `..`.

### Pfadlogik

Pfade werden ueber `lib/local-context-paths.js` berechnet:

| Funktion | Ergebnis |
|---|---|
| `getLerngruppenContextFile(schuljahr, klasse)` | `local-context/<schuljahr>/<klasse>/CONTEXT.md` |
| `getFachprofilContextFile(schuljahr, klasse, fach)` | `local-context/<schuljahr>/<klasse>/<fach>/CONTEXT.md` |

Teilgruppen (z.B. `7a-e-kurs-nawi`) sind eigene `<klasse>`-Werte und liegen
dadurch automatisch als eigenstaendiger Ordner direkt unter dem Schuljahr.
Die relativen Pfade werden dabei immer mit dem konfigurierten
Kurspilot-Arbeitsbereich kombiniert.

### Setup-Ablauf (Erklaerendes Setup)

1. Pflichtkontext erfragen (siehe oben).
2. Kurz erklaeren, was angelegt wird und warum (z.B. "Ich lege
   `/.../local-context/2025-26/7a/CONTEXT.md` in deinem
   Kurspilot-Arbeitsbereich an – das Lerngruppenprofil haelt
   faecheruebergreifende Infos zur Klasse fest, lokal und nicht im Git-Repo.").
3. **Optionalen Planungskontext anbieten, nicht erzwingen**: Leistungsstand,
   besondere Lernbedarfe, Gruppendynamik, Sprachstand, technische
   Rahmenbedingungen (Lerngruppenprofil) bzw. Kompetenzstand, Arbeitsweisen,
   laufende Themen, Teststand (Fachprofil). Bei "spaeter"/"weiss ich noch
   nicht" einfach leer lassen (Platzhalter `_(noch nicht erfasst)_` bleibt
   stehen).
4. **Verwandten Kontext** nur als leichte Referenz abfragen (z.B. "Ist das
   eine Teilgruppe einer Stammklasse, oder gibt es eine verwandte
   Lerngruppe?"). Es wird nur ein Verweistext gespeichert – KEINE
   automatische Uebernahme von Inhalten aus dem verwandten Profil.
5. Vorschau der zu erstellenden CONTEXT.md(s) zeigen, dann auf Bestaetigung
   per `lib/local-context-setup.js` (`createLerngruppenprofil`,
   `createFachprofil`) anlegen. Bestehende Dateien werden nicht
   ueberschrieben.

### Vorlagen

Vorlagen liegen unter `templates/local-context/`:

- `lerngruppenprofil.CONTEXT.md` – Pflichtkontext, verwandter Kontext,
  faecheruebergreifende Beobachtungen, optionaler Planungskontext
- `fachprofil.CONTEXT.md` – Pflichtkontext, Verweis auf das Lerngruppenprofil
  (`../CONTEXT.md`), fachliche Besonderheiten, optionaler Planungskontext

---

## Verfuegbare MCP-Tools

| Tool | Verwendung |
|---|---|
| `moodle_get_sections` | Abschnitte eines Kurses lesen |
| `moodle_get_modules` | Aktivitaeten + cmids eines Abschnitts lesen |
| `moodle_get_course_catalog` | Kompakte, filterbare read-only Moodle-Katalogansicht fuer Planung lesen |
| `moodle_update_section` | Abschnittsname und bei Planbezug Abschnittseinstieg setzen |
| `moodle_move_section` | Bestehenden Abschnitt ohne Inhaltsaenderung an eine neue Position verschieben |
| `moodle_create_label` | Phasen-Header oder knappen Trenner anlegen |
| `moodle_create_page` | Textseite anlegen (nur lesen) |
| `moodle_create_url` | Externen Link anlegen |
| `moodle_create_assign` | Aufgabe anlegen |
| `moodle_update_label` | Label bearbeiten |
| `moodle_update_page` | Textseite bearbeiten |
| `moodle_update_assign` | Aufgabe bearbeiten |
| `moodle_update_url` | Link bearbeiten |
| `moodle_ensure_question_bank` | Benannte Kurs-/Projekt-Fragensammlung anlegen oder wiederverwenden (idempotent) |
| `moodle_create_question_category` | Fragenbank-Kategorie je Unterthema/Inhaltsabschnitt in ausgewählter Fragensammlung anlegen (idempotent) |
| `moodle_update_question_category` | Fragenbank-Kategorie nicht-destruktiv umbenennen und/oder in die richtige Fragensammlung/Zielkategorie verschieben |
| `moodle_get_question_categories` | Vorhandene Fragenbank-Kategorien einer ausgewählten Fragensammlung lesen |
| `moodle_create_quiz` | Quiz (mod_quiz) anlegen – Modus waehlt komplette Settings-Kombination (siehe unten) |
| `moodle_update_quiz_settings` | Bestehendes Quiz nachträglich auf eine Kurspilot-Settings-Kombination umstellen |

---

## Quiz-Modi (`moodle_create_quiz`, `moodle_update_quiz_settings`)

Quizze werden über den Parameter `mode` in einer von drei dokumentierten
Settings-Kombinationen angelegt oder nachträglich aktualisiert. Default ist
`lernstandscheck`. `gradepass` und `timelimit` können explizit gesetzt werden
und überschreiben dann den Modus-Default (Layered Defaults). Den Wert `test`
nicht als Modusnamen verwenden, weil er mit der Moodle-Testaktivität
verwechselt wird.

| Modus | Frageverhalten | Versuche | Bewertungsmethode | Layout | Wartezeit | Review-Sichtbarkeit | gradepass |
|---|---|---|---|---|---|---|---|
| `mini-check` | `immediatecbm` (direkte Auswertung mit Selbsteinschätzung) | unbegrenzt (0) | beste Bewertung (`QUIZ_GRADEHIGHEST`) | eine Frage pro Seite, freie Navigation | keine | richtige Antwort nicht anzeigen, Gesamtfeedback sichtbar | 80 % |
| `lernstandscheck` (Default) | `deferredcbm` (spätere Auswertung mit Selbsteinschätzung) | unbegrenzt (0) | beste Bewertung (`QUIZ_GRADEHIGHEST`) | alle Fragen auf einer Seite, freie Navigation | mindestens 5 Minuten | richtige Antwort nicht anzeigen, Gesamtfeedback für Lernplanung sichtbar | 80 % |
| `abschlusstest` | `deferredfeedback` (spätere Auswertung ohne Selbsteinschätzung) | maximal 2 | Mittelwert (`QUIZ_GRADEAVERAGE`) | alle Fragen auf einer Seite, freie Navigation | mindestens 15 Minuten | richtige Antwort nicht anzeigen, Gesamtfeedback sichtbar | 80 % |

### Schueler-Erfahrung und Monitoring-Tradeoffs

- **Mini-Check (`mini-check`):** Kurzer Kompetenzcheck mit direkter Auswertung,
  unbegrenzten Versuchen und ohne Wartezeit. Gut für schnelle Orientierung und
  unmittelbares Üben.
- **Lernstandscheck (`lernstandscheck`, Default):** Spätere Auswertung mit
  Selbsteinschätzung und Gesamtfeedback für Lernplanung. Gut, wenn die Lehrkraft
  und die Schüler:innen den nächsten Lernschritt aus dem Ergebnis ableiten
  sollen.
- **Abschlusstest (`abschlusstest`):** Abschlusstest mit Verbesserungsmöglichkeit,
  keine Klassenarbeit. Zwei Versuche mit Wartezeit und Mittelwertbildung halten
  den Fokus auf Abschluss und Verbesserung statt auf einmalige Bewertung.

Aus Kompatibilitätsgründen nimmt das Plugin die alten Werte `intensiv`,
`lerncheck` und `bewertung` noch an und mappt sie intern auf `mini-check`,
`lernstandscheck` und `abschlusstest`. Neue Aufrufe sollen nur die neuen
Modusnamen verwenden.

### Wann welcher Modus?

- Schnelle Orientierung oder kurze Übungsphase → `mini-check`.
- Lernstand am Unterthema-Ende mit Lernplanung → `lernstandscheck`.
- Abschluss eines Lernabschnitts mit Verbesserungsmöglichkeit → `abschlusstest`.

---

## Fragenbank-Kategorien benennen (Kurs-Fragensammlung)

Vor dem ersten Kategorien- oder Fragenzugriff wird immer zuerst eine
**benannte Kurs-Fragensammlung** per `moodle_ensure_question_bank`
festgelegt. Der vorgeschlagene Name muss fuer Lehrkraefte lesbar sein und
sich am Kurs, Thema oder fachlichen Inhalt orientieren, zum Beispiel
`Biologie 9a - Immunsystem` oder `Chemie EF - Saeuren und Basen`. Kein
technisches Praefix wie `Kurspilot`.

Diese Fragensammlung ist selbst schon eine **Planungsentscheidung**: In der
Vorschau wird Name + Struktur gezeigt, die Lehrkraft kann den Namen vor dem
Moodle-Schreibzugriff bestaetigen oder aendern. Standard-Struktur:

- Fragensammlung = Kurs oder fachliches Kurspilot-Projekt
- darunter Kategorien je **Unterthema**
- darunter bei Bedarf **nummerierte Inhaltsabschnitte**

Erst danach werden Fragenbank-Kategorien **wie der zugehoerige nummerierte
Inhaltsabschnitt** benannt: `<Nummer> <Titel>`, z.B.
`7.2 Stoffe und ihre Eigenschaften` fuer den gleichnamigen Kursabschnitt. So
bleiben Fragen spaeter nach Unterthema/Abschnitt sortier- und wiederfindbar
(siehe **Kurs-Fragensammlung** und **Nummerierter Inhaltsabschnitt** in
`CONTEXT.md`).

`moodle_create_question_category` ist idempotent: existiert in der
ausgewaehlten Fragensammlung bereits eine Kategorie mit identischem Namen
unter demselben `parent`, wird KEINE Dublette angelegt - stattdessen liefert
das Tool die bestehende `id` mit `created=false` zurueck. Ohne `parent`-Angabe
wird die Kategorie direkt unter der Top-Kategorie der ausgewaehlten
Fragensammlung angelegt (`parent=0`).

### Fragensammlungs-Bereinigung (nicht-destruktiv)

Wenn Fragenkategorien an der falschen Stelle gelandet sind, wird fuer die
Bereinigung kein Delete-Tool verwendet. Stattdessen verschiebt
`moodle_update_question_category` eine bestehende Kategorie nicht-destruktiv in
die richtige benannte Kurs-/Projekt-Fragensammlung oder unter eine andere
Zielkategorie und kann sie dabei bei Bedarf umbenennen. Fragen und
Unterkategorien bleiben erhalten.

Vor dem Aufruf ist eine Vorschau/Freigabe Pflicht: Zeige der Lehrkraft immer
die Quelle, das Ziel und die betroffenen Kategorien (mindestens die zu
verschiebende Hauptkategorie und bekannte Unterkategorien), plus den geplanten
neuen Namen oder Ziel-Parent. Erst nach ausdruecklicher Freigabe wird
verschoben oder umbenannt. Loeschen von Fragen oder Kategorien gehoert weiter
nicht zu V1.

---

## Implementierungsplan-Workflow (Pflicht vor jedem Schreibzugriff)

Bevor irgendein schreibendes MCP-Tool aufgerufen wird (`moodle_create_*`,
`moodle_update_*`, `moodle_move_section`, `moodle_set_completion`,
`moodle_set_restriction`), wird immer zuerst ein **Implementierungsplan**
erstellt und der Lehrkraft als **gestufte Vorschau** gezeigt. Erst nach
expliziter Freigabe ("ja, so umsetzen", "Plan ist gut, leg los",
"freigegeben") werden die Aenderungen in Moodle geschrieben.

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
   (`setQuestionBank(plan, { courseName, projectName, topicName, ... })`).
   Fuer jede geplante Aktivitaet danach Typ, Name, Inhalt/Beschreibung, ob sie
   ein Lernpfad-Gate ist und ob eine digitale Abgabe vorgesehen ist
   (`isGate`, `hasDigitalSubmission`) angeben. `addActivity` leitet daraus
   automatisch die passende Completion-Konfiguration ab (siehe
   Planungsgrundsaetze unten).
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

### Abschnittsverschiebung

Fuer eine reine **Abschnittsverschiebung** wird die geplante neue
Abschnittsreihenfolge zuerst in `plan.md` nachgefuehrt und von der Lehrkraft
bestaetigt; erst danach wird `moodle_move_section` ausgefuehrt. Eine
planexterne Ausnahme ist nur erlaubt, wenn die Lehrkraft ausdruecklich
bestaetigt, dass der freigegebene Plan fachlich unveraendert bleibt und nur
der bestehende Moodle-Kurs organisatorisch sortiert werden soll. Dann ist vor
dem Moodle-Schreibzugriff ein Journal-Eintrag Pflicht, und es werden keine
weiteren Abschnittsinhalte oder Sichtbarkeiten mitveraendert.

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

### Quiz/Fragen im Implementierungsplan planen (Issue #20)

Testaktivitaeten und ihre Fragen werden genauso geplant wie andere
Aktivitaeten – ueber `addQuiz` und `addQuestion` aus
`lib/implementation-plan.js`, mit denselben Schritten (Plan aufbauen,
Kurzuebersicht zeigen, Freigabe abwarten).

1. **Fragensammlung festlegen** (`setQuestionBank(plan, { ... })`): vor dem
   ersten Quiz die benannte Kurs-/Projekt-Fragensammlung als
   Planungsentscheidung festlegen. `getOverview(plan)` zeigt diese
   Entscheidung sichtbar mit Name + Struktur; die Lehrkraft kann sie vor der
   Freigabe bestaetigen oder aendern. Vor dem Moodle-Schreibzugriff wird die
   gewaehlte Fragensammlung mit `moodle_ensure_question_bank` aufgeloest; die
   Rueckgabe `questionbankid` wird fuer Kategorien und spaetere Fragen genutzt.
2. **Quiz hinzufuegen** (`addQuiz(plan, sectionnum, quizInput)`): duenner
   Wrapper um `addActivity` mit `type: 'quiz'`. Ohne `mode`-Angabe gilt
   **QUIZ_LERNCHECK_MODE_DEFAULT** (`mode: 'lernstandscheck'`, siehe
   "Quiz-Modi" oben) und **QUIZ_PASS_COMPLETION_DEFAULT**
   (`completion=2, completionpassgrade=1` – **Bestehensabschluss**,
   CONTEXT.md). Ein anderer Modus (`mini-check`, `abschlusstest`) oder eine
   abweichende Completion-Konfiguration ist eine **Planabweichung** und
   braucht `deviationReason` (gleiche Regel wie oben).
3. **Fragen hinzufuegen** (`addQuestion(plan, quizActivityId, questionInput)`):
   `questionInput` hat dieselbe Form wie `moodle_create_mc_question`
   (`questiontext`, `answers`, `correctindex`, `generalfeedback`) plus
   `referencedActivityId` – die **Bezugsaktivitaet** (CONTEXT.md), also die
   `id` einer bereits im Plan vorhandenen Aktivitaet, aus der die Frage
   beantwortbar ist. `addQuestion` berechnet automatisch die lesbare
   Fragenvorschau (`previewMcQuestion`, #14) und legt sie in
   `quiz.questions[].preview` ab.
4. **Materialluecken erkennen**: Hat eine Frage keine aufloesbare
   `referencedActivityId` (fehlt oder zeigt auf keine Plan-Aktivitaet), wird
   sie als **Materialluecke** (CONTEXT.md) markiert
   (`question.materialGap = true`) und erscheint in `plan.materialGaps`
   sowie in der Kurzuebersicht. Materialluecken-Fragen werden bei
   `applyPlan` NICHT angelegt – keine `moodle_create_mc_question`- oder
   `moodle_add_questions_to_quiz`-Aufrufe. Der Lehrkraft werden
   Materialluecken VOR der Freigabe gezeigt; sie entscheidet, ob Material
   ergaenzt (**Freigegebene Materialergaenzung**, siehe #19) oder die Frage
   angepasst wird.
5. **Freigabe & Anwendung** (`applyPlan`): legt das Quiz an
   (`moodle_create_quiz` mit `mode`/`gradepass`/`timelimit`), setzt
   Completion/Restriction, legt dann jede nicht-Materialluecken-Frage per
   `moodle_create_mc_question` an und haengt alle erzeugten Fragen in einem
   Aufruf per `moodle_add_questions_to_quiz` (#13) ein. `activity.categoryid`
   (Fragenbank-Kategorie, siehe oben "Fragenbank-Kategorien benennen") muss
   gesetzt sein, wenn das Quiz Fragen enthaelt; diese Kategorie liegt in der
   zuvor bestaetigten benannten Fragensammlung.

---

## Journal & Weiterarbeiten

Das **Journal** (siehe CONTEXT.md) haelt Planungen, Freigaben,
Moodle-Aenderungen und Kontextaenderungen in datierten, nie ueberschriebenen
Markdown-Dateien fest – als Gedaechtnis ohne Git. Die Logik dafuer lebt in
`lib/journal.js` (isoliert testbar, keine Moodle-Abhaengigkeit, siehe
`test/journal.test.js`).

### Dokumentationsroutine waehrend der Arbeit

Wie beim `grill-with-docs`-Skill werden geklaerte Begriffe und Entscheidungen
nicht erst am Sitzungsende gesammelt, sondern sofort dokumentiert, sobald sie
fuer spaetere Unterrichtsplanung wiederverwendbar sind. Der Chatverlauf ist
kein verlaessliches Gedaechtnis.

Als dokumentationswuerdig gelten insbesondere:

- Lerngruppenentscheidungen: Leistungsstand, Gruppendynamik,
  Differenzierungsbedarf, Sprachstand, technische Rahmenbedingungen,
  besondere Beobachtungen zur Klasse oder Teilgruppe.
- Fach- und Unterrichtsentscheidungen: Kompetenzstand, fachliche
  Schwerpunkte, Materialauswahl, Materialumbenennungen, OCR-/Bildentscheidungen,
  Testmodus, Bestehensgrenzen, Lernpfad-Gates, vertagte Materialluecken.
- Moodle-Planungsentscheidungen: Abschnittsentscheidung, Phasenmodell,
  Planabweichungen, Freigabe-Voraussetzungen, digitale Abgaben,
  bewusst verworfene Alternativen.
- Kontextentscheidungen: welche Klasse, Teilgruppe, Fachprofil oder welcher
  Unterrichtsordner fuer eine Planung gilt.

Vorgehen:

1. Sobald eine solche Entscheidung geklaert ist, den passenden Speicherort
   bestimmen (siehe Journal-Ablage unten).
2. Fehlt der noetige `local-context/`-Pfad, nicht still ohne Gedaechtnis
   weiterarbeiten: kurz den **Pflichtkontext** klaeren und ein niedrigschwelliges
   **Erklaerendes Setup** mit Vorschau anbieten. Nach Bestaetigung werden die
   passenden `CONTEXT.md`-Dateien angelegt und die Notiz direkt ins Journal
   geschrieben.
3. Die Notiz als eigenen Journal-Eintrag per `recordWorkflowNote(
   { schuljahr, klasse, unterrichtsordner, date, note })` aus `lib/journal.js`
   anhaengen. Die Routine waehlt den Journal-Scope aus dem Notiztyp
   automatisch (`lerngruppe` -> Klassenjournal; `unterricht`, `material`,
   `test`, `moodle-planung` -> Unterrichtsordner-Journal; `kontext` je nach
   vorhandener Fachzuordnung). Bestehende Journal- oder Kontextdateien werden
   nie direkt ueberschrieben.
4. Wenn die Entscheidung einen kanonischen Produkt-/Domainbegriff fuer
   Kurspilot selbst klaert, stattdessen oder zusaetzlich `CONTEXT.md` im Repo
   aktualisieren. ADRs nur sparsam nutzen, wenn die Entscheidung schwer
   rueckgaengig, ohne Kontext ueberraschend und das Ergebnis eines echten
   Trade-offs ist.

Eintraege knapp, aber spaeter nutzbar formulieren: Was wurde entschieden,
warum, fuer welche Lerngruppe oder welches Unterthema, und was bleibt offen?

### Journal-Ablage

`journalPath({ schuljahr, klasse, unterrichtsordner }, scope, date)` berechnet
den Pfad zur Journal-Datei des Tages (`journal-YYYY-MM-DD.md`), analog zu
`lib/local-context-paths.js`:

| scope | Ablage |
|---|---|
| `'klasse'` | `local-context/<schuljahr>/<klasse>/journal-<datum>.md` – allgemeine Lerngruppenentwicklung (faecheruebergreifend) |
| `'unterrichtsordner'` | `local-context/<schuljahr>/<klasse>/<unterrichtsordner>/journal-<datum>.md` – fachliche Planung, Moodle-Umsetzung, Material, Testfragen |

Die **Journal-Ablage** folgt automatisch dem Kontextort der Aenderung. Nur bei
echter Mehrdeutigkeit (z.B. unklar, ob eine Notiz die ganze Klasse oder nur
ein Fach betrifft) kurz nachfragen – sonst automatisch entscheiden. Ein
Schuljahresjournal ist kein Standard.

### Wann entstehen Journal-Eintraege?

Journal-Eintraege entstehen waehrend des gesamten Workflows, nicht nur nach
Moodle-Schreibzugriff:

- direkt nach jeder dokumentationswuerdigen Lerngruppen-, Fach-, Material-,
  Test- oder Moodle-Planungsentscheidung (siehe Dokumentationsroutine oben),
- nach Kontext-Onboarding oder bewusster Ergaenzung eines Profils,
- nach Material-Ingestion, Umbenennung, OCR-Kontrolle oder Bildausschnitt,
- nach jedem freigegebenen und ausgefuehrten Implementierungsplan.

Nach jedem freigegebenen und ausgefuehrten Implementierungsplan
(`applyPlan(plan, { approved: true, client })`, siehe
"Implementierungsplan-Workflow" oben) wird automatisch ein
**Umsetzungsbericht** als neuer Journal-Eintrag angehaengt:

1. `formatUmsetzungsbericht(planResult)` formatiert das Rueckgabeformat von
   `applyPlan()` als Markdown mit den Abschnitten "Erfolge" (mit
   Moodle-IDs/Links), "Fehler" und "Offene Nacharbeit".
2. `appendJournalEntry(journalPath(context, scope, date), entryMarkdown)`
   haengt den Bericht an die Journal-Datei des Tages an. Existiert die Datei
   noch nicht, wird sie mit Header neu angelegt. Bestehende Eintraege werden
   **nie** ueberschrieben, auch nicht bei mehreren Eintraegen am selben Tag.

Auch ausserhalb von Umsetzungsberichten gilt: fuer Entscheidungen
`recordWorkflowNote`, fuer andere Spezialformate `appendJournalEntry`, nie
durch direktes Ueberschreiben der Datei.

### Weiterarbeiten-Routine (Sitzungsstart)

Bei natuerlichen Startformulierungen wie "Setze meine Planung fuer 7a Nawi
fort" oder "Wo standen wir bei 7a?":

1. Passenden Kontext laden (Lerngruppenprofil/Fachprofil aus
   `local-context/`, siehe Kontext-Onboarding oben).
2. Relevante Journal-Dateien sammeln (Klassen- und/oder
   Unterrichtsordner-Journal der letzten Eintraege).
3. `findOpenNacharbeit(journalFiles)` durchsucht diese Dateien nach
   Eintraegen im Abschnitt "Offene Nacharbeit" und liefert eine flache Liste
   `{ file, date, text }`.
4. Gefundene Punkte werden der Lehrkraft als **Nacharbeitsvorschlag**
   zusammengefasst angeboten – z.B. "Aus dem letzten Eintrag (2026-06-10) ist
   noch offen: ... Soll das jetzt angegangen werden?"

**Wichtig:** Die Weiterarbeiten-Routine arbeitet offene Punkte NICHT automatisch
ab. Sie macht nur einen Vorschlag; die Lehrkraft entscheidet, ob und womit
weitergearbeitet wird.

---

## Workflow

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

---

## Aktivitaetstypen waehlen

| Situation | Tool |
|---|---|
| SuS liest nur (Infoblatt, Leitfaden, Anleitung, Codebeispiel) | `moodle_create_page` |
| SuS fuellt etwas aus / gibt etwas ab / reflektiert | `moodle_create_assign` |
| Externe Dokumentation, GitHub, MDN, Referenz | `moodle_create_url` |
| Phasen-Trenner (direkt auf Kursseite sichtbar) | `moodle_create_label` |

**GOLDENE REGEL:** Sobald SuS irgendetwas ausfullen, eintragen, ankreuzen
oder hochladen sollen -> IMMER `moodle_create_assign`, NIEMALS `moodle_create_page`!

---

## HTML-Vorlagen

Keine dieser Vorlagen ist Pflicht. Nutze nur die sichtbaren Elemente, die im
Auftrag, Material oder freigegebenen Implementierungsplan fachlich begruendet
sind. Wenn eine schlichtere Darstellung denselben Zweck erfuellt, ist sie die
richtige Wahl.

### Geplanter Abschnittseinstieg (optional fuer moodle_update_section summary)

Nur verwenden, wenn ein freigegebener Plan fuer diesen Abschnitt ausdruecklich
einen sichtbaren Einstieg vorsieht. Das gilt auch fuer Abschnitt 0
("Allgemeines"): fachlicher Inhalt ja, automatischer Kurspilot-Prozesscontainer
nein.

Ersetze alle [PLATZHALTER] mit echten Inhalten aus der Unterrichtseinheit bzw. dem Unterthema:

```html
<div style="background:linear-gradient(135deg,#1a237e,#283593);border-radius:12px;padding:0;margin-bottom:20px;overflow:hidden;box-shadow:0 4px 15px rgba(0,0,0,0.2);">
  <div style="background:rgba(255,255,255,0.1);padding:12px 20px;display:flex;align-items:center;gap:10px;">
    <span style="font-size:1.4em;">&#127919;</span>
    <div>
      <div style="color:rgba(255,255,255,0.7);font-size:0.75em;font-weight:600;letter-spacing:2px;text-transform:uppercase;">UNTERTHEMA [NR] — [TITEL]</div>
      <div style="color:#fff;font-size:1.1em;font-weight:700;">Ausgangssituation</div>
    </div>
  </div>
  <div style="background:#fff;margin:0 16px 16px;border-radius:8px;padding:20px;">
    <p style="color:#333;line-height:1.7;margin-bottom:16px;">[SITUATIONSBESCHREIBUNG AUS DER UNTERRICHTSEINHEIT/DEM UNTERTHEMA]</p>
    <div style="border-top:2px solid #e8eaf6;padding-top:14px;">
      <div style="color:#1a237e;font-size:0.75em;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:10px;">&#127919; LERNERGEBNISSE</div>
      <ul style="margin:0;padding-left:20px;color:#444;line-height:2;">
        <li>[ERGEBNIS 1 AUS DER UNTERRICHTSEINHEIT/DEM UNTERTHEMA]</li>
        <li>[ERGEBNIS 2 AUS DER UNTERRICHTSEINHEIT/DEM UNTERTHEMA]</li>
      </ul>
    </div>
  </div>
</div>
```

### Phasen-Header (fuer moodle_create_label content)

```html
<div style="background:linear-gradient(135deg,[FARBE]dd,[FARBE]);border-radius:10px;padding:16px 20px;margin:10px 0;box-shadow:0 3px 10px rgba(0,0,0,0.15);">
  <div style="display:flex;align-items:center;gap:14px;">
    <span style="font-size:2em;">[ICON]</span>
    <div>
      <div style="color:rgba(255,255,255,0.8);font-size:0.7em;font-weight:700;letter-spacing:2px;text-transform:uppercase;">PHASE [NR]</div>
      <div style="color:#fff;font-size:1.25em;font-weight:700;">[PHASENNAME]</div>
      <div style="color:rgba(255,255,255,0.85);font-size:0.82em;margin-top:3px;">&#9203; ca. [ZEIT] Minuten &nbsp;•&nbsp; [SOZIALFORM]</div>
    </div>
  </div>
</div>
```

Farben und Icons frei waehlen, aber pro Kurs konsistent halten.
Empfehlungen (nicht verpflichtend):

| Typ | Farbe | Icon |
|---|---|---|
| Analyse / Recherche | #1565C0 (Blau) | &#128269; |
| Planung / Konzept | #6A1B9A (Lila) | &#128203; |
| Umsetzung / Implementierung | #E65100 (Orange) | &#9881;&#65039; |
| Test / Kontrolle | #2E7D32 (Gruen) | &#9989; |
| Reflexion / Praesentation | #00695C (Teal) | &#128172; |
| Analyse / Problem | #B71C1C (Rot) | &#128270; |
| Dokumentation | #37474F (Grau) | &#128196; |

### Textseite mit Syntax-Highlighting (fuer moodle_create_page content)

Nur einbinden wenn die Seite tatsaechlich Code enthaelt:

```html
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/atom-one-dark.min.css">
<script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/languages/[SPRACHE].min.js"></script>
<script>document.addEventListener('DOMContentLoaded', function(){ hljs.highlightAll(); });</script>

<div style="font-family:Arial,sans-serif;max-width:900px;margin:0 auto;padding:20px;">
  <h2 style="color:[PHASENFARBE];border-bottom:3px solid [PHASENFARBE];padding-bottom:8px;">[TITEL]</h2>
  <div style="background:[PHASENFARBE_HELL];border-left:4px solid [PHASENFARBE];padding:16px;border-radius:4px;margin-bottom:24px;">
    <strong>Lernziel:</strong> [LERNZIEL AUS DER UNTERRICHTSEINHEIT/DEM UNTERTHEMA]
  </div>

  <h3 style="color:[PHASENFARBE];">[ABSCHNITTSTITEL]</h3>
  <p>[ERKLAERUNGSTEXT]</p>
  <pre><code class="language-[SPRACHE]">// Code hier
  </code></pre>
</div>
```

Verfuegbare Sprachen: cpp, python, javascript, java, bash, ini, json, html, css, sql

Fuer Seiten OHNE Code: highlight.js weglassen, nur den div-Container verwenden.

### Aufgabe (fuer moodle_create_assign description)

Grundsatz: Aufgaben enthalten nur die fuer den Arbeitsauftrag noetigen
sichtbaren Elemente. Abgabehinweise, Print-/PDF-Hinweise, Banner oder
Zusatzbuttons nur verwenden, wenn sie im Material stehen, im Plan begruendet
sind oder von der Lehrkraft ausdruecklich freigegeben wurden.

```html
<div style="font-family:Arial,sans-serif;padding:20px;">

  <div style="background:[PHASENFARBE_HELL];border-left:4px solid [PHASENFARBE];padding:16px;border-radius:4px;margin-bottom:24px;">
    <strong>Arbeitsauftrag:</strong> [AUFGABENSTELLUNG AUS DER UNTERRICHTSEINHEIT/DEM UNTERTHEMA]
  </div>

  [AUFGABEN_INHALT]

  [OPTIONALER_ABGABEHINWEIS_NUR_WENN_GEPLANT]

</div>
```

---

## Interaktive Elemente in Aufgaben

### Texteingabe

```html
<!-- Kurze Antwort -->
<input type="text" style="width:90%;padding:6px;border:1px solid #bbb;border-radius:4px;"
  placeholder="[OFFENER HINWEIS WAS EINZUTRAGEN IST – KEINE LOESUNG!]"/>

<!-- Lange Antwort -->
<textarea style="width:100%;border:1px solid #bbb;border-radius:4px;padding:8px;font-family:Arial;font-size:14px;" rows="3"
  placeholder="[OFFENER HINWEIS – z.B. 'Beschreibe in eigenen Worten...' – KEINE LOESUNG!]"></textarea>
```

### Checkbox und Radio

```html
<!-- Abhakbare Checkbox (NIEMALS &#9744; verwenden – das ist statisch!) -->
<input type="checkbox" style="width:20px;height:20px;cursor:pointer;accent-color:#2E7D32;"/>

<!-- Bewertungsskala (pro Zeile eigenen name-Wert!) -->
<input type="radio" name="bewertung_zeile1" value="1"/> 1 &nbsp;
<input type="radio" name="bewertung_zeile1" value="2"/> 2 &nbsp;
<input type="radio" name="bewertung_zeile1" value="3"/> 3
```

### PFLICHTREGELN fuer Placeholder-Texte

**FALSCH – verrät die Lösung:**
```html
placeholder="T = 0,2 Sekunden"
placeholder="delay = 100ms"
placeholder="board = esp32dev"
placeholder="z.B. GET"
placeholder="z.B. arduino"
```

**RICHTIG – gibt nur Hinweis auf Format/Denkrichtung:**
```html
placeholder="Berechne T aus der Frequenz..."
placeholder="T/2 ergibt den delay-Wert"
placeholder="Welches Board wird verwendet?"
placeholder="Welche HTTP-Methode liest Daten?"
placeholder="Welches Framework nutzt PlatformIO?"
```

**GOLDENE REGEL fuer Placeholders:**
Ein Placeholder darf NIEMALS die gesuchte Antwort enthalten oder direkt darauf hinweisen.
Er darf nur sagen WAS einzutragen ist, nicht WAS die Antwort ist.
Bei Zweifeln: lieber generisch ("Deine Antwort...") als zu konkret.

### Tabellen mit Eingabefeldern

```html
<!-- RICHTIG: Nur Anker vorgeben, Inhalte durch SuS erarbeiten -->
<table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
  <thead style="background:[PHASENFARBE];color:white;">
    <tr>
      <th style="padding:10px;">[BEKANNTE SPALTE]</th>
      <th style="padding:10px;">[ZU ERARBEITENDE SPALTE 1]</th>
      <th style="padding:10px;">[ZU ERARBEITENDE SPALTE 2]</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td style="padding:10px;border:1px solid #ddd;">[VORGEGEBENER WERT]</td>
      <td style="padding:10px;border:1px solid #ddd;">
        <input type="text" style="width:90%;padding:4px;border:1px solid #bbb;border-radius:4px;"
          placeholder="[HINWEIS WAS ZU BERECHNEN/RECHERCHIEREN IST]"/>
      </td>
      <td style="padding:10px;border:1px solid #ddd;">
        <input type="text" style="width:90%;padding:4px;border:1px solid #bbb;border-radius:4px;"
          placeholder="[HINWEIS WAS ZU BERECHNEN/RECHERCHIEREN IST]"/>
      </td>
    </tr>
  </tbody>
</table>
```

---

## Zeichen-Canvas (fuer Skizzen, Schaltplaene, Diagramme)

Immer wenn SuS etwas zeichnen sollen (Schaltplan, UML, Flussdiagramm, Wireframe,
Netzwerktopologie, Skizze etc.), diesen Canvas einbauen.
NIEMALS einen leeren Kasten oder Platzhalter-Div verwenden.

Parameter anpassen:
- CANVAS_ID: eindeutige ID (z.B. "schaltplan", "uml", "wireframe")
- CANVAS_HOEHE: 200 / 300 / 400 / 500 je nach Bedarf
- PHASENFARBE: Rahmenfarbe der aktuellen Phase
- DATEINAME: z.B. "schaltplan.png", "uml-diagramm.png"

```html
<div id="toolbar_[CANVAS_ID]" style="display:flex;gap:8px;align-items:center;margin-bottom:8px;flex-wrap:wrap;">
  <button onclick="setTool_[CANVAS_ID]('pen')" id="btn_pen_[CANVAS_ID]"
    style="padding:6px 12px;border:2px solid [PHASENFARBE];border-radius:6px;background:[PHASENFARBE];color:#fff;cursor:pointer;font-size:0.85em;">&#9998; Stift</button>
  <button onclick="setTool_[CANVAS_ID]('line')" id="btn_line_[CANVAS_ID]"
    style="padding:6px 12px;border:2px solid #555;border-radius:6px;background:#fff;color:#333;cursor:pointer;font-size:0.85em;">&#9135; Linie</button>
  <button onclick="setTool_[CANVAS_ID]('rect')" id="btn_rect_[CANVAS_ID]"
    style="padding:6px 12px;border:2px solid #555;border-radius:6px;background:#fff;color:#333;cursor:pointer;font-size:0.85em;">&#9645; Rechteck</button>
  <button onclick="setTool_[CANVAS_ID]('eraser')" id="btn_eraser_[CANVAS_ID]"
    style="padding:6px 12px;border:2px solid #555;border-radius:6px;background:#fff;color:#333;cursor:pointer;font-size:0.85em;">&#9746; Radierer</button>
  <span style="color:#ccc;">|</span>
  <label style="font-size:0.85em;color:#555;">Farbe:</label>
  <input type="color" id="color_[CANVAS_ID]" value="#000000" style="width:32px;height:28px;border:1px solid #ccc;border-radius:4px;cursor:pointer;padding:2px;">
  <label style="font-size:0.85em;color:#555;">Groesse:</label>
  <input type="range" id="size_[CANVAS_ID]" min="1" max="20" value="2" style="width:70px;">
  <span id="sizelabel_[CANVAS_ID]" style="font-size:0.85em;color:#555;">2px</span>
  <span style="color:#ccc;">|</span>
  <button onclick="undoCanvas_[CANVAS_ID]()"
    style="padding:6px 12px;border:2px solid #1565C0;border-radius:6px;background:#fff;color:#1565C0;cursor:pointer;font-size:0.85em;">&#8617; Undo</button>
  <button onclick="clearCanvas_[CANVAS_ID]()"
    style="padding:6px 12px;border:2px solid #e53935;border-radius:6px;background:#fff;color:#e53935;cursor:pointer;font-size:0.85em;">&#128465; Leeren</button>
  <button onclick="downloadCanvas_[CANVAS_ID]()"
    style="padding:6px 12px;border:2px solid #2E7D32;border-radius:6px;background:#2E7D32;color:#fff;cursor:pointer;font-size:0.85em;">&#128229; Als PNG speichern</button>
</div>
<style>@media print { #toolbar_[CANVAS_ID] { display:none !important; } }</style>

<canvas id="canvas_[CANVAS_ID]" width="900" height="[CANVAS_HOEHE]"
  style="border:2px solid [PHASENFARBE];border-radius:8px;cursor:crosshair;background:#fff;width:100%;touch-action:none;display:block;"></canvas>

<script>
(function() {
  const canvas = document.getElementById('canvas_[CANVAS_ID]');
  const ctx = canvas.getContext('2d');
  const FARBE = '[PHASENFARBE]';
  let tool = 'pen', drawing = false, startX = 0, startY = 0, lastX = 0, lastY = 0;
  let history = [], snapshot = null;

  function getPos(e) {
    const rect = canvas.getBoundingClientRect();
    const sx = canvas.width / rect.width, sy = canvas.height / rect.height;
    const src = e.touches ? e.touches[0] : e;
    return { x: (src.clientX - rect.left) * sx, y: (src.clientY - rect.top) * sy };
  }
  function saveHistory() {
    history.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
    if (history.length > 30) history.shift();
  }
  function startDraw(e) {
    e.preventDefault(); drawing = true;
    const p = getPos(e); startX = lastX = p.x; startY = lastY = p.y;
    saveHistory();
    if (tool === 'line' || tool === 'rect') snapshot = ctx.getImageData(0, 0, canvas.width, canvas.height);
  }
  function draw(e) {
    e.preventDefault(); if (!drawing) return;
    const p = getPos(e);
    const color = document.getElementById('color_[CANVAS_ID]').value;
    const size = parseInt(document.getElementById('size_[CANVAS_ID]').value);
    if (tool === 'pen') {
      ctx.beginPath(); ctx.moveTo(lastX, lastY); ctx.lineTo(p.x, p.y);
      ctx.strokeStyle = color; ctx.lineWidth = size; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke();
      lastX = p.x; lastY = p.y;
    } else if (tool === 'eraser') {
      ctx.beginPath(); ctx.moveTo(lastX, lastY); ctx.lineTo(p.x, p.y);
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = size * 4; ctx.lineCap = 'round'; ctx.stroke();
      lastX = p.x; lastY = p.y;
    } else if (tool === 'line') {
      ctx.putImageData(snapshot, 0, 0);
      ctx.beginPath(); ctx.moveTo(startX, startY); ctx.lineTo(p.x, p.y);
      ctx.strokeStyle = color; ctx.lineWidth = size; ctx.lineCap = 'round'; ctx.stroke();
    } else if (tool === 'rect') {
      ctx.putImageData(snapshot, 0, 0);
      ctx.beginPath(); ctx.strokeStyle = color; ctx.lineWidth = size;
      ctx.strokeRect(startX, startY, p.x - startX, p.y - startY);
    }
  }
  function stopDraw(e) { e.preventDefault(); drawing = false; snapshot = null; }

  canvas.addEventListener('mousedown', startDraw); canvas.addEventListener('mousemove', draw);
  canvas.addEventListener('mouseup', stopDraw); canvas.addEventListener('mouseleave', stopDraw);
  canvas.addEventListener('touchstart', startDraw, {passive:false});
  canvas.addEventListener('touchmove', draw, {passive:false});
  canvas.addEventListener('touchend', stopDraw, {passive:false});

  document.getElementById('size_[CANVAS_ID]').addEventListener('input', function() {
    document.getElementById('sizelabel_[CANVAS_ID]').textContent = this.value + 'px';
  });
  function updateButtons(active) {
    ['pen','line','rect','eraser'].forEach(function(t) {
      const btn = document.getElementById('btn_' + t + '_[CANVAS_ID]');
      if (!btn) return;
      btn.style.background = (t === active) ? FARBE : '#fff';
      btn.style.color = (t === active) ? '#fff' : '#333';
      btn.style.borderColor = (t === active) ? FARBE : '#555';
    });
    canvas.style.cursor = (active === 'eraser') ? 'cell' : 'crosshair';
  }
  window['setTool_[CANVAS_ID]'] = function(t) { tool = t; updateButtons(t); };
  window['undoCanvas_[CANVAS_ID]'] = function() { if (history.length > 0) ctx.putImageData(history.pop(), 0, 0); };
  window['clearCanvas_[CANVAS_ID]'] = function() {
    if (confirm('Zeichnung loeschen?')) { saveHistory(); ctx.clearRect(0, 0, canvas.width, canvas.height); }
  };
  window['downloadCanvas_[CANVAS_ID]'] = function() {
    const l = document.createElement('a'); l.download = '[DATEINAME]';
    l.href = canvas.toDataURL('image/png'); l.click();
  };
  updateButtons('pen');
})();
</script>
<p style="font-size:0.85em;color:#666;margin-top:8px;">
  &#128161; Tipp: Stift = Freihand, Linie = gerade Verbindung, Rechteck = Knoeten/Bloecke.
  Undo macht bis zu 30 Schritte rueckgaengig. PNG speichern und in Moodle hochladen.
  Alternativ: Papier-Skizze fotografieren und als Bild einreichen.
</p>
```

Mehrere Canvas auf einer Seite: Jede braucht eine eigene CANVAS_ID.

---

## Wichtige technische Hinweise

- KEINE Emojis in Aktivitaetstiteln (name-Feld) – Moodle-DB kein UTF8MB4
  Im HTML-Content HTML-Entities verwenden: &#127919; statt 🎯
- Abschnittsnummer ist 0-basiert: Abschnitt 1 = sectionnum: 1
- Nach jedem Tool-Aufruf kurz den Fortschritt berichten
- Codeseiten IMMER mit highlight.js: <pre><code class="language-XY">
- Zeichenaufgaben IMMER mit Canvas, NIEMALS mit leerem Div

### Mathematische Formeln (LaTeX / MathJax)

Moodle rendert LaTeX-Formeln automatisch via MathJax. Formeln IMMER in LaTeX-Notation schreiben:

| Darstellung | LaTeX |
|---|---|
| Inline-Formel | `\( f = \frac{1}{T} \)` |
| Block-Formel (eigene Zeile) | `\[ f = \frac{1}{T} \]` |
| Bruch | `\frac{Zaehler}{Nenner}` |
| Index unten | `U_{GPIO}` |
| Index oben | `cm^2` |
| Multiplikationszeichen | `\times` |
| Omega | `\Omega` |
| Einheit mit Abstand | `220\,\Omega` oder `1\,\text{Hz}` |

Beispiele aus der ESP32-Unterrichtseinheit:
```
\[ f = \frac{1}{T} \qquad T = 2 \times BLINK\_INTERVAL \qquad R = \frac{U_{GPIO} - U_{LED}}{I_{LED}} \]
```
```
Die Periodendauer betr&auml;gt \( T = 100\,\text{ms} \), also gilt \( f = 10\,\text{Hz} \).
```

NIEMALS Formeln als Plain-Text schreiben (z.B. `f = 1/T` oder `U_GPIO`).

### Benennung von Labels und Aktivitaeten (KRITISCH)

**Labels (Phasen-Header):** IMMER den `name`-Parameter setzen – er erscheint in der
Kursnavigation und gibt dem Phase-Trenner einen sichtbaren Namen:
```
moodle_create_label(name="Phase 1 – Informieren & Analysieren", content="...", ...)
```

**Aufgaben, Seiten und Links:** NIEMALS einen "Phase x –" Prefix im `name`-Feld verwenden.
Der Phasenkontext ergibt sich bereits aus dem Label darueber. Kurze, beschreibende Namen:
```
RICHTIG: name="Analysebogen: ESP32 und Kundenauftrag"
FALSCH:  name="Phase 1 – Analysebogen: ESP32 und Kundenauftrag"

RICHTIG: name="Frequenzberechnung und Schaltplan"
FALSCH:  name="Phase 2 – Frequenzberechnung und Schaltplan"
```

---

## Qualitaetspruefung vor dem Erstellen

Fuer jede Aktivitaet pruefen:

1. Textseite oder Aufgabe?
   - SuS liest nur → moodle_create_page
   - SuS gibt etwas ab → moodle_create_assign

2. Name korrekt?
   - Label: Hat es einen `name`-Parameter mit dem Phasennamen? → Pflicht!
   - Aufgabe/Seite/Link: Enthält der Name einen "Phase x –" Prefix? → Entfernen!

3. Placeholder-Texte korrekt?
   - Verrät der Placeholder die Antwort? → Anpassen!
   - Ist der Placeholder zu konkret (z.B. "z.B. esp32dev")? → Generischer formulieren!

4. Zeichenaufgaben?
   - Ist ein Canvas eingebaut? → Pflicht!

5. Tabellen mit Eingabefeldern?
   - Stehen in den Eingabefeldern schon die Antworten? → Leeren!
   - Sind die Placeholder neutral formuliert? → Pruefen!

---

## Grafiken in Textseiten und Aufgaben

Wenn eine Grafik das Verstaendnis foerdert, IMMER direkt als SVG oder base64 einbetten.
NIEMALS externe Bild-URLs verwenden (koennen wegfallen, brauchen Internetzugang).

### Wann eine Grafik sinnvoll ist

- Schaltplaene als Referenz (nicht zum Ausfullen – dafuer Canvas verwenden!)
- Hardwareaufbau / Verkabelung
- Architekturdiagramme, Systemuebersichten
- Flussdiagramme, Ablaufplaene
- Protokollablaeufe (z.B. HTTP-Request/Response)
- Netzwerktopologien
- UML-Diagramme als Vorlage/Referenz
- Vergleichende Darstellungen (Soll vs. Ist)
- Pinout-Diagramme fuer Microcontroller

### Methode 1: SVG (bevorzugt)

SVG direkt im HTML einbetten – vektorbasiert, skalierbar, kein Qualitaetsverlust.
Fuer technische Diagramme, Schaltplaene, Flussdiagramme.

Grundstruktur:
```html
<div style="margin:20px 0;text-align:center;">
  <svg viewBox="0 0 [BREITE] [HOEHE]" xmlns="http://www.w3.org/2000/svg"
    style="max-width:100%;height:auto;border:1px solid #e0e0e0;border-radius:8px;background:#fff;">

    <!-- Titel -->
    <text x="[MITTE]" y="24" text-anchor="middle"
      font-family="Arial" font-size="14" font-weight="bold" fill="#333">
      [DIAGRAMMTITEL]
    </text>

    <!-- Inhalt hier -->

  </svg>
  <p style="font-size:0.85em;color:#666;margin-top:6px;font-style:italic;">[BILDUNTERSCHRIFT]</p>
</div>
```

Haeufige SVG-Elemente:

```svg
<!-- Rechteck (z.B. Komponente, Block) -->
<rect x="50" y="50" width="120" height="60" rx="6"
  fill="#E3F2FD" stroke="#1565C0" stroke-width="2"/>
<text x="110" y="85" text-anchor="middle" font-family="Arial" font-size="13" fill="#1565C0">
  ESP32
</text>

<!-- Linie (z.B. Verbindung, Kabel) -->
<line x1="170" y1="80" x2="250" y2="80" stroke="#333" stroke-width="2"/>

<!-- Pfeil (z.B. Datenfluss) -->
<defs>
  <marker id="arrow" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto">
    <polygon points="0 0, 10 3.5, 0 7" fill="#333"/>
  </marker>
</defs>
<line x1="170" y1="80" x2="248" y2="80" stroke="#333" stroke-width="2" marker-end="url(#arrow)"/>

<!-- Kreis (z.B. Knoten, LED) -->
<circle cx="100" cy="100" r="20" fill="#FFF9C4" stroke="#F57F17" stroke-width="2"/>

<!-- Gestrichelte Linie -->
<line x1="50" y1="50" x2="200" y2="50" stroke="#999" stroke-width="1.5" stroke-dasharray="6,3"/>

<!-- Text mit Hintergrund -->
<rect x="45" y="28" width="70" height="22" rx="3" fill="#1565C0"/>
<text x="80" y="43" text-anchor="middle" font-family="Arial" font-size="11" fill="white">
  Label
</text>
```

Beispiel: Einfacher Schaltplan als SVG-Referenzgrafik

```html
<div style="margin:20px 0;text-align:center;">
  <svg viewBox="0 0 500 200" xmlns="http://www.w3.org/2000/svg"
    style="max-width:100%;height:auto;border:1px solid #e0e0e0;border-radius:8px;background:#fafafa;">

    <defs>
      <marker id="arr" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
        <polygon points="0 0, 8 3, 0 6" fill="#555"/>
      </marker>
    </defs>

    <!-- ESP32 -->
    <rect x="30" y="70" width="100" height="60" rx="6" fill="#E3F2FD" stroke="#1565C0" stroke-width="2"/>
    <text x="80" y="96" text-anchor="middle" font-family="Arial" font-size="12" font-weight="bold" fill="#1565C0">ESP32</text>
    <text x="80" y="113" text-anchor="middle" font-family="Arial" font-size="10" fill="#555">GPIO2</text>

    <!-- Widerstand -->
    <line x1="130" y1="100" x2="200" y2="100" stroke="#555" stroke-width="2"/>
    <rect x="200" y="88" width="60" height="24" rx="3" fill="#FFF9C4" stroke="#F57F17" stroke-width="2"/>
    <text x="230" y="104" text-anchor="middle" font-family="Arial" font-size="11" fill="#333">220 &#8486;</text>
    <line x1="260" y1="100" x2="320" y2="100" stroke="#555" stroke-width="2"/>

    <!-- LED -->
    <polygon points="320,82 320,118 355,100" fill="#A5D6A7" stroke="#2E7D32" stroke-width="2"/>
    <line x1="355" y1="82" x2="355" y2="118" stroke="#2E7D32" stroke-width="2.5"/>
    <text x="337" y="140" text-anchor="middle" font-family="Arial" font-size="11" fill="#2E7D32">LED</text>

    <!-- GND -->
    <line x1="355" y1="100" x2="430" y2="100" stroke="#555" stroke-width="2"/>
    <line x1="420" y1="88" x2="420" y2="112" stroke="#333" stroke-width="2.5"/>
    <line x1="425" y1="94" x2="425" y2="106" stroke="#333" stroke-width="2"/>
    <line x1="430" y1="99" x2="430" y2="101" stroke="#333" stroke-width="2"/>
    <text x="420" y="130" text-anchor="middle" font-family="Arial" font-size="11" fill="#333">GND</text>

    <!-- Beschriftung oben -->
    <text x="250" y="35" text-anchor="middle" font-family="Arial" font-size="13" font-weight="bold" fill="#333">
      LED-Beschaltung ESP32 GPIO2
    </text>

  </svg>
  <p style="font-size:0.85em;color:#666;margin-top:6px;font-style:italic;">
    Abb. 1: Schaltplan der LED-Beschaltung mit 220-Ohm-Vorwiderstand
  </p>
</div>
```

### Methode 2: base64-Bild (fuer komplexe Grafiken)

Wenn eine Grafik zu komplex fuer SVG ist (z.B. Foto, Screenshot, detaillierter Aufbau),
als base64-PNG/JPG einbetten:

```html
<div style="margin:20px 0;text-align:center;">
  <img src="data:image/png;base64,[BASE64_DATEN_HIER]"
    alt="[BESCHREIBUNG]"
    style="max-width:100%;height:auto;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,0.1);">
  <p style="font-size:0.85em;color:#666;margin-top:6px;font-style:italic;">[BILDUNTERSCHRIFT]</p>
</div>
```

Wann base64 statt SVG:
- Fotos oder Screenshots (z.B. PlatformIO-Oberflaeche, realer Hardwareaufbau)
- Sehr komplexe Grafiken mit vielen Details
- Grafiken die bereits als Bilddatei vorliegen

Wann SVG bevorzugen:
- Alle technischen Diagramme (Schaltplaene, UML, Flussdiagramme, Topologien)
- Schaubilder und Infografiken
- Alles was aus einfachen geometrischen Formen besteht

### Pflichtregeln fuer Grafiken

- IMMER eine Bildunterschrift (Abb. X: ...) hinzufuegen
- IMMER alt-Text bei base64-Bildern setzen
- SVG IMMER mit viewBox und style="max-width:100%;height:auto;" damit responsive
- Keine externen URLs (http://... oder https://...) fuer Bilder verwenden
- Farben der Grafik passend zur Phasenfarbe waehlen wenn moeglich
- Grafiken NUR einfuegen wenn sie das Verstaendnis tatsaechlich foerdern

---

## Qualitaetssicherung fuer SVG-Grafiken

Vor dem Einbetten jeder SVG-Grafik eine Kollisionspruefung durchfuehren:

### Pflichtpruefung: Ueberschneidungscheck

Fuer jedes Element die Bounding Box berechnen und gegen alle anderen pruefen:

| Element | Bounding Box |
|---|---|
| rect x,y,w,h | x bis x+w, y bis y+h |
| circle cx,cy,r | cx-r bis cx+r, cy-r bis cy+r |
| ellipse cx,cy,rx,ry | cx-rx bis cx+rx, cy-ry bis cy+ry |
| text x,y | x bis x+geschaetzte_breite, y-fontsize bis y |
| line x1,y1,x2,y2 | min(x1,x2) bis max(x1,x2) |

Zwei Elemente ueberschneiden sich wenn:
- A.rechts > B.links UND A.links < B.rechts UND A.unten > B.oben UND A.oben < B.unten

### Mindestabstaende einhalten

- Zwischen zwei Boxen (rect/ellipse): mindestens 20px Abstand
- Zwischen Pfeilspitze und Zielobjektrand: mindestens 2px (marker refX beachten!)
- Zwischen Textlabel und Pfeil: mindestens 8px vertikal
- Zwischen Textlabel und Box: mindestens 6px

### Pfeile durch Zwischenobjekte (z.B. WLAN-Wolke)

FALSCH: Ein langer Pfeil der durch eine Wolke hindurchgeht:
```svg
<!-- Pfeil endet MITTEN in der Wolke - sieht falsch aus -->
<line x1="160" x2="310" y1="80" y2="80" marker-end="url(#arrow)"/>
<!-- Wolke bei cx=310 rx=30 ueberdeckt die Pfeilspitze! -->
```

RICHTIG: Pfeil in zwei Segmente aufteilen - vor und nach dem Zwischenobjekt:
```svg
<!-- Segment 1: Box-Rand bis linker Wolken-Rand -->
<line x1="160" x2="[cx-rx-2]" y1="80" y2="80" marker-end="url(#arrow)"/>
<!-- Segment 2: rechter Wolken-Rand bis naechste Box -->
<line x1="[cx+rx+2]" x2="538" y1="80" y2="80" marker-end="url(#arrow)"/>
```

### Textlabels positionieren

Textlabels fuer Pfeile IMMER mit ausreichend Abstand zur Linie:
```svg
<!-- Pfeil bei y=82 -->
<line x1="160" x2="308" y1="82" y2="82" .../>

<!-- Label OBERHALB (y = Pfeil-y - 12) -->
<text x="234" y="70" text-anchor="middle" ...>GET / HTTP/1.1</text>

<!-- Label UNTERHALB (y = Pfeil-y + 18) -->
<text x="234" y="100" text-anchor="middle" ...>200 OK</text>
```

NIEMALS text-anchor="middle" mit x-Wert verwenden der auf einem anderen Element liegt.

### viewBox grosszuegig waehlen

Faustregel: viewBox mindestens 20px Rand auf jeder Seite:
- Linkstes Element bei x=20 → viewBox beginnt bei 0
- Unterstes Element bei y=180 → viewBox-Hoehe mindestens 200
- Titel immer 20px unterhalb des untersten Grafikelements

### Checkliste vor dem Absenden

- [ ] Alle Bounding Boxes berechnet und auf Kollision geprueft?
- [ ] Pfeile enden/starten am Rand von Objekten, nicht im Inneren?
- [ ] Pfeile durch Zwischenobjekte in Segmente aufgeteilt?
- [ ] Textlabels mindestens 8px von Pfeilen entfernt?
- [ ] Textlabels ueberschneiden keine Boxen oder andere Texte?
- [ ] Titel ausserhalb aller anderen Elemente?
- [ ] viewBox hat ausreichend Rand (mind. 20px)?

---

## Abschlussverfolgung (optionales Feature)

Wenn der Benutzer Abschlussverfolgung wuenscht, den Benutzer zuerst fragen:

> "Soll ich die Abschlussverfolgung aktivieren? Dann muessen SuS jede Aufgabe
> einreichen bevor die naechste freigeschaltet wird."

Falls ja: Den folgenden Workflow NACH dem Erstellen aller Aktivitaeten ausfuehren.

### Welche Aktivitaeten bekommen Abschlussverfolgung?

| Aktivitaetstyp | Completion-Typ | Erlaeuterung |
|---|---|---|
| `moodle_create_assign` | completion=2, completionsubmit=1 | Automatisch bei Einreichung |
| `moodle_create_page` | completion=1 | Manuell (SuS klickt "Abgeschlossen") |
| `moodle_create_url` | – | Keine Verfolgung (Links ueberspringen) |
| `moodle_create_label` | – | Keine Verfolgung (Header ueberspringen) |

### Pflicht-Reihenfolge beim Einrichten

IMMER in dieser Reihenfolge vorgehen – niemals umgekehrt:

```
1. Alle Aktivitaeten erstellen (create_*)
   → cmids aus den Antworten notieren

2. Fuer jede zu verfolgende Aktivitaet set_completion aufrufen
   → Erst wenn ALLE set_completion-Calls erfolgreich sind:

3. Fuer jede abhaengige Aktivitaet set_restriction aufrufen
   → require_cmids auf die VORHERIGE Aktivitaet zeigen lassen
```

### Beispiel-Workflow fuer 3 aufeinanderfolgende Aufgaben

```
// Schritt 1: Aktivitaeten anlegen, cmids merken
cmid_A = moodle_create_assign(name="Phase 1 Arbeitsblatt", ...)   → z.B. 1001
cmid_B = moodle_create_assign(name="Phase 2 Aufgabe", ...)        → z.B. 1002
cmid_C = moodle_create_assign(name="Phase 3 Implementierung", ...) → z.B. 1003

// Schritt 2: Abschluss aktivieren (alle drei)
moodle_set_completion(cmid=1001, completion=2, completionsubmit=1)
moodle_set_completion(cmid=1002, completion=2, completionsubmit=1)
moodle_set_completion(cmid=1003, completion=2, completionsubmit=1)

// Schritt 3: Voraussetzungen setzen (Kette)
// B erst sichtbar wenn A abgeschlossen
moodle_set_restriction(cmid=1002, require_cmids=[1001], show_locked=1)
// C erst sichtbar wenn B abgeschlossen
moodle_set_restriction(cmid=1003, require_cmids=[1002], show_locked=1)
```

### Textseiten in die Kette einbeziehen

Wenn auch Textseiten (Informationsblaetter) abgeschlossen sein muessen:

```
cmid_info = moodle_create_page(name="Informationsblatt", ...)   → z.B. 1000
cmid_task = moodle_create_assign(name="Aufgabe", ...)           → z.B. 1001

// Informationsblatt: manueller Abschluss
moodle_set_completion(cmid=1000, completion=1)

// Aufgabe: automatisch bei Einreichung
moodle_set_completion(cmid=1001, completion=2, completionsubmit=1)

// Aufgabe erst freischalten wenn Informationsblatt gelesen (manuell abgeschlossen)
moodle_set_restriction(cmid=1001, require_cmids=[1000], show_locked=1)
```

### show_locked – Darstellung gesperrter Aktivitaeten

| Wert | Darstellung in Moodle |
|---|---|
| 1 (Standard) | Aktivitaet ausgegraut mit Schloss-Symbol und Hinweis sichtbar |
| 0 | Aktivitaet komplett unsichtbar bis Voraussetzung erfuellt |

Empfehlung: show_locked=1 verwenden damit SuS wissen was sie als naechstes erwartet.

### Labels und URLs NICHT in die Kette einbeziehen

Phasen-Header (Labels) und externe Links (URLs) bekommen KEINE Abschlussverfolgung
und KEINE Voraussetzungen. Sie bleiben immer sichtbar.

Die Kette bezieht sich nur auf Aufgaben (assign) und ggf. Textseiten (page).

### Fehlervermeidung

- NIEMALS set_restriction aufrufen bevor set_completion auf der
  Voraussetzungs-Aktivitaet gesetzt wurde – sonst funktioniert die
  Freischaltung nicht korrekt
- NIEMALS eine Aktivitaet als Voraussetzung eintragen die selbst
  keine Abschlussverfolgung hat (completion=0)
- Bei mehreren Voraussetzungen (require_cmids=[1001, 1002]) muessen
  ALLE genannten cmids zuvor mit set_completion konfiguriert worden sein

---

## Arbeitsblätter für Moodle-Aufgaben (mod_assign)

Wenn zu einer Phase ein ausfüllbares Word-Arbeitsblatt (.docx) erstellt und hochgeladen werden soll, gelten folgende Regeln:

### Kein Bewertungsraster
Arbeitsblätter dürfen **kein Bewertungsraster und keine Punktetabelle** enthalten. Moodle hat eine eigene Bewertungsfunktion — ein Raster im Dokument wäre eine überflüssige Dopplung.

### Keine Metadaten-Felder
Arbeitsblätter dürfen **keine Felder für Name, Klasse oder Datum** enthalten. Moodle protokolliert diese Informationen automatisch bei der Abgabe.

### Thematisches Design
Das Design richtet sich nach dem **Fachthema der Unterrichtseinheit**, nicht nach einem generischen Schul-Layout.
- Header: dunkler Hintergrund, fachspezifische Akzentfarbe, thematisches Icon
- Jede Phase bekommt eine eigene Akzentfarbe passend zur Phase
- Beispiel IoT/ESP32: Cyan `#06B6D4`, Dark Slate `#0F172A`, Monospace für Code, Icons wie `>>--[GPIO]-->>` oder `f=1/T`

### Pflicht-Struktur
1. **Thematischer Header** — einspaltig, dunkler Hintergrund, Akzentfarbe, Phasenname + Themen-Icon
2. **Einleitungssatz** — kurze Aufgabenbeschreibung
3. **Nummerierte Fragen** mit Badge-Nummern
4. **Ausfüllbare Antwortfelder** — graue Tabellenzellen (`#F8FAFC`) mit gestrichelter Unterlinie
5. **Fußzeile** — Abgabehinweis (kursiv, grau)

### Upload
Nach Erstellung per `mcp__moodle__moodle_upload_assignfile` hochladen:
- `cmid`: Course Module ID der Aufgabe
- `filepath`: absoluter Pfad zur lokalen .docx-Datei
- `filename`: Dateiname in Moodle

> **Hinweis:** Das Tool meldet `dmlwriteexception` — das ist ein bekannter Pseudo-Fehler. Die Datei wird trotzdem erfolgreich hochgeladen.
