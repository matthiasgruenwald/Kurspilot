# 0008 – Einheitliche nutzerweite Skill-Ablage

## Problem

Der CLI-Installer behandelt `~/.agents/skills/` bereits als kanonische
Kurspilot-Ablage und räumt den alten Codex-Pfad `~/.codex/skills/` auf. Der
grafische Konfigurator, der Update-Flow und Teile des Uninstall-Flows verwenden
jedoch noch `~/.codex/skills/` als Codex-Ziel. Wird die Option „Gemeinsame
Skill-Ablage“ für Codex und Claude gewählt, entstehen dadurch zwei vom Codex
erkannte Kopien derselben Skills.

## Ziel

Für alle nutzerweiten Installationswege gilt dieselbe Pfadregel:

```text
~/.agents/skills/kurspilot*  kanonische Kurspilot-Kopien für Codex
~/.claude/skills/kurspilot*  Aliase auf die kanonischen Kopien, wenn die
                             gemeinsame Ablage gewählt wurde
~/.codex/skills/kurspilot*   ausschließlich Altbestand; nie Installationsziel
```

Unter Windows sind die Claude-Aliase Directory Junctions, unter macOS und Linux
symbolische Links. Die Ablage braucht weder einen Repo-Checkout noch Git.

## Anforderungen

1. `CLIENTS.codex.skillTargetRoot(homeDir)` liefert `~/.agents/skills`.
2. Der grafische Konfigurator verwendet im Alias-Modus diese Ablage als
   kanonisches Ziel und erstellt Claude-Aliase ausschließlich darauf.
3. Der Update-Flow aktualisiert Codex-Skills nur in `~/.agents/skills` und
   behält bei aktivierter gemeinsamer Ablage die Alias-Beziehung zu Claude bei.
4. Der Uninstaller entfernt Kurspilot aus der kanonischen Ablage genau einmal;
   er darf eine gemeinsam verwendete Ablage nicht ein zweites Mal als opencode
   behandeln.
5. `~/.codex/skills` bleibt ein vorsichtig bereinigter Legacy-Pfad:
   unveränderte verwaltete Kurspilot-Ordner dürfen entfernt werden, fremde oder
   lokal geänderte Inhalte bleiben erhalten und erzeugen eine Warnung.
6. README, Kommentare und Tests verwenden dieselbe Pfadregel.

## Akzeptanzkriterien

- Eine Konfiguration von Codex und Claude mit aktivierter gemeinsamer Ablage
  legt nur `~/.agents/skills/kurspilot*` als echte Ordner an.
- Claude erhält dafür vier gültige Links/Junctions und keine zweite Kopie.
- Nach einem Update bleibt diese Struktur erhalten.
- Ein erneuter Durchlauf ist idempotent.
- Der bisherige Legacy-Bereinigungs- und Konfliktschutz bleibt getestet.

## Nicht Bestandteil

- Verteilung an ChatGPT oder Claude.ai ohne Code-/Desktop-Modus.
- Änderungen an MCP-Transport, Moodle-Authentifizierung oder Skill-Inhalten.
