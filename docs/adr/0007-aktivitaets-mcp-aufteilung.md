# Aufteilung in Core-MCP und Aktivitaets-MCPs

Beim Nachsteuern von Quiz-Einstellungen zeigte sich: das bisherige
`moodle_update_quiz_settings`-Tool kennt nur drei Modus-Presets
(mini-check/lernstandscheck/abschlusstest) plus gradepass/timelimit, aber
nicht die vollen Moodle-Formularfelder (Frageverhalten, Layout, Navigation,
Versuche, Wartezeiten, Bewertungsmethode, Review-Optionen, Gesamtfeedback).
Eine Lehrkraft wollte eine Einstellung aendern, die im Formular sichtbar ist,
aber im MCP nicht verdrahtet war - die KI bestaetigte die Aenderung, ohne dass
sie tatsaechlich wirkte.

Gleichzeitig wuchs der Wunsch, beliebig neue Aktivitaetstypen (Forum,
Lernlandkarte, ...) ergaenzen zu koennen, ohne das bestehende
`moodle-mcp.js` immer weiter aufzublasen - Tool-Schemas werden bei jedem
Modell-Call erneut in den Kontext geladen, ein einzelnes Mega-MCP mit allen
Aktivitaeten waere dauerhaft teuer.

## Optionen

- **Ein MCP mit generischem Overrides-Parameter** je Aktivitaet: kompaktes
  Schema, aber die KI muesste Moodle-interne Feldnamen/Formate richtig raten -
  Fehlerrisiko ohne Schema-Absicherung.
- **Ein MCP, alle Formularfelder explizit, aber weiter monolithisch**: pro
  Aktivitaet gut beschrieben, aber Tool-Liste waechst mit jeder neuen
  Aktivitaet weiter unkontrolliert fuer jede Session, egal ob gebraucht oder
  nicht.
- **Viele kleine MCP-Server, ein Prozess pro Aktivitaetstyp, Auswahl ueber
  Setup-Tool**: jede Aktivitaet bekommt volle, explizite Formularfelder;
  Lehrkraft/Setup entscheidet vorab, welche Aktivitaets-MCPs ueberhaupt
  geladen werden. Macht die Systemkomplexitaet fuer die Lehrkraft sichtbar
  (gewuenschter Nebeneffekt), erlaubt Drittentwicklern, eigene
  Aktivitaets-MCPs unabhaengig beizusteuern.

## Entscheidung

Wir teilen `moodle-mcp.js` in ein **Core-MCP** (aktivitaetsunabhaengige
Kurs-/Abschnitts-/Modul-Tools: Sections, Module verschieben, Completion,
Restriction, Kurskatalog) und mehrere **Aktivitaets-MCPs** auf (Page, Label,
URL, Assign, Quiz, Fragensammlung, perspektivisch weitere). Jedes
Aktivitaets-MCP bildet alle relevanten Moodle-Formularfelder explizit im
Tool-Schema ab statt eines generischen Overrides-Parameters.

Aktivitaets-MCPs koennen Abhaengigkeiten zu anderen Aktivitaets-MCPs
deklarieren (Quiz-MCP braucht Fragensammlung-MCP mit), das abhaengige MCP
bleibt aber eigenstaendig ladbar.

Welche Aktivitaets-MCPs in einer Umsetzungssession verfuegbar sind, wird
**vorab beim Setup** entschieden (`scripts/setup-mcp-config.js`), nicht zur
Laufzeit waehrend einer laufenden Chat-Session nachgeladen - dynamisches
MCP-Nachladen mitten in einer Session ist client-seitig (Claude Desktop,
Codex) nicht zuverlaessig unterstuetzt. Ein release-gebundenes
**Aktivitaetsregister** listet verfuegbare Aktivitaets-MCPs mit Default
an/aus; gaengige Aktivitaeten sind default an, exotische default aus.
Nachinstallieren heisst: Setup-Tool erneut laufen lassen (idempotenter
Merge, kein Neuaufbau).

## Konsequenzen

- `moodle-mcp.js` wird in Core + je ein Einstiegspunkt pro Aktivitaets-MCP
  aufgeteilt; gemeinsame Hilfslogik (z.B. Moodle-API-Client) bleibt in
  geteilten Modulen.
- `scripts/setup-mcp-config.js` und `lib/mcp-config-setup.js` brauchen einen
  Auswahlschritt (Checkliste/Flag) statt der bisherigen zwei Festeintraege.
- Die Quiz-Plugin-Webservices (`update_quiz_settings.php`, `create_quiz.php`)
  muessen um die vollen Formularfelder erweitert werden; passende
  Moodle-Capability-Pruefungen (`moodle/course:manageactivities` fuer
  Quiz-Einstellungen, `moodle/question:managecategory` im richtigen
  Fragenbank-Kontext fuer Kategorien) kommen mit.
- `kurspilot-planen` erkennt fehlende Aktivitaets-MCPs als **Werkzeugluecke**
  und leitet die Lehrkraft durch manuelle Moodle-Schritte, statt zu
  verschweigen oder abzulehnen.
