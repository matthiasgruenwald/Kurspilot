---
name: kurspilot-umsetzen
description: Kurspilot-Umsetzung. Nutze diesen Skill bei der Freigabeformulierung "ja, so umsetzen", um einen freigegebenen Kurspilot-Plan in einem bestehenden Moodle-Kurs zu schreiben.
---

# kurspilot-umsetzen

Lies zuerst `kurspilot_get_skill("kurspilot-core")`. Halte die Statuspruefung
vor Schreibzugriff aus dem Kern ein. Vor jedem Schreibzugriff gilt
zusaetzlich `kurspilot_get_skill("implementierungsplan-workflow")`; nutze je
nach Aktivitaet den passenden Korpusteil aus der Uebersicht in
`kurspilot-core`.

Halte die Planstrenge und die Arbeitsbereich-Regel aus dem Kern ein.
