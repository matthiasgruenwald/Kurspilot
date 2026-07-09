# Referenz: Kontext-Onboarding (lokaler Lehrkraft-Kontext)

Lies diese Datei beim bewusst gestarteten Einrichten des lokalen Kurspilot-
Kontexts (`kurspilot-einrichten`) oder wenn eine Startformulierung mehrdeutig
ist und geklaert werden muss, welche Klasse/welches Fach gemeint ist.

Bevor eine Lernsituation in Moodle aufgebaut wird, kann passender **Kurskontext**
aus `local-context/` genutzt werden (Lerngruppenprofil + Fachprofil). Dieser
Ordner ist **nicht** Teil des Git-Repos (siehe `.gitignore` und
`docs/adr/0003-allow-local-student-names-in-teacher-context.md`) und darf echte
Schuelernamen enthalten.
Der Grundordner wird nicht aus dem aktuellen Repo oder Chat geraten, sondern vor
jeder lokalen Dateioperation aus der gespeicherten **Arbeitsbereich-Einstellung**
des Kurspilot-Konfigurationsprogramms gelesen (siehe Arbeitsbereich-Regel in
`kurspilot-core.md`). Fehlt diese Einstellung oder ist sie nicht lesbar,
verweist Kurspilot auf das Konfigurationsprogramm statt nach einem Ersatzpfad
im Chat zu fragen.
Vor Planung, Umsetzung oder anderen Schreibschritten liest Kurspilot zuerst den
bestehenden lokalen Kurspilot-Kontext in der vereinbarten Reihenfolge.

Lehrkraft-Materialordner duerfen einen sichtbaren **Wegweiser** enthalten. Der
einzige kanonische Dateiname ist `KURSPILOT.md`. Dieser Wegweiser nennt den
Startkontext fuer die aktuelle Materialordner-Ebene; er ist kein Index aller
Kind-Unterrichtsvorhaben. `plan.md`, `status.md`, Journale und
Materialnotizen werden nicht im Materialordner geschrieben, sondern nur im
konfigurierten Kurspilot-Arbeitsbereich unter `local-context/`.

## Kurze Kontextklaerung bei Mehrdeutigkeit

Wenn eine Startformulierung mehrere Klassen, Faecher oder Themen meinen koennte,
stellt Kurspilot eine kurze Rueckfrage mit wenigen passenden Kandidaten – statt
den falschen Kontext stillschweigend anzunehmen oder lange Rueckfragen zu stellen.

Beispiel:
> **Lehrkraft:** "Mach mit Bio weiter."
> **Kurspilot:** "Ich habe zwei offene Planungen fuer Bio gefunden: 7a
> (Photosynthese) und 7c (Zellaufbau). Welche meinst du?"

## Wann startet das Setup?

Nur als bewusst gestartete **Setup-Option** – nicht automatisch. Typische
Ausloeser sind natuerliche Formulierungen wie:

- "Richte den Kontext fuer 7a Nawi ein"
- "Lege ein Lerngruppenprofil fuer die 7a an"
- "Setup fuer meine Klasse/Lerngruppe"

Wenn `local-context/<schuljahr>/<klasse>/CONTEXT.md` bereits existiert, das
Setup nicht erneut anbieten, sondern auf den vorhandenen Kontext hinweisen.

## Pflichtkontext (immer abfragen)

Nur diese drei Angaben sind zwingend:

1. **Schuljahr** (z.B. `2025-26`)
2. **Klasse oder Lerngruppe** (z.B. `7a`; bei geteilten/gemischten Gruppen ein
   eigener Lerngruppenname als **eigenstaendige Teilgruppe**, z.B.
   `7a-e-kurs-nawi` – liegt als eigener Ordner direkt unter dem Schuljahr,
   NICHT verschachtelt unter `7a`)
3. **Fach/Unterrichtsordner** (z.B. `naturwissenschaften`) – nur wenn ein
   Fachprofil angelegt werden soll

Erlaubt sind Buchstaben, Ziffern, `-` und `_`. Keine Pfadtrenner oder `..`.

## Pfadlogik

Pfade werden ueber `lib/local-context-paths.js` berechnet:

| Funktion | Ergebnis |
|---|---|
| `getLerngruppenContextFile(schuljahr, klasse)` | `local-context/<schuljahr>/<klasse>/CONTEXT.md` |
| `getFachprofilContextFile(schuljahr, klasse, fach)` | `local-context/<schuljahr>/<klasse>/<fach>/CONTEXT.md` |

Teilgruppen (z.B. `7a-e-kurs-nawi`) sind eigene `<klasse>`-Werte und liegen
dadurch automatisch als eigenstaendiger Ordner direkt unter dem Schuljahr.
Die relativen Pfade werden dabei immer mit dem konfigurierten
Kurspilot-Arbeitsbereich kombiniert.

## Setup-Ablauf (Erklaerendes Setup)

Sechs nummerierte Schritte, jeder mit einem pruefbaren Abschlusskriterium.
Einrichten ist erst fertig, wenn Schritt 6 sein Abschlusskriterium erfuellt –
also wenn die Setup-Abschlussweiche angeboten wurde.

### Schritt 1: Pflichtkontext erfragen

Schuljahr, Klasse/Lerngruppe und ggf. Fach/Unterrichtsordner abfragen (siehe
Pflichtkontext oben).

**Abschlusskriterium:** Alle noetigen Pflichtangaben (mindestens Schuljahr und
Klasse/Lerngruppe) liegen vor.

### Schritt 2: Anlage erklaeren

Kurz erklaeren, was angelegt wird und warum (z.B. "Ich lege
`/.../local-context/2025-26/7a/CONTEXT.md` in deinem Kurspilot-Arbeitsbereich
an – das Lerngruppenprofil haelt faecheruebergreifende Infos zur Klasse fest,
lokal und nicht im Git-Repo.").

**Abschlusskriterium:** Die Lehrkraft kennt Zielpfad und Zweck der
anzulegenden Datei(en), bevor Inhalte erfragt werden.

### Schritt 3: Optionalen Planungskontext anbieten

Anbieten, nicht erzwingen: Leistungsstand, besondere Lernbedarfe,
Gruppendynamik, Sprachstand, technische Rahmenbedingungen
(Lerngruppenprofil) bzw. Kompetenzstand, Arbeitsweisen, laufende Themen,
Teststand (Fachprofil). Bei "spaeter"/"weiss ich noch nicht" einfach leer
lassen (Platzhalter `_(noch nicht erfasst)_` bleibt stehen).

**Abschlusskriterium:** Jedes optionale Feld wurde entweder befuellt oder
bewusst mit Platzhalter uebersprungen – keine stillschweigend ausgelassene
Frage.

### Schritt 4: Verwandten Kontext abfragen

Nur als leichte Referenz abfragen (z.B. "Ist das eine Teilgruppe einer
Stammklasse, oder gibt es eine verwandte Lerngruppe?"). Es wird nur ein
Verweistext gespeichert – KEINE automatische Uebernahme von Inhalten aus dem
verwandten Profil.

**Abschlusskriterium:** Die Frage nach verwandtem Kontext wurde gestellt und
beantwortet oder ausdruecklich uebersprungen.

### Schritt 5: Vorschau zeigen und nach Bestaetigung anlegen

Vorschau der zu erstellenden CONTEXT.md(s) zeigen, dann erst auf Bestaetigung
per `lib/local-context-setup.js` (`createLerngruppenprofil`,
`createFachprofil`) anlegen. Bestehende Dateien werden nicht ueberschrieben.
Ohne bestaetigte Vorschau wird keine Datei angelegt.

**Abschlusskriterium:** Die Lehrkraft hat die Vorschau bestaetigt, und die
Datei(en) existieren danach exakt wie in der Vorschau gezeigt (oder das
Anlegen wurde mangels Bestaetigung bewusst nicht ausgefuehrt).

### Schritt 6: Setup-Abschlussweiche anbieten

Kurz anbieten, wie es weitergeht: jetzt planen (`kurspilot-planen`), einen
bereits freigegebenen Plan umsetzen (`kurspilot-umsetzen`) oder spaeter
weiterarbeiten.

**Abschlusskriterium:** Einrichten ist fertig, wenn die Setup-Abschlussweiche
angeboten wurde – unabhaengig davon, welche Option die Lehrkraft waehlt.

## Vorlagen

Vorlagen liegen unter `templates/local-context/`:

- `lerngruppenprofil.CONTEXT.md` – Pflichtkontext, verwandter Kontext,
  faecheruebergreifende Beobachtungen, optionaler Planungskontext
- `fachprofil.CONTEXT.md` – Pflichtkontext, Verweis auf das Lerngruppenprofil
  (`../CONTEXT.md`), fachliche Besonderheiten, optionaler Planungskontext
