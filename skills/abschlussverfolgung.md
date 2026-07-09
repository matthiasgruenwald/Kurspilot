# Referenz: Abschlussverfolgung (optionales Feature)

Lies diese Datei, wenn die Lehrkraft Abschlussverfolgung (Completion/
Restriction-Ketten zwischen Aktivitaeten) wuenscht.

Wenn der Benutzer Abschlussverfolgung wuenscht, den Benutzer zuerst fragen:

> "Soll ich die Abschlussverfolgung aktivieren? Dann muessen SuS jede Aufgabe
> einreichen bevor die naechste freigeschaltet wird."

Falls ja: Den folgenden Workflow NACH dem Erstellen aller Aktivitaeten ausfuehren.

## Welche Aktivitaeten bekommen Abschlussverfolgung?

| Aktivitaetstyp | Completion-Typ | Erlaeuterung |
|---|---|---|
| `moodle_create_assign` | completion=2, completionsubmit=1 | Automatisch bei Einreichung |
| `moodle_create_page` | completion=1 | Manuell (SuS klickt "Abgeschlossen") |
| `moodle_create_url` | – | Keine Verfolgung (Links ueberspringen) |
| `moodle_create_label` | – | Keine Verfolgung (Header ueberspringen) |

## Pflicht-Reihenfolge beim Einrichten

IMMER in dieser Reihenfolge vorgehen – niemals umgekehrt:

```
1. Alle Aktivitaeten erstellen (create_*)
   → cmids aus den Antworten notieren

2. Fuer jede zu verfolgende Aktivitaet set_completion aufrufen
   → Erst wenn ALLE set_completion-Calls erfolgreich sind:

3. Fuer jede abhaengige Aktivitaet set_restriction aufrufen
   → require_cmids auf die VORHERIGE Aktivitaet zeigen lassen
```

## Beispiel-Workflow fuer 3 aufeinanderfolgende Aufgaben

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

## Textseiten in die Kette einbeziehen

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

## show_locked – Darstellung gesperrter Aktivitaeten

| Wert | Darstellung in Moodle |
|---|---|
| 1 (Standard) | Aktivitaet ausgegraut mit Schloss-Symbol und Hinweis sichtbar |
| 0 | Aktivitaet komplett unsichtbar bis Voraussetzung erfuellt |

Empfehlung: show_locked=1 verwenden damit SuS wissen was sie als naechstes erwartet.

## Labels und URLs NICHT in die Kette einbeziehen

Phasen-Header (Labels) und externe Links (URLs) bekommen KEINE Abschlussverfolgung
und KEINE Voraussetzungen. Sie bleiben immer sichtbar.

Die Kette bezieht sich nur auf Aufgaben (assign) und ggf. Textseiten (page).

## Fehlervermeidung

- NIEMALS set_restriction aufrufen bevor set_completion auf der
  Voraussetzungs-Aktivitaet gesetzt wurde – sonst funktioniert die
  Freischaltung nicht korrekt
- NIEMALS eine Aktivitaet als Voraussetzung eintragen die selbst
  keine Abschlussverfolgung hat (completion=0)
- Bei mehreren Voraussetzungen (require_cmids=[1001, 1002]) muessen
  ALLE genannten cmids zuvor mit set_completion konfiguriert worden sein
