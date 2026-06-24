# Fortbildungs-Checkliste bis Freitag, 26.06.2026

Stand: Dienstag, 23.06.2026, 11:17 CEST.

Ziel: Eine fortbildungsfaehige IGS-Arbeitsversion vorbereiten, die auf der Testinstanz einen nachvollziehbaren Golden Path zeigt. Kein GitHub-Upload aus diesem Arbeitsstand.

## Harte Einschätzung

Die komplette PRD ist bis Freitag nicht realistisch. Fuer die Fortbildung reicht eine belastbare Demo plus klarer Arbeitsmodus:

- Lehrkraefte verstehen den Alignment-Prozess.
- Lehrkraefte sehen, wie ein bestehender Moodle-Kurs befuellt wird.
- Lehrkraefte sehen Textseite, Aufgabe, Test/Gate und Nachvollziehbarkeit.
- Kritische technische Risiken sind entweder geloest oder offen benannt.

## P0: Muss bis zur Fortbildung halten

- [ ] Moodle-Testinstanz laeuft stabil und ist erreichbar.
- [ ] Jede teilnehmende Lehrkraft kann eigenen Moodle-Account und eigenen Moodle-Token bekommen.
- [ ] Webservice ist global vorbereitet.
- [ ] Lokale Token-Konfiguration ist definiert und per Git ignoriert.
- [ ] `local-context/` und lokale Token-/Materialpfade sind in `.gitignore`.
- [ ] Windows-Setup-Pfad ist einmal auf einem echten Windows-Laptop getestet.
- [ ] macOS-Setup funktioniert weiter.
- [ ] README beschreibt den Fortbildungsstart kurz und eindeutig.
- [ ] IGS-Begriffe ersetzen in Fortbildungsdoku die alte Lernsituationssprache.
- [ ] Natuerliche Startformulierungen sind dokumentiert.
- [ ] Kontext-Onboarding ist mindestens als klarer manueller/assistierter Ablauf beschrieben.
- [ ] Freigegebener Implementierungsplan ist als Pflichtschritt dokumentiert.
- [ ] Journal/Umsetzungsbericht ist als Pflichtschritt dokumentiert oder minimal umgesetzt.
- [ ] Bestehender Kurs kann mit Textseite befuellt werden.
- [ ] Bestehender Kurs kann mit Aufgabe befuellt werden.
- [ ] Aufgabe ohne Abgabe ist als Standard verstanden/getestet.
- [ ] Aufgabe mit Abgabeabschluss ist getestet oder als offenes Risiko markiert.
- [ ] Quiz-Erstellung mit MC-Fragen ist als technischer Spike getestet.
- [ ] Quiz kann Bestehensgrenze setzen.
- [ ] Quiz kann Abschluss bei Bestehen setzen oder diese Luecke ist klar dokumentiert.
- [ ] Folgeaktivitaet kann per Voraussetzung an Testabschluss gekoppelt werden oder diese Luecke ist klar dokumentiert.
- [ ] Kurs-Fragensammlung/Kategorie-Erstellung ist getestet oder als Risiko markiert.
- [ ] Native Moodle-Frageversionierung ist getestet oder als groesstes offenes Risiko markiert.
- [ ] Demo-Kurs fuer die Fortbildung ist vorbereitet.
- [ ] Ein Notfallpfad existiert: Was zeigen wir, wenn Quiz-Versionierung bis Freitag nicht stabil ist?

## P1: Soll, wenn P0 stabil ist

- [ ] Lesbare Fragenvorschau als Daten-/Markdown-Format, auch wenn noch keine UI existiert.
- [ ] Distraktorenbegruendung und Antwortfeedback in der Vorschau.
- [ ] Bezugsaktivitaet pro Frage in der Vorschau.
- [ ] Materialluecke wird als Planhinweis dargestellt.
- [ ] Textseiten mit Quellenhinweis/Lehrwerkverweis.
- [ ] Lokaler Materialordner `materials/<thema>/` mit sprechenden Dateinamen.
- [ ] Originaldateiname wird im Journal protokolliert.
- [ ] OCR-Extraktion als manueller/agentischer Ablauf getestet.
- [ ] Fachabbildung als gezielter Bildausschnitt getestet.
- [ ] Alt-Text fuer Fachabbildungen erzeugt.
- [ ] Drei Testmodi in README erklaert: Lerncheck, Intensiv-Ueben, Bewertungsmodus.

## P2: Spaeter, nicht fortbildungskritisch

- [ ] Claude-Kompatibilitaet vollstaendig nachziehen.
- [ ] Kollegiums-Installer sauber paketieren.
- [ ] Vollstaendige Aktivitaets-MCP-Aufteilung umsetzen.
- [ ] Inline-Diff/Side-by-Side UI fuer Frageaenderungen.
- [ ] Kleine Fragenkorrekturen ohne Regeneration technisch elegant loesen.
- [ ] AI-Textfrage.
- [ ] Cloze.
- [ ] Kurzantwort.
- [ ] Drag-and-drop.
- [ ] Lernlandkarte per MCP.
- [ ] Link-Erreichbarkeitsmonitor.

## Zeitplan

### Dienstag, 23.06.

- [ ] P0-Liste gegen realen Code/Testinstanz pruefen.
- [ ] Entscheiden, ob Quiz-Versionierung bis Freitag realistisch ist.
- [ ] `.gitignore` fuer lokale Daten vorbereiten.
- [ ] README-Fortbildungsabschnitt skizzieren.
- [ ] Minimalen Demo-Kurs festlegen.

### Mittwoch, 24.06.

- [ ] Windows-Setup testen.
- [ ] Moodle-Webservice/Token-Prozess mit Testlehrkraft durchspielen.
- [ ] Textseite/Aufgabe/URL/Restriction vorhandener Tools verifizieren.
- [ ] Quiz-Spike: MC-Test, Bestehensgrenze, Abschluss, Voraussetzung.
- [ ] Risikoentscheidung dokumentieren: Was kommt in die Live-Demo, was nur in die Roadmap?

### Donnerstag, 25.06.

- [ ] Demo-Kurs finalisieren.
- [ ] Fortbildungs-README finalisieren.
- [ ] Teilnehmer-Setup-Schritte testen.
- [ ] Notfall-Demo ohne vollstaendige Quiz-Versionierung vorbereiten.
- [ ] Journal/Umsetzungsbericht im Ablauf zeigen.

### Freitag, 26.06. vor der Fortbildung

- [ ] Testinstanz erreichbar.
- [ ] Demo-Kurs zurueckgesetzt oder kopiert.
- [ ] Tokens/Accounts vorbereitet.
- [ ] Windows-Testgeraet geprueft.
- [ ] 15-Minuten-Demo einmal komplett durchgeklickt.

## Stop-Regeln

- Wenn Quiz-Versionierung bis Mittwochabend nicht stabil ist, wird sie in der Fortbildung als Roadmap gezeigt, nicht live versprochen.
- Wenn Windows-Setup bis Donnerstagmittag nicht stabil ist, arbeiten Teilnehmende in der Fortbildung mit Demo-/Pairing-Setup statt Einzelinstallation.
- Wenn Moodle-Schreibzugriffe unzuverlaessig sind, bleibt die Fortbildung beim Planungs-/Vorschauworkflow und zeigt Moodle-Import nur als vorbereitete Demo.

## Naechster konkreter Schritt

P0 gegen Code und Testinstanz pruefen. Erste Frage: Ist die Moodle-Testinstanz jetzt erreichbar und kann ein eigener Test-Token erzeugt werden?
