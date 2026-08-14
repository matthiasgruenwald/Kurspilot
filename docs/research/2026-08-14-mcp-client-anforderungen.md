# Auth- und Transportanforderungen der Zielclients (Codex, Claude, opencode)

- **Recherchedatum:** 2026-08-14 (alle Quellen an diesem Tag abgerufen)
- **Auftrag:** Issue [#292](https://github.com/matthiasgruenwald/moodle-coursepilot/issues/292), Kontextkarte [#289](https://github.com/matthiasgruenwald/moodle-coursepilot/issues/289)
- **Frage:** Was verlangen die Zielclients konkret, um sich mit einem entfernten MCP-Server (`local_kurspilot` auf dem Moodle-Server) zu verbinden?

> **Haltbarkeit.** Client-Verhalten ändert sich im Wochentakt. Jede Aussage unten ist mit Quelle und Abrufdatum belegt; Versionsangaben (z. B. „ab Claude Code v2.1.186") stehen dort, wo die Dokumentation sie nennt. Vor Umsetzungsbeginn erneut prüfen — insbesondere den Beta-Status von Claudes `static_headers`.

---

## 1. Kurzfassung

1. **Kleinster gemeinsamer Nenner der Authentifizierung ist OAuth 2.1** (Authorization Code + PKCE/S256) mit
   - RFC 9728 Protected Resource Metadata,
   - RFC 8414- **oder** OpenID-Connect-Discovery beim Autorisierungsserver,
   - **und einem `registration_endpoint` (RFC 7591 Dynamic Client Registration)**.

   DCR ist der einzige Client-Registrierungsweg, den alle vier Zielclients ohne Sonderabsprache mit dem Anbieter beherrschen — obwohl die MCP-Spezifikation ihn seit Revision 2026-07-28 als *deprecated* führt. Zusätzlich `client_id_metadata_document_supported: true` anzubieten ist stark empfohlen (Codex und Claude bevorzugen CIMD; es vermeidet, dass bei jeder Neuverbindung ein neuer OAuth-Client im Moodle angelegt wird).

2. **Die Rückfallebene „Webservice-Token einkleben" trägt nicht überall.** Sie funktioniert vollständig bei **Codex CLI/Desktop/IDE**, **Claude Code** und **opencode** (jeweils statischer `Authorization`-Header aus Konfig oder Umgebungsvariable). Bei **Claude Web, Claude Desktop, Claude mobil und Cowork** — genau den Oberflächen, wegen derer Karte #289 überhaupt existiert — ist der statische Header (`static_headers`) **Beta und nur nach Kontakt mit Anthropic freigeschaltet**. Für den Spike genügt die Rückfallebene also; als Zielbild taugt sie nicht.

3. **Transport-Nenner ist Streamable HTTP mit reinem POST/JSON.** Ein einziger HTTPS-Endpunkt, der POST annimmt und mit `Content-Type: application/json` antwortet, reicht spezifikationskonform aus. SSE ist optional, ein GET-Stream ist ab Revision 2026-07-28 sogar entfernt. **Aber:** kein Zielclient spricht nachweislich schon 2026-07-28; Claude nennt ausdrücklich nur die Revisionen bis 2025-11-25. Der Server muss deshalb den älteren `initialize`-Handshake beherrschen — das ist der praktische, nicht der theoretische Nenner.

4. **Erreichbarkeit ist der härteste Zwang.** Claudes gehostete Oberflächen (Web, Desktop, mobil, Cowork) verbinden sich **aus Anthropics Cloud**, nicht vom Gerät der Lehrkraft. Damit gilt zwingend: öffentliche HTTPS-URL, global routbarer **IPv4**-`A`-Record, öffentlich gültiges Zertifikat, keine Weiterleitung auf einen anderen Host. `localhost` und selbstsignierte Zertifikate sind dort ausgeschlossen. Bei Codex, Claude Code und opencode (lokale Prozesse) sind `localhost` und eine eigene CA möglich.

---

## 2. Was die MCP-Spezifikation verlangt

Aktuelle Revision zum Recherchedatum: **2026-07-28**.

### 2.1 Transport

Die Spezifikation kennt genau zwei Standardbindungen: **stdio** und **Streamable HTTP** ([Transports Overview](https://modelcontextprotocol.io/specification/latest/basic/transports)).

Für Streamable HTTP ([Binding-Seite](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http)):

- „The server **MUST** provide a single HTTP endpoint path […] that supports POST."
- „If the body is a JSON-RPC *request*, the server **MUST** return either `Content-Type: application/json` (a single JSON object) or `Content-Type: text/event-stream` (an SSE response stream). The client **MUST** support both." → **Ein PHP-Endpunkt darf immer reines JSON zurückgeben.** SSE ist eine Server-Option, keine Pflicht.
- Der Client muss `Accept: application/json, text/event-stream` senden — das ist Client-Pflicht, keine Serveranforderung.
- Revision 2026-07-28 hat **den GET-Stream-Endpunkt und die protokollseitigen Sessions entfernt**. Ein Server, der nur diese Revision spricht, soll auf GET/DELETE mit `405 Method Not Allowed` antworten, `Mcp-Session-Id` ignorieren und `Last-Event-ID` ignorieren.
- Pflichtheader auf jedem POST (Revision 2026-07-28): `MCP-Protocol-Version`, `Mcp-Method`, sowie `Mcp-Name` bei `tools/call`, `resources/read`, `prompts/get`. Bei Abweichung zwischen Header und Body: `400` mit JSON-RPC-Fehlercode `-32020` (`HeaderMismatch`).
- Sicherheit: „Servers **MUST** validate the `Origin` header on all incoming connections to prevent DNS rebinding attacks." Bei ungültigem Origin: `403`.
- Bei SSE-Antworten `X-Accel-Buffering: no` setzen (sonst puffert nginx).
- Die Revisionen **2025-03-26 bis 2025-11-25** arbeiteten anders: `Mcp-Session-Id`, GET-Stream, DELETE zum Beenden, `Last-Event-ID`-Wiederaufnahme. **Diese Revisionen sind es, die die Zielclients heute sprechen.**

### 2.2 Autorisierung

[Authorization](https://modelcontextprotocol.io/specification/latest/basic/authorization), Revision 2026-07-28:

- „Authorization is **OPTIONAL** for MCP implementations." Ein authloser Server ist spezifikationskonform.
- Wenn OAuth: „MCP servers **MUST** implement OAuth 2.0 Protected Resource Metadata ([RFC 9728]). MCP clients **MUST** use [it] for authorization server discovery."
- Autorisierungsserver muss mindestens eines bieten: RFC 8414 Authorization Server Metadata **oder** OpenID Connect Discovery 1.0.
- Registrierungswege und Reihenfolge ([Client Registration](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization/client-registration)):
  1. vorab registrierte Client-Daten, falls vorhanden
  2. **Client ID Metadata Documents (CIMD)**, falls der AS `client_id_metadata_document_supported` meldet
  3. **Dynamic Client Registration (RFC 7591)** als Rückfall, falls `registration_endpoint` vorhanden
  4. Nutzer nach Client-Daten fragen
- Ausdrücklich: „**Dynamic Client Registration is deprecated.** New implementations should use Client ID Metadata Documents instead. This option remains available for backwards compatibility."
- PKCE ist Pflicht, ebenso RFC 8707 `resource` (kanonische MCP-Server-URI inkl. Pfad) in Authorization- **und** Token-Request.
- Bei fehlendem/ungültigem Token: `401` mit `WWW-Authenticate: Bearer resource_metadata="…"`, optional `scope=`.
- Access Token **nie** im Query-String.

---

## 3. Client für Client

### 3.1 Codex — CLI, ChatGPT-Desktop-App, IDE-Extension

Quellen: [MCP-Konfiguration](https://learn.chatgpt.com/docs/extend/mcp) und [Config-Referenz](https://learn.chatgpt.com/docs/config-file/config-reference) (beide Umleitungsziel von `developers.openai.com/codex/*`), sowie der Quellcode in [`openai/codex`](https://github.com/openai/codex).

**Transport.** stdio und Streamable HTTP. Die Konfiguration ist zwischen ChatGPT-Desktop-App, Codex CLI und IDE-Extension geteilt (`~/.codex/config.toml` bzw. projektweit `.codex/config.toml`).

**Konfigurationsblock** (Schlüssel wörtlich aus der Referenz):

```toml
[mcp_servers.kurspilot]
url = "https://moodle.example.org/local/kurspilot/mcp"
bearer_token_env_var = "KURSPILOT_TOKEN"
http_headers = { "X-Custom-Header" = "value" }
env_http_headers = { "Authorization" = "AUTH_ENV_VAR" }
auth = "oauth"          # oder "chatgpt"; weglassen für keine Auth
enabled = true
required = false
startup_timeout_sec = 10
tool_timeout_sec = 60
```

Weitere Schlüssel: `enabled_tools`, `disabled_tools`, `default_tools_approval_mode` (`auto | prompt | writes | approve`).

**Statischer Token: ja.** Drei Wege — `bearer_token_env_var` (Token bleibt aus der Datei heraus), `http_headers` (statisch in der Datei), `env_http_headers` (Headerwert aus Umgebungsvariable). CLI-Kurzform:

```bash
codex mcp add kurspilot --url https://moodle.example.org/local/kurspilot/mcp \
  --bearer-token-env-var KURSPILOT_TOKEN
```

Die Dokumentation hält außerdem fest: „If no credential source resolves, Codex can connect to the server without authentication." → **authlos ist möglich**.

**OAuth.** `codex mcp login <name>`. Beim Anlegen eines Streamable-HTTP-Servers prüft die CLI den Endpunkt selbständig auf OAuth-Unterstützung. Die Registrierungsstrategie steht im Quellcode ([`codex-rs/rmcp-client/src/oauth_client_registration.rs`](https://github.com/openai/codex/blob/main/codex-rs/rmcp-client/src/oauth_client_registration.rs)):

- Modus `Auto` (Vorgabe): „Prefer a supported native CIMD and otherwise use advertised DCR."
- CIMD wird nur gewählt, wenn die AS-Metadaten **beides** melden: `client_id_metadata_document_supported: true` **und** `"none"` in `token_endpoint_auth_methods_supported`.
- CIMD-`client_id` von Codex: `https://chatgpt.com/oauth/codex/{callback_id}/client.json`
- Redirect-URI: Loopback, Schema `http`, Host `127.0.0.1` oder `localhost`, beliebiger Port > 0, Pfad exakt `/callback/{callback_id}`, ohne Query/Fragment.
- Der Code verweist ausdrücklich auf die Prioritätsregel der Spezifikation 2026-07-28. Codex ist bei der Auth-Revision damit **weiter als Claude**.
- Client-Name im Authorization-Request: `Codex`.

**Erreichbarkeit.** Der Codex-Host läuft lokal, `localhost` ist damit möglich. Eigene/selbstsignierte Zertifikate: der gemeinsame HTTP-Client unterstützt „custom CA handling through `CODEX_CA_CERTIFICATE` and `SSL_CERT_FILE`" ([`codex-rs/http-client/README.md`](https://github.com/openai/codex/blob/main/codex-rs/http-client/README.md)).

**Grenzen.** `startup_timeout_sec` Vorgabe 10 s, `tool_timeout_sec` Vorgabe 60 s. Eine dokumentierte Obergrenze für Tool-Anzahl oder Beschreibungslänge ist **nicht** auffindbar.

### 3.2 Codex Cloud

**Nicht belegbar als Zielclient.** Weder [Codex cloud](https://learn.chatgpt.com/docs/cloud) noch die MCP-Seite erwähnen MCP-Server in Cloud-Tasks; die MCP-Seite listet ausdrücklich nur ChatGPT-Desktop-App, Codex CLI und IDE-Extension als Hosts, die MCP-Konfiguration teilen.

Was dokumentiert ist ([Agent internet access](https://learn.chatgpt.com/docs/cloud/internet-access)): In der Agentenphase ist Internetzugriff **standardmäßig blockiert**; er ist pro Umgebung aktivierbar, mit Domain-Allowlist und optionaler Beschränkung auf `GET`, `HEAD`, `OPTIONS`. Letzteres würde MCP ohnehin brechen, da MCP über POST läuft.

→ **Empfehlung:** Codex Cloud in der Spezifikation nicht als unterstützte Oberfläche zusagen. Vor einer Zusage praktisch verifizieren.

### 3.3 Claude — Web, Desktop, mobil, Cowork (Custom Connector)

Quellen: [Third party connectors with remote MCP](https://claude.com/docs/connectors/custom/remote-mcp), [Building custom connectors](https://claude.com/docs/connectors/building/), [Authentication for connectors](https://claude.com/docs/connectors/building/authentication), [Troubleshooting connectors](https://claude.com/docs/connectors/building/troubleshooting), [Testing your connector](https://claude.com/docs/connectors/building/testing), [Pre-submission checklist](https://claude.com/docs/connectors/building/review-criteria), Help-Center-Artikel [Get started with custom connectors](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp) und [When to use desktop and web connectors](https://support.claude.com/en/articles/11725091-when-to-use-desktop-and-web-connectors).

Diese vier Oberflächen sind **ein Client**: „The same infrastructure backs Claude.ai, Claude Desktop, Claude mobile, Claude Code, and Cowork." Custom Connectors sind „available on Claude, Cowork, and Claude Desktop for users on Free, Pro, Max, Team, and Enterprise plans. Free users are limited to one custom connector."

**Transport.** „Claude supports both Streamable HTTP and the legacy HTTP+SSE transport. The legacy HTTP+SSE transport is being deprecated in favor of Streamable HTTP."

**Unterstützte Auth-Spezifikationsrevisionen.** 2025-03-26, 2025-06-18, 2025-11-25. **Nicht** 2026-07-28.

**Auth-Typen** (Tabelle aus der Authentication-Seite):

| Typ | Verfügbarkeit |
|---|---|
| `oauth_dcr` — OAuth 2.0 mit Dynamic Client Registration (RFC 7591) | out of the box |
| `oauth_cimd` — OAuth 2.0 mit Client ID Metadata Document | out of the box |
| `oauth_anthropic_creds` — Anthropic hält Client-ID/-Secret | nur nach Kontakt (`mcp-review@anthropic.com`) |
| `custom_connection` — URL/Zugangsdaten bei Verbindung eingegeben | nur nach Kontakt |
| `static_headers` — fester API-Key/Bearer-Token als Request-Header | **Beta** |
| `none` — authlos | unterstützt |

**Statischer Token: nur eingeschränkt.** Die Feature-Beschreibung ist explizit als Beta markiert: „Request header authentication is in beta. This feature is being slowly rolled out to customers; contact Anthropic for early access." Wenn verfügbar:

- Headername aus einer Allowlist (`authorization`, `x-api-key`, `x-auth-token`, weitere auf Anfrage). Begründung wörtlich: „Header names are restricted to this allowlist for security reasons."
- **Maximal vier** Header pro Connector.
- Wert wird **exakt** übernommen: Eingabe `Bearer my-token` → gesendet `Authorization: Bearer my-token`.
- Auf einer OAuth-Verbindung ist `Authorization` gesperrt: „OAuth owns that header."
- Gedacht für „services where everyone in your organization shares one credential" — also **ein geteilter Token für die ganze Organisation**, nicht ein Token pro Lehrkraft. Das kollidiert mit dem Identitätsmodell aus #289 („Access-Token wird auf eine Moodle-`userid` abgebildet").

**OAuth im Detail.**

- Callback für die gehosteten Oberflächen (Web, Desktop, mobil, Cowork): **`https://claude.ai/api/mcp/auth_callback`** — genau diese Redirect-URI muss der Moodle-AS akzeptieren.
- PKCE `code_challenge_method=S256` auf **jedem** Authorization-Request; der AS muss `"code_challenge_methods_supported": ["S256"]` melden.
- CIMD wird nur gewählt, wenn die AS-Metadaten `"client_id_metadata_document_supported": true` **und** `"none"` in `token_endpoint_auth_methods_supported` melden; sonst fällt Claude auf DCR zurück.
- Discovery-Kette: `401` + `WWW-Authenticate: Bearer resource_metadata="…"` ist der zuverlässige Weg. Ohne diesen Header probiert Claude erst `/.well-known/oauth-protected-resource/<mcp-pfad>`, dann `/.well-known/oauth-protected-resource`. Beim AS: erst `/.well-known/oauth-authorization-server` (RFC 8414), dann `/.well-known/openid-configuration`.
- Wichtig: „Claude does not honor a `WWW-Authenticate` header on a `200` response." Der Statuscode **muss** 401 sein.
- Das `resource`-Feld der Protected Resource Metadata muss „match your MCP server URL exactly as the user enters it in Claude, including any path component".
- `authorization_servers`: Claude nutzt **nur den ersten Eintrag**.
- RFC 8707 `resource` = kanonische MCP-URL (Kleinschreibung Schema/Host, kein Slash am Ende, kein Fragment, kein Default-Port), inklusive Pfad — der Moodle-AS muss Tokens mit dieser Audience ausstellen.
- Token-Endpunkt muss `application/x-www-form-urlencoded` annehmen; `/register` dagegen `application/json`.
- Refresh: reaktiv bei `401`, proaktiv bis 5 Minuten vor Ablauf. Bei ungültigem Refresh-Token `invalid_grant` zurückgeben. Refresh-Token-Rotation für Public Clients erwartet.
- **Latenzgrenzen:** 10 s für Discovery-, Registrierungs- und Token-Endpunkt; 30 s für Refresh-Requests.
- Reine Machine-to-Machine-`client_credentials` sind **nicht** unterstützt: „Every connection requires user consent." (Deckt sich mit #289.)

**Erreichbarkeit — der harte Teil.** „Claude connects to your remote MCP server from Anthropic's cloud infrastructure, rather than from your local device. This is true across every Claude client, including claude.ai, Claude Desktop, Cowork, and the mobile apps."

Claude weist die Verbindung **vor** dem ersten HTTP-Request ab, wenn der Hostname:

- auf eine private Adresse auflöst (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`),
- auf CGNAT (`100.64.0.0/10`) auflöst,
- auf Loopback oder Link-local auflöst,
- auf eine **Mischung** aus öffentlichen und nicht-öffentlichen Adressen auflöst („every returned address must be globally routable"),
- **keinen `A`-Record** hat: „connectors are IPv4-only, so a hostname that only publishes `AAAA` records can't be reached".

Weiter:

- Anthropics ausgehender Verkehr kommt aus **`160.79.104.0/21`** — WAF/CDN/Firewall müssen das durchlassen, **auch vor dem Autorisierungsserver**.
- Eine `3xx`-Weiterleitung auf einen **anderen Host** verliert den `Authorization`-Header. Es muss die URL registriert werden, auf der der Server tatsächlich lauscht.
- Lokaler Test nur über Tunnel (Cloudflare Tunnel, ngrok): „To test a server running on your machine, expose it as a public URL with a tunnel […] then add the tunnel URL as a custom connector."
- Selbstsignierte Zertifikate sind nirgends als unterstützt genannt; die Submission verlangt eine `https://`-URL. → **praktisch ausgeschlossen**.
- Zu strenge `Origin`-Prüfung wird ausdrücklich als Ursache für `initialize`-Timeouts genannt — Anthropics Requests dürfen nicht durch die Origin-Regel fallen.

**Grenzen.**

| Grenze | Wert |
|---|---|
| Max. Tool-Ergebnisgröße Claude.ai/Desktop | ca. **150.000 Zeichen** |
| Timeout Claude.ai/Desktop | **300 Sekunden** |
| Tool-Namen | ≤ **64 Zeichen** (Directory-Kriterium) |
| Anzahl Tools | **nicht dokumentiert** |
| Länge der Tool-Beschreibung | **nicht dokumentiert** (Claude Code kürzt bei 2 KB, s. u.) |
| Nicht unterstützt | Resource Subscriptions, Sampling, Draft-Capabilities |

Pflicht für jedes Tool: `readOnlyHint` bzw. `destructiveHint` — „These determine auto-permissions in Claude: read-only tools can run without per-call confirmation; destructive tools always prompt." Für einen rein lesenden V1 also durchweg `readOnlyHint: true`, was die Bestätigungsklicks der Lehrkraft eliminiert.

Ebenfalls relevant für die Tool-Oberfläche: „A single tool that accepts both safe HTTP methods […] and unsafe methods […] is rejected. Do not ship a catch-all `api_request` tool with a `method` parameter."

**Client-Erkennung.** Claude meldet sich im `initialize`-Handshake als `clientInfo.name` mit `"claude-ai"`, `"Anthropic"` (teils mit Dienstsuffix) oder `"claude-code"`. Ausdrücklich: nicht für Autorisierungsentscheidungen verwenden, „it's unauthenticated".

**Claude Desktop hat zwei getrennte Wege.** Der Custom Connector oben läuft über Anthropics Cloud. Daneben gibt es lokale MCP-Server (stdio, `claude_desktop_config.json`) bzw. Desktop Extensions — die „run locally and are only available in Claude Desktop and Claude Code", nicht auf Web, mobil oder Cowork. Das ist der heutige Kurspilot-Weg; er ist genau der, den #289 ablösen will.

### 3.4 Claude Code

Quelle: [Connect Claude Code to tools via MCP](https://code.claude.com/docs/en/mcp), [Enterprise network configuration](https://code.claude.com/docs/en/network-config).

Nicht in der Zielclient-Liste von #292, aber der freizügigste Client und deshalb der beste Spike-Partner.

**Transports.** `http` (JSON-Alias `streamable-http`), `sse` (deprecated), `stdio`, `ws`.

**Statischer Token: ja, unmittelbar.**

```bash
claude mcp add --transport http kurspilot https://moodle.example.org/local/kurspilot/mcp \
  --header "Authorization: Bearer your-token"
```

Zusätzlich `headersHelper`: ein Shell-Kommando, das zur Verbindungszeit ein JSON-Objekt mit Headern ausgibt (10 s Timeout) — brauchbar, um ein Moodle-Token aus dem Schlüsselbund zu ziehen statt es in eine Datei zu schreiben.

Fallstrick: „A JSON entry that has a `url` but no `type` is a configuration error" — Claude Code liest einen Eintrag ohne `type` als stdio-Server.

**OAuth.** `/mcp` interaktiv, oder `claude mcp login <name>` (ab v2.1.186).

- Redirect: RFC-8252-Loopback auf **ephemerem Port**, z. B. `http://localhost:3118/callback`.
- Claude Code deklariert `http://localhost/callback` und `http://127.0.0.1/callback` in seinem [Client ID Metadata Document](https://claude.ai/oauth/claude-code-client-metadata). **Der Moodle-AS muss beide akzeptieren und den Port ignorieren** (RFC 8252 §7.3 fordert das für die IP-Literalform; die Doku verlangt dieselbe portunabhängige Prüfung auch für `localhost`).
- Fester Port über `oauth.callbackPort` möglich, falls der AS eine vorab registrierte Redirect-URI verlangt.
- Vorab registrierte Client-Daten über `--client-id` / `--client-secret` bzw. `oauth.clientId`/`clientSecret`.
- `authServerMetadataUrl` überschreibt die Discovery; `oauth.scopes` fixiert die angefragten Scopes.
- Claude Code nutzt sein **eigenes** CIMD, nicht Anthropics gehaltene Credentials.

**Erreichbarkeit.** Lokaler Prozess → `localhost` unproblematisch. Eigene CA über `NODE_EXTRA_CA_CERTS`, Truststore-Auswahl über `CLAUDE_CODE_CERT_STORE` (`bundled,system`), mTLS über `CLAUDE_CODE_CLIENT_CERT`/`_KEY`. → **Selbstsigniert praktikabel.**

**Grenzen.**

| Grenze | Wert |
|---|---|
| Startup-Timeout | `MCP_TIMEOUT` (ms) |
| Tool-Wanduhr-Limit | pro Server `timeout` (ms), sonst `MCP_TOOL_TIMEOUT`, Vorgabe ca. 28 h |
| Per-Request-Timer bis zum ersten Antwortbyte (HTTP/SSE) | **60 s**, anhebbar über `timeout`/`MCP_TOOL_TIMEOUT` ≥ 60 s |
| Idle-Timeout ohne Antwort/Progress (HTTP) | **5 Minuten**, `CLAUDE_CODE_MCP_TOOL_IDLE_TIMEOUT` |
| Automatisches Hintergrundstellen langer Aufrufe | nach **2 Minuten** (ab v2.1.212) |
| Tool-Ausgabe | Warnung ab **10.000 Token**, Kappung bei **25.000**, `MAX_MCP_OUTPUT_TOKENS` |
| **Tool-Beschreibungen und Server-Instructions** | **auf je 2 KB gekürzt** — „Keep them concise to avoid truncation, and put critical details near the start." |
| Anzahl Tools | keine harte Grenze; ab „dozens" greift Tool Search (Vorgabe an) |
| Reconnect | 5 Versuche, exponentiell ab 1 s; Erstverbindung 3 Versuche bei transienten Fehlern |

Claude Code kann außerdem die in claude.ai angelegten Connectors mitbenutzen; dieser Verkehr läuft dann über `mcp-proxy.anthropic.com`, also wieder aus Anthropics Netz.

### 3.5 opencode (Bonus)

Quellen: [MCP servers](https://opencode.ai/docs/mcp-servers) und das maschinenlesbare Konfigurationsschema unter <https://opencode.ai/config.json> (dort `McpLocalConfig`, `McpRemoteConfig`, `McpOAuthConfig`).

**Transport.** `type: "local"` (Kommando) oder `type: "remote"` (URL).

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "kurspilot": {
      "type": "remote",
      "url": "https://moodle.example.org/local/kurspilot/mcp",
      "enabled": true,
      "headers": { "Authorization": "Bearer {env:KURSPILOT_TOKEN}" }
    }
  }
}
```

**Statischer Token: ja**, über `headers`, mit `{env:…}`-Auflösung. `"oauth": false` schaltet die automatische OAuth-Erkennung ab, damit ein reiner API-Key-Server nicht in den Flow läuft.

**OAuth.** Automatisch bei `401`; Client-Registrierung über **DCR (RFC 7591)** — das Schema sagt zu `clientId`: „If not provided, dynamic client registration (RFC 7591) will be attempted." **CIMD ist im Schema nicht vorgesehen.** Vorab registrierte Credentials über `oauth.clientId`/`clientSecret`/`scope`.

- Redirect-URI Vorgabe: **`http://127.0.0.1:19876/mcp/oauth/callback`**, Port über `oauth.callbackPort` (Vorgabe 19876), komplette URI über `oauth.redirectUri`.
- CLI: `opencode mcp auth <server>`, `opencode mcp list`, `opencode mcp logout <server>`, `opencode mcp debug <server>`.

**Grenzen.** `timeout` „Defaults to 5000 (5 seconds) if not specified" — **das ist knapp** für einen Moodle-Request, der Kursstruktur samt Inhalten liefert. Für Kurspilot muss die Anleitung `timeout` explizit hochsetzen. Tool-Anzahl und Beschreibungslänge sind nicht dokumentiert.

**Erreichbarkeit.** Lokaler Prozess → `localhost` möglich. Zu selbstsignierten Zertifikaten sagt die Dokumentation nichts. **Offen.**

---

## 4. Vergleichstabelle: Client × Anforderung

| Anforderung | Codex CLI / ChatGPT-Desktop / IDE | Codex Cloud | Claude Web / Desktop / mobil / **Cowork** | Claude Code | opencode |
|---|---|---|---|---|---|
| **Streamable HTTP** | ja | nicht dokumentiert | ja | ja | ja |
| **Legacy HTTP+SSE** | nicht dokumentiert | – | ja (deprecated) | ja (`--transport sse`, deprecated) | nicht dokumentiert |
| **Reines POST/JSON ohne SSE reicht** | ja (Spec-konform) | – | ja | ja | ja |
| **stdio** | ja | – | nur Desktop/Code lokal | ja | ja (`type: local`) |
| **Statischer Bearer-Token / Header** | **ja** (`bearer_token_env_var`, `http_headers`, `env_http_headers`) | – | **nur `static_headers`, Beta, nach Kontakt mit Anthropic**, max. 4 Header, Headername-Allowlist, org-weit geteilt | **ja** (`--header`, `headersHelper`) | **ja** (`headers`) |
| **Authlos möglich** | ja | – | ja (`none`) | ja | ja (`oauth: false`) |
| **OAuth erzwungen?** | nein | – | **praktisch ja** für nicht-Beta-Kunden | nein | nein |
| **DCR (RFC 7591)** | Rückfall | – | ja | ja | **ja, einziger automatischer Weg** |
| **CIMD** | bevorzugt (`Auto`) | – | ja | ja (eigenes CIMD) | **nein** |
| **Vorab registrierte Client-ID** | nicht in Config vorgesehen | – | ja (Advanced settings, Secret optional) | ja (`--client-id`/`--client-secret`) | ja (`oauth.clientId`) |
| **Redirect-URI** | `http://127.0.0.1:<port>/callback/<id>` bzw. `localhost` | – | **`https://claude.ai/api/mcp/auth_callback`** | `http://localhost/callback` und `http://127.0.0.1/callback`, **Port ignorieren** | `http://127.0.0.1:19876/mcp/oauth/callback` (konfigurierbar) |
| **PKCE S256** | ja | – | **Pflicht**, AS muss es melden | ja | ja |
| **Discovery-Dokumente** | RFC 9728 → RFC 8414/OIDC | – | RFC 9728 (via `WWW-Authenticate` oder `/.well-known/…`) → RFC 8414, dann OIDC | RFC 9728 → RFC 8414/OIDC, überschreibbar | RFC 9728 → RFC 8414/OIDC |
| **Öffentliche HTTPS-URL nötig** | nein | – | **ja**, global routbare **IPv4**, kein Redirect auf anderen Host, Egress `160.79.104.0/21` | nein | nein |
| **localhost möglich** | ja | – | **nein** | ja | ja |
| **Selbstsigniertes Zertifikat** | ja (`CODEX_CA_CERTIFICATE`, `SSL_CERT_FILE`) | – | **nein** | ja (`NODE_EXTRA_CA_CERTS`, `CLAUDE_CODE_CERT_STORE`) | nicht dokumentiert |
| **Start-Timeout** | 10 s (`startup_timeout_sec`) | – | Discovery/Token 10 s, Refresh 30 s | `MCP_TIMEOUT` | – |
| **Tool-Timeout** | 60 s (`tool_timeout_sec`) | – | **300 s** | 60 s bis erstes Byte; Idle 5 min; Hintergrund ab 2 min | **5 s** (`timeout`, Vorgabe!) |
| **Antwortgröße** | nicht dokumentiert | – | ca. **150.000 Zeichen** | 25.000 Token (`MAX_MCP_OUTPUT_TOKENS`) | nicht dokumentiert |
| **Tool-Beschreibung** | nicht dokumentiert | – | nicht dokumentiert; Name ≤ 64 Zeichen | **2 KB, danach gekürzt** | nicht dokumentiert |
| **Tool-Anzahl** | nicht dokumentiert | – | nicht dokumentiert | Tool Search ab „dozens" | nicht dokumentiert |
| **Unterstützte Auth-Spec-Revision** | referenziert 2026-07-28 | – | 2025-03-26, 2025-06-18, **2025-11-25** | – | – |
| **Schritte für eine Lehrkraft** | 3–5, **Terminal/Datei nötig** | – | **4–5 Klicks, kein Terminal** | 2–3, Terminal | 2–4, JSON-Datei |

---

## 5. Kleinster gemeinsamer Nenner

### 5.1 Authentifizierung

**OAuth 2.1 Authorization Code + PKCE (S256), mit RFC 9728 + RFC 8414/OIDC-Discovery und einem `registration_endpoint` (DCR).**

Begründung:

- Es ist das **einzige** Modell, das alle vier Clients ohne Sonderabsprache und ohne Beta-Gate beherrschen.
- DCR ist der einzige *automatische* Registrierungsweg, den auch **opencode** kann — CIMD kennt dessen Konfigurationsschema nicht.
- Ein statischer Token ist bei drei von vier Clients bequem, scheitert aber genau bei der Oberfläche, die Karte #289 begründet (Cowork, Claude Web). `static_headers` ist Beta, gilt organisationsweit statt pro Lehrkraft und kollidiert damit mit der Anforderung „Access-Token wird auf eine Moodle-`userid` abgebildet".

**Zusätzlich anbieten (nicht statt, sondern neben DCR):**

- `"client_id_metadata_document_supported": true` **und** `"none"` in `token_endpoint_auth_methods_supported` in den AS-Metadaten. Nur mit **beidem** wählen Codex und Claude den CIMD-Weg. Das erspart dem Moodle bei jeder Neuverbindung einen neuen registrierten OAuth-Client — Anthropic warnt ausdrücklich vor „very large numbers of registered clients on your authorization server" durch DCR.
- Ein Weg für **vorab registrierte Client-ID/Secret** (Claude Advanced settings, Claude Code `--client-id`, opencode `oauth.clientId`). Das ist die Notbremse, wenn DCR in der Moodle-Instanz aus Sicherheitsgründen abgeschaltet wird.

**Redirect-URIs, die der Moodle-AS akzeptieren muss:**

1. `https://claude.ai/api/mcp/auth_callback` (Claude Web/Desktop/mobil/Cowork — exakt)
2. `http://127.0.0.1:*/callback` und `http://localhost:*/callback` — **Port ignorierend** (Claude Code)
3. `http://127.0.0.1:*/callback/<id>` und `http://localhost:*/callback/<id>` (Codex)
4. `http://127.0.0.1:19876/mcp/oauth/callback` (opencode-Vorgabe)

Praktisch heißt das: Loopback-Redirects portunabhängig und pfadtolerant zulassen, plus die eine feste Claude-URL.

### 5.2 Transport

Ein einziger HTTPS-Endpunkt (Beispiel `/local/kurspilot/mcp`), der:

- **POST** annimmt und mit `Content-Type: application/json` antwortet — SSE ist optional und für einen lesenden V1 unnötig;
- den `initialize`-Handshake der Revisionen 2025-06-18 / 2025-11-25 beherrscht (das ist es, was Claude heute spricht) und Session-IDs entweder korrekt vergibt oder — wenn er 2026-07-28 spricht — sauber ignoriert;
- den `Origin`-Header prüft, aber Anthropics Requests nicht wegwirft (dokumentierte Timeout-Ursache);
- bei fehlendem/ungültigem Token **`401`** mit `WWW-Authenticate: Bearer resource_metadata="…"` liefert (nicht `200` mit Fehlerobjekt, nicht `403`);
- GET/DELETE mit `405` beantwortet, falls keine Alt-Revision bedient wird.

Die Karten-Rückfallebene „degradierter Transport (POST/JSON-RPC ohne SSE)" aus #289 ist damit **kein Rückfall, sondern der reguläre, spezifikationskonforme Weg**. Das entschärft das größte Machbarkeitsrisiko des PHP-Endpunkts.

### 5.3 Erreichbarkeit

Der Zwang kommt allein von Claudes gehosteten Oberflächen und ist nicht verhandelbar:

- öffentliche HTTPS-URL mit **global routbarem IPv4-`A`-Record** (nur `AAAA` reicht nicht);
- öffentlich vertrauenswürdiges Zertifikat;
- keine `3xx`-Weiterleitung auf einen anderen Host (Apex → `www.`, Vanity → CDN);
- Egress-Bereich `160.79.104.0/21` in WAF/CDN/Firewall freigeschaltet — **auch vor dem Autorisierungsserver**, wenn dieser auf einem anderen Host liegt;
- Discovery-, Registrierungs- und Token-Endpunkt antworten in **unter 10 s**.

Das bestätigt die Kartenentscheidung „Öffentlich erreichbares HTTPS ist Pflicht".

---

## 6. Konfigurationsschritte für Lehrkräfte

Gemessen an dem, was die Lehrkraft selbst tun muss — Kernversprechen von #289 ist „deutlich weniger als die heutige Node-Installation".

| Weg | Schritte | Terminal/Datei? |
|---|---|---|
| **Claude Web/Desktop/Cowork, OAuth** | 1. Customize → Connectors · 2. „Add custom connector" · 3. URL einfügen · 4. „Add" · 5. „Connect" → Moodle-Login im Browser → zustimmen | **nein** |
| Claude Web/Desktop/Cowork, `static_headers` | zusätzlich: Token in Moodle erzeugen, kopieren, als `Authorization: Bearer …` eintragen — und vorher Beta-Zugang von Anthropic | nein, aber Beta + Admin |
| **Codex CLI, OAuth** | 1. `codex mcp add kurspilot --url …` · 2. `codex mcp login kurspilot` → Browser · 3. Moodle-Login | **ja** |
| Codex CLI, Token | 1. Token in Moodle erzeugen · 2. Umgebungsvariable setzen (dauerhaft: Shell-Profil) · 3. `codex mcp add … --bearer-token-env-var …` | **ja**, plus Shell-Profil |
| **Claude Code, OAuth** | 1. `claude mcp add --transport http kurspilot …` · 2. `/mcp` → authentifizieren | **ja** |
| **opencode** | 1. `opencode.json` anlegen/erweitern (inkl. `timeout` hochsetzen!) · 2. `opencode mcp auth kurspilot` | **ja** |

**Folgerung.** Nur der OAuth-Weg über Claudes gehostete Oberflächen erfüllt „keine Code-Ebene" wirklich: fünf Klicks, ein Browser-Login, keine Datei, kein Terminal, kein Node. Genau dieser Weg verträgt aber **keinen** eingeklebten Token außerhalb der Beta. Die Rückfallebene bleibt der Entwickler-/Spike-Pfad (Codex CLI, Claude Code), nicht der Lehrkraft-Pfad.

---

## 7. Konkrete Anforderungsliste an `local_kurspilot`

Direkt ableitbar, ohne weitere Recherche:

**Transport**
- [ ] Ein POST-Endpunkt, Antwort `application/json`; kein SSE nötig.
- [ ] `Origin`-Prüfung, die Anthropics Requests durchlässt; ungültiger Origin → `403`.
- [ ] GET/DELETE → `405`, sofern keine Alt-Revision bedient wird.
- [ ] Protokollrevision: mindestens 2025-11-25 (das spricht Claude); 2026-07-28 zusätzlich, sobald Clients folgen.

**Autorisierung**
- [ ] `401` + `WWW-Authenticate: Bearer resource_metadata="…"` (nie auf `200`).
- [ ] `/.well-known/oauth-protected-resource` **und** `/.well-known/oauth-protected-resource/<mcp-pfad>` bedienen; `resource` exakt gleich der URL, die die Lehrkraft eingibt.
- [ ] `authorization_servers` → erster Eintrag ist verbindlich.
- [ ] AS-Metadaten unter `/.well-known/oauth-authorization-server` **oder** `/.well-known/openid-configuration` mit: `registration_endpoint` (DCR), `code_challenge_methods_supported: ["S256"]`, idealerweise `client_id_metadata_document_supported: true` **plus** `"none"` in `token_endpoint_auth_methods_supported`.
- [ ] Token-Endpunkt nimmt `application/x-www-form-urlencoded`; `/register` nimmt `application/json`.
- [ ] Audience-Prüfung gegen die **kanonische** MCP-URL (RFC 8707 `resource`), tolerant gegenüber Groß-/Kleinschreibung und Slash am Ende.
- [ ] Refresh-Token rotieren; bei Ablauf `invalid_grant`.
- [ ] Redirect-URIs: `https://claude.ai/api/mcp/auth_callback` fest, Loopback portunabhängig.
- [ ] Discovery/Registrierung/Token antworten in < 10 s.

**Betrieb**
- [ ] Öffentliche HTTPS-URL, IPv4-`A`-Record, gültiges Zertifikat, keine Cross-Host-Redirects.
- [ ] Egress `160.79.104.0/21` in Firewall/WAF freigeben.

**Tool-Oberfläche**
- [ ] Jedes Tool mit `title` und `readOnlyHint: true` (V1 ist rein lesend) → keine Bestätigungsklicks bei Claude.
- [ ] Tool-Namen ≤ 64 Zeichen.
- [ ] Tool-Beschreibungen ≤ 2 KB, Wichtigstes zuerst (Claude Code kürzt sonst).
- [ ] Kein Catch-all-Tool mit `method`-Parameter.
- [ ] Antworten so schneiden, dass sie unter ca. 150.000 Zeichen bzw. 25.000 Token bleiben — für Kursstruktur mit Inhalten heißt das: Paginierung oder Detailtiefe als Parameter.
- [ ] Antwortzeit unter 5 s halten oder für opencode ein höheres `timeout` dokumentieren; unter 60 s bleiben (Claude Code, erstes Byte).

---

## 8. Offene Punkte

| Punkt | Status |
|---|---|
| Unterstützt **Codex Cloud** MCP-Server? | Nicht dokumentiert. Praktisch verifizieren, bevor die Spec es zusagt. Internetzugriff ist in der Agentenphase standardmäßig aus, HTTP-Methoden ggf. auf GET/HEAD/OPTIONS begrenzt — das würde MCP ohnehin brechen. |
| Wann verlässt Claudes `static_headers` die Beta, und gibt es je einen **pro Nutzer** eingegebenen Header? | Unklar. Heute organisationsweit + Anthropic-Kontakt nötig. Entscheidet, ob die Token-Rückfallebene je Lehrkraft-tauglich wird. |
| Harte Obergrenze für **Tool-Anzahl** bei Claude.ai-Connectors | Nicht dokumentiert. Bei aktueller Kurspilot-Toolzahl (Aktivitäts-MCPs nach ADR 0007) vor der Spec praktisch messen. |
| Maximale **Tool-Beschreibungslänge** bei Codex und opencode | Nicht dokumentiert. |
| **Selbstsignierte Zertifikate** bei opencode | Nicht dokumentiert. |
| Wann sprechen die Zielclients die Revision **2026-07-28** (keine Sessions, kein GET-Stream, Pflicht-Header `Mcp-Method`/`Mcp-Name`)? | Claude nennt heute nur bis 2025-11-25; Codex referenziert 2026-07-28 im Quellcode. Der Server muss vorerst beide Ären bedienen. |
| Verhalten bei **langen Antworten** (Streaming/Progress) bei Codex und opencode | Nicht dokumentiert. Für V1 irrelevant, für den späteren Schreibpfad relevant. |

---

## 9. Quellen

**MCP-Spezifikation** (Revision 2026-07-28, abgerufen 2026-08-14)
- <https://modelcontextprotocol.io/specification/latest/basic/transports>
- <https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http>
- <https://modelcontextprotocol.io/specification/latest/basic/authorization>
- <https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization/client-registration>

**Codex**
- <https://learn.chatgpt.com/docs/extend/mcp> (Umleitungsziel von `developers.openai.com/codex/mcp`)
- <https://learn.chatgpt.com/docs/config-file/config-reference>
- <https://learn.chatgpt.com/docs/cloud>
- <https://learn.chatgpt.com/docs/cloud/internet-access>
- Quellcode: <https://github.com/openai/codex/blob/main/codex-rs/rmcp-client/src/oauth_client_registration.rs>
- Quellcode: <https://github.com/openai/codex/blob/main/codex-rs/http-client/README.md>

**Claude (Web, Desktop, mobil, Cowork, Code)**
- <https://claude.com/docs/connectors/custom/remote-mcp>
- <https://claude.com/docs/connectors/building/>
- <https://claude.com/docs/connectors/building/authentication>
- <https://claude.com/docs/connectors/building/troubleshooting>
- <https://claude.com/docs/connectors/building/testing>
- <https://claude.com/docs/connectors/building/review-criteria>
- <https://claude.com/docs/connectors/building/submission>
- <https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp>
- <https://support.claude.com/en/articles/11725091-when-to-use-desktop-and-web-connectors>
- <https://code.claude.com/docs/en/mcp>
- <https://code.claude.com/docs/en/network-config>
- <https://platform.claude.com/docs/en/api/ip-addresses>

**opencode**
- <https://opencode.ai/docs/mcp-servers>
- <https://opencode.ai/config.json> (maschinenlesbares Konfigurationsschema: `McpLocalConfig`, `McpRemoteConfig`, `McpOAuthConfig`)
