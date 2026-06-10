# Use Native Moodle Question Versioning for Quiz Edits

MoodleMcp will update existing quiz questions as new versions of the same Moodle question, instead of replacing the question or adding a duplicate to the quiz. This keeps tests with existing student attempts usable, supports Moodle's "always latest version" workflow for future attempts, and avoids forcing teachers back into Moodle's question forms for common corrections.

## Considered Options

- Replace the quiz question with a newly created question: rejected because quizzes with existing attempts cannot be safely changed that way.
- Add a corrected question alongside the old one: rejected because it leaves broken questions visible and makes the test didactically messy.
- Use Moodle's native question versioning: accepted because it preserves question identity and keeps Moodle's existing stability controls available.
