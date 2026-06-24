# local_aicoursecreator

Moodle 4.x Plugin – ermöglicht KI-gestützten Kursaufbau via Webservice / MCP.

## Bereitgestellte Webservice-Funktionen

| Funktion | Beschreibung |
|---|---|
| `local_aicoursecreator_create_page` | Erstellt eine Textseite (mod_page) in einem Kursabschnitt |
| `local_aicoursecreator_create_assign` | Erstellt eine Aufgabe (mod_assign) in einem Kursabschnitt |
| `local_aicoursecreator_update_section` | Setzt Name und Zusammenfassung eines Abschnitts |
| `local_aicoursecreator_get_sections` | Gibt alle Abschnitte eines Kurses zurück |

---

## Installation

1. **ZIP entpacken** in `[moodle-root]/local/aicoursecreator/`
2. Moodle-Admin-Bereich öffnen → **Upgrade durchführen**
3. Fertig – das Plugin ist installiert

---

## Konfiguration (Webservice + Token)

### 1. Web Services aktivieren
`Website-Administration → Erweiterte Funktionen → Webservices aktivieren` ✅

### 2. REST-Protokoll aktivieren
`Website-Administration → Plugins → Webservices → Protokolle verwalten → REST` ✅

### 3. Token erstellen
`Nutzerfeld oben → Einstellungen → Sicherheitsschlüssel`
- **Nutzer**: Lehrkraft mit globaler **Kurspilot-Nutzungsrolle** fuer Token/REST
- **Kursrechte**: Lesen und Schreiben laufen weiterhin ueber die Trainerrechte im jeweiligen Kurs; die Kurspilot-Nutzungsrolle verleiht selbst keine Kursbearbeitung
- **Dienst**: `Coursepilot`
- Token kopieren und sicher aufbewahren

### 4. Mit MCP verbinden (webservice_mcp Plugin)
MCP-Endpoint:
```
https://DEINE-MOODLE-URL/webservice/mcp/server.php?wstoken=DEIN_TOKEN
```

---

## Beispiel-API-Aufruf (REST)

### Textseite erstellen
```
POST https://moodle.example.com/webservice/rest/server.php
wstoken=abc123
wsfunction=local_aicoursecreator_create_page
moodlewsrestformat=json
courseid=5
sectionnum=1
name=Einführung in das Thema
content=<p>Willkommen in diesem Abschnitt...</p>
```

### Aufgabe erstellen
```
POST https://moodle.example.com/webservice/rest/server.php
wstoken=abc123
wsfunction=local_aicoursecreator_create_assign
moodlewsrestformat=json
courseid=5
sectionnum=1
name=Aufgabe 1: Recherche
description=<p>Recherchiere folgende Themen...</p>
duedate=1735689600
maxfiles=3
```

### Abschnitt benennen
```
POST .../server.php
wsfunction=local_aicoursecreator_update_section
courseid=5
sectionnum=1
name=Lerneinheit 1: Grundlagen
summary=<p>In diesem Abschnitt lernst du...</p>
```

---

## Parameter-Referenz

### create_page
| Parameter | Typ | Pflicht | Beschreibung |
|---|---|---|---|
| courseid | int | ✅ | Kurs-ID |
| sectionnum | int | ✅ | Abschnittsnummer (0-basiert) |
| name | string | ✅ | Titel der Textseite |
| content | string | ✅ | HTML-Inhalt |
| visible | int | – | 1=sichtbar (Standard), 0=versteckt |

### create_assign
| Parameter | Typ | Pflicht | Beschreibung |
|---|---|---|---|
| courseid | int | ✅ | Kurs-ID |
| sectionnum | int | ✅ | Abschnittsnummer (0-basiert) |
| name | string | ✅ | Titel der Aufgabe |
| description | string | – | HTML-Beschreibung |
| duedate | int | – | Abgabedatum als Unix-Timestamp (0 = kein Datum) |
| allowsubmissionsfromdate | int | – | Freischaltdatum (0 = sofort) |
| maxfiles | int | – | Max. Dateiuploads (Standard: 1, 0 = kein Upload) |
| submissiondrafts | int | – | 1 = Schüler müssen Submit klicken |
| visible | int | – | 1=sichtbar (Standard) |

### update_section
| Parameter | Typ | Pflicht | Beschreibung |
|---|---|---|---|
| courseid | int | ✅ | Kurs-ID |
| sectionnum | int | ✅ | Abschnittsnummer |
| name | string | – | Abschnittsname |
| summary | string | – | HTML-Zusammenfassung |
| visible | int | – | 1=sichtbar (Standard) |

---

## Kompatibilität
- Moodle 4.0 – 4.5+
- PHP 7.4 / 8.0 / 8.1 / 8.2
