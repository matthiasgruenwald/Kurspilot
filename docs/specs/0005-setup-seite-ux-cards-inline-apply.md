# 0005 – Setup-Seite: Cards mit Inline-Apply und Wartungsmodus

## Problem Statement

Die Setup-Seite (`lib/setup-render.js`, `renderSetupPage`) zeigt Lehrkräften ohne IT-Vorwissen alle Setup- und Wartungsoptionen gleichzeitig auf einer Seite. Nach abgeschlossener Ersteinrichtung sehen sie weiterhin denselben vollen Katalog aus Statusliste, Änderungs-Sektion, ImageMagick-Wartung, Crop-Backend-Umschalter, Update-Sektion und Kurspilot-Hinweisen. Das wirkt bei jedem Öffnen wie eine erneute Ersteinrichtung, verunsichert Lehrkräfte und lädt zu ungewollten Eingriffen ein.

Zusätzlich wird beim Speichern alles gebündelt abgeschickt (POST `/done` → `renderPostSaveActionsPage`) und danach müssen Lehrkräfte über einen separaten Post-Save-Bildschirm für jeden erkannten Client (Claude Desktop, Codex) einen "Beenden"- oder "Später"-Button klicken. Für opencode gibt es diesen Weg gar nicht — die Änderung greift stumm und der Hinweis, dass ein Neustart nötig ist, fehlt.

## Solution

Zwei getrennte Ansichten, die je nach Status automatisch gewählt werden:

- **Ersteinrichtungs-Ansicht** — für alle Fälle, in denen das Minimum-Set noch nicht erfüllt ist. Bleibt inhaltlich wie heute (Batch-Save, ein Formular), erhält aber einen Fortschrittsbalken oben und Loss-Aversion-Framing bei fehlenden Punkten.
- **Wartungs-Ansicht** — sobald das Minimum-Set erfüllt ist. Kompakter Header mit Live-Status, darunter sechs Cards (Moodle-Zugang, Arbeitsordner, KI-Clients, MCP-Aktivitäten, Bildbearbeitung, Version). Jede Card ist unabhängig und speichert instantan beim Klick auf "Speichern" in der ausgeklappten Form. Nur eine Card gleichzeitig offen.

Nach dem Instant-Save prüft die Card selbst, ob die Änderung einen Client-Neustart erforderlich macht, und blendet innerhalb der Card einen Hinweis ein — pro betroffenem Client entweder einen "Neustarten"-Button (Claude Desktop, Codex) oder eine reine Hinweiszeile (opencode: kein Daemon, greift beim nächsten CLI-Aufruf). Der separate Post-Save-Screen entfällt in der Wartungs-Ansicht komplett; in der Ersteinrichtung bleibt er, weil dort mehrere Bereiche gleichzeitig geschrieben werden.

Ein "Ersteinrichtung wiederholen"-Button im Wartungs-Footer öffnet einen Bestätigungsdialog und schaltet den Server bewusst zurück in die Ersteinrichtungs-Ansicht, ohne die gespeicherten Werte zu löschen.

## User Stories

1. Als Lehrkraft ohne IT-Vorwissen möchte ich beim Öffnen der Kurspilot-Einstellungen sofort sehen "alles läuft", damit ich beruhigt zurück zu meiner Unterrichtsplanung gehen kann.
2. Als Lehrkraft möchte ich nicht bei jedem Öffnen mit einer Setup-Ansicht konfrontiert werden, damit ich nicht das Gefühl habe, etwas erneut einrichten zu müssen.
3. Als Lehrkraft ohne IT-Vorwissen möchte ich bei der Ersteinrichtung einen sichtbaren Fortschrittsbalken sehen, damit ich weiß, wie viele Schritte noch fehlen.
4. Als Lehrkraft möchte ich bei einem fehlenden Ersteinrichtungs-Punkt eine Formulierung lesen wie "Ohne Moodle-Token: keine Kurse abrufbar" statt "Moodle-Token fehlt", damit ich die Konsequenz meines Nichthandelns sofort verstehe.
5. Als Lehrkraft möchte ich in der Wartungs-Ansicht auf eine Card klicken, dort meinen Moodle-Token neu eintragen, "Speichern" drücken und sofort eine Bestätigung sehen, ohne einen weiteren Bildschirm oder eine gesammelte Speicher-Aktion.
6. Als Lehrkraft möchte ich pro Card nur die Änderung sehen, die diese Card betrifft, damit ich keinen unbeabsichtigten Nebenzustand ändere.
7. Als Lehrkraft möchte ich, dass beim gleichzeitigen Öffnen einer Card die vorher offene Card automatisch geschlossen wird, damit die Seite ruhig bleibt.
8. Als Lehrkraft möchte ich unmittelbar nach dem Speichern einer neustart-relevanten Änderung sehen, welche KI-Clients neu gestartet werden müssen, damit ich weiß, was noch zu tun ist.
9. Als Nutzer:in von Claude Desktop möchte ich in der Card einen "Claude Desktop neustarten"-Button sehen, damit ich Claude nicht manuell suchen und beenden muss.
10. Als Nutzer:in von Codex möchte ich in der Card einen "Codex beenden"-Button sehen, damit die neue Konfiguration beim nächsten Codex-Start greift.
11. Als Nutzer:in von opencode möchte ich in der Card den Hinweis "Beim nächsten opencode-Chat aktiv — kein Neustart nötig" sehen, damit ich weiß, dass kein Neustart-Button existiert und opencode MCP-Server bei jedem neuen Chat frisch lädt.
12. Als Nutzer:in, das nur opencode nutzt, möchte ich nach dem Speichern trotzdem eine sichtbare Bestätigung erhalten, damit ich weiß, dass gespeichert wurde — auch ohne Neustart-Button.
13. Als Lehrkraft möchte ich, dass Änderungen an Moodle-URL/Token keine Client-Neustart-Aufforderung auslösen, wenn der MCP-Server den Wert bei jeder Anfrage aus dem Schlüsselbund liest — damit ich nicht unnötig Clients beende.
14. Als Lehrkraft möchte ich, dass Änderungen an der Client-Auswahl oder der MCP-Aktivitäten-Liste den entsprechenden Neustart-Hinweis anzeigen, weil dort tatsächlich neu geladen werden muss.
15. Als Lehrkraft möchte ich in der Wartungs-Ansicht einen kleinen Button "Ersteinrichtung wiederholen" haben, damit ich bei einem Umzug oder Zurücksetzen wieder zur ausführlichen Ansicht komme.
16. Als Lehrkraft möchte ich, dass der "Ersteinrichtung wiederholen"-Button einen Bestätigungsdialog zeigt, damit ich ihn nicht versehentlich betätige.
17. Als Lehrkraft möchte ich einen "Dienst beenden"-Button an prominenter Stelle, damit ich den Setup-Browser jederzeit schließen kann.
18. Als Lehrkraft möchte ich, dass die "Version"-Card auf Klick von "erneut prüfen" den Update-Check asynchron ausführt und mir das Ergebnis in derselben Card einblendet.
19. Als Lehrkraft möchte ich, dass die "Version"-Card bei verfügbarem Update den Button in "Installieren" ändert, damit ich ohne weitere Navigation aktualisieren kann.
20. Als Lehrkraft möchte ich in der "MCP-Aktivitäten"-Card alle sechs Aktivitätsnamen sichtbar sehen (nicht abgeschnitten), damit ich fundiert entscheide.
21. Als Lehrkraft möchte ich in der "Bildbearbeitung"-Card zwischen sips und ImageMagick per Radio-Button wählen, damit die Wahl exklusiv ist.
22. Als Lehrkraft möchte ich in der "Arbeitsordner"-Card den aktuellen Pfad vollständig lesen können (auch wenn er lang ist), damit ich verifiziere, dass ich den richtigen Ordner sehe.
23. Als Lehrkraft möchte ich eine "Ordner wählen…"-Schaltfläche in der Arbeitsordner-Card, damit ich per Dateidialog navigieren kann.
24. Als Entwickler:in möchte ich, dass die Umschaltung zwischen Ersteinrichtungs- und Wartungs-Ansicht deterministisch aus dem `SetupStatus` abgeleitet wird, damit Tests ohne HTTP-Round-Trip laufen können.
25. Als Entwickler:in möchte ich pro Card einen dedizierten POST-Endpunkt, damit die Instant-Save-Logik testbar und getrennt vom bestehenden `/done`-Batch-Flow bleibt.
26. Als Entwickler:in möchte ich, dass der bestehende `/done`-Batch-Flow und der Post-Save-Screen für die Ersteinrichtungs-Ansicht unverändert bleiben, damit dieser Umbau nur die Wartungs-Ansicht verändert.
27. Als Entwickler:in möchte ich einen `/restart-client`-Endpunkt, der die vorhandenen `endCodex`/`endClaudeDesktop`-Helper wiederverwendet, damit die Neustart-Logik zentralisiert bleibt.
28. Als Entwickler:in möchte ich, dass für opencode kein `/restart-client`-Aufruf gemacht wird, sondern die Card serverseitig den Hinweis-Zustand direkt zurückgibt.
29. Als Lehrkraft möchte ich, dass der Server nach der Instant-Save-Antwort weiter auf Anfragen wartet (kein automatisches Beenden wie bei `/done`), damit ich mehrere Cards nacheinander bearbeiten kann.
30. Als Lehrkraft möchte ich, dass beim Speichern einer Card kein anderer Seiten-State verloren geht (offene Formulareingaben in anderen Cards existieren nicht, weil immer nur eine Card offen ist), damit die Seite vorhersehbar bleibt.
31. Als Nutzer:in von opencode möchte ich verstehen, warum ich keinen Neustart-Button sehe — der Hinweistext soll die Ursache benennen ("MCP wird bei jedem neuen Chat frisch geladen"), damit ich das Fehlen nicht als Bug wahrnehme.
32. Als Entwickler:in möchte ich, dass die HTTP-Routen des Setup-Servers in einer explizit deklarativen Table stehen, damit neue Routen ohne If-Kaskaden-Editierung hinzugefügt werden können und `requireToken` pro Route zentral sichtbar ist.
33. Als Maintainer möchte ich, dass der Router-Table-Refactor die 8 bestehenden Routen verhaltensgleich hält (Regressionstests grün), damit der Umbau ohne funktionale Änderung an bestehenden Setup-Flüssen durchgeht.
34. Als Maintainer möchte ich, dass die Umsetzung sowohl unter macOS als auch unter Windows (Parallels-VM) manuell verifiziert wird, bevor sie nach `main` gemergt wird, damit plattformspezifische Regressionen (Prozess-Erkennung, Kill-Verhalten) nicht unbemerkt bleiben.

## Implementation Decisions

### Modus-Umschaltung (einziger Entscheidungspunkt)

Der Seam sitzt in `lib/setup-flow.js`: neuer, exportierter Helper `isMinimumConfigured(status)` mit folgender Logik:

```js
// Ausschnitt aus Prototyp-Session
function isMinimumConfigured(status) {
  const anyClient = Object.values(status.detectedClients).some(Boolean);
  return Boolean(
    status.moodle.url &&
    status.moodle.tokenPresent &&
    status.workspace.configured &&
    anyClient &&
    !status.kurspilotRepairRequired
  );
}
```

`setup-browser-server.js` ruft in GET `/` diesen Helper und wählt zwischen `renderSetupPage` (unverändert) und neuem `renderMaintenancePage`. Eine In-Memory-Flag `forceSetupMode` im Server (gesetzt durch POST `/restart-setup`) überschreibt die Auto-Wahl, ohne gespeicherte Werte zu ändern.

### Wartungs-Ansicht (neue Render-Funktion)

Neue Funktion `renderMaintenancePage(status)` in `lib/setup-render.js` neben `renderSetupPage`. Sechs Cards fest verdrahtet in dieser Reihenfolge:

| Card-ID | Titel | Formular | Neustart-relevant |
|---------|-------|----------|-------------------|
| `moodle` | Moodle-Zugang | URL + Token (password) | nein |
| `workspace` | Arbeitsordner | Pfad-Feld + "Ordner wählen…" | nein |
| `clients` | KI-Clients | Checkboxen Claude/Codex/opencode | ja (jeder betroffene Client) |
| `activities` | MCP-Aktivitäten | Checkboxen alle sechs sichtbar | ja (alle konfigurierten Clients) |
| `crop-backend` | Bildbearbeitung | Radio sips / ImageMagick | nein |
| `version` | Version | Ergebnis-Slot + "erneut prüfen"/"Installieren"-Button | nein (Update-Fluss unverändert) |

CSS-Regeln (aus Prototyp-Session):
- Grid: `repeat(auto-fit, minmax(280px, 1fr))`, `max-width: 1100px`
- `align-items: stretch` + Card als `display: flex; flex-direction: column`, `.card-summary { flex: 1 }` → gleiche Zeilenhöhe
- Nur eine Card gleichzeitig offen (Client-JS toggelt eine `.card--open` Klasse, schließt geschwistrige Cards vorher)
- Ausgeklappt: Akzent-Border + Schatten

Header: `h1 "Kurspilot"` + Untertitel "Einstellungen" + Statuszeile rechts (`● Alles läuft · Zuletzt geprüft: …`).

Footer:
- links: "Dienst beenden" (voller Button, ⏻-Icon) → POST `/abort` (bestehend)
- rechts: "Ersteinrichtung wiederholen" (kleiner Button, Undo-Icon) → JavaScript `confirm()` → POST `/restart-setup`

### Instant-Save pro Card (neuer Endpunkt)

Neuer HTTP-Endpunkt POST `/apply/:cardId` (oder `/apply?card=…`, je nach Router-Konvention der bestehenden Datei). Nimmt nur die Felder dieser einen Card entgegen, ruft **wiederverwendete** `runSetupFlow`-Bausteine über `flowOptions` — konkret: dieselben Setter, die heute schon aus `/done` konsumiert werden, nur mit auf eine Card gefiltertem Parameter-Set.

Antwort ist immer JSON:
```json
{
  "ok": true,
  "restartRequired": [
    { "client": "claude", "kind": "button" },
    { "client": "codex",  "kind": "button" },
    { "client": "opencode", "kind": "notice" }
  ],
  "newStatus": { ... }
}
```

Client-JS blendet in der Card einen Neustart-Block ein, der pro Eintrag entweder einen Button (POST `/restart-client` mit `client` im Body) oder eine Hinweiszeile rendert. `newStatus` erlaubt der Card, ihre Zusammenfassungszeile ohne Full-Reload zu aktualisieren.

Der Server ruft weder `close()` noch modifiziert `pendingPostSaveClients` — der Dienst bleibt offen für weitere Card-Bearbeitungen. Idle-Timeout (`refreshIdleTimeout`) bleibt aktiv wie bisher.

### Neustart-Logik

Neuer Endpunkt POST `/restart-client` mit `client`-Feld ∈ `{ codex, claude }`. Serverseitiger `if (client === 'opencode')` gibt sofort `200 { done: true, kind: "notice" }` ohne Prozess-Aufruf zurück — **opencode wird nicht als No-Op-Handler in `endClientHandlers` eingetragen**, weil der explizite Guard klarer ist als eine Funktion, die nichts tut. Für codex/claude wird `endClientHandlers[client]` aufgerufen (die vorhandenen `defaultEndClaudeDesktop` / `defaultEndCodex`), ohne dass `pendingPostSaveClients` berührt wird (das Set bleibt eine Post-Save-Screen-interne Buchführung des `/done`-Flows).

**Hintergrund opencode:** opencode lädt MCP-Server-Konfigurationen beim Start jedes neuen Chats frisch. Ein Prozess-Neustart ist nicht erforderlich. Die Card-UI zeigt eine reine Hinweiszeile ("Beim nächsten opencode-Chat aktiv — kein Neustart nötig"), keinen Button. Weder Prozess-Erkennung noch Kill-Mechanismus wird für opencode implementiert.

Karten-seitig entscheidet der Server anhand der Card-ID und `report.*WasRunningDuringSave` (bereits vorhanden), welche Einträge in `restartRequired` landen:
- Card `moodle`, `workspace`, `crop-backend`, `version` → immer `restartRequired: []`
- Card `clients`, `activities` → für jeden betroffenen laufenden Client aus `{codex, claude}` ein `{ kind: "button" }`; opencode (falls konfiguriert) immer als `{ kind: "notice" }`.

### Ersteinrichtungs-Ansicht (kosmetisch)

`renderSetupPage` bleibt strukturell bestehen. Zwei Ergänzungen:
- Fortschrittsbalken-Element oben, gespeist aus einem neuen Helper `computeSetupProgress(status)` in `setup-flow.js` (liefert `{done: n, total: 4}`).
- Loss-Aversion-Strings in `renderStatusItems` für die nicht erfüllten Minimum-Punkte. Weitere Wartungspunkte (ImageMagick, Aktivitäten) behalten neutrale Formulierung.

### Router-Table-Refactor (im selben Umbau)

Der bestehende `setup-browser-server.js` enthält eine `if`-Kaskade über 8 Routen. Vor dem Hinzufügen der drei neuen Routen wird die Kaskade in eine explizite Handler-Table überführt:

```js
const ROUTES = [
  { method: 'GET',  path: '/',                   handler: handleRoot,           requireToken: true  },
  { method: 'GET',  path: '/favicon.ico',        handler: handleFavicon,        requireToken: false },
  { method: 'GET',  path: TOKEN_HELP_ASSET_URL,  handler: handleTokenHelp,      requireToken: false },
  { method: 'GET',  path: '/choose-workspace',   handler: handleChooseWorkspace,requireToken: true  },
  { method: 'GET',  path: '/check-updates',      handler: handleCheckUpdates,   requireToken: false },
  { method: 'POST', path: '/done',               handler: handleDone,           requireToken: true  },
  { method: 'POST', path: '/end-now',            handler: handleEndNow,         requireToken: true  },
  { method: 'POST', path: '/skip',               handler: handleSkip,           requireToken: true  },
  { method: 'POST', path: '/finish-setup',       handler: handleFinishSetup,    requireToken: true  },
  { method: 'POST', path: '/abort',              handler: handleAbort,          requireToken: true  },
  { method: 'POST', path: '/apply-updates',      handler: handleApplyUpdates,   requireToken: true  },
  // neu:
  { method: 'POST', path: '/apply/:cardId',      handler: handleApplyCard,      requireToken: true  },
  { method: 'POST', path: '/restart-client',     handler: handleRestartClient,  requireToken: true  },
  { method: 'POST', path: '/restart-setup',      handler: handleRestartSetup,   requireToken: true  },
];
```

Alle bestehenden Handler werden 1:1 aus dem `createServer`-Callback in benannte Funktionen herausgezogen — kein Verhaltenswechsel für die 8 alten Routen. Der Dispatcher matcht Method + Pfad, ruft `requireToken`-Prüfung zentral, dispatcht Handler. Vorteile: (a) neue Routen fügen sich in dasselbe Muster, (b) `requireToken`-Flag pro Route sichtbar (bisher pro Handler dupliziert), (c) Path-Params (`/apply/:cardId`) einheitlich parsiert. Path-Matching bleibt minimalistisch — kein Router-Framework, nur eine kleine `matchRoute`-Funktion.

**Card-ID-Whitelist:** `handleApplyCard` prüft `cardId` gegen `MAINTENANCE_CARD_IDS = new Set(['moodle', 'workspace', 'clients', 'activities', 'crop-backend', 'version'])`. Unbekannt → 400. Keine dynamische Handler-Lookup via User-Input.

### Modul-Übersicht

- **`lib/setup-flow.js`** — neuer Export `isMinimumConfigured`, neuer Export `computeSetupProgress`. Keine opencode-Erweiterung von `endClientHandlers` (Guard sitzt im Server).
- **`lib/setup-render.js`** — neue Funktionen `renderMaintenancePage`, `renderMaintenanceCard`, Loss-Aversion-Reframing in `renderStatusItems`, Fortschrittsbalken in `renderSetupPage`.
- **`lib/setup-browser-server.js`** — Router-Table-Refactor aller 8 bestehenden Routen zu benannten Handlern, plus 3 neue Handler (`handleApplyCard`, `handleRestartClient`, `handleRestartSetup`). Auto-Wahl-Logik lebt in `handleRoot`. In-Memory-Flag `forceSetupMode` im Server-Scope.

## Testing Decisions

**Was ist ein guter Test hier:** externes Verhalten über die HTTP-Grenze prüfen, nicht die exakte HTML-Struktur (String-Enthalten-Assertions statt Snapshot). Der Server ist der höchste sinnvolle Seam — er kapselt Rendering, Flow und State-Übergänge.

**Bevorzugter Seam:** `lib/setup-browser-server.js` (HTTP), analog zu bestehendem `test/setup-browser-server.test.js`. Nur wo eine reine Datentransformation getestet werden soll (`isMinimumConfigured`, `computeSetupProgress`), Unit-Tests auf `setup-flow.js` direkt.

**Getestete Module & Prior Art:**
- `test/setup-flow.test.js` — Unit-Tests für `isMinimumConfigured` (Wahrheitstabelle über alle 5 Bedingungen), `computeSetupProgress`, opencode-No-Op-Handler.
- `test/setup-render.test.js` — Substring-Assertions für Cards (Titel, Button-Beschriftungen, "Alles läuft"-Header), Fortschrittsbalken-Markup, Loss-Aversion-Strings.
- `test/setup-browser-server.test.js` — HTTP-Tests: (a) Auto-Wahl der Ansicht anhand injiziertem Status, (b) POST `/apply/moodle` speichert nur Moodle-Felder und liefert `restartRequired: []`, (c) POST `/apply/clients` liefert für laufende Clients `kind: "button"`, für opencode `kind: "notice"`, (d) POST `/restart-client` mit `client=opencode` liefert `kind: "notice"` **ohne** dass ein injizierter Handler aufgerufen wird (via `endCodex`/`endClaudeDesktop`-Spy prüfen: nicht angesprochen), (e) POST `/restart-client` mit `client=claude` ruft injizierten Handler, (f) POST `/restart-setup` erzwingt Ersteinrichtungs-Ansicht bei nächstem GET `/`, (g) POST `/apply/unbekannt` → 400 (Whitelist-Check), (h) **Regressionstests aller 8 bestehenden Routen** nach Router-Table-Refactor — bestehende Test-Assertions unverändert wiederverwenden, damit Verhaltensgleichheit belegt ist.
- Integrationstests (`test/integration/*`) unverändert — betreffen Moodle-API, nicht Setup-UI.

**Manuelle Plattform-Verifikation (Merge-Voraussetzung):**
- **macOS** (Primär-Entwicklungsumgebung): Setup-Browser starten, alle Cards durchklicken, Neustart-Buttons für Claude Desktop und Codex prüfen, opencode-Hinweis-Zeile verifizieren, "Ersteinrichtung wiederholen" testen.
- **Windows** (Parallels-VM laut CLAUDE.md): identische Prüfung. Claude Desktop und Codex haben eigene Windows-Prozess-Erkennung (`findWindowsClaudeExecutable`, `defaultIsCodexRunning`); Regression dort möglich. opencode-Hinweis erscheint identisch (kein plattformabhängiger Code-Pfad).
- **Ohne bestandene manuelle Verifikation auf beiden Plattformen kein Merge nach `main`.**

## Out of Scope

- Umstellung der Ersteinrichtungs-Ansicht auf Cards oder auf einen linearen Wizard. Bleibt strukturell wie heute, nur Fortschrittsbalken + Loss-Aversion-Wording.
- Persistente Wartungs-Historie ("Was habe ich zuletzt geändert?").
- Rollen-/Rechte-Trennung (Admin vs. Lehrkraft) — es gibt weiter nur eine Ansicht pro Nutzer:in.
- Änderung der Setup-Server-Sicherheitsschicht (CSRF-Token, siehe `docs/specs/0004-lieferketten-haertung-setup-csrf.md`). Neue Endpunkte übernehmen dieselbe Token-Validierung.
- Änderung der ImageMagick-Wartungs-Logik (`renderImageMagickMaintenanceRow`) — wird als Content in die Card `crop-backend` bzw. eine gesonderte Diskussion überführt, aber ohne Verhaltensänderung.
- opencode-Prozess-Detection oder -Neustart. opencode lädt MCP-Server bei jedem neuen Chat frisch — kein Neustart-Mechanismus nötig, wird bewusst nicht implementiert.
- Einführung eines Router-Frameworks. Der Router-Table-Refactor ist bewusst minimalistisch (kleine `matchRoute`-Funktion, keine externe Abhängigkeit).

## Further Notes

- Bezug zum Prototyp: die B2-Card-Struktur mit CSS-Regeln entstand in der `/prototype`-Session am 2026-07-28 (Handoff-Dokument `/private/tmp/handoff-kurspilot-setup-ux-2026-07-28.md`, wird nicht ins Repo übernommen — die relevanten Entscheidungen sind hier eingearbeitet).
- UX-Prinzipien-Prüfstein aus dem `/watch`-Video (6 UX-Psychologie-Prinzipien): Smart Defaults ✓ (Vorbelegungen bleiben), Progress ✓ (Fortschrittsbalken bei Setup), Anchoring ✓ ("Alles läuft" zuerst), Loss Aversion ✓ (Reframing), IKEA-Effekt ✓ (User klickt aktive Card auf), Reziprozität – nicht relevant.
- Der bestehende Post-Save-Screen (`renderPostSaveActionsPage`) bleibt für die Ersteinrichtung erhalten. Kein doppelter Wartungsaufwand.
- CLAUDE.md-Konvention (deutsche UI-Strings, englische Bezeichner) wird eingehalten.
