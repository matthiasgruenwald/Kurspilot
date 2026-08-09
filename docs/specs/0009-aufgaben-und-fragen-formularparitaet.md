# Spezifikation: Aufgaben- und Fragen-Formularparität

## Problem Statement

Kurspilot kann Moodle-Aufgaben, Quizze und Multiple-Choice-Fragen anlegen, bildet aber mehrere sichtbare Moodle-Core-Einstellungen nicht ab. Lehrkräfte müssen deshalb trotz MCP-Unterstützung in Moodle-Formulare wechseln. Besonders problematisch sind wirkungslose oder irreführende Kombinationen: Aufgaben werden mit unbegrenzten Versuchen, aber ohne wirksame Wiedereröffnung und mit 100 Punkten angelegt; Mehrfachauswahl wird als Einfachauswahl erzwungen; Fragen können nicht mitsamt ihrer Versionsgeschichte aufgeräumt werden.

ADR-0007 verlangt für Aktivitäts-MCPs explizite, schema-validierte Formularfelder. Die Aufgaben-Implementierung erfüllt diesen Vertrag noch nicht. Ihr Update-Webservice schreibt außerdem nur einzelne Tabellenfelder und umgeht damit Teile des Moodle-Modul-Lifecycles wie Bewertungsbuch, Kalender, Abschluss, Dateien und Unterplugin-Konfiguration.

## Solution

Das Aufgaben-MCP erhält Formularparität mit dem Moodle-5.0-Core-Aufgabenformular und den mit Moodle ausgelieferten Abgabe- und Feedbacktypen. `übung` wird ein hilfreiches Preset für eine unbewertete, fortlaufend bearbeitbare Aufgabe; jedes einzelne Preset-Feld bleibt überschreibbar. Updates werden als Snapshot-und-Patch über Moodles Modul-API ausgeführt und vollständig zurückgelesen.

Einfachauswahl bleibt kompatibel. Mehrfachauswahl erhält Checkboxen, strukturierte Antworten, spezifisches Antwortfeedback und konfigurierbare Gewichtung. Fragen können samt Identität, sämtlichen Versionen, Dateien und Schlagwörtern innerhalb und zwischen Fragensammlungen verschoben werden. Kurspilot löscht weiterhin weder Fragen noch Quiz-Slots, sondern führt die Lehrkraft mit einem konkreten Moodle-Link zur manuellen Bearbeitung.

Für allgemeine Aktivitätseinstellungen gilt Core-Webservice zuerst: Wo Moodle bereits eine geeignete öffentliche Funktion anbietet, registriert das Plugin diese automatisch im Dienst `Coursepilot` und nutzt sie mit dem vorhandenen Token. Nur echte Webservice-Lücken erhalten einen lokalen Coursepilot-Adapter.

## User Stories

1. As a teacher, I want an `übung` preset, so that I can create an ungraded exercise without configuring every field manually.
2. As a teacher, I want exercise submissions to remain editable, so that students can improve their work repeatedly without teacher intervention.
3. As a teacher, I want feedback comments to remain available on ungraded exercises, so that I can respond without assigning points.
4. As a teacher, I want every preset field to remain individually overridable, so that a useful default never becomes a rigid workflow.
5. As a teacher, I want to choose graded, point-based, scale-based or ungraded assignments, so that the Moodle activity matches its didactic purpose.
6. As a teacher, I want to set the Submit button explicitly, so that I decide whether a submission remains editable or becomes final.
7. As a teacher, I want to set the maximum number of attempts, including unlimited attempts, so that resubmission policy is visible and intentional.
8. As a teacher, I want to choose manual, automatic or until-pass reopening, so that Moodle handles subsequent attempts as planned.
9. As a teacher, I want Kurspilot to explain invalid attempt combinations, so that it does not silently save ineffective settings.
10. As a teacher, I want to configure submission dates, cut-off date, grading due date and time limit, so that availability matches the lesson plan.
11. As a teacher, I want to choose online text and file submissions separately, so that students only see appropriate input methods.
12. As a teacher, I want to configure word limits, file counts, file size and accepted types, so that digital submissions follow the task requirements.
13. As a teacher, I want to configure group submissions and grouping rules, so that collaborative work is represented correctly.
14. As a teacher, I want to configure assignment notifications, so that Moodle sends only useful messages.
15. As a teacher, I want to select an existing grade category, scale and grading method, so that assignments fit the existing course gradebook.
16. As a teacher, I want to configure anonymous marking and marking workflow, so that assessment procedures can be reproduced without opening the Moodle form.
17. As a teacher, I want to configure Moodle-bundled feedback types, so that comments, annotated PDFs, feedback files and offline grading remain available.
18. As a teacher, I want a partial update to preserve every unmentioned setting, so that changing one field never disables another plugin or option.
19. As a teacher, I want Kurspilot to respect fields that Moodle freezes after submissions or grades exist, so that existing learner work is protected.
20. As a teacher, I want create, update and catalog read-back to show the same effective settings, so that I can verify what Moodle actually saved.
21. As an administrator, I want installation or upgrade to register all required service functions automatically, so that no manual webservice configuration is needed.
22. As a teacher, I want the existing Coursepilot token to call both suitable Moodle-Core functions and necessary Coursepilot adapters, so that I never manage a second token.
23. As a maintainer, I want suitable Moodle-Core webservices reused rather than duplicated, so that Kurspilot follows Moodle upgrades and permissions correctly.
24. As a teacher, I want to distinguish single-choice and multiple-choice questions, so that the interaction matches the question content.
25. As a teacher, I want existing `correctindex` calls to keep working, so that existing plans and questions do not break.
26. As a teacher, I want several correct answers to render as checkboxes, so that learners can select all applicable options.
27. As a teacher, I want specific feedback on each answer, so that an incorrect selection can trigger a focused hint without revealing the full solution.
28. As a teacher, I want deductions to be configurable, so that formative situations can use either neutral distractors or deliberate negative weights.
29. As a teacher, I want balanced positive and negative weights recommended rather than forced, so that content quality is not sacrificed to an arbitrary answer count.
30. As a teacher, I want a concrete warning for the score produced by selecting every answer, so that I understand the consequence of an unbalanced question.
31. As a student, I want immediate feedback without a confidence self-assessment, so that I can correct my thinking directly.
32. As a teacher, I want read-back to show selection mode, correct answers, weights and feedback, so that question configuration is auditable.
33. As a teacher, I want to move a question within a question bank, so that I can reorganize categories without recreating content.
34. As a teacher, I want to move a question between question banks when I have permission, so that larger clean-ups remain possible.
35. As a teacher, I want a question move to preserve all versions, files and tags, so that no history or content is lost.
36. As a teacher, I want Kurspilot never to delete a question or quiz slot, so that destructive clean-up remains under my control.
37. As a teacher, I want Kurspilot to name the quiz, slot, question and category involved in a deletion request, so that manual clean-up is quick and unambiguous.
38. As a teacher, I want a direct Moodle edit link for manual clean-up, so that I do not need to navigate through several administration screens.

## Implementation Decisions

- The tasks will extend the existing activity-MCP separation from ADR-0007. Assignment-specific fields stay in the assignment MCP; activity-independent fields stay in the Core MCP.
- The assignment API will expose explicit, schema-validated fields rather than a generic overrides object.
- `übung` is a preset, not a separate Moodle activity type. Explicit field values override preset defaults.
- Create and update use Moodle's module lifecycle. Update loads a complete current snapshot, applies only explicitly supplied changes and then calls the module update API.
- Missing update fields are preserved. Explicit empty or zero values clear a field only where Moodle supports that operation.
- The supported assignment scope includes Moodle-5.0 Core fields and the Moodle-bundled online-text, file, submission-comments, feedback-comments, annotate-PDF, feedback-file and offline-grading plugins.
- Arbitrary third-party, AI and plugin form extensions do not become static API fields.
- Existing grade categories, scales and grading methods can be selected and read. Creating these structures is a separate capability.
- Core-webservice-first is mandatory. Suitable public Moodle webservices are registered automatically in the enabled `Coursepilot` service and called directly with the existing Coursepilot token.
- `core_courseformat_update_course` is used for supported course-page actions such as group mode and visibility. The deprecated `core_course_edit_module` endpoint is not newly wired.
- A local `local_coursepilot_*` adapter is added only when no public Moodle webservice fully implements the required operation. Such an adapter still uses Moodle's public PHP/module API.
- Single-choice remains backward compatible with the current `correctindex` contract.
- The extended answer contract records text, correctness, optional specific feedback and configurable weight or scoring mode.
- Multiple-choice uses Moodle's native multichoice question type with `single=0`. Moodle's standard question grading clamps the final question result to at least zero.
- Balanced positive and negative weights are recommended but not required. Unequal answer counts produce a warning, not a validation error.
- Mini-checks default to `immediatefeedback`; `immediatecbm` is not used because it asks for confidence self-assessment.
- Question moves operate on the question-bank entry identity and expand to all question-version IDs before calling Moodle's Core bulk-move path.
- Question moves must use Moodle's capability checks and Core handling for files, tags, ID collisions, events and caches.
- No question-delete or quiz-slot-delete MCP/webservice is registered. Manual clean-up uses catalog details and an edit URL.

## Testing Decisions

- Tests verify external behavior rather than private helpers or direct table state.
- The primary seams are the public MCP tools, the automatically configured `Coursepilot` service and catalog/question read-back.
- MCP contract tests verify visible schemas, backward compatibility, warnings and the exact public webservice calls.
- Moodle integration tests create or update data only in the configured test course, then verify the result through returned settings and a fresh catalog/question read-back.
- Assignment tests cover the `übung` preset, explicit overrides, attempt validation, one representative round-trip per form group and preservation of unmentioned subplugin settings.
- Question tests cover unchanged single-choice behavior, multiple-choice checkbox data, feedback and weighting round-trips, and the select-all warning.
- Move tests cover movement within one question bank and across contexts while preserving question-bank identity and every version.
- Negative registry tests prove that no destructive question or quiz-slot endpoint is exposed.
- Service contract tests prove that required Moodle-Core and local functions are installed in the `Coursepilot` service automatically and that no fully supported Core operation receives a duplicate local endpoint.
- Existing quiz-mode, question-versioning, course-catalog, MCP-profile and real-Moodle integration tests are the prior art to extend.

## Out of Scope

- A short-video player or YouTube control component.
- Gradebook-category automation for mini-checks.
- Creating new grade categories, scales, rubrics, marking guides, outcomes or competencies.
- Static support for arbitrary third-party, AI or plugin-extended assignment fields.
- Deleting existing assignment files, questions or quiz slots.
- A custom Moodle question type that permits a negative final score for one question.
- Replacing Moodle's service-token model or requiring a second token.

## Further Notes

- Published specification and issue tree: [GitHub issue #258](https://github.com/matthiasgruenwald/moodle-coursepilot/issues/258).
- Canonical implementation plan: `docs/plans/0003-aufgaben-und-fragen-formularparitaet.md`.
- Moodle 5.0 freezes several assignment settings after submissions or grades exist. Kurspilot must report those restrictions rather than bypass them.
- Moodle's native multi-select calculation sums answer fractions and clamps the result to the range zero through one. Negative answer weights can remove points earned within the question but cannot create a negative final question result.
- The original observations KP-002 and KP-003 are intentionally not implementation tickets in this spec. KP-002 is out of scope; KP-003 is deferred to a future general gradebook capability.
