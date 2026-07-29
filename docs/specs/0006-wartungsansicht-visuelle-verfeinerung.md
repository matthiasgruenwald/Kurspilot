# 0006 – Wartungsansicht: visuelle Verfeinerung

## Problem Statement

Die Wartungsansicht von „Kurspilot konfigurieren“ erfüllt die Card- und
Instant-Save-Funktionen, wirkt für Lehrkräfte aber noch wie ein funktionales
Grundgerüst. Die Abstände, Card-Hierarchie und Schaltflächen vermitteln nicht
die ruhige, vertrauenswürdige Qualität des B2-Prototyps. Insbesondere fehlt
bei geöffneten Cards ein klarer visueller Zustand. Die sichtbare Übersicht der
MCP-Aktivitäten nimmt unnötig viel Höhe ein, wenn jede Aktivität als eigene
Checkbox-Zeile erscheint.

## Solution

Die Wartungsansicht erhält einen ruhigen, kompakten Arbeitsplatz-Stil für
Lehrkräfte. Semantische Design-Tokens steuern Farben, Abstände, Radien,
Schatten und Interaktionszustände. Header, Status, Cards und Schaltflächen
haben eine eindeutige Hierarchie. Die Hauptansicht zeigt weiterhin alle
konfigurierten MCP-Aktivitäten direkt lesbar, aber als umbruchfähige
Fließtextliste; die Auswahl mit einzelnen Checkboxen erscheint erst in der
geöffneten Card.

## User Stories

1. Als Lehrkraft möchte ich beim Öffnen sofort erkennen, dass Kurspilot korrekt läuft, damit ich die Einstellungen beruhigt wieder verlassen kann.
2. Als Lehrkraft möchte ich einen ruhigen, nicht nach technischem Provisorium wirkenden Aufbau sehen, damit ich den Konfigurator als verlässlichen Bestandteil meines Arbeitsalltags wahrnehme.
3. Als Lehrkraft möchte ich Titel, Untertitel und Status klar voneinander unterscheiden können, damit ich mich ohne Lesen langer Texte orientiere.
4. Als Lehrkraft möchte ich Cards mit gleichmäßigem Raster und nachvollziehbaren Abständen sehen, damit die Seite kompakt statt unruhig wirkt.
5. Als Lehrkraft möchte ich erkennen, welche Card gerade geöffnet ist, damit ich nicht versehentlich Einstellungen in einem anderen Bereich ändere.
6. Als Lehrkraft möchte ich beim Öffnen einer Card eine zurückhaltende, flüssige Rückmeldung erhalten, damit die Bedienung direkt und hochwertig wirkt.
7. Als Lehrkraft möchte ich für Speichern, Prüfen und Installieren klar hervorgehobene Schaltflächen sehen, damit die wichtigste nächste Handlung eindeutig ist.
8. Als Lehrkraft möchte ich weniger wichtige Aktionen wie „Ändern“ oder „Ersteinrichtung wiederholen“ dezent sehen, damit sie nicht mit der Hauptaktion konkurrieren.
9. Als Lehrkraft möchte ich „Dienst beenden“ eindeutig als gesonderte Aktion erkennen, damit ich ihn nicht versehentlich statt einer normalen Änderung auslöse.
10. Als Lehrkraft möchte ich beim Überfahren, Drücken, Fokussieren und Deaktivieren von Schaltflächen klare Rückmeldung erhalten, damit ich ihren Zustand zuverlässig erkenne.
11. Als Tastaturnutzer:in möchte ich einen sichtbaren Fokus und einen nachvollziehbaren Fokuswechsel in eine geöffnete Card erhalten, damit ich alle Einstellungen ohne Maus bedienen kann.
12. Als Lehrkraft möchte ich alle konfigurierten MCP-Aktivitäten direkt in der Hauptansicht lesen, damit ich ohne zusätzlichen Klick nachvollziehen kann, was Kurspilot bereitstellt.
13. Als Lehrkraft möchte ich die Aktivitätsnamen in einer kompakten, umbruchfähigen Zeile sehen, damit die Übersicht wenig Höhe verbraucht und dennoch vollständig bleibt.
14. Als Lehrkraft möchte ich beim Öffnen der Aktivitäten-Card die einzelnen Checkboxen untereinander sehen, damit ich die Auswahl eindeutig prüfen und ändern kann.
15. Als Lehrkraft möchte ich auf schmalen Bildschirmen ausreichend große Eingaben und Schaltflächen verwenden können, damit die Seite auch per Touch bedienbar bleibt.
16. Als Lehrkraft möchte ich Fehler und Speicherergebnisse verständlich und nahe an der betroffenen Card sehen, damit ich weiß, wie ich weiterkomme.
17. Als Maintainer möchte ich die Gestaltung über semantische Tokens steuern, damit die vorgesehene Dark-Mode-Arbeit nicht dieselben Werte erneut umbauen muss.
18. Als Maintainer möchte ich die bestehende Instant-Save- und Neustart-Logik unverändert lassen, damit die visuelle Verfeinerung keine Konfigurationsregressionen erzeugt.

## Implementation Decisions

- Die Wartungsansicht bleibt ein lokales, dependency-freies HTML/CSS/JavaScript-Interface; Server-Routen, Card-IDs und die Instant-Save-Verträge ändern sich nicht.
- Ein kleiner Satz semantischer CSS-Variablen definiert Oberfläche, Text, zurückgenommenen Text, Rahmen, Akzent, Erfolg, Gefahr, Fokus, Abstände, Radien und zwei Schattenstufen. Die Light-Mode-Werte werden jetzt umgesetzt; die Dark-Mode-Werte sind ausdrücklich nicht Teil dieses Vorhabens.
- Das visuelle Ziel ist ein ruhiger Lehrkraft-Arbeitsplatz, nicht Glassmorphism, ein Marketing-Bento-Grid oder ein datenreiches Dashboard.
- Der Header gruppiert Produktname und „Einstellungen“ eng. Der Gesundheitszustand erhält eine eigene, dezente Statusdarstellung statt eines bloßen Textpunkts.
- Das Card-Raster behält die bestehende responsive Spaltenlogik. Cards erhalten konsistente Innenabstände, einen moderaten Radius und eine subtile Standardbegrenzung. Der Zusammenfassungsbereich streckt kurze Cards, damit Cards derselben Rasterzeile optisch gleich hoch sind.
- Nur die aktuell geöffnete Card erhält einen sichtbaren offenen Zustand mit Akzent-Rahmen und zurückhaltender Erhöhung. Der bestehende Mechanismus zum Schließen aller anderen Cards bleibt maßgeblich.
- Schaltflächen werden in vier Rollen gestaltet: primär für Speichern und Installieren, sekundär für lokale Hilfsaktionen, tertiär für textnahe Navigation und destruktiv für das Beenden des Dienstes. Alle Rollen besitzen Hover-, Press-, focus-visible- und Disabled-Zustände; interaktive Flächen erfüllen mindestens 44px Höhe.
- Die Footer-Symbole werden nicht als Emoji verwendet. Falls Symbole bleiben, stammen sie aus einer einheitlichen SVG-Icon-Sprache und ergänzen einen sichtbaren Text.
- Beim Öffnen einer Card wird ihr Auslöser mit `aria-expanded` synchronisiert und der Tastaturfokus in das erste bedienbare Feld gelegt. Beim Schließen kehrt der Fokus zum Auslöser zurück.
- Erfolgsrückmeldungen bleiben höfliche Live-Statusmeldungen. Fehler werden zusätzlich als dringliche, verständliche Meldung an der betroffenen Card zugänglich gemacht.
- Die Zusammenfassung der MCP-Aktivitäten bleibt vollständig sichtbar und hat das Format „N Aktivitäten: Name · Name · …“. Sie verwendet normalen Zeilenumbruch und keine Haken oder Checkboxen. Die aufgeklappte Card zeigt weiterhin die vollständige vertikale Checkbox-Liste.
- Die komplette Aktivitätsliste bleibt nicht abgeschnitten; bei langen Bezeichnungen darf sie innerhalb der Card umbrechen, aber weder horizontal scrollen noch durch Auslassungspunkte Informationen verbergen.
- Die bestehende responsive Gestaltung wird mobile-first ergänzt. Bewegung bleibt auf kurze Opacity-/Transform-Übergänge begrenzt und wird bei `prefers-reduced-motion` reduziert.

## Testing Decisions

- Gute Tests prüfen sichtbares Verhalten und zugängliche Zustände, nicht konkrete CSS-Implementierungsdetails wie einzelne Hex-Werte oder Schattenwerte.
- Die vorhandenen Render-Tests sind der primäre Seam: Sie prüfen die Wartungsansicht mit synthetischem Setup-Status auf Text, semantische Attribute, Zustandsklassen und die vollständige Aktivitätsübersicht.
- Die vorhandenen HTTP-Tests bleiben der höchste Integrationsseam für die Wartungsansicht. Sie sichern, dass das Überarbeiten der Darstellung die Ansichtsauswahl, Instant-Saves, Neustart-Hinweise und den Dienst-Lebenszyklus nicht verändert.
- Neue Render-Tests prüfen insbesondere: vollständige Inline-Zusammenfassung der Aktivitäten ohne Checkbox-Markup, vertikale Checkboxen nur im geöffneten Detailbereich, Button-Rollen, mindestens einen focus-visible-Mechanismus, den offenen Card-Zustand sowie `aria-expanded`.
- Jede Umsetzungsscheibe benennt die später nötige Playwright-Abdeckung als Akzeptanzkriterium. Die Playwright-Tests werden jedoch bewusst nicht scheibenweise eingeführt oder ausgeführt: Sie folgen erst nach Abschluss aller visuellen Scheiben einschließlich Dark Mode als gemeinsame End-to-End-Abnahme.
- Die gemeinsame Playwright-Abnahme prüft die Ansicht bei 375px, 768px und großer Desktop-Breite, beide Farbschemata, den geöffneten Card-Zustand, die vollständige Aktivitätsübersicht, die wichtigsten Button-Zustände und die Tastaturbedienung. Sie ergänzt, statt ersetzt, die bestehenden Render- und HTTP-Tests.

## Out of Scope

- Umsetzung des bereits separat geplanten Dark Mode.
- Neue Funktionen, Cards, Server-Routen oder Änderungen an gespeicherten Konfigurationswerten.
- Änderung der Ersteinrichtungsansicht, des Batch-Save-Flows oder des Post-Save-Bildschirms.
- Neue Icon-Bibliotheken oder Laufzeit-Abhängigkeiten.
- Änderung der Auswahl- und Neustart-Semantik für Codex, Claude Desktop oder opencode.

## Further Notes

- Die vorhandene Card-Architektur aus Spec 0005 bleibt bestehen. Dieses Vorhaben schließt bewusst die Lücke zwischen der dort festgelegten B2-Card-Idee und ihrer visuellen Umsetzung.
- Die vollständige Sichtbarkeit der MCP-Aktivitäten ist eine explizite Produktentscheidung: Kompaktheit entsteht durch eine umbruchfähige Textliste, nicht durch das Verbergen der Namen.
- Die semantischen Tokens sind eine vorbereitende Struktur für Dark Mode, aber keine Vorwegnahme seiner Farbentscheidung.
- Die AFK-Reihenfolge ist: visuelle Grundlage, Card-Hierarchie, Aktivitätsübersicht, Dark Mode und erst danach die gemeinsame Playwright-Abnahme. Damit testet die Browser-Suite den vollständigen Zielzustand statt einen Zwischenstand.
