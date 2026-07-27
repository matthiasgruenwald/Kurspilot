# Coursepilot – Release Notes

Nutzergerichtete Release-Informationen für das Moodle-Plugin `local_coursepilot` und den
lokalen Coursepilot-MCP. Entwicklungs- und Issue-Repository ist
[matthiasgruenwald/moodle-coursepilot](https://github.com/matthiasgruenwald/moodle-coursepilot)
(primäres Repository); der Plugin-Quellbaum wird separat als Mirror für das Moodle Plugin
Directory veröffentlicht.

## Coursepilot 1.0 – Produktname, Neuinstallation, Sprachen und Datenschutz

### Einheitlicher Produktname

Das Produkt heißt öffentlich **Coursepilot**. Moodle-Plugin, Konfigurator, Installer,
Skills, Dokumentation und Release-Artefakte nutzen diesen Namen einheitlich. Die
Moodle-Komponente des Plugins ist `local_coursepilot`.

### Neuinstallation erforderlich (keine Migration)

Die frühere Komponente `local_aicoursecreator` wird **nicht** migriert. Administrator:innen
einer bestehenden Installation müssen `local_aicoursecreator` zuerst **deinstallieren**
(Website-Administration → Plugins → Plugins verwalten) und anschließend `local_coursepilot`
neu installieren. Eine Daten-, Einstellungs- oder Webservice-Übernahme aus der alten
Komponente gibt es bewusst nicht.

### Moodle 5.0 oder neuer

`local_coursepilot` richtet sich an frische Moodle-Installationen und verlangt
**Moodle 5.0 oder neuer**. Moodle 4.x wird weder unterstützt noch getestet.

### Lokal konfigurierter KI-Client und Datenschutz

Das Moodle-Plugin ruft **selbst keinen KI-Anbieter** auf. Coursepilot nutzt einen **lokal**
auf dem Rechner der Lehrkraft konfigurierten KI-Client (z.B. Claude Desktop, Codex oder
opencode). Erst wenn die Lehrkraft diesen Client nutzt und dabei Kursinhalte übergibt, können
diese Inhalte an den Anbieter des jeweils konfigurierten KI-Clients übertragen werden.

Coursepilot ist ausschließlich für die Kursgestaltung durch die Lehrkraft bestimmt und gibt
**keine Lernendendaten** frei. Ausgeschlossen sind insbesondere:

- Aufgabenabgaben (Submissions)
- Forenbeiträge
- Quizversuche (Attempts)
- Bewertungen und Noten
- Teilnehmendenlisten

Diese Grenze ist als positive Allowlist umgesetzt und wird automatisch per Vertragstest
erzwungen. Die Moodle-Privacy-API des Plugins meldet über einen `null_provider` bewusst keine
Verarbeitung von Lernendendaten.

### Marketplace-Artefakt, Mirror-Export und Lizenzen

Ein wiederholbarer Release-Prozess erzeugt das Moodle-Plugin als installierbares
Archiv und als Quellinhalt für den Marketplace-Mirror:

- `npm run build:plugin` baut das installierbare `Plugin/local_coursepilot.zip`
  (ohne macOS-Metadaten wie `.DS_Store`).
- `npm run build:mirror` exportiert das Plugin als alleiniges Root eines
  schreibgeschützten Mirrors (`dist/mirror/`) – ohne MCP, Installer, Skills oder Tests.
- `npm run release:plugin` führt beide Schritte aus.

Lizenzen sind getrennt: Das Moodle-Plugin (inkl. Marketplace-ZIP) steht unter
**GPL-3.0-or-later** (`Plugin/src/local_coursepilot/LICENSE`); MCP, Installer, Skills
und Entwicklungsmaterial im primären Repository
[matthiasgruenwald/moodle-coursepilot](https://github.com/matthiasgruenwald/moodle-coursepilot) stehen
unter **AGPL-3.0-or-later**. Die Upstream-MIT-Hinweise auf `jtuttas/MoodleMcp` bleiben
erhalten (siehe `NOTICE`).

### Sprachen: Englisch als Basis, Deutsch vorübergehend

Englisch ist die Basissprache des Plugins. **Deutsch** wird in der Übergangsphase
**vorübergehend** direkt mitgeliefert, bis die Übersetzung über **AMOS** (das
Moodle-Übersetzungsportal) gepflegt wird. Sobald AMOS die deutsche Übersetzung übernimmt,
wird die mitgelieferte deutsche Sprachdatei in einem frühen Release entfernt. Dieser
Übergangscharakter ist bewusst dokumentiert, damit Marketplace-Reviewer ihn klar erkennen.
