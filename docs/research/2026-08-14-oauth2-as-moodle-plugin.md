# Recherche: OAuth2-Authorization-Server im Moodle-Plugin

**Datum:** 2026-08-14
**Auftrag:** [Issue #291](https://github.com/matthiasgruenwald/moodle-coursepilot/issues/291)
**Kontextkarte:** [Issue #289 – Kurspilot als Moodle-natives MCP-Plugin](https://github.com/matthiasgruenwald/moodle-coursepilot/issues/289)
**Untersuchte Moodle-Fassung:** `MOODLE_500_STABLE` (Quellcode direkt gelesen), Vergleichsblicke auf `main`
**MCP-Fassung:** Protokollversion `2026-07-28` (aktuell laut [Versioning](https://modelcontextprotocol.io/specification/versioning))

---

## Kurzfazit

1. **Moodle bringt serverseitig nichts Wiederverwendbares mit.** `\core\oauth2` ist reine Client-Seite. Der einzige echte Token-Aussteller im Core ist `mod_lti` – `client_credentials` mit JWT-Client-Assertion, ohne Authorization-Code, ohne Consent, ohne Refresh, und ohne öffentliche API für Drittplugins. Er taugt als **Muster**, nicht als Unterbau.
2. **Die Webservice-Tokenverwaltung taugt nicht als OAuth-Unterbau**, wohl aber als Datenmodell- und UI-Vorbild – und sie ist bereits die in #289 vorgesehene Rückfallebene (Prior Art: Plugin `webservice_mcp`).
3. **Empfehlung: minimaler Eigenbau statt Bibliothek.** `league/oauth2-server` deckt genau den einfachen Teil ab (Auth-Code + PKCE + Refresh) und keinen der MCP-spezifischen Teile (RFC 9728, RFC 8414, RFC 7591/CIMD, Consent, Audience-Bindung), kostet aber vier zusätzlich zu vendorende Fremdbibliotheken und sechs selbst zu implementierende Repository-Interfaces.
4. **Der Consent-Screen hängt trivial am Moodle-Login** – `require_login()` auf der Authorize-Seite, exakt wie `mod/lti/auth.php`. LDAP/SSO/moin.schule greifen damit automatisch.
5. **Das größte ungelöste Hindernis ist nicht OAuth, sondern `/.well-known/`.** Die Authorization-Server-Metadaten müssen unter einem Pfad am Host-Root liegen; ein Moodle-Plugin darf dort keine Dateien ablegen. Das erzwingt eine Webserver-Rewrite-Regel in der Installationsanleitung und kollidiert mit dem Ziel „Plugin-Directory-tauglich, keine Instanz-Annahmen“.
6. **Aufwand: kein Wochenend-Spike.** Lauffähiger Spike gegen einen Client 3–5 Personentage, produktionsreif 15–25 Personentage.

---

## 1. Was Moodle mitbringt

### 1.1 `\core\oauth2` ist Client-Seite – bestätigt

Die OAuth-2-API liegt unter `/lib/classes/oauth2/` und dient dazu, dass **Moodle sich bei fremden Diensten anmeldet**: Ein „OAuth Issuer“ ist ein externes System, Moodle hält dessen `clientid`/`clientsecret` und tauscht dort Tokens ein ([OAuth 2 API, MoodleDocs](https://docs.moodle.org/dev/OAuth_2_API)).

Das Datenmodell belegt die Richtung eindeutig (aus `lib/db/install.xml`, `MOODLE_500_STABLE`):

| Tabelle | Bedeutung |
|---|---|
| `oauth2_issuer` | `clientid`, `clientsecret` = **Moodles eigene** Zugangsdaten beim Fremdanbieter; `baseurl`, `loginscopes`, `alloweddomains` |
| `oauth2_endpoint` | Endpunkte **des Fremdanbieters** |
| `oauth2_access_token`, `oauth2_refresh_token` | Tokens, die **Moodle als Client hält** (`issuerid`, `expires`, `scopehash`) |
| `oauth2_system_account`, `oauth2_user_field_mapping` | Systemkonto beim Fremdanbieter, Feld-Mapping für den Login |

Es existiert **keine** Tabelle für fremde Clients, ausgegebene Authorization-Codes, Consent oder Scopes im Aussteller-Sinn. `auth_oauth2` ist ebenfalls Client-Seite (Login über einen fremden IdP).

### 1.2 Der einzige serverseitige Token-Aussteller im Core: `mod_lti`

`mod/lti/` (Moodle als LTI-**Plattform**) enthält einen kompletten, wenn auch stark verengten OAuth-2-/OIDC-Aussteller:

| Datei | Rolle |
|---|---|
| [`mod/lti/auth.php`](https://github.com/moodle/moodle/blob/MOODLE_500_STABLE/mod/lti/auth.php) | Autorisierungsendpunkt (OIDC `response_type=id_token`, `response_mode=form_post`) |
| [`mod/lti/token.php`](https://github.com/moodle/moodle/blob/MOODLE_500_STABLE/mod/lti/token.php) | Token-Endpunkt, `grant_type=client_credentials` + `client_assertion_type=urn:ietf:params:oauth:client-assertion-type:jwt-bearer` |
| `mod/lti/certs.php` | JWKS |
| `mod/lti/openid-configuration.php` | Metadaten-Dokument (an einem Plugin-Pfad, **nicht** unter `/.well-known/`) |
| `mod/lti/openid-registration.php` | LTI Dynamic Registration – ein Profil von RFC 7591 |

Drei Beobachtungen, die für uns zählen:

- **`auth.php` hängt am normalen Moodle-Login.** Der Einstieg ist `if (!isloggedin() && empty($_POST['repost']))`, später `require_login($course, ...)` plus `require_capability(...)`. Genau das Muster, das Leitfrage 4 sucht (Abschnitt 4).
- **`token.php` setzt `NO_MOODLE_COOKIES`** und antwortet mit reinem JSON. Auch das ist das Muster für unsere `/token`-, `/register`- und Metadaten-Endpunkte.
- **Was fehlt:** kein `authorization_code`-Grant, kein PKCE, kein Consent-Screen, keine Refresh-Tokens, keine frei definierbaren Scopes. Die Funktionen liegen in `mod/lti/locallib.php` und sind `mod_lti`-intern – keine dokumentierte API für Drittplugins. **Kopiervorlage, keine Bibliothek.**

### 1.3 Taugt die Webservice-Tokenverwaltung als Unterbau? Nein – aber als Vorbild.

Tabelle `external_tokens` (`lib/db/install.xml`, `MOODLE_500_STABLE`):

```
token         char(128)  "security token, aka private access key"   (indiziert)
privatetoken  char(64)
tokentype     int        0=permanent, 1=an Browser-Session gebunden, 2=permanent mit emulierter Session
userid        int        Eigentümer
externalserviceid int
contextid     int        "context id where in token valid"
creatorid     int
iprestriction char(255)
validuntil    int
timecreated   int
lastaccess    int
name          char(255)
```

Erzeugung, `lib/external/classes/util.php`, `\core_external\util::generate_token()`:

```php
$generatedtoken = md5(uniqid((string) rand(), true));
```

Dieselbe Konstruktion steht als Altbestand auch in `webservice/lib.php` (`md5(uniqid(rand(),1))`).

Prüfung, `webservice/lib.php`:

```php
if (!$token = $DB->get_record('external_tokens', array('token' => $token))) { ... }
if ($token->validuntil and $token->validuntil < time()) { $DB->delete_records(...); }
if ($token->iprestriction and !address_in_subnet(getremoteaddr(), $token->iprestriction)) { ... }
```

Bewertung:

| Kriterium | Moodle-Webservice-Token | Für MCP/OAuth gebraucht |
|---|---|---|
| Speicherung | **Klartext**, indiziert | Hash (SHA-256) |
| Entropie | `md5(uniqid(rand()))` | `random_bytes(32)` |
| Client-Begriff | keiner (Token gehört Nutzer + Service) | `client_id`, Redirect-URIs, Consent pro Client |
| Scopes | keine (nur Funktionsliste des Dienstes) | Scopes, `resource`/Audience |
| Refresh | keiner | Refresh + Rotation (OAuth 2.1) |
| Ablauf | `validuntil`, optional | Access kurz, Refresh lang |
| Widerruf durch Nutzer | ja, siehe unten | ja |

**Fazit:** kein Unterbau. Ein OAuth-Aufsatz auf `external_tokens` müsste alle fehlenden Begriffe danebenlegen und würde dabei die Klartextspeicherung erben. Additive eigene Tabellen (`local_kurspilot_*`) sind sauberer und entsprechen der Vorgabe „eigene Tabellen“ aus #289.

**Als Vorbild dagegen wertvoll:**

- `/user/managetoken.php` (`require_login()`, `has_capability('moodle/webservice:createtoken', $usercontext)`) zeigt der Lehrkraft ihre eigenen Tokens und erlaubt Zurücksetzen – das ist genau die UI-Form, die Leitfrage 5 für den Widerruf durch die Lehrkraft braucht.
- Das Feldset `userid` / `contextid` / `validuntil` / `iprestriction` / `lastaccess` / `name` ist ein gutes Grundgerüst für die eigene Token-Tabelle.

### 1.4 Bereits vorhandene Infrastruktur in Moodle 5.0 – nützlicher als erwartet

Aus `lib/thirdpartylibs.xml` (`MOODLE_500_STABLE`), alles bereits gevendort und GPL-verträglich:

| Bibliothek | Version | Lizenz |
|---|---|---|
| firebase/php-jwt | 6.11.0 | BSD 3-Clause |
| psr/http-message | 2.0.0 | MIT |
| psr/http-factory, psr/http-server-handler, psr/http-server-middleware | 1.x | MIT |
| guzzlehttp/guzzle | 7.9.2 | MIT |
| slim/slim | 4.13.0 | MIT |
| nikic/fast-route | 1.3.0 | BSD 3-Clause |
| php-di/php-di, php-di/invoker | 7.0.8 / 2.3.6 | MIT |

Das heißt: JWT-Signierung, PSR-7/PSR-15 und ein Routing-Stack sind **ohne** zusätzliche Fremdbibliothek verfügbar. Moodle verlangt ab 5.0 PHP ≥ 8.2.0 (`admin/environment.xml`).

**Aber:** Die [Routing-API](https://moodledev.io/docs/5.0/apis/subsystems/routing) (seit Moodle 4.5, auf Slim + FastRoute) kennt derzeit nur die Routengruppe `api` unter `/api/rest/v2/{component}/{path}`. Für `/.well-known/…` hilft sie nicht (siehe Abschnitt 2.4).

### 1.5 Prior Art

[`webservice_mcp`](https://moodle.org/plugins/webservice_mcp) (onbirdev) im Plugin-Directory: exponiert Moodle-External-Functions als MCP-Tools über JSON-RPC 2.0, Moodle 4.5–5.2, Authentifizierung per Webservice-Token (`wstoken`-Parameter oder `Authorization: Bearer`), ~440 Installationen. **Kein OAuth.** Bestätigt: die Rückfallebene aus #289 ist real erprobt, und OAuth ist der offene Teil.

---

## 2. Was die MCP-Spezifikation verlangt

Grundlage: [Authorization, Fassung 2026-07-28](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization) samt Unterseiten [Authorization Server Discovery](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization/authorization-server-discovery) und [Client Registration](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization/client-registration).

### 2.1 Pflichten

Autorisierung ist insgesamt OPTIONAL; wer HTTP-Transport nutzt, **SHOULD** der Spezifikation folgen. Danach gilt:

**Als Resource Server (der MCP-Endpunkt selbst):**

- „MCP servers **MUST** implement OAuth 2.0 Protected Resource Metadata ([RFC 9728](https://datatracker.ietf.org/doc/html/rfc9728))." Das Dokument **MUST** `authorization_servers` mit mindestens einem Eintrag enthalten.
- Mindestens einer der beiden Auffindungswege **MUST** existieren: `WWW-Authenticate`-Header mit `resource_metadata` auf der 401-Antwort, **oder** das Well-Known-Dokument.
- „MCP servers **MUST** validate that access tokens were issued specifically for them as the intended audience" (RFC 8707). Ungültige/abgelaufene Tokens **MUST** 401 ergeben; 403 bei fehlenden Scopes; Tokens aus fremder Quelle **MUST NOT** akzeptiert oder weitergereicht werden.
- `scope` im `WWW-Authenticate` **SHOULD**.

**Als Authorization Server:**

- „Authorization servers **MUST** implement OAuth 2.1 with appropriate security measures for both confidential and public clients."
- Mindestens ein Discovery-Mechanismus **MUST**: RFC 8414 oder OpenID Connect Discovery 1.0.
- Client ID Metadata Documents (CIMD, [draft-ietf-oauth-client-id-metadata-document-00](https://datatracker.ietf.org/doc/html/draft-ietf-oauth-client-id-metadata-document-00)) **SHOULD**; Dynamic Client Registration (RFC 7591) nur noch **MAY** und ausdrücklich als *deprecated* markiert („retained for backwards compatibility").
- `iss` in der Autorisierungsantwort (RFC 9207) **SHOULD**, mit `authorization_response_iss_parameter_supported: true` in den Metadaten. Die Spezifikation kündigt die Höherstufung auf **MUST** an.

**Aus OAuth 2.1 ([draft-ietf-oauth-v2-1-13](https://datatracker.ietf.org/doc/html/draft-ietf-oauth-v2-1-13)):**

- „Clients **MUST** use `code_challenge` and `code_verifier` and authorization servers **MUST** enforce their use" – PKCE ist Pflicht, nicht Kür.
- „Authorization servers **MUST** reject authorization requests that specify a redirect URI that doesn't exactly match one that was registered, with an exception for loopback redirects."
- Implicit-Grant und Resource-Owner-Password-Grant sind entfernt.
- Refresh-Tokens für Public Clients müssen rotiert oder sender-constrained sein.

**Clientseitig relevant für uns:** Clients **MUST** den `resource`-Parameter (RFC 8707) in Authorization- **und** Token-Request senden, „regardless of whether authorization servers support it". Wir müssen ihn also entgegennehmen und in die Audience-Bindung des Tokens überführen.

### 2.2 Was die Zielclients tatsächlich verlangen

Das ist wichtiger als die Spezifikation, weil #289 „Codex und Claude gleichwertig" setzt.

**Claude** ([Authentication for connectors](https://claude.com/docs/connectors/building/authentication), Anthropic):

- Unterstützt `oauth_dcr` (RFC 7591) und `oauth_cimd` „out of the box", dazu Anthropic-gehaltene Client-Credentials und statische Header (Beta). Reines `client_credentials` ohne Nutzer ist **nicht** unterstützt: „Every connection requires user consent."
- CIMD wird nur gewählt, wenn die AS-Metadaten **beides** melden: `"client_id_metadata_document_supported": true` **und** `"none"` in `token_endpoint_auth_methods_supported`. Sonst Fallback auf DCR.
- PKCE `S256` bei jeder Autorisierungsanfrage; `"code_challenge_methods_supported": ["S256"]` muss in den Metadaten stehen.
- Callback der gehosteten Oberflächen: `https://claude.ai/api/mcp/auth_callback`. **Claude Code** nutzt einen RFC-8252-Loopback mit wechselndem Port und deklariert `http://localhost/callback` und `http://127.0.0.1/callback` in seinem CIMD – „your authorization server must accept both with the port component ignored".
- `/token` muss `application/x-www-form-urlencoded` annehmen, `/register` dagegen `application/json`.
- Refresh: reaktiv auf 401, proaktiv bis 5 Minuten vor Ablauf; bei ungültigem Refresh-Token wird `invalid_grant` erwartet; Rotation gewünscht.
- Zeitlimits: 10 s für Discovery, Registrierung und Token, 30 s für Refresh. Ausgehender Verkehr von Anthropic aus `160.79.104.0/21`.

**Codex:** Die [MCP-Dokumentation](https://learn.chatgpt.com/docs/extend/mcp?surface=cli) nennt Streamable HTTP, OAuth als Standard sowie `mcp_oauth_callback_port` und `mcp_oauth_callback_url`. Der Quellcode (`codex-rs/rmcp-client/src/oauth_client_registration.rs`, Branch `main`) zeigt dieselbe Logik wie bei Claude: CIMD wird nur angeboten, wenn `client_id_metadata_document_supported` **und** Public-Client-Auth (`none`) gemeldet sind und ein Loopback-Callback `…/callback/{callback_id}` genutzt wird – „Prefer a supported native CIMD and otherwise use advertised DCR."

**Wichtige Einschränkung:** Ein *vorregistrierter* Client lässt sich in Codex nicht konfigurieren – [openai/codex#19154](https://github.com/openai/codex/issues/19154) (April 2026, offen): „Codex is attempting Dynamic Client Registration (DCR), while this server/IdP setup works with a pre-registered OAuth client in other MCP clients. […] There is no documented way to provide a per-server static OAuth client id."

**Folgerung für uns:** Trotz Deprecation in der Spezifikation ist **DCR praktisch Pflicht**, wenn ältere Codex-Installationen bedient werden sollen. Der Plan sollte lauten: **CIMD implementieren und bewerben, DCR als Fallback anbieten** (abschaltbar durch den Admin).

### 2.3 Mindest-Checkliste für `local_kurspilot`

| # | Artefakt | Norm | Anmerkung |
|---|---|---|---|
| 1 | `401` + `WWW-Authenticate: Bearer resource_metadata="…", scope="…"` | MUST/SHOULD | Claude honoriert den Header nur auf `401`, nicht auf `200` |
| 2 | Protected Resource Metadata (`resource`, `authorization_servers`, `scopes_supported`) | MUST | `resource` muss exakt der URL entsprechen, die die Lehrkraft im Client einträgt |
| 3 | AS-Metadata nach RFC 8414 inkl. `code_challenge_methods_supported: ["S256"]`, `token_endpoint_auth_methods_supported: ["none"]`, `client_id_metadata_document_supported: true`, `authorization_response_iss_parameter_supported: true` | MUST | |
| 4 | `/authorize` – Auth-Code, PKCE S256, exakter Redirect-Vergleich (Loopback portagnostisch), `resource`, `state`, `iss` in der Antwort | MUST | |
| 5 | `/token` – Code-Tausch + Refresh mit Rotation, `form-urlencoded`, RFC-6749-Fehlercodes | MUST | |
| 6 | CIMD-Auflösung (client_id = HTTPS-URL abrufen, `client_id` gegen URL prüfen, `redirect_uris` prüfen, cachen) | SHOULD | braucht ausgehendes HTTPS vom Moodle-Server |
| 7 | `/register` (RFC 7591) | MAY, praktisch nötig | für Codex; Missbrauchsschutz nötig |
| 8 | Audience-Prüfung des Tokens gegen `resource` | MUST | |
| 9 | Consent-Screen mit Client-Name und Redirect-Host | Sicherheitsanforderung | Loopback-Warnung |

### 2.4 Das `.well-known`-Problem – der eigentliche Knackpunkt

RFC 9728 und RFC 8414 konstruieren die Metadaten-URL, indem sie `/.well-known/<suffix>` **zwischen Host und Pfad** einschieben:

- Ressource `https://moodle.example/local/kurspilot/mcp` → `https://moodle.example/.well-known/oauth-protected-resource/local/kurspilot/mcp`
- Issuer `https://moodle.example/local/kurspilot` → `https://moodle.example/.well-known/oauth-authorization-server/local/kurspilot`

Beide liegen am **Host-Root**. Ein Moodle-Plugin darf dort keine Dateien anlegen: der Plugin-Installer schreibt ausschließlich in das Plugin-Verzeichnis, und die Routing-API bedient nur `/api/rest/v2/…`. Im Moodle-Root existiert kein `.well-known`-Verzeichnis (geprüft für `MOODLE_500_STABLE`; `main` verlagert den Docroot nach `public/`, ändert an der Zuständigkeit aber nichts).

Teilentwarnung für Punkt 2 der Checkliste: Anthropic dokumentiert ausdrücklich, dass „the `resource_metadata` URL doesn't have to be on the MCP server's origin; it can be any HTTPS location that serves the JSON document" – gedacht für Plattformen, die `/.well-known/*` nicht ausliefern können. Damit lässt sich die **Protected Resource Metadata** an `https://moodle.example/local/kurspilot/oauth/protected-resource.php` hängen. (RFC 9728 §3 verlangt das Well-Known-Dokument strenggenommen trotzdem – „MUST make a JSON document […] available at a URL formed by inserting a well-known URI string" –, der Header-Weg ist die pragmatische Abkürzung.)

Für die **AS-Metadaten** gilt das nicht: „Your authorization server must serve its own discovery metadata […] at its `/.well-known/` paths." Der Client konstruiert die URL selbst aus dem Issuer. Es bleiben drei Optionen:

1. **Webserver-Rewrite** in der Installationsanleitung (Apache `RewriteRule` / nginx `location`), die `/.well-known/oauth-authorization-server/...` auf `/local/kurspilot/oauth/as-metadata.php` abbildet. Funktioniert überall, ist aber eine Instanz-Annahme und ein Hindernis für die Plugin-Directory-Tauglichkeit.
2. **OIDC-Pfadanhängung ausnutzen:** Die MCP-Discovery-Reihenfolge erlaubt als dritte Variante `https://moodle.example/local/kurspilot/.well-known/openid-configuration`. Das liegt innerhalb des Plugins – erfordert aber, dass eine erweiterungslose Datei als PHP ausgeliefert wird, also wiederum eine Webserver-Regel oder eine `.htaccess`, was Moodle nicht vorsieht. Zudem verlässt man sich auf die dritte Priorität der Client-Suchreihenfolge.
3. **Core-Beitrag:** ein `.well-known`-Dispatcher in Moodle vorschlagen (Tracker). Langfristig richtig, für dieses Vorhaben zu langsam.

**Empfehlung:** Variante 1 einplanen, sauber dokumentieren, und Variante 3 als Tracker-Issue nebenher anstoßen. Der Punkt gehört als Risiko in die Spec zu #289, weil er die Zusage „keine Instanz-Annahmen“ berührt.

---

## 3. Bibliothek oder Eigenbau

### 3.1 `league/oauth2-server`

- Version 9.4.1 (Juni 2026), **MIT** – GPLv3-kompatibel, also für das Moodle-Plugin-Directory zulässig. Aktiv gepflegt, ~6.700 Sterne. PHP `~8.2 || ~8.3 || ~8.4 || ~8.5` – passt zu Moodle 5.0 (PHP ≥ 8.2).
- **Deckt ab:** `AuthCodeGrant` (mit PKCE über `CodeChallengeVerifiers`), `RefreshTokenGrant`, `ClientCredentialsGrant`, `DeviceCodeGrant`, `ResourceServer`, PSR-7-Middleware.
- **Deckt nicht ab** (Verzeichnisliste von `src/` geprüft): RFC 9728, RFC 8414, RFC 7591/CIMD, `iss` nach RFC 9207, `resource`/Audience-Bindung nach RFC 8707, Consent-Oberfläche. Alles, was MCP über OAuth hinaus verlangt, bleibt Handarbeit.
- **Kosten:** vier Bibliotheken, die Moodle **nicht** mitbringt, müssten in das Plugin kopiert werden – `league/event ^3.0`, `league/uri ^7.8`, `lcobucci/jwt ^5.6`, `defuse/php-encryption ^2.4` (plus deren transitive Abhängigkeiten). Vorhanden sind immerhin `psr/http-message ^2.0`, `psr/http-server-middleware`, `psr/clock`.
- Moodle verlangt für beigelegte Bibliotheken: GPLv3-kompatible Lizenz, Ablage „into a sub folder in your plugin", Eintrag in `thirdpartylibs.xml` ([Third-party libraries, Plugin contribution](https://moodledev.io/general/community/plugincontribution/thirdpartylibraries)). Ein Composer-Autoloader steht im Plugin-Kontext nicht bereit; das Laden muss selbst organisiert werden (Einschätzung, nicht dokumentiert).
- Zusätzlich sind sechs Repository-Interfaces gegen `$DB` zu implementieren (Client, AccessToken, AuthCode, RefreshToken, Scope, User).

### 3.2 `bshaffer/oauth2-server-php`

MIT, aber letzter Release `v1.14.2` vom März 2025 und ein Design aus der OAuth-2.0-Ära ohne PKCE-First. **Nicht empfohlen.**

### 3.3 Umfang eines Eigenbaus

Was tatsächlich zu schreiben ist – mit Moodle-Bordmitteln (`random_bytes`, `hash('sha256', …)`, `$DB`, `require_login`, `require_sesskey`, optional `firebase/php-jwt` aus dem Core):

| Baustein | grobe Größe |
|---|---|
| `/authorize` inkl. Consent-Formular und Template | ~250 Zeilen |
| `/token` (Code-Tausch, Refresh mit Rotation, Fehlercodes) | ~180 Zeilen |
| `/register` (DCR) + CIMD-Auflösung inkl. Cache | ~200 Zeilen |
| Zwei Metadaten-Dokumente | ~80 Zeilen |
| Resource-Server-Prüfung (Bearer, Hash-Lookup, Audience, Scope, 401/403) | ~120 Zeilen |
| Tabellen, Upgrade, Privacy-Provider, Scheduled Task | ~250 Zeilen |
| **Summe** | **~1.100 Zeilen PHP** |

Davon würde `league` grob 300–400 Zeilen ersetzen – und dafür rund 15.000 Zeilen Fremdcode ins Plugin holen, die bei jedem Sicherheitsupdate nachgezogen werden müssen.

### 3.4 Empfehlung

> **Eigenbau, opake Tokens, keine zusätzliche Fremdbibliothek.**

Begründung:

1. **Deckungsgrad.** Die Bibliothek löst den kleineren Teil des Problems; die MCP-spezifischen Dokumente und die Audience-Bindung bleiben ohnehin Eigenarbeit.
2. **Wartungslast.** Vier zusätzlich gevendorte Bibliotheken sind im Plugin-Directory eine dauerhafte Verpflichtung (Lizenzpflege, `thirdpartylibs.xml`, Sicherheitsupdates) – bei einem Schul-Plugin mit einer Betreuungsperson ein reales Risiko.
3. **Moodle-Idiome.** `league` erwartet PSR-7-Requests, eigenes DI und eigene Entity-Klassen; die Impedanz zu `$DB`, `optional_param()` und `require_login()` erzeugt Klebecode, der selbst geprüft werden muss.
4. **Prüfbarkeit.** ~1.100 überschaubare Zeilen sind für einen Security-Review und für einen Plugin-Directory-Review leichter zu vertreten als ein halbverstandener Framework-Einsatz.

**Wann die Entscheidung revidiert gehört:** sobald mehrere Resource Server, JWT-Access-Tokens für zustandslose Prüfung, Device-Code-Flow oder DPoP gebraucht werden. Dann ist `league` der richtige Weg.

**Nicht verhandelbar unabhängig von der Wahl:** PKCE S256 erzwingen, Auth-Code einmalig und kurzlebig, Redirect-URI exakt (Loopback portagnostisch), Refresh-Rotation, Tokens nur als Hash speichern.

---

## 4. Login-Anbindung und Consent

Das gesuchte Muster ist bereits im Core: `mod/lti/auth.php` ist ein Autorisierungsendpunkt, der eine normale Moodle-Seite ist und mit `isloggedin()` / `require_login()` arbeitet. Moodle leitet nicht angemeldete Aufrufe auf `/login/index.php` – und damit greift **automatisch** die Authentifizierung der Instanz: LDAP, SSO, OIDC, moin.schule, Shibboleth. Das Plugin muss dafür **nichts** tun und darf insbesondere kein eigenes Login bauen.

Konkret für `local/kurspilot/oauth/authorize.php`:

```
1. Parameter lesen (client_id, redirect_uri, code_challenge, code_challenge_method,
   state, scope, resource) – Validierung vor jeder Nutzerinteraktion.
2. require_login(null, false);                       // Systemkontext, kein Kurs
3. require_capability('local/kurspilot:remoteaccess', context_system::instance());
4. Client auflösen: CIMD-URL abrufen ODER registrierten Client laden.
5. redirect_uri exakt gegen die Client-Metadaten prüfen (Loopback: Port ignorieren).
6. Bestehende Einwilligung? -> direkt Code ausstellen. Sonst Consent-Formular
   (moodleform, sesskey) mit Client-Name, Redirect-Host, angefragten Scopes.
7. Code erzeugen (32 Byte, gehasht gespeichert, <=60 s, einmalig, gebunden an
   client_id + redirect_uri + code_challenge + resource + userid).
8. Redirect auf redirect_uri mit code, state und iss.
```

Details, die erfahrungsgemäß beißen:

- **`NO_MOODLE_COOKIES`** für `/token`, `/register`, die Metadaten-Endpunkte und den MCP-Endpunkt selbst – wie in `mod/lti/token.php`. Sonst startet Moodle für jeden API-Aufruf eine Session und die Cookie-Authentifizierung konkurriert mit dem Bearer-Token.
- **Consent-Anzeige:** Die MCP-Spezifikation verlangt, den Redirect-URI-Host auf dem Consent-Screen deutlich anzuzeigen und bei ausschließlich Loopback-URIs zusätzlich zu warnen (Client ID Metadata Document Security). Das betrifft genau Claude Code und Codex.
- **Theme und Sprache** erbt der Consent-Screen kostenlos, weil es eine normale Moodle-Seite ist – für die Zielgruppe Kollegium ein spürbarer Vorteil gegenüber einem fremden Login.
- **Ausgehendes HTTPS:** CIMD verlangt, dass der Moodle-Server die Client-Metadaten-URL abruft (z. B. `https://claude.ai/oauth/claude-code-client-metadata`). In Schulnetzen mit restriktivem Egress und mit Moodles cURL-Sicherheitsprüfungen (`curlsecurityblockedhosts`, `curlsecurityallowedport`) ist das zu testen. Fällt CIMD aus, bleibt DCR.
- **Kein zweites Rechtemodell:** Wie in #289 festgelegt – `local/kurspilot:remoteaccess` als separates Fernzugriffsrecht (Admin-Kill-Switch), zusätzlich zur Nutzungs-Capability; jeder Tool-Call prüft danach `require_capability()` im jeweiligen Kurskontext.

---

## 5. Tokenverwaltung

### 5.1 Tabellen (additiv, `local_kurspilot_*`)

| Tabelle | Zweck | Wesentliche Felder |
|---|---|---|
| `..._oauth_client` | dynamisch registrierte Clients (DCR) | `clientid`, `client_name`, `redirect_uris`, `grant_types`, `token_endpoint_auth_method`, `timecreated`, `createdby` |
| `..._oauth_code` | Authorization-Codes | `codehash`, `clientid`, `userid`, `redirecturi`, `codechallenge`, `resource`, `scopes`, `expires`, `used` |
| `..._oauth_token` | Access- und Refresh-Tokens | `tokenhash`, `type`, `clientid`, `userid`, `scopes`, `resource`, `expires`, `lastaccess`, `revoked`, `parentid` (Rotationskette) |
| `..._oauth_consent` | erteilte Einwilligungen | `userid`, `clientid`, `scopes`, `timecreated` |

### 5.2 Speicherung

- **Nur Hash speichern:** `hash('sha256', $token)`, plus ein kurzes, nicht geheimes Präfix als Suchschlüssel. Klartext existiert genau einmal in der HTTP-Antwort. Das ist bewusst **anders** als `external_tokens` im Core, das Klartext speichert.
- **Entropie:** `random_bytes(32)`, base64url. Ausdrücklich nicht `md5(uniqid(rand()))` wie in `\core_external\util::generate_token()`.
- Authorization-Codes ebenfalls nur als Hash.

### 5.3 Lebensdauern

| Artefakt | Vorschlag | Begründung |
|---|---|---|
| Authorization-Code | 60 s, einmalig | OAuth 2.1 |
| Access-Token | 30–60 min | Claude refresht proaktiv 5 min vor Ablauf; kürzere Zeiten erzeugen unnötigen Verkehr |
| Refresh-Token | 60–90 Tage, gleitend | Rotation bei jeder Nutzung, alter Token sofort ungültig; Wiederverwendung eines rotierten Tokens ⇒ ganze Kette widerrufen (Diebstahlserkennung) |

Bei ungültigem Refresh-Token **`invalid_grant`** zurückgeben – Claude wertet abweichende Codes nicht als „neu anmelden“.

### 5.4 Bindung und Rechteprüfung

Jedes Token trägt `userid`, `clientid`, `scopes` und `resource` (Audience). Ablauf pro Tool-Call:

1. Bearer-Token hashen, Datensatz laden, Ablauf/Widerruf prüfen.
2. `resource` gegen die eigene kanonische URL prüfen (RFC 8707) – sonst 401.
3. Nutzer laden, prüfen dass aktiv/nicht gesperrt, `\core\session\manager::set_user()`.
4. `require_capability('local/kurspilot:remoteaccess', context_system::instance())` – **bei jedem Aufruf**, damit Entzug sofort wirkt.
5. `require_capability()` im Kurskontext pro Tool.
6. Scope-Prüfung; fehlt einer: 403 mit `WWW-Authenticate: Bearer error="insufficient_scope", scope="…"`.

### 5.5 Widerruf

- **Lehrkraft:** eigene Seite nach Vorbild `/user/managetoken.php` – Liste der verbundenen Clients mit Name, Erteilungsdatum, letztem Zugriff und Knopf „Verbindung trennen“ (löscht Consent + alle Tokens des Clients für diesen Nutzer).
- **Admin:** Report über alle Verbindungen (Filter Nutzer/Client), Einzelwiderruf, globaler Kill-Switch. Zusätzlich: Entzug der Capability `local/kurspilot:remoteaccess` (Rollenebene) wirkt durch Schritt 4 sofort, ohne dass Tokens angefasst werden müssen.
- **Automatisch:** Event-Observer auf `\core\event\user_deleted` und Sperrung/Auth-Wechsel ⇒ Tokens löschen. Scheduled Task räumt abgelaufene Codes und Tokens ab.
- **Protokollierung:** Moodle-Events für `token_issued`, `token_refreshed`, `token_revoked`, `consent_granted` – Grundlage für die in #289 noch offene Auditierung.

### 5.6 Pflichtbeiwerk fürs Plugin-Directory

`\core_privacy`-Provider für die neuen Tabellen (Tokens sind personenbezogen), Sprachdateien deutsch/englisch, `db/access.php` mit beiden Capabilities, Behat/PHPUnit.

---

## 6. Aufwandsschätzung

Annahme: eine erfahrene Person, Moodle-Plugin-Erfahrung vorhanden, OAuth-Server-Erfahrung nicht.

### Spike („trägt es überhaupt?“)

| Paket | Tage |
|---|---|
| Tabellen, Capability, Grundgerüst, `NO_MOODLE_COOKIES`-Endpunkte | 0,5 |
| `/authorize` mit `require_login()` + minimalem Consent | 0,5 |
| `/token` mit Code-Tausch und PKCE-Prüfung | 0,5 |
| Metadaten-Dokumente + `401`/`WWW-Authenticate` | 0,5 |
| DCR-Endpunkt (minimal) | 0,5 |
| `.well-known`-Rewrite auf der Testinstanz, echter Verbindungsaufbau, Debugging der Client-Eigenheiten | **1,5–2,5** |
| **Summe Spike** | **3–5 Tage** |

> Der letzte Posten ist der unsichere. Erfahrungsgemäß geht die Hälfte der Zeit für Discovery-Feinheiten und Redirect-URI-Details drauf. **Ein Wochenende reicht nicht**, ein verlängertes Wochenende plus eine Woche Abende ist realistisch – und nur, wenn der Streamable-HTTP-Transport aus #289 schon getrennt geklärt ist.

### Produktionsreife (zusätzlich)

| Paket | Tage |
|---|---|
| CIMD-Auflösung inkl. Cache, Trust-Policy, Egress-Behandlung | 2 |
| Refresh-Rotation, Diebstahlserkennung, Fehlercodes nach RFC 6749 | 1,5 |
| Consent-UI ausgearbeitet (Client-Name, Redirect-Host, Loopback-Warnung, Scopes) | 1,5 |
| Widerruf: Lehrkraft-Seite, Admin-Report, Kill-Switch, Event-Observer, Scheduled Task | 3 |
| Privacy-Provider, Sprachdateien, `db/access.php`, Einstellungen | 1,5 |
| Tests: PHPUnit für Grants und Prüfungen, Behat für Consent | 3 |
| Security-Review und Nacharbeit | 2 |
| Doku (Admin-Rewrite, Lehrkraft-Anleitung, README) | 1,5 |
| **Summe zusätzlich** | **~16 Tage** |

**Gesamt bis produktionsreif: 15–25 Personentage** – also mehrere Wochen, nicht ein Wochenende. Die Antwort auf Leitfrage 6 lautet klar: **mehrere Wochen.**

---

## 7. Risiken

| Risiko | Wirkung | Gegenmaßnahme |
|---|---|---|
| `/.well-known/` erfordert Webserver-Eingriff | bricht „Plugin-Directory-tauglich, keine Instanz-Annahmen“ | Rewrite dokumentieren; Core-Tracker-Issue anstoßen; Protected-Resource-Metadaten über den Header-Weg ausliefern |
| Offener DCR-Endpunkt an einer Schul-Moodle-Instanz | Registrierungsflut, Datenmüll | admin-abschaltbar, Rate-Limit, TTL für unbenutzte Registrierungen, CIMD bevorzugen |
| Client-Eigenheiten (Codex ohne statischen Client, Timeouts, Redirect-Portlogik) | Verbindungsaufbau scheitert unspezifisch | beide Zielclients früh im Spike testen; DCR **und** CIMD anbieten |
| Eigenbau-Kryptografie/Flow-Fehler | Sicherheitslücke in einer Schulinstanz | enge Umsetzung entlang OAuth 2.1; `/security-review` als Pflichtschritt vor Pilot |
| CIMD-Abruf durch Egress-Filter blockiert | CIMD fällt aus | DCR-Fallback, klare Fehlermeldung, Doku |
| Streamable HTTP aus PHP | ganze Karte hängt daran | eigenes Ticket in #289, **vor** dem OAuth-Ausbau klären |

---

## 8. Offene Punkte

- **Transport** (Streamable HTTP/SSE aus PHP) ist nicht Gegenstand dieser Recherche und bleibt der harte Machbarkeitspunkt aus #289.
- Ob ein `.well-known`-Dispatcher als Core-Beitrag Chancen hat – Tracker-Recherche steht aus.
- Enterprise Managed Auth (Anthropic) als späterer Komfortpfad für SSO-Schulen – nicht bewertet.
- Ob DCR nach der Deprecation mittelfristig aus Claude/Codex verschwindet; dann wäre CIMD alleiniger Weg.

---

## Quellen

**MCP-Spezifikation**
- [Versioning](https://modelcontextprotocol.io/specification/versioning) – aktuelle Fassung `2026-07-28`
- [Authorization (2026-07-28)](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization)
- [Authorization Server Discovery](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization/authorization-server-discovery)
- [Client Registration](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization/client-registration)

**RFCs und Drafts**
- [OAuth 2.1, draft-ietf-oauth-v2-1-13](https://datatracker.ietf.org/doc/html/draft-ietf-oauth-v2-1-13)
- [RFC 9728 – Protected Resource Metadata](https://www.rfc-editor.org/rfc/rfc9728.html)
- [RFC 8414 – Authorization Server Metadata](https://www.rfc-editor.org/rfc/rfc8414.html)
- [RFC 7591 – Dynamic Client Registration](https://datatracker.ietf.org/doc/html/rfc7591)
- [RFC 8707 – Resource Indicators](https://www.rfc-editor.org/rfc/rfc8707.html)
- [RFC 9207 – Authorization Server Issuer Identification](https://datatracker.ietf.org/doc/html/rfc9207)
- [draft-ietf-oauth-client-id-metadata-document-00](https://datatracker.ietf.org/doc/html/draft-ietf-oauth-client-id-metadata-document-00)

**Moodle (Quellcode `MOODLE_500_STABLE`, direkt gelesen)**
- [`lib/db/install.xml`](https://github.com/moodle/moodle/blob/MOODLE_500_STABLE/lib/db/install.xml) – `external_tokens`, `oauth2_*`
- [`lib/external/classes/util.php`](https://github.com/moodle/moodle/blob/MOODLE_500_STABLE/lib/external/classes/util.php) – `generate_token()`
- [`webservice/lib.php`](https://github.com/moodle/moodle/blob/MOODLE_500_STABLE/webservice/lib.php) – Tokenprüfung
- [`user/managetoken.php`](https://github.com/moodle/moodle/blob/MOODLE_500_STABLE/user/managetoken.php) – Nutzer-Tokenverwaltung
- [`mod/lti/auth.php`](https://github.com/moodle/moodle/blob/MOODLE_500_STABLE/mod/lti/auth.php), [`mod/lti/token.php`](https://github.com/moodle/moodle/blob/MOODLE_500_STABLE/mod/lti/token.php) – Autorisierungs- und Token-Endpunkt im Core
- [`lib/thirdpartylibs.xml`](https://github.com/moodle/moodle/blob/MOODLE_500_STABLE/lib/thirdpartylibs.xml) – gevendorte Bibliotheken
- [`admin/environment.xml`](https://github.com/moodle/moodle/blob/MOODLE_500_STABLE/admin/environment.xml) – PHP ≥ 8.2.0 für Moodle 5.0

**Moodle-Dokumentation**
- [OAuth 2 API](https://docs.moodle.org/dev/OAuth_2_API)
- [Routing API (5.0)](https://moodledev.io/docs/5.0/apis/subsystems/routing)
- [Third-party libraries (Plugin contribution)](https://moodledev.io/general/community/plugincontribution/thirdpartylibraries)
- [Plugin `webservice_mcp`](https://moodle.org/plugins/webservice_mcp)

**Client-Verhalten**
- [Authentication for connectors (Anthropic)](https://claude.com/docs/connectors/building/authentication)
- [Get started with custom connectors using remote MCP (Anthropic)](https://support.claude.com/en/articles/11175166-about-custom-connectors-remote-mcp)
- [Codex: Model Context Protocol](https://learn.chatgpt.com/docs/extend/mcp?surface=cli)
- [`codex-rs/rmcp-client/src/oauth_client_registration.rs`](https://github.com/openai/codex/blob/main/codex-rs/rmcp-client/src/oauth_client_registration.rs) – CIMD-Bedingungen, DCR-Fallback
- [openai/codex#19154](https://github.com/openai/codex/issues/19154) – kein vorregistrierter Client konfigurierbar (offen, April 2026)

**Bibliotheken**
- [`thephpleague/oauth2-server`](https://github.com/thephpleague/oauth2-server) – 9.4.1, MIT, `composer.json` und `src/`-Struktur geprüft
- [`bshaffer/oauth2-server-php`](https://github.com/bshaffer/oauth2-server-php) – MIT, letzter Release v1.14.2 (2025-03)
