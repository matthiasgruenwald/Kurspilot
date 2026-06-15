# moodle-mcp

KI-gestützter Moodle-Kursaufbau via Claude Desktop und MCP.

> **IGS-Arbeitsversion:** Dieses Repository ist ein schulbezogener Fork von
> [`jtuttas/MoodleMcp`](https://github.com/jtuttas/MoodleMcp), der für Fortbildung,
> Testinstanz und IGS-Sprache eigenständig weiterentwickelt wird (siehe
> `docs/adr/0002-use-an-igs-fork-as-training-version.md`). Begriffe wie
> **Unterrichtseinheit**, **Unterthema** und **Lernpfad** ersetzen die im Upstream
> verwendete BBS-Sprache (z.B. "Lernsituation").

Claude Desktop spricht direkt mit der Moodle REST API und kann Kursabschnitte,
Textseiten, Labels, Aufgaben und externe Links anlegen und bearbeiten.

Zusätzlich kann der Server lokal erzeugte Dateien (z.B. PDF/DOCX/XLSX) als
"Zusätzliche Dateien" direkt in Moodle-Aufgaben hochladen.

Außerdem unterstützt der Server das Setzen von **Abschlussverfolgung** und
**Voraussetzungen/Verfügbarkeit** (Aktivität ist gesperrt, bis andere Aktivitäten
abgeschlossen sind).

Für Lehrkräfte heißt die Skill-Familie **Kurspilot**. `kurspilot` ist der sichtbare
Einstieg und wechselt je nach Anliegen transparent in `kurspilot-einrichten`,
`kurspilot-planen` oder `kurspilot-umsetzen`.

```
Claude Desktop (stdio)
       |
  moodle-mcp.js          <- lokaler MCP Server (Node.js)
       |
  Moodle REST API        <- local_aicoursecreator Plugin
       |
  Moodle 4.x
```

---

## Voraussetzungen

- Moodle 4.0 oder neuer
- Node.js (v18+) auf dem Rechner mit Claude Desktop
- Claude Desktop
- Admin-Zugang zu Moodle

---

## Installation

### 1. Moodle-Plugin installieren

Das Plugin `local_aicoursecreator` stellt die benötigten Webservice-Funktionen bereit.

1. `local_aicoursecreator.zip` herunterladen
   (im Repository liegt die ZIP unter `Plugin/local_aicoursecreator.zip`)
2. In Moodle: **Website-Administration → Plugins → Plugin installieren**
3. ZIP hochladen und Upgrade bestätigen

> **Hinweis:** Falls du das Plugin neu installierst (Update), zuerst deinstallieren,
> dann die neue ZIP installieren.

### 2. Web Services in Moodle aktivieren

**Website-Administration → Erweiterte Funktionen:**
- "Webservices aktivieren" ✅

**Website-Administration → Plugins → Webservices → Protokolle verwalten:**
- REST-Protokoll aktivieren (Auge-Symbol) ✅

### 3. API-Token erstellen

**Website-Administration → Server → Webservices → Token verwalten → Token hinzufügen**

- **Nutzer:** Admin oder Lehrer mit Kursbearbeitungsrechten
- **Dienst:** `AI Course Creator Service`
- Token kopieren – er wird nur einmal angezeigt!

> **Sicherheit:** Den Token wie ein Passwort behandeln. Niemals in
> öffentliche Repositories oder Chats einfügen.

### 4. moodle-mcp.js einrichten

`moodle-mcp.js` auf den lokalen Rechner kopieren, z.B. nach:
- Windows: `C:\moodle-mcp\moodle-mcp.js`
- macOS/Linux: `~/moodle-mcp/moodle-mcp.js`

Keine weiteren Abhängigkeiten – nur Node.js wird benötigt.

### 5. Claude Desktop konfigurieren

Konfigurationsdatei öffnen:
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`

Folgenden Inhalt eintragen:

```json
{
  "mcpServers": {
    "moodle": {
      "command": "node",
      "args": ["C:\\moodle-mcp\\moodle-mcp.js"],
      "env": {
        "MOODLE_URL": "https://deine-moodle-url/moodle",
        "MOODLE_TOKEN": "dein-api-token"
      }
    }
  }
}
```

Auf macOS/Linux:

```json
{
  "mcpServers": {
    "moodle": {
      "command": "node",
      "args": ["/home/user/moodle-mcp/moodle-mcp.js"],
      "env": {
        "MOODLE_URL": "https://deine-moodle-url/moodle",
        "MOODLE_TOKEN": "dein-api-token"
      }
    }
  }
}
```

### 6. Codex konfigurieren (optional)

Codex lädt MCP-Server aus `~/.codex/config.toml`. Folgenden Block ergänzen:

```toml
[mcp_servers.moodle]
command = "node"
args = ["/Users/dein-name/moodle-mcp/moodle-mcp.js"]
startup_timeout_sec = 30

[mcp_servers.moodle.env]
MOODLE_URL = "https://deine-moodle-url/moodle"
MOODLE_TOKEN = "dein-api-token"
```

Wenn du das Repository lokal nutzt und die Zugangsdaten in einer `.env` im
Projektordner liegen, kannst du stattdessen diese Variante verwenden:

```toml
[mcp_servers.moodle]
command = "/bin/zsh"
args = [
  "-lc",
  "cd '/Users/dein-name/moodle-mcp' && set -a && source .env && set +a && node moodle-mcp.js"
]
startup_timeout_sec = 30
```

Danach Codex neu starten oder einen neuen Thread öffnen. Prüfen kannst du die
Einrichtung mit der Frage:

```text
Siehst du Moodle-MCP-Tools wie moodle_get_sections?
```

Wenn `moodle_get_sections` sichtbar ist, ist der Server geladen. Ein erster
Funktionstest ist:

```text
Rufe mit dem Moodle-MCP moodle_get_sections für Kurs-ID 2 auf.
```

### 7. Claude Desktop neu starten

Claude Desktop vollständig beenden (auch aus dem System-Tray) und neu starten.
Unten links das Hammer-Symbol prüfen – dort sollten die Moodle-Tools erscheinen.

---

## Verfügbare Tools

| Tool | Beschreibung |
|---|---|
| `moodle_get_sections` | Alle Abschnitte eines Kurses lesen |
| `moodle_get_modules` | Alle Aktivitäten eines Abschnitts mit cmid lesen |
| `moodle_update_section` | Abschnittsname und Beschreibung setzen |
| `moodle_create_label` | Text- und Medienfeld anlegen (Phasen-Header) |
| `moodle_update_label` | Text- und Medienfeld bearbeiten |
| `moodle_create_page` | Textseite anlegen |
| `moodle_update_page` | Textseite bearbeiten |
| `moodle_create_url` | Externen Link anlegen |
| `moodle_update_url` | Externen Link bearbeiten |
| `moodle_create_assign` | Aufgabe anlegen |
| `moodle_update_assign` | Aufgabe bearbeiten |
| `moodle_crop_image` | Lokale Bilddatei rechteckig zuschneiden |
| `moodle_upload_assignfile` | Datei als "Zusätzliche Datei" in eine Aufgabe hochladen |
| `moodle_embed_assign_image` | Bild direkt sichtbar in eine Aufgabenbeschreibung einbetten |
| `moodle_create_quiz` | Quiz (mod_quiz) anlegen – Modus wählt Settings-Kombination (siehe unten) |
| `moodle_create_question_category` | Fragenbank-Kategorie im Kurs anlegen (idempotent) |
| `moodle_get_question_categories` | Fragenbank-Kategorien eines Kurses lesen |
| `moodle_set_completion` | Abschlussverfolgung für eine Aktivität konfigurieren |
| `moodle_set_restriction` | Aktivität sperren, bis andere Aktivitäten abgeschlossen sind |

### Quiz-Modi (`moodle_create_quiz`)

`moodle_create_quiz` kennt drei Modi (Parameter `mode`). Jeder Modus setzt eine
komplette, dokumentierte Settings-Kombination – Fragen werden anschließend separat
hinzugefügt. `gradepass` und `timelimit` lassen sich pro Aufruf explizit setzen
und überschreiben dann den Modus-Default (Layered Defaults).

| Modus | Frageverhalten | Versuche | Bewertungsmethode | Review-Sichtbarkeit | Zeitlimit | gradepass |
|---|---|---|---|---|---|---|
| `lerncheck` (Default) | `deferredfeedback` (Auswertung nach Abgabe) | unbegrenzt (0) | beste Bewertung (`QUIZ_GRADEHIGHEST`) | sofort + nach Versuch sichtbar | 0 (unbegrenzt) | ~80 % |
| `intensiv` | `immediatefeedback` (Rückmeldung pro Frage) | unbegrenzt (0) | Durchschnittsnote (`QUIZ_GRADEAVERAGE`) | sofort + Erklärungen sichtbar | 0 (unbegrenzt) | ~80 % |
| `bewertung` | `deferredfeedback` | genau 1 | beste Bewertung (`QUIZ_GRADEHIGHEST`) | erst nach Schließung des Quiz | 0 (= unbegrenzt) – optional konfigurierbar | ~50 % |

**Schüler-Erfahrung und Monitoring-Tradeoffs:**

- **Lerncheck (Default):** Unbegrenzte Wiederholung mit voller Auswertung nach Abgabe.
  Schüler sehen ihren Lernstand und können gezielt nacharbeiten. Die Lehrkraft sieht
  am Versuchsverlauf gut, wo Lücken bestehen – ideal vor einer Klassenarbeit.
- **Intensiv-Üben (`intensiv`):** Sofortiges Feedback nach jeder Frage motiviert und
  unterstützt selbstständiges Üben. Tradeoff: Die Durchschnittsnote über alle
  Versuche verzerrt das Bild für die Lehrkraft – einzelne Versuche sind aussagekräftiger
  als die Gesamtnote.
- **Bewertungsmodus (`bewertung`):** Ein einziger Versuch, Auswertung erst nach
  Schließung – verhält sich wie eine klassische Klassenarbeit. Tradeoff: kein Üben
  möglich, falsche Eingaben nicht reversibel; für Lernzielkontrolle gedacht, nicht
  zum Wiederholen.

### Sichtbarkeit (optional)

Viele Create/Update-Tools unterstützen den Parameter `visible`:

- `1` = sichtbar
- `0` = versteckt
- bei Update-Tools zusätzlich: `-1` = nicht ändern (Standard)

---

## Kurspilot: Unterrichtseinheiten automatisch aufbauen

Das Projekt enthält die Kurspilot-Skillfamilie in [`SKILL.md`](SKILL.md), die
Claude anweist, aus einer Unterrichtseinheit oder einem Unterthema automatisch
einen vollständigen Moodle-Kursabschnitt zu erstellen – ohne Browser, ohne
manuelle Klicks.

V1 umfasst diese vier Skills:

- `kurspilot`: sichtbarer Einstieg, benennt den jeweils genutzten Modus offen
- `kurspilot-einrichten`: legt lokalen Kontext und Startstruktur an
- `kurspilot-planen`: erstellt und zeigt den freizugebenden Implementierungsplan
- `kurspilot-umsetzen`: schreibt freigegebene Pläne in Moodle um

**Trigger-Phrasen für Claude:**
- "Erstelle einen Moodle-Kurs für diese Unterrichtseinheit"
- "Baue den Kurs in Moodle auf"
- "Lege das Thema in Moodle an (Kurs-ID: ...)"

Der Skill übernimmt dabei automatisch:
- Abschnittsname + gestaltete Ausgangssituations-Card
- Alle Phasen als farbkodierte Label-Header
- Informationsblätter als Textseiten (mit Syntax-Highlighting für Code)
- Externe Dokumentationslinks
- Aufgaben mit PDF-Druckbutton und Abgabe-Hinweis

In V1 gibt es kein separates `kurspilot-fortsetzen` und kein separates
`kurspilot-materialien`; Weiterarbeit läuft je nach Stand über den passenden
Modus, der im sichtbaren Wechsel benannt wird.

Technische Details, HTML-Vorlagen und Entscheidungsregeln für den Aktivitätstyp
sind vollständig in [`SKILL.md`](SKILL.md) dokumentiert.

---

## Verwendung

### Kurs-ID herausfinden

Die Kurs-ID steht in der URL des Moodle-Kurses:

```
https://moodle.example.de/moodle/course/view.php?id=42
                                                    ^^
                                               das ist die ID
```

### Beispiele

**Abschnitte eines Kurses lesen:**
> "Lies die Abschnitte von Kurs 42"

**Einen Abschnitt benennen:**
> "Benenne Abschnitt 1 in Kurs 42 als 'Unterthema 7.2 – ESP32 Webserver'"

**Komplette Unterrichtseinheit aufbauen:**
> "Baue in Kurs 42, Abschnitt 2 eine Unterrichtseinheit zum Thema ESP32 Webserver auf.
> Erstelle alle Phasen mit passenden Aktivitäten."

**Bestehende Seite bearbeiten:**
> "Lies die Module in Abschnitt 1 von Kurs 42 und ändere den Inhalt der
> Textseite 'Informationsblatt' auf einen aktualisierten Text."

**Abschlussverfolgung aktivieren (für Voraussetzungen):**
> "Lies die Module in Abschnitt 2 von Kurs 42. Aktiviere für die Aufgabe 'Arbeitsblatt' die Abschlussverfolgung: automatisch bei Einreichung."

**Aktivität sperren bis andere abgeschlossen sind:**
> "Sperre in Kurs 42 die Textseite 'Implementierung' bis die Aufgabe 'Konzept-Abgabe' abgeschlossen ist. Zeige die gesperrte Aktivität ausgegraut an."

**Datei in eine Aufgabe hochladen:**
> "Lies die Module in Abschnitt 2 von Kurs 42, finde die Aufgabe 'Arbeitsblatt' und lade die Datei `C:\\temp\\Arbeitsblatt.pdf` als zusätzliche Datei in diese Aufgabe hoch."
> Hinweis: Für `moodle_upload_assignfile` muss der Pfad absolut sein und die Datei lokal existieren (Claude kann die Datei vorher lokal generieren).

**Bild vor dem Upload zuschneiden:**
> "Schneide aus `/tmp/scan.png` den Bereich x=120, y=80, Breite=900, Hoehe=620 nach `/tmp/scan-ausschnitt.png` aus und lade danach diesen Ausschnitt in die Aufgabe hoch."
> Hinweis: `moodle_crop_image` erzeugt zuerst lokal die zugeschnittene Datei; anschließend den zurückgegebenen `filepath` mit `moodle_upload_assignfile` verwenden.

**Bild direkt in einer Aufgabenbeschreibung anzeigen:**
> "Schneide aus `/tmp/scan.png` den relevanten Bereich nach `/tmp/scan-ausschnitt.png` aus und binde diesen Ausschnitt mit Alt-Text direkt sichtbar in die Beschreibung der Aufgabe ein."
> Hinweis: Fuer sichtbare Aufgabenbilder `moodle_embed_assign_image` verwenden, nicht `moodle_upload_assignfile` – letzteres erzeugt separate zusätzliche Dateien.

---

## Bekannte Einschränkungen

**Emojis in Aktivitätstiteln nicht möglich**
Die meisten Moodle-Installationen nutzen `utf8` statt `utf8mb4` als Datenbankzeichensatz.
Emojis im `name`-Feld führen zu einem Datenbankfehler. Im HTML-Inhalt funktionieren
Emojis problemlos als HTML-Entities, z.B. `&#127757;` statt 🌍.

**Sichtbarkeit von Abschnitten**
`update_section` setzt Sichtbarkeit auf Abschnittsebene. Die Sichtbarkeit einzelner
Aktivitäten wird über den `visible`-Parameter der jeweiligen Create/Update-Funktion
gesteuert.

**Voraussetzungen / Abschlussverfolgung**
Damit Voraussetzungen über abgeschlossene Aktivitäten funktionieren, muss in Moodle
die Abschlussverfolgung im Kurs (bzw. systemweit) aktiviert sein.

**Kursformat**
Das Plugin funktioniert mit allen Moodle-Kursformaten (Topics, Weekly usw.).
Die `sectionnum` ist immer 0-basiert (Abschnitt 0 = allgemeiner Bereich).

---

## Projektstruktur

```
moodle-mcp/
├── moodle-mcp.js                  <- Lokaler MCP stdio Server
├── README.md
├── SKILL.md                       <- Claude Skill (Unterrichtseinheiten automatisch aufbauen)
└── Plugin/
    └── local_aicoursecreator.zip  <- Moodle Plugin (Webservice-Funktionen)
```

---

## Fehlerbehebung

| Problem | Lösung |
|---|---|
| Hammer-Symbol fehlt in Claude Desktop | Claude Desktop neu starten; JSON-Syntax prüfen |
| `Call to undefined function add_moduleinfo()` | Plugin neu installieren (modlib.php-Fix) |
| `Incorrect string value` Datenbankfehler | Kein Emoji im Titel verwenden |
| `Access denied` | Nutzer dem Dienst als autorisierte Person hinzufügen |
| `Service not found` | Token prüfen; Dienst `AI Course Creator Service` aktiv? |
| Aktivität im falschen Abschnitt | `sectionnum` ist 0-basiert: Abschnitt 1 = `sectionnum: 1` |

---

## Urheberrechtswarnung

KI-erstelltes Material (Textseiten, Aufgaben, Arbeitsblätter, Quellenhinweise usw.)
darf **nicht automatisch weiterverbreitet** werden – weder an andere Kolleginnen und
Kollegen noch in öffentliche Repositories, geteilte Ablagen oder andere Moodle-Instanzen.

- Die Nutzung im eigenen schulischen Moodle-Kurs und die Weitergabe an andere Personen
  oder Repositories haben unterschiedliche rechtliche Risiken.
- Enthält das Material Auszüge aus Lehrwerken, Schulbüchern, Screenshots oder anderen
  urheberrechtlich geschützten Quellen, bleibt die **Lehrkraft verantwortlich** für
  Prüfung und Entscheidung über eine Weitergabe.
- Dies ist **keine Rechtsberatung**, sondern ein Hinweis zur eigenen Verantwortung.
  Im Zweifel: vor Weitergabe Rücksprache mit der Schulleitung oder zuständigen Stellen
  halten und nur eine **bereinigte Fassung** (siehe `CONTEXT.md`, Begriff
  "Bereinigte Weitergabe") teilen.

---

## Lizenz

MIT
