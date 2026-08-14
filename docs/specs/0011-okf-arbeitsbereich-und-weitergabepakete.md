# 0011 – OKF-Arbeitsbereich und Weitergabepakete umsetzen

## Problem Statement

Kurspilot legt lokalen Kontext derzeit unter einer zusätzlichen
`local-context/`-Ebene ohne durchgängiges Frontmatter ab. Der Kontext ist
weder thematisch erschlossen noch sicher in zwei klar unterschiedliche
Weitergabemodi überführbar. Lehrkräfte können deshalb ein Vorhaben nicht
einfach mit Kolleginnen und Kollegen teilen und eine Lerngruppe bei einer
Kursübergabe nicht nachvollziehbar mitsamt berechtigten Verlaufshinweisen
übergeben.

Die bereits freigegebene Spezifikation 0010 definiert den fachlichen Vertrag.
Diese Spezifikation setzt ihn im Kurspilot-Arbeitsbereich um.

## Solution

Der konfigurierte Kurspilot-Arbeitsbereich wird direkt zur Schreibgrenze und
beginnt mit Schuljahresordnern. Ein einheitliches Arbeitsbereichsmodul erzeugt
und prüft das begrenzte YAML-Frontmatter, trennt personenbezogene Informationen
in sichtbare Sidecars, pflegt `index.md` best-effort und bietet die beiden
Weitergabevorgänge an: ein bereinigtes Materialpaket für ein Vorhaben sowie ein
als `INTERN` markiertes Lerngruppenpaket für ein Schuljahr.

Ein Paket ist ein portables ZIP mit `manifest.md` und `AGENTS.md`. Empfänger
entpacken es zunächst unverändert als Eingangspaket und übernehmen es bewusst
in ihre eigene Chronologie; Kurspilot überschreibt oder merge't nichts
automatisch. Alle Kerninhalte bleiben ohne installierten Skill im Texteditor
lesbar und bearbeitbar.

## User Stories

1. Als Lehrkraft möchte ich, dass mein konfigurierter Arbeitsbereich direkt mit Schuljahren beginnt, damit keine bedeutungslose `local-context/`-Ebene entsteht.
2. Als Lehrkraft möchte ich, dass Kurspilot nur innerhalb meines Arbeitsbereichs schreibt, damit keine privaten Nachbarordner verändert werden.
3. Als Lehrkraft möchte ich beim Anlegen eines Profils oder Vorhabens vollständiges, lesbares Frontmatter erhalten, damit Dateien unabhängig von Kurspilot einordenbar sind.
4. Als Lehrkraft möchte ich Fach, Jahrgangsstufe und Schlagworte beim Anlegen erfassen, damit Vorhaben später thematisch auffindbar sind.
5. Als Lehrkraft möchte ich optionale Lizenz-, Herkunfts- und Kompetenzangaben erst ergänzen, wenn sie gebraucht werden, damit die tägliche Planung schlank bleibt.
6. Als Lehrkraft möchte ich, dass Kurspilot bei eigenen Änderungen `updated` pflegt, damit die Aktualität nachvollziehbar ist.
7. Als Lehrkraft möchte ich personenbezogene Beobachtungen neben der Sachdatei in einem Sidecar ablegen, damit teilbare Materialien keine rückführbaren Hinweise enthalten.
8. Als Lehrkraft möchte ich eindeutig erkennen, ob eine Datei offen, nur schulintern oder gar nicht weitergegeben werden darf, damit ich vor dem Export verantwortungsvoll entscheiden kann.
9. Als Lehrkraft möchte ich ein globales `index.md` mit Vorhaben, Fach, Jahrgang, Tags und Kurzbeschreibung sehen, damit ich Material ohne Kenntnis des Schuljahres finde.
10. Als Lehrkraft möchte ich den Index bei Bedarf selbst bearbeiten können, damit er ohne Kurspilot nicht unbrauchbar wird.
11. Als Lehrkraft möchte ich ein Unterrichtsvorhaben als Materialpaket teilen, damit eine andere Lehrkraft nur die dafür relevanten, nicht-personenbezogenen Dateien erhält.
12. Als Lehrkraft möchte ich, dass ein Materialexport Sidecars ausschließt statt Texte umzuschreiben, damit kein personenbezogener Rest versehentlich exportiert wird.
13. Als Lehrkraft möchte ich alle bewusst abgelegten Materialdateien einschließlich Originaldateien weitergeben, damit das Paket nicht von einer künstlichen Endungsliste abhängt.
14. Als übergebende Lehrkraft möchte ich eine Lerngruppe für genau ein Schuljahr als sichtbar internes Paket ausgeben, damit die übernehmende Lehrkraft Profil und Verlauf im richtigen Rahmen erhält.
15. Als übernehmende Lehrkraft möchte ich vor dem Einordnen ein unverändertes Eingangspaket sehen, damit Herkunft und ursprünglicher Stand nachvollziehbar bleiben.
16. Als Lehrkraft möchte ich bei Namensgleichheit einen neuen eindeutig benannten Ordner erhalten, damit kein vorhandenes Vorhaben überschrieben oder still zusammengeführt wird.
17. Als Lehrkraft möchte ich ein Paket mit Texteditor oder einem anderen Agenten lesen können, damit Kurspilot keine Voraussetzung für die Nutzung meiner eigenen Dateien ist.
18. Als Lehrkraft möchte ich beim Erzeugen eines Lerngruppenpakets einen klaren Hinweis zu Speicherort und Übergabekanal erhalten, damit ich die lokale schulische Freigabe beachte.
19. Als Lehrkraft möchte ich keine automatische Migration oder Legacy-Ausnahme erleben, damit der neue Formatvertrag eindeutig bleibt und alte Teststände nur bewusst überführt werden.
20. Als Maintainer möchte ich die Arbeitsbereichsfunktionen hinter einer öffentlichen Schnittstelle testen, damit Pfadlogik, Paketformat und Dateisystemdetails austauschbar bleiben.

## Implementation Decisions

- Die Arbeitsbereich-Wurzel ersetzt die bisherige Zwischenebene vollständig. Alle Pfadberechnung, Schreibschutz, Kontextauflösung, Wegweiser und Lehrkrafttexte verwenden relative Pfade ab dieser Wurzel; alte `local-context/`-Pfade werden nicht mehr akzeptiert.
- Die bestehende Arbeitsbereichs-Fassade bleibt die einzige öffentliche Nahtstelle. Sie ergänzt die vorhandenen Lade-, Lese- und Vorhabenoperationen um Frontmatter-/Indexpflege sowie Vorschau und bestätigte Ausführung für Materialexport, Lerngruppenexport und Übernahme eines Eingangspakets. Jede Operation gibt weiter `{ ok: true, ... }` oder `{ ok: false, message }` zurück.
- Ein internes Frontmatter-Modul liest und schreibt ausschließlich das in Spezifikation 0010 definierte, begrenzte YAML-Profil. Es validiert Pflichtfelder und erlaubte Werte, erhält unbekannte optionale Metadaten bei Änderungen und behandelt nicht parsebare Dateien als sichtbaren Fehler statt als stillen Verlust. Die bestehende Laufzeit bleibt ohne allgemeine YAML-Abhängigkeit.
- Vorlagen für Lerngruppe, Fach und Vorhaben erzeugen das Pflicht-Frontmatter von Anfang an. Personenbezug erhält eine eigene Sidecar-Erzeugung; Sachdatei und Sidecar bleiben getrennte Dateien.
- Der Index ist eine deterministisch formatierte Markdown-Datei an der Arbeitsbereich-Wurzel. Kurspilot aktualisiert nur den ihm gehörenden Eintrag eines erfolgreich angelegten oder geänderten Vorhabens; bei unlesbarem oder manuell konfligierendem Index warnt es und lässt die Arbeitsdatei unverändert.
- Ein Vorhaben wird als eigenständige Variante behandelt, wenn es `derivedFrom` trägt. Varianten werden nicht automatisch zusammengeführt, synchronisiert oder als Delta gespeichert; Archivierung folgt dem Frontmatter-Status und dem vorhandenen Journal.
- Das Paketmodul erstellt ZIP-Dateien über eine gekapselte, plattformunabhängige Archiv-Implementierung. Es benutzt keine Shell-ZIP-Befehle und erhält Dateinamen sowie Binärdateien unverändert. Das Modul prüft beim Einlesen Pfadtraversierung, absolute Pfade und symbolische Linkziele außerhalb des Eingangspakets.
- Materialexport folgt ausschließlich Metadaten: Er enthält genau einen Vorhabensbaum, lässt `kurspilot.personenbezug: true` und `nicht_weitergeben` aus, nimmt kein Fachprofil auf und berichtet jede ausgeschlossene Datei. Fehlt notwendige Weitergabe-Metadaten oder eine für offene Weitergabe verlangte Lizenz, liefert die Vorschau eine konkrete Nachforderung und schreibt kein Paket.
- Lerngruppenexport umfasst genau einen Lerngruppenordner für ein Schuljahr einschließlich zulässiger Sidecars. Er erzeugt `manifest.md` und `AGENTS.md`, kennzeichnet Archivname und Manifest als `INTERN` sowie `weitergabe: schulintern` und zeigt den vereinbarten Verantwortungs- und Speicherhinweis.
- Beide Paketmodi erzeugen ein vollständiges, menschenlesbares Manifest mit Modus, Titel, Herkunft, Absender, Schule, Erstellungsdatum und Inhaltsverzeichnis. Materialpakete enthalten Lizenz; Lerngruppenpakete enthalten zusätzlich Zweck, Zuständigkeit und Prüfzeitpunkt.
- Die Übernahme entpackt zunächst in einen ausdrücklich gewählten Eingangsort. Erst eine zweite bestätigte Operation legt einen neuen, konfliktfreien Ordner in der Chronologie des Empfängers an; automatische Übernahme, Überschreiben und Mergen sind ausgeschlossen.
- Skilltexte und Wegweiser erklären die neue Wurzel, Sidecars, Index, beide Paketmodi und die Trennung von lokaler Kontextfreigabe und Moodle-Schreibfreigabe. Automatisierte Moodle-Befüllung bleibt außerhalb der Paketfunktionen.

## Testing Decisions

- Tests prüfen ausschließlich das sichtbare Verhalten der Arbeitsbereichs-Fassade: Rückgabeform, erzeugte Dateien, Frontmatter, Index, Paketinhalt, Fehlermeldung und Übernahmeergebnis. Private Parser-, Pfad- und Archivhelfer werden nicht direkt getestet.
- Der vorhandene Arbeitsbereichs-Integrationstest ist der zentrale Prüfpunkt und wird um einen vollständigen Ablauf ergänzt: Arbeitsbereich einrichten, Vorhaben anlegen, Sidecar ergänzen, Index aktualisieren, Paket in Vorschau erzeugen, nach Bestätigung exportieren und beim Empfänger konfliktfrei übernehmen.
- Ergänzende Fassade-Tests decken Schreibschutz an der Arbeitsbereich-Wurzel, fehlendes oder ungültiges Frontmatter, fehlende Lizenz, ausgeschlossene Sidecars, `nicht_weitergeben`, `INTERN`-Manifest, Binärdateien sowie beschädigte oder traversalhaltige Eingangspakete ab.
- Bestehende Tests für Pfade, Kontextauflösung, Vorhaben-Arbeitsbereiche, Journale und Skillpakete werden auf die neue Wurzel aktualisiert. Sie bleiben Verhaltenstests und prüfen nicht interne Konstanten.
- Archivtests verifizieren den resultierenden ZIP-Inhalt durch unabhängiges Auslesen statt durch Mocks der Archivimplementierung. Übernahmetests stellen sicher, dass bei Namenskollision beide Stände erhalten bleiben.
- Der vollständige Node-Testlauf bleibt die Regression-Suite; eine reale Moodle-Instanz ist nicht erforderlich, weil diese Änderung ausschließlich lokale Arbeitsdateien und Paketgrenzen betrifft.

## Out of Scope

- Eine zentrale Tauschplattform, Cloud-Synchronisation, Empfängerbindung oder Verschlüsselungsinfrastruktur.
- Automatische Migration, Legacy-Kompatibilität und ein Migrationsassistent für frühe Teststände.
- Automatisches Redigieren personenbezogener Texte, automatische Anonymisierung oder rechtliche Speicherort-Prüfung.
- Vollständige AMB-/JSON-LD-Konformität und ein OER-Portal-Export.
- Automatisches Mergen, Überschreiben oder Synchronisieren von Varianten und Eingangspaketen.
- Moodle-Backup, Moodle-Import oder Moodle-Schreibvorgänge als Teil eines Weitergabepakets.

## Further Notes

- Fachlicher Ausgangspunkt ist Spezifikation 0010; ADR 0003 erlaubt lokale Namen weiterhin, jetzt im konfigurierten Arbeitsbereich und bei Weitergabe nur über markierte Sidecars.
- Die Schule ist öffentlich und liegt in Niedersachsen. Kurspilot formuliert deshalb Verantwortung und Prüfpflicht, aber keine nicht belegte Löschfrist oder Freigabeliste.
- Für den kleinen, bewusst begrenzten YAML-Umfang werden keine frei interpretierbaren YAML-Features, Ausführungstags oder impliziten Typumwandlungen unterstützt.
