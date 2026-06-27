# curl/PowerShell-Bootstrap statt kompiliertem Installer

Kurspilot wird an technisch ungeuebte Lehrkraefte auf privaten Geraeten verteilt
(macOS Intel+ARM, Windows x64+ARM; Linux zurueckgestellt). Der erste Livetest
nutzte einen kompilierten, signierten Installer (`.pkg` mit gebuendelter
Node-Runtime auf macOS, Setup-Skript auf Windows). Er ist zweifach gescheitert:

- **Prozessorarchitektur**: das gebuendelte Binary passte nicht zur CPU der
  Lehrkraft (ARM vs. x86) — eine Lehrkraft mit x86-Mac konnte den Installer
  nicht ausfuehren.
- **Code-Signing**: Gatekeeper blockierte die unsignierte Datei auf einem
  neueren Mac; die Lehrkraft kam nicht weiter.

Beide Probleme sind Eigenschaften *heruntergeladener, kompilierter* Artefakte.

## Optionen

- **Kompilierten Installer signieren/notarisieren**: loest Gatekeeper, aber
  kostet ein Apple-Developer-Zertifikat (jaehrliche Gebuehr, Pflege) und je
  einen Build pro OS/Architektur. Architektur-Matrix bleibt.
- **npm-Paket auf npmjs.com, Aufruf per `npx`**: kein Signing, kein eigener
  Build pro Architektur (laeuft ueber vorhandene Node-Runtime). Aber: zweiter
  Vertriebskanal mit eigener Pflege (publish, Version, npm-Account/Token) —
  und setzt voraus, dass die Lehrkraft Node bereits hat.
- **curl/PowerShell-Bootstrap, der den Repo-Tarball von GitHub holt**: ein
  Einzeiler pro OS laedt ein Bootstrap-Skript, das (a) bei Bedarf eine
  offizielle Node-Runtime architektur-passend ins Userverzeichnis entpackt und
  (b) den App-Tarball direkt aus dem GitHub-Repo holt. Kein Signing, kein
  eigener Build, kein npm-Registry-Kanal, ein einziger fester Absender.

## Entscheidung

Wir verteilen Kurspilot ueber einen **curl/PowerShell-Bootstrap, der den
GitHub-Tarball holt** — nicht kompiliert, nicht signiert, ohne npm-Registry.

**Einstiegsbefehl (ein Copy&Paste pro OS):**

```
# macOS/Linux
curl -fsSL https://raw.githubusercontent.com/matthiasgruenwald/Kurspilot/main/setup.sh | bash

# Windows (Bypass direkt im Befehl, sonst blockt die PowerShell-Policy auch ohne Admin)
powershell -ExecutionPolicy Bypass -Command "iwr -useb https://raw.githubusercontent.com/matthiasgruenwald/Kurspilot/main/setup.ps1 | iex"
```

**Warum das die Fehlerursachen beseitigt:**

- *Architektur*: das Bootstrap-Skript erkennt OS+Arch (`uname -m` /
  `$env:PROCESSOR_ARCHITECTURE`) und zieht das passende **offizielle
  Node-Tarball** — kein eigener Build, kein Architektur-Mismatch.
- *Signing/Gatekeeper*: das Quarantaene-Flag setzt der Browser/Finder beim
  Download, nicht `curl`/`tar`. Per Skript geladene und entpackte Binaries
  sowie eine vom Skript **lokal geschriebene** Startmenue-/Spotlight-
  Verknuepfung tragen das Flag nie — keine Gatekeeper-Warnung.

**Ablageorte (einheitlich, Userspace, kein Admin):**

| Inhalt | macOS/Linux | Windows |
|---|---|---|
| Node-Runtime | `~/.kurspilot/node/` | `%LOCALAPPDATA%\Kurspilot\node` |
| App (Tarball-Inhalt) | `~/.kurspilot/app/` | `%LOCALAPPDATA%\Kurspilot\app` |
| ImageMagick (optional) | `~/.kurspilot/imagemagick/` | `%LOCALAPPDATA%\Kurspilot\imagemagick` |

Diese Orte sind **stabil**, damit die in `claude_desktop_config.json` /
`~/.claude.json` / Codex-`config.toml` eingetragenen absoluten Pfade
(`<node> <app>/scripts/start-mcp.js`) ein Update unbeschadet ueberstehen.

**Node-Beschaffung, idempotent (Reihenfolge):**
1. liegt ein Kurspilot-Node unter `~/.kurspilot/node`? → nutzen.
2. sonst System-Node auf PATH (>= 18)? → nutzen.
3. sonst offizielles Tarball architektur-passend nach `~/.kurspilot/node`.

(Schritt 1 zuerst, weil das private Node nicht auf PATH liegt — sonst laedt
jeder Lauf Node neu.)

**Transparenz als Anforderung, nicht als Beiwerk:** Verunsicherung bei
Nicht-Technikern kommt aus Unvorhersehbarkeit. Der Bootstrap sagt **jeden
Schritt vorab auf Deutsch ohne Fachjargon an** ("Pruefe, ob Node.js vorhanden
ist...", "Node.js fehlt, ich installiere es jetzt automatisch", klares
Endsignal). Die Anleitung kuendigt **vorab** an, dass Windows SmartScreen ggf.
"Mehr Informationen -> Trotzdem ausfuehren" verlangt und alle Downloads vom
festen Absender `github.com/matthiasgruenwald/Kurspilot` kommen. So lernt die
Lehrkraft beim Benutzen mit — wie bei den uebrigen Kurspilot-Skills.

**Bühnen-Trennung:** Das Terminal **narriert** nur den Bootstrap. Die
eigentliche Konfiguration (Moodle-URL/Token, Arbeitsbereich, Wartung, Updates)
laeuft auf der bestehenden lokalen Browser-Seite (`lib/setup-browser-server.js`)
— Token-Eingabe per Copy&Paste im Browserfeld ist fuer die Zielgruppe deutlich
robuster als blinde Terminal-Eingabe.

## Konsequenzen

- **Positiv**: kein Signing-Zertifikat, kein Per-Architektur-Build, ein
  Vertriebskanal (GitHub), Versionierung ueber Git-Tags/Branches,
  Weiterentwicklung auf Nebenbranches ohne Release-Zeremonie. Die bestehende
  `lib/setup-flow.js` (idempotent, nicht-destruktives Config-Patching,
  Skill-Install mit Konflikterkennung) wird unveraendert wiederverwendet.
- **Negativ**: zwei Bootstrap-Skripte (`setup.sh` + `setup.ps1`) parallel zu
  pflegen. Lehrkraft muss einmal ein Terminal-/PowerShell-Fenster oeffnen —
  bewusst akzeptiert als kleineres Uebel gegenueber Installer-Pflege
  (Signing/Architektur).
- **Bleibt zu loesen bei Umsetzung**: portable ImageMagick-Builds sind je OS
  unterschiedlich gut verfuegbar (Linux AppImage / Windows portable Zip
  unkritisch; macOS self-contained Build braucht eine bestimmte Quelle).
  Da ImageMagick optional und hinter dem Wartungsmenue liegt, blockiert das
  den Vertrieb nicht.
- Der alte kompilierte Installer (`dist/macos-installer/`) wird aus Git
  **untracked** (lokal als Referenz behalten), damit der `main`-Tarball nicht
  die ~100-MB-Runtime mitschleppt. Endgueltige Loeschung erst nach
  erfolgreichem Test des neuen Wegs.

## Updates und Skill-Konflikte

Der Einzeiler ist die **Erst-Einrichtung** (idempotent: zweiter Lauf erkennt
"schon da", repariert hoechstens eine Config). Die wiederauffindbare
Verknuepfung "Kurspilot konfigurieren" (Startmenue/Spotlight, selbst
geschrieben, zero-dependency) oeffnet **immer** die Browser-Seite. Dort gibt es
einen Knopf **"Nach Updates suchen"** fuer Skills, MCP-Server und ImageMagick.

Updates der verwalteten Skills nutzen die bestehende Manifest-basierte
**Konflikterkennung** in `lib/skill-install.js` (sha256-Basis = zuletzt von
Kurspilot geschriebener Stand). Ein Konflikt entsteht nur, wenn die Lehrkraft
eine verwaltete Skill-Datei selbst veraendert hat — fuer die Zielgruppe der
seltene Fall. Es wird **keine** eigene 3-Wege-Merge-Logik gebaut: das
Zusammenfuehren delegiert Kurspilot an die KI, die ohnehin vorliegt
(Claude/Codex). Bei Konflikt zeigt die Browser-Seite einen fertigen, den
konkreten Skill-Namen nennenden Copy&Paste-Prompt ("vergleiche meine Version
von <skill> mit dem Update, fuehre meine Anpassungen zusammen, benenne um").
Danach bestaetigen und Update erneut ausfuehren. Die KI ist das
Merge-Werkzeug — die einzige Stelle, an der ein Markdown-Merge fuer die
Zielgruppe bedienbar ist.
