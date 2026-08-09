# Implementierungsplan: Aufgaben- und Fragen-Formularparität

Quelle: `docs/specs/0009-aufgaben-und-fragen-formularparitaet.md`

## Bestätigte Test-Seams

Vor dem ersten Red-Green-Slice bestätigt die Lehrkraft diese öffentlichen Grenzen:

1. **MCP-Schnittstelle:** `tools/list` und der öffentliche Tool-Handler zeigen Schema, Abwärtskompatibilität, Warnungen und die an Moodle gesendeten Parameter.
2. **Coursepilot-Webservice:** MCP-Aufrufe verwenden immer denselben automatisch installierten Dienst `Coursepilot` und denselben Token. Wo ein vorhandener Moodle-Core-Webservice den Vorgang vollständig unterstützt, ist genau diese Core-Funktion im Coursepilot-Dienst registriert; nur echte Lücken laufen über `local_coursepilot_*`. Create/Update-Antworten zeigen den tatsächlich gespeicherten Zustand, und Integrationstests schreiben ausschließlich in den vorgesehenen Testkurs.
3. **Kurskatalog:** Ein erneuter `moodle_get_course_catalog`-Abruf bestätigt den wirksamen Aufgaben-, Quiz- und Fragenzustand.
4. **Fragen-Read-back:** `moodle_get_question` bestätigt Auswahlmodus, Antworten, Gewichte, Feedback, Identität und Kategorie.
5. **Fragenumzug:** Das öffentliche Move-Tool plus anschließender Read-back bestätigt Identität und vollständige Versionsgeschichte im Ziel.
6. **Manuelle Bereinigung:** Eine lehrkraftlesbare Tool-Antwort beziehungsweise Katalogdarstellung nennt Inhalt und direkten Moodle-Bearbeitungslink, ohne einen Lösch-Webservice zu registrieren.

Tests prüfen diese Grenzen, nicht private Helper oder direkte Tabellenzustände.

## Slice 1 – Aufgaben-Snapshot und Übungsmodus

- Öffentliche Contract- und Integrationstests für `mode=übung` rot schreiben.
- Gemeinsames Feldschema für Create, Update und Read-back einführen.
- Bestehenden Aufgaben-Zustand vollständig laden und Teilupdates über `update_moduleinfo` speichern.
- `übung` als unbewertetes, fortlaufend bearbeitbares Preset implementieren.
- Katalog um den wirksamen Aufgaben-Zustand erweitern.

Verifikation: Übungsaufgabe anlegen, lesen, einzelnes Feld ändern, erneut lesen; nicht genannte Werte bleiben erhalten.

## Slice 2 – Versuche und Abgabeablauf

- `submissiondrafts`, `requiresubmissionstatement`, `maxattempts` und `attemptreopenmethod` explizit exponieren.
- Moodle-5.0-Werte `manual`, `automatic`, `untilpass` validieren; veraltetes `none` nicht neu schreiben.
- Abhängigkeiten zu Bewertung, Bestehensgrenze und vorhandenen Abgaben prüfen.

Verifikation: Create/Update/Read-back für einen, begrenzte und unbegrenzte Versuche sowie verständliche Ablehnung ungültiger Kombinationen.

## Slice 3 – Restliche Aufgaben-Core-Felder

- Allgemein, Verfügbarkeit, Gruppenabgabe, Benachrichtigungen, Bewertung und Bewertungsworkflow schrittweise ergänzen.
- Moodle-gesperrte Änderungen vor dem Schreiben erkennen.
- Vorhandene Bewertungskategorien, Skalen und Bewertungsmethoden auswählbar machen, aber nicht erzeugen.

Verifikation: je Formulargruppe mindestens ein öffentlicher Round-trip; Schutztest mit vorhandener Abgabe oder Bewertung.

## Slice 4 – Mitgelieferte Aufgaben-Unterplugins und Dateien

- Onlinetext-, Datei- und Feedback-Konfiguration vollständig lesen und patchen.
- Bei Teilupdates sämtliche vorhandenen Unterplugin-Werte hydrieren, damit Moodle sie nicht unbeabsichtigt deaktiviert.
- Arbeitsauftrag und Dateimetadaten ergänzen; Dateiinhalt über spezialisierte Upload-Werkzeuge verwalten.
- Kein automatisches Löschen bestehender Dateien.

Verifikation: einzelne Unterplugin-Einstellung ändern; alle anderen bleiben nach Read-back unverändert.

## Slice 5 – Allgemeine Aktivitätsfelder im Core-MCP

- Fehlende Felder des Moodle-Core-Aktivitätsformulars an der allgemeinen Aktivitäts-Schnittstelle ergänzen.
- Bestehende Completion-, Restriction- und Visibility-Tools vervollständigen statt Logik im Aufgaben-MCP zu duplizieren.
- Pro Feldgruppe zuerst prüfen, ob ein öffentlicher Moodle-5-Core-Webservice die benötigte Mutation vollständig unterstützt.
- Geeignete Core-Funktionen automatisch in `Plugin/src/local_coursepilot/db/services.php` dem Dienst `Coursepilot` hinzufügen und direkt aus dem Core-MCP aufrufen.
- Für Gruppenmodus und passende Kursseiten-Aktionen `core_courseformat_update_course` verwenden; den veralteten `core_course_edit_module` nicht neu verdrahten.
- Nur für verbleibende Webservice-Lücken einen lokalen Coursepilot-Adapter bauen; dieser verwendet `update_moduleinfo` statt direkter Tabellenupdates.

Verifikation: öffentliche Core-Tools plus Katalog-Read-back an einer Aufgabe; keine assign-spezifischen Parameter im Core, keine manuelle Dienstkonfiguration, kein zusätzlicher Token und kein lokaler Doppel-Endpunkt für vollständig vorhandene Core-Funktionen.

## Slice 6 – Direkte Quiz-Rückmeldung

- Mini-Check-Default von `immediatecbm` auf `immediatefeedback` ändern.
- Tooltexte, Read-back und Review-Einstellungen konsistent halten.

Verifikation: Quiz-Round-trip und Moodle-E2E zeigen direkte Rückmeldung ohne Sicherheitseinschätzung.

## Slice 7 – Strukturierte Mehrfachauswahl

- Neues strukturiertes Antwortmodell einführen; bisherigen `correctindex`-Pfad kompatibel erhalten.
- `single`/Mehrfachauswahl, Antwortfeedback und Gewichte in Create, Update und Get durchreichen.
- Empfohlenen Abzugsmodus, abzugfreien Modus und konkrete Warnung für „alles ankreuzen“ implementieren.
- Vorschau und Implementierungsplan-Generator auf das Antwortmodell umstellen.

Verifikation: bestehende Einfachauswahl bleibt grün; Mehrfachauswahl-Round-trip und E2E zeigen Checkboxen, Feedback und erwartete Punkte.

## Slice 8 – Nicht-destruktiver Fragenumzug

- Move-Tool mit Quellidentität und Zielkategorie registrieren.
- Alle Version-IDs einer Fragenidentität auflösen und Moodles Core-Bulk-Move verwenden.
- Quell- und Ziel-Capabilities prüfen; Dateien, Schlagwörter und ID-Kollisionen Moodle überlassen.
- Read-back um aktuelle Kategorie und Fragensammlung ergänzen.

Verifikation: Umzug innerhalb einer Fragensammlung und über zwei Kontexte mit stabiler `questionbankentryid` und vollständiger Versionsliste.

## Slice 9 – Manuelle Quiz-Bereinigung

- Katalogdaten um lehrkraftlesbare Quiz-, Slot-, Frage-, Kategorie- und Bearbeitungslink-Angaben ergänzen.
- Skill-/Workflow-Hinweis hinzufügen: kein Löschen durch Kurspilot, sondern genauer manueller Schritt.
- Sicherstellen, dass weder MCP noch Webservice ein Löschtool registrieren.

Verifikation: öffentlicher Contract-Test für Anleitung und Link; negativer Registry-Test für Löschfunktionen.

## Slice 10 – Paket, Testmoodle und Review

- Pluginversion erhöhen und `npm run build:plugin` ausführen.
- Unit-, Contract- und Integrationstests ausführen; notwendige Moodle-E2E-Journeys prüfen.
- Auf die Testinstanz deployen und Read-back verifizieren.
- Diff gegen Standards und Spezifikation reviewen; nur Befunde aus der eigenen Änderung bereinigen.

## Reihenfolge und Dringlichkeit

Die Slices laufen in der angegebenen Reihenfolge. Slice 1, 2, 6 und 7 bilden die dringende erste Lieferung. Die vollständige Formularparität wird danach über Slice 3 bis 5 geschlossen; Fragenumzug und manuelle Bereinigung folgen in Slice 8 und 9.

## Ausdrücklich nicht enthalten

- KP-002 Kurzvideo-Player.
- KP-003 Bewertungsbuch-Automatisierung.
- Drittanbieter-/KI-Formularfelder.
- Löschoperationen für Fragen, Quiz-Slots oder bestehende Dateien.
