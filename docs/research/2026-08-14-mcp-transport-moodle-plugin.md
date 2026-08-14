# Recherche: MCP-Endpunkt aus einem Moodle-Plugin (Transport und PHP-Prozessmodell)

- **Auftrag:** [Issue #290](https://github.com/matthiasgruenwald/moodle-coursepilot/issues/290)
- **Kontextkarte:** [Issue #289 – Kurspilot als Moodle-natives MCP-Plugin](https://github.com/matthiasgruenwald/moodle-coursepilot/issues/289)
- **Stand:** 2026-08-14
- **Quellenbasis:** MCP-Spezifikation (modelcontextprotocol.io), Moodle-Quellcode (`MOODLE_500_STABLE`), Moodle-Developer-Docs, Moodle-Tracker, php.net, nginx.org, httpd.apache.org, Client-Dokumentation von Anthropic und OpenAI.

---

## Schlussaussage

**Trägt.**

Ein Moodle-5.x-Plugin kann einen spezifikationskonformen MCP-Endpunkt bereitstellen, und zwar **ohne SSE, ohne lang offene Verbindung und ohne serverseitige Sitzung** — also exakt in dem Prozessmodell, das PHP-FPM/Apache ohnehin beherrscht. Der in #289 vorsorglich definierte „degradierte Transport" (POST/JSON-RPC ohne SSE) ist seit der aktuellen Spezifikationsrevision **kein Rückfall mehr, sondern der Normalfall**: Die Revision `2026-07-28` hat Sessions, den `initialize`-Handshake, den GET-Stream und die Resumability ersatzlos gestrichen und MCP ausdrücklich zu einem zustandslosen HTTP-Workload gemacht ([Changelog 2026-07-28](https://modelcontextprotocol.io/specification/2026-07-28/changelog)).

Was tatsächlich degradiert: **Server-Push**. Ohne SSE gibt es keine `notifications/tools/list_changed`, keine Fortschritts-Notifications während eines langen Tool-Calls und kein Streaming von Teilergebnissen. Für den rein lesenden Prototypen aus #289 ist das ohne Bedeutung — Kursliste, Abschnitte, Modulstruktur und Inhalte sind Anfrage/Antwort.

Ein Blocker existiert nicht. Die verbleibenden Aufgaben sind Implementierungsarbeit (Dual-Era-Unterstützung, Header-Validierung, Origin-Prüfung), keine Machbarkeitsfragen.

---

## 1. Transport: Was ist wirklich Pflicht?

### 1.1 Aktuelle Revision `2026-07-28`

Die aktuelle Protokollversion ist `2026-07-28` ([Versioning](https://modelcontextprotocol.io/specification/versioning)). Sie hat den Charakter des Transports grundlegend geändert:

> „Remove protocol-level sessions and the `Mcp-Session-Id` header from the Streamable HTTP transport." (Changelog, Major changes 1)

> „Make MCP stateless: remove the `initialize`/`notifications/initialized` handshake. Every request now carries its protocol version and client capabilities in `_meta`." (Changelog, Major changes 2)

> „Remove SSE stream resumability and message redelivery (the `Last-Event-ID` header and SSE event IDs)." (Changelog, Major changes 9)

Der Ankündigungsbeitrag formuliert die Absicht unmissverständlich: jede Anfrage darf „land on any instance behind a plain round-robin load balancer", die zustandslose Kernarchitektur mache MCP zu „a first-class HTTP workload with no session management" ([Blog: The 2026-07-28 Specification](https://blog.modelcontextprotocol.io/posts/2026-07-28/)).

Die [Streamable-HTTP-Bindung](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http) verlangt vom Server konkret:

- „The server **MUST** provide a single HTTP endpoint path […] that supports POST." — **nur POST**, kein GET-Endpunkt mehr.
- „If the body is a JSON-RPC *request*, the server **MUST** return either `Content-Type: application/json` (a single JSON object) or `Content-Type: text/event-stream` (an SSE response stream)." — **SSE ist eine von zwei erlaubten Antwortformen, keine Pflicht.**
- Auf GET oder DELETE: „respond with `405 Method Not Allowed`". Auf `Mcp-Session-Id`: „ignore it, and do not mint or echo session IDs." Auf `Last-Event-ID`: „ignore it".
- Origin-Prüfung ist Pflicht: „Servers **MUST** validate the `Origin` header on all incoming connections […] If the `Origin` header is present and invalid, servers **MUST** respond with HTTP 403 Forbidden."

Pflichtumfang für einen rein lesenden Tool-Server:

| Bestandteil | Status | Anmerkung |
|---|---|---|
| `server/discover` | **MUST** | „Servers **MUST** implement it." ([Discovery](https://modelcontextprotocol.io/specification/2026-07-28/server/discover)) — liefert `supportedVersions`, `capabilities`, `serverInfo`; zustandslos. |
| `tools/list`, `tools/call` | Pflicht bei `tools`-Capability | Ergebnisse brauchen `resultType`, `ttlMs`, `cacheScope`. |
| `MCP-Protocol-Version`-Header | **MUST** auf jedem POST | Muss mit `_meta.io.modelcontextprotocol/protocolVersion` übereinstimmen, sonst `400` + `-32020 HeaderMismatch`. |
| `Mcp-Method`, `Mcp-Name` | **REQUIRED** | Server **MUST** Header gegen Body validieren (Base64-Sentinel `=?base64?…?=` vorher dekodieren). |
| Unbekannte Methode | `404` + `-32601` | Nicht `200`. |
| `initialize` / `notifications/initialized` | **entfällt** | Gestrichen. |
| `ping` | **entfällt** | Gestrichen (Changelog, Major changes 5). |
| `notifications/cancelled` | **entfällt auf HTTP** | „closing the SSE response stream is itself the cancellation signal". Bei reiner JSON-Antwort gibt es keinen Stream — das Thema entfällt praktisch. |
| `subscriptions/listen` | nur bei Change-Notifications | Einziger Ort, an dem ein lang offener Stream vorkommt. Wer `listChanged`/`subscribe` nicht anbietet, braucht ihn nicht. |
| Resumability, Sessions, GET-Stream | **entfällt** | Gestrichen. |

### 1.2 Legacy-Ära `2025-03-26` … `2025-11-25`

Auch dort war SSE nie zwingend — die Spezifikation von [2025-11-25](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports) sagt:

- „If the input is a JSON-RPC *request*, the server **MUST** either return `Content-Type: text/event-stream` […] or `Content-Type: application/json`, to return one JSON object."
- Zum GET-Stream: „The server **MUST** either return `Content-Type: text/event-stream` […] **or else return HTTP 405 Method Not Allowed**, indicating that the server does not offer an SSE stream at this endpoint."
- Zur Sitzung: „A server […] **MAY** assign a session ID at initialization time" — ein MAY, kein MUST.

Pflicht in dieser Ära sind der `initialize`-Handshake (Client sendet, „The server **MUST** respond with its own capabilities and information"), das Entgegennehmen von `notifications/initialized` sowie die Antwort auf `ping`: „The receiver **MUST** respond promptly with an empty response" ([Ping](https://modelcontextprotocol.io/specification/2025-11-25/basic/utilities/ping)) — alles trivial in einem einzelnen POST-Zyklus.

### 1.3 Konsequenz für `local_kurspilot`

Der Endpunkt muss **dual-era** gebaut werden, weil die heute real verfügbaren Clients noch die Legacy-Ära sprechen (siehe Abschnitt 7). Die Spezifikation sieht das ausdrücklich vor: „A dual-era server selects its behavior from how the client opens" — eine Anfrage mit modernem `_meta` wird zustandslos bedient, ein `initialize` wählt Legacy-Semantik ([Versioning: Backward Compatibility](https://modelcontextprotocol.io/specification/2026-07-28/basic/versioning)). Beide Zweige kommen mit einem POST → eine JSON-Antwort aus.

---

## 2. PHP-Prozessmodell

### 2.1 Der Kern des Problems (der hier nicht auftritt)

PHP-FPM bedient pro Kindprozess genau eine Anfrage. `pm.max_children` „sets the limit on the number of simultaneous requests that will be served. Equivalent to the Apache `MaxClients` directive with `mpm_prefork`" ([PHP-Handbuch, FPM-Konfiguration](https://www.php.net/manual/en/install.fpm.configuration.php)). Bei Apache begrenzt `MaxRequestWorkers` analog „the number of simultaneous requests that will be served"; Default 256 (prefork) bzw. 400 (event/worker) — bei PHP-FPM ist aber der FPM-Pool die bindende Grenze, und die ist in Distributionsvorgaben oft einstellig bis niedrig zweistellig.

Eine offene SSE-Verbindung belegt für ihre gesamte Lebensdauer einen Worker. Zehn gleichzeitig verbundene Lehrkräfte hielten damit zehn Worker dauerhaft belegt — bei kleinem Pool eine Selbst-DoS. **Das ist der eigentliche Grund, SSE zu meiden, und er entfällt vollständig, wenn jeder MCP-Aufruf ein kurzer POST ist.**

### 2.2 Was bei SSE typischerweise blockiert (Vollständigkeit halber)

| Ebene | Stellschraube | Befund |
|---|---|---|
| PHP | `output_buffering`, `zlib.output_compression` | Puffern die Ausgabe; müssen abgeschaltet werden. |
| PHP | `max_execution_time` / `set_time_limit()` | „When the timer expires the script will be aborted" ([Connection Handling](https://www.php.net/manual/en/features.connection-handling.php)). |
| FPM | `request_terminate_timeout` | „The timeout for serving a single request after which the worker process will be killed." Default `0` (aus). |
| FPM | `pm.max_children` | siehe 2.1. |
| nginx | `fastcgi_buffering` | Default **`on`**: „nginx receives a response from the FastCGI server as soon as possible, saving it into the buffers". Abschaltbar per Direktive **oder** per Antwort-Header: „Buffering can also be enabled or disabled by passing `yes` or `no` in the `X-Accel-Buffering` response header field" ([nginx fastcgi_module](https://nginx.org/en/docs/http/ngx_http_fastcgi_module.html)). |
| nginx | `fastcgi_read_timeout` | Default **60s** — killt jeden ruhigen Stream. |
| Moodle | Session-Lock | Entfällt, siehe 2.4. |
| PHP | Abbrucherkennung | „the next time your script tries to output something PHP will detect that the connection has been aborted" — ein Disconnect wird also **erst beim nächsten Schreibversuch** bemerkt. Für MCP-Cancellation nach `2026-07-28` (Stream schließen = Abbruch) hieße das: Keep-Alive-Kommentare sind nicht Kosmetik, sondern die einzige Abbruchdetektion. |

Bemerkenswert: **Moodle bringt den passenden Schalter bereits mit.** `lib/setup.php` (Zeilen 551–584, `MOODLE_500_STABLE`) reagiert auf die vor `config.php` definierbare Konstante `NO_OUTPUT_BUFFERING`, indem es `zlib.output_compression` abschaltet, `ob_implicit_flush(true)` setzt, alle Puffer schließt, `output_handler` leert und `header('X-Accel-Buffering: no')` sendet. Die MCP-Spezifikation fordert genau diesen Header für SSE-Streams („servers **SHOULD** include the `X-Accel-Buffering: no` header"). Ein SSE-Pfad wäre also technisch nicht ausgeschlossen — er scheitert an der Worker-Ökonomie (2.1), nicht an der Pufferung.

### 2.3 Zeitlimit in Moodle

`core_php_time_limit::raise()` erhöht das Limit, deckelt es aber an `$CFG->maxtimelimit`, sofern gesetzt (`lib/classes/php_time_limit.php`). Moodles Webservice-Schicht ruft `external_api::set_timeout()` auf, das auf mindestens 300 Sekunden anhebt (`lib/external/classes/external_api.php`, Zeilen 300–303). Für einzelne Tool-Calls ist das reichlich.

### 2.4 Session-Locks

Kein Thema, sobald der Endpunkt cookiefrei fährt. `\core\session\manager::start()` (`lib/classes/session/manager.php`, Zeile 114 ff.):

```php
if (empty($DB) or empty($CFG->version) or !defined('NO_MOODLE_COOKIES') or NO_MOODLE_COOKIES or CLI_SCRIPT) {
    self::init_empty_session();
```

Es wird also gar keine Session geöffnet — kein Lock, keine Serialisierung paralleler Anfragen derselben Lehrkraft, kein Eintrag in der Sessions-Tabelle.

---

## 3. Moodle-Einbettung: eigene URL ohne Session-Zwang

### 3.1 Das Muster

Ein `local`-Plugin darf eigene Skripte unter `/local/<name>/*.php` ausliefern; die Developer-Docs zeigen genau dieses Muster (`new moodle_url('/local/[pluginname]/foo.php')`, [Local plugins](https://moodledev.io/docs/5.0/apis/plugintypes/local)). Der Endpunkt wäre also z. B. `/local/kurspilot/mcp.php`.

Vorbild aus dem Core ist `login/token.php` (`MOODLE_500_STABLE`):

```php
define('AJAX_SCRIPT', true);
define('REQUIRE_CORRECT_ACCESS', true);
define('NO_MOODLE_COOKIES', true);

require_once(__DIR__ . '/../config.php');
```

Für einen MCP-Endpunkt sinnvoll: `NO_MOODLE_COOKIES` und `NO_DEBUG_DISPLAY` (verhindert HTML-Debugausgabe im JSON-Strom), optional `WS_SERVER`.

### 3.2 `WS_SERVER` als Alternative

`lib/setup.php` behandelt `WS_SERVER` besonders:

- Zeilen 870–872: „No sessions possible in web services." → `define('NO_MOODLE_COOKIES', true)` wird **implizit** gesetzt.
- Zeilen 664–667: `webservice/lib.php` wird geladen und `early_ws_exception_handler` als Exception-Handler registriert — Fehler kommen als maschinenlesbare Antwort statt als HTML-Seite.

Wer Moodles Token-Authentifizierung wiederverwenden will, **muss** cookiefrei fahren: `webservice_server::authenticate_user()` wirft sonst hart ab (`webservice/lib.php`, Zeile 1009):

```php
if (!NO_MOODLE_COOKIES) {
    throw new coding_exception('Cookies must be disabled in WS servers!');
}
```

`authenticate_by_token()` prüft anschließend Token-Existenz, `validuntil`, IP-Beschränkung und den gebundenen externen Dienst (`restricted_serviceid`) — und verlangt dabei **kein** freigeschaltetes Protokoll-Plugin. `webservice_protocol_is_enabled()` (Zeile 909 ff.), das `$CFG->enablewebservices` **und** einen Eintrag in `$CFG->webserviceprotocols` fordert, ist eine Selbstprüfung der `webservice_*`-Plugins und für ein `local`-Plugin nicht bindend. `$CFG->enablewebservices` wird allerdings in `webservice::authenticate_user()` (Zeile 74) geprüft — wer diesen Pfad nutzt, braucht Webservices instanzweit aktiv.

### 3.3 Verhalten ohne Cookie

Es kommt schlicht keine Session zustande (siehe 2.4): `$USER` bleibt leer, bis der Endpunkt die Identität selbst setzt. Genau das tut Moodles Token-Auth — sie ermittelt den `user`-Datensatz aus dem Token und richtet `$USER` ein, danach ist `has_capability()`/`require_capability()` benutzbar. Das entspricht dem in #289 festgelegten Modell „Access-Token → Moodle-`userid` → Capability-Prüfung im Kurskontext".

### 3.4 `local` vs. `webservice`-Plugintyp

| | `local_kurspilot` mit eigener Datei | `webservice_kurspilot` (Protokoll-Plugin) |
|---|---|---|
| URL | `/local/kurspilot/mcp.php` | `/webservice/kurspilot/server.php` |
| Aktivierung | eigene Admin-Einstellung + eigenes Recht | Admin-Liste „Webservice-Protokolle" |
| Fernzugriff separat abschaltbar | ja, per eigenem Recht | nur global über die Protokollliste |
| Bindung an `$CFG->webserviceprotocols` | nein | ja |

Für #289 (eigene Capability für den Fernzugriff, damit ein Admin den Server-MCP unabhängig abschalten kann) passt der `local`-Weg besser. Das genehmigte Vorbild `webservice_mcp` geht den anderen Weg — beide funktionieren.

---

## 4. Sessionbegriff: wo lebt `Mcp-Session-Id`?

**Nirgends. Und das ist spezifikationskonform.**

- Nach `2026-07-28` gibt es die Sitzung nicht mehr. Der Ersatz für Zustand über mehrere Aufrufe hinweg ist ausdrücklich anders gedacht: „Servers that need cross-call state use explicit, server-minted handles passed as ordinary tool arguments" (Changelog, Major changes 1, [SEP-2567](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2567)). Ein `Mcp-Session-Id`-Header, der von einem alten Client kommt, ist zu ignorieren.
- In der Legacy-Ära ist die Session-ID ein **MAY**. Ein Server, der keine vergibt, ist konform; Clients dürfen dann keine erwarten.

Falls in einer späteren Ausbaustufe doch Zustand nötig wird (z. B. ein Change-Set-Handle für den Schreibpfad aus #289):

- **Bevorzugt: eigene DB-Tabelle.** Verbindlicher Zustand mit Ablaufzeit und Hash gehört in `db/install.xml` des Plugins.
- **MUC (Cache-API)** ist die falsche Ablage für Verbindliches: Die [Cache-API-Doku](https://moodledev.io/docs/5.0/apis/subsystems/muc) gibt keine Persistenzgarantie und rät sogar von TTL-Nutzung ab, weil „not all cache stores will support this natively". Ein Application-Cache eignet sich für ableitbare Daten (z. B. gecachte Tool-Schemata), nicht für Sitzungswahrheit.
- **Zustandslos** bleibt für den rein lesenden V1 die richtige Wahl.

---

## 5. Vorbilder

### 5.1 `webservice_mcp` — im Moodle-Plugin-Verzeichnis freigegeben

Das relevanteste Vorbild existiert und ist offiziell genehmigt: [CONTRIB-10223 „Plugin approval: Model Context Protocol (webservice_mcp)"](https://tracker.moodle.org/browse/CONTRIB-10223), eingereicht 2025-12-14, Resolution *Done*. Marktplatz-Eintrag: Moodle 4.5–5.2, 439 Installationen, 512 Downloads in 90 Tagen, Awards „Automated testing support" und „Privacy friendly" ([Marketplace-Seite](https://marketplace.moodle.com/plugins/webservice_mcp)). Quellcode: [onbirdev/moodle-webservice_mcp](https://github.com/onbirdev/moodle-webservice_mcp), letzter Push 2026-07-23.

Wie es gebaut ist (aus dem Quellcode):

- `server.php` definiert nur `NO_DEBUG_DISPLAY` und `WS_SERVER`, lädt `config.php`, prüft `webservice_protocol_is_enabled('mcp')` und startet `new \webservice_mcp\local\server(WEBSERVICE_AUTHMETHOD_PERMANENT_TOKEN)`.
- `classes/local/server.php` erweitert `webservice_base_server`, `PROTOCOL_VERSION = '2025-03-26'`, behandelt `initialize`, `notifications/initialized`, `ping`, `tools/list`, `tools/call`.
- **Kein SSE, kein Streaming, keine Session.** Jede Anfrage ist ein POST mit einer JSON-Antwort. `notifications/initialized` wird mit HTTP 204 quittiert (die Spezifikation verlangt 202 — kleine Abweichung, in der Praxis offenbar unkritisch).
- Token per `Authorization: Bearer …` mit Fallback auf `HTTP_AUTHORIZATION` / `REDIRECT_HTTP_AUTHORIZATION` und `?wstoken=`; eigene Capability `webservice/mcp:use`.
- `raise_memory_limit(MEMORY_EXTRA)` und `external_api::set_timeout()` beim Start.
- GET liefert (nicht spezifikationskonform) einen Server-Info-Block statt `405`.

**Bewertung:** Das Plugin belegt empirisch, dass reines POST/JSON-RPC in Moodle funktioniert und produktiv betrieben wird. Es ist kein Vorbild für Spezifikationstreue nach aktueller Revision — es steht auf `2025-03-26`, also zwei Revisionen zurück.

### 5.2 `webservice_elediamcp` — nicht ins Verzeichnis aufgenommen

[CONTRIB-10651](https://tracker.moodle.org/browse/CONTRIB-10651), eingereicht 2026-06-28, Resolution *Won't Do*. Aus dem Ticketkörper geht kein technischer Ablehnungsgrund hervor (Standard-Einreichungstext). Nicht als Beleg für ein technisches Hindernis verwertbar.

### 5.3 Kein MCP im Moodle-Core

Eine JQL-Suche im Tracker über `project = MDL AND text ~ "Model Context Protocol"` liefert keinen einschlägigen Treffer (nur zwei False Positives: MDL-88739, MDL-40905). Auch die Suche nach `MCP` im Summary findet ausschließlich die beiden CONTRIB-Approval-Tickets. Moodle HQ hat MCP damit **nicht** im Core und keine öffentliche Tracker-Arbeit dazu; das AI-Subsystem (seit 4.5) ist provider-orientiert, nicht MCP-orientiert.

### 5.4 Kein Vorbild für lang laufende HTTP-Protokolle in Moodle

Der einzige Core-Mechanismus in dieser Richtung ist `NO_OUTPUT_BUFFERING` (siehe 2.2), und der wird für Fortschrittsausgaben bei Installation/Upgrade genutzt, nicht für dauerhaft offene Kanäle. Es gibt kein Core-Muster für „Verbindung minutenlang offen halten".

---

## 6. Instanzweite Server-Konfiguration

### 6.1 Für den empfohlenen Weg (POST/JSON): praktisch nichts

| Punkt | Nötig? | Anmerkung |
|---|---|---|
| Öffentlich erreichbares HTTPS | ja | In #289 ohnehin gesetzt (OAuth-Redirect, Cloud-Clients). Claude-Custom-Connectors verbinden sich aus Anthropics IP-Bereichen, nicht vom Laptop der Lehrkraft — Firewall/Reverse Proxy muss das zulassen ([Claude Help Center](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp)). |
| `$CFG->enablewebservices` | nur bei Wiederverwendung der Moodle-Token-Auth | `webservice/lib.php` Zeile 74. |
| `Authorization`-Header durchreichen | prüfen | Unter CGI/FastCGI wird der Header teils nicht an PHP übergeben; deshalb der Fallback auf `REDIRECT_HTTP_AUTHORIZATION` in `webservice_mcp`. Bei Apache ggf. `CGIPassAuth On`. Alternativ Token als Query-Parameter (schlechter: landet in Logs). |
| `max_execution_time` | nein | `external_api::set_timeout()` hebt bereits auf ≥ 300 s; ggf. `$CFG->maxtimelimit` beachten. |
| Puffer-/Streaming-Einstellungen | nein | Nur bei SSE relevant. |
| Eigener FPM-Pool | nein | Nur bei SSE relevant. |

**Damit braucht der Spike keine eigene Instanz aus Transportgründen.** Eine separate Instanz bleibt aus den in #289 genannten Gründen (Testdaten, Mailverbot, produktives `moo.gruenwald.fun` unberührt) sinnvoll — aber nicht wegen des Protokolls.

### 6.2 Falls doch je SSE gebraucht wird

Dann wäre instanzweite Konfiguration unvermeidlich: `fastcgi_buffering off` bzw. Verlass auf `X-Accel-Buffering: no`, `fastcgi_read_timeout` deutlich hoch, `request_terminate_timeout` hoch, **und ein eigener, großzügig dimensionierter FPM-Pool nur für den MCP-Endpunkt**, damit lang offene Verbindungen nicht die Worker des normalen Moodle-Betriebs auffressen. Das ist der Punkt, an dem eine gemeinsam genutzte Schulinstanz zum Problem würde. Eine weitere Empfehlung: das Ganze vermeiden.

---

## 7. Restrisiken und offene Punkte

1. **Client-Ära.** Die heute verfügbaren Clients sprechen noch die Legacy-Ära. Die Codex-Dokumentation beschreibt, dass Codex „the MCP `instructions` field returned during initialization" liest ([ChatGPT/Codex MCP-Doku](https://learn.chatgpt.com/docs/extend/mcp?surface=cli)) — also `initialize`-Handshake. Claude Code fügt Remote-Server per `claude mcp add --transport http <name> <url>` hinzu, HTTP ist „the recommended option", der `sse`-Transport (die alte 2024-11-05-Variante) ist ausdrücklich deprecated ([Claude-Code-MCP-Doku](https://code.claude.com/docs/en/mcp)). **Der Endpunkt muss dual-era gebaut werden**; nur `2026-07-28` zu implementieren, würde heute an jedem realen Client scheitern („Legacy Client / Modern Server → Fails", Kompatibilitätsmatrix der Spezifikation).
2. **`subscriptions/listen`.** Falls ein moderner Client den Aufruf schickt, obwohl der Server keine `listChanged`/`subscribe`-Capabilities meldet: mit `404` + `-32601` antworten. Degradiert nur Change-Benachrichtigungen; für einen Lese-Server ohne Belang.
3. **Header-Validierung `2026-07-28`.** `Mcp-Method`/`Mcp-Name` müssen gegen den Body geprüft werden, inklusive Base64-Sentinel-Dekodierung, sonst `400` + `-32020`. Das ist neue, nicht offensichtliche Implementierungsarbeit — kein bestehendes Moodle-Plugin macht das bisher.
4. **Origin-Prüfung.** `MUST` in beiden Ären. Bei einem Server, der von Anthropics/OpenAIs Infrastruktur aufgerufen wird, kommt oft gar kein `Origin` — die Regel greift nur, wenn er vorhanden **und** ungültig ist.
5. **Auth-Weg.** Nicht Gegenstand dieser Recherche (#289 hat OAuth als Zielbild, manuelles Webservice-Token als Rückfall festgelegt). Der Transportbefund ist von der Auth-Frage unabhängig: beide Wege sind reine Header-/Redirect-Mechanik über normales HTTP.
6. **`202` vs. `204` bei Notifications.** Die Spezifikation verlangt bei akzeptierten Notifications „HTTP status code `202 Accepted` with no body". Das Vorbild-Plugin sendet `204`. Kleinigkeit, aber beim Nachbau nicht mitkopieren.

---

## 8. Empfehlung für den Spike (Prototype-Ticket aus #289)

Bauen: **eine Endpunkt-Datei, POST-only, JSON-Antwort, zustandslos, dual-era.**

- `/local/kurspilot/mcp.php`: `NO_MOODLE_COOKIES` + `NO_DEBUG_DISPLAY` (oder `WS_SERVER`) vor `require(config.php)`.
- Token aus `Authorization: Bearer` lesen, über Moodles Token-Auth auf `$USER` abbilden, danach `require_capability()` im jeweiligen Kurskontext.
- Routing: `GET`/`DELETE` → `405`. `POST` mit modernem `_meta` → zustandsloser Zweig (`server/discover`, `tools/list`, `tools/call`). `POST` mit `initialize` → Legacy-Zweig (`initialize`, `notifications/initialized` → `202`, `ping`, `tools/list`, `tools/call`), ohne `Mcp-Session-Id` zu vergeben.
- Kein SSE, kein `ob_`-Getrickse, keine Session-Tabelle, keine Cache-Definition.

Das beantwortet die Machbarkeitsfrage aus #289 vollständig — und wenn es trägt, ist der Rest Tool-Oberfläche und Auth, nicht Transport.

---

## Quellen

**MCP-Spezifikation**
- [Versioning (aktuelle Revision)](https://modelcontextprotocol.io/specification/versioning)
- [2026-07-28 – Transports (Überblick)](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports)
- [2026-07-28 – Streamable HTTP](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http)
- [2026-07-28 – Versioning and Compatibility](https://modelcontextprotocol.io/specification/2026-07-28/basic/versioning)
- [2026-07-28 – Discovery (`server/discover`)](https://modelcontextprotocol.io/specification/2026-07-28/server/discover)
- [2026-07-28 – Subscriptions](https://modelcontextprotocol.io/specification/2026-07-28/basic/patterns/subscriptions)
- [2026-07-28 – Key Changes (Changelog)](https://modelcontextprotocol.io/specification/2026-07-28/changelog)
- [2025-11-25 – Transports](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports)
- [2025-11-25 – Lifecycle](https://modelcontextprotocol.io/specification/2025-11-25/basic/lifecycle)
- [2025-11-25 – Ping](https://modelcontextprotocol.io/specification/2025-11-25/basic/utilities/ping)
- [Blog: The 2026-07-28 Specification](https://blog.modelcontextprotocol.io/posts/2026-07-28/)

**Moodle**
- Quellcode `MOODLE_500_STABLE`: [`lib/setup.php`](https://github.com/moodle/moodle/blob/MOODLE_500_STABLE/lib/setup.php) (Zeilen 278, 551–584, 664–667, 866–884), [`lib/classes/session/manager.php`](https://github.com/moodle/moodle/blob/MOODLE_500_STABLE/lib/classes/session/manager.php) (Zeile 100 ff.), [`webservice/lib.php`](https://github.com/moodle/moodle/blob/MOODLE_500_STABLE/webservice/lib.php) (Zeilen 74, 909–920, 1006–1010, 1150–1195), [`lib/external/classes/external_api.php`](https://github.com/moodle/moodle/blob/MOODLE_500_STABLE/lib/external/classes/external_api.php) (Zeile 300 ff.), [`lib/classes/php_time_limit.php`](https://github.com/moodle/moodle/blob/MOODLE_500_STABLE/lib/classes/php_time_limit.php), [`login/token.php`](https://github.com/moodle/moodle/blob/MOODLE_500_STABLE/login/token.php)
- [Local plugins (moodledev.io, 5.0)](https://moodledev.io/docs/5.0/apis/plugintypes/local)
- [Cache API / MUC (moodledev.io, 5.0)](https://moodledev.io/docs/5.0/apis/subsystems/muc)
- [CONTRIB-10223 – Plugin approval: Model Context Protocol (webservice_mcp)](https://tracker.moodle.org/browse/CONTRIB-10223)
- [CONTRIB-10651 – Plugin approval: eLeDia.ai | MCP (webservice_elediamcp)](https://tracker.moodle.org/browse/CONTRIB-10651)
- [Marketplace: webservice_mcp](https://marketplace.moodle.com/plugins/webservice_mcp)
- [Quellcode: onbirdev/moodle-webservice_mcp](https://github.com/onbirdev/moodle-webservice_mcp)

**Laufzeitumgebung**
- [PHP: FPM-Konfiguration](https://www.php.net/manual/en/install.fpm.configuration.php)
- [PHP: Connection Handling](https://www.php.net/manual/en/features.connection-handling.php)
- [nginx: `ngx_http_fastcgi_module`](https://nginx.org/en/docs/http/ngx_http_fastcgi_module.html)
- [Apache: `mpm_common` (`MaxRequestWorkers`)](https://httpd.apache.org/docs/2.4/mod/mpm_common.html)

**Clients**
- [Claude Code – MCP](https://code.claude.com/docs/en/mcp)
- [Claude Help Center – Custom connectors using remote MCP](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp)
- [Codex/ChatGPT – MCP](https://learn.chatgpt.com/docs/extend/mcp?surface=cli)
