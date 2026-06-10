# PRD: IGS-MoodleMcp V1 als fortbildungsfaehige Arbeitsversion

## Problem Statement

Lehrkraefte sollen bestehende Moodle-Kurse fuer ihren Unterricht schnell, verlaesslich und ohne viel Moodle-Formulararbeit mit Materialien, Aufgaben, Tests und Lernpfad-Logik befuellen koennen. Das vorhandene MoodleMcp-Projekt ist bereits ein guter technischer Startpunkt, spricht aber derzeit stark in BBS-/Lernsituationssprache, hat noch keinen Quiz-/Fragebank-Workflow und ist fuer Kolleginnen und Kollegen noch nicht einfach genug installierbar.

Die Fortbildung findet in kurzer Zeit statt. Bis dahin braucht es eine IGS-Arbeitsversion, die in Codex zuverlaessig laeuft, auf Windows fuer Kolleginnen und Kollegen installierbar ist, eigene Moodle-Tokens nutzt und alle schreibenden Moodle-Aenderungen erst nach expliziter Freigabe durch die Lehrkraft ausfuehrt.

## Solution

Es entsteht eine schulbezogene IGS-Arbeitsversion von MoodleMcp als Fork. Sie ist Codex-First, bleibt Claude-kompatibel soweit praktikabel, und nutzt bestehende Moodle-Kurse als Ziel. Die V1 konzentriert sich auf Kursbefuellung mit Moodle-nativen Textseiten, Aufgaben, externen Links, Multiple-Choice-Tests, Abschlussbedingungen und Voraussetzungen.

Der Kernworkflow ist:

1. Lehrkraft startet natuerlich formuliert Setup, Fortsetzen oder Planung.
2. Codex klaert Kontext, Klasse/Lerngruppe, Fach, Thema, Abschnittsentscheidung und Planungsgrundsaetze.
3. Codex nutzt lokale Kontextdateien und Journale, falls vorhanden.
4. Codex erstellt einen Freigegebenen Implementierungsplan mit gestufter Vorschau.
5. Erst nach expliziter Freigabe schreibt MoodleMcp nach Moodle.
6. Nach jedem Schreibzugriff entsteht ein Umsetzungsbericht im lokalen Journal.

## User Stories

1. As a teacher, I want to fill an existing Moodle course, so that I do not need to manually create every page, task and quiz in Moodle.
2. As a teacher, I want the tool to use IGS terms like Unterrichtseinheit and Unterthema, so that the workflow matches my school language.
3. As a teacher, I want Codex to clarify assumptions before creating material, so that implicit didactic decisions do not produce bad results.
4. As a teacher, I want a confirmed implementation plan before anything is written to Moodle, so that I stay in control.
5. As a teacher, I want repeated rules such as gates after tests summarized as planning principles, so that the plan remains readable.
6. As a teacher, I want exceptions visibly marked, so that I notice where the plan differs from the normal structure.
7. As a teacher, I want a staged preview, so that I can see the overview first and full details only when needed.
8. As a teacher, I want Moodle-native text pages for information, so that students work directly in Moodle instead of PDFs.
9. As a teacher, I want text and media fields out of the V1 default scope, so that the course main page stays clean.
10. As a teacher, I want tasks for work students need to do, so that Moodle distinguishes information from action.
11. As a teacher, I want tasks without digital submission by default, so that analogue or oral work can still appear in the learning path.
12. As a teacher, I want digital submission only when explicitly planned, so that students do not see pointless upload forms.
13. As a teacher, I want submitted tasks to count as completed when used as gates, so that students can progress after handing something in.
14. As a teacher, I want tasks without submission to use manual student completion when they are gates, so that students consciously mark work as done.
15. As a teacher, I want material text pages without gates by default, so that reference material does not block the learning path.
16. As a teacher, I want text pages to use manual student completion only when explicitly required, so that mandatory reading is visible.
17. As a teacher, I want MC tests in V1, so that students demonstrate understanding before progressing.
18. As a teacher, I want exactly one correct answer per MC question in V1, so that the first implementation stays understandable.
19. As a teacher, I want answer options shuffled by default, so that students cannot learn "answer B".
20. As a teacher, I want question order to be a teacher decision, so that sequential tests stay in order when needed.
21. As a teacher, I want MC questions evaluated as right or wrong in V1, so that the focus stays on understanding rather than points.
22. As a teacher, I want a recommended high pass threshold such as about 80%, so that only small gaps are tolerated in learning checks.
23. As a teacher, I want the pass threshold adjustable, so that I can adapt it to the purpose of the test.
24. As a teacher, I want a Lerncheck mode with unlimited attempts and best attempt counted, so that students can learn from feedback.
25. As a teacher, I want an Intensiv-Ueben mode, so that students can practise closer to individual questions when appropriate.
26. As a teacher, I want a Bewertungsmodus, so that notenrelevante tests can use stricter attempt and feedback settings.
27. As a teacher, I want tests to be time-open in V1, so that students can continue after the lesson.
28. As a teacher, I want tests to be usable as learning path gates, so that students cannot simply click through.
29. As a teacher, I want quiz completion to require reaching the pass threshold, so that "completed" means understood enough.
30. As a teacher, I want follow-up activities locked only when the implementation plan explicitly says so, so that restrictions are not hidden.
31. As a teacher, I want every restriction listed before implementation, so that I know what students will experience.
32. As a teacher, I want quiz questions stored in the course question bank, so that I can reuse and reorganize them.
33. As a teacher, I want question categories organized by Unterthema and numbered content section, so that questions stay findable.
34. As a teacher, I want generated questions to use "always latest version" by default, so that later fixes affect future attempts.
35. As a teacher, I want edits to existing questions to create a new Moodle version of the same question, so that tests with existing attempts remain usable.
36. As a teacher, I want existing questions identified before editing, so that the wrong question is not changed.
37. As a teacher, I want readable question previews, so that I can approve questions before Moodle receives them.
38. As a teacher, I want inline change highlighting where possible, so that I can quickly see what changed.
39. As a teacher, I want old and new versions side by side when inline highlighting is unclear, so that I can still review safely.
40. As a teacher, I want small wording corrections to be possible before approval, so that I do not need a full regeneration for two words.
41. As a teacher, I want larger question changes to go back through KI review and approval, so that deep changes are not hidden.
42. As a teacher, I want each MC question tied to a concrete Bezugsaktivitaet, so that students can answer from course material.
43. As a teacher, I want material gaps marked instead of silently ignored, so that good questions can trigger better material.
44. As a teacher, I want material generated only after explicit approval, so that unnecessary KI costs and wrong scope are avoided.
45. As a teacher, I want student feedback to point to course material, so that students know where to repair misunderstandings.
46. As a teacher, I want feedback to name Moodle activities or pages exactly, so that students can find them.
47. As a student, I want feedback that helps me think again without labelling me diagnostically, so that I do not feel pathologized.
48. As a teacher, I want distractors based on plausible misconceptions, so that wrong answers tell me something useful.
49. As a teacher, I want short distractor reasons in the preview, so that I can judge question quality.
50. As a teacher, I want external links allowed, so that useful web resources can be part of the course.
51. As a teacher, I want central tested content inside Moodle, so that questions are not invalidated by changed external pages.
52. As a teacher, I want external sources folded into Moodle material with source notes, so that Moodle is the single source of truth for students.
53. As a teacher, I want schoolbook references such as "Prisma Natur 3, S. 42", so that sources stay traceable.
54. As a teacher, I want a copyright warning in documentation, so that I remember AI creation does not automatically allow redistribution.
55. As a teacher, I want to provide my own material files or screenshots, so that MoodleMcp can work from real classroom material.
56. As a teacher, I want provided material saved locally, so that the Moodle build can be reproduced later.
57. As a teacher, I want saved files renamed meaningfully, so that screenshots and scans are findable.
58. As a teacher, I want original filenames journaled, so that I can trace where renamed files came from.
59. As a teacher, I want OCR for screenshots and scans, so that text becomes editable and processable.
60. As a teacher, I want OCR output reviewed before Moodle writing, so that OCR errors do not become course material.
61. As a teacher, I want original scans kept locally, so that I can verify unclear OCR later.
62. As a student, I want Moodle pages to show clean text rather than page screenshots, so that the material is readable.
63. As a teacher, I want important diagrams cropped as images, so that students see exactly the needed Fachabbildung.
64. As a teacher, I want text around diagrams extracted as text, so that the same text is not duplicated as image and text.
65. As a student using assistive tools, I want images to have alt text, so that I can understand relevant visuals.
66. As a teacher, I want KI quality routines like alt text and clear labels, so that useful details are not skipped because of time pressure.
67. As a teacher, I want local class context, so that I do not repeat student needs and class specifics every time.
68. As a teacher, I want context organized by school year, class/group and Unterrichtsordner, so that it matches school practice.
69. As a teacher, I want class-level CONTEXT.md and subject-level CONTEXT.md, so that shared and subject-specific context stay separate.
70. As a teacher, I want real student names allowed locally, so that planning remains practical.
71. As a teacher, I want local context outside Git, so that student data is not accidentally pushed.
72. As a teacher, I want `local-context/` ignored by Git, so that private planning stays local.
73. As a teacher, I want context setup to be explicit and explained, so that I understand what is created and why.
74. As a teacher, I want only minimal setup fields required, so that I can start quickly.
75. As a teacher, I want optional planning context offered but not forced, so that I can add detail when useful.
76. As a teacher, I want independent part-group contexts for E/G courses or mixed groups, so that absent students are not included accidentally.
77. As a teacher, I want related context references, so that Codex can ask whether class context should be consulted.
78. As a teacher, I want no automatic context inheritance, so that unrelated student data is not silently used.
79. As a teacher, I want a journal, so that I can reconstruct what happened after interruptions.
80. As a teacher, I want journal entries dated and never overwritten, so that I can look back by day.
81. As a teacher, I want journal location chosen automatically by context, so that I do not need to manage filing.
82. As a teacher, I want class-level journal entries for group development, so that general notes stay visible.
83. As a teacher, I want subject-level journal entries for Moodle work, so that planning history stays with the Unterrichtsordner.
84. As a teacher, I want implementation reports after Moodle writes, so that successes, IDs, links and failures are visible.
85. As a teacher, I want open follow-up work documented, so that errors or deferred tasks are not forgotten.
86. As a teacher, I want Codex to find open follow-ups when I continue, so that I do not lose loose ends.
87. As a teacher, I want Codex to propose follow-ups instead of doing them automatically, so that I keep control.
88. As a teacher, I want a continue routine, so that I can resume interrupted planning naturally.
89. As a teacher, I want natural start phrases, so that I do not need to learn commands.
90. As a teacher, I want short context clarification when a phrase is ambiguous, so that Codex does not guess wrong.
91. As a teacher, I want a simple installer, so that setup does not dominate the fortbildung.
92. As a teacher on Windows, I want installation and MCP use to work reliably, so that I can participate with my school laptop.
93. As the maintainer on macOS, I want macOS to remain supported, so that development and personal use continue.
94. As a teacher, I want my own Moodle token stored locally, so that I can start and continue without retyping secrets.
95. As an admin, I want the Moodle webservice prepared globally, so that each teacher only needs their own account/token.
96. As a maintainer, I want the IGS version in a fork, so that upstream is not blocked by school-specific changes.
97. As a maintainer, I want the fork private first if possible, so that unstable setup and school-specific details are not public.
98. As a maintainer, I want a clear README if the fork must be public, so that it is not confused with upstream.
99. As a teacher, I want Codex to work first, so that the fortbildung has one reliable client.
100. As a maintainer, I want Claude compatibility kept in mind, so that support can follow without blocking V1.

## Implementation Decisions

- Work in an IGS fork. Use a private fork if possible; if not possible, use a public working fork with a clear README explaining that it is school-specific.
- Keep `jtuttas/MoodleMcp` as upstream and avoid depending on upstream review for the fortbildung.
- Treat Codex as the required V1 client. Claude compatibility remains a goal but does not block V1.
- Build around existing courses. Course creation is out of V1.
- Replace Lernsituation language in user-facing docs and workflows with Unterrichtseinheit, Unterthema, Thema and Lernpfad.
- Keep Text- und Medienfeld out of V1 workflows even though the existing upstream MCP supports labels.
- Use Textseite as the default Moodle-native material type.
- Keep Aufgaben in scope. Default to Aufgabe ohne Abgabe unless Digitale Abgabe is explicitly planned.
- Use manual student completion for Aufgabe ohne Abgabe gates.
- Use submission completion for digitally submitted Aufgabe gates.
- Add Quiz authoring and question-bank support to the Moodle plugin and MCP server. Current upstream has no quiz/question functions.
- MC V1 uses exactly one correct answer, variable number of options, shuffled answers, right/wrong grading, no partial points.
- Test modes are Lerncheck-Modus, Intensiv-Ueben-Modus and Bewertungsmodus. The README/Skill must explain student experience and teacher monitoring tradeoffs.
- Lerncheck-Modus is default: unlimited attempts, best attempt counts, no time limit, high pass threshold recommendation.
- Quiz completion must support Bestehensabschluss.
- Freigabe-Voraussetzungen are never implicit. Every restriction must appear in the Freigegebener Implementierungsplan.
- Question edits must use Moodle native question versioning. Do not replace or duplicate questions when editing.
- Questions in quizzes should use Immer aktuellste Version by default.
- Questions should live in course-level question bank categories, organized by Unterthema and numbered named content section.
- All new and changed questions need Lesbare Fragenvorschau including answers, feedback, Bezugsaktivitaet, Distraktorenbegruendung and any changes.
- Question edit previews should prefer inline change marking; fall back to old/new side-by-side when clearer.
- Support small teacher wording corrections before approval. Larger changes go back through KI revision and another preview.
- Each MC question needs a Moodle-interne Bezugsquelle / Bezugsaktivitaet.
- Materialluecken are shown to the teacher and do not write questions to Moodle until material is added or the question is changed.
- Materialergaenzung is allowed only after explicit teacher approval and should be Moodle-native.
- External links remain supported but central tested content should be inside Moodle.
- External source material can be incorporated into Moodle material with Quellenhinweis and, for textbooks, Lehrwerkverweis.
- Add an Urheberrechtswarnung to README/fortbildung docs. This is a warning/responsibility note, not legal advice.
- Provided teacher materials should be saved locally by default unless the teacher declines.
- Local material lives under the Unterrichtsordner as `materials/<thema>/`.
- Save Originalmaterial and normalized Sprechender Materialdateiname; journal original names when renaming.
- OCR-Extraktion is V1-important for screenshots/scans. OCR-Kontrolle is required before Moodle write.
- Use extracted text as Moodle text; do not show full screenshots as default Moodle content.
- Crop Fachabbildungen as Gezielter Bildausschnitt when the image itself is needed.
- Every Fachabbildung gets Alt-Text.
- Add local context support outside Git under `local-context/`.
- Preferred local context structure: `local-context/<schuljahr>/<klasse-oder-lerngruppe>/CONTEXT.md`, with Unterrichtsordner such as `naturwissenschaften/CONTEXT.md`.
- Do not use a technical `subjects/` folder.
- Teilgruppen such as `7a-e-kurs-nawi` should be independent folders, not nested under `7a`.
- Related context is stored as a light reference only; no automatic inheritance.
- Add local journals as dated Markdown files. Do not rely on Git as the teacher-facing history.
- Journal placement follows context: class/group journal for general group notes, Unterrichtsordner journal for planning, Moodle work, material and questions.
- No school-year journal by default in V1.
- After Moodle writes, create an Umsetzungsbericht with successes, IDs/links, errors and Offene Nacharbeit.
- On start/continue, Codex should search relevant journals for Offene Nacharbeit and offer Nacharbeitsvorschlag.
- Provide a Fortsetzen-Routine triggered by natural phrases.
- Provide context onboarding as an explicit setup option, not hidden hardcoded behavior.
- Setup asks Pflichtkontext only: Schuljahr, Klasse or Lerngruppenname, Fach. Optional planning context is offered but not required.
- A Kollegiums-Installer or comparable simple installer is important for fortbildung.
- Windows is the required platform for colleagues. macOS remains supported for maintainer/development.
- Each teacher uses an eigener Moodle-Token. Webservice is prepared globally.
- Store Moodle URL/token locally in ignored local config, not in repo and not in `local-context/`.

Major modules to build or modify:

- Moodle plugin quiz/question services: create/update quiz, create/update MC questions using native question versioning, question-bank categories, quiz question references, completion and restrictions.
- MCP server tool surface: expose quiz, question, category, preview-safe read/update and setup helpers.
- Local context manager: create/read/write `local-context/`, CONTEXT files, material folders, journals, related context references and follow-up search.
- Preview and approval planner: generate Freigegebener Implementierungsplan, gestufte Vorschau, readable question previews and implementation reports.
- Material ingestion pipeline: save provided material, rename, OCR, crop Fachabbildungen, create alt text, source notes and Moodle-native text pages.
- Installer/setup layer: Windows-first install/configure path, token config, local context setup and README/Skill integration.
- Documentation and skill rewrite: IGS terminology, natural start phrases, setup, test modes, copyright warning, local context and journal behavior.

## Testing Decisions

- Tests should focus on external behavior and Moodle-visible outcomes, not private implementation details.
- Use a real Moodle test instance for integration tests where possible, because quiz question versioning, completion and restrictions are Moodle-model-sensitive.
- Add isolated tests for local context and journal path decisions. These are deep modules and should not require Moodle.
- Add isolated tests for material filename normalization and journaled rename records.
- Add isolated tests for implementation-plan generation: no write without approval, restrictions visible, plan principles and deviations represented.
- Add isolated tests for question preview data shape: answers, feedback, Bezugsaktivitaet, distractor reasons and change marking metadata.
- Add plugin-level tests or scripted verification for native Moodle question versioning: edit creates same question new version, quiz using latest version remains valid with existing attempts.
- Add integration test for course question-bank category creation and question placement.
- Add integration test for quiz defaults: Lerncheck-Modus, answer shuffle, pass grade, unlimited attempts, best attempt, no time limit, Bestehensabschluss.
- Add integration test for task defaults: Aufgabe ohne Abgabe unless explicitly digital, manual student completion for no-submission gate, submission completion for digital gate.
- Add integration test for Freigabe-Voraussetzung creation only when present in approved plan.
- Add install smoke tests on Windows and macOS.
- Current upstream prior art is thin: existing plugin services are simple external webservice classes and `moodle-mcp.js` wraps them as MCP tools. New tests may need to establish first serious automated coverage.

## Out of Scope

- Creating Moodle courses.
- Automating Lernlandkarte setup in V1.
- Text- und Medienfeld as a V1 workflow target.
- H5P in V1.
- Cloze, Kurzantwort, Drag-and-drop and AI-Textfrage in V1, though AI-Textfrage is a high-value later expansion.
- Multiple-correct MC, partial points and complex scoring in V1.
- Time limits in V1.
- Full rich inline editor for question previews in V1.
- Automatic publication or sharing of local context files.
- Automatic anonymization of local teacher-owned student context.
- Legal advice on copyright. The project can warn and document responsibility but cannot decide legal permissibility.
- Full Claude parity when it would delay Codex-first V1.

## Further Notes

- Current local repo remote is `origin = https://github.com/matthiasgruenwald/MoodleIGSMcp.git`; `upstream = https://github.com/jtuttas/MoodleMcp.git` remains available for original project updates and possible later PRs.
- Current repo state includes new local documentation and setup guardrails: `CONTEXT.md`, `.gitignore`, and ADR/PRD files under `docs/`.
- Existing upstream code currently supports sections, labels, pages, URLs, assignments, file upload to assignments, completion and restrictions. It does not yet support quiz/question-bank authoring.
- Existing upstream terminology still heavily uses Lernsituation in README and SKILL; this must be rewritten for IGS usage.
- The local context folder, token configuration and local teacher material folders are ignored by `.gitignore`.
- Useful ADRs already captured locally:
- ADR 0001: Use native Moodle question versioning for quiz edits.
- ADR 0002: Use an IGS fork as the training version.
- ADR 0003: Allow local student names in teacher context files, but keep them outside Git.
