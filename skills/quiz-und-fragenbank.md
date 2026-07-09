# Referenz: Quiz-Modi und Fragenbank-Kategorien

Lies diese Datei, wenn ein Quiz (`moodle_create_quiz`/`moodle_update_quiz_settings`)
geplant oder umgesetzt wird, oder wenn Fragenbank-Kategorien angelegt bzw.
bereinigt werden.

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

## Quiz/Fragen im Implementierungsplan planen (Issue #20)

Testaktivitaeten und ihre Fragen werden genauso geplant wie andere
Aktivitaeten – ueber `addQuiz` und `addQuestion` aus
`lib/implementation-plan.js`, mit denselben Schritten wie in
`implementierungsplan-workflow.md` beschrieben (Plan aufbauen, Kurzuebersicht
zeigen, Freigabe abwarten).

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
   braucht `deviationReason` (siehe `implementierungsplan-workflow.md`).
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
