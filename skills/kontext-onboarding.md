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

1. Pflichtkontext erfragen (siehe oben).
2. Kurz erklaeren, was angelegt wird und warum (z.B. "Ich lege
   `/.../local-context/2025-26/7a/CONTEXT.md` in deinem
   Kurspilot-Arbeitsbereich an – das Lerngruppenprofil haelt
   faecheruebergreifende Infos zur Klasse fest, lokal und nicht im Git-Repo.").
3. **Optionalen Planungskontext anbieten, nicht erzwingen**: Leistungsstand,
   besondere Lernbedarfe, Gruppendynamik, Sprachstand, technische
   Rahmenbedingungen (Lerngruppenprofil) bzw. Kompetenzstand, Arbeitsweisen,
   laufende Themen, Teststand (Fachprofil). Bei "spaeter"/"weiss ich noch
   nicht" einfach leer lassen (Platzhalter `_(noch nicht erfasst)_` bleibt
   stehen).
4. **Verwandten Kontext** nur als leichte Referenz abfragen (z.B. "Ist das
   eine Teilgruppe einer Stammklasse, oder gibt es eine verwandte
   Lerngruppe?"). Es wird nur ein Verweistext gespeichert – KEINE
   automatische Uebernahme von Inhalten aus dem verwandten Profil.
5. Vorschau der zu erstellenden CONTEXT.md(s) zeigen, dann auf Bestaetigung
   per `lib/local-context-setup.js` (`createLerngruppenprofil`,
   `createFachprofil`) anlegen. Bestehende Dateien werden nicht
   ueberschrieben.

## Vorlagen

Vorlagen liegen unter `templates/local-context/`:

- `lerngruppenprofil.CONTEXT.md` – Pflichtkontext, verwandter Kontext,
  faecheruebergreifende Beobachtungen, optionaler Planungskontext
- `fachprofil.CONTEXT.md` – Pflichtkontext, Verweis auf das Lerngruppenprofil
  (`../CONTEXT.md`), fachliche Besonderheiten, optionaler Planungskontext
