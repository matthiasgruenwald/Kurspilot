# Kurspilot

Kurspilot ist die lehrkraftsichtbare Weiterentwicklung des MoodleMCP-Ansatzes. Technisch bleibt MoodleMCP der Herkunfts- und Referenzpunkt: ein MCP-basierter Automatisierungsbaustein, der bestehende Moodle-Kurse mit Unterrichtsmaterialien, Unterrichtseinheiten und Unterthemen befuellt. Fuer die aktuelle Einfuehrung ist das Ziel ein zuverlaessiger Golden Path in Codex, mit zusaetzlicher Claude-Kompatibilitaet wenn sie ohne Mehrfragilitaet erreichbar ist.

## Language

**Bestehender Kurs**:
Ein in Moodle bereits angelegter Kurs, der durch MoodleMcp befuellt und strukturiert wird.
_Avoid_: neu erzeugter Kurs, automatische Kursanlage

**Kursbefuellung**:
Das Anlegen und Aktualisieren von Kursabschnitten und Aktivitaeten innerhalb eines bestehenden Kurses.
_Avoid_: Kursanlage, reine Moodle-Handarbeit

**Kursumfang**:
Die fachliche Groesse, die ein Moodle-Kurs abbildet; er kann eine Unterrichtseinheit oder ein kleineres Thema beziehungsweise Unterthema enthalten.
_Avoid_: nur eine feste Kursgroesse, Kurs immer als ganze Jahresplanung

**Abschnittsentscheidung**:
Die Klaerung, ob MoodleMcp vorhandene Kursabschnitte befuellt oder neue Abschnitte innerhalb eines bestehenden Kurses anlegt beziehungsweise umbenennt.
_Avoid_: ungefragtes Strukturieren, stilles Ueberschreiben vorhandener Abschnitte

**Allgemeiner Kursabschnitt**:
Der Moodle-Abschnitt 0 beziehungsweise "Allgemeines" eines Kurses. Er wird wie andere Kursabschnitte behandelt und darf fachlich geplante Kursinformationen enthalten, zum Beispiel Regeln, Kursueberblick oder allgemeine Materialien. Seine besondere Bedeutung liegt darin, dass er vor den Themen steht und fuer Lehrkraefte sichtbar als allgemeiner Kursvorspann gelesen wird. Prozessdaten, Versionierung, Planungsnotizen, Debug-Hinweise, Statusberichte, Verlaufsspeicher oder automatisch erzeugte Einstiegskarten gehoeren nicht ungefragt in diesen Abschnitt, sondern in den lokalen Kurspilot-Arbeitsbereich unter `local-context/`.
_Avoid_: Abschnitt 0 als technischer Ablageort fuer Kurspilot, "Allgemeines" mit Kurspilot-Prozessmuell fuellen, Versionierung direkt im Moodle-Kurs speichern, Kursueberblick und Arbeitsjournal vermischen

**Abschnittsverschiebung**:
Eine gezielte Moodle-Aenderung, bei der ein vorhandener Kursabschnitt an eine andere Position verschoben wird, ohne seinen Inhalt neu zu planen oder umzuschreiben. Kurspilot braucht dafuer ein schmales Werkzeug, damit eine Lehrkraft vorhandene Kursstruktur mit minimalem KI-Kontext umsortieren lassen kann. Weil jede Moodle-Aenderung nachvollziehbar bleiben muss, wird die geplante neue Abschnittsreihenfolge standardmaessig zuerst in `plan.md` aktualisiert; erst danach wird in Moodle verschoben. Eine planexterne Ausnahme ist nur erlaubt, wenn die Lehrkraft ausdruecklich klaert, dass der freigegebene Plan fachlich unveraendert bleibt und nur der bestehende Moodle-Kurs organisatorisch sortiert wird; dann ist ein Journal-Eintrag Pflicht. Die Verschiebung ist sichtbar zu benennen und braucht die normale Moodle-Schreibfreigabe, soll aber nicht als Anlass fuer zusaetzliche Kursgestaltung oder Inhaltsoptimierung dienen.
_Avoid_: Umordnen als versteckte Nebenwirkung einer Kursbefuellung, KI-Neuplanung fuer eine reine Positionsaenderung, Abschnittsinhalte beim Verschieben veraendern, Moodle-Reihenfolge vom lokalen Plan entkoppeln, Journal-Ausnahme ohne ausdrueckliche Lehrkraftklaerung

**Golden Path**:
Ein bewusst enger, erprobter Standardablauf, der fuer die Fortbildung mit moeglichst wenig manueller Nacharbeit funktioniert.
_Avoid_: freies Prompting, Vollautomatisierung aller Sonderfaelle

**Alignment-Prozess**:
Die klaerende Vorphase, in der Lehrkraft und KI implizite Annahmen zu Zielgruppe, Didaktik, Leistungsstand und Materialziel explizit machen.
_Avoid_: sofortige Generierung, ungepruefte Annahmen

**Kurskontext**:
Klassen-, lerngruppen- und fachspezifische Informationen, die nur fuer passende Planungs- und Befuellungsaufgaben herangezogen werden.
_Avoid_: alles jedes Mal neu erklaeren, globaler Einheitskontext, Moodle-Kurs als einzige Kontextordnung

**Kontextfreigabe**:
Die einmalige, kurze und positionsabhaengige Klaerung zu Beginn einer Kurspilot-Sitzung, welche lokalen Kurspilot-Ordner und Kontextdateien fuer die aktuelle Arbeit gelesen und welche Arbeitsdateien aktualisiert werden duerfen. Lesen darf passend zur Aufgabe breiter sein als Schreiben; lokale Schreibrechte bleiben auf aktuelles Unterrichtsvorhaben, passende Journale und explizit bestaetigte Kontextprofil-Ergaenzungen begrenzt. Moodle-Schreibfreigaben sind davon getrennt. Wenn eine passende Kontextfreigabe in derselben Arbeitssitzung bereits bestaetigt wurde, erinnert Kurspilot knapp daran, statt erneut nach jeder Datei zu fragen.
_Avoid_: Nachfrage vor jeder einzelnen Datei, globale Suche ueber alle Lerngruppen ohne Anlass, stilles Schreiben in uebergeordnete Kontextprofile, lokale Kontextfreigabe mit Moodle-Freigabe verwechseln

**Kursstand-Lesezugriff**:
Der read-only Zugriff von `kurspilot-planen` auf alles, was fuer Planung und Plan-Ueberarbeitung in einem bestehenden Moodle-Kurs fachlich relevant ist: Abschnitte, Module, sichtbare Inhalte von Seiten, Labels und Aufgaben, Quiz-/Teststruktur, Fragenbank-Kategorien, Fragen, Antwortoptionen, Feedback und relevante Einstellungen. Sobald das Moodle-Ziel bekannt ist, liest Kurspilot den Kursstand nach transparentem Hinweis automatisch, aber ohne zusaetzliche Bestaetigungsfrage. Dieser Zugriff darf keine Moodle-Aenderungen ausloesen.
_Avoid_: Schreibrechte im Planungsschritt, Planung gegen veralteten Kursstand, Kursstand nur manuell aus Moodle abschreiben, nur Modulnamen ohne Inhalte lesen, Testinhalte von der Planung abschneiden, read-only Kursstand wie eine Moodle-Schreibfreigabe behandeln

**MCP-Profiltrennung**:
Die technische Trennung zwischen einem schlanken read-only Moodle-MCP fuer Planung und einem vollen Moodle-MCP fuer Umsetzung. Die Kontextentlastung entsteht dadurch, dass der read-only MCP nur Lesetool-Schemas exponiert; Schreibtool-Schemas duerfen in diesem Profil nicht registriert werden. Gemeinsame Leselogik darf in geteilten Modulen liegen, aber der read-only Startpfad darf keine Write-Tools in `tools/list` sichtbar machen.
_Avoid_: nur per Skilltext versprechen keine Schreibtools zu nutzen, Write-Tool-Schemas im Planungskontext laden, Lesetools unkontrolliert doppelt pflegen, Read-only-Profil als zweite vollstaendige Kopie des grossen MCP bauen

**Kursstand-Luecke**:
Eine sichtbar benannte Stelle, an der Kurspilot planungsrelevante Moodle-Inhalte nicht oder nur teilweise lesen konnte. Wenn lokaler dokumentierter Planungsstand vorhanden ist, zum Beispiel `plan.md`, `status.md`, Materialanalyse, Journal oder fruehere Testfragenplanung, darf Kurspilot damit weiterplanen, muss aber unterscheiden zwischen "in Moodle gelesen" und "lokal dokumentiert/geplant". Die Warnung bleibt erhalten und benennt differenziert, welcher Teil aus Moodle bestaetigt ist und welcher Teil aus dem lokalen Planungsstand stammt.
_Avoid_: nicht gelesene Moodle-Inhalte als bestaetigten Ist-Stand ausgeben, lokale Planung ignorieren, bei jeder Leseluecke hart abbrechen, Warnungen so pauschal formulieren dass Lehrkraefte Quelle und Unsicherheit nicht erkennen

**Kursstand-Abgleich**:
Die lehrkraftgefuehrte Klaerung, wenn Moodle-Ist-Stand und lokaler Planungsstand voneinander abweichen. Sie gehoert zum vollstaendigen read-only Planungsblick von `kurspilot-planen`: Kurspilot benennt den Konflikt konkret, fragt welche Quelle aktuell gelten soll, und aktualisiert danach den lokalen Planungsstand oder die naechste Planung so, dass `plan.md`, `status.md`, Journal und Moodle-Kurs wieder nachvollziehbar zusammenpassen. Ziel ist, dass die Planung beschreibt, was im Moodle-Kurs tatsaechlich ist oder nach Freigabe werden soll.
_Avoid_: Konflikte zwischen Moodle und lokalen Dateien verschweigen, automatisch eine Quelle gewinnen lassen, doppelte Buchfuehrung der Lehrkraft ueberlassen, weiterplanen ohne klares Zielbild

**Umsetzungsvorpruefung**:
Der kurze read-only Preflight von `kurspilot-umsetzen` direkt vor Moodle-Schreibzugriffen. Er prueft, ob Moodle-Ziel, erwartete Abschnitte, relevante Aktivitaeten und lokale Freigabe noch zueinander passen. Bei erkennbaren Konflikten schreibt Kurspilot nicht, sondern blockiert die Umsetzung und verweist auf Kursstand-Abgleich beziehungsweise `kurspilot-planen`.
_Avoid_: Schreiben auf veralteten Kursstand, Neuplanung im Umsetzungsschritt, Konflikte erst nach Moodle-Aenderungen bemerken, Preflight als Ersatz fuer Planfreigabe behandeln

**Moodle-Katalogansicht**:
Eine kompakte, filterbare und lehrkraftlesbare read-only Uebersicht ueber den planungsrelevanten Moodle-Kursstand. Sie zeigt klar als Quelle "aus Moodle gelesen" und fuehrt Abschnitte, Aktivitaeten, Tests, Fragen, Inhalte, Sichtbarkeit, Abschluss- und Restriktionsinformationen so auf, dass grosse Kurse nicht vollstaendig im Chat ausgebreitet werden muessen. Der read-only MCP liefert dafuer strukturierte Filter und kompakte Felder; `kurspilot-planen` formuliert daraus die endgueltige Lehrkraftdarstellung. Detailinhalte werden nach Bedarf gefiltert oder gezielt aufgeklappt, nicht als unstrukturierter Rohdatenblock ausgegeben.
_Avoid_: JSON-Rohdaten als Lehrkraftansicht, komplette 100-Aktivitaeten-Kurse ungefiltert in den Chat kippen, Moodle-Ist-Stand ohne Quellenmarkierung mit lokaler Planung vermischen, Detailinhalte verstecken wenn sie fuer eine Entscheidung gebraucht werden

**Katalogsnapshot**:
Eine optional gespeicherte, datierte Spiegelung der zuletzt aufbereiteten Moodle-Katalogansicht. Sie ist nur sinnvoll, wenn die Aufbereitung merklich dauert oder KI-gestuetzte Pruefung enthaelt; billig per API abrufbare Kursdaten werden bevorzugt frisch gelesen statt gespeichert. Ein Katalogsnapshot ist Cache und Arbeitsgedaechtnis, nicht kanonische Planung, und muss Abrufzeitpunkt sowie Bezug zur letzten Planaktualisierung sichtbar machen.
_Avoid_: schnelle API-Daten unnoetig doppelt speichern, alten Snapshot als aktuellen Moodle-Ist-Stand behandeln, Katalogsnapshot mit `plan.md` verwechseln, Snapshot ohne Abrufdatum weiterverwenden

**Bestaetigte Vorschau**:
Eine von der Lehrkraft freigegebene Zusammenfassung geplanter Moodle-Aenderungen, bevor MoodleMcp in Moodle schreibt.
_Avoid_: direkte Schreibaktion ohne Kontrollpunkt, verdeckte Aenderung

**Freigegebener Implementierungsplan**:
Der von der Lehrkraft bestaetigte Plan, welche Abschnitte, Aktivitaeten, Tests, Fragen, Voraussetzungen und Einschraenkungen in Moodle angelegt oder geaendert werden.
_Avoid_: Moodle-Aenderungen ohne explizite menschliche Freigabe, einzelne Einschraenkungen nur implizit im Prompt

**Planungsentwurf**:
Der noch nicht freigegebene Zustand der Planungsdatei `plan.md` eines Unterrichtsvorhabens. Der Entwurfsstatus steht in `status.md`, bis die Lehrkraft den Implementierungsplan ausdruecklich freigibt.
_Avoid_: Entwurf als umsetzbaren Plan behandeln, mehrere konkurrierende Planfassungen ohne Status

**Status-gesteuerte Planfreigabe**:
Der Wechsel eines `plan.md` vom Entwurfsstatus zum freigegebenen Implementierungsplan durch Aktualisierung von `status.md`, sobald die Lehrkraft den Plan bestaetigt.
_Avoid_: freigegebener Plan nur im Chat, Dateiumbenennung als Freigabeersatz, Umsetzung aus nicht freigegebenem Status

**Ein-Plan-Regel**:
In Version 1 hat ein Unterrichtsvorhaben-Ordner genau eine aktive Planungsdatei: `plan.md`. Der aktuelle Zustand dieser Datei steht in `status.md`.
_Avoid_: mehrere aktive Planvarianten, Umsetzung muss zwischen konkurrierenden Plaenen waehlen, Variantenverwaltung in Version 1

**Plan-Erkennung**:
Wenn ein Unterrichtsvorhaben-Ordner bereits `plan.md` oder `status.md` enthaelt, weist Kurspilot die Lehrkraft darauf hin, bevor neu geplant oder umgesetzt wird, und bietet an, den vorhandenen Stand kurz vorzustellen.
_Avoid_: vorhandenen Plan uebersehen, still neu anfangen, Lehrkraft muss selbst nach Dateien suchen

**Plan-Ueberarbeitung**:
Die einfache Moeglichkeit, einen vorhandenen `plan.md` erneut zu besprechen, zu ergaenzen oder zu aendern. Bei einem bereits freigegebenen Plan muss vor der Umsetzung klar werden, ob die Aenderung den Status wieder auf Entwurf setzt und neu freigegeben werden muss.
_Avoid_: freigegebenen Plan als unveraenderlich behandeln, Aenderungen direkt in Moodle umsetzen ohne neue Freigabe, Variantenverwaltung als Voraussetzung fuer kleine Anpassungen

**Freigabestatus-Verlust bei Planaenderung**:
Sobald ein freigegebener `plan.md` inhaltlich geaendert wird, verliert er seinen Freigabestatus in `status.md` und bleibt Entwurf, bis die Lehrkraft die ueberarbeitete Fassung erneut freigibt. Kurspilot macht diesen Wechsel vor der Aenderung transparent.
_Avoid_: Lehrkraft wundert sich ueber erneute Freigabe, geaenderter Plan bleibt scheinbar freigegeben, Umsetzung aus nachtraeglich veraendertem Plan

**Umsetzen-aus-Entwurf-Wechsel**:
Wenn `kurspilot-umsetzen` laut `status.md` nur einen Entwurf findet, wird nicht umgesetzt. Stattdessen benennt Kurspilot transparent den Wechsel zu `kurspilot-planen`, damit `plan.md` geprueft, bei Bedarf angepasst und erneut freigegeben werden kann.
_Avoid_: harter Abbruch ohne naechsten Schritt, Entwurf direkt umsetzen, Freigabepruefung im Umsetzungsskill verstecken

**Planfreigabe-Abschlussweiche**:
Das kurze Angebot am Ende von `kurspilot-planen`, nach erfolgreicher Freigabe direkt zu `kurspilot-umsetzen` zu wechseln oder spaeter weiterzumachen.
_Avoid_: freigegebener Plan bleibt ohne naechsten Schritt liegen, automatische Moodle-Umsetzung ohne Entscheidung, Lehrkraft muss passenden Folgeskill erraten

**Gestufte Vorschau**:
Eine Vorschau, die zuerst eine gut lesbare Zusammenfassung zeigt und bei Bedarf vollstaendige Details wie ganze Textseiten, Fragen oder Feedback sichtbar macht.
_Avoid_: Details verstecken, Lehrkraft mit Volltext jeder Kleinigkeit ueberfordern

**Planungsgrundsatz**:
Eine allgemein geltende Regel im Implementierungsplan, zum Beispiel dass nach einem Test standardmaessig eine Folgeaktivitaet erst nach Bestehen freigegeben wird.
_Avoid_: dieselbe Regel bei jeder Aktivitaet neu erklaeren, implizite Sperrlogik

**Planstrenge**:
Die Kurspilot-Regel, dass Kursplanung und Umsetzung nur das enthalten, was aus Lehrkraftauftrag, bereitgestelltem Material, lokalem Kontext und freigegebenem Implementierungsplan nachvollziehbar folgt. Kurspilot soll keine beeindruckend wirkenden Extras, Komfortbuttons, Zusatzaktivitaeten, Designs, Bewertungen, Gamification, Sonderlogik oder Materialformen ergaenzen, nur weil eine KI so etwas gut generieren kann. Kleine Ausformulierungen innerhalb eines bereits geplanten Inhalts sind erlaubt; neue sichtbare Elemente, Aktivitaeten, Materialien, Dateien, Bewertungen oder Kurslogik muessen als Planoption benannt oder rueckgefragt werden. Jede Ergaenzung braucht eine fachliche Begruendung im Plan oder eine ausdrueckliche Lehrkraftfreigabe; sonst bleibt die einfachere Loesung richtig. Wenn die Lehrkraft nach ausreichender Rueckfrage ausdruecklich sagt, dass Kurspilot die offenen Detailentscheidungen selbst treffen soll, darf Kurspilot diese Entscheidung als Freigabe dokumentieren und entsprechend fortfahren.
_Avoid_: ungefragte Features, "sieht gut aus"-Elemente, PDF-Downloadbuttons ohne Auftrag, komplexere Moodle-Strukturen ohne Planbezug, nachtraegliches Entfernen unbestellter KI-Ergaenzungen, strukturelle Entscheidungen als harmlose Ausformulierung tarnen

**Planabweichung**:
Eine konkrete Abweichung von einem Planungsgrundsatz, die im Implementierungsplan besonders sichtbar gemacht und kurz begruendet wird.
_Avoid_: Ausnahme in langer Liste verstecken, unerklaerte Sonderregel

**Lerngruppenprofil**:
Eine jaehrliche Kontextdatei fuer eine reale Klasse oder Lerngruppe, die faecheruebergreifende Besonderheiten, Lernbedarfe und Entwicklung sichtbar macht.
_Avoid_: Moodle-Kursprofil, allgemeines Schulprofil als Ersatz fuer konkrete Lerngruppe

**Fachprofil**:
Eine Kontextdatei fuer ein Fach innerhalb einer Klasse oder Lerngruppe, die fachliche Besonderheiten, Arbeitsweisen und Kompetenzstaende ergaenzt.
_Avoid_: faecheruebergreifende Schuelerbesonderheiten im Fachprofil verstecken

**Unterrichtsordner**:
Ein Fach- oder Unterrichtsordner direkt unter einer Klasse oder Lerngruppe im lokalen Kontext, zum Beispiel `naturwissenschaften/`.
_Avoid_: technischer Sammelordner wie `subjects/`, Fachkontext ohne Unterrichtsbezug

**Kurspilot-Projekt**:
Eine fachliche Arbeitseinheit im lokalen Kurspilot-Kontext, nicht der aktuell geoeffnete Codex- oder Dateisystem-Projektordner. Typisch ist ein Kurspilot-Projekt ein Unterrichtsvorhaben beziehungsweise Unterthema unter einem Fachordner; bei groesserer Planung kann es auch ein Halbjahres- oder uebergreifendes Planungsvorhaben sein. Ein ganzer Jahreskurs ist nicht der Normalzuschnitt fuer detaillierte Kurspilot-Arbeit, weil Kontext, Plan und Fragensammlung sonst zu grob und schwer steuerbar werden.
_Avoid_: technisches Repo als Projektgrenze, ein ganzes Schuljahr als Standard-Projekt, Kurspilot-Arbeitsdateien ueber beliebige Projektordner verteilen

**Kontext-Lesereihenfolge**:
Bei Planung und Umsetzung liest Kurspilot den konkreten Unterrichtsordner-Kontext und bei Bedarf die uebergeordneten Kontextdateien der Lerngruppe und des Schuljahres mit. Spezifischer Kontext hat Vorrang vor allgemeinem Kontext.
_Avoid_: nur im aktuellen Themenordner lesen, Lerngruppenrealitaet ignorieren, allgemeine Hinweise spezifische Fachentscheidungen ueberschreiben lassen

**Lokale Schuelerdaten**:
Personenbezogene Informationen in Lerngruppenprofilen, die auf dem Rechner der verantwortlichen Lehrkraft liegen und fuer konkrete Unterrichtsplanung genutzt werden.
_Avoid_: automatische Veroeffentlichung, unbewusste Weitergabe, pauschale Anonymisierung fuer lokale Arbeitsdaten

**Bereinigte Weitergabe**:
Eine bewusst erstellte, von personenbezogenen Details bereinigte Fassung von Kontext- oder Planungsdaten fuer Weitergabe ausserhalb des lokalen Arbeitskontexts.
_Avoid_: Weitergabe ungepruefter Lerngruppenprofile, automatische Synchronisierung als Normalfall

**Lokaler Kontextordner**:
Der nicht versionierte Grundordner `local-context/` fuer den lokalen Kurspilot-Arbeitsbereich einer Lehrkraft. Er ordnet lokale Arbeitsdaten nach Schuljahr, Klasse oder Lerngruppe und Unterrichtsordner und enthaelt Lerngruppenprofile, Fachprofile, Journale, Materialien und freigegebene Plaene.
_Avoid_: Lerngruppenprofile im Git-Repo, zentrale Verwaltung personenbezogener Arbeitsdaten, Material- und Planungsdateien ohne wiederfindbare Schulstruktur

**Kurspilot-Arbeitsbereich**:
Die lehrkraftsichtbare Erklaerung des lokalen Grundordners: "Hier liegen deine Kurspilot-Dateien, geordnet nach Schuljahr, Klasse oder Lerngruppe und Fach." Der Arbeitsbereich gilt nutzerweit fuer Kurspilot und wird projektunabhaengig aus der vom Konfigurationsprogramm gespeicherten Einstellung gelesen. Kurspilot integriert sich bewusst nicht in beliebige private Ordnerstrukturen der Lehrkraft, sondern nutzt darunter immer seine eigene fachliche Ordnung ueber `local-context/`.
_Avoid_: technischer Ordnername ohne Einordnung, Lehrkraft muss die Ablagestruktur selbst erfinden, Projektordner als Ersatz fuer Lerngruppenkontext, Arbeitsdateien ueber mehrere Projektordner oder private Ablagestrukturen verteilen

**Kurspilot-Wegweiser**:
Eine kurze Datei `KURSPILOT.md` in einem vorhandenen Lehrkraft-Materialordner, die Agenten eindeutig auf den zentralen **Kurspilot-Arbeitsbereich** und den zur aktuellen Materialordner-Ebene passenden lokalen Kontextpfad verweist.
_Avoid_: zweite Planablage im Materialordner, lokale `plan.md` oder `status.md` neben Unterrichtsmaterial, Lehrkraft-Ordnung durch Kurspilot-Dateien vermischen, mehrdeutige Namen wie `CONTEXT.md` fuer reine Verweise

**Startkontext**:
Der lokale Kontextpfad aus `KURSPILOT.md`, von dem Kurspilot eine Planung oder Umsetzung beginnt und unter dem er je nach Arbeitsauftrag passende Untereinheiten sucht.
_Avoid_: `KURSPILOT.md` als vollstaendigen Index aller Unterthemen behandeln, Start im Materialordner als Schreibfreigabe fuer Kurspilot-Arbeitsdateien missverstehen

**Arbeitsbereich-Ort**:
Der im Konfigurationsprogramm von der Lehrkraft ausgewaehlte oder ausdruecklich bestaetigte Grundordner, unter dem der lokale Kontextordner `local-context/` fuer Kurspilot angelegt oder gefunden wird. Der Ordner darf nicht nur deshalb angelegt werden, weil `Kurspilot` als Vorschlag im Dokumente-Ordner naheliegt; wenn die Lehrkraft stattdessen iCloud Drive, OneDrive, einen Schulordner oder einen anderen Speicherort waehlt, darf kein leerer zusaetzlicher `Kurspilot`-Ordner im Dokumente-Ordner zurueckbleiben.
_Avoid_: fest verdrahteter Repo-Pfad, Lehrkraefte muessen den Speicherort im KI-Chat erklaeren, lokale Arbeitsdaten ohne auffindbaren Grundordner, Sync-Ordner still vorauswaehlen, leere unbestaetigte Standardordner anlegen, aktuellen Projektordner als impliziten Arbeitsbereich verwenden

**Arbeitsbereich-Einstellung**:
Die vom Kurspilot-Konfigurationsprogramm dauerhaft gespeicherte technische Quelle fuer den **Arbeitsbereich-Ort**. Sie ist kein Geheimnis und gehoert deshalb nicht in den Moodle-Token-Speicher; eine einfache nutzerweite Maschinen-Config, zum Beispiel JSON, reicht. Skills, MCP-Startwrapper und lokale Hilfsmodule lesen diese Einstellung vor jeder lokalen Kurspilot-Dateioperation und verwenden danach den dort hinterlegten Arbeitsbereich, unabhaengig davon, welches Repo oder welcher Ordner gerade in Codex oder Claude geoeffnet ist. Wenn die Einstellung fehlt oder nicht lesbar ist, verweist Kurspilot auf das Konfigurationsprogramm; er fragt den Pfad nicht ersatzweise im Chat ab.
_Avoid_: doppelte Buchfuehrung zwischen Setup und Skill, Arbeitsbereich nur im Chat merken, pro Projekt neue Kurspilot-Ablage, stiller Fallback auf aktuelles Arbeitsverzeichnis, nicht geheime Pfade im geschuetzten Token-Speicher ablegen, technische Maschinen-Config als Markdown-Arbeitsdatei behandeln, Chat-Ersatzsetup fuer den Arbeitsbereich

**Journal**:
Ein nicht ueberschriebenes, datiertes Markdown-Protokoll im lokalen Kontext, das Planungen, Freigaben, Moodle-Aenderungen und Kontextaenderungen fuer Lehrkraefte nachvollziehbar macht.
_Avoid_: Git als einziges Gedaechtnis, automatische Ueberschreibung, nur Chatverlauf als Protokoll

**Statusbericht**:
Eine aktuelle, themenbezogene Markdown-Datei im Unterrichtsvorhaben-Ordner, die den Umsetzungsstand eines freigegebenen Plans zusammenfasst: was wurde in Moodle angelegt, was ist fehlgeschlagen, was ist noch offen.
_Avoid_: Umsetzungsstand nur im Journal suchen, plan.md mit Ausfuehrungsdetails vermischen, offene Teilumsetzungen verstecken

**Statuswerte**:
Die festen Zustaende eines Unterrichtsvorhabens in `status.md`: `in_planung`, `freigegeben`, `teilweise_umgesetzt`, `umgesetzt`, `blockiert`.
_Avoid_: freie Statusformulierungen, mehrdeutige Zwischenzustaende, Umsetzung ohne pruefbaren Freigabestatus

**Statusbericht-Mindestinhalt**:
`status.md` enthaelt mindestens den aktuellen Statuswert, die letzte Aktualisierung mit Datum und ausloesendem Skill, den Planstand, das Moodle-Ziel, bei Teilumsetzung den erreichten Umsetzungspunkt, offene Punkte und den naechsten empfohlenen Schritt.
_Avoid_: Statusdatei nur als Ein-Wort-Ampel, Teilumsetzung ohne Wiederaufsetzpunkt, offene Punkte nur im Journal

**Menschenlesbare Arbeitsdateien**:
Alle Markdown-Dateien im Unterrichtsvorhaben-Ordner sind primaer fuer Lehrkraefte lesbare, pruefbare und korrigierbare Arbeitsdateien. `plan.md`, `status.md`, Journale und Materialnotizen nutzen normale Ueberschriften, Saetze, Listen und Tabellen statt YAML-Frontmatter oder anderer maschinenorientierter Metadatenformate.
_Avoid_: lokale Arbeitsdateien als interne Datenbank behandeln, schlecht lesbare Steuerdaten, Lehrkraft kann Dateien nur mit Tool sinnvoll verstehen, Missverstaendnisse bleiben im Dateitext schwer korrigierbar

**Dateidiff-Pruefung**:
Wenn Kurspilot Arbeitsdateien wie `plan.md` oder `status.md` schreibt oder aktualisiert, kann die Lehrkraft die Aenderungen im Codex- oder Claude-Code-Diff pruefen. Kurspilot darf auf diese Diff-Pruefung hinweisen, ohne Lehrkraefte in Finder oder Explorer zu schicken.
_Avoid_: Dateiueberpruefung nur ueber Chat-Zusammenfassung, Explorer/Finder als Standard-Reviewweg, verdeckte Dateiaenderungen ohne pruefbaren Diff

**Diff-Pruefhinweis**:
Nach Aenderungen an Arbeitsdateien nennt Kurspilot kurz die geaenderten Dateien und die fachlich wichtigen Pruefpunkte fuer den Diff, zum Beispiel Moodle-Ziel, Aktivitaetenreihenfolge, Planstatus oder offene Punkte.
_Avoid_: lange Nacherzaehlung jeder Datei, kein Hinweis auf pruefkritische Stellen, Lehrkraft muss selbst erraten worauf sie im Diff achten soll

**Dokumentationsroutine**:
Der laufende Skill-Reflex, dokumentationswuerdige Lerngruppen-, Fach-, Material-, Test- und Moodle-Planungsentscheidungen sofort im passenden lokalen Kontext festzuhalten.
_Avoid_: Entscheidungen erst am Sitzungsende sammeln, Chatverlauf als Speicher, spaeter nicht auffindbare Moodle-Entscheidungen

**Entscheidungsnotiz**:
Ein kurzer Journal-Eintrag zu einer geklaerten Entscheidung mit Aussage, Begruendung, betroffenem Kontext und offenen Anschlussfragen; technisch ueber `recordWorkflowNote` append-only geschrieben.
_Avoid_: lose Gedanken ohne Zuordnung, nur Ergebnis ohne Grund, unklare Wiederverwendbarkeit

**Umsetzungsbericht**:
Ein Journal-Eintrag nach Moodle-Schreibzugriff, der erfolgreiche Aenderungen, Moodle-IDs oder Links, Fehler und offene Nacharbeiten dokumentiert.
_Avoid_: stille Teilerfolge, Fehler nur im Chat, Lehrkraft muss sich Unterbrechungen merken

**Offene Nacharbeit**:
Ein dokumentierter Punkt, der nach einem Fehler, einer Unsicherheit oder einer bewusst vertagten Entscheidung spaeter erneut aufgegriffen werden muss.
_Avoid_: Fehler verschwinden im Chatverlauf, unklare Restarbeiten

**Nacharbeitsvorschlag**:
Ein Hinweis von Codex auf gefundene offene Nacharbeiten mit der Frage, ob sie als naechstes bearbeitet werden sollen.
_Avoid_: offene Punkte ignorieren, ungefragtes Abarbeiten

**Weiterarbeiten-Routine**:
Der Einstieg in eine neue Arbeitssitzung, bei dem Codex passenden Kontext, Journal und offene Nacharbeiten laedt und kurz zusammenfasst, wo die letzte Planung stand. Die Bezeichnung heisst hier bewusst nicht `kurspilot-fortsetzen`.
_Avoid_: Lehrkraft muss Chatverlauf selbst rekonstruieren, Weiterarbeit ohne Standabgleich

**Natuerliche Startformulierung**:
Eine alltagssprachliche Eingabe der Lehrkraft, mit der Setup, Weiterarbeiten oder Planung gestartet werden kann.
_Avoid_: technischer Pflichtbefehl, Kommandoauswendiglernen als Voraussetzung

**Transparenter Skill-Wechsel**:
Die kurze Benennung des konkret genutzten Kurspilot-Skills und des Grundes fuer den Wechsel, zum Beispiel "Ich nutze jetzt `kurspilot-planen`, weil bereits ein Planentwurf vorliegt und erst freigegeben werden muss." So lernen Lehrkraefte die verfuegbaren Arbeitsmodi, ohne Befehle auswendig lernen zu muessen.
_Avoid_: verdecktes Routing, interne Skill-Namen nie zeigen, lange technische Erklaerung vor jedem Schritt

**Kurze Kontextklaerung**:
Eine Rueckfrage mit wenigen passenden Kandidaten, wenn eine natuerliche Startformulierung mehrere Klassen, Faecher oder Themen meinen koennte.
_Avoid_: lange freie Rueckfragen, falschen Kontext still annehmen



**Journal-Ablage**:
Die automatische Entscheidung, ob ein Journal-Eintrag im Klassen- beziehungsweise Teilgruppenordner oder im Unterrichtsordner gespeichert wird.
_Avoid_: Lehrkraft bei jedem Journal-Eintrag nach Speicherort fragen, Schuljahresjournal als Standard

**Kontext-Onboarding**:
Der bewusst gestartete fachliche Einstieg, der Schuljahr, Klasse oder Lerngruppe und Fach klaert und erste Lerngruppen- oder Fachprofile unter dem bereits konfigurierten Arbeitsbereich-Ort anlegt.
_Avoid_: technische Grundinstallation in den KI-Chat verlagern, ungefragte automatische Anlage, manuelle Ordneranlage als Voraussetzung, Kontext ohne Speicherort erzeugen

**Setup-Abschlussweiche**:
Das kurze Angebot am Ende von `kurspilot-einrichten`, direkt mit einer Unterrichtsplanung fortzufahren, einen bereits freigegebenen Plan umzusetzen oder spaeter weiterzumachen.
_Avoid_: Setup endet als Sackgasse, Lehrkraft muss naechsten Skill selbst erraten, automatische Weiterarbeit ohne Entscheidung

**Setup-Option**:
Ein explizit ausfuehrbarer Setup-Schritt, auf den README und Skill hinweisen und der lokale Arbeitsordner oder Vorlagen vorbereitet.
_Avoid_: versteckte Automatik, hardcodiertes Setup in jedem Workflow

**Kurspilot-Installationspaket**:
Der zusammenhaengende Einrichtungsumfang, der Lehrkraeften Kurspilot nach Download eines GitHub-Release-Artefakts nutzbar macht: MCP-Server, Moodle-Zugangsdaten, lokale Arbeitsstruktur, notwendige Zusatztools und die passenden Skill-Adapter fuer Codex und Claude/Cowork. Anbieterunterschiede duerfen die Unterrichtsarbeit nicht blockieren.
_Avoid_: nur Skills ohne MCP-Tools ausliefern, Codex und Claude getrennt widerspruechlich dokumentieren, Zusatztools erst im Fehlerfall erwaehnen, vorhandenen Repo-Checkout voraussetzen

**Moodle-Token-Speicher**:
Die lokale, betriebssystemgeschuetzte Ablage des persoenlichen Moodle-Webservice-Tokens der Lehrkraft. Moodle-URL und Token werden im Installer beziehungsweise Wartungstool abgefragt und direkt im geschuetzten Speicher abgelegt; der Token wird nicht in Chat, Repo, `claude_desktop_config.json`, Codex-Config oder normalen Klartextdateien gespeichert. Kurspilot startet den MCP-Server ueber einen kleinen lokalen Helper, der den Token erst zur Laufzeit aus dem geschuetzten Speicher holt.
_Avoid_: Token in Installationsanleitungen kopieren lassen, Token in MCP-Konfigurationsdateien eintragen, KI-Ausgaben mit geheimen Tokens, Tokenwechsel nur durch manuelles Suchen in Konfigurationsdateien

**Kollegiums-Installer**:
Ein moeglichst app-aehnlicher Installationsweg fuer Lehrkraefte, der aus einem GitHub-Release heraus Codex/MCP-Voraussetzungen, Moodle-Token-Speicher, lokale Arbeitsstruktur und Skill-Verfuegbarkeit mit wenig manueller Technikarbeit einrichtet. Er ist plattformuebergreifend gedacht: macOS und Windows sollen dieselbe fachliche Installationslogik nutzen, auch wenn die Umsetzung schrittweise pro Plattform entsteht.
_Avoid_: lange manuelle Windows-Setup-Anleitung als Fortbildungsstandard, technische Huerden vor Unterrichtsplanung, macOS-Installer als reine Maintainer-Sonderloesung, Repo-Klonen als Lehrkraft-Voraussetzung

**macOS-Installer-Artefakt**:
Das macOS-Release-Artefakt fuer Lehrkraefte, das als `.pkg` oder `.dmg` mit Installer geoeffnet wird und die Einrichtung ausfuehrt. Eine ZIP-Datei ist kein fachlicher Zielzustand fuer die normale Nutzung.
_Avoid_: ZIP-Entpacken als Installationsnormalfall, App-in-Programme-ziehen fuer eine Einrichtung die Keychain und Konfiguration schreibt, Terminalstart als Standardweg

**LLM-Anbieterauswahl**:
Die Installer-Entscheidung, fuer welche lokal erkannten Clients wie Codex und Claude/Cowork Kurspilot eingerichtet wird. Erkannte Clients werden angeboten, aber die Lehrkraft kann einen oder mehrere davon abwaehlen.
_Avoid_: ungefragtes Konfigurieren aller denkbaren Clients, nicht installierte Clients als Pflicht anzeigen, Codex und Claude/Cowork untrennbar koppeln

**Desktop-Client-Einrichtung**:
Die Installer-Regel, dass eine erkannte Desktop-App von Codex oder Claude/Cowork als nutzbarer Zielclient reicht. Eine CLI-Installation darf hilfreicher Pruefpfad sein, aber keine Pflicht nur fuer die Kurspilot-Einrichtung.
_Avoid_: CLI-Zwang fuer Lehrkraefte, GUI-Fernsteuerung als fragile Installationsschnittstelle, Einrichtung nur ueber kopierte Chat-Prompts

**Nutzerweite Kurspilot-Installation**:
Die Bereitstellung der Kurspilot-Skills und MCP-Konfiguration im Benutzerprofil der Lehrkraft, sodass Kurspilot ohne Oeffnen eines bestimmten Projekt-Repositories verfuegbar ist.
_Avoid_: verstecktes Repo als Bedienvoraussetzung, Kurspilot nur in einem Projektordner sichtbar machen, Lehrkraefte zu Repo-Konzepten zwingen

**Client-Installationsblocker**:
Der Installer-Zustand, wenn weder Codex noch Claude/Cowork lokal erkannt wird. In diesem Zustand gibt es keinen Weiter-Schritt zur Kurspilot-Einrichtung, sondern nur offizielle Installationslinks und eine erneute Pruefung.
_Avoid_: Kurspilot ohne LLM-Client installieren, nicht erkannte Clients konfigurieren, Lehrkraft nach fehlendem Client in eine Sackgasse schicken

**Windows-Pflichtplattform**:
Die Anforderung, dass Installation und Nutzung auf Windows-Laptops der Lehrkraefte zuverlaessig funktionieren.
_Avoid_: nur macOS testen, Windows erst am Fortbildungstag entdecken

**macOS-Zielplattform**:
Die Anforderung, dass Installation und Nutzung auf macOS vollwertig funktionieren. macOS ist zugleich die zuerst umgesetzte und am besten lokal testbare Plattform, aber keine reine Entwicklungs-Sonderloesung.
_Avoid_: macOS durch Windows-Fokus unbrauchbar machen, macOS-Setup als Wegwerf-Prototyp behandeln

**Eigener Moodle-Token**:
Ein persoenlicher Webservice-Token pro Lehrkraft, der zum eigenen Moodle-Account und den eigenen Kursrechten auf der Testinstanz gehoert.
_Avoid_: gemeinsamer Fortbildungstoken, nicht nachvollziehbare Aenderungen durch mehrere Personen

**Vorbereiteter Webservice**:
Der global eingerichtete Moodle-Webservice, ueber den Lehrkraefte eigene Tokens fuer MoodleMcp nutzen koennen. Der Webservice ist fuer Trainerinnen und Trainer in eigenen Kursen geschnitten, nicht fuer Manager- oder Admin-Arbeit. Er soll nicht ueber eine manuell gepflegte Einzelpersonenliste betrieben werden, sondern ueber eine schulisch gepflegte Lehrkraft- beziehungsweise Kurspilot-Nutzungsrolle, die Token-Erstellung und REST-Nutzung erlaubt; in Moodle kann diese Rolle zum Beispiel ueber LDAP-/Verzeichnisgruppen im Systemkontext vergeben werden. Wer als Manager formal Kurse betreut, braucht fuer inhaltliche Kurspilot-Nutzung passende Trainerrechte im jeweiligen Kurs; ein separater Admin-Modus gehoert nicht zu V1.
_Avoid_: Webservice-Einrichtung live fuer jede Lehrkraft, Token ohne passende Rechte, Managerrolle als fachliche Unterrichtsplanungsrolle behandeln, Admin-/Managerrechte als Standard fuer Kurspilot voraussetzen, Schuelerrollen Zugriff auf Kurspilot-Token geben, manuelle Webservice-Whitelist als Dauerbetrieb

**Kurspilot-Nutzungsrolle**:
Eine schlanke globale Moodle-Rolle fuer Lehrkraefte, die nur den Zugang zum vorbereiteten Kurspilot-Webservice ermoeglicht, insbesondere Token-Erstellung und REST-Nutzung. Sie verleiht keine inhaltlichen Kursbearbeitungsrechte. Ob Kurspilot in einem konkreten Kurs lesen oder schreiben darf, entscheiden weiterhin die dortigen Trainerrechte und die Funktionspruefungen im Kurskontext.
_Avoid_: globale Kurspilot-Rolle mit Kursbearbeitungsrechten ueberfrachten, Tokenzugang und Kursbearbeitung vermischen, Schueler ueber globale Rolle in Kurspilot einbeziehen

**Kurspilot-Konfigurationsprogramm**:
Das wiederaufrufbare lokale Programm, das nach der Installation und spaeter bei Bedarf Moodle-URL, Moodle-Token, Arbeitsbereich-Ort und LLM-Anbieterauswahl verwaltet. Es schreibt Geheimnisse nur in den Moodle-Token-Speicher und macht Tokenwechsel ohne KI-Dialog moeglich.
_Avoid_: Tokenwechsel ueber Chat, einmaliges Setup ohne spaetere Reparaturmoeglichkeit, versteckte Konfiguration die Lehrkraefte nicht wiederfinden

**macOS-nahes Konfigurationsprogramm**:
Der erste Umsetzungsstil fuer das Kurspilot-Konfigurationsprogramm auf macOS: eine kleine App- oder Dialog-Huelle ohne grosses GUI-Framework, die der Installer startet und die spaeter erneut aufrufbar bleibt.
_Avoid_: Electron-/Tauri-/SwiftUI-Frontend als Voraussetzung fuer den ersten Slice, reines Terminal als Lehrkraft-Standard, KI-Chat als Konfigurationsoberflaeche

**Gebundene Kurspilot-Laufzeit**:
Die von Kurspilot mitgelieferte oder im Kurspilot-Installationsbereich verwaltete Laufzeit fuer den MCP-Server. Sie ist von einer vorhandenen systemweiten Node.js-Installation getrennt und wird durch Kurspilot weder ersetzt noch aktualisiert.
_Avoid_: vorhandenes Node.js veraendern, System-Node als Lehrkraft-Pflichtinstallation, Deinstallation loescht fremde Node-Installationen

**Plattformspezifisches Installer-Artefakt**:
Ein Release-Download, der nur die fuer die jeweilige Plattform und Architektur benoetigte Kurspilot-Laufzeit und Einrichtung enthaelt.
_Avoid_: unnoetig grosse Universal-Downloads, Windows- und macOS-Laufzeiten in einem Paket, falsche Plattform beim Download verstecken

**Apple-Silicon-Erstschnitt**:
Die bewusste Eingrenzung des ersten macOS-Installer-Slices auf aktuelle Macs mit Apple-Silicon-Prozessor. Intel-macOS wird nicht als ausgeschlossen behandelt, aber erst bei nachgewiesenem Bedarf nachgezogen.
_Avoid_: Universal-macOS-Paket als erster Pflichtumfang, Intel-Support ohne Kollegiumsbedarf, Apple-Silicon-Fokus als dauerhaftes macOS-Only-Missverstaendnis

**Kostenfreier macOS-Verteilweg**:
Die Entscheidung, dass der erste macOS-Kollegiumsweg keinen kostenpflichtigen Apple-Developer-Account voraussetzt. Signierung und Notarisierung bleiben wuenschenswert, blockieren aber den internen Fortbildungs-Installer nicht.
_Avoid_: jaehrliche Apple-Gebuehr als Voraussetzung fuer einen kleinen Schul-Installer, Kollegiumsrelease komplett blockieren weil Gatekeeper-Warnungen nicht perfekt vermeidbar sind, Sicherheitswarnungen verschweigen

**macOS-Gatekeeper-Hinweis**:
Die kurze Lehrkraftanleitung fuer den kostenfreien macOS-Verteilweg, wenn macOS vor einem nicht verifizierten Entwickler warnt: offizielles GitHub-Release nutzen, Installer per Rechtsklick oeffnen und die Warnung bewusst bestaetigen.
_Avoid_: Warnung verschweigen, lange Technikerklaerung als Standard, unsichere Drittquellen als Downloadweg

**Erklaerendes Setup**:
Eine Setup-Option, die der Lehrkraft knapp erklaert, was angelegt wird, warum es fuer Unterrichtsplanung gebraucht wird und vor dem Speichern eine Vorschau zeigt.
_Avoid_: stille Dateierzeugung, technisches Setup ohne paedagogische Einordnung

**Pflichtkontext**:
Die minimalen Angaben Schuljahr, Klasse oder Lerngruppenname und Fach, die benoetigt werden, um lokalen Kontext sinnvoll zu speichern und wiederzufinden.
_Avoid_: paedagogische Detailabfrage als Pflicht, Setup ohne Zuordnung

**Klasse**:
Die schulorganisatorische Stammgruppe, zum Beispiel `7a`, die als Basis fuer Lerngruppenkontext dient.
_Avoid_: Kursniveau als Klasse, Fachgruppe als Klasse

**Lerngruppenname**:
Eine optionale oder ersetzende Praezisierung der Klasse, zum Beispiel fuer E-Kurs, G-Kurs oder gemischte Gruppen.
_Avoid_: komplexe Schueler-Mengenmodellierung, Kursniveau nur im Fachprofil verstecken

**Eigenstaendige Teilgruppe**:
Eine geteilte oder gemischte Lerngruppe, die als eigener Ordner im lokalen Kontext gefuehrt wird, weil sie nicht deckungsgleich mit der Stammklasse ist.
_Avoid_: Teilgruppe unter Stammklasse einsortieren, Schueler einschliessen die nicht im Kurs sind

**Abgeleiteter Kontext**:
Der bewusste Rueckgriff auf Kontext einer verwandten Klasse oder Lerngruppe, bevor eine eigenstaendige Teilgruppe geplant wird.
_Avoid_: automatische Kontextvererbung, ungepruefte Uebernahme aller Schuelerinformationen

**Verwandter Kontext**:
Ein leichter Hinweis in einem Lerngruppenprofil auf eine andere Klasse oder Lerngruppe, deren Kontext bei Bedarf hinzugezogen werden kann.
_Avoid_: dauerhafte Kontextbelastung, automatische Uebernahme, verdeckte Abhaengigkeit

**Optionaler Planungskontext**:
Freiwillige Angaben wie Leistungsstand, besondere Lernbedarfe, Gruppendynamik, Sprachstand oder technische Rahmenbedingungen, die die Lehrkraft sofort erfassen oder spaeter ergaenzen kann. Der Einstieg bietet kurze Kategorien-Fragen mit freier Antwortmoeglichkeit an, damit Lehrkraefte die Option kennenlernen, ohne ein Formular ausfuellen zu muessen.
_Avoid_: alles beim ersten Setup erzwingen, hilfreiche Paedagogikdetails als Pflichtformular, Lerngruppenrealitaet im Setup gar nicht erwaehnen

**Codex-First**:
Die Anforderung, dass der vorbereitete Workflow in Codex zuverlaessig funktioniert; Claude-Kompatibilitaet bleibt relevant, blockiert aber Version 1 nicht.
_Avoid_: Claude-only, Feature blockieren weil Claude noch nicht funktioniert, Claude-Kompatibilitaet voellig ignorieren

**Kurspilot**:
Der lehrkraftsichtbare Name der MoodleMcp-Skill-Familie. `kurspilot` ist der Haupteinstieg und benennt den jeweils spezialisierten Skill offen. V1 umfasst `kurspilot`, `kurspilot-einrichten`, `kurspilot-planen` und `kurspilot-umsetzen`. Es gibt in V1 kein separates `kurspilot-fortsetzen` und kein separates `kurspilot-materialien`; Weiterarbeit wird je nach Stand als Einrichtungs-, Planungs- oder Umsetzungsmodus geroutet.
_Avoid_: MoodleMCP als alltagssprachlicher Skill-Name fuer Lehrkraefte, verdeckte Skill-Familie, technische Router-Sprache

**IGS-Arbeitsversion**:
Der schulbezogene Fork von MoodleMcp, der fuer Fortbildung, Testinstanz und IGS-Sprache eigenstaendig weiterentwickelt wird.
_Avoid_: direkte Aenderungen im Upstream unter Zeitdruck, Upstream als Fortbildungs-Abhaengigkeit

**Privater Start**:
Die bevorzugte Anfangsphase der IGS-Arbeitsversion, in der der Fork nicht oeffentlich sichtbar ist, bis Sprache, Setup und Testinstanz stabil genug sind.
_Avoid_: unklare fruehe Oeffentlichkeit mit instabiler Fortbildungsversion, versehentliche Veroeffentlichung schulbezogener Details

**Oeffentliche Arbeitsversion**:
Die Fallback-Sichtbarkeit der IGS-Arbeitsversion, falls GitHub keinen privaten Fork erlaubt; sie braucht eine klare README-Positionierung als schulbezogene Variante.
_Avoid_: oeffentlicher Fork ohne Einordnung, Verwechslung mit dem Upstream

**Unterrichtseinheit**:
Ein fachlich benannter Unterrichtsblock, der in Moodle durch einen oder mehrere Kurse oder Abschnitte abgebildet werden kann.
_Avoid_: Lernsituation, rein kontextuelle Problembezeichnung

**Unterthema**:
Ein fachlicher Teilbereich innerhalb einer Unterrichtseinheit, fuer den Materialien und meist mindestens eine Testaktivitaet organisiert werden.
_Avoid_: unscharfer Abschnitt ohne Fachbezug

**Lernpfad**:
Die fachlich und didaktisch strukturierte Abfolge von Materialien und Aktivitaeten fuer eine Unterrichtseinheit oder ein Unterthema.
_Avoid_: nur einzelne Dateien, lose Sammlung von Materialien

**Testaktivitaet**:
Eine pruefende Moodle-Aktivitaet, die ueber reine Aufgaben hinausgeht und fuer den Lernpfad als erforderlich gilt.
_Avoid_: nur Aufgabe, optionales Spaeter

**Multiple-Choice-Test**:
Die erste verpflichtende Testform fuer Version 1, bei der Lernende aus vorgegebenen Antwortoptionen genau eine richtige Antwort waehlen.
_Avoid_: Mehrfachauswahl in Version 1, nur Freitext, H5P als Startpunkt

**Antwortfeedback**:
Ein von der KI vorgeschlagenes und von der Lehrkraft freigegebenes Feedback zu Antwortoptionen, das Lernende bei falschen Antworten auf passende Materialien oder Denkhinweise verweist.
_Avoid_: Feedback ungeprueft veroeffentlichen, nur Punktwertung ohne Lernhinweis

**Materialverweis im Feedback**:
Ein Hinweis im Schuelerfeedback auf die konkrete Moodle-Aktivitaet oder das Material, in dem die benoetigte Information wiederzufinden ist.
_Avoid_: vager Hinweis wie "lies nochmal nach", nicht auffindbarer Materialbezug

**Bezugsaktivitaet**:
Die konkrete Moodle-Aktivitaet oder das Material, aus dem eine Testfrage beantwortbar sein soll.
_Avoid_: Frage erfordert nicht bereitgestelltes Vorwissen, Test passt nicht zum Lernpfad

**Materialluecke**:
Eine fachlich sinnvolle Frage oder Aktivitaet, fuer die im vorhandenen Kursmaterial noch keine ausreichende Grundlage vorhanden ist.
_Avoid_: unbelegte Frage trotzdem schreiben, gute Frage still verwerfen

**Freigegebene Materialergaenzung**:
Eine von der Lehrkraft ausdruecklich beauftragte Ergaenzung des Kursmaterials, um eine Materialluecke zu schliessen.
_Avoid_: blind neues Material erzeugen, KI-Kosten ohne Auftrag, spaetere Inhalte vorwegnehmen

**Moodle-natives Material**:
Direkt in Moodle lesbares Material, zum Beispiel eine Textseite, statt einer Datei oder eines PDF-Arbeitsblatts.
_Avoid_: PDF als Standard, Arbeitsblattlogik fuer digitale iPad-Arbeit, online abgefragte Inhalte nur in externen Dateien

**Externer Link**:
Eine Moodle-Aktivitaet, die auf eine Webseite ausserhalb der Moodle-Instanz verweist.
_Avoid_: externe Webseite als einzige stabile Grundlage fuer zentrale Lernpfad-Inhalte, Link ohne spaetere Pruefbarkeit

**Moodle-interne Bezugsquelle**:
Eine im Moodle-Kurs kontrollierbare Aktivitaet oder Textseite, die als verbindliche Grundlage fuer Testfragen und Feedback dient.
_Avoid_: externe Webseite als direkte Pflichtquelle fuer eine Frage, Feedback verweist auf nicht eingefuehrte externe Inhalte

**Quellenhinweis**:
Ein Hinweis im Moodle-Material, woher externe Inhalte stammen und wann sie abgerufen oder uebernommen wurden.
_Avoid_: externe Herkunft verschweigen, Fragegueltigkeit von veraenderlichen Fremdinhalten abhaengig machen

**Lehrwerkverweis**:
Ein knapper Quellenhinweis auf ein Schulbuch oder Lehrwerk, zum Beispiel mit Lehrwerkskuerzel und Seitenangabe.
_Avoid_: Schulbuchmaterial ohne Herkunft, fuer Schueler nicht wiederfindbare Seitenangabe

**Bereitgestelltes Lehrkraftmaterial**:
Material, das die Lehrkraft MoodleMcp fuer die Unterrichtsplanung zur Verfuegung stellt, zum Beispiel Dateien, Screenshots, Arbeitsblaetter oder Schulbuchauszuege.
_Avoid_: MoodleMcp beschafft Schulbuchinhalte selbst, Material ohne Herkunft oder Lehrkraftfreigabe uebernehmen

**Materialanalyse**:
Eine vorgelagerte Kurspilot-Arbeitsphase, in der bereitgestelltes Lehrkraftmaterial gesichtet und als lokale Markdown-Arbeitsdatei erschlossen wird: Aufgaben, Seiten, Abbildungen, Kompetenzbezug, Anspruchsniveau, Vorwissen, Materialluecken und moegliche Moodle-Nutzung. `kurspilot-planen` kann diese Analyse spaeter lesen, statt das Material im Planungschat erneut vollstaendig zu verarbeiten.
_Avoid_: Materialanalyse als Pflichtschritt fuer jede Planung, allgemeines `kurspilot-materialien` als Sammelskill, Analyse nur im Chat ohne wiederverwendbare Datei

**Kompetenzbezug**:
Die fachliche Zuordnung eines Materials, einer Aufgabe oder eines Unterrichtsschritts zu einer Kompetenzorientierung. Vorgegebene Lehrplan-Kompetenzen duerfen genutzt werden, sind aber oft zu grob und muessen fuer konkrete Aufgaben transparent eingeordnet werden.
_Avoid_: Kompetenzorientierung weglassen, grobe Lehrplan-Kompetenz als scheinbar praezise Aufgabenanalyse ausgeben, Kompetenzbezug nur als formale Pflichtzeile behandeln

**Subkompetenz-Vorschlag**:
Eine von Kurspilot vorgeschlagene feinere Aufgliederung einer groben Lehrplan- oder Rasterkompetenz in konkrete Teilaspekte, wenn mehrere Aufgaben formal dieselbe Kompetenz treffen, aber unterschiedliche Anforderungen stellen. Der Vorschlag bleibt pruefbar und korrigierbar durch die Lehrkraft.
_Avoid_: frei erfundene Kompetenzraster als verbindlich ausgeben, unklare Zuordnung verstecken, alle Aufgaben mit derselben groben Kompetenz gleich behandeln

**Unterrichtsvorhaben-Ordner**:
Ein thematischer Arbeitsordner direkt innerhalb eines Unterrichtsordners, in dem die Dateien zu einer konkreten Unterrichtseinheit oder einem Unterthema liegen, zum Beispiel Plaene, Materialien, OCR-Ergebnisse und Umsetzungsberichte.
_Avoid_: Lerngruppe als Projektordner bezeichnen, zusaetzlicher Sammelordner wie `vorhaben/`, Chatverlauf als Speicherort fuer freigegebene Plaene

**Unterrichtsvorhaben-Anlage**:
Die bewusste Anlage eines Unterrichtsvorhaben-Ordners nach kurzer Vorschau und Zustimmung der Lehrkraft, sobald ein konkretes Thema geplant oder Material dafuer gesichert werden soll.
_Avoid_: leere Themenordner auf Verdacht, verdeckte Ordneranlage, Material oder Plan ohne bestaetigten Speicherort

**Lokaler Materialordner**:
Ein Ordner unter `materials/<thema>/` im jeweiligen Unterrichtsordner, in dem bereitgestellte Materialien fuer einen Unterrichts- oder Lernpfad gesichert werden.
_Avoid_: Chat-Anhaenge als einzige Materialquelle, nicht reproduzierbarer Moodle-Aufbau, Materialverlust durch private Ordnerumstrukturierung

**Sprechender Materialdateiname**:
Ein von der KI vorgeschlagener Dateiname, der Quelle, Thema oder Inhalt erkennbar macht und technische Problemzeichen vermeidet.
_Avoid_: Screenshot-Standardnamen, unklare Dateinamen, manuelle Umbenennung als Pflichtarbeit

**OCR-Extraktion**:
Das Umwandeln von Bild- oder Screenshot-Material in bearbeitbaren Text, der fuer Moodle-Textseiten, Glossare, Feedback und spaetere Weiterverarbeitung nutzbar ist.
_Avoid_: Bild als einzige Textquelle, nicht durchsuchbares Material, KI kann Materialinhalt nicht verlaesslich verarbeiten

**OCR-Kontrolle**:
Die fachliche Gegenpruefung des extrahierten Textes durch die Lehrkraft, besonders bei Begriffen, Fachwoertern und Schulbuchscans.
_Avoid_: OCR-Fehler ungeprueft nach Moodle schreiben, komische Begriffe als Materialgrundlage

**Originalmaterial**:
Die urspruengliche bereitgestellte Datei, zum Beispiel Screenshot oder Scan, die lokal als Kontroll- und Referenzquelle erhalten bleibt.
_Avoid_: Original nach OCR loeschen, Screenshot zusaetzlich als Standardinhalt in Moodle anzeigen

**Fachabbildung**:
Ein Bild, Diagramm oder eine Abbildung, die Lernende fuer eine Aufgabe oder ein Verstaendnisziel betrachten, auswerten oder beurteilen sollen.
_Avoid_: dekoratives Bild als Standard, Text als Screenshot statt bearbeitbarer Text

**Gezielter Bildausschnitt**:
Ein aus dem Originalmaterial herausgeschnittener Bildbereich, der nur die fachlich benoetigte Abbildung enthaelt.
_Avoid_: ganze Schulbuchseite als Bild, Textumfeld doppelt als Bild und OCR-Text

**Alt-Text**:
Eine kurze alternative Beschreibung fuer Bilder oder Fachabbildungen, die Barrierefreiheit und spaetere Weiterverarbeitung verbessert.
_Avoid_: Bild ohne Beschreibung, Alt-Text als optionale Luxusarbeit

**KI-Qualitaetsroutine**:
Eine kleine, hilfreiche Qualitaetsmassnahme, die die KI konsequent miterledigt, weil sie fuer Menschen leicht vergessen wird oder Zeit kostet.
_Avoid_: nur Minimalumsetzung, Zusatzqualitaet wegen Zeitdruck weglassen

**Urheberrechtswarnung**:
Ein deutlicher Hinweis, dass Nutzung im schulischen Moodle-Kontext und Weitergabe an andere Personen oder Repositories unterschiedliche Risiken haben koennen und von der Lehrkraft verantwortet werden muessen.
_Avoid_: KI-Erstellung als Freibrief fuer Weitergabe, urheberrechtlich relevante Inhalte versehentlich veroeffentlichen

**Textseite**:
Die Standardform fuer Informationsmaterial in MoodleMcp Version 1, bei der Inhalte als eigene Moodle-Seite aufgerufen werden.
_Avoid_: Informationen direkt auf der Kurshauptseite, PDF als Standard

**Materialtextseite**:
Eine Textseite, die Informationen zum Nachschlagen bereitstellt und den Lernpfad nicht automatisch einschränkt.
_Avoid_: Lesen durch blosses Oeffnen unterstellen, Materialseite automatisch als Gate nutzen

**Text- und Medienfeld**:
Ein direkt auf der Kursseite sichtbares Moodle-Element, das fuer Version 1 nicht Teil des Standardumfangs ist.
_Avoid_: Kurshauptseite mit langen Informationen fuellen, Lernlandkarten-unfreundliche Inhaltsablage

**Aufgabe**:
Eine Moodle-Aktivitaet fuer Arbeitsauftraege, bei denen Lernende etwas tun, bearbeiten, notieren oder abgeben sollen.
_Avoid_: Arbeitsauftrag als reine Textseite, Aufgabe nur als digitale Datei-Abgabe verstehen

**Aufgabe ohne Abgabe**:
Eine Aufgabe, die einen Arbeitsauftrag sichtbar macht, ohne dass Lernende zwingend digital etwas in Moodle einreichen.
_Avoid_: jede Aufgabe als Upload-Aufgabe, analoge oder muendliche Arbeit unsichtbar machen

**Digitale Abgabe**:
Eine ausdruecklich geplante Moodle-Einreichung, bei der Lernende ein Ergebnis digital abgeben sollen.
_Avoid_: leeres Abgabeformular ohne Zweck, Abgabeoption nur aus Gewohnheit aktivieren

**Abgabeabschluss**:
Die Abschlussbedingung einer Aufgabe, bei der die Aufgabe als abgeschlossen gilt, sobald Lernende etwas eingereicht haben.
_Avoid_: Bewertung durch Lehrkraft als Standard-Gate, Einreichung ohne Lernpfadwirkung wenn Gate geplant ist

**Manueller Schuelerabschluss**:
Die Abschlussbedingung einer Aufgabe ohne Abgabe, bei der Lernende selbst markieren, dass sie den Arbeitsauftrag erledigt haben.
_Avoid_: automatische Erledigung ohne Handlung, analoge Arbeit als digital geprueft ausgeben

**Distraktor**:
Eine falsche, aber fachlich plausible Antwortoption, die eine typische Fehlvorstellung oder einen haeufigen Denkfehler sichtbar macht.
_Avoid_: offensichtlich falsche Fuellantwort, richtige Antwort als immer laengste oder auffaelligste Option

**Distraktorenbegruendung**:
Eine kurze Erklaerung fuer Lehrkraefte, welche Fehlvorstellung ein Distraktor adressiert und warum er fachlich sinnvoll ist.
_Avoid_: intransparente falsche Antworten, Distraktoren ohne didaktische Funktion

**Antwortmischung**:
Das zufaellige Mischen der Antwortoptionen innerhalb einer Multiple-Choice-Frage.
_Avoid_: feste Antwortpositionen als Standard, richtige Antwort immer an gleicher Stelle

**Fragenreihenfolge**:
Die Reihenfolge der Fragen innerhalb einer Testaktivitaet, die je nach Lernziel fest oder gemischt sein kann.
_Avoid_: ungefragtes Mischen von aufeinander aufbauenden Fragen, feste Reihenfolge ohne didaktischen Grund

**Richtig-Falsch-Bewertung**:
Die fachliche Bewertung einer Multiple-Choice-Frage als richtig oder falsch, ohne Teilpunkte oder differenzierte Punkteplanung in Version 1.
_Avoid_: Teilpunkte in Version 1, Punkteoptimierung statt Verstaendniskontrolle

**Bestehensgrenze**:
Die von der Lehrkraft festlegbare Schwelle, ab der ein Test als ausreichend verstanden gilt; die Empfehlung liegt eher hoch, zum Beispiel bei etwa 80 Prozent.
_Avoid_: 50 Prozent als selbstverstaendlicher Standard, Bestehen trotz grosser Verstaendnisluecken

**Lerncheck-Modus**:
Der Standardmodus fuer Tests, bei dem Lernende unbegrenzt viele Versuche haben und der beste Versuch zaehlt.
_Avoid_: pruefungsnahe Beschraenkung als Standard, Lernen durch Feedback verhindern

**Bewertungsmodus**:
Eine lehrkraftsteuerbare Abweichung vom Lerncheck-Modus, zum Beispiel begrenzte Versuche oder Durchschnittsbewertung fuer notenrelevante Tests.
_Avoid_: Bewertungsoptionen verstecken, Multiple-Choice-Raten als unbeachtetes Problem

**Intensiv-Ueben-Modus**:
Ein Testmodus fuer gezieltes Training, bei dem Lernende naehr an einzelnen Fragen ueben koennen und unmittelbares Feedback wichtiger ist als saubere Versuchsnachvollziehbarkeit.
_Avoid_: als Standard fuer alle Lernchecks, fehlende Transparenz ueber geringere Nachvollziehbarkeit

**Fertige Testaktivitaet**:
Eine Testaktivitaet, die nach der bestaetigten Erstellung grundsaetzlich fuer den geplanten Unterricht nutzbar ist.
_Avoid_: Sichtbarkeitsworkflow als Pflichtbestandteil von Version 1, unfertige Tests als Normalfall

**Zeitoffener Lerncheck**:
Ein Lerncheck ohne Zeitlimit, den Lernende auch nach der Unterrichtsstunde weiterbearbeiten koennen.
_Avoid_: Zeitlimit in Version 1, Tempo statt Verstaendnis als Standard

**Lernpfad-Gate**:
Eine Testaktivitaet, die Lernende erst nach ausreichendem Verstaendnis abschliessen laesst und dadurch weitere Aktivitaeten freigeben kann.
_Avoid_: Test nur als unverbindliche Selbstkontrolle, Durchklicken ohne Verstaendnisnachweis

**Bestehensabschluss**:
Die Abschlussbedingung einer Testaktivitaet, bei der der Test erst als abgeschlossen gilt, wenn die Bestehensgrenze erreicht ist.
_Avoid_: manueller Abschluss als Standard fuer Tests, Abschluss ohne Verstaendnisnachweis

**Freigabe-Voraussetzung**:
Eine Moodle-Einschraenkung, bei der eine Aktivitaet erst nach Bestehen oder Abschluss einer anderen Aktivitaet sichtbar oder nutzbar wird.
_Avoid_: pauschale Sperren, undokumentierte Einschraenkungen fuer Schueler

**AI-Textfrage**:
Eine spaetere Testform, bei der Lernende eigene Texte formulieren und KI-gestuetzt beurteilt wird, ob die Antwort ausreichend ist.
_Avoid_: Pflichtbestandteil von Version 1, reine Auswahlfragen als dauerhaft einzige Verstaendnispruefung

**Quiz-Autorisierung**:
Das Anlegen und Nachsteuern von Moodle-Tests und Testfragen durch die KI, ohne dass Lehrkraefte sperrige Moodle-Formulare bedienen muessen.
_Avoid_: einmaliger Quiz-Import ohne Korrekturpfad, manuelle Formularpflege als Normalfall

**Frageidentifikation**:
Die eindeutige Zuordnung einer geplanten Aenderung zu einer bestehenden Moodle-Frage, zum Beispiel durch Fragentextanalyse, sichtbare Frageinformationen oder Screenshots.
_Avoid_: Aendern nach Vermutung, nur ungepruefter Titelvergleich

**Lesbare Fragenvorschau**:
Eine Freigabeansicht fuer neue oder geaenderte Fragen, die die neue Fassung in Schuelersicht zeigt und Aenderungen verstaendlich markiert.
_Avoid_: klassisches Zeilendiff als Standard, Moodle als erster Ort der Kontrolle

**Inline-Aenderungsmarkierung**:
Eine Darstellung, bei der geaenderte, neue oder entfernte Textteile direkt im Fragetext markiert werden, statt alte und neue Zeilen getrennt zu zeigen.
_Avoid_: alles rot und alles gruen ohne Mehrwert, unlesbarer Prompt-Diff

**Kleine Fragenkorrektur**:
Eine geringfuegige Textaenderung an einer vorgeschlagenen Frage oder Antwort, die die Lehrkraft vor der Freigabe niedrigschwellig einbringen kann.
_Avoid_: neue KI-Generierung fuer reine Wortlautkorrektur, vollwertiger Editor als V1-Pflicht

**Grundlegende Fragenueberarbeitung**:
Eine inhaltliche Aenderung an einer Frage, die eine erneute KI-Überarbeitung und anschliessende Freigabe braucht.
_Avoid_: tiefgreifende Aenderungen als stille Textkorrektur, Freigabe ohne erneute fachliche Sichtung

**Versionierte Frageaenderung**:
Eine Aenderung an derselben Moodle-Testfrage, die als neue Frageversion gespeichert wird und den alten Stand nachvollziehbar laesst.
_Avoid_: Frage ersetzen, neu hinzufuegen, stilles Ueberschreiben, nicht nachvollziehbare Korrektur

**Immer aktuellste Version**:
Die Standardverknuepfung eines Tests mit einer Frage, bei der fuer neue Versuche automatisch die neueste vorhandene Frageversion verwendet wird.
_Avoid_: feste Versionsbindung als Standard, manuelles Nachziehen jeder Korrektur

**Kurs-Fragensammlung**:
Eine eigene, benannte Fragensammlung fuer einen Moodle-Kurs oder ein **Kurspilot-Projekt**, in der durch MoodleMcp erzeugte Fragen organisiert und fuer mehrere Testaktivitaeten wiederverwendbar bleiben. Ihr Name orientiert sich am Kurs, Thema oder fachlichen Inhalt, nicht am technischen Werkzeugnamen. Ob eine eigene Fragensammlung pro Unterrichtseinheit entsteht oder ob mehrere Unterrichtseinheiten in einer groesseren Halbjahres- oder Jahres-Fragensammlung mit Unterkategorien liegen, ist eine Planungsentscheidung der Lehrkraft und haengt von Kurszuschnitt, Fragenmenge und Wiederverwendung ab. Kurspilot macht einen Autovorschlag fuer Name und Ablage, zeigt ihn in der Planvorschau und laesst ihn vor Moodle-Schreibzugriff aendern oder bestaetigen. Die systemweit geteilte Fragensammlung ist eine Altlast und darf nicht mehr als Ziel fuer Kurspilot-Fragen genutzt werden.
_Avoid_: systemgeteilte Fragensammlung, namenlose oder schwer wiederfindbare Fragensammlung, Fragen ohne Kursbezug in globale Bereiche schreiben, technisches Praefix wie "Kurspilot" im Fragensammlungsnamen, starre Fragensammlungsstruktur ohne Lehrkraftentscheidung, nur in der Aktivitaet versteckte Fragen, sofort globale Ablage

**Fragensammlungs-Bereinigung**:
Das nachtraegliche nicht-destruktive Ordnen von Fragen und Kategorien, wenn Kurspilot-Fragen an der falschen Stelle gelandet sind, zum Beispiel in einer systemgeteilten Altlast. Erlaubt sind Verschieben, Umbenennen und Veraendern ueber neue Frageversionen, jeweils nach Vorschau und Freigabe. Dafuer braucht Kurspilot schmale Werkzeuge zum Verschieben beziehungsweise Aktualisieren von Fragenkategorien, aber kein Loeschwerkzeug. Loeschen von Fragen oder Kategorien gehoert nicht zu V1; wenn Dubletten oder leere Kategorien stoeren, bleibt das als offene Nacharbeit sichtbar oder wird ausserhalb von Kurspilot manuell entschieden.
_Avoid_: automatisches Loeschen, Bereinigung ohne Zielvorschau, Fragenverlust, systemgeteilte Altlast durch neue Inhalte weiter befuellen, `delete_question_category` als V1-Tool registrieren

**Nummerierter Inhaltsabschnitt**:
Eine laufend nummerierte und fachlich benannte Kategorie innerhalb eines Unterthemas, die Fragen einem konkreten Inhaltsabschnitt zuordnet.
_Avoid_: didaktische Phase, Informieren/Erarbeiten/Sichern als starres Schema, anonyme Nummer ohne Inhaltstitel

**Lernlandkarte**:
Ein vorhandenes Moodle-Element, das vorerst manuell in Moodle erstellt und getestet werden kann und nicht Teil des ersten MCP-Golden-Paths ist.
_Avoid_: Pflichtbestandteil von Version 1, sofortige MCP-Automatisierung

**Unterrichtsplanungs-Skill**:
Eine spaetere Skill-Erweiterung fuer didaktische Klaerung, Umgang mit heterogenen Lerngruppen und bessere KI-Nutzung durch Lehrkraefte.
_Avoid_: Pflichtumfang der MCP-Version 1, Teach-Skill als Sofortziel

## Relationships

- Ein **Bestehender Kurs** ist die Voraussetzung fuer jede **Kursbefuellung**
- Der **Kursumfang** kann eine **Unterrichtseinheit** oder ein kleineres **Unterthema** sein; tendenziell sind Themen als Kursumfang naheliegender als sehr kleine Unterthemen
- Vor der **Kursbefuellung** braucht es eine **Abschnittsentscheidung**
- Ein **Alignment-Prozess** geht der **Kursbefuellung** voraus
- Ein **Kurskontext** kann den **Alignment-Prozess** fuer bestimmte Lerngruppen verkuerzen
- Ein **Kurskontext** wird primaer ueber Klasse oder Lerngruppe und ergaenzend ueber Fach organisiert
- Ein **Lerngruppenprofil** liegt als `CONTEXT.md` bei der Klasse oder Lerngruppe und enthaelt faecheruebergreifende Informationen
- Ein **Fachprofil** liegt als `CONTEXT.md` in einem **Unterrichtsordner** und ergaenzt das **Lerngruppenprofil** um fachbezogene Informationen
- **Lerngruppenprofile** koennen pro Schuljahr neu angelegt werden und bilden einen nachvollziehbaren Wissensspeicher zur Entwicklung der Lerngruppe
- **Lokale Schuelerdaten** duerfen in Lerngruppenprofilen mit Klarnamen stehen, solange sie im lokalen Verantwortungsbereich der Lehrkraft bleiben
- Eine **Bereinigte Weitergabe** ist nur relevant, wenn Daten bewusst ausserhalb des lokalen Arbeitskontexts geteilt werden
- Lerngruppenprofile liegen im **Lokalen Kontextordner** `local-context/` und gehoeren nicht ins Git-Repo
- Ein **Journal** haelt wichtige Arbeitsschritte in datierten Markdown-Dateien fest, damit Lehrkraefte Verlauf nachvollziehen koennen ohne Git zu nutzen
- Die **Dokumentationsroutine** laeuft waehrend der Planung mit und erzeugt **Entscheidungsnotizen**, sobald eine spaeter wiederverwendbare Entscheidung geklaert ist
- Eine **Entscheidungsnotiz** gehoert in das passende **Journal** und benennt Entscheidung, Begruendung, Kontext und offene Anschlussfragen
- Nach Moodle-Schreibzugriff wird ein **Umsetzungsbericht** im passenden **Journal** erstellt
- Fehler und vertagte Punkte werden als **Offene Nacharbeit** dokumentiert
- Wenn Klasse, Fach oder Thema bekannt sind, sucht Codex nach **Offener Nacharbeit** im passenden Journal
- Gefundene offene Punkte werden als **Nacharbeitsvorschlag** angeboten, aber nur nach Freigabe bearbeitet
- Eine **Weiterarbeiten-Routine** soll fuer unterbrochene Arbeitssitzungen verfuegbar sein
- Die **Weiterarbeiten-Routine** fasst den letzten Stand zusammen und fragt, womit weitergearbeitet werden soll
- **Natuerliche Startformulierungen** sollen in README und Skill dokumentiert werden, damit Lehrkraefte Routinen ohne technische Befehle starten koennen
- Bei unklarer **Natuerlicher Startformulierung** nutzt Codex eine **Kurze Kontextklaerung** mit wenigen passenden Treffern
- Die **Journal-Ablage** folgt dem Kontextort: fachliche Planung, Moodle-Umsetzung, Material und Testfragen in den Unterrichtsordner; allgemeine Lerngruppenentwicklung in den Klassen- oder Teilgruppenordner
- Ein Schuljahresjournal ist in Version 1 kein Standard
- Bei mehrdeutiger **Journal-Ablage** fragt Codex kurz nach; sonst entscheidet es automatisch
- Wenn eine **Dokumentationsroutine** keinen passenden lokalen Kontext findet, klaert Codex den **Pflichtkontext** und bietet ein niedrigschwelliges **Erklaerendes Setup** an, statt ohne speicherbares Gedaechtnis weiterzuarbeiten
- Ein **Kontext-Onboarding** legt fachliche Profile nur unter einem vorhandenen **Arbeitsbereich-Ort** an; technische Grundinstallation gehoert ins **Kurspilot-Konfigurationsprogramm**
- Ein **Kontext-Onboarding** klaert den **Pflichtkontext**, bevor fachbezogener Kontext gespeichert wird
- Eine **Klasse** ist die bevorzugte Basis fuer den **Pflichtkontext**
- Ein **Lerngruppenname** kann die **Klasse** praezisieren oder bei geteilten beziehungsweise gemischten Gruppen ersetzen
- Gemischte oder geteilte Gruppen werden als **Eigenstaendige Teilgruppe** ueber einen eigenen **Lerngruppennamen** gefuehrt
- **Abgeleiteter Kontext** darf genutzt werden, muss aber im Dialog klaeren, welche Informationen uebernommen oder ignoriert werden
- **Verwandter Kontext** wird als Hinweis gespeichert und bei Bedarf nach Rueckfrage geladen
- README und Skill muessen deutlich auf die **Setup-Option** hinweisen
- Das **Kontext-Onboarding** ist ein **Erklaerendes Setup** und kann direkt ein erstes **Lerngruppenprofil** mit Vorschau und Bestaetigung erzeugen
- **Optionaler Planungskontext** wird angeboten, aber nicht erzwungen und kann spaeter ergaenzt werden
- Ein **Kollegiums-Installer** ist fuer die Fortbildung wichtig, weil die technische Einrichtung auf unterschiedlichen Lehrkraeftegeraeten schnell, verlaesslich und moeglichst app-aehnlich gelingen muss
- Das **macOS-Installer-Artefakt** ist fuer normale Lehrkraft-Nutzung ein `.pkg` oder `.dmg` mit Installer, nicht eine ZIP als bewusstes Bedienmodell
- Die **LLM-Anbieterauswahl** erkennt lokal vorhandene Clients wie Codex und Claude/Cowork und laesst die Lehrkraft entscheiden, welche davon eingerichtet werden
- Die **Desktop-Client-Einrichtung** vermeidet CLI-Zwang fuer Lehrkraefte; der Installer schreibt die noetigen lokalen Konfigurations- und Skill-Dateien direkt, soweit der Client offiziell dokumentierte Speicherorte nutzt
- Die **Nutzerweite Kurspilot-Installation** macht Kurspilot in den eingerichteten Clients allgemein verfuegbar, ohne dass Lehrkraefte ein Projekt-Repo oeffnen muessen
- Der **Client-Installationsblocker** verhindert Kurspilot-Einrichtung ohne erkannten LLM-Client und bietet stattdessen Installationslinks plus erneute Pruefung an
- **Windows-Pflichtplattform** ist fuer die Fortbildung massgeblich
- **macOS-Zielplattform** bleibt vollwertig unterstuetzt und ist der erste umgesetzte Installer-Slice
- Jede Lehrkraft nutzt einen **Eigenen Moodle-Token**
- Der Moodle-Webservice wird als **Vorbereiteter Webservice** vor der Fortbildung eingerichtet
- Das **Kurspilot-Konfigurationsprogramm** verwaltet Tokenwechsel, Client-Auswahl und den **Arbeitsbereich-Ort**, ohne Moodle-Tokens an KI-Dialoge weiterzugeben
- Das erste **Kurspilot-Konfigurationsprogramm** fuer macOS ist ein **macOS-nahes Konfigurationsprogramm** ohne grosses GUI-Framework
- Der **Arbeitsbereich-Ort** bestimmt, wo `local-context/` liegt und wie Kurspilot den Grundordner fuer lokale Unterrichtsdaten findet; `Kurspilot` im Dokumente-Ordner darf nur Vorschlag sein und wird erst nach Auswahl oder ausdruecklicher Bestaetigung angelegt
- Die **Gebundene Kurspilot-Laufzeit** gehoert zum Kurspilot-Installationsbereich und veraendert vorhandene systemweite Node.js-Installationen nicht
- **Plattformspezifische Installer-Artefakte** halten Downloads klein: macOS bekommt macOS-Laufzeit, Windows spaeter Windows-Laufzeit
- Der erste macOS-Slice folgt dem **Apple-Silicon-Erstschnitt**; Intel-macOS wird bei Bedarf nachgezogen
- Der erste macOS-Slice folgt dem **Kostenfreien macOS-Verteilweg**; Signierung/Notarisierung ist kein bezahlter Pflichtschritt fuer die Fortbildung
- Der **macOS-Gatekeeper-Hinweis** erklaert knapp, wie Lehrkraefte den unsignierten Installer aus dem offiziellen GitHub-Release bewusst oeffnen
- Eine **Bestaetigte Vorschau** ist vor schreibenden Moodle-Aenderungen verpflichtend
- Schreibende Moodle-Aenderungen duerfen erst nach einem **Freigegebenen Implementierungsplan** erfolgen
- Ein **Freigegebener Implementierungsplan** nutzt eine **Gestufte Vorschau**
- Ein **Freigegebener Implementierungsplan** kann **Planungsgrundsaetze** enthalten, die fuer mehrere Aktivitaeten gelten
- **Planabweichungen** muessen im **Freigegebenen Implementierungsplan** besonders sichtbar und kurz erklaert sein
- Jede **Freigabe-Voraussetzung** muss im **Freigegebenen Implementierungsplan** einzeln sichtbar sein
- Die **IGS-Arbeitsversion** ist die Fortbildungsbasis und bleibt technisch auf den Upstream rueckfuehrbar
- Die **IGS-Arbeitsversion** startet bevorzugt als **Privater Start**
- Falls ein privater Fork nicht moeglich ist, startet die **IGS-Arbeitsversion** als **Oeffentliche Arbeitsversion** mit klarer README-Einordnung
- Die **Kursbefuellung** erzeugt einen **Lernpfad** fuer eine **Unterrichtseinheit** oder ein **Unterthema**
- Der **Golden Path** ist **Codex-First**
- Features muessen fuer Version 1 in Codex funktionieren; Claude-Unterstuetzung wird nachgezogen, wenn sie nicht ohne Zusatzrisiko direkt funktioniert
- Ein vollstaendiger **Lernpfad** braucht nicht nur Aufgaben, sondern auch mindestens eine **Testaktivitaet**
- Ein **Multiple-Choice-Test** ist die erste verpflichtende **Testaktivitaet** fuer Version 1 und hat dort genau eine richtige Antwort
- Richtig/Falsch-Fragen werden in Version 1 als **Multiple-Choice-Test** mit zwei Antwortoptionen abgebildet
- **Antwortfeedback** ist fuer Multiple-Choice-Fragen in Version 1 ein wichtiger didaktischer Mehrwert und muss in der Vorschau sichtbar sein
- **Antwortfeedback** fuer Lernende benennt Fehlvorstellungen nicht diagnostisch, sondern gibt fachliche Hinweise
- **Materialverweis im Feedback** soll die passende Moodle-Aktivitaet moeglichst exakt benennen; klickbare Links sind ein technischer Testpunkt
- Jede Multiple-Choice-Frage in Version 1 braucht eine **Bezugsaktivitaet**
- Eine **Bezugsaktivitaet** dient als Qualitaetskontrolle, dass Fragen aus dem Kursmaterial beantwortbar sind
- Bei einer **Materialluecke** wird die Frage nicht nach Moodle geschrieben, sondern der Lehrkraft mit Klaerungsoptionen gezeigt
- Eine **Materialluecke** darf nur durch eine **Freigegebene Materialergaenzung** geschlossen werden
- **Moodle-natives Material** ist der Standard fuer Materialergaenzungen in Version 1
- **Externer Link** ist in Version 1 erlaubt, aber Moodle-interne Ablage ist fuer zentrale Inhalte bevorzugt
- Testfragen und Feedback nutzen standardmaessig eine **Moodle-interne Bezugsquelle**
- Externe Inhalte koennen in Moodle-Material eingearbeitet und mit **Quellenhinweis** versehen werden
- **Quellenhinweise** werden unaufdringlich, aber sichtbar in Moodle-Material aufgenommen
- Schulbuch- oder Lehrwerksbezug wird als **Lehrwerkverweis** angegeben
- **Bereitgestelltes Lehrkraftmaterial** darf als Grundlage fuer Moodle-internes Material genutzt werden, wenn die Lehrkraft es bewusst einbringt
- **Bereitgestelltes Lehrkraftmaterial** soll standardmaessig in einem **Lokalen Materialordner** gesichert werden, sofern die Lehrkraft nicht widerspricht
- Ein **Lokaler Materialordner** liegt im jeweiligen Unterrichtsordner, zum Beispiel `naturwissenschaften/materials/immunbiologie/`
- Ein **Lokaler Materialordner** dient der Nachvollziehbarkeit und Reproduzierbarkeit des Moodle-Aufbaus
- Bereitgestellte Materialien sollen als **Sprechender Materialdateiname** abgelegt werden, wenn der Inhalt erkennbar ist
- Urspruengliche Dateinamen werden im **Journal** nachvollziehbar gehalten, wenn Dateien umbenannt werden
- **OCR-Extraktion** ist fuer Bild- und Screenshot-Material in Version 1 wichtig, damit daraus arbeitsfaehiges Moodle-Material entsteht
- **OCR-Kontrolle** durch die Lehrkraft ist vor Moodle-Schreibzugriff erforderlich
- **Originalmaterial** bleibt lokal im Materialordner als Referenz erhalten
- In Moodle wird bei OCR-Material primaer der bearbeitete Text genutzt, nicht zusaetzlich das Originalbild als Standardinhalt
- Eine **Fachabbildung** wird in Moodle eingebettet, wenn Lernende sie fuer die Aufgabe brauchen
- Bei Quellen-Screenshots wird eine **Fachabbildung** als **Gezielter Bildausschnitt** uebernommen, nicht als ganze Seite
- Text aus dem Umfeld einer Abbildung wird per **OCR-Extraktion** als Text behandelt und nicht doppelt als Bild angezeigt
- Jede **Fachabbildung** braucht einen **Alt-Text**
- **KI-Qualitaetsroutinen** wie Alt-Texte, klare Beschriftungen und hilfreiche Alternativhinweise sollen in Moodle-Umsetzungen standardmaessig mitgedacht werden
- Eine **Urheberrechtswarnung** gehoert in die spaetere README oder Fortbildungsdokumentation, besonders fuer Weitergabe ausserhalb des eigenen Unterrichtskontexts
- Feedback soll nicht auf externe Inhalte verweisen, die vorher nicht im Moodle-Kurs eingefuehrt wurden
- Externe Links sollten perspektivisch auf Erreichbarkeit pruefbar sein
- **Textseite** ist die Standardform fuer Informationsmaterial in Version 1
- Eine **Textseite** wird nicht automatisch durch Anzeigen abgeschlossen
- **Materialtextseite** ohne Gate ist der Standard fuer Textseiten
- Bei **Textseiten** wird nur nach **Manuellem Schuelerabschluss** gefragt, wenn Verbindlichkeit oder Gate-Wirkung gewuenscht wirkt
- **Text- und Medienfeld** ist fuer Version 1 out of scope
- **Aufgabe** ist fuer Version 1 wichtig, wenn Lernende etwas bearbeiten sollen
- **Aufgabe ohne Abgabe** ist der Standard, wenn keine **Digitale Abgabe** ausdruecklich geplant ist
- Eine **Digitale Abgabe** wird nur aktiviert, wenn im Plan steht, was abgegeben wird und warum
- Eine Aufgabe mit **Digitaler Abgabe** nutzt standardmaessig **Abgabeabschluss**, wenn sie als Lernpfad-Gate geplant ist
- Eine **Aufgabe ohne Abgabe** nutzt als Gate standardmaessig **Manuellen Schuelerabschluss**
- Lehrkraftbewertung als Voraussetzung fuer Weiterarbeit ist eine explizite Sonderentscheidung, nicht Standard
- **Textseite** steht fuer Information oder Nachschlagen; **Aufgabe** steht fuer einen Arbeitsauftrag
- Jeder **Distraktor** soll eine plausible Fehlvorstellung oder einen typischen Denkfehler adressieren
- Eine **Distraktorenbegruendung** gehoert in kurzer Form zur Lehrkraft-Vorschau
- **Antwortmischung** ist fuer Multiple-Choice-Fragen in Version 1 der Standard
- **Fragenreihenfolge** bleibt eine bewusste Entscheidung der Lehrkraft, weil manche Tests fachlich aufeinander aufbauen
- Multiple-Choice-Fragen nutzen in Version 1 eine **Richtig-Falsch-Bewertung** ohne Teilpunkte
- Die **Bestehensgrenze** wird von der Lehrkraft festgelegt; MoodleMcp empfiehlt fuer Lernchecks eher hohe Schwellen wie etwa 80 Prozent
- Der **Lerncheck-Modus** ist der Standard fuer Testaktivitaeten in Version 1
- Ein abweichender **Bewertungsmodus** muss moeglich sein, wenn die Lehrkraft begrenzte Versuche oder andere Bewertungslogik braucht
- **Intensiv-Ueben-Modus** ist eine bewusste Alternative, wenn unmittelbares Ueben pro Frage wichtiger ist als gute Versuchsnachvollziehbarkeit
- README und Skill muessen die Auswirkungen von **Lerncheck-Modus**, **Intensiv-Ueben-Modus** und **Bewertungsmodus** fuer Lernende und Lehrkraefte erklaeren
- Eine erzeugte Testaktivitaet gilt in Version 1 als **Fertige Testaktivitaet**
- Manuelles Verstecken oder spaeteres Freischalten von Tests ist in Version 1 nicht Teil des MCP-Kernworkflows
- Testaktivitaeten sind in Version 1 standardmaessig **Zeitoffene Lernchecks**
- Zeitlimits gehoeren nicht zum Version-1-Scope
- Testaktivitaeten sollen als **Lernpfad-Gate** nutzbar sein, indem Bestehen den Abschluss und damit Voraussetzungen ermoeglicht
- **Bestehensabschluss** ist fuer Testaktivitaeten in Version 1 Pflicht, sofern technisch zuverlaessig umsetzbar
- **Freigabe-Voraussetzungen** werden nicht pauschal gesetzt, sondern nur wenn sie im Plan ausdruecklich freigegeben sind
- **AI-Textfrage** ist ein wichtiger spaeterer Ausbau, weil manche Verstaendnisnachweise formulierte Schuelerantworten brauchen
- **Quiz-Autorisierung** umfasst fuer Version 1 sowohl das Neuanlegen als auch das Nachsteuern von Tests
- Eine **Frageidentifikation** ist Voraussetzung fuer jede Aenderung an bestehenden Fragen
- Neue und geaenderte Fragen brauchen vor Moodle-Schreibzugriff eine **Lesbare Fragenvorschau** inklusive Antwortoptionen und Feedback
- **Inline-Aenderungsmarkierung** ist bevorzugt; wenn sie nicht verstaendlich ist, werden alte und neue Fassung nebeneinander gezeigt
- **Kleine Fragenkorrekturen** sollen vor der Freigabe moeglich sein, ohne die Frage komplett neu zu erzeugen
- **Grundlegende Fragenueberarbeitungen** laufen ueber erneute KI-Überarbeitung und neue Freigabe
- Eine **Versionierte Frageaenderung** ist der verpflichtende Nachsteuerungsweg fuer bestehende Fragen
- Eine **Versionierte Frageaenderung** erhaelt die Identitaet der Frage, damit Tests mit vorhandenen Versuchen weiter nutzbar bleiben
- **Immer aktuellste Version** ist die Standardbindung zwischen Test und Frage fuer Version 1
- Die von MoodleMcp erzeugten Fragen liegen standardmaessig in einer **Kurs-Fragensammlung**
- Die **Kurs-Fragensammlung** soll Umordnen und Wiederverwenden innerhalb von Moodle ermoeglichen
- In einer **Kurs-Fragensammlung** braucht eine **Unterrichtseinheit** mindestens eine Kategorieebene fuer **Unterthemen**
- Innerhalb eines **Unterthemas** werden Fragen bei mehreren Testbloecken ueber **Nummerierte Inhaltsabschnitte** organisiert
- Die **Lernlandkarte** kann auf einem fertigen **Lernpfad** aufbauen, ist aber nicht Teil des ersten **Golden Path**
- Ein **Unterrichtsplanungs-Skill** ist ein separates Folgevorhaben und kann spaeter den **Alignment-Prozess** verbessern

## Example dialogue

> **Dev:** "Soll MoodleMcp fuer die Fortbildung auch neue Kurse anlegen?"
> **Domain expert:** "Nein, ein **Bestehender Kurs** reicht. Entscheidend ist, dass die **Kursbefuellung** den **Lernpfad** fuer eine **Unterrichtseinheit** oder ein **Unterthema** mit Materialien, Aufgaben und mindestens einer **Testaktivitaet** zuverlaessig erstellt."

> **Dev:** "Darf MoodleMcp einfach den naechsten freien Abschnitt nehmen?"
> **Domain expert:** "Nein. Vorher braucht es eine **Abschnittsentscheidung** und eine **Bestaetigte Vorschau**."

> **Dev:** "Wann darf MoodleMcp in Moodle schreiben?"
> **Domain expert:** "Erst wenn die Lehrkraft einen **Freigegebenen Implementierungsplan** bestaetigt hat."

> **Dev:** "Muss die Lehrkraft immer alle Materialdetails sofort sehen?"
> **Domain expert:** "Nein. Eine **Gestufte Vorschau** zeigt erst die Uebersicht und macht vollstaendige Details bei Bedarf sichtbar."

> **Dev:** "Wie bleibt der Implementierungsplan lesbar, wenn viele Sperren gleich funktionieren?"
> **Domain expert:** "Er nennt zuerst die **Planungsgrundsaetze**. **Planabweichungen** werden besonders sichtbar gemacht und kurz erklaert."

> **Dev:** "Arbeiten wir direkt im Ursprungsrepo?"
> **Domain expert:** "Nein. Fuer die Fortbildung nutzen wir eine **IGS-Arbeitsversion** als Fork und halten den Upstream nur als Herkunft und moegliches spaeteres PR-Ziel."

> **Dev:** "Muss ein Feature warten, bis Claude es auch sauber kann?"
> **Domain expert:** "Nein. **Codex-First** heisst: Codex muss fuer Version 1 laufen; Claude bleibt im Blick und wird nachrangig nachgezogen."

> **Dev:** "Soll der Fork sofort oeffentlich sichtbar sein?"
> **Domain expert:** "Bevorzugt privat. Falls GitHub einen privaten Fork nicht zulaesst, nutzen wir eine **Oeffentliche Arbeitsversion** mit klarer README."

> **Dev:** "Kann die KI direkt Materialien in Moodle schreiben?"
> **Domain expert:** "Erst nach einem **Alignment-Prozess**. Viele Lehrkraefte haben implizite Annahmen zur Lerngruppe und Didaktik, die vorher sichtbar werden muessen."

> **Dev:** "Soll Kontext am Moodle-Kurs haengen?"
> **Domain expert:** "Nicht primaer. Wichtiger sind Klasse beziehungsweise Lerngruppe und Fach, weil dieselbe Klasse in mehreren Faechern vorkommen kann."

> **Dev:** "Warum pro Schuljahr neue Kontextdateien?"
> **Domain expert:** "Die Dateien sind klein und bilden die Entwicklung der Klasse ab. Zum neuen Schuljahr kann der alte Kontext uebernommen und angepasst werden."

> **Dev:** "Muessen Namen in Lerngruppenprofilen anonymisiert werden?"
> **Domain expert:** "Nein, lokale Unterrichtsplanung arbeitet mit realen Schuelerinnen und Schuelern. Bei bewusster Weitergabe braucht es eine **Bereinigte Weitergabe**."

> **Dev:** "Sollen Lerngruppenprofile im Fork liegen?"
> **Domain expert:** "Nein. Jede Lehrkraft verwaltet sie in einem **Lokalen Kontextordner**, der per Git ignoriert wird."

> **Dev:** "Wie heisst der lokale Ordner fuer sensible Kontextdateien?"
> **Domain expert:** "`local-context/`."

> **Dev:** "Wie koennen Lehrkraefte spaeter nachvollziehen, was sie geplant oder geaendert haben?"
> **Domain expert:** "Ueber ein **Journal** mit datierten Markdown-Dateien, nicht ueber Git als notwendiges Werkzeug."

> **Dev:** "Reicht es, wenn Codex paedagogische Entscheidungen im Chat beantwortet?"
> **Domain expert:** "Nein. Sobald eine Entscheidung fuer spaetere Unterrichtsplanung wichtig ist, erzeugt die **Dokumentationsroutine** eine **Entscheidungsnotiz** im passenden lokalen Kontext."

> **Dev:** "Was passiert nach dem Schreiben in Moodle?"
> **Domain expert:** "Ein **Umsetzungsbericht** dokumentiert Erfolge, IDs, Fehler und **Offene Nacharbeit**, damit Unterbrechungen nicht zum Informationsverlust fuehren."

> **Dev:** "Soll Codex offene Nacharbeiten automatisch erledigen?"
> **Domain expert:** "Nein. Codex sucht danach und macht einen **Nacharbeitsvorschlag**, aber die Lehrkraft entscheidet."

> **Dev:** "Wie geht es weiter, wenn eine Planung unterbrochen wurde?"
> **Domain expert:** "Mit einer **Weiterarbeiten-Routine**: Kontext, Journal und offene Nacharbeiten laden, Stand kurz zusammenfassen, dann weiterfragen."

> **Dev:** "Muss die Lehrkraft dafuer einen technischen Befehl kennen?"
> **Domain expert:** "Nein. **Natuerliche Startformulierungen** wie 'Setze meine Planung fuer 7a Nawi fort' reichen."

> **Dev:** "Reicht eine lange Setup-Anleitung fuer Kolleginnen und Kollegen?"
> **Domain expert:** "Nein. Ziel ist ein **Kollegiums-Installer**, den Lehrkraefte als GitHub-Release laden und moeglichst app-aehnlich durchlaufen lassen."

> **Dev:** "Soll das macOS-Release als ZIP verteilt werden?"
> **Domain expert:** "Nein. Das **macOS-Installer-Artefakt** soll als `.pkg` oder `.dmg` mit Installer geoeffnet werden."

> **Dev:** "Soll die KI den Moodle-Token sehen oder in eine Konfigurationsdatei schreiben?"
> **Domain expert:** "Nein. Der **Moodle-Token-Speicher** wird im Installer oder Wartungstool befuellt, direkt in die Keychain beziehungsweise den geschuetzten Speicher."

> **Dev:** "Wenn Node.js auf dem Rechner schon installiert ist, aktualisiert oder entfernt Kurspilot diese Installation?"
> **Domain expert:** "Nein. Die **Gebundene Kurspilot-Laufzeit** ist getrennt; Kurspilot veraendert keine fremde Node.js-Installation."

> **Dev:** "Sollen Windows- und macOS-Laufzeiten in einem grossen Download gebuendelt werden?"
> **Domain expert:** "Nein. Wir nutzen **Plattformspezifische Installer-Artefakte**, damit jede Lehrkraft nur das passende Paket laedt."

> **Dev:** "Brauchen wir zum Start auch einen Intel-macOS-Installer?"
> **Domain expert:** "Nein. Der erste macOS-Slice ist ein **Apple-Silicon-Erstschnitt**; Intel-macOS folgt nur bei Bedarf."

> **Dev:** "Zahlen wir jaehrlich fuer einen Apple-Developer-Account, nur um Gatekeeper-Warnungen zu vermeiden?"
> **Domain expert:** "Nein. Der erste interne macOS-Weg ist ein **Kostenfreier macOS-Verteilweg**; Warnungen werden transparent erklaert."

> **Dev:** "Wie gehen Lehrkraefte mit der macOS-Warnung vor nicht verifizierten Entwicklern um?"
> **Domain expert:** "Der **macOS-Gatekeeper-Hinweis** erklaert kurz Rechtsklick, Oeffnen und bewusstes Bestaetigen aus dem offiziellen GitHub-Release."

> **Dev:** "Was macht eine Lehrkraft, wenn der Moodle-Token spaeter geaendert werden muss?"
> **Domain expert:** "Sie startet das **Kurspilot-Konfigurationsprogramm** erneut; Tokenwechsel gehoert nicht in den KI-Chat."

> **Dev:** "Braucht der erste macOS-Slice ein grosses GUI-Framework?"
> **Domain expert:** "Nein. Ein **macOS-nahes Konfigurationsprogramm** reicht, solange es vom Installer gestartet wird und spaeter wieder aufrufbar ist."

> **Dev:** "Soll der Speicherort fuer Unterrichtskontext im KI-Dialog gesucht werden?"
> **Domain expert:** "Nein. Der **Arbeitsbereich-Ort** wird im **Kurspilot-Konfigurationsprogramm** gesetzt, damit Kurspilot den lokalen Kontextordner kennt."

> **Dev:** "Wenn Codex und Claude/Cowork beide installiert sind, konfigurieren wir automatisch beide?"
> **Domain expert:** "Nein. Die **LLM-Anbieterauswahl** zeigt erkannte Clients an; die Lehrkraft kann einen oder mehrere davon einrichten."

> **Dev:** "Muessen Lehrkraefte die CLI installieren, nur damit der Installer Skills und MCP einrichten kann?"
> **Domain expert:** "Nein. Die **Desktop-Client-Einrichtung** behandelt die Desktop-App als Zielclient und nutzt direkte lokale Konfiguration statt GUI-Fernsteuerung."

> **Dev:** "Sollen Lehrkraefte ein bestimmtes Projekt-Repository oeffnen, damit Kurspilot sichtbar ist?"
> **Domain expert:** "Nein. Die **Nutzerweite Kurspilot-Installation** macht Kurspilot allgemein verfuegbar."

> **Dev:** "Darf die Lehrkraft ohne installierten LLM-Client im Installer weiterklicken?"
> **Domain expert:** "Nein. Der **Client-Installationsblocker** zeigt Links zu Codex und Claude/Cowork und prueft danach erneut."

> **Dev:** "Welche Plattform muss fuer die Fortbildung sicher laufen?"
> **Domain expert:** "Windows ist **Windows-Pflichtplattform**; macOS ist ebenfalls **macOS-Zielplattform** und der erste gut testbare Installer-Slice."

> **Dev:** "Nutzen alle denselben Moodle-Token?"
> **Domain expert:** "Nein. Jede Lehrkraft bekommt einen **Eigenen Moodle-Token** ueber den **Vorbereiteten Webservice**."

> **Dev:** "Was passiert, wenn 'Mach mit Bio weiter' mehrere Kontexte meinen kann?"
> **Domain expert:** "Codex nutzt eine **Kurze Kontextklaerung** und bietet wenige passende Treffer zur Auswahl an."

> **Dev:** "Muss die Lehrkraft jedes Mal entscheiden, wo ein Journal-Eintrag gespeichert wird?"
> **Domain expert:** "Nein. Die **Journal-Ablage** folgt automatisch dem Kontextort; nur bei echter Mehrdeutigkeit fragt Codex nach."

> **Dev:** "Gibt es einen technischen `subjects/`-Ordner?"
> **Domain expert:** "Nein. Der Unterricht selbst ist der Ordner, zum Beispiel `naturwissenschaften/`, mit eigener `CONTEXT.md`."

> **Dev:** "Muss die Lehrkraft den technischen Arbeitsordner im KI-Chat einrichten?"
> **Domain expert:** "Nein. Der **Arbeitsbereich-Ort** wird im **Kurspilot-Konfigurationsprogramm** gewaehlt; das **Kontext-Onboarding** klaert danach fachliche Profile."

> **Dev:** "Soll das Setup nur leere Ordner anlegen?"
> **Domain expert:** "Nein. Als **Erklaerendes Setup** soll es sagen, was passiert, warum es passiert, und nach Vorschau ein erstes Profil speichern koennen."

> **Dev:** "Muss die Lehrkraft beim ersten Setup alle paedagogischen Details erfassen?"
> **Domain expert:** "Nein. Nur der **Pflichtkontext** ist notwendig; **Optionaler Planungskontext** kann sofort oder spaeter ergaenzt werden."

> **Dev:** "Sind Klasse und Lerngruppe dasselbe?"
> **Domain expert:** "Nein. Die **Klasse** ist die Basis, ein **Lerngruppenname** kann zum Beispiel E-Kurs, G-Kurs oder eine gemischte Gruppe genauer bezeichnen."

> **Dev:** "Soll ein E-Kurs automatisch unter der Stammklasse liegen?"
> **Domain expert:** "Nein. Als **Eigenstaendige Teilgruppe** bekommt er einen eigenen Ordner; die Lehrkraft kann aber bewusst **Abgeleiteten Kontext** aus der Stammklasse nutzen."

> **Dev:** "Soll verwandter Klassenkontext dauerhaft mitgeladen werden?"
> **Domain expert:** "Nein. Ein **Verwandter Kontext** ist nur ein Hinweis, damit die KI bei Bedarf nachfragen und gezielt nachsehen kann."

> **Dev:** "Reicht es, wenn MoodleMcp einen Test einmalig anlegt?"
> **Domain expert:** "Nein. **Quiz-Autorisierung** muss auch schnelles Nachsteuern koennen, idealerweise als **Versionierte Frageaenderung**."

> **Dev:** "Kann die KI eine bestehende Frage direkt aendern, wenn sie glaubt, die richtige gefunden zu haben?"
> **Domain expert:** "Nein. Erst braucht es eine klare **Frageidentifikation** und eine **Bestaetigte Vorschau** der Aenderung."

> **Dev:** "Reicht ein klassisches Diff fuer Frageaenderungen?"
> **Domain expert:** "Nein. Lehrkraefte brauchen eine **Lesbare Fragenvorschau** mit neuer Fassung und moeglichst **Inline-Aenderungsmarkierung**."

> **Dev:** "Gilt die Fragenvorschau nur fuer geaenderte Fragen?"
> **Domain expert:** "Nein. Auch neue Fragen muessen mit Antworten und Feedback vor Moodle-Schreibzugriff freigegeben werden."

> **Dev:** "Muss die Frage bei jedem kleinen Wortlautproblem neu generiert werden?"
> **Domain expert:** "Nein. **Kleine Fragenkorrekturen** sollen niedrigschwellig moeglich sein; **Grundlegende Fragenueberarbeitungen** brauchen eine neue Freigabe."

> **Dev:** "Soll Multiple Choice nur richtig oder falsch bewerten?"
> **Domain expert:** "Nein. **Antwortfeedback** soll Lernenden bei falschen Antworten helfen und auf Material oder Denkwege verweisen."

> **Dev:** "Reichen beliebige falsche Antwortoptionen?"
> **Domain expert:** "Nein. Jeder **Distraktor** soll eine plausible Fehlvorstellung pruefen und in der Vorschau kurz begruendet werden."

> **Dev:** "Soll das Feedback Schuelern ihre Fehlvorstellung benennen?"
> **Domain expert:** "Nein. Es soll freundlich fachlich hinweisen und mit **Materialverweis im Feedback** zeigen, wo sie im Kurs nacharbeiten koennen."

> **Dev:** "Duerfen Fragen Vorwissen voraussetzen, das nicht im Kursmaterial steht?"
> **Domain expert:** "Nein. Jede Frage braucht eine **Bezugsaktivitaet**, aus der sie beantwortbar ist."

> **Dev:** "Was passiert mit einer guten Frage ohne passendes Material?"
> **Domain expert:** "Das ist eine **Materialluecke**. Die Frage wird nicht geschrieben; die Lehrkraft entscheidet, ob Material ergaenzt oder die Frage angepasst wird."

> **Dev:** "Soll MoodleMcp bei einer Materialluecke direkt neues Material erzeugen?"
> **Domain expert:** "Nein. Erst braucht es eine **Freigegebene Materialergaenzung**, standardmaessig als **Moodle-natives Material**."

> **Dev:** "Sind externe Webseiten Teil des Lernpfads?"
> **Domain expert:** "Ja, als **Externer Link** sind sie moeglich. Fuer zentrale Inhalte ist **Moodle-natives Material** aber stabiler."

> **Dev:** "Darf eine Testfrage direkt von einer externen Webseite abhaengen?"
> **Domain expert:** "Standardmaessig nein. Die Frage braucht eine **Moodle-interne Bezugsquelle**; externe Herkunft kann als **Quellenhinweis** im Material stehen."

> **Dev:** "Muessen Quellen fuer uebernommene Inhalte sichtbar sein?"
> **Domain expert:** "Ja, unaufdringlich als **Quellenhinweis** oder bei Schulbuechern als **Lehrwerkverweis**."

> **Dev:** "Darf MoodleMcp mit Schulbuchseiten oder Arbeitsblaettern arbeiten?"
> **Domain expert:** "Ja, wenn sie als **Bereitgestelltes Lehrkraftmaterial** eingebracht werden. Fuer Weitergabe braucht es eine **Urheberrechtswarnung** und eigene Verantwortung der Lehrkraft."

> **Dev:** "Bleiben bereitgestellte Dateien nur im Chat?"
> **Domain expert:** "Nein, standardmaessig werden sie in einem **Lokalen Materialordner** gesichert, ausser die Lehrkraft moechte das nicht."

> **Dev:** "Wo werden bereitgestellte Materialien abgelegt?"
> **Domain expert:** "Im Unterrichtsordner unter `materials/<thema>/`, damit sie fachlich zum Lernpfad gehoeren."

> **Dev:** "Muss die Lehrkraft Screenshots selbst sinnvoll umbenennen?"
> **Domain expert:** "Nein. Die KI soll einen **Sprechenden Materialdateinamen** vorschlagen und die Umbenennung im **Journal** festhalten."

> **Dev:** "Reicht ein Screenshot als Material im Moodle-Kurs?"
> **Domain expert:** "Nein. Per **OCR-Extraktion** soll daraus bearbeitbarer Text entstehen, der nach **OCR-Kontrolle** als Moodle-Material genutzt werden kann."

> **Dev:** "Soll das Originalbild nach OCR in Moodle angezeigt werden?"
> **Domain expert:** "Nein. **Originalmaterial** bleibt lokal zur Kontrolle; in Moodle steht primaer der bearbeitete Text."

> **Dev:** "Was passiert mit wichtigen Diagrammen oder Abbildungen?"
> **Domain expert:** "Sie werden als **Fachabbildung** mit **Gezieltem Bildausschnitt** in Moodle eingebettet; Text drumherum wird als bearbeitbarer Text uebernommen."

> **Dev:** "Brauchen Bilder Alt-Texte?"
> **Domain expert:** "Ja. **Alt-Text** ist eine **KI-Qualitaetsroutine**, die standardmaessig miterledigt werden soll."

> **Dev:** "Soll Informationsmaterial direkt auf der Kursseite stehen?"
> **Domain expert:** "Nein. Standard ist eine **Textseite**; **Text- und Medienfeld** bleibt fuer Version 1 ausserhalb des Umfangs."

> **Dev:** "Gilt eine Textseite als erledigt, sobald sie geoeffnet wurde?"
> **Domain expert:** "Nein. Entweder ist sie **Materialtextseite** ohne Gate, oder sie nutzt bewusst **Manuellen Schuelerabschluss**."

> **Dev:** "Muss bei jeder Textseite nach Abschluss gefragt werden?"
> **Domain expert:** "Nein. **Materialtextseite** ohne Gate ist Standard; nur bei erkennbarer Verbindlichkeit wird nachgefragt."

> **Dev:** "Sind Aufgaben nur fuer digitale Abgaben da?"
> **Domain expert:** "Nein. Eine **Aufgabe** macht sichtbar, dass Lernende etwas tun sollen; als **Aufgabe ohne Abgabe** kann sie auch analoge oder muendliche Arbeit abbilden."

> **Dev:** "Soll eine Aufgabe automatisch ein Abgabeformular haben?"
> **Domain expert:** "Nein. **Aufgabe ohne Abgabe** ist Standard; **Digitale Abgabe** braucht einen ausdruecklichen Zweck."

> **Dev:** "Wann gilt eine digitale Aufgabe als Gate abgeschlossen?"
> **Domain expert:** "Standardmaessig per **Abgabeabschluss**: eingereicht reicht. Bewertung durch die Lehrkraft muss explizit geplant sein."

> **Dev:** "Wann gilt eine Aufgabe ohne Abgabe als erledigt?"
> **Domain expert:** "Wenn sie als Gate dient, standardmaessig per **Manuellem Schuelerabschluss**: Lernende markieren bewusst, dass sie fertig sind."

> **Dev:** "Duerfen Antwortoptionen gemischt werden?"
> **Domain expert:** "Ja, **Antwortmischung** ist Standard. Bei der **Fragenreihenfolge** entscheidet die Lehrkraft, ob Reihenfolge wichtig ist."

> **Dev:** "Sollen MC-Fragen Teilpunkte haben?"
> **Domain expert:** "Nein. In Version 1 zaehlt **Richtig-Falsch-Bewertung**; wichtiger ist, ob Verstaendnisluecken sichtbar werden."

> **Dev:** "Ist 50 Prozent eine passende Bestehensgrenze?"
> **Domain expert:** "Eher nein. Die **Bestehensgrenze** soll die Lehrkraft festlegen, mit Empfehlung zu etwa 80 Prozent fuer Lernchecks."

> **Dev:** "Wie viele Versuche sollen Lernende haben?"
> **Domain expert:** "Im **Lerncheck-Modus** unbegrenzt und der beste Versuch zaehlt. Fuer notenrelevante Tests kann die Lehrkraft einen anderen **Bewertungsmodus** waehlen."

> **Dev:** "Soll Feedback direkt an jeder Frage kommen?"
> **Domain expert:** "Nur im **Intensiv-Ueben-Modus**. Standard ist **Lerncheck-Modus**, damit Versuche fuer Lehrkraefte besser nachvollziehbar bleiben."

> **Dev:** "Soll MoodleMcp Tests erst versteckt anlegen?"
> **Domain expert:** "Nein, das ist fuer Version 1 nicht Kernworkflow. Nach Bestaetigung entsteht eine **Fertige Testaktivitaet**; Sichtbarkeit kann bei Bedarf manuell in Moodle geregelt werden."

> **Dev:** "Sollen Tests ein Zeitlimit haben?"
> **Domain expert:** "Nein. In Version 1 sind sie **Zeitoffene Lernchecks**, damit Lernende bei Bedarf nach der Stunde weiterarbeiten koennen."

> **Dev:** "Warum sind Testaktivitaeten im Lernpfad wichtig?"
> **Domain expert:** "Als **Lernpfad-Gate** verhindern sie reines Durchklicken und geben weitere Aktivitaeten erst nach ausreichendem Verstaendnis frei."

> **Dev:** "Soll die Lehrkraft den Abschluss eines Tests manuell setzen?"
> **Domain expert:** "Nein. **Bestehensabschluss** soll beim Erstellen des Tests gesetzt werden."

> **Dev:** "Soll die naechste Aktivitaet automatisch gesperrt werden?"
> **Domain expert:** "Nur wenn diese **Freigabe-Voraussetzung** im **Freigegebenen Implementierungsplan** einzeln sichtbar war und bestaetigt wurde."

> **Dev:** "Kann MoodleMcp eine fehlerhafte Frage einfach ersetzen?"
> **Domain expert:** "Nein. Es muss dieselbe Frage als neue Version aendern, damit ein Test mit vorhandenen Schuelerversuchen weiter funktioniert."

> **Dev:** "Soll ein Test fest auf einer Frageversion bleiben?"
> **Domain expert:** "Standardmaessig nein. Der Test soll fuer neue Versuche **Immer aktuellste Version** nutzen, damit Korrekturen ohne Formulararbeit wirksam werden."

> **Dev:** "Wo sollen die Fragen organisatorisch liegen?"
> **Domain expert:** "In einer **Kurs-Fragensammlung** auf Kursebene. Dort bleiben sie sichtbar, umsortierbar und fuer mehrere Tests nutzbar."

> **Dev:** "Wie werden Fragen innerhalb eines Kurses organisiert?"
> **Domain expert:** "Mindestens nach **Unterthema**. Wenn es dort mehrere Testbloecke gibt, werden sie als **Nummerierte Inhaltsabschnitte** mit fachlichem Namen sichtbar."

## Flagged ambiguities

- "Kurs erstellen" und "Kurs befuellen" wurden anfangs vermischt - aufgeloest: Version 1 fokussiert nur die **Kursbefuellung** in einem **Bestehenden Kurs**
- "Kurs" war offen zwischen Unterrichtseinheit und Unterthema - aufgeloest: der **Kursumfang** bleibt flexibel, tendenziell auf Themenebene
- "Kurskontext" klang nach Moodle-Kurs oder Jahrgang - aufgeloest: Kontext wird primaer ueber Klasse beziehungsweise Lerngruppe organisiert; das Fach kommt als **Fachprofil** im **Unterrichtsordner** hinzu
- "Fachprofil-Ablage" war offen - aufgeloest: Fachlicher Kontext liegt in einem **Unterrichtsordner** direkt unter Klasse oder Lerngruppe, nicht unter `subjects/`
- "Schuelerdaten" war offen zwischen lokaler Praxis und Weitergabe - aufgeloest: **Lokale Schuelerdaten** koennen Klarnamen enthalten; **Bereinigte Weitergabe** ist ein separater Verantwortungsschritt
- "Lerngruppenprofile im Repo" war offen - aufgeloest: Profile liegen im **Lokalen Kontextordner** `local-context/` und muessen nach dem Fork per `.gitignore` ausgeschlossen werden
- "Nachvollziehbarkeit ohne Git" war offen - aufgeloest: ein **Journal** speichert datierte Markdown-Protokolle im lokalen Kontext
- "Entscheidungen nur im Chat" war offen - aufgeloest: die **Dokumentationsroutine** haelt spaeter nutzbare Entscheidungen sofort als **Entscheidungsnotiz** fest
- "Nachbericht nach Moodle-Schreibzugriff" war offen - aufgeloest: **Umsetzungsbericht** mit **Offener Nacharbeit** gehoert ins **Journal**
- "Offene Nacharbeiten beim Neustart" waren offen - aufgeloest: Codex sucht danach und bietet sie als **Nacharbeitsvorschlag** an
- "Arbeitssitzung fortsetzen" war offen - aufgeloest: **Weiterarbeiten-Routine** laedt Kontext, Journal und offene Nacharbeiten und fasst den Stand zusammen
- "Start der Routinen" war offen - aufgeloest: README und Skill nutzen **Natuerliche Startformulierungen** statt Pflichtbefehlen
- "Unklare Startformulierung" war offen - aufgeloest: **Kurze Kontextklaerung** mit wenigen Kandidaten
- "Journal-Ort" war offen - aufgeloest: **Journal-Ablage** folgt automatisch dem Kontextort; kein Schuljahresjournal als V1-Standard
- "Kontext speichern" war offen ohne Speicherort - aufgeloest: Der **Arbeitsbereich-Ort** wird technisch im **Kurspilot-Konfigurationsprogramm** gesetzt; das **Kontext-Onboarding** erstellt danach fachliche Profile
- "Kollegiums-Setup" war offen - aufgeloest: fuer die Fortbildung braucht es einen moeglichst app-aehnlichen **Kollegiums-Installer** aus einem GitHub-Release, nicht einen vorausgesetzten Repo-Checkout
- "macOS-Downloadformat" war offen - aufgeloest: Das **macOS-Installer-Artefakt** soll `.pkg` oder `.dmg` mit Installer sein, nicht ZIP als Nutzerstandard
- "Moodle-Token-Eingabe" war offen - aufgeloest: Moodle-URL und Token werden durch Installer oder Wartungstool direkt in den **Moodle-Token-Speicher** geschrieben und nicht an KI oder normale Config-Dateien gegeben
- "Node.js als Voraussetzung" war offen - aufgeloest: Kurspilot nutzt eine **Gebundene Kurspilot-Laufzeit** und veraendert vorhandene systemweite Node.js-Installationen nicht
- "Universal-Download oder getrennte Installer" war offen - aufgeloest: Es gibt **Plattformspezifische Installer-Artefakte** statt eines unnoetig grossen Universalpakets
- "Apple Silicon oder Intel macOS" war offen - aufgeloest: Der erste macOS-Slice ist ein **Apple-Silicon-Erstschnitt**; Intel folgt nur bei Bedarf
- "Apple Developer Account fuer macOS" war offen - aufgeloest: Der erste interne macOS-Weg ist ein **Kostenfreier macOS-Verteilweg** ohne bezahlte Signierungs-/Notarisierungspflicht
- "Gatekeeper-Warnung bei unsigniertem macOS-Installer" war offen - aufgeloest: Der **macOS-Gatekeeper-Hinweis** erklaert kurz Rechtsklick/Oeffnen/Bestaetigen aus offizieller Quelle
- "GUI-Framework fuer Konfigurationsprogramm" war offen - aufgeloest: Der erste Slice nutzt ein **macOS-nahes Konfigurationsprogramm** ohne grosses GUI-Framework
- "Tokenwechsel nach Installation" war offen - aufgeloest: Das **Kurspilot-Konfigurationsprogramm** bleibt wiederaufrufbar und verwaltet Tokenwechsel ohne KI-Dialog
- "Grundordner fuer lokale Unterrichtsdaten" war offen - aufgeloest: Der **Arbeitsbereich-Ort** wird im **Kurspilot-Konfigurationsprogramm** gewaehlt oder ausdruecklich bestaetigt und ist die Basis fuer `local-context/`
- "Name des vorgeschlagenen Arbeitsordners" war offen - aufgeloest: Der vorgeschlagene Ordner heisst `Kurspilot`, wird aber nicht ohne Auswahl oder ausdrueckliche Bestaetigung angelegt
- "Codex oder Claude/Cowork einrichten" war offen - aufgeloest: Die **LLM-Anbieterauswahl** erkennt vorhandene Clients und laesst die Lehrkraft gezielt auswaehlen
- "CLI als Installer-Voraussetzung" war offen - aufgeloest: Die **Desktop-Client-Einrichtung** erlaubt Desktop-Apps als Zielclients; CLI darf nicht nur fuer Skill-Einrichtung erzwungen werden
- "Projektlokale oder nutzerweite Skills" war offen - aufgeloest: Die **Nutzerweite Kurspilot-Installation** ist Standard fuer Lehrkraefte
- "Kein LLM-Client installiert" war offen - aufgeloest: Der **Client-Installationsblocker** laesst ohne erkannten Client keinen Weiter-Schritt zu und bietet Installationslinks mit erneuter Pruefung
- "Betriebssysteme" waren offen - aufgeloest: Windows ist **Windows-Pflichtplattform**, macOS ist **macOS-Zielplattform** und wird zuerst umgesetzt
- "Moodle-Token fuer Kollegium" war offen - aufgeloest: jede Lehrkraft nutzt einen **Eigenen Moodle-Token**; Webservice ist vorbereitet
- "Setup" war offen zwischen technischer Ordneranlage und paedagogischem Einstieg - aufgeloest: Es soll ein **Erklaerendes Setup** mit Profilvorschau sein
- "Profilinhalt" war offen zwischen Pflichtformular und freiwilligem Kontext - aufgeloest: nur **Pflichtkontext** ist zwingend; **Optionaler Planungskontext** bleibt freiwillig
- "Klasse" und "Lerngruppe" waren vermischt - aufgeloest: **Klasse** ist die bevorzugte Basis; geteilte Gruppen werden als **Eigenstaendige Teilgruppe** mit eigenem **Lerngruppennamen** gefuehrt
- "Kontextvererbung" war offen - aufgeloest: **Abgeleiteter Kontext** ist eine bewusste Dialogentscheidung, keine automatische Vererbung
- "Verwandte Lerngruppen" waren offen zwischen Ignorieren und Dauerladen - aufgeloest: **Verwandter Kontext** wird leicht referenziert und nur bei Bedarf genutzt
- "Abschnitt befuellen" war offen zwischen vorhandener und neuer Struktur - aufgeloest: MoodleMcp kann beides, muss aber eine **Abschnittsentscheidung** klaeren
- "Projektversion" war offen zwischen Upstream und eigener Variante - aufgeloest: fuer die Fortbildung gilt die **IGS-Arbeitsversion** als Arbeitsbasis
- "Codex/Claude-Prioritaet" war offen - aufgeloest: **Codex-First** ist Pflicht fuer Version 1; Claude soll kompatibel bleiben, blockiert aber nicht
- "Sichtbarkeit des Forks" war offen - aufgeloest: die **IGS-Arbeitsversion** beginnt bevorzugt als **Privater Start**; falls das nicht moeglich ist, als klar markierte **Oeffentliche Arbeitsversion**
- "Lernsituation" ist Sprache aus dem bisherigen Projekt, aber nicht aus der IGS-Praxis - aufgeloest: kanonische Begriffe sind **Unterrichtseinheit** und **Unterthema**
- "didaktischer Abschnitt" klang wie ein starres Phasenmodell - aufgeloest: innerhalb eines **Unterthemas** wird per **Nummeriertem Inhaltsabschnitt** mit fachlichem Namen strukturiert
- "Lernlandkarte" klang wie ein Pflichtbestandteil des MCP-Umfangs - aufgeloest: fuer Version 1 ist sie ein manueller Aufbau auf dem fertigen **Lernpfad**
- "Testaktivitaet" ist noch zu breit - fuer Version 1 ist **Multiple-Choice-Test** Pflicht; Cloze, ai_text, Kurzantwort und Drag-and-drop bleiben Kandidaten fuer spaetere Ausbaustufen
- "Multiple Choice" war offen zwischen einer und mehreren richtigen Antworten - aufgeloest: Version 1 nutzt genau eine richtige Antwort und beliebig viele Antwortoptionen
- "MC-Feedback" war offen zwischen minimal und didaktisch hilfreich - aufgeloest: **Antwortfeedback** soll fuer falsche Antworten vorgeschlagen und vor Moodle-Schreibzugriff freigegeben werden
- "Feedbacksprache fuer Schueler" war offen - aufgeloest: keine diagnostische Fehlvorstellungsbenennung, sondern fachlicher Hinweis mit **Materialverweis im Feedback**
- "Materialbezug von Fragen" war offen - aufgeloest: jede V1-Frage braucht eine **Bezugsaktivitaet** als Beantwortbarkeitskontrolle
- "Gute Frage ohne Material" war offen - aufgeloest: als **Materialluecke** anzeigen und klaeren, nicht ungeprueft nach Moodle schreiben
- "Materialergaenzung" war offen - aufgeloest: nur als **Freigegebene Materialergaenzung**, standardmaessig als **Moodle-natives Material**
- "Externe Links" waren offen - aufgeloest: **Externer Link** bleibt in Version 1 moeglich, aber Moodle-interne Inhalte sind fuer zentrale Grundlagen bevorzugt
- "Externe Quellen als Testgrundlage" waren offen - aufgeloest: Fragen und Feedback nutzen eine **Moodle-interne Bezugsquelle**; externe Herkunft wird als **Quellenhinweis** dokumentiert
- "Schulbuchmaterial" war offen - aufgeloest: Quellen aus Lehrwerken werden als **Lehrwerkverweis** dokumentiert
- "Urheberrechtlich relevantes Material" war offen - aufgeloest: Nutzung als **Bereitgestelltes Lehrkraftmaterial** im lokalen/schulischen Kontext ist vorgesehen; Weitergabe braucht **Urheberrechtswarnung** und Verantwortung der Lehrkraft
- "Materialablage" war offen - aufgeloest: **Bereitgestelltes Lehrkraftmaterial** soll standardmaessig in einem **Lokalen Materialordner** gesichert werden
- "Materialdateinamen" waren offen - aufgeloest: KI soll **Sprechende Materialdateinamen** vorschlagen und Originalnamen im **Journal** dokumentieren
- "OCR fuer Screenshots" war offen - aufgeloest: **OCR-Extraktion** ist wichtig fuer Version 1; **OCR-Kontrolle** durch die Lehrkraft bleibt Pflicht
- "Original nach OCR" war offen - aufgeloest: **Originalmaterial** bleibt lokal erhalten; Moodle nutzt primaer bearbeiteten Text
- "Bilder aus Quellenmaterial" waren offen - aufgeloest: nur benoetigte **Fachabbildungen** werden als **Gezielter Bildausschnitt** in Moodle eingebettet
- "Alt-Texte und kleine Qualitaetsmassnahmen" waren offen - aufgeloest: **Alt-Text** ist Pflicht fuer **Fachabbildungen**; **KI-Qualitaetsroutinen** sollen standardmaessig mitlaufen
- "Materialtyp" war offen - aufgeloest: **Textseite** ist Standard; **Text- und Medienfeld** ist fuer Version 1 out of scope
- "Textseiten-Abschluss" war offen - aufgeloest: kein Abschluss durch Anzeigen; entweder **Materialtextseite** oder bewusst **Manueller Schuelerabschluss**
- "Textseiten-Gate als Standard" war offen - aufgeloest: **Materialtextseite** ohne Gate ist Standard
- "Aufgaben-Scope" war offen - aufgeloest: **Aufgabe** bleibt wichtig; **Aufgabe ohne Abgabe** ist ein gueltiger Arbeitsauftrag ohne Moodle-Upload
- "Aufgaben-Abgabe" war offen - aufgeloest: **Aufgabe ohne Abgabe** ist Standard; **Digitale Abgabe** nur bei ausdruecklichem Plan
- "Aufgaben-Gate" war offen - aufgeloest: digitale Aufgaben nutzen standardmaessig **Abgabeabschluss**; Bewertung als Gate nur explizit
- "Aufgabe ohne Abgabe als Gate" war offen - aufgeloest: standardmaessig **Manueller Schuelerabschluss**
- "Distraktorenqualitaet" war offen - aufgeloest: **Distraktoren** muessen plausible Fehlvorstellungen adressieren und eine kurze **Distraktorenbegruendung** erhalten
- "MC-Mischung" war offen - aufgeloest: **Antwortmischung** ist Standard; **Fragenreihenfolge** wird bewusst durch die Lehrkraft entschieden
- "MC-Punkte" war offen - aufgeloest: Version 1 nutzt **Richtig-Falsch-Bewertung** ohne Teilpunkte; **Bestehensgrenze** ist separat lehrkraftsteuerbar
- "Quiz-Versuche" war offen - aufgeloest: Standard ist **Lerncheck-Modus**; abweichender **Bewertungsmodus** bleibt moeglich
- "Feedback-Zeitpunkt" war offen - aufgeloest: **Lerncheck-Modus**, **Intensiv-Ueben-Modus** und **Bewertungsmodus** werden als drei dokumentierte Testmodi gefuehrt
- "Test-Sichtbarkeit" war offen - aufgeloest: Version 1 behandelt erzeugte Tests als **Fertige Testaktivitaet**; Verstecken/Freischalten bleibt ausserhalb des Kernworkflows
- "Zeitlimit" war offen - aufgeloest: Version 1 nutzt **Zeitoffene Lernchecks** ohne Zeitlimit
- "Testzweck" war offen zwischen Kontrolle und Lernpfadsteuerung - aufgeloest: Tests sollen als **Lernpfad-Gate** nutzbar sein
- "Quiz-Abschluss" war offen - aufgeloest: Testaktivitaeten sollen in Version 1 **Bestehensabschluss** nutzen
- "Moodle-Schreibzugriff" war als Grundsatz noch zu weich - aufgeloest: alle Moodle-Aenderungen brauchen einen **Freigegebenen Implementierungsplan**
- "Vorschauumfang" war offen - aufgeloest: **Gestufte Vorschau** mit Uebersicht und abrufbaren Details
- "Implementierungsplan" war offen zwischen Detailwust und knapper Liste - aufgeloest: wiederkehrende Regeln werden als **Planungsgrundsaetze** zusammengefasst; **Planabweichungen** werden sichtbar hervorgehoben
- "Voraussetzungen/Sperren" waren offen zwischen pauschal und gezielt - aufgeloest: jede **Freigabe-Voraussetzung** muss einzeln geplant und freigegeben werden
- "ai_text" bleibt ausserhalb von Version 1, ist aber als **AI-Textfrage** wichtiger spaeterer Ausbau fuer formulierte Verstaendnisnachweise
- "Richtig/Falsch" war offen als eigener Fragetyp - aufgeloest: Version 1 deckt das ueber **Multiple-Choice-Test** mit zwei Antwortoptionen ab
- "Skill-Nutzung" meint zwei Dinge - aufgeloest: fuer die MCP-Planung zaehlt der **Alignment-Prozess**; ein eigener **Unterrichtsplanungs-Skill** wird separat geplant
- "Quiz erstellen" klang wie ein reiner Erstimport - aufgeloest: **Quiz-Autorisierung** muss fuer Version 1 auch Nachsteuerung bestehender Tests und Fragen umfassen
- "Frage aendern" war offen bezueglich Identifikation und Freigabe - aufgeloest: bestehende Fragen brauchen **Frageidentifikation** und **Bestaetigte Vorschau**
- "Fragen-Diff" war offen - aufgeloest: kein klassisches Zeilendiff als Standard, sondern **Lesbare Fragenvorschau** mit **Inline-Aenderungsmarkierung** oder alter/neuer Fassung nebeneinander
- "Frage vor Freigabe bearbeiten" war offen - aufgeloest: **Kleine Fragenkorrekturen** sollen moeglich sein; **Grundlegende Fragenueberarbeitungen** gehen zurueck in die KI-Überarbeitung
- "Versionierte Frageaenderung" klang wie ein optionaler Archivmechanismus - aufgeloest: Es meint Moodles native Frageversionierung derselben Frage, nicht das Ersetzen oder Duplizieren einer Frage
- "Stabilitaet" koennte feste Versionsbindung als Default bedeuten - aufgeloest: fuer Version 1 ist **Immer aktuellste Version** der Standard; feste Bindung bleibt eine spaetere Sonderoption
- "Fragensammlung" war unklar zwischen Aktivitaet, Kurs und global - aufgeloest: Standard ist eine **Kurs-Fragensammlung** auf Kursebene, nicht die unmittelbare Aktivitaetsebene

**Aktivitaets-MCP**:
Ein eigener MCP-Server-Prozess fuer genau einen Moodle-Aktivitaetstyp (z.B. Quiz, Page, Assign), mit allen Formularfeldern explizit im Tool-Schema. Wird nur bei Bedarf fuer eine Umsetzungssession ueber das Setup-Tool aktiviert, nicht zur Laufzeit waehrend einer laufenden Session nachgeladen.
_Avoid_: ein MCP fuer alle Aktivitaeten, generisches Overrides-Objekt statt expliziter Felder, eine einzelne Aktivitaet auf mehrere Tools aufsplitten, Live-Nachladen mitten im Chat erwarten

**Core-MCP**:
Der immer geladene MCP-Teil fuer aktivitaetsunabhaengige Kurs-/Abschnitts-/Modul-Operationen: Sections lesen/verschieben, Module verschieben, Completion, Restriction, Kurskatalog.
_Avoid_: aktivitaetsspezifische Tools im Core, Core-Funktionen in jedem Aktivitaets-MCP duplizieren

**MCP-Abhaengigkeit**:
Manche Aktivitaets-MCPs brauchen ein anderes Aktivitaets-MCP zwingend mit (Quiz-MCP braucht Fragensammlung-MCP), waehrend das abhaengige MCP auch eigenstaendig ladbar bleibt, z.B. Fragensammlung ohne Quiz fuer getaggte Fragen in Textseiten.
_Avoid_: Fragensammlung nur als Teil des Quiz-MCP fest verdrahten, fehlende Abhaengigkeit beim Setup stillschweigend ignorieren

**Aktivitaetsregister**:
Eine release-gebundene Liste der verfuegbaren Aktivitaets-MCPs (Name, Abhaengigkeiten, Default an/aus, ob per API/Plugin unterstuetzt). Wird vom Setup-Tool fuer die Auswahl-Checkliste genutzt; gaengige Aktivitaeten (Page/Label/URL/Assign/Quiz+Fragensammlung) sind default an, exotische default aus. Kein Laufzeit-Probing pro Session oder Aktivitaetsstart.
_Avoid_: Registry bei jedem Sessionstart neu abgleichen, Lehrkraft muss Aktivitaets-MCPs von Hand in der Client-Config eintragen

**Werkzeugluecke**:
Eine sichtbar benannte Stelle, an der eine Lehrkraft eine Moodle-Aktivitaet plant, fuer die (noch) kein Aktivitaets-MCP bzw. keine Plugin-Webservice-Unterstuetzung existiert. Statt zu verschweigen oder abzulehnen, fuehrt Kurspilot die Lehrkraft durch die manuellen Schritte in der Moodle-Oberflaeche.
_Avoid_: Werkzeugluecke mit Kursstand-Luecke verwechseln (die betrifft Lesen, nicht Schreiben), stilles Scheitern ohne Anleitung, Aktivitaet einfach ablehnen
