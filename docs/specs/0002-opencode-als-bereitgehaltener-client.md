# Spezifikation: opencode als bereitgehaltener Client

> Kanonische Fassung als Issue: [#178](https://github.com/matthiasgruenwald/Kurspilot/issues/178).
> Entscheidungsgrundlage: [ADR 0009](../adr/0009-opencode-als-bereitgehaltener-client.md).
> Glossar: **Bereitgehaltener Client**, **Codex-First** (CONTEXT.md).

## Problem Statement

Als Lehrkraft (und zuerst als Maintainer) stosse ich mit Claude und Codex wiederholt an Token-Limits und habe zu wenig Auswahl an Modellen und Kontextfenstern. Ich moechte Kurspilot zusaetzlich in opencode (CLI/TUI und Desktop-App) nutzen, weil opencode beliebige Provider und damit mehr Modelle und groessere Kontextfenster anbindet. Heute laesst sich Kurspilot nur fuer Codex und Claude zuverlaessig einrichten.

## Solution

Kurspilot unterstuetzt opencode als **Bereitgehaltenen Client**: funktional voll gleichberechtigt mit Codex und Claude (Erkennung, globale Konfiguration, alle Skills und Aktivitaets-MCPs, Auswahl im Konfigurator, Installationslink im Blocker), aber nicht als beworbener Standardweg der Fortbildung. **Codex-First** und der Golden Path bleiben unberuehrt. Die Einrichtung laeuft ueber denselben Setup-/Installer-Apparat; es gibt keine kuenstliche Reibung fuer jemanden, der opencode bereits installiert hat.

## User Stories

1. Als Maintainer moechte ich Kurspilot in opencode mit demselben Feature-Umfang wie in Codex/Claude nutzen, so dass ich nicht an Token-Limits gebunden bin.
2. Als Lehrkraft mit installiertem opencode moechte ich, dass der Konfigurator opencode automatisch erkennt und vorauswaehlt, so dass ich ohne Zusatzschritte loslegen kann.
3. Als Lehrkraft moechte ich, dass meine vorhandenen Provider-/Modell-Einstellungen in opencode erhalten bleiben, wenn Kurspilot seine MCP-Server eintraegt, so dass ich nichts neu konfigurieren muss.
4. Als Lehrkraft moechte ich, dass Kurspilot meine API-Keys weder liest noch schreibt, so dass meine Secrets sicher bleiben.
5. Als Lehrkraft moechte ich dieselben Kurspilot-Skills (kurspilot, -einrichten, -planen, -umsetzen) in opencode wie in Codex/Claude, so dass sich der Workflow nicht unterscheidet.
6. Als Lehrkraft mit mehreren Kursen moechte ich, dass die opencode-Anbindung global gilt (nicht pro Kurs-Ordner), so dass ich sie nicht je Unterrichtseinheit neu einrichten muss.
7. Als Lehrkraft ohne irgendeinen Client moechte ich im Blocker auch einen Installationslink fuer opencode sehen, so dass ich eine gleichberechtigte Auswahl habe.
8. Als Lehrkraft moechte ich, dass alle drei MCP-Server (core, fragensammlung, quiz) in opencode verfuegbar sind, so dass ich alle Aktivitaeten nutzen kann.
9. Als Fortbildner moechte ich, dass Codex weiterhin der empfohlene Einstieg bleibt, so dass die Fortbildung nicht durch einen zusaetzlichen Client verkompliziert wird.
10. Als Maintainer moechte ich, dass opencode auf macOS, Linux und Windows funktioniert, so dass ich den Client auf allen Umgebungen (inkl. Parallels) verifizieren kann.
11. Als Lehrkraft moechte ich, dass ein Abwaehlen/Deinstallieren von opencode keine fremden Einstellungen zerstoert, so dass ich sicher experimentieren kann.
12. Als Maintainer moechte ich, dass sich opencode in die bestehende Adapter-/Setup-Logik einfuegt (kein Redesign), so dass die Wartbarkeit erhalten bleibt.
13. Als Lehrkraft mit opencode und einem weiteren Client moechte ich, dass die gemeinsame Skill-Ablage korrekt angeboten wird, so dass Skills nicht doppelt gepflegt werden.
14. Als Maintainer moechte ich, dass der Skill-Update-Check opencode am richtigen Skill-Ort prueft, so dass Updates auch in opencode ankommen.

## Implementation Decisions

- opencode wird als dritter **LLM-Client** neben Codex und Claude in die bestehende Client-Abstraktion aufgenommen; die bisher binaere Codex/Claude-Logik wird eine echte Drei-Wege-Abbildung (Erkennung, Config-Ziele, Skill-Ziele).
- **Erkennung** analog zu Codex: opencode gilt als vorhanden, wenn die CLI auf dem PATH liegt oder der globale opencode-Config-Ordner existiert; plattformverzeigt fuer macOS/Linux/Windows.
- **Konfiguration global**, nicht pro Projekt: Kurspilot traegt seine MCP-Server in die globale opencode-Config ein (analog zu Codex/Claude auf User-Ebene). Begruendung: Kurspilot-Arbeit ist Multi-Projekt (ein Projekt pro **Unterrichtseinheit**).
- **Merge-Semantik** wie bei den bestehenden Config-Writern: Kurspilot-Eintraege werden gemergt, alle fremden Top-Level-Keys und fremden mcp-/Provider-Eintraege bleiben erhalten; Schreiben ist idempotent und nicht-destruktiv.
- **Secrets bleiben draussen**: Kurspilot nutzt opencodes `{file:...}`/`{env:...}`-Substitution indirekt, indem es Provider-/Secret-Felder niemals liest oder schreibt und keine Projekt-Config anfasst.
- **Skills** folgen der bestehenden Adapter-Architektur: opencode erhaelt einen dritten, duennen Adapter (Quelle im Repo, nutzerweites Ziel im globalen opencode-Skill-Ordner), der auf denselben gemeinsamen Kern verweist; keine inhaltliche Neugestaltung.
- **Installer/Konfigurator**: opencode erscheint in der Client-Auswahl und ist bei Erkennung vorausgewaehlt (Paritaet, keine kuenstliche Reibung); der **Client-Installationsblocker** erhaelt einen opencode-Installationslink neben Codex/Claude; die "Gemeinsame Skill-Ablage"-Logik zaehlt opencode normal mit.
- **MCP-Server**: alle drei Server (core, fragensammlung, quiz) stehen opencode wie Codex/Claude zur Auswahl; die Aktivitaetsauswahl aus dem Setup bleibt wirksam (ADR 0007).
- **Keine Aenderung** am PHP-Plugin oder an den MCP-Servern selbst — das stdio-Protokoll ist client-agnostisch.
- Integration streng nach `/ponytail`: minimale, konsistente Erweiterung bestehender Module statt neuer Sonderpfade (siehe ADR 0009).

## Testing Decisions

- Gute Tests pruefen externes Verhalten (was hinten rauskommt), nicht Implementierungsdetails; opencode-Faelle spiegeln die bestehenden Codex/Claude-Faelle an denselben Nahten.
- Primaere (hoechste) Naht: der Setup-Flow als Ganzes — opencode laeuft als ausgewaehlter Client durch Erkennung → Config → Skills (DI-basiert); Prior-Art: die bestehenden Client-Tests des Setup-Flows.
- Config-Writer: Merge erhaelt fremde Keys/Provider-Eintraege, idempotent, keine Secrets; Prior-Art: die bestehenden Writer-Tests fuer Codex/Claude.
- Skill-Installation/Update: dritter Skill-Zielort wird korrekt abgebildet; Prior-Art: die bestehenden Skill-Root-Tests.
- Installer-GUI/Konfigurator: opencode in Auswahl (vorausgewaehlt bei Erkennung), Installationslink im Blocker, Status; Prior-Art: die bestehenden Render-/Browser-Server-Tests.
- Erkennung: CLI-auf-PATH- und Config-Dir-Heuristik fuer alle drei Plattformen; Prior-Art: die bestehende Codex-Erkennungs-Heuristik.

## Out of Scope

- opencode als empfohlener/beworbener Standardweg der Fortbildung (bleibt Codex, **Codex-First**).
- Aenderungen am PHP-Plugin oder an den MCP-Server-Tools.
- Automatische Migration bestehender Codex/Claude-Setups nach opencode.
- Inhaltliche Neugestaltung der Kurspilot-Skills (nur dritter Adapter).
- Die grundsätzliche Policy „Spezifikationen als Issues vs. Markdown-Dateien“ (wird separat geklärt; Spezifikation 0001 hat derzeit kein Issue).

## Further Notes

- Entscheidungsgrundlage: ADR 0009 "opencode als bereitgehaltener Client" sowie Glossar **Bereitgehaltener Client** / **Codex-First** in CONTEXT.md.
- opencode merged globale und projektlokale Config selbst; Kurspilots globaler Eintrag und eine projektlokale Provider-Config des Nutzers koexistieren.
- Der exakte opencode-Installationslink (Ziel-URL fuer den Blocker) ist in der Umsetzung zu klaeren.
- Multi-Session-Build; Umsetzung ticketweise (siehe Issue #178), Integration je Ticket nach `/ponytail`.
