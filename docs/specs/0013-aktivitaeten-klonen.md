# Spezifikation: Aktivitäten klonen

## Problem Statement

Bestimmte Moodle-Aktivitätseinstellungen sind über MCP-Formularfelder schwer oder gar nicht erreichbar — insbesondere Plugin-Konfigurationen von Abgabe- und Feedbacktypen bei Aufgaben. Lehrkräfte lösen das heute, indem sie eine gut konfigurierte Aktivität im Moodle-UI duplizieren und dann den Titel anpassen. Kurspilot bietet dafür keinen Werkzeugaufruf; der Agent muss die Lehrkraft zur Moodle-Oberfläche schicken.

Außerdem fehlen Zeitfensterfelder (`timeopen`/`timeclose`) in `update_quiz_settings` und `update_choice`: Wer nach einem Klon die Öffnungs- oder Schlusszeit korrigieren will, kann das nicht über MCP tun.

## Solution

Ein neues Tool `moodle_clone_activity` dupliziert eine beliebige Aktivität im selben Kurs (über den bereits registrierten Core-Webservice) oder in einen anderen Kurs (über einen neuen lokalen Adapter). Das Duplikat erhält einen sauberen Titel und ist standardmäßig sichtbar; alle weiteren Korrekturen (Zeitfelder, Abschlussregeln, Voraussetzungen) übernehmen die vorhandenen Update-Tools.

`update_quiz_settings` und `update_choice` erhalten `timeopen`/`timeclose` als optionale Patch-Felder.

Als Ablage für häufig verwendete Vorlagen dient eine einfache Textdatei `vorlagen.md` auf Wurzelebene des Kurspilot-Arbeitsbereichs; der Agent liest sie nur bei Bedarf.

## User Stories

1. As a teacher, I want to duplicate a correctly configured activity within my course, so that I can reuse complex plugin settings without switching to the Moodle UI.
2. As a teacher, I want to duplicate an activity into another course, so that I can apply a proven setup from a different teaching context.
3. As a teacher, I want the clone to receive a clean title immediately, so that I do not need a separate rename step after every clone.
4. As a teacher, I want the clone to be visible by default, so that a hidden source activity does not accidentally produce a hidden clone.
5. As a teacher, I want the agent to flag inherited completion rules and prerequisites after cloning, so that conditions designed for the source do not silently apply to the clone.
6. As a teacher, I want to set or change the time window of a quiz after cloning, so that open and close dates can be corrected without leaving MCP.
7. As a teacher, I want to set or change the time window of a choice after cloning, so that voting periods can be adjusted over MCP.
8. As a teacher, I want to note frequently used source activities in a local context file, so that I can refer to them by description rather than remembering cmids.

## Implementation Decisions

### `moodle_clone_activity`

- Tool wraps `core_courseformat_update_course` (Action `cm_duplicate`) für den selben Kurs. Dieser Webservice ist bereits im Coursepilot-Dienst registriert und erfordert kein neues Plugin-Webservice für den Intra-Kurs-Fall.
- Parameter: `cmid` (Quelle, Pflicht); optional `title` (neuer Titel, Default: kein Suffix), `sectionnum` (Zielabschnitt, Default: selber Abschnitt wie Quelle), `courseid` (Zielkurs, Default: selber Kurs), `visible` (Default: 1).
- Rückgabe: neue `cmid`, Modulname, effektiver Titel, Kurs-ID, Abschnitt, Sichtbarkeit.
- Der Agent entfernt standardmäßig den „(Kopie)"-Suffix; wenn `title` übergeben wird, setzt er diesen. Dafür wird nach dem Duplizieren ein Update-Aufruf auf die neue `cmid` abgesetzt (über vorhandene `update_assign`/`update_quiz_settings`/generisches Modul-Update je nach Typ; der Titel ist über `core_courseformat_update_course` mit Action `cm_rename` oder das jeweilige Module-Update setzbar).
- Sichtbarkeit: `visible = 1` ist Default; da die Quelle sichtbar oder versteckt sein kann und Moodle die Sichtbarkeit erbt, muss der Adapter nach dem Klonen aktiv `visible = 1` setzen (sofern nicht explizit `visible = 0` übergeben).
- **Intra-Kurs-Pfad** (Zielkurs = Quellkurs oder nicht angegeben): `core_courseformat_update_course`, Action `cm_duplicate`, optional `targetsectionid`. Neue `cmid` aus der State-Update-JSON-Antwort.
- **Kursübergreifender Pfad** (Zielkurs ≠ Quellkurs): Lokaler Adapter `local_coursepilot_clone_activity_to_course` im Plugin. Intern: `backup_controller(TYPE_1ACTIVITY, $cmid, FORMAT_MOODLE, INTERACTIVE_NO, MODE_IMPORT, $userid)` im Quellkurs, dann `restore_controller($backupid, $zielkursid, INTERACTIVE_NO, MODE_IMPORT, $userid, TARGET_CURRENT_ADDING)`. Explizite Capability-Prüfung im Zielkurs (`moodle/backup:backuptargetimport` im Quellkurs, `moodle/restore:restoretargetimport` im Zielkurs, `moodle/course:manageactivities` im Zielkurs).
- **Was überlebt die Duplikation:** Alle Modul-Einstellungen inkl. Plugin-Konfigurationen (Abgabe- und Feedbacktypen bei Aufgaben), Review-Bitmasken, Bewertungsfelder (`gradepass`/`gradecat`), Completion-Einstellungen, Voraussetzungen/Zugriffssperren, Gruppen-Overrides, eingebettete Dateien, Quiz-Fragen (als eigenständige Kopien), Gesamtfeedback-Texte. Bestätigt für `gradepass`/`gradecat` empirisch (Issue #303).
- **Was nicht überlebt (intentional):** Abgaben, Bewertungen, Versuche, User-Overrides, Badges.
- **Agent-Verhalten nach dem Klon:** Prüft Completion (`completion`, `completionpassgrade`, `completionview`, `completionexpected`) und Voraussetzungen (`availability`) im Read-back und weist die Lehrkraft darauf hin, wenn sie offensichtlich auf die Quellaktivität zugeschnitten sind. Kein automatisches Löschen — die Entscheidung liegt bei der Lehrkraft.
- **Alle Aktivitätstypen** mit Moodle-Backup-Unterstützung sind klonbar, nicht nur Aufgabe und Quiz. Für Typen ohne MCP-Update-Tool: Duplikat wird übergeben, der Agent beschreibt, was manuell in Moodle anzupassen ist.
- **Keine Vorlagen-Registry im Plugin.** Eine „Vorlage" ist eine normale Aktivität im Kurs, adressiert per `cmid`.

### `update_quiz_settings` und `update_choice` — Zeitfelder

- `update_quiz_settings` erhält die optionalen Patch-Felder `timeopen` und `timeclose` (Unix-Timestamp, 0 = kein Limit; -1 = nicht ändern, Sentinel wie bisherige Felder). Der Plugin-Webservice nimmt sie als reine Patch-Werte entgegen.
- `update_choice` erhält analog `timeopen` und `timeclose`. Die bestehende Patch-Logik für Choice-Updates bleibt erhalten (leere Strings = nicht ändern).
- Begründung: Zeitfelder wurden bei `create_quiz` und `create_choice` fest auf 0 gesetzt und waren bisher über MCP nicht änderbar. Nach einem Klon ist eine Korrektur ohne Moodle-UI-Wechsel möglich.

### Vorlagen-Ablage

- Textdatei `vorlagen.md` (o. ä.) direkt auf Wurzelebene des Kurspilot-Arbeitsbereichs (Geschwisterebene zu den Schuljahresordnern, keine `local-context/`-Zwischenebene, siehe `docs/adr/0003-allow-local-student-names-in-teacher-context.md` und Spezifikation 0011) des jeweiligen Geräts/Nutzers. Nicht im LLM-Memory, nicht pro Kurs, nicht im Plugin.
- Format: freie Markdown-Liste. Empfohlene Eintragsstruktur: Aktivitätstyp, Kursname + Kurs-ID, `cmid`, kurze Beschreibung was die Aktivität besonders macht, optional Verweis auf ergänzende Unterlagen.
- Der Agent liest die Datei nur bei explizitem Trigger: (1) die Lehrkraft verlangt eine Einstellung, die MCP nicht setzen kann; (2) sie verweist auf eine frühere Lösung; (3) unmittelbar vor einem Klon-Aufruf, wenn kein `cmid` genannt wurde.
- Anlegen und Pflegen der Datei obliegt der Lehrkraft; der Agent kann Einträge vorschlagen, aber die Datei nur mit Bestätigung schreiben.

## Testing Decisions

- **Intra-Kurs-Klon:** Aufgabe mit `gradepass`, Plugin-Konfiguration (Dateiabgabe) und Voraussetzung klonen → Read-back zeigt gleiche Settings, `gradepass` erhalten, kein „(Kopie)"-Suffix, `visible = 1`. Agent-Hinweis auf Voraussetzung erscheint im Response.
- **Quell-Aktivität versteckt:** Klon ist trotzdem sichtbar (Default).
- **Kursübergreifend:** Aktivität in Zielkurs klonen → neue `cmid` in Zielkurs-Katalog sichtbar; Capability-Fehler bei fehlendem Recht im Zielkurs liefert klare Fehlermeldung.
- **Quiz `timeopen`/`timeclose`:** Wert setzen → Read-back zeigt gesetzten Timestamp. Sentinel -1 → Wert unverändert.
- **Choice `timeopen`/`timeclose`:** Analog.
- Bestehende Quiz-, Choice-, Assign- und Profil-Tests bleiben grün (Regressionsprüfung).
- Der kursübergreifende Adapter-Pfad wird durch einen Integrationstest mit zwei Testkursen abgedeckt, falls die Testinstanz einen zweiten Kurs anbietet; sonst Smoke-Test.

## Out of Scope

- Abschnitte, Blöcke oder ganze Kurseinheiten als Vorlage klonen (nur Einzelaktivitäten).
- Vorlagen-Registry im Plugin oder in der Datenbank.
- Automatisches Bereinigen vererbter Voraussetzungen oder Completion-Bedingungen (Agent weist hin, entscheidet nicht).
- Löschen von Aktivitäten (Spec 0009, nicht-destruktiver Ansatz bleibt bestehen).
- Implementierung, Deployment, Migration bestehender Kurse.

## Further Notes

- Wayfinder-Karte und Entscheidungshistorie: [Issue #280](https://github.com/matthiasgruenwald/moodle-coursepilot/issues/280).
- Forschungsgrundlage: `docs/research/2026-08-14-aktivitaeten-duplizieren.md` (Branch `research/aktivitaeten-duplizieren`, Issue #283).
- Grilling-Entscheidungen: [Issue #286](https://github.com/matthiasgruenwald/moodle-coursepilot/issues/286).
- Verifikation `gradepass`/`gradecat`: [Issue #303](https://github.com/matthiasgruenwald/moodle-coursepilot/issues/303). Beide Felder bleiben beim Duplizieren erhalten; kein Nachsteuerpunkt nötig.
- Nebenbefund aus #303: KP-009 live beobachtet — `update_quiz_settings` ohne Felder wendete lernstandscheck-Defaults an und überschrieb `gradepass`, `attempts`, `preferredbehaviour`. Unterstreicht die Dringlichkeit von Spec 0012 (KP-009).
- Core-Webservice-zuerst-Vorgabe (Spec 0009, ADR 0007): `core_courseformat_update_course` mit Action `cm_duplicate` ist für den Intra-Kurs-Fall der öffentliche, registrierte und stabile Weg. Der kursübergreifende lokale Adapter ist die begründete Lücke.
- `duplicate_module()` benennt Duplikate mit Suffix „(Kopie)" (deutsches Locale); Kurspilot setzt den Titel nach dem Klonen immer explizit.
