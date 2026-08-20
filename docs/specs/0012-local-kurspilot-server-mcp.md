# Spec 0012 — `local_kurspilot`: Moodle-natives MCP-Plugin (Server statt Laptop)

Status: **Entwurf, wartet auf Freigabe** (#301)
Karte: [#289](https://github.com/matthiasgruenwald/moodle-coursepilot/issues/289)

## Ziel

Ein Moodle-Plugin `local_kurspilot`, das einen MCP-Endpunkt auf dem Moodle-Server
bereitstellt, sodass eine Lehrkraft Kurspilot ohne lokale Installation und ohne
Code-Ebene aus einem KI-Chat nutzt (Codex, Claude Desktop/Web/Cowork,
opencode). Ersetzt langfristig den lokalen stdio-MCP (`moodle-mcp.js`) — siehe
[Ablösungspfad](#9-ablösungspfad-vom-lokalen-stdio-mcp).

Diese Spec deckt **V1**: rein lesender Zugriff auf Kurse, Abschnitte,
Modulstruktur, Inhalte und den privaten Kontext-Dateibereich. Kein
Schreibpfad, keine Lernendendaten.

`local_kurspilot` ist ein eigenständiger Neubau — eigener Komponentenname,
eigene Tabellen, eigener externer Dienst, eigene Endpunkt-URLs, **keine
Abhängigkeit** zu `local_coursepilot`. Additiver Parallelbetrieb gilt nur für
den Bauzeitraum.

## 1. Transport

Reines **POST/JSON-RPC**, kein SSE, kein Server-seitiger Session-State
(`Mcp-Session-Id` entfällt seit MCP-Revision 2026-07-28). Jeder Request ist
für sich vollständig — kein FPM-Worker-Problem, keine instanzweite
Server-Konfiguration nötig.

- Endpunkt: `local/kurspilot/mcp.php`
- Auth: `Authorization: Bearer <access-token>` im HTTP-Header, durchgereicht
  über Cloudflare-Tunnel/Apache — praktisch belegt in #294.
- Auth-Gate greift **vor** dem `initialize`-Handshake — unauthentifiziert
  antwortet der Endpunkt nicht auf `initialize`, sonst startet kein Client
  die Discovery (#312 b).
- Dual-Era-Unterstützung: reale Clients hängen teils noch auf älteren
  Protokoll-Revisionen — der Endpunkt bedient sowohl `initialize` als auch
  `server/discover` (#290, #294).
- Fehlerantworten sind **immer JSON**, nie HTML — Moodles Standard-404 bricht
  z. B. opencodes Parser (Nebenbefund #312).
- Vorbild im Plugin-Verzeichnis: `webservice_mcp` (onbirdev), Moodle 4.5–5.2.

Bekannte Client-Grenzen (#292): 2 KB Tool-Beschreibung (Claude Code), 5 s
Vorgabe-Timeout (opencode), 300 s (Claude). Codex Cloud ist undokumentiert und
wird nicht zugesagt.

## 2. Autorisierung der KI (OAuth 2.1)

OAuth-2.1-Flow im Browser (Moodle-Login, LDAP/SSO der Instanz greift). Keine
Zugangsdaten im Chat-Client — ein statischer Bearer trägt nicht durch: geht in
Codex CLI, Claude Code, opencode, aber in Claude Web/Desktop/Cowork nur über
ein Beta-Feature mit organisationsweit geteilten Headern, unvereinbar mit der
Zuordnung Token → Moodle-Nutzer (#292). Der Webservice-Token aus #294 war
reine Spike-Krücke, keine Produkt-Rückfallebene.

**Eigenbau statt Bibliothek** (#291): Moodle bietet serverseitig nichts
Wiederverwendbares (`\core\oauth2` ist reine Client-Richtung; `mod_lti` ist
Kopiervorlage, keine API). `league/oauth2-server` deckt RFC 9728/8414/7591
nicht ab und zöge vier weitere Bibliotheken nach; Moodle 5.0 vendort bereits
Slim, PSR-7 und `firebase/php-jwt`. Umfang ca. 1.100 Zeilen.

Umfang:
- **Dynamic Client Registration** (RFC 7591) — Pflicht, Codex kann keinen
  vorregistrierten Client. In der aktuellen MCP-Revision deprecated, aber
  ohne Alternative für diesen Client.
- **CIMD** zusätzlich anbieten — sonst legt jede Neuverbindung eines Clients,
  der CIMD statt DCR nutzt, einen neuen OAuth-Client in Moodle an. In #313
  implementiert, aber von keinem der vier Zielclients live ausgelöst (alle
  vier nutzten DCR).
- Authorization Code + PKCE (**S256 Pflicht**).
- Consent-Screen mit Moodle-Login.
- Token-Endpunkt: Authorization Code + Refresh mit **Rotation**.
- JWKS-Endpunkt (leer in V1, kein `id_token`-Signing nötig — siehe
  OIDC-Zwangsfelder unten).

Discovery (#302, PATH_INFO statt Webserver-Eingriff — siehe
[Abschnitt 7](#7-discovery-well-known-ohne-webserver-eingriff)):
- Issuer: `https://<wwwroot>/local/kurspilot/oauth.php`
- `authorization_endpoint`: `.../local/kurspilot/oauth/authorize.php`
- `token_endpoint`: `.../local/kurspilot/oauth/token.php`
- `registration_endpoint`: `.../local/kurspilot/oauth/register.php`
- `jwks_uri`: `.../local/kurspilot/oauth/jwks.php`
- Ein generiertes JSON unter zwei Namen (`oauth-authorization-server` und
  `openid-configuration`) — der OIDC-Namensraum ist durch Client-Verhalten
  erzwungen, obwohl das Plugin kein OIDC-Provider ist; OIDC-Pflichtfelder
  (`subject_types_supported`, `id_token_signing_alg_values_supported`) werden
  nur pro forma mitgeliefert.
- Protected-Resource-Metadaten separat: `local/kurspilot/oauth/protected-resource.php`,
  erreichbar unter **zwei** Adressen — verlinkt aus dem `WWW-Authenticate`-Header
  (Claude, opencode folgen dem Header) *und* unter
  `<mcp-url>/.well-known/oauth-protected-resource` per PATH_INFO (Codex leitet
  den Pfad aus der Ressourcen-URL ab, ohne den Header zu lesen — #312 a).

Redirect-URIs: `https://claude.ai/api/mcp/auth_callback` plus portunabhängiger
Loopback für CLI-Clients.

**Nachweislage (#313):** Codex CLI und opencode vollständig grün — DCR,
Consent, `kurspilot_list_courses`-Aufruf über echte Client-Software belegt.
Claude Web/Desktop: Discovery und DCR-Validierung mit echtem
`claude.ai`-Redirect-URI belegt; der volle Consent-Roundtrip war in der
Spike-Umgebung nicht testbar (kein Browser, kein Anthropic-Account) —
**dokumentierte Lücke, kein bekannter Fehler**. Vor Freigabe der
Implementierung sollte ein Mensch mit echtem Claude-Account den Roundtrip
einmal nachvollziehen.

Code-Referenz: Spike-Branch `spike/oauth2-authorization-server` (nicht
`moodle-native-mcp` — siehe [Anhang: Spike-Historie](#anhang-spike-historie)).

## 3. Nutzerauthentifizierung und Rechtemodell

**Identität → Rechte:** Access-Token wird auf eine Moodle-`userid`
abgebildet; jeder Tool-Call läuft als dieser Nutzer über
`external_api::call_external_function()` — Moodles Webservice-Schicht macht
`set_user()` und Capability-Checks intern, kein eigener Sicherheitscode
(#295, Punkt 1).

**Stateless:** jeder POST validiert das Bearer-Token neu, kein
Server-seitiger Session-State (#295, Punkt 2).

**Capabilities** (eigenständig in `local_kurspilot`, kein Bezug zu
`local_coursepilot`):
- `local/kurspilot:use` — `CONTEXT_COURSE`, `editingteacher`+`teacher`. Gilt
  für kursbezogene Tool-Calls.
- `local/kurspilot:useremote` — `CONTEXT_SYSTEM`, `editingteacher`+`teacher`.
  Separates Recht für OAuth-Fernzugriff; ein Admin kann einen Nutzer
  systemweit sperren, ohne einzelne Kurse anzufassen (#296, Punkt 1).

**Fernzugriffs-Schalter / Notbremse** (#296):
- Globaler Plugin-Setting `remoteaccess` — sperrt sofort (stateless-Prinzip
  greift unmittelbar), bestehende Tokens bleiben in der DB.
- Separater Admin-Button „Alle Tokens widerrufen" für Sicherheitsvorfälle.
- Per-Nutzer-Steuerung über die `useremote`-Capability via Rollenverwaltung.

**Sichtbarkeit:**
- Lehrkraft: Plugin-Seite `/local/kurspilot/myconnections.php`, verlinkt im
  Profil — aktive OAuth-Clients mit Widerrufs-Button.
- Admin: eigene Übersichtstabelle (Nutzer, Client, Zugriffsdaten, Widerruf) +
  Details über Berichte → Protokolle.

**Kursliste:** zeigt nur Kurse mit `local/kurspilot:use`-Capability;
`get_course_catalog` bleibt die Detailansicht per `courseid` (#295, Punkt 3).
Eine Lehrkraft ohne einen einzigen freigegebenen Kurs bekommt
`CAPABILITY_MISSING`, **keine leere Liste** — sonst ist „keine Rechte" von
„keine Kurse" nicht unterscheidbar. Die Filterung *innerhalb* der Liste
bleibt still (Präzisierung #309).

**Fehlermeldungen gestuft** (#295, Punkt 4):
- Auth-Fehler: vage (`AUTHENTICATION_FAILED`).
- Capability-Fehler: konkret (`CAPABILITY_MISSING:local/kurspilot:use` +
  Kurs-ID).

**Token-Lebensdauer** (#295, Punkt 5): 1h Access-Token, 30 Tage Refresh mit
Rotation. Rechteentzug wirkt spätestens nach 1h.

**Protokollierung** (#295, Punkt 6): Moodle-Events-API
(`\local_kurspilot\event\*`), nativ sichtbar unter Berichte → Protokolle. 4
Logstufen per Plugin-Einstellung (0=kein Log, 1=nur Fehler,
2=Lesezugriffe+Fehler [Standard], 3=alle); Events mit `crud` und
`edulevel=LEVEL_TEACHING/LEVEL_OTHER`.

## 4. Lesende Tool-Oberfläche

Bestehende Lese-Tools werden **1:1 übernommen** (Verträge unverändert) für
die reinen Moodle-API-Tools. Das gilt **nicht** für den Arbeitsbereich — siehe
[Abschnitt 5](#5-kontextablage-und-arbeitsbereich).

Umfang V1: Kursliste, Abschnitte, Modulstruktur *und* Inhalte (Seitentexte,
Aufgaben, Fragen). Lernendendaten sind nicht Umfang und technisch nicht
erreichbar (weder lesend noch schreibend: Abgaben, Forenbeiträge,
Quizversuche, Bewertungen, Teilnehmendenlisten).

**Sechs dateisystemgebundene Tools entfallen in V1** (#299, Punkt 4):
`moodle_upload_assignfile`, `moodle_upload_folder_file`,
`moodle_create_resource`, `moodle_update_resource`, `moodle_crop_image`,
`moodle_embed_assign_image`. Die übrigen 36 Tools sind serverseitig 1:1
abbildbar.

**Indirekter Personenbezug in Tool-Ergebnissen** (#307 — bereits in
`local_coursepilot` behoben, `853f364`, `local_kurspilot` erbt die Fixes beim
Neubau):
- `availability`-Restriktionen vom Typ `profile` werden **maskiert**, nicht
  weggelassen: Typ, `sf`/`cf` und Operator bleiben, `v` wird `***`.
- Schreibpfad-Guard (relevant sobald der Schreibpfad kommt) akzeptiert nur
  flache `completion`/`grade`-Strukturen, jede fremde Bedingung
  (`profile`/`date`/`group`) bricht ab statt sie stillschweigend zu
  überschreiben.
- Gruppennamen bleiben draußen; Katalog liefert nur `groupmode` und IDs. Die
  KI setzt `groupingid` nur auf ausdrückliche Nennung durch die Lehrkraft,
  nie geraten — gehört in die Tool-Beschreibung.
- Freitextfelder werden **benannt, nicht erkannt** (keine
  Namenserkennung/Maskierung — die Lehrkraft hat den Text selbst geschrieben
  und im Blick).

## 5. Kontextablage und Arbeitsbereich

**Struktur** (#297, Punkt 1): OKF-Hierarchie aus Spec 0010 1:1 übernommen.
Anker `filearea=kurspilot_context`, filepath-Wurzel `/kurspilot/` (per
Plugin-Setting). Kein Extra-Recht nötig — `moodle/user:manageownfiles` ist
Standard-Nutzerrecht; das Plugin schreibt immer nur in
`context_user::instance($USER->id)`.

**Abgrenzung** (#297, Punkt 2): Die KI sieht ausschließlich
`filearea=kurspilot_context`, harte Grenze im Plugin-Code — keine anderen
fileareas oder Unterordner erreichbar.

**Tool-Oberfläche V1** (#297, Punkt 3): auflisten + lesen. Schreiben kommt
später (siehe [Not yet specified](#not-yet-specified-fog) auf der Karte).

**Kein Mischbetrieb** (#297, Punkt 4): direkt Server-MCP. Einmalige
Migrations-Upload-Option (lokal → Moodle) + Import-Option für fremde Pakete,
kein automatischer Abgleich.

**Weitergabepakete** (#297, Punkt 5): ZIP-Download aus Moodle-Oberfläche;
Import per manuellem Kopieren durch die Lehrkraft, kein eigener
Freigabemechanismus.

**Vorlagen-Datei `vorlagen.md`** (#314): liegt an der filepath-Wurzel
`/kurspilot/` in `filearea=kurspilot_context`, neben `index.md` — erreichbar
mit dem V1-Vertrag „auflisten + lesen", **ohne neuen Tool-Vertrag**. Eine
Datei, `cmid` und Kurs optional (ein Eintrag ohne `cmid` ist die gemerkte
Einstellungsentscheidung, z. B. „Test ohne Antwortliste"); Pflicht sind nur
Modultyp und Kurzbeschreibung. Geräteunabhängig, da der Moodle-Nutzerkontext
die Lehrkraft *ist* — löst die „pro Lehrkraft und Gerät"-Annahme aus Spec
0013 auf. Die KI schreibt dort in V1 nie selbst; wird erst mit dem
Schreibpfad fortschreibbar, dann nur als Vorschlag mit Bestätigung.

**Node-Schicht der Skills entfällt serverseitig größtenteils** (#308 — der
Befund reicht über den ursprünglichen Ticketwortlaut hinaus): 5 von 14
Skills sind heute an ~15 `lib/kurspilot-*.js`-Module gebunden, die **keine
MCP-Tools** sind — `moodle-mcp.js` lädt keins davon, die Skills lassen den
Chat-Client Node-Code aus dem Repo ausführen. Das ist eine zweite Laufzeit
(Repo + Node + Shell), die im Servermodell nicht existiert.
- Pfadbegriff verschwindet vollständig, kein zweigleisiger Skill —
  Zweigleisigkeit liegt in der Skill-*Menge* (`kurspilot-neu*`, siehe
  [Abschnitt 9](#9-ablösungspfad-vom-lokalen-stdio-mcp)).
- Node-Schicht wandert geteilt: serverseitig nur, was verlässlich stimmen
  muss (Pfadbildung/Slug, Frontmatter-Schema,
  `personenbezug`-Markierung, Paketexporte — letztere zwingend, siehe
  [Abschnitt 6](#6-datenschutz)); Redaktionelles bleibt Skill-Prosa.
- Die drei Kontextvorlagen werden eingebettet (20 KB, ändern sich mit den
  Skills).
- Chat-Anhang → **Base64 ins Tool** als Regelweg, Direktupload in Moodle als
  zweiter; absolute Pfade ersatzlos.
- Moodle-Dateibereich ist der einzige Anker in V1.
- Tool-Oberfläche nennt **nie** Speicherorte — eine spätere
  Nextcloud-Hinterlegung ist damit eine Moodle-Administrationsfrage, keine
  Kurspilot-Änderung (Moodle bindet externe Repositories wie WebDAV/Nextcloud
  bereits selbst ein — keine eigene Ablagen-Abstraktion).
- Umschreiben der Skills selbst erst **nach** dieser Spec-Freigabe; hier
  steht nur der Vertrag (welche Arbeitsbereich-Tools, welche Konvention
  serverseitig garantiert).

## 6. Datenschutz

Festgehalten in **ADR 0011** (`docs/adr/0011-personenbezogene-kontextdaten-im-servermodell.md`;
ADR 0003 bleibt im Wortlaut gültig und verweist vorwärts). Zusammenfassung
(#298):

1. **Verantwortliche ist die Schule**, nicht mehr allein die Lehrkraft.
2. Der Datenfluss zur KI ist **unverändert**: nur was ein Tool auf Anfrage
   liest, geht an den Anbieter — der Skill entscheidet, kein
   Sitzungsschalter.
3. **`allowpersonaldata`-Schalter, Standard aus** — ein definitiv
   abschaltbarer Admin-Schalter. Wirkt auf der Markierung, nicht auf dem
   Inhalt; relevant vor allem beim mitgebrachten Bestand (Paket-Import,
   Migrations-Upload).
4. **Gesperrt heißt sichtbar gesperrt**, keine automatische Schwärzung —
   sonst läuft die KI in einen toten Sidecar-Verweis.
5. Kürzel (z. B. „S. M., 7a") sind eine **Empfehlung**, keine Regel —
   behauptete Pseudonymisierung ist schlechter als offene Klarnamen hinter
   einer abschaltbaren Grenze.
6. **Voller Privacy-Provider** (nicht `null_provider`): Tokens,
   Kontextdateien via `export_area_files`, Events.

**Datenschutz-Vertrag als Erzwingungsmechanismus** (#300 — zehn
Entscheidungen, per PHPUnit erzwungen, kein Node-Test):

- Allowlist als PHP-Konstantenklasse `classes/privacy_surface.php`, geprüft
  gegen die **real registrierte** Oberfläche einer laufenden Instanz (fängt
  nachträglich am Dienst angehängte Funktionen, die kein Repo-Test sehen
  kann).
- Sofort getrennte Verträge: `lib/data-protection-allowlist.js` bleibt
  unverändert für `local_coursepilot` und stirbt mit dessen Abkündigung.
- Die sieben verbotenen Namensbestandteile gelten für **registrierte
  Namen**, nicht für intern aufgerufene PHP-Funktionen. Dateitools heißen
  nach ihrem Anker: `kurspilot_list_context_files`, nicht
  `..._user_files`.
- Resources und Prompts fallen unter denselben Vertrag (V1 bietet keine an);
  Tool-Beschreibungen und Fehlermeldungen **nicht** (statischer Text, siehe
  2-KB-Grenze aus #292).
- Laufzeitprüfung am Endpunkt: `mcp.php` listet und ruft nur Gelistetes —
  **kein** Abbruch zur Installationszeit.
- Von außen prüfbar: `/local/kurspilot/surface.php` zeigt Allowlist,
  verbotene Bestandteile und Abgleichstatus.
- `tools/list` und `tools/call` leiten sich beide aus derselben Allowlist ab
  — gelistet und aufrufbar ist dieselbe Menge (Umsetzung #309).

## 7. Discovery (`.well-known`) ohne Webserver-Eingriff

**Null-Eingriff am Webserver ist Zielvorgabe**, nicht Vorzugsvariante (#302).
Eine Rewrite-Regel ist reiner Notausgang und wird hier als Abweichung
geführt, nicht als Zielweg.

Zeigt der OAuth-Issuer auf eine PHP-Datei statt ein Verzeichnis, landet die
von Clients angehängte Discovery-URL als **PATH_INFO** auf dieser Datei —
`slasharguments` ist Moodle-Grundlage (`pluginfile.php/...`), kein
Zufallsfund. Belegt: `/local/kurspilot/surface.php/.well-known/openid-configuration`
→ 303, Root-Pfad → 404.

- Issuer: `https://<wwwroot>/local/kurspilot/oauth.php` (siehe
  [Abschnitt 2](#2-autorisierung-der-ki-oauth-21)).
- „Keine Instanz-Annahmen" bleibt gültig — `slasharguments` zählt als
  Moodle-Normalzustand, genau wie „HTTPS ist aktiv". Absolutheit gäbe es nur
  über einen Core-Beitrag, zu langsam für diesen Zeitrahmen.
- `surface.php` prüft die Erreichbarkeit **per Selbstabruf**, nicht per
  Konfigurationsblick — Reverse-Proxies, Cloudflare und `AcceptPathInfo Off`
  fallen erst beim echten Abruf auf. Klartextmeldung samt
  Notausgangs-Regel-Hinweis, keine eigene Diagnoseseite.
- NLQ ist nicht Teil dieser Karte. Instanzvoraussetzungen für den Betrieb:
  öffentliches HTTPS, Egress zum Client-Anbieter, `slasharguments`.

**Nachweislage (#312):** Codex CLI, Claude Web, Claude Desktop und opencode
laufen nach den beiden 404 der Root-Pfade bis zur dritten Discovery-Priorität
durch, lesen dort die Metadaten und gehen direkt in die DCR. Abbruch erst am
absichtlich fehlenden `register.php` — also erst am nächsten, noch nicht
implementierten Schritt.

## 8. Testinfrastruktur

**Spike-/Testinstanz** (#293): eigener Docker-Compose-Stack
`moodle-kurspilot-spike`, erreichbar unter `https://spike.gruenwald.fun` über
den bestehenden Cloudflare-Tunnel. DB-Restore aus `moo.gruenwald.fun` (nur
Testaccounts). `$CFG->noemailever`, kein Cron-Service. `local_coursepilot`
und die reguläre Testsuite bleiben unberührt. Details:
`/opt/kurspilot-spike/README.md`.

**PHPUnit-Fundament** (#309): 19 Tests grün auf Moodle 5.0.8. Umfang:
Install-Smoke, Vertragstest (`privacy_surface.php`), je externer Funktion ein
Test, Capability-Test. `local_kurspilot` liegt produktiv in
`Plugin/src/local_kurspilot/` (nicht im Wegwerf-Spike-Verzeichnis). Ausführung:
`bash /opt/kurspilot-spike/scripts/phpunit.sh`, dokumentiert in
`docs/agents/testing.md`.

**CI** (#311, Umsetzung zurückgestellt bis zur Ablösung des lokalen Wegs,
siehe [Abschnitt 9](#9-ablösungspfad-vom-lokalen-stdio-mcp)): eigener
GitHub-Actions-Workflow mit `moodlehq/moodle-plugin-ci`, Versionsmatrix
einzeilig (nur Moodle 5.0), `phplint`+`validate` ja, `phpcs` zunächst
zurückgestellt, kein Coverage-Gate.

## 9. Ablösungspfad vom lokalen stdio-MCP

Der lokale Weg wird **abgelöst, nicht eingefroren** (#299):

1. **Abkündigung statt Dauerbetrieb.** Es gibt keine plugin-freie Nutzung —
   der lokale Weg braucht `local_coursepilot` genauso wie der Server-Weg
   `local_kurspilot`. Bis zur Abkündigung bleibt er voll nutzbar,
   Neuentwicklung findet nur noch im Server-Weg statt.
2. `local_kurspilot` ist eigenständiger Neubau ohne Abhängigkeit;
   `local_coursepilot` bleibt bis zur Abkündigung bestehen und wird dann
   entfernt. Keine Datenmigration nötig.
3. Die Spike-Instanz trägt ausschließlich `local_kurspilot` — kein
   Parallelbetrieb beider Plugins auf einer Instanz; die vier regulären
   Devstack-Instanzen behalten `local_coursepilot`.
4. Parallelbetrieb per Suffix **`-neu`**: MCP-Alias `kurspilot-neu`, Skills
   `kurspilot-neu*` — der Alias muss mitwandern, sonst rufen alte Skills die
   Tools des neuen Servers auf.
5. **Ersetzungsschwelle:** Server-MCP legt eine vollständige Lernsituation an
   (Abschnitt, Seiten, Aufgaben, Quiz); Dateiupload und Bildzuschnitt dürfen
   dann noch fehlen. Abnahme: ein volles Unterrichtsvorhaben ohne einen
   Rückgriff auf den lokalen Weg. **Kein Nice-to-have** — die Erstellung
   einer vollständigen Lernsituation ist der eigentliche Zeitgewinn für
   Lehrkräfte.
6. Danach **harter Schnitt**: Bootstrap-Vertrieb (ADR 0008) wird
   abgeschaltet.

## 10. Abnahmekriterien für den ersten (rein lesenden) Prototypen

- MCP-Endpunkt beantwortet `initialize`/`server/discover` und `tools/list`
  nur nach gültiger Authentifizierung.
- OAuth-2.1-Roundtrip (DCR, PKCE, Consent, Token) funktioniert live für
  Codex CLI und opencode; Claude Web/Desktop-Roundtrip von einem Menschen mit
  echtem Account nachvollzogen.
- Discovery ohne Webserver-Eingriff läuft für alle vier Zielclients durch
  (Nachweis: #312).
- Tool-Aufruf läuft als die authentifizierte Lehrkraft mit deren
  Capabilities; eine Lehrkraft ohne `local/kurspilot:use` in einem Kurs
  bekommt `CAPABILITY_MISSING`, keine leere/gefilterte Liste ohne Hinweis.
- Datenschutz-Vertragstest (`privacy_surface.php`) schlägt fehl, sobald dem
  externen Dienst zur Laufzeit eine nicht gelistete Funktion angehängt wird.
- `availability`-Restriktionen vom Typ `profile` erscheinen maskiert, nie im
  Klartext, in keinem Tool-Ergebnis.
- `allowpersonaldata`-Schalter (Standard aus) verhindert sichtbar
  gekennzeichnet, nicht kommentarlos, den Zugriff auf personenbezogene
  Sidecars.
- PHPUnit-Suite (Install-Smoke, Vertragstest, externe Funktionen,
  Capability-Test) läuft grün auf Moodle 5.0.
- Kontext-Dateibereich: Lehrkraft kann `filearea=kurspilot_context` aus
  einem Zielclient heraus auflisten und lesen; kein anderer Dateibereich ist
  über den MCP-Endpunkt erreichbar.

## Fog of war — bewusst nicht Teil dieser Spec

Diese Punkte sind in Scope für das Gesamtvorhaben, aber noch nicht
spezifizierbar bzw. explizit auf spätere Arbeit vertagt:

- Nextcloud als Hinterlegung des Arbeitsbereichs (Moodle-Administrationsfrage,
  keine Kurspilot-Änderung — #308 (8)).
- Gruppierungsnamen im Katalog (`kurspilot_list_groupings` hinter
  `allowpersonaldata`, falls die ID-Regel die Praxis blockiert — #307).
- Schreibpfad mit zweistufiger Freigabe (Change-Set vormerken, prüfen,
  freigeben) — **kein Nice-to-have**, sondern die eigentliche
  Ersetzungsschwelle für den lokalen Weg (Abschnitt 9). Erster benannter
  Anwendungsfall: fortschreibbares `vorlagen.md`.
- Dateiübertragung über HTTP-MCP (Richtung: Base64 im Tool-Argument; offen:
  Größengrenzen, Tokenkosten).
- Bildbearbeitung ohne lokale CLI (`moodle_crop_image` hat **keinen**
  direkten Serverweg — ImageMagick/`sips` sind Geräteanforderungen, die das
  Plugin fürs Plugin-Directory disqualifizieren würden).
- Auditierung des Schreibpfads (Person, Kurs, Change-Set, Freigabe,
  Ergebnis, Aufbewahrungsdauer).
- Plugin-Directory-Readiness, Update- und Release-Weg.
- NLQ-Betriebs-, Freigabe- und Security-Prozess (nachrangig — wenn das
  Plugin funktioniert, ist die Übernahme das kleinere Problem).

## Out of scope

- Implementierung über den Machbarkeits-Spike hinaus — diese Karte endet bei
  der freigegebenen Spec.
- Lernendendaten (Abgaben, Forenbeiträge, Quizversuche, Bewertungen,
  Teilnehmendenlisten) — weder lesend noch schreibend, technisch nicht
  erreichbar.
- Korrektur und Bewertung.
- Vollständiger Schreibpfad in V1.
- Flächendeckender Rollout ohne geprüften Pilotbetrieb.
- Eigene Ablagen-Abstraktion (Nextcloud & Co.) — Moodle bindet externe
  Repositories bereits selbst ein.

## Anhang: Spike-Historie

Der Machbarkeits-Spike dieser Karte durfte laut Karten-Notes echten,
wegwerfbaren PHP-Code schreiben (Ausnahme vom Wayfinder-Default). Ein
Ausführungsfehler dabei ist dokumentationswert: der OAuth-Server-Code aus
#313 wurde zunächst irrtümlich als regulärer Plugin-Code auf
`moodle-native-mcp` committet (`db066a3`) — Verstoß gegen die Notes-Regel
„kein Produktionscode vor Spec-Freigabe". Korrigiert per Revert (`01d7551`):
`moodle-native-mcp` steht wieder auf dem Stand von #312 (Discovery-Metadaten
per PATH_INFO), der volle OAuth-Server-Code liegt auf
`spike/oauth2-authorization-server`. Die dortigen Befunde (DCR, Consent, PKCE,
Token-Rotation, live gegen Codex CLI und opencode getestet) sind unverändert
gültig und in [Abschnitt 2](#2-autorisierung-der-ki-oauth-21) referenziert;
sie fließen in die Implementierung ein, ohne dass der Spike-Code selbst
übernommen wird.

Weitere Spike-Referenzen:
- `spike/mcp-endpoint-plugin`, `spike/local_kurspilot/SPIKE.md` (#294)
- Recherche-Branches: `research/mcp-transport-moodle-plugin` (#290),
  `research/mcp-client-anforderungen` (#292),
  `research/oauth2-as-moodle-plugin` (#291)

## Quellenkarte

Alle Entscheidungen dieser Spec sind auf der Karte
[#289](https://github.com/matthiasgruenwald/moodle-coursepilot/issues/289)
mit Ticket-Verweis nachvollziehbar. Bei Detailfragen: Ticket zoomen, nicht
diese Spec erweitern — Ergänzungen laufen über neue Tickets auf einer
Folgekarte, sobald diese Spec freigegeben ist.
