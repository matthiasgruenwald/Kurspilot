# Fragen-Identität: Abstammung über idnumber, Stand über den Bank-Eintrag

Beim Schreiben von Fragen treffen in Moodle drei uneinheitliche Antworten auf „ist das dieselbe Frage?" aufeinander: der Core-XML-Import hat keine Regel (legt immer neu an und verwirft kollidierende idnumbers still), Backup/Restore gleicht per stamp + Version + Inhaltshash ab, und Kurspilots eigener XML-Import (#327) gleicht per idnumber ab. Wir entscheiden eine einheitliche Regel für alle Schreibwege: **Abstammung** („dieselbe Frage") trägt allein die stabile `idnumber`, **Stand** („dasselbe Exemplar") ist der Moodle-Fragenbank-Eintrag (`questionbankentryid`), an dem die native Versionierung hängt (ADR 0001). Ein Klon ist dieselbe Frage mit eigenem Stand; ein Reimport ist dieselbe Frage, deren Stand als neue Version fortschreitet.

## Considered Options

- **stamp als Identitätsträger** (Moodles eigene Backup/Restore-Regel): verworfen, weil Klon-Kopien den stamp behalten — stamp kann Original und Kopie nicht unterscheiden und ist von Kurspilot nicht steuerbar.
- **Bank-Eintrag als alleinige Identität**: als Alleinbegriff verworfen, weil Klone und sammlungsübergreifende Kopien dann „andere Fragen" wären, entgegen dem lehrkraftseitigen Abstammungsbegriff; zudem ist die idnumber der einzige Träger, der auch über Sammlungen hinweg trägt (Einzigartigkeit pro Kategorie genügt dafür).
- **Eine Regel je Schreibweg**: verworfen, weil jeder neue Schreibweg die Uneindeutigkeit neu einschleppt — beim Quiz-Klonen liefen bereits zwei Regeln parallel (#354).

## Consequences

- idnumber-Treffer in der Zielkategorie schreibt ohne Nachfrage als neue Version fort (ADR 0001); in allen anderen Fällen gilt das Verdachtsfall-Gate (#327) für alle Schreibwege: nichts Stilles, die Lehrkraft entscheidet.
- Fremd-Bestände ohne idnumber: Abstammung ungeklärt (Gate); beim ersten Kurspilot-Schreibzugriff vergibt Kurspilot eine idnumber am bestehenden Eintrag (Backfill), danach trägt sie die Abstammung.
- Nach Fremd-Wegen (Klon, Restore) versöhnt Kurspilot die idnumber der entstandenen Einträge und meldet je Frage, ob Kopie oder geteilte Referenz entstand; die Core-Mechanik bleibt unverändert.
- Umzüge mit idnumber-Kollision, die der Core still mit `_N`-Suffix löst, werden vor dem Umzug gegatet.
