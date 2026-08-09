# 0007 – Ersteinrichtungsseite ablösen durch eine geführte Wartungsansicht

## Problem Statement

Lehrkräfte begegnen beim ersten Öffnen des Kurspilot-Konfigurators einer eigenen, sichtbar älteren Ersteinrichtungsseite: dicht gepackte Checkbox-Zeilen, ein einziges großes Batch-Formular, danach ein separater Post-Save-Screen mit Aufforderungen wie "Claude Desktop beenden / Später". Nach der Ersteinrichtung wechselt der Konfigurator auf die visuell ruhigere Wartungsansicht (Cards, Instant-Save, Dark-Mode-fähige semantische Tokens gemäß Spec 0006). Die alte Seite wirkt neben der Wartungsansicht altbacken, verwendet ein zweites, nicht gepflegtes UI-Vokabular und zwingt Lehrkräfte, denselben Konfigurator zweimal zu lernen.

Zusätzlich fehlen zwei Alltagsfähigkeiten: Wenn sich die Lehrkraft in der Wartungsansicht befindet und mit den gespeicherten Einstellungen etwas nicht stimmt (Token korrupt, MCP-Eintrag verschoben, Skill-Ablage kaputt), gibt es keinen "Einstellungen zurücksetzen"-Weg außer der Kommandozeile. Und die MCP-Aktivitäten-Card ist mit inzwischen zehn Aktivitäten in ihrer Kartenspalte zu eng — die Checkboxen laufen unangenehm untereinander weiter, obwohl daneben Platz frei bleibt.

## Solution

Die separate Ersteinrichtungsseite wird ersatzlos entfernt. Die Wartungsansicht ist ab sofort die einzige Ansicht des Konfigurators. Solange noch nicht alle Mindestbedingungen erfüllt sind, führt sie die Lehrkraft weich durch die offenen Punkte: ein Fortschrittsband oben, farbliche Markierung der offenen Cards, ein "Weiter zu …"-Primärbutton, der die nächste offene Card öffnet und den Fokus in ihr erstes Feld setzt. Cards bleiben in ihrer Reihenfolge sichtbar und bedienbar — es wird nichts gesperrt oder ausgegraut, damit die Lehrkraft die Gesamtübersicht schon während der Ersteinrichtung sieht und für spätere Änderungen kennt.

Damit die Fortschrittsanzeige nie bei 0 startet, erhält sie einen tautologischen Schritt 0 "Kurspilot-Programm läuft" — allein durch das Öffnen der Seite erfüllt. Der Zähler läuft dadurch von 1/6 bis 6/6. Sobald 6/6 erreicht wird und in derselben Session vorher etwas offen war, erscheint über den Cards ein deutlich sichtbares Erfolgsbanner "Kurspilot ist eingerichtet — Sie sind startklar", das bis zum Beenden des Konfigurator-Dienstes stehen bleibt. Wer den Konfigurator öffnet und ohnehin bereits 6/6 hat, sieht weder Fortschrittsband noch Banner — nur die ruhige Wartungsansicht.

Alle Inhalte, die heute nur auf der Ersteinrichtungsseite existieren, wandern in die passenden Cards: die Token-Anleitung inklusive lokaler SVG-Grafik in die Moodle-Card (dort standardmäßig aufgeklappt, solange kein Token gespeichert ist), die Option "Gemeinsame Skill-Ablage" in die KI-Clients-Card (dort sichtbar, sobald mindestens zwei Clients angehakt sind), die ImageMagick-Installation samt Plattenplatz-Postenliste in die Bildbearbeitungs-Card. Speichern erfolgt für alle Cards per Instant-Save — es gibt keinen Batch-Save-Vorgang und keinen Post-Save-Screen mehr; Neustart-Hinweise für laufende KI-Clients erscheinen unmittelbar in der Card, in der die Änderung gerade gespeichert wurde.

Wenn eine geöffnete Card mehr Platz braucht (Aktivitäten-Auswahl, Token-Anleitung mit Grafik), spannt sie sich im Card-Raster über zwei Spalten. Die übrigen Cards fließen im Auto-Fit-Grid um sie herum, ohne dass eine Card verdeckt wird. Der Inhalt in einer breit ausgeklappten Card verteilt sich auf zwei Textspalten, damit lange Checkbox-Listen kompakt lesbar bleiben. Auf schmalen Fenstern (nur eine Rasterspalte) bleibt die Card einspaltig. Nach dem Speichern schließt sich die Card nicht von selbst; sie bleibt offen, bis eine andere Card geöffnet wird — konsistent mit dem heutigen "nur eine Card offen"-Muster.

Der Footer erhält neben dem bestehenden "Dienst beenden" einen tertiär gestalteten Textlink "Einstellungen zurücksetzen". Er löst nach Bestätigungsdialog die vorhandene Deinstallations-Routine aus (Moodle-Zugangsdaten, MCP-Einträge in Claude Desktop / Claude Code / Codex / opencode, installierte Kurspilot-Skills werden entfernt); der Arbeitsordner der Lehrkraft und dessen Inhalte bleiben bewusst unberührt. Anschließend zeigt die Seite dieselbe geführte Wartungsansicht mit den entsprechend abgesenkten erfüllten Bedingungen. Die bisherige Route "Ersteinrichtung wiederholen" (und die dazugehörige In-Memory-Flag zum Erzwingen der alten Ersteinrichtungsansicht) entfällt zusammen mit der Ersteinrichtungsseite.

## User Stories

1. Als Lehrkraft möchte ich beim ersten Öffnen des Konfigurators dieselbe Kartenübersicht sehen wie im Wartungsbetrieb, damit ich das Bedienmuster nur einmal lerne.
2. Als Lehrkraft möchte ich beim ersten Öffnen sofort erkennen, welche Karten noch etwas von mir brauchen, damit ich weiß, wo ich anfange.
3. Als Lehrkraft möchte ich einen sichtbaren Fortschrittsbalken oben sehen, der aussagt "1 von 6" statt "0 von 5", damit ich das Gefühl habe, direkt einen Schritt geschafft zu haben.
4. Als Lehrkraft möchte ich einen "Weiter zu …"-Button sehen, der beim Klick die passende offene Card öffnet und den Fokus in ihr erstes Eingabefeld setzt, damit ich der Führung folgen kann, ohne selbst zu suchen.
5. Als Lehrkraft möchte ich alle Cards von Anfang an klickbar sehen, auch die noch nicht "an der Reihe" sind, damit ich die Übersicht behalte und nicht durch Sperren gedrängt werde.
6. Als Lehrkraft möchte ich, dass die offene Card nach dem Speichern offen bleibt und sich erst schließt, wenn ich eine andere Card öffne, damit ich die gerade gespeicherten Werte in Ruhe kontrollieren kann.
7. Als Lehrkraft möchte ich bei 6 von 6 erledigten Bedingungen ein deutliches, freundliches Erfolgsbanner "Kurspilot ist eingerichtet — Sie sind startklar" oberhalb der Cards sehen, damit ich den Abschluss der Ersteinrichtung spüre.
8. Als Lehrkraft möchte ich, dass dieses Banner bis zum Beenden des Konfigurator-Dienstes stehen bleibt, damit ich den Abschluss auch dann wahrnehme, wenn ich zwischenzeitlich zu einer anderen App wechsle.
9. Als Lehrkraft, die den Konfigurator öffnet und ohnehin bereits vollständig eingerichtet ist, möchte ich weder Fortschrittsband noch Erfolgsbanner sehen, damit die Wartungsansicht ruhig bleibt.
10. Als Lehrkraft ohne gespeicherten Moodle-Token möchte ich beim ersten Öffnen der Moodle-Card die Anleitung inklusive Screenshot direkt aufgeklappt sehen, damit ich den Token ohne einen zusätzlichen Klick erstellen kann.
11. Als Lehrkraft mit bereits gespeichertem Moodle-Token möchte ich die Token-Anleitung eingeklappt sehen, damit die Card ruhig wirkt.
12. Als Lehrkraft möchte ich die Token-Anleitung samt Grafik in einer sichtbar breiteren Card lesen, damit die Schrittfolge und der Screenshot nicht in einer engen Spalte abgeschnitten wirken.
13. Als Lehrkraft mit zwei angehakten KI-Clients möchte ich in der KI-Clients-Card die Option "Gemeinsame Skill-Ablage (empfohlen)" mit Erklärung sehen, damit ich bei Bedarf getrennte Kopien wählen kann.
14. Als Lehrkraft möchte ich, dass bei einem erneuten Speichern der KI-Clients-Card meine Wahl zur gemeinsamen Skill-Ablage erhalten bleibt, damit sich die Einstellung nicht stillschweigend auf den Standard zurücksetzt.
15. Als Lehrkraft möchte ich die ImageMagick-Installation in der Bildbearbeitungs-Card auslösen können und vorher die Plattenplatz-Posten sehen, damit ich weiß, was heruntergeladen wird.
16. Als Lehrkraft möchte ich beim Auslösen der ImageMagick-Installation während der laufenden Installation eine Fortschrittsanzeige in der Card sehen, damit ich weiß, dass etwas passiert und wie lange es noch dauert.
17. Als Lehrkraft möchte ich, dass die Bildbearbeitungs-Card nach abgeschlossener Installation von allein auf die neue Auswahlmöglichkeit sips/ImageMagick umschaltet, damit ich nicht die Seite neu laden muss.
18. Als Lehrkraft möchte ich in der Aktivitäten-Card alle konfigurierten MCP-Aktivitäten sehen, damit ich nicht raten muss, was Kurspilot bereitstellt.
19. Als Lehrkraft an einem breiten Bildschirm möchte ich beim Öffnen der Aktivitäten-Card zwei Kartenspalten breit sehen, damit die zehn (bald mehr) Checkboxen kompakt in zwei Textspalten passen, ohne dass ich scrollen muss.
20. Als Lehrkraft an einem schmalen Bildschirm möchte ich, dass die geöffnete Card einspaltig bleibt, damit nichts abgeschnitten wird.
21. Als Lehrkraft möchte ich, dass sich die übrigen Cards um die geöffnete breite Card herum neu anordnen, ohne dass eine Card verdeckt oder ausgeblendet wird, damit ich weiterhin die Gesamtübersicht sehe.
22. Als Lehrkraft möchte ich unmittelbar nach dem Speichern einer neustart-relevanten Änderung in derselben Card den Hinweis sehen, welche KI-Clients neu gestartet werden müssen — und Neustart-Buttons für laufende Codex- und Claude-Desktop-Prozesse, damit ich sie ohne Umweg beenden kann.
23. Als Lehrkraft, die Codex oder Claude Desktop bereits beendet hat, möchte ich beim nächsten Card-Save keinen erneuten Neustart-Button für diesen Client sehen, damit ich nicht zu einer sinnlosen Aktion aufgefordert werde.
24. Als opencode-Nutzer:in möchte ich in einer Card, deren Änderung für opencode relevant ist, den Hinweis "Beim nächsten opencode-Chat aktiv — kein Neustart nötig" sehen, damit ich das Fehlen eines Neustart-Buttons einordnen kann.
25. Als Lehrkraft möchte ich im Footer neben "Dienst beenden" den Textlink "Einstellungen zurücksetzen" finden, damit ich bei Problemen mit den gespeicherten Einstellungen einen sichtbaren Ausweg habe.
26. Als Lehrkraft möchte ich vor dem Zurücksetzen einen Bestätigungsdialog sehen, damit ich die Aktion nicht versehentlich auslöse.
27. Als Lehrkraft möchte ich nach dem Zurücksetzen, dass mein Arbeitsordner und dessen Inhalte unangetastet bleiben, damit ich keine eigenen Materialien verliere.
28. Als Lehrkraft möchte ich nach dem Zurücksetzen unmittelbar wieder in der geführten Wartungsansicht landen — mit dem passenden abgesenkten Fortschritt und wieder aufgeklappter Token-Anleitung — damit ich den nächsten Setup-Durchlauf ohne Neuladen der Seite starten kann.
29. Als Lehrkraft möchte ich, dass das Erfolgsbanner nach einem Zurücksetzen verschwindet, damit es nicht "startklar" behauptet, während ich gerade erst wieder anfangen muss.
30. Als Lehrkraft möchte ich das bisherige "Ersteinrichtung wiederholen" nicht mehr sehen, weil die neue Ansicht ohnehin sowohl Einrichtung als auch Wartung ist.
31. Als Tastaturnutzer:in möchte ich, dass die Führung — sowohl der "Weiter zu …"-Button als auch das Anspringen einer Card — den Fokus in das jeweils erste bedienbare Feld der Card setzt, damit ich ohne Maus fortfahren kann.
32. Als Tastaturnutzer:in möchte ich, dass eine breit geöffnete Card weiterhin `aria-expanded` und einen sichtbaren Fokusring nutzt, damit die neue Breite die Zugänglichkeit nicht verschlechtert.
33. Als Maintainer möchte ich, dass das Auto-Fit-Card-Raster, die semantischen Tokens, der Instant-Save-Vertrag pro Card und die Neustart-Semantik unverändert bleiben, damit der Umbau ausschließlich additiv und subtraktiv arbeitet, nicht umbauend.
34. Als Maintainer möchte ich, dass die entfernten Renderpfade (Ersteinrichtungsseite, Post-Save-Screen, `renderSetupResult`) samt zugehöriger Server-Routen (`/done`, `/finish-setup`, `/end-now`, `/skip`, `/restart-setup`) und der In-Memory-Flag zum Erzwingen der alten Ansicht ersatzlos verschwinden, damit kein toter Code liegen bleibt.
35. Als Maintainer möchte ich die vorhandene Deinstallations-Routine für den neuen Zurücksetzen-Endpunkt wiederverwenden, damit die Reset-Semantik zwischen Kommandozeile und Konfigurator identisch bleibt.
36. Als Maintainer möchte ich, dass die Umsetzung sowohl unter macOS als auch unter Windows (Parallels-VM laut CLAUDE.md) manuell verifiziert wird, bevor sie nach `main` gemergt wird, damit plattformspezifische Regressionen im Client-Neustart-Weg nicht unbemerkt bleiben.

## Implementation Decisions

### Ein einziger Renderpfad

Die Renderfunktion für die Ersteinrichtungsseite wird ersatzlos entfernt. Der einzige verbleibende Renderpfad ist derjenige, der heute die Wartungsansicht erzeugt. In diesem Pfad wird oberhalb der Cards das Fortschritts- oder Erfolgsband eingezogen, sobald der aktuelle Zustand es verlangt. Alle bisher nur in der Ersteinrichtung vorhandenen Inhalte werden in die passenden Cards überführt (siehe unten).

### Fortschritt und Erfolg

- Die bisherige Definition der Mindestbedingungen (fünf Bedingungen: Moodle-URL, Moodle-Token, Arbeitsordner, mindestens ein erkannter KI-Client, keine Reparatur nötig) wird um einen sechsten, tautologisch erfüllten Punkt "Kurspilot-Programm läuft" ergänzt. Der Zähler läuft von 1/6 bis 6/6.
- Solange der Zähler kleiner als das Maximum ist, zeigt die Seite oberhalb der Cards ein Fortschrittsband mit Balken, der Anzeige "n von 6" und einem Primärbutton "Weiter zu …", dessen Beschriftung sich aus der ersten offenen Bedingung ergibt. Der Klick öffnet die zugehörige Card, schließt eine ggf. offene andere Card und setzt den Tastaturfokus in das erste bedienbare Feld der Card.
- Beim Wechsel des Zählers auf das Maximum innerhalb derselben Session verschwindet das Fortschrittsband und stattdessen erscheint ein deutlich sichtbares Erfolgsbanner "Kurspilot ist eingerichtet — Sie sind startklar". Das Erfolgsbanner bleibt bis zum Beenden des Konfigurator-Prozesses sichtbar. Der Server merkt sich für diesen Zweck einmalig, ob während der laufenden Session der Zähler jemals unter dem Maximum lag (In-Memory-Flag, analog zur heutigen Flag zum Erzwingen der alten Ansicht — die entfällt zusammen mit der alten Ansicht, die neue Flag ersetzt sie in Anzahl der Zustände).
- Wer den Konfigurator öffnet, ohne dass jemals ein Punkt offen war, sieht weder Fortschrittsband noch Erfolgsbanner.
- Ein Zurücksetzen setzt die "war unvollständig"-Flag zurück, damit das Erfolgsbanner nicht direkt nach dem Reset erscheint.

### Cards, Inhalte, Instant-Save

- **Moodle-Card**: enthält Moodle-URL, Moodle-Token (als Passwort-Feld) und die vollständige Token-Anleitung (Fließtext und lokal ausgelieferte SVG-Grafik). Die Anleitung wird über ein aufklappbares Detail-Element angeboten, das im Fall eines noch nicht gespeicherten Tokens standardmäßig geöffnet ist. Das Speichern bleibt Instant-Save. **Korrektur (Issue #245):** Die ursprüngliche Annahme, ein Neustart-Hinweis sei entbehrlich, weil der MCP-Server Moodle-URL und -Token pro Anfrage aus dem Schlüsselbund liest, war falsch — `scripts/start-mcp.js` liest die Zugangsdaten einmal beim Start des MCP-Kindprozesses. Laufende Codex-/Claude-Prozesse behalten die alte URL/den alten Token bis zum Neustart; die Moodle-Card zeigt dafür seit Issue #245 einen Neustart-Hinweis.
- **Arbeitsordner-Card**: unverändert (Pfadfeld, "Ordner wählen…"-Dialog).
- **KI-Clients-Card**: enthält weiterhin die Client-Checkboxen. Sobald zwei Checkboxen aktiv sind, wird zusätzlich die Option "Gemeinsame Skill-Ablage (empfohlen)" mit ihrer Erklärung sichtbar. Der Instant-Save der Card überträgt jetzt zusätzlich diese Option, damit ein späteres Speichern die Wahl der Lehrkraft nicht auf den Standardwert zurücksetzt.
- **Aktivitäten-Card**: unverändert im Datenmodell (Checkboxen aller konfigurierten MCP-Aktivitäten). Neu ist ihr Verhalten beim Öffnen: sie spannt sich über zwei Kartenspalten, ihre Checkboxen erscheinen in zwei Textspalten.
- **Bildbearbeitungs-Card** (bisher "crop-backend"): enthält jetzt zusätzlich zur Radio-Auswahl sips/ImageMagick den Installations-Weg für ImageMagick, inklusive der bereits heute in der Ersteinrichtung ausgewiesenen Plattenplatz-Posten. Auf Windows ist die Installation der Standardfall (weil ImageMagick dort der einzige Crop-Pfad ist), die Radio-Auswahl entfällt bis beide Backends verfügbar sind — beide Zustände waren bereits in der Ersteinrichtung so vorgesehen und wandern verhaltensgleich in die Card. Die Installation läuft asynchron per Polling: der Instant-Save startet den Prozess und antwortet sofort, die Card fragt einen zusätzlichen Status-Endpunkt im Sekundentakt ab, zeigt einen Fortschrittsindikator und wechselt nach Abschluss auf die neue Auswahlmöglichkeit. Wird der Konfigurator-Tab während der Installation neu geladen, findet die Card den laufenden Installationsprozess über denselben Status-Endpunkt wieder.
- **Version-Card**: unverändert.

Das bisherige Batch-Save-Formular (POST auf den Sammelendpunkt), der Post-Save-Screen mit dem Client-Beenden-Dialog sowie die zugehörigen Render- und Server-Routen werden ersatzlos entfernt. Instant-Save ist der einzige Speicherweg.

### Aufweitung geöffneter Cards

- Alle Cards öffnen sich standardmäßig innerhalb ihrer eigenen Rasterspalte. Cards, deren Inhalt es rechtfertigt (Moodle-Card mit sichtbarer Token-Anleitung samt SVG, Aktivitäten-Card mit langer Checkbox-Liste), öffnen sich zwei Rasterspalten breit.
- Umsetzung im Auto-Fit-Card-Raster über eine CSS-Klasse, die `grid-column: span 2` setzt. In Fenstern, in denen ohnehin nur eine Rasterspalte existiert, wird der Spann-Wert auf `auto` reduziert (Media Query), damit keine leeren Zellen entstehen. Der Inhalt einer breit geöffneten Card ordnet sich über `column-count: 2` in zwei Textspalten.
- Bewusste Nicht-Entscheidung: keine Drei-Spalten-Öffnung. Wer breit genug Bildschirm hat, sieht die Nachbar-Cards weiterhin, es wird nichts verdeckt und keine Card ausgeblendet.

### Weiches Führen, kein Sperren

- Cards werden nicht gesperrt oder ausgegraut, wenn ihre Vorbedingung noch nicht erfüllt ist. Die Führung wirkt ausschließlich über die visuelle Markierung offener Cards und den "Weiter zu …"-Button des Fortschrittsbandes. Das "Nur eine Card offen"-Muster der heutigen Wartungsansicht bleibt bestehen — mit der Präzisierung, dass sich eine gespeicherte Card nicht von selbst schließt, sondern erst wenn eine andere Card geöffnet wird.

### Einstellungen zurücksetzen

- Neuer HTTP-Endpunkt für das Zurücksetzen. Der Endpunkt ruft die vorhandene, nicht-interaktive Deinstallations-Routine mit ihrer heutigen Semantik auf (Moodle-Zugangsdaten aus dem Schlüsselbund, MCP-Einträge in Claude Desktop / Claude Code / Codex / opencode, installierte Kurspilot-Skills; Arbeitsordner der Lehrkraft bleibt unberührt). Nach dem Aufruf setzt der Endpunkt die "war unvollständig"-Flag zurück und liefert dieselbe geführte Wartungsansicht mit dem entsprechend abgesenkten Fortschritt.
- Auslöser in der UI ist ein tertiär gestalteter Textlink im Footer neben dem bestehenden "Dienst beenden". Klick löst über die Browser-Bestätigung ein `confirm()` aus, bevor der Endpunkt aufgerufen wird.
- Die bisherige Route zum Erzwingen der alten Ersteinrichtungsansicht entfällt, weil die alte Ansicht selbst entfällt.

### Route-Bereinigung

- Entfernt werden die Server-Routen für Batch-Save, das Beenden einzelner Clients aus dem Post-Save-Screen, das explizite Überspringen von Client-Neustarts, das explizite Abschließen der Ersteinrichtung und das Erzwingen der alten Ansicht. Der zentrale Router-Tisch der Setup-Server-Datei wird entsprechend gekürzt, keine Verhaltensänderung an den verbleibenden Routen.
- Ergänzt werden zwei Endpunkte: der Reset-Endpunkt und der Status-Endpunkt für die laufende ImageMagick-Installation.

### Datenverträge

- Der bestehende Instant-Save-Rückgabetyp (`{ ok, restartRequired, newStatus }`) bleibt unverändert. Die KI-Clients-Card akzeptiert zusätzlich das Feld für die Gemeinsame-Skill-Ablage-Option; wird das Feld nicht mitgeschickt (z. B. weil nur ein Client angehakt ist), gilt der bestehende Serverdefault.
- Der Status-Endpunkt für die ImageMagick-Installation liefert einen kleinen JSON-Bericht mit einem der Zustände "läuft", "erfolgreich" oder "fehlgeschlagen" plus optionaler Fortschrittsanzeige und Fehlermeldung. Die Card pollt bis auf einen Endzustand.
- Der Reset-Endpunkt liefert einen JSON-Bericht analog zur bestehenden Deinstallations-Routine; die Card reagiert mit einem Neuladen der Seite, damit der abgesenkte Fortschrittszustand direkt gerendert wird.

## Testing Decisions

Gute Tests messen sichtbares Verhalten über die höchsten bereits vorhandenen Seams — den HTTP-Server für Fluss- und Zustandslogik, die reine Datentransformation dort, wo sie freistehend ist. Es wird nicht auf CSS-Werte, konkrete HTML-Struktur oder DOM-Attribute geprüft, außer wo diese der Kontrakt sind (z. B. `aria-expanded`, sichtbare Fokus-Reihenfolge, Vorhandensein eines Erfolgsbanners im Markup).

- **HTTP-Tests** über den Setup-Server als primärer Seam (analog zu den vorhandenen Server-Tests): Die geführte Wartungsansicht wird durch die einzige aktive Antwort auf den Start-Endpunkt geprüft — für Ausgangszustände mit 1/6 bis 6/6. Getestet werden das Vorhandensein bzw. Fehlen des Fortschrittsbands, das Vorhandensein bzw. Fehlen des Erfolgsbanners in Abhängigkeit von der "war unvollständig"-Flag, die korrekte Nächste-offene-Card-Beschriftung des Weiter-Buttons, die neuen Endpunkte für das Zurücksetzen und den Installations-Status (inklusive Polling-Übergang von "läuft" auf "erfolgreich") sowie die Reduktion der KI-Clients-Card-Antwort um die neu übertragene Gemeinsame-Skill-Ablage-Option.
- **Regressionstests der verbleibenden Endpunkte**: Alle Instant-Save-Endpunkte (Moodle, Arbeitsordner, KI-Clients, Aktivitäten, Bildbearbeitung, Version-Update) behalten ihre bestehenden Verträge; die vorhandenen Assertionen werden unverändert übernommen. Für die entfernten Endpunkte werden die zugehörigen Tests ersatzlos gelöscht.
- **Datentransformationstests** für die Fortschrittsdefinition (Schritt 0 tautologisch, Zähler bis 6/6), analog zu den heutigen freistehenden Tests der Mindestbedingungen. Ein zusätzlicher Test belegt die Invariante, dass Zähler-am-Maximum genau bedeutet "alle Mindestbedingungen sind erfüllt".
- **Renderfragmenttests** für neue Elemente (Fortschrittsband, Erfolgsbanner, Zurücksetzen-Link, breit geöffnete Card, aufgeklappte Token-Anleitung bei fehlendem Token) mit Substring-Assertionen auf das erzeugte Markup — kein CSS-Detail-Vergleich.
- **Manuelle Plattformverifikation** ist Merge-Voraussetzung: macOS und Windows (Parallels-VM). Geprüft werden die geführte Ersteinrichtung ohne Punkt-Vorbedingung, das Erscheinen des Erfolgsbanners, das Zurücksetzen samt anschließend abgesenktem Fortschritt, die ImageMagick-Installation mit laufender Polling-Anzeige, die Aktivitäten-Card in ihrer Zwei-Spalten-Öffnung und die Neustart-Buttons für Codex und Claude Desktop.
- **Playwright** bleibt der später einzuführende End-to-End-Seam gemäß der bereits geplanten gemeinsamen Playwright-Abnahme (siehe Spec 0006). Für den hier beschriebenen Umbau werden die Playwright-Tests nicht scheibenweise nachgezogen, sondern in derselben späteren Sammelabnahme mitgeprüft.

## Out of Scope

- Ein linearer Wizard mit ein-Feld-pro-Seite. Die geführte Wartungsansicht bleibt eine einzige Seite; Führung entsteht durch Markierung und Weiter-Button, nicht durch Screenwechsel.
- Persistente Historie ("Was habe ich zuletzt geändert?"), Rollen-/Rechte-Trennung, mehrere Nutzeransichten.
- Dark Mode. Der bestehende Dark-Mode-Zustand der Wartungsansicht bleibt intakt und wird durch diesen Umbau weder erweitert noch verändert.
- Der ohnehin schon separat geplante Router-Tisch-Refactor und die CSRF-Token-Schicht (Specs 0004/0005) werden nicht angefasst; die neuen Endpunkte fügen sich in dieselbe Struktur.
- Auswahl-Reset pro Bereich. Das Zurücksetzen entfernt genau den heutigen Deinstallations-Umfang; feingranulare Auswahl wäre ein eigenes Vorhaben.
- opencode-Prozess-Neustart. opencode lädt MCP-Konfigurationen bei jedem neuen Chat frisch; das Verhalten aus Spec 0005 (reine Hinweiszeile in der Card) bleibt gültig.

## Further Notes

- Bezug zu vorhandenen ADRs und Specs: Der Umbau setzt die in Spec 0005 begonnene Card-Architektur fort, konsolidiert die in Spec 0006 verfeinerte visuelle Sprache auf die verbleibende einzige Ansicht und behebt zwei Nebenbaustellen (fehlender Reset in der Wartung; Enge der Aktivitäten-Card durch inzwischen zehn Aktivitäten). Er entfernt bewusst das Konzept "zwei Ansichten", das in beiden vorangegangenen Specs noch als gegeben angenommen wurde.
- Sprachliche Regelung nach CLAUDE.md: deutsche Nutzertexte, englische Bezeichner. Die vorhandene UI-Sprache der Cards ("KI-Clients", "MCP-Aktivitäten", "Arbeitsordner", "Dienst beenden") wird eins zu eins übernommen.
- Konsequenz für Lehrkräfte, die Kurspilot bereits eingerichtet haben: keine Migration nötig — beim nächsten Öffnen sehen sie dieselbe Wartungsansicht wie heute, weiterhin ohne Fortschrittsband, weiterhin mit denselben gespeicherten Werten.
