# Quiz-Anordnung versionieren — was kostet ein Stand mit Slots und ein Rückschreibweg?

**Recherche zu [#365](https://github.com/matthiasgruenwald/moodle-coursepilot/issues/365)**, Karte
[#346](https://github.com/matthiasgruenwald/moodle-coursepilot/issues/346).

- **Quellstand Moodle:** 5.0.8 (`/opt/moodle/version.php:35`), Branch `MOODLE_500_STABLE`,
  Commit `3087780dc`. Derselbe Stand wie #347, #355, #358.
- **Messgrundlage:** laufende Instanz `moodle-docker-*` auf diesem Quellbaum (dieselbe wie in
  #358 Teil 5: 22 Kurse, 108 Quizze). Alle Größen in Teil 1.3 sind dort gemessen; der
  Rückschreibweg in Teil 2.4 wurde dort in einer zurückgerollten Transaktion live erprobt.
- **Pfade ohne Präfix** = Moodle-Quellbaum. Kurspilot-Dateien mit `Plugin/src/…` ausgewiesen.
- **Vorarbeit:** `docs/research/0358-aktivitaets-versionierung.md` (Branch
  `research/0358-aktivitaets-versionierung`) — wird hier nicht wiederholt.

---

## Ergebnis in einem Satz

**Ein Anordnungs-Stand ist fünf Tabellen klein (gemessen ~0,4 KB gzip), und der Rückschreibweg
existiert bereits als öffentliche Struktur-API — er ist live verifiziert und funktioniert, solange
`quiz_has_attempts()` falsch ist.** Machen, mit einer harten Grenze: Nach dem ersten Versuch ist
die Anordnung nur noch Chronik, nicht wiederherstellbar — genau das muss die Lehrkraft vorab wissen.

## Empfehlung

| | |
|---|---|
| **Machen** | Schnappschuss der Anordnung (Teil 1) **und** Rückschreibweg (Teil 2) — zusammen ~350–450 Zeilen zusätzlich zu den ~750–850 aus #358 (Teil 4). |
| **Harte Grenze** | Rückschreiben nur vor dem ersten Versuch. Mit Versuchen: Chronik anzeigen, Wiederherstellung verweigern (Teil 2.2). |
| **Erwartung steuern** | Der Lehrkraft-Wunsch „Anordnung wiederherstellen, wenn Fragen im Test stehen" ist **nach** Versuchen nicht erfüllbar — `cannoteditafterattempts` ist eine Kernsperre, kein Plugin-Problem (Teil 2.2). |
| **Kein Scope-Creep** | Slot-Manipulation entsteht als internes Mittel des Rückschreibwegs, nicht als neues MCP-Werkzeug (Teil 4.2). |

---

# Teil 1 — Was gehört zu einem Anordnungs-Stand, und was kostet er?

## 1.1 Die fünf Tabellen

Ein Quiz-Anordnungs-Stand ist vollständig durch fünf Tabellen beschrieben:

| Tabelle | Felder (ohne `id`/`quizid`) | Rolle | Beleg |
|---|---|---|---|
| `quiz_slots` | `slot` (Position, unique je Quiz), `page` (Seitenumbruch), `displaynumber`, `requireprevious`, `maxmark`, `quizgradeitemid` | Reihenfolge, Seiten, Punkte, Abhängigkeiten, Anzeigenummer | `mod/quiz/db/install.xml:75-94` |
| `question_references` | `questionbankentryid`, `version` (NULL = „immer aktuellste Nicht-Entwurfs-Version") | **welche Frage** in jedem Slot liegt — je Slot genau eine Zeile (Unique-Index über `itemid`) | `lib/db/install.xml:1509-1526` |
| `question_set_references` | `questionscontextid`, `filtercondition` (JSON) | Zufallsfragen-Slots (Kategorie/Tags statt Einzelfrage) | `lib/db/install.xml:1528-1545` |
| `quiz_sections` | `firstslot`, `heading`, `shufflequestions` | Abschnittsgrenzen und -überschriften | `mod/quiz/db/install.xml:95-110` |
| `quiz_feedback` | `feedbacktext`, `feedbacktextformat`, `mingrade`, `maxgrade` | Gesamtfeedback je Notenband | `mod/quiz/db/install.xml:111-124` |

Dazu gehören **zwei Entscheidungen über den Rand**:

- `quiz_grade_items` (Mehrfach-Noten, `mod/quiz/db/install.xml:60-74`) und `quiz_slots.quizgradeitemid`
  sind Teil der Anordnung im weiteren Sinn. Sie sind für Kurspilot heute irrelevant (kein
  Schreibweg dafür), müssen aber als Feld im Slot-Schnappschuss mitlaufen, sonst bricht ein
  Rückschreiben bei Quizzen mit Mehrfach-Noten.
- `quiz_feedback` wird **nicht** über die Struktur-API geschrieben, sondern ausschließlich über das
  Quiz-Formular: `quiz_after_add_or_update()` löscht alle Zeilen und legt sie aus den Formularfeldern
  neu an (`mod/quiz/lib.php:1133-1160`). Das Feedback gehört damit in den Formularweg von #349 —
  nicht in den Struktur-Rückschreibweg. Ein Anordnungs-Schnappschuss ohne Feedback wäre trotzdem
  unvollständig; die Messung zählt es mit.

**Nicht** zum Anordnungs-Stand gehören: `quiz_overrides` (Lernenden-/Gruppendaten, Grenze der
Karte), `quiz_attempts` und alle `question_attempts`-Tabellen (Versuchsdaten), sowie die
Frageninhalte selbst — die bleiben in der Bank und werden nur referenziert (Teil 2.3).

## 1.2 Auflösung: was ein Slot tatsächlich zeigt

Die Frage eines Slots wird beim Laden über eine Kette aufgelöst, deren Mittelstück
`question_references.version` ist:

```sql
LEFT JOIN {question_versions} qv ON qv.questionbankentryid = qbe.id
      AND qv.version = COALESCE(qr.version,
                                latestversions.usableversion,   -- neueste Nicht-Entwurfs-Version
                                latestversions.anyversion)      -- sonst überhaupt neueste
```
(`mod/quiz/classes/question/bank/qbank_helper.php:147-151`)

Ein Schnappschuss muss also je Slot `questionbankentryid` + `version` speichern (beides steht in
`question_references`), nicht die `question.id` — die ist je Version flüchtig.

## 1.3 Gemessene Kosten

Methode (analog #358 Teil 5): je Quiz alle Zeilen der fünf Tabellen als JSON serialisiert, dabei
fluide IDs (`id`, `quizid`, `itemid`, `usingcontextid`, …) entfernt — ein Schnappschuss speichert
nur die positions- und bankstabilen Felder. Roh und `gzencode(…, 6)`.

**Bestand je Quiz** (n = 44 Quizze mit mindestens einem Slot, von 108 insgesamt):

| Größe | min | Median | p90 | max |
|---|---|---|---|---|
| `quiz_slots`-Zeilen | 1 | 3 | 16 | 35 |
| `question_references`-Zeilen | 1 | 3 | 16 | 35 |
| `question_set_references`-Zeilen (Zufallsslots) | 0 | 0 | 0 | 2 |
| `quiz_sections`-Zeilen | 1 | 1 | 2 | 2 |
| `quiz_feedback`-Zeilen | 0 | 2 | 3 | 3 |

**Bytes je Quiz** (vollständiger Anordnungs-Schnappschuss):

| | min | Median | p90 | max |
|---|---|---|---|---|
| roh (JSON) | 367 B | 1.018 B | 2.798 B | 5.822 B |
| **gzip-6** | 218 B | **391 B** | 472 B | 522 B |

**Bytes je Zeile** (Median / p90): `quiz_slots` 111 / 112 B, `question_references` 44 / 45 B,
`question_set_references` 436 B, `quiz_sections` 53 / 59 B, `quiz_feedback` 188 / 216 B.

**Sonderfälle auf der Instanz:** 0 Slots mit gepinnter Version (alle laufen auf „immer aktuellste"),
4 Zufallsslots, 5 Quizze mit mehr als einer Section, 38 mit Feedback. Größter Schnappschuss:
„Informatik Test Nr. 1 – PC-Grundlagen" (35 Slots, 522 B gzip).

**Einordnung:** ~0,4 KB gzip je Anordnungs-Version ist weniger als die Hälfte des
Aktivitäts-Vollstands aus #358 (Median 947 B). Speicher ist kein Argument — weder dafür noch
dagegen. Die Messinstanz hat kleine Quizze (Median 3 Slots); der Maximalwert (35 Slots → 522 B)
zeigt die Skalierung: ~155 B roh je zusätzlichem Slot, d. h. ein 60-Fragen-Quiz läge bei
~700–800 B gzip. Auch das ist unerheblich.

---

# Teil 2 — Der Rückschreibweg: Struktur-API, Grenzen, Verifikation

## 2.1 Die vollständige Operationsliste von `mod_quiz`

Alle Schreibwege der Edit-UI und der Webservices laufen durch `mod_quiz\structure` bzw. die
Slot-Klassen. Vollständige Liste der Struktur-Operationen:

| Operation | API | Versuchssperre | Auslöser der UI | Beleg |
|---|---|---|---|---|
| Frage hinzufügen | `quiz_add_quiz_question($questionid, $quiz, $page, $maxmark)` | nein (aber Edit-UI prüft vorher) | `edit.php` `addquestion`/`add` (`:98, :110`) | `mod/quiz/locallib.php:1749` |
| Zufallsfrage hinzufügen | `structure::add_random_questions()` → `slot_random::insert()` | ja (Edit-UI `:137`) | `edit.php` `addrandom`, WS `mod_quiz_add_random_questions` | `mod/quiz/classes/structure.php:1685`, `classes/local/structure/slot_random.php:200-231` |
| Slot verschieben (Reihenfolge + Seite) | `structure::move_slot($idmove, $idmoveafter, $page)` | **ja** (`check_can_be_edited` `:851`) | `edit_rest.php` `move` (`:109`) | `mod/quiz/classes/structure.php:848` |
| Slot entfernen | `structure::remove_slot($slotnumber)` | **ja** (`:1057`) | `edit_rest.php` DELETE/`deletemultiple` (`:156, :194`) | `mod/quiz/classes/structure.php:1054` |
| Seitenumbruch setzen/entfernen | `structure::update_page_break($slotid, $type)` | **ja** (`:1346`) | `edit_rest.php` `updatepagebreak` (`:144`) | `mod/quiz/classes/structure.php:1343` |
| Neu paginieren | `quiz_repaginate_questions()` | **ja** (`edit.php:87`) | `edit.php` `repaginate` | `mod/quiz/locallib.php:560-600` |
| Punkte je Slot | `structure::update_slot_maxmark($slot, $maxmark)` | **nein** — bewusst: aktualisiert laufende Versuche mit (`question_engine::set_max_mark_in_attempts` `:1162`) | `edit_rest.php` `updatemaxmark`, WS `mod_quiz_update_slots` | `mod/quiz/classes/structure.php:1152` |
| Fragenversion pinnen | `structure::update_slot_version($slotid, ?int $version)` — `null`/`0` = „immer aktuellste" | **nein** | WS `mod_quiz_set_question_version` | `mod/quiz/classes/structure.php:1193`, `classes/external/submit_question_version.php:62-78` |
| Abhängigkeit vom Vorgänger | `structure::update_question_dependency($slotid, $bool)` | nein | `edit_rest.php` `updatedependency`, WS `mod_quiz_update_slots` | `mod/quiz/classes/structure.php:1291` |
| Anzeigenummer | `structure::update_slot_display_number($slotid, $text)` | nein | inplace-editable `mod_quiz_inplace_editable` (`lib.php:1105`), WS `mod_quiz_update_slots` | `mod/quiz/classes/structure.php:1315` |
| Abschnitt anlegen | `structure::add_section_heading($page, $heading)` | nein in der API; Edit-UI prüft (`edit.php:129`) | `edit.php` `addsectionatpage` | `mod/quiz/classes/structure.php:1385` |
| Abschnittstitel / Shuffle / löschen | `set_section_heading()`, `set_section_shuffle()`, `remove_section_heading()` | nein in der API; UI blendet aus (`edit_renderer.php:442` u. a.) | `edit_rest.php` `updatesectiontitle`/`updateshufflequestions`/DELETE | `mod/quiz/classes/structure.php:1421, :1447, :1470` |
| Zufallsfilter ändern | WS `mod_quiz_update_filter_condition` | nein | Edit-UI | `mod/quiz/classes/external/update_filter_condition.php:62-110` |
| Mehrfach-Noten | `create/update/delete_grade_item()` | nein | WS `mod_quiz_create/update/delete_grade_items` | `mod/quiz/classes/structure.php:1576, :1618, :1647` |

Wichtig für die Einordnung: **Kurspilot hat heute nur eine dieser Operationen** — Frage hinzufügen
(`Plugin/src/local_coursepilot/classes/external/add_questions_to_quiz.php:67`, append-only über
`quiz_add_quiz_question()`). Alles Übrige ist Neuland für Kurspilot, aber **fertiger Kern-Code**.

## 2.2 Die Versuchssperre — wo sie wirklich sitzt

`structure::check_can_be_edited()` wirft `cannoteditafterattempts`, sobald `quiz_has_attempts()`
wahr ist (`mod/quiz/classes/structure.php:400-418`). Die Sperre schützt genau die
**Anordnungs-Operationen**: `move_slot` (`:851`), `remove_slot` (`:1057`), `update_page_break`
(`:1346`), `refresh_page_numbers_and_update_db` (`:1035`), dazu `repaginate` und das Hinzufügen in
`edit.php` (`:87, :100, :111, :129, :137`). Punkt-, Versions-, Abhängigkeits- und
Abschnittsoperationen sind **nicht** gesperrt (Punkte absichtlich, siehe Tabelle oben).

**Folge für das Rückschreiben:** Eine historische Anordnung lässt sich programmatisch
zurückschreiben, **genau solange keine Versuche existieren**. Mit Versuchen ist sie eingefroren —
weder per UI noch per API noch (sauber) per Plugin. Ein Wiederherstellungswerkzeug muss die Sperre
**vorher** prüfen und die Aktion verweigern, statt die Ausnahme abzufangen — dieselbe Linie wie
#358 Abschnitt 3.1.

**Erwartungsmanagement:** Der Wunsch der Lehrkraft zielt auf „Fragen stehen im Test" — also auf den
Fall **mit** Versuchen. Genau dort ist Wiederherstellung unmöglich. Der ehrliche Nutzen der Chronik
nach Versuchen ist: (a) sehen, welche Anordnung gefahren wurde, (b) Wiederherstellung **vor** dem
ersten Versuch bzw. nach Löschen aller Versuche, (c) Nachbau der Anordnung in einem neuen Quiz.

## 2.3 Was mit `question_references`/`version` passiert

- **Hinzufügen pinnt nie.** `quiz_add_quiz_question()` legt die Referenz stets mit `version = null`
  an — Kommentar im Code: *„Always latest"* (`mod/quiz/locallib.php:1873, :1889`).
- **Pinnen ist ein eigener Schritt.** `update_slot_version($slotid, $version)` schreibt
  `question_references.version` fest und validiert, dass die Version existiert — sonst
  `coding_exception` (`mod/quiz/classes/structure.php:1193-1212`). Die Edit-UI bietet dafür ein
  Versionsmenü je Slot (`structure::get_version_choices_for_slot()` `:819`).
- **Praktische Bedeutung fürs Rückschreiben:** Der Schnappschuss speichert je Slot
  `questionbankentryid` + `version`. Beim Rückschreiben wird jede Frage zunächst über
  `quiz_add_quiz_question()` (mit der `questionid` der gespeicherten Version) wieder hinzugefügt —
  das erzeugt `version = null` — und danach wird bei gepinnten Slots `update_slot_version()` mit dem
  gespeicherten Wert aufgerufen. Zwei Semantiken entstehen:
  - **Gepinnter Slot:** zeigt exakt die alte Fragenversion — solange die Bank sie noch hat.
    Fragenversionen werden nur zusammen mit dem ganzen Bank-Eintrag gelöscht; ist der Eintrag weg,
    ist der Slot unrettbar und das Werkzeug muss das als Fehler melden (der Kern kennt dafür den
    `missingtype`-Platzhalter, `qbank_helper.php:181-189`).
  - **Slot mit `version = null`:** zeigt beim Rückschreiben die **dann aktuellste** Version. Hat
    jemand die Frage inzwischen geändert, enthält die wiederhergestellte Anordnung den neuen
    Fragentext. Das ist dieselbe Semantik, die Moodle selbst für „immer aktuellste" definiert
    (ADR 0001 von Kurspilot übernimmt sie) — aber das Werkzeug sollte beim Wiederherstellen anzeigen,
  welche Slots so behandelt wurden.
- **Zwei weitere Kern-Einschränkungen:** dieselbe Frage (derselbe Bank-Eintrag) kann nicht zweimal
  in ein Quiz — `quiz_add_quiz_question()` gibt dann still `false` zurück
  (`mod/quiz/locallib.php:1787-1790`). Und `question_references` erlaubt genau eine Referenz je
  Slot (Unique-Index, `lib/db/install.xml:1522-1524`). Beides schränkt den Rückschreibweg nicht
  ein, weil der Schnappschuss dieselben Invarianten enthält — aber die Wiederherstellung muss die
  Reihenfolge „Slot anlegen → Referenz pinnen" einhalten.

## 2.4 Live-Verifikation des Rückschreibwegs

Auf der Messinstanz wurde der vollständige Zyklus in einer **zurückgerollten Transaktion**
durchgespielt (Quiz „Übungsaufgaben mit Feedback", id=2, 7 Slots, keine Versuche):

1. Schnappschuss (Reihenfolge, Seiten, `maxmark`, `requireprevious` je Slot),
2. Verwürfeln: letzten Slot per `move_slot()` an Position 1, `maxmark` auf 7,5,
   `requireprevious` gesetzt,
3. Rückschreiben ausschließlich über die öffentliche Struktur-API
   (`update_slot_maxmark`, `update_question_dependency`, `move_slot`),
4. Vergleich: **Reihenfolge, Seiten, Punkte, Abhängigkeiten identisch wiederhergestellt.**

```text
Vorher:    1p1m2q5 | 2p1m2q11 | 3p1m2q3 | 4p1m3q14 | 5p1m4q19 | 6p1m4q16 | 7p1m4q17
Verwürfelt: 1p1m7.5q17 | 2p1m2q5 | 3p1m2r1q11 | …
Danach:    1p1m2q5 | 2p1m2q11 | 3p1m2q3 | 4p1m3q14 | 5p1m4q19 | 6p1m4q16 | 7p1m4q17  → OK
```

Abschnitte (`add_section_heading`/`set_section_heading`/`set_section_shuffle`/
`remove_section_heading`) und Zufallsslots wurden nicht live, sondern per Code-Review verifiziert —
sie folgen demselben API-Muster (Teil 5, Unsicherheit 1).

Der Algorithmus ist damit kein Risiko mehr: Die Wiederherstellung ist eine Komposition aus
vier belegten Kern-APIs, nicht neue Moodle-Magie.

---

# Teil 3 — Aufhänger: decken die `mod_quiz`-Ereignisse alle Strukturänderungen ab?

## 3.1 Die 16 Struktur-Ereignisse und ihre Auslöser

`mod/quiz/classes/event/` enthält 46 Klassen; 16 davon sind Struktur-Ereignisse. **Jedes hat genau
einen Auslöser im Produktionscode** (Suche über den gesamten `mod_quiz`-Baum, Tests ausgenommen):

| Ereignis | Auslöser | Beleg |
|---|---|---|
| `slot_created` | `quiz_add_quiz_question()`, `slot_random::insert()` | `mod/quiz/locallib.php:1897`, `classes/local/structure/slot_random.php:221` |
| `slot_deleted` | `structure::remove_slot()` | `mod/quiz/classes/structure.php:1116` |
| `slot_moved` | `structure::move_slot()` | `:985` |
| `slot_mark_updated` | `structure::update_slot_maxmark()` | `:1167` |
| `slot_version_updated` | `structure::update_slot_version()` | `:1220` |
| `slot_grade_item_updated` | `structure::update_slot_grade_item()` | `:1270` |
| `slot_requireprevious_updated` | `structure::update_question_dependency()` | `:1296` |
| `slot_displaynumber_updated` | `structure::update_slot_display_number()` | `:1322` |
| `page_break_created` | `structure::update_page_break()` (UNLINK) | `:1366` |
| `page_break_deleted` | `structure::update_page_break()` (LINK) | `:1355` |
| `section_break_created` | `structure::add_section_heading()` | `:1401` |
| `section_break_deleted` | `structure::remove_section_heading()` | `:1480` |
| `section_title_updated` | `structure::set_section_heading()` | `:1429` |
| `section_shuffle_updated` | `structure::set_section_shuffle()` | `:1454` |
| `quiz_repaginated` | `quiz_repaginate_questions()` | `mod/quiz/locallib.php:592` |
| `quiz_grade_item_created` / `_updated` / `_deleted` | `structure::create/update/delete_grade_item()` | `mod/quiz/classes/structure.php:1602, :1631, :1660` |

Damit ist #358-Unsicherheit 5 für den Normalfall **belegt**: Jeder Schreibweg der Edit-UI
(`edit.php`, `edit_rest.php`) und jeder Struktur-Webservice (`mod_quiz_update_slots`,
`mod_quiz_set_question_version`, `mod_quiz_add_random_questions`, Grade-Item-WS) endet in einer
dieser Methoden und löst ihr Ereignis aus. Auch Kurspilots eigener Quiz-Schreibweg
(`add_questions_to_quiz.php:67`) läuft durch `quiz_add_quiz_question()` und ist damit sichtbar.

## 3.2 Die Lücken — Vollständigkeit widerlegt in drei Punkten

| Lücke | Beleg |
|---|---|
| **Zufallsfilter.** WS `mod_quiz_update_filter_condition` schreibt `question_set_references.filtercondition` direkt per `$DB->update_record()` — **ohne jedes Ereignis**. | `mod/quiz/classes/external/update_filter_condition.php:102-107` (gesamte Methode ohne `trigger()`) |
| **Gesamtfeedback.** `quiz_feedback` wird in `quiz_after_add_or_update()` geschrieben — Formularweg, also nur `\core\event\course_module_updated` (ohne Feldwerte, #358 Teil 4.1), kein `mod_quiz`-Ereignis. | `mod/quiz/lib.php:1133-1160` |
| **Restore/Import/Duplizieren und direkte DB-Schreibvorgänge** — dieselbe Lücke wie #358 Teil 4.3. | — |

Außerhalb von `mod_quiz` schreibt niemand in die Struktur-Tabellen (Suche über den gesamten
Quellbaum nach `insert_record('quiz_slots'` u. a., ohne Treffer außerhalb `mod/quiz/` und Tests) —
die Ereignislücken sind also vollständig aufgezählt.

Kuriosum am Rande: `quiz_grade_items_reordered` existiert als Ereignisklasse
(`mod/quiz/classes/event/quiz_grade_items_reordered.php:29`), wird aber **nirgends ausgelöst** —
die Sortierung von Mehrfach-Noten ist über keinen Schreibweg änderbar. Toter Code.

## 3.3 Folgerung für den Beobachter

Ein Beobachter auf den 16 Struktur-Ereignissen + `course_module_updated` deckt alle
Strukturänderungen ab **außer** dem Zufallsfilter; der fällt nur bei Quizzen mit Zufallsfragen ins
Gewicht und ist über den #358-Mechanismus erkennbar (Vollständiger Schnappschuss → Abweichung beim
nächsten Ereignis = „außerhalb des Verlaufs geändert"). Zwei praktische Anforderungen:

1. **Entprellen.** Eine einzige UI-Aktion löst mehrere Ereignisse aus (Umsortieren = `slot_moved`,
   Punktänderung im Bulk = ein `slot_mark_updated` je Slot). Der Schnappschuss muss je Quiz und
   Request/Transaktion konsolidieren, nicht je Ereignis.
2. **Keine interne Logik im Beobachter** — wie #358 Teil 4.4: Beobachterfehler sind stumm.

Ein eigener Kurspilot-Auslöser („bei jedem Kurspilot-Quiz-Schreibvorgang schnappschotten") ist
**nicht nötig**: Kurspilots Schreiben geht durch `quiz_add_quiz_question()` und feuert
`slot_created`.

---

# Teil 4 — Kosten

## 4.1 Zeilen gegenüber #358

Anker: #358 schätzt den Aktivitätsverlauf auf ~750–850 Zeilen (Teil 6.3), darin enthalten ein
Beobachter für „3 Kernereignisse + Quiz-Slot-Ereignisse" (~120 Zeilen) und Serialisierung der
Sub-Tabellen (~150 Zeilen). Zusätzlicher Aufwand für die Anordnung:

| Teil | Größenordnung |
|---|---|
| `db/events.php`-Registrierung der 16 Struktur-Ereignisse auf den bestehenden Beobachter | ~30 Zeilen |
| Entprellung (ein Schnappschuss je Quiz je Request) | ~40 Zeilen |
| Serialisierung der Referenz-Tabellen (`question_references`, `question_set_references`) zusätzlich zu den in #358 budgetierten Sub-Tabellen | ~40 Zeilen |
| Rückschreibweg: Wiederherstellungs-Algorithmus (Slots identifizieren, `move_slot`-Sequenz, Punkte/Abhängigkeiten/Versionen pinnen, Abschnitte nachbauen) — in Teil 2.4 live verifiziert | ~180–220 Zeilen |
| Vorprüfung und Warnpfade (`quiz_has_attempts()`, fehlende Bank-Einträge, „version-null"-Hinweis) | ~60–80 Zeilen |
| **Summe zusätzlich** | **~350–450 Zeilen** |

In Summe also **~1.100–1.300 Zeilen** für Aktivitätsverlauf + Anordnungsverlauf mit
Rückschreibweg. Die Byteseite ist vernachlässigbar (Teil 1.3: ~0,4 KB gzip je Version).

## 4.2 Slot-Manipulation: neue Fähigkeit oder Scope-Creep?

Der Rückschreibweg **braucht** Slot-Manipulation intern — ohne `move_slot()`/`remove_slot()` gibt
es kein Wiederherstellen. Die Frage ist nur, ob daraus ein Kurspilot-Werkzeug wird:

- **Als internes Mittel des Rückschreibwegs:** kein Scope-Creep. Die Fähigkeit existiert dann nur
  als Implementation hinter einer Wiederherstellungs-Aktion, die `moodle/course:manageactivities`
  und eine eigene Verlaufsfähigkeit voraussetzt (Muster #358 Teil 6.2).
- **Als exponiertes MCP-Werkzeug** („Fragen umsortieren/entfernen"): eine **neue Fähigkeit** jenseits
  von #351-Parität (die Parität verlangt nichts davon, weil es lokal nie einen
  Umordnungs-Schreibweg gab — `add_questions_to_quiz.php` ist append-only). Das wäre ein eigener
  Beschluss mit eigener Freigabe- und Testoberfläche.

**Empfehlung:** intern belassen. Die Moodle-Edit-UI kann alles besser sichtbar; der Kurspilot-Mehrwert
liegt in der Version, nicht im Drag-and-Drop-Ersatz.

---

# Teil 5 — Empfehlung: machen (mit harter Grenze)

**Machen — Schnappschuss und Rückschreibweg zusammen.** Begründung:

1. **Der Wunsch ist echt und der Preis ist klein.** ~0,4 KB gzip je Stand, ~350–450 Zeilen
   zusätzlich, und der Rückschreibweg ist fertiger Kern-Code, dessen Funktion live verifiziert
   wurde (Teil 2.4). Ein „nur Chronik"-Zwischenschritt würde fast dieselbe Arbeit zweimal kosten,
   weil Schnappschuss, Beobachter und Entprellung identisch sind.
2. **Die Chronik schließt die größte Einzellücke von #353.** Quiz-Substanz ist dort bewusst blind;
   die Anordnung ist der Teil der Quiz-Substanz, den eine Lehrkraft als „meine Anordnung" erlebt.
3. **Die Version-Pinning-Maschinerie ist ein Geschenk.** Weil der Kern `question_references.version`
   bereits trägt (Teil 2.3), kann der Verlauf zwischen „Anordnung mit damaligen Frageninhalten"
   (gepinnt) und „Anordnung mit heutigen Frageninhalten" (`version = null`) unterscheiden — eine
   Differenzierung, die Moodle selbst für seine Edit-UI anbietet.

**Zwei Bedingungen, nicht verhandelbar:**

- Rückschreiben **nur** nach `quiz_has_attempts() == false`, geprüft vor der Aktion. Mit Versuchen
  bleibt die Anordnung Chronik. Der Lehrkraft ist das vorher zu sagen — ihr Ausgangswunsch
  („wenn Fragen im Test stehen") liegt genau auf der gesperrten Seite.
- Slot-Manipulation bleibt internes Mittel, kein MCP-Werkzeug (Teil 4.2).

---

# Unsicherheiten und offene Punkte

1. **Abschnitte und Zufallsslots im Rückschreibweg nur per Code-Review verifiziert**, nicht live.
   Der live getestete Teil (Reihenfolge, Seiten, Punkte, Abhängigkeiten) ist der algorithmisch
   schwierigste; Abschnitte sind einfache Insert/Update/Delete-Ziele. Restrisiko: niedrig.
2. **Entprellungs-Design offen.** Ob der Beobachter je Request, je Transaktion oder per
   Debounce-Timer konsolidiert, ist eine Implementierungsentscheidung; die Ereignislage
   (Teil 3.3) erzwingt nur, dass konsolidiert wird.
3. **Zufallsfilter-Lücke** (Teil 3.2) ist unbehebbar, solange der Kern kein Ereignis ergänzt.
   Betroffen sind nur Quizze mit Zufallsfragen; der Abweichungs-Check aus #358 erkennt sie.
4. **Messinstanz hat kleine Quizze** (Median 3 Slots). Die p90/max-Werte sind belastbar, der
   „typische" 30-Fragen-Lehrkrafts-Test liegt dazwischen; die lineare Skalierung (~155 B roh je
   Slot) macht das Größenrisiko aber ohnehin unerheblich.
5. **`quiz_grade_items`/Mehrfach-Noten** sind auf der Messinstanz nicht belegt (0 Vorkommen) und
   im Rückschreibweg nur mitgeführt, nicht eingeübt. Vor einem Bau wäre ein Blick auf die
   Wiederherstellungsreihenfolge nötig (Grade-Items vor Slots, weil `quiz_slots.quizgradeitemid`
   auf sie zeigt).
6. **Wiederherstellung und gelöschte Bank-Einträge:** ist eine Frage samt aller Versionen aus der
   Bank gelöscht, schlägt das Rückschreiben für diesen Slot fehl. Das Verhalten ist belegt
   (`missingtype`-Platzhalter, `qbank_helper.php:181-189`), aber die Produktentscheidung —
   abbrechen, Slot überspringen, Platzhalter setzen — ist offen.
