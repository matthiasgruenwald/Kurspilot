# opencode als bereitgehaltener Client

Kurspilot verbindet Claude und Codex per stdio mit der Moodle-REST-API. In der
Praxis stossen beide Clients wiederholt an Token-Limits; ausserdem wuenscht sich
der Maintainer Zugriff auf mehr Modelle und groessere Kontextfenster. opencode
(CLI/TUI und Desktop-App, via `opencode.json` konfigurierbar) loest beides, weil
es beliebige Provider/Modelle anbindet. Der gleiche Schmerz wird frueher oder
spaeter auch beim Kollegium erwartet - deshalb wird opencode jetzt vorbereitet,
ohne den Golden Path zu aendern.

## Optionen

- **Nur persoenlicher Power-User-Client** (manuelle `opencode.json`, am
  Setup-/Installer-Apparat vorbei): minimaler Fussabdruck, aber zu kurz
  gegriffen - Kollegen bekommen den Schmerz spaeter auch, und ein spaeteres
  Nachruesten in die Setup-Logik waere teurer als das jetzige Mitdenken.
- **Voller dritter Kollegiums-Client mit Bewerbung** (opencode wird neben Codex
  als empfohlener Weg der Fortbildung kommuniziert): verletzt **Codex-First**
  und die Zielgruppen-Annahme - opencode ist CLI-first und BYO-Provider, fuer
  nicht-technische Lehrkraefte in V1 nicht passend.
- **Bereitgehaltener Client** (Mittelweg): volle funktionale Paritaet zu
  Codex/Claude im Setup-/Installer-Apparat, aber keine Bewerbung als
  empfohlener Kollegiumsweg; **Codex-First** bleibt das V1-Versprechen.

## Entscheidung

opencode wird als **Bereitgehaltener Client** unterstuetzt: funktional
gleichberechtigt (Erkennung, Konfiguration, Skills, Aktivitaets-MCPs,
Installer-Auswahl und Installationslink im Blocker), aber nicht der beworbene
Standardweg der Fortbildung. **Codex-First** bleibt unberuehrt.

Paritaet bedeutet konkret: keine kuenstliche Beschneidung. Wer opencode
installiert hat, hat sich bewusst entschieden - Erkennung bedeutet daher
Vorauswahl im Installer (wie bei Codex/Claude, `lib/setup-render.js`), und der
Client-Installationsblocker fuehrt einen opencode-Installationslink neben den
bestehenden Links fuer Codex und Claude (`OFFICIAL_INSTALL_LINKS` in
`lib/setup-flow.js`). Was opencode *nicht* bekommt, ist Kommunikation als
empfohlener Kollegiumsweg (README/Fortbildung fuehren weiter mit Codex).

Konfiguration liegt **global** (`~/.config/opencode/opencode.json`), nicht pro
Projekt - analog zu `~/.codex/config.toml` und `claude_desktop_config.json`.
Begruendung: Kurspilot-Arbeit ist Multi-Projekt (in der Regel ein Projekt pro
**Unterrichtseinheit**); eine projektlokale Provider-Config muesste jeder
Kurs-Ordner neu tragen. Der Schreibzugriff nutzt die bestehende Merge-Semantik
(`lib/mcp-config-setup.js`): Kurspilot-Eintraege werden gemergt, alle fremden
Top-Level-Keys und fremden `mcp`-/Provider-Eintraege bleiben erhalten. opencode
selbst merged globale und projektlokale Config, beides koexistiert also.

Secrets (Provider-API-Keys) liegen **ausserhalb** jeder Config, die Kurspilot
beruehrt: opencode unterstuetzt `{file:...}`- und `{env:...}`-Substitution in
`provider.*.options.apiKey`. Kurspilot liest oder schreibt niemals
Provider-/Secret-Felder und fasst keine Projekt-`opencode.json` an.

Skills folgen der bestehenden Adapter-Architektur (`lib/skill-install.js`):
opencode erhaelt einen dritten Adapter-Satz (Quelle `.opencode/skills/`,
nutzerweites Ziel `~/.config/opencode/skills/`, analog `~/.claude/skills` bzw.
`~/.codex/skills`), der auf denselben gemeinsamen Kern (`skills/*.md`) verweist.

Plattformen: macOS, Linux und Windows von Beginn an (Verifikation u.a. via
Parallels), analog zur bestehenden Client-Erkennung.

## Konsequenzen

- `lib/setup-flow.js`: `defaultDetectClients` erkennt opencode zusaetzlich
  (CLI auf PATH oder globaler Config-Dir); die binaere Logik
  `client === 'codex' ? '.codex' : '.claude'` (auch in `lib/update-check.js`)
  wird eine echte Drei-Wege-Abbildung. `OFFICIAL_INSTALL_LINKS` erhaelt einen
  opencode-Eintrag (Ziel-URL noch zu klaeren).
- `lib/mcp-config-setup.js`: neuer `setupOpenCodeConfig`-Writer mit derselben
  Merge-/Backup-Semantik wie `setupClaudeDesktopConfig`/`setupCodexConfig`,
  Ziel `~/.config/opencode/opencode.json`.
- `lib/skill-install.js` / `lib/update-check.js`: dritter Skill-Zielort
  `~/.config/opencode/skills/`; Adapter-Quelle `.opencode/skills/`.
- `lib/setup-render.js` / `lib/setup-browser-server.js`: opencode als Client in
  Auswahl/Status; Vorauswahl bei Erkennung; Installationslink im Blocker.
- Integration streng nach `/ponytail` in die bestehende Adapter-/Setup-Logik -
  kein Redesign, keine Sonderpfade ausser der Drei-Wege-Abbildung.
- Keine Auswirkung auf das PHP-Plugin und die MCP-Server selbst (stdio-Protokoll
  ist client-agnostisch); alle drei Server (core/fragensammlung/quiz) stehen
  opencode wie Codex/Claude zur Auswahl.
