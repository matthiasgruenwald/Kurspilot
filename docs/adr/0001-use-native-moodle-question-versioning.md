# Use Native Moodle Question Versioning for Quiz Edits

MoodleMcp will update existing quiz questions as new versions of the same Moodle question, instead of replacing the question or adding a duplicate to the quiz. This keeps tests with existing student attempts usable, supports Moodle's "always latest version" workflow for future attempts, and avoids forcing teachers back into Moodle's question forms for common corrections.

## Considered Options

- Replace the quiz question with a newly created question: rejected because quizzes with existing attempts cannot be safely changed that way.
- Add a corrected question alongside the old one: rejected because it leaves broken questions visible and makes the test didactically messy.
- Use Moodle's native question versioning: accepted because it preserves question identity and keeps Moodle's existing stability controls available.

## XML-Reimport (2026-08-17)

Der lokale Moodle-XML-Import von Kurspilot verwendet für einen wiedererkannten
Fragenbank-Eintrag ebenfalls `question_type::save_question()`. Die stabile
`idnumber` wird ausschließlich innerhalb der Zielkategorie abgeglichen; ein
Reimport schreibt damit eine neue Version derselben `questionbankentryid`.

Fehlt zu einer mitgebrachten `idnumber` ein Treffer oder ist nur ein gleicher
Name vorhanden, schreibt der Import nichts ohne ausdrückliche Bestätigung der
Lehrkraft. So folgen Quiz-Slots weiterhin nur dann automatisch der neuesten
Version, wenn ihre Identität geprüft ist.
