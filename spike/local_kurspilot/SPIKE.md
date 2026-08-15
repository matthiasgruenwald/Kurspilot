# Spike: MCP-Endpunkt aus einem Moodle-Plugin

Wegwerfcode zu [#294](https://github.com/matthiasgruenwald/moodle-coursepilot/issues/294),
Karte [#289](https://github.com/matthiasgruenwald/moodle-coursepilot/issues/289).
**Kein Produktionscode** — wird verworfen oder neu geschrieben, sobald die Spec (#301) steht.

## Was drin ist

| Datei | Zweck |
|---|---|
| `mcp.php` | Der ganze Endpunkt: POST-only, JSON-Antwort, zustandslos, dual-era |
| `classes/external/list_courses.php` | Das eine Lese-Tool (Kursliste der Lehrkraft) |
| `db/services.php` | Externe Funktion + externer Dienst `kurspilot_spike` (nur zur Token-Ausgabe) |
| `db/access.php` | `local/kurspilot:use`, `CONTEXT_COURSE`, `teacher`/`editingteacher` |

Auth ist ein Moodle-Webservice-Token als `Authorization: Bearer` — die bewusste
Spike-Krücke. Im Produkt ersetzt OAuth 2.1 das vollständig (#291, #292).

## Aufbau des Endpunkts

```php
define('WS_SERVER', true);        // setzt NO_MOODLE_COOKIES implizit
define('NO_DEBUG_DISPLAY', true);
require(__DIR__ . '/../../config.php');
```

`WS_SERVER` ist **nicht optional**: `external_api::call_external_function()`
wirft bei `NO_MOODLE_COOKIES && !WS_SERVER` hart `servicerequireslogin`
(`lib/external/classes/external_api.php`, Zeile 216).

Behandelte Methoden — Legacy-Ära: `initialize`, `notifications/initialized`
(→ 202), `ping`. Moderne Ära: `server/discover`. Beide: `tools/list`,
`tools/call`. Unbekannte Methode → 404 + `-32601`. `GET`/`DELETE` → 405.

## Ergebnis: trägt

Verifiziert am 15.08.2026 gegen `https://spike.gruenwald.fun` (Moodle 5.0.8
hinter Cloudflare-Tunnel + Apache/PHP-FPM):

| Prüfung | Ergebnis |
|---|---|
| `GET` | 405 + `Allow: POST` |
| `initialize` (Legacy) | 200, Protokollversion gespiegelt |
| `server/discover` (modern) | 200 |
| `tools/list` ohne Token | 401 + `WWW-Authenticate: Bearer` |
| `tools/list` mit Token | 200, ein Tool |
| `tools/call` | 200, 9 Kurse der Lehrkraft |
| `notifications/initialized` | 202 |
| `subscriptions/listen` | 404 + `-32601` |
| fremder `Origin` | 403 |
| **Echter Client (Codex CLI)** | Verbindung, `tools/list`, Tool-Call erfolgreich |

### Wo es *nicht* geklemmt hat

- **`Authorization`-Header kommt an.** Cloudflare-Tunnel → Apache → PHP reicht
  ihn durch; der `REDIRECT_HTTP_AUTHORIZATION`-Fallback wurde nicht gebraucht
  (steht trotzdem drin, weil andere Schulinstanzen anders konfiguriert sind).
- **Kein Session-Lock.** 5 parallele `tools/call` derselben Lehrkraft: 1,2 s
  Wanduhr statt ~2,5 s bei Serialisierung. Bestätigt den Befund aus #290 —
  cookiefrei heißt keine Session, kein Lock.
- **Keine instanzweite Server-Konfiguration.** Kein Puffer-, Timeout- oder
  FPM-Eingriff nötig. Bestätigt #290.

### Antwortzeiten

`tools/call` 0,48–0,67 s über den Tunnel (5 Läufe), `initialize` 0,50 s,
`tools/list` 0,65 s. Im Codex-CLI fühlt sich das wie ein normaler Tool-Call an,
kein Warten. Deutlich unter dem 5-s-Vorgabe-Timeout von opencode (#292).

## Was der Spike offengelassen hat

- **Claude Web/Desktop/Cowork wurde nicht getestet** — geht mit statischem
  Bearer prinzipiell nicht (#292). Erst nach dem OAuth-Server prüfbar.
- **Header-Validierung `Mcp-Method`/`Mcp-Name`** (Pflicht ab 2026-07-28,
  inkl. Base64-Sentinel) ist nicht implementiert. Reale Clients schicken sie
  heute nicht.
- **Origin-Allowlist ist geraten** (`wwwroot`, `claude.ai`, `chatgpt.com`).
  Die Spec muss festlegen, wie ein Admin das pflegt.
- **`admin/cli/upgrade.php` bricht auf der Spike-Instanz am Ende ab** —
  verwaistes `portfolio_exaport` aus dem Restore-Dump, nichts mit dem Plugin
  zu tun. Plugin-Upgrade selbst läuft vorher sauber durch.
