---
name: mcp-tools
description: Lies diese Datei, wenn du nachschlagen willst, welches Moodle-MCP-Tool fuer einen Schreib- oder Lesezugriff zustaendig ist.
---

# Referenz: Verfuegbare MCP-Tools

Lies diese Datei, wenn du nachschlagen willst, welches Moodle-MCP-Tool fuer
einen Schreib- oder Lesezugriff zustaendig ist.

| Tool | Verwendung |
|---|---|
| `moodle_get_sections` | Abschnitte eines Kurses lesen |
| `moodle_get_modules` | Aktivitaeten + cmids eines Abschnitts lesen |
| `moodle_get_course_catalog` | Kompakte, filterbare read-only Moodle-Katalogansicht fuer Planung lesen |
| `moodle_update_section` | Abschnittsname und bei Planbezug Abschnittseinstieg setzen |
| `moodle_move_section` | Bestehenden Abschnitt ohne Inhaltsaenderung an eine neue Position verschieben |
| `moodle_move_module` | Bestehende Aktivitaet per cmid vor/nach eine andere Aktivitaet oder ans Abschnittsende verschieben |
| `moodle_create_label` | Phasen-Header oder knappen Trenner anlegen |
| `moodle_create_page` | Textseite anlegen (nur lesen) |
| `moodle_create_url` | Externen Link anlegen |
| `moodle_create_assign` | Aufgabe anlegen |
| `moodle_create_resource` | Datei (mod_resource) anlegen |
| `moodle_create_folder` | Verzeichnis (mod_folder) anlegen |
| `moodle_create_choice` | Abstimmung (mod_choice) anlegen |
| `moodle_create_forum` | Forum (mod_forum) anlegen |
| `moodle_update_label` | Label bearbeiten |
| `moodle_update_page` | Textseite bearbeiten |
| `moodle_update_assign` | Aufgabe bearbeiten |
| `moodle_update_url` | Link bearbeiten |
| `moodle_update_resource` | Datei bearbeiten |
| `moodle_update_folder` | Verzeichnis bearbeiten |
| `moodle_update_choice` | Abstimmung bearbeiten |
| `moodle_update_forum` | Forum bearbeiten |
| `moodle_upload_folder_file` | Datei in ein Verzeichnis hochladen |
| `moodle_ensure_question_bank` | Benannte Kurs-/Projekt-Fragensammlung anlegen oder wiederverwenden (idempotent) |
| `moodle_create_question_category` | Fragenbank-Kategorie je Unterthema/Inhaltsabschnitt in ausgewählter Fragensammlung anlegen (idempotent) |
| `moodle_update_question_category` | Fragenbank-Kategorie nicht-destruktiv umbenennen und/oder in die richtige Fragensammlung/Zielkategorie verschieben |
| `moodle_get_question_categories` | Vorhandene Fragenbank-Kategorien einer ausgewählten Fragensammlung lesen |
| `moodle_move_question` | Frage mit allen Versionen nicht-destruktiv in eine Zielkategorie verschieben |
| `moodle_create_quiz` | Quiz (mod_quiz) anlegen – Modus waehlt komplette Settings-Kombination (siehe `kurspilot_get_skill("quiz-und-fragenbank")`) |
| `moodle_update_quiz_settings` | Bestehendes Quiz nachträglich auf eine Kurspilot-Settings-Kombination umstellen |

Aktivitaetstyp-Auswahl (welches Create-Tool fuer welche Situation) steht in
`kurspilot_get_skill("implementierungsplan-workflow")`.
