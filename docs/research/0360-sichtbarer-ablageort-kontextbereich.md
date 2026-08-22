# Sichtbarer Ablageort des Kontextbereichs in Moodle

**Recherche zu [#360](https://github.com/matthiasgruenwald/moodle-coursepilot/issues/360)**, Karte
[#346](https://github.com/matthiasgruenwald/moodle-coursepilot/issues/346).

- **Quellstand Moodle:** Branch `MOODLE_500_STABLE` auf `github.com/moodle/moodle` (die
  LXC-Testinstanz läuft laut `docs/research/0358-aktivitaets-versionierung.md` auf Moodle 5.0.8);
  alle zitierten Mechaniken sind zusätzlich gegen `main` (5.x) gegengeprüft und dort unverändert
  (Pfade dort unter `public/`). Pfade ohne Präfix = Moodle-Quellbaum. Kurspilot-Dateien mit
  `Plugin/src/…` ausgewiesen (Stand `origin/moodle-native-mcp`).
- **Quellstand Kurspilot:** `local_kurspilot` mit Kontextbereich in `component=local_kurspilot`,
  `filearea=kurspilot_context`, `itemid=0` im eigenen Nutzerkontext
  (`Plugin/src/local_kurspilot/classes/context_files.php:37-60`).
- **docs.moodle.org** liefert anonymer Abfrage `403`; die Nutzerdokumentation ist über einen
  Wayback-Schnappschuss der 4.5-Fassung zitiert (Inhalt deckt sich mit dem geprüften Quellcode).
- **Vorarbeiten, die hier nicht wiederholt werden:** Zwischenstand „Kontextbereich schreibend"
  ([#352](https://github.com/matthiasgruenwald/moodle-coursepilot/issues/352), Kommentar vom
  2026-08-22): `write_context_file` + `append_context_file`, nur `.md`, 1 MB je Vorgang,
  `expected_contenthash` bei Voll-Writes, Handänderungs-Erkennung über contenthash/Größe/Zeit.

---

## Ergebnis in einem Satz

**User-Private-Files (`user`/`private`) ist der einzige Ablageort, der alle drei Forderungen des
Blackbox-Vetos — sichtbar, lesbar, verwaltbar — vollständig aus Moodle-Core bedient, und zwar auf
mehreren Wegen gleichzeitig** (Menü „Meine Dateien", Filepicker-Quelle „Private files" mit
Alias/Verweis-Fähigkeit, Zip-Export ganzer Ordner); die Plugin-Filearea mit eigener Verwaltungsseite
trägt dieselbe Mechanik als Fallback mit weniger geschenkter Integration, und ein Repository-Plugin
ist kein Ablageort, sondern ein zusätzlicher Zugangskanal, den Option 1 bereits gratis mitbringt.

## Empfehlung

| | |
|---|---|
| **Empfohlen** | **Option 1 — User-Private-Files** (`user`/`private`, Unterordner aus `local_kurspilot/contextroot`). |
| **Fallback** | Option 2 — Filearea bleibt, Plugin-Seite mit Filemanager macht sie verwaltbar (falls die Instanz `user/private` politisch nicht freigeben will). |
| **Kein Ablageort** | Option 3 — Repository-Plugin allein verwaltet nichts (nur Lese-/Kopierkanal); als Zusatz zu Option 1 bereits durch den Core abgedeckt. |

**Größter Vorbehalt:** Mit Option 1 zieht der Kontextbereich in einen Bereich, den die Lehrkraft
auch privat nutzt; die Kurspilot-Dateien sind dort ein Unterordner unter anderen. Die harte Grenze
„KI sieht nur den Kurspilot-Unterordner" bleibt trotzdem im Plugincode (Sandbox-Wurzel), nicht in
der Filearea. Der #344-Schalter schützt weiterhin nur den Maschinenzugriff — dass die Lehrkraft
ihre eigene markierte Datei in der Moodle-UI öffnen kann, ist gewollt und stimmig (Teil 4).

---

# Teil 1 — Ausgangslage

Der Kontextbereich liegt heute in einer eigenen Filearea im privaten Nutzerkontext
(`Plugin/src/local_kurspilot/classes/context_files.php:40-46`), erreichbar ausschließlich über die
Webservices `local_kurspilot_list_context_files` und `local_kurspilot_read_context_file`
(`Plugin/src/local_kurspilot/db/services.php:81-92`). In der Moodle-UI ist er unsichtbar — das war
die #343-Prämisse, die die Lehrkraft gekippt hat.

Was feststeht und hier nicht neu entschieden wird:

- **Werkzeugoberfläche nennt nie den Speicherort** (#343): die Tools heißen nach ihrem Anker
  („Kontextbereich"), `COMPONENT`/`FILEAREA` sind Konstanten im Plugincode. Ein Ablageortwechsel ist
  damit eine reine Implementierungsfrage hinter denselben Toolnamen.
- **Personenisolation** kommt heute daraus, dass `contextid`/`component`/`filearea`/`itemid` nie aus
  Client-Eingaben stammen (`context_files.php:24-31`), plus Pfad-Sandbox gegen `../`
  (`context_files.php:80-93`).
- **#344-Schalter** wirkt auf der Frontmatter-Markierung `personenbezug: true` und nur im
  Webservice-Lesepfad (`Plugin/src/local_kurspilot/classes/personal_data.php:41-57`,
  `classes/external/read_context_file.php:82-87`, `classes/external/list_context_files.php:95-106`).
- **#345-Privacy-Provider** exportiert und löscht die Filearea über `export_area_files()`/
  `delete_area_files()` mit den Konstanten aus `context_files`
  (`Plugin/src/local_kurspilot/classes/privacy/provider.php:150-223`).

---

# Teil 2 — Die drei Optionen

## 2.1 Option 1: User-Private-Files (`user`/`private`)

Die Dateien wandern in den privaten Dateibereich, den Moodle jeder Person einräumt:
`component=user`, `filearea=private`, `itemid=0`, derselbe Nutzerkontext wie heute. Der
Kurspilot-Unterordner bleibt über das bestehende Admin-Setting `local_kurspilot/contextroot`
(Default `kurspilot`) konfigurierbar (`Plugin/src/local_kurspilot/settings.php:62-68`) — er wird vom
Filearea-Anker zum bloßen Unterordner unterhalb von `private`.

**Sichtbarkeit/Erreichbarkeit (Core, kein Kurspilot-Code):**

- Seite „Meine Dateien" (`user/files.php`): erreichbar über das Nutzermenü; guarded durch
  `require_capability('moodle/user:manageownfiles', $context)` im eigenen Nutzerkontext
  (`user/files.php:34`), rendert den Standard-Filemanager
  (`user/classes/form/private_files.php:55`, Optionen `subdirs=1`, `accepted_types=*`,
  `maxfiles=-1`, Quota `userquota`, `user/classes/form/private_files.php:137-145`; Schreibziel
  `'user', 'private', 0` ebenda `:158-159`).
- Filepicker-Quelle „Private files": das Core-Repository `repository_user` listet genau diese Area
  im Datei-Auswahlmenü jeder Dateiauswahl (Kurs, Aktivität …), mit Verwaltungsverweis auf
  `/user/files.php` (`repository/user/lib.php:59-60`), Rückgabetypen
  `FILE_INTERNAL | FILE_REFERENCE` (`repository/user/lib.php:159`), installiert sich bei der
  Moodle-Installation selbst (`repository/user/db/install.php`, `repository_type('user', [], true)`),
  Capability `repository/user:view` mit Archetyp `user=ALLOW`
  (`repository/user/db/access.php:30-36`). Damit ist der von der Lehrkraft gewünschte
  „Favoriten-Eintrag" im Filepicker ein Core-Artefakt.
- Nutzerdokumentation: Zugriff über Nutzermenü oder Block, Ordner anlegen, Hochladen inkl.
  Drag-and-drop, Listenansicht mit Mehrfachauswahl und Massenlöschung, Alias/Verweis-Fähigkeit,
  E-Mail-in-Private-Files (optional), Quota `userquota`, Abschaltweg über `manageownfiles` +
  `repository/user:view` (docs.moodle.org/405/en/Private_files, Wayback-Schnappschuss 2024-10-10).

**Geschenkte Dateiverwaltung (Q1):** Der Filemanager-Unterbau deckt über
`repository/draftfiles_ajax.php` ab: Ordner anlegen (`mkdir`), Einzeldatei löschen (`delete`),
Massenlöschung (`deleteselected`), Datei umbenennen (`updatefile`), Ordner umbenennen
(`updatedir`), Zip im Bereich (`zip`), Entpacken (`unzip`), ausgewählte Dateien als Zip
(`downloadselected`) und ganzen Ordner als Zip (`downloaddir`, beides über
`repository_download_selected_files()` in `repository/lib.php:3319-3362`). Hinzu kommt der
Einzeldatei-Download über die Filemanager-URL. **Kurspilot braucht damit keinen eigenen
Lösch-/Umbenannt-/Verschiebe-Endpunkt** — genau die #352-Forderung.

**#343-Vertrag (Q2):**

- *Speicherunabhängige Werkzeugoberfläche:* bleibt — die Tools heißen weiter nach dem Anker; nur die
  Konstanten `COMPONENT`/`FILEAREA` in `context_files` ändern sich.
- *Personenisolation:* bleibt, und wird stärker: `user/private` liegt im eigenen Nutzerkontext und
  wird zusätzlich vom Core gegen fremde Blicke abgeschirmt; die Werkzeuge adressieren weiterhin nur
  `context_user::instance($USER->id)` (`context_files.php:57-60`).
- *Pfad-Sandbox:* bleibt — `resolve_directory()`/`resolve_file()` weisen `.`/`..` weiter ab
  (`context_files.php:80-120`); die Sandbox-Wurzel ist dann `/kurspilot/` innerhalb von `private`.
  Der Unterordner bleibt „rein organisatorisch" (wie heute, `settings.php:58-61`): die Grenze ist
  die Auflösung im Plugincode, nicht der Ordnername.

**#345-Privacy (Q4):** Der Core-Privacy-Provider von `core_user` exportiert `user/private`
vollständig (`user/classes/privacy/provider.php:414`) und löscht bei einer Personenlöschung alle
Dateien der Komponente `user` (`user/classes/privacy/provider.php:306`). Auskunft und Löschung
laufen dann über den Core; der Kurspilot-Provider schrumpft auf die OAuth-Tabellen (sein
Datei-Teil wird toter Code und kann mit der Migration fallen). Die Auskunft bleibt vollständig —
die Dateien erscheinen im Core-Export unter „Private files".

**Export/Weitergabe (Q5):** Zip-Download ausgewählter Dateien oder eines ganzen Ordners
(`downloadselected`/`downloaddir`, Teil 2.1 „Geschenkte Dateiverwaltung") liefert das
Weitergabepaket. Weiterreichen in andere Kontexte läuft über die Filepicker-Quelle „Private files":
`FILE_INTERNAL` kopiert die Datei in jede andere Filearea (z. B. eine Kurs-Aktivität),
`FILE_REFERENCE` legt einen Alias/Verweis an, der Änderungen am Original automatisch nachzieht
(docs.moodle.org/405/en/Private_files, Abschnitt „Making an alias/shortcut"). Beides ohne
Kurspilot-Code.

**Append-Tauglichkeit (Q6):** Ja. `append_context_file` ist ein serverseitiges
Lesen-Ergänzen-Schreiben über die Files-API; das funktioniert in jeder Filearea identisch, auch in
`user/private` (der Schreibvorgang aus #352 ist speicherunabhängig formuliert). Einzelheit unten in
Teil 3.2 (gemeinsames Restrisiko mit Option 2: paralleler UI-Editierschritt).

**Rechte (Q7):** `moodle/user:manageownfiles` (Archetyp `user=ALLOW`, `lib/db/access.php:619-628`
auf `MOODLE_500_STABLE`) und für den Filepicker-Eintrag `repository/user:view` (Archetyp
`user=ALLOW`) — beides Standard-Nutzerrechte, **keine Zusatz-Capability**, genau wie #343 es vorsah.

**Kosten/Risiken:**

- Der Kontextbereich vermischt sich optisch mit den übrigen privaten Dateien der Lehrkraft
  (getrennt nur durch den Unterordner); die KI-Sandbox bleibt davon unberührt.
- Die private Quota (`userquota`) gilt für den gesamten Privatbereich inkl. Kurspilot-Dateien.
- Die Schule kann Private Files abschalten (Capability entziehen oder Repository deaktivieren,
  docs.moodle.org „Preventing access to Private files") — dann wäre auch der Kontextbereich weg.
  Standard-Schulinstanzen haben den Bereich aktiviert; ein operatives Restrisiko bleibt.
- Einmalige Migration des Bestands aus der #343-Filearea (Teil 3.3).

## 2.2 Option 2: Plugin-Filearea bleibt + Plugin-Verwaltungsseite

Die #343-Filearea (`local_kurspilot`/`kurspilot_context`) bleibt, Kurspilot ergänzt eine
Nutzerseite mit Filemanager-Element (gebunden an `local_kurspilot`/`kurspilot_context`/`0` im
eigenen Nutzerkontext) nach dem Muster der bestehenden Verbindungsseite
(`Plugin/src/local_kurspilot/connections.php`) plus `local_kurspilot_pluginfile()` in `lib.php`
für Downloads. Der Core-Auslieferweg für Plugin-Dateien ist `<component>_pluginfile()` in der
plugin-eigenen `lib.php`, aufgerufen aus `file_pluginfile()` (`lib/filelib.php:5376-5385` im
„arbitrary context"-Zweig); die Zugriffsprüfung (Login + Eigentümerschaft) muss der Callback selbst
leisten — der Core tut das in diesem Zweig nicht.

**Geschenkte Dateiverwaltung (Q1):** Dieselbe Filemanager-Mechanik wie in Option 1 (derselbe
`draftfiles_ajax.php`-Unterbau, derselbe `file_postupdate_standard_filemanager()`-Rückweg,
`lib/filelib.php:334-360`), nur auf einer Kurspilot-Seite statt „Meine Dateien". Löschen,
Umbenennen, Verschieben, Zip-Download: geschenkt; eigener Lösch-Endpunkt: nein.

**#343-Vertrag (Q2):** Unverändert — Filearea, Isolation und Sandbox bleiben buchstäblich wie sie
sind; die Werkzeugoberfläche ändert sich nicht.

**#345-Privacy (Q4):** Unverändert — der bestehende Provider
(`Plugin/src/local_kurspilot/classes/privacy/provider.php`) findet, exportiert und löscht die
Dateien am alten Ort weiter.

**Export/Weitergabe (Q5):** Zip-Download auf der Plugin-Seite: ja (Weitergabepaket). Weiterreichen
in andere Kontexte: **nein, nicht direkt** — die Datei muss herunter- und anderswo wieder
hochgeladen werden; eine Filepicker-Quelle oder Alias-Fähigkeit entsteht nur, wenn zusätzlich ein
Repository-Plugin (Option 3) gebaut wird.

**Append-Tauglichkeit (Q6):** Ja, wie heute (dieselbe Filearea).

**Rechte (Q7):** Standard-Nutzerrecht genügt (eigener Nutzerkontext, `require_login()`); keine
Zusatz-Capability nötig.

**Kosten/Risiken:**

- Sichtbarkeit nur über den Kurspilot-Menüeintrag (z. B. Profilnavigation wie bei `connections.php`,
  `Plugin/src/local_kurspilot/lib.php:38-57`) — „Meine Dateien" und Filepicker bleiben außen vor;
  das Blackbox-Veto („am besten auf mehreren Wegen") ist nur teilweise erfüllt.
- Kurspilot baut und pflegt eine eigene Verwaltungs-UI samt Download-Callback, statt Core-UI zu
  nutzen — mehr eigener Code gegen das Leitmotiv der Karte (#346, „weniger Programmcode").

## 2.3 Option 3: Repository-Plugin für den Filepicker

Ein neues Plugin `repository_kurspilot` (Plugin-Typ `repository/`, Verzeichnis
`/repository/kurspilot/`) listet den Kontextbereich im Datei-Auswahlmenü — das ist die
Lehrkraft-Idee des „Favoriten-Eintrags". Vorbild ist das Core-`repository_user`
(`repository/user/lib.php`): `get_listing()` über die File-Browser-API, Rückgabetypen
`FILE_INTERNAL | FILE_REFERENCE`, `has_moodle_files()=true`. Nötig sind `lib.php` mit der von
`\repository` erbenden Klasse, `db/access.php` mit `repository/kurspilot:view`, `version.php`,
Sprachdatei; die Instanz legt `plugin_init()` oder `db/install.php` an
(moodledev.io/docs/apis/plugintypes/repository). Der Core erzwingt bei Nutzerkontext-Instanzen die
Eigentümerschaft (`repository/lib.php:775-778`: `$repocontext->instanceid != $USER->id` → kein
Zugriff) und sperrt private Repositories bei „Login als" (`repository/lib.php:766-771`).

**Geschenkte Dateiverwaltung (Q1):** **Keine.** Ein Repository ist ein Lese-/Kopierkanal des
Filepickers; Löschen, Umbenennen, Verschieben existieren in der Repository-API nicht. Kurspilot
bräuchte weiterhin eine Verwaltungsseite (Option 2) oder den Umzug nach `user/private` (Option 1).
**Option 3 ist daher kein Ablageort, sondern ein Zusatzkanal** — und für Option 1 schon enthalten
(Core-`repository_user` listet den gesamten Privatbereich inkl. Kurspilot-Unterordner).

**#343-Vertrag (Q2):** Mit dem Zusatzkanal vereinbar: `source`-Parameter sind base64-kodierte
`filepath`/`filename`-Paare, die mit `PARAM_PATH`/`PARAM_FILE` gereinigt werden müssen (wie in
`repository/user/lib.php:66-70`); die Eigentümerschaft prüft `check_capability()` (oben). Die
Werkzeugoberfläche bleibt speicherunabhängig.

**#345-Privacy (Q4):** Das Repository selbst speichert keine Dateien (die Area bleibt, wo sie ist);
das Plugin bräuchte einen `null_provider`. Die Datenschutzfrage hängt also an Option 1 oder 2.

**Export/Weitergabe (Q5):** `FILE_INTERNAL` kopiert die Datei in jede Ziel-Filearea,
`FILE_REFERENCE` verweist sie — Weitergabe ja, Verwaltung nein.

**Append-Tauglichkeit (Q6):** Trägt nichts bei (kein Schreibkanal; Append bleibt Sache der
darunterliegenden Area).

**Rechte (Q7):** Neue Capability `repository/kurspilot:view` nötig (Archetypen z. B.
`teacher`/`editingteacher`/`user`); zusätzlich muss die Administration den Repository-Typ unter
„Plugins > Repositories" aktivieren. Außerdem liegt ein `repository/`-Plugin außerhalb des heutigen
Deployment-Wegs (`scripts/deploy-plugin.sh` synced nur `local/coursepilot`).

---

# Teil 3 — Querschnitt

## 3.1 Vergleichstabelle (die sieben Ticketfragen)

| Frage | Option 1: `user`/`private` | Option 2: Filearea + Plugin-Seite | Option 3: Repository-Plugin |
|---|---|---|---|
| **Q1 Geschenkte Dateiverwaltung** (Löschen/Umbenennen/Verschieben/Download/Ersetzen; eigener Lösch-Endpunkt?) | Vollständig: Ordner anlegen, (Massen-)Löschen, Datei-/Ordner-Umbenennen, Zip, Zip-Download, Einzeldownload — Core-UI „Meine Dateien". **Kein Kurspilot-Endpunkt nötig.** | Dieselbe Filemanager-Mechanik auf einer Kurspilot-Seite; zusätzlich `local_kurspilot_pluginfile()` für Downloads. **Kein Kurspilot-Endpunkt nötig.** | **Keine** — nur Lese-/Kopierkanal. Verwaltungsfrage unbeantwortet. |
| **Q2 #343-Vertrag** (speicherunabhängige Oberfläche, Personenisolation, Pfad-Sandbox) | Bleibt: Toolnamen unverändert, Isolation = eigener Nutzerkontext (Core + Plugin), Sandbox-Wurzel wandert in den Unterordner unter `private`. | Bleibt buchstäblich unverändert. | Als Zusatzkanal vereinbar (Eigentümerprüfung im Core, Parameterreinigung nötig); kein Ablageort. |
| **Q3 #344-Schalter vs. UI-Zugriff** | Stimmig ohne UI-Durchsetzung (Teil 4). | Stimmig ohne UI-Durchsetzung (Teil 4). | Stimmig: Picker-Auswahl ist eine Handlung der Lehrkraft, kein Maschinenzugriff. |
| **Q4 #345-Privacy-Provider** | Core übernimmt Auskunft/Löschung für `user/private` (`user/classes/privacy/provider.php:414,306`); Kurspilot-Provider schrumpft auf OAuth. Vollständig. | Unverändert — Provider findet die Dateien am alten Ort. Vollständig. | Speichert nichts; `null_provider`. Datenschutz hängt an Option 1/2. |
| **Q5 Export/Weitergabe** (mehrere Dateien/Ordner, andere Kontexte) | Zip-Download (Auswahl oder ganzer Ordner) + Filepicker-Quelle „Private files": Kopie (`FILE_INTERNAL`) oder Alias (`FILE_REFERENCE`) in jeden anderen Kontext. | Zip-Download auf der Plugin-Seite; Weitergabe nur per Herunterladen/Hochladen — keine Picker-Quelle, kein Alias. | Kopie/Alias in Zielkontexte ja; aber keine Verwaltung und kein Zip aus dem Picker. |
| **Q6 Append-Tauglichkeit** (Journal) | Ja — serverseitiges Lesen-Ergänzen-Schreiben über die Files-API in jeder Area; Restrisiko Teil 3.2. | Ja (wie heute); Restrisiko Teil 3.2. | Kein Schreibkanal — trägt nichts bei. |
| **Q7 Capabilities** | Standard-Nutzerrecht: `moodle/user:manageownfiles` + `repository/user:view` (beide Archetyp `user=ALLOW`). **Keine Zusatz-Capability.** | Standard-Nutzerrecht (eigener Kontext). **Keine Zusatz-Capability.** | Neue Capability `repository/kurspilot:view` + Admin-Aktivierung des Repository-Typs. |

## 3.2 Das #344-Verhältnis: Schalter schützt Maschinenzugriff, nicht die Eigentümerin

Der Schalter (`local_kurspilot/allowpersonaldata`, Default aus,
`Plugin/src/local_kurspilot/settings.php:77-82`) wirkt auf die Frontmatter-Markierung und heute an
zwei Stellen: Voll-Lesen wirft `contextfilelocked` (`classes/external/read_context_file.php:85-87`),
die Liste zeigt `locked=true` (`classes/external/list_context_files.php:98-106`). Sein Zweck laut
#344: eine **gegenüber einer Datenschutzprüfung vorzeigbare Grenze für den KI-Zugriff** auf
mitgebrachten Bestand (importierte Pakete, Migrations-Uploads) — nicht das Verstecken von Dateien
vor ihrer Eigentümerin.

Dass die Lehrkraft ihre eigene, markierte Datei in der Moodle-UI öffnen kann (Option 1: „Meine
Dateien"; Option 2: Plugin-Seite), ist deshalb **stimmig und braucht keine UI-seitige
Durchsetzung**:

1. Der Zugriff der Eigentümerin auf ihre eigene Datei im eigenen Nutzerkontext ist kein
   Datenschutzvorfall — die Datei gehört ihr; der Schalter grenzt die *Maschine* ab.
2. Die UI-Durchsetzung würde das Blackbox-Veto selbst brechen: Eine sichtbare Verwaltung verlangt,
   dass die Lehrkraft markierte Dateien ansehen, prüfen und löschen kann — genau das ist der Sinn
   der Sichtbarkeit.
3. Die Schreibseite ist bereits konsistent geregelt: #352 lehnt das Schreiben markierter Dateien bei
   ausgeschaltetem Schalter plugin-seitig ab ([#352](https://github.com/matthiasgruenwald/moodle-coursepilot/issues/352),
   Zwischenstand „Personenbezug").

Optional und ohne Vertragsänderung möglich: Die Kurspilot-Liste (Plugin-Seite oder Webservice-Antwort)
könnte markierte Dateien bei ausgeschaltetem Schalter mit dem Hinweis „für KI gesperrt" kennzeichnen —
sichtbar gesperrt statt unsichtbar, wie #344 es für die KI-Liste schon vorschreibt.

## 3.3 Migration und Parallelbetrieb

- **Option 1:** Einmaliger Umzug des Bestands von `(local_kurspilot/kurspilot_context/0)` nach
  `(user/private/0)` unterhalb der Sandbox-Wurzel — Files-API
  (`create_file_from_storedfile()` mit neuem `filerecord`), als Upgrade-Schritt oder faul beim ersten
  Zugriff; danach Alter-Area aufräumen. Der Privacy-Provider muss parallel angepasst werden
  (Datei-Teil fällt an den Core, OAuth-Teil bleibt). Werkzeuge und Skills merken nichts, solange
  `context_files` die neuen Konstanten trägt.
- **Option 2:** Keine Migration — die Area bleibt; die Seite kommt hinzu.
- **Option 3:** Keine Datei-Migration (liest die bestehende Area), aber ein zweites Plugin, ein
  zweiter Deployment-Pfad und eine Admin-Aktivierung.

## 3.4 Restrisiko für Option 1 und 2 gemeinsam: paralleles UI-Editieren

Beide Optionen bearbeiten Dateien in der Moodle-UI über den Filemanager, der beim Öffnen eine
Draft-Kopie anlegt und beim Speichern zurückschreibt (`file_postupdate_standard_filemanager()`,
`lib/filelib.php:334-360` → `file_save_draft_area_files()`, `lib/filelib.php:1107`). Hängt die
Lehrkraft eine Seite mit offenem, altem Draft, während die KI gleichzeitig ein Journal-Append
schreibt, kann ihr Speichern das Append überschreiben. Das ist dasselbe Risiko, das #352 für
Handänderungen bereits adressiert: Voll-Writes scheitern kontrolliert an
`expected_contenthash`; Appends sind bewusst ungeprüft („Append wird nie geprüft"), das Fenster ist
klein und der Schaden wiederherstellbar (Journal-Eintrag kann erneut geschrieben werden). Ein
Ablageort-Argument ist das nicht — es trifft Option 1 und 2 gleichermaßen und verschwindet auch bei
heutiger Filearea nicht, sobald irgendeine UI bearbeitet.

---

# Teil 4 — Empfehlung und Begründung

**Empfohlen: Option 1 — User-Private-Files.** Begründung entlang der Ticket-Kriterien:

1. **Blackbox-Veto vollständig:** sichtbar, lesbar, verwaltbar — und zwar auf mehreren Wegen:
   Nutzermenü („Meine Dateien"), Filepicker-Quelle „Private files" (der gewünschte Favoriten-Eintrag,
   als Core-Repository bereits installiert), Zip-Export, optional E-Mail-Zugang. Keine der anderen
   Optionen erreicht mehr als einen Teil davon.
2. **Geschenkte Verwaltung ohne Kurspilot-Endpunkt** (Q1): der gesamte Filemanager-Unterbau
   (Löschen inkl. Massenlöschung, Umbenennen von Dateien und Ordnern, Verschieben, Zip/Unzip,
   Download) ist Core; Kurspilot baut nichts Eigenes — das erfüllt die #352-Auflage wörtlich und
   folgt dem Leitmotiv der Karte („weniger Programmcode für denselben Funktionsumfang", #346).
3. **Weitergabe ohne Sonderweg** (Q5): Kopie oder Alias in jeden anderen Moodle-Kontext über den
   Filepicker (`FILE_INTERNAL`/`FILE_REFERENCE`), Zip für außerhäusige Pakete.
4. **#343-Vertrag bleibt stehen** (Q2): speicherunabhängige Werkzeugoberfläche, Personenisolation
   (eigener Nutzerkontext, jetzt zusätzlich Core-geschützt), Pfad-Sandbox unverändert — nur die
   Konstanten in `context_files` wechseln.
5. **#345 wird einfacher** (Q4): Auskunft und Löschung für `user/private` erledigt der
   Core-Provider; der Kurspilot-Provider verliert seinen Datei-Teil, statt ihn zu pflegen.
6. **Keine Zusatz-Capability** (Q7): Standard-Nutzerrechte genügen, wie #343 es versprochen hat.

**Was die Empfehlung kostet** (im Entscheidungsticket
[#361](https://github.com/matthiasgruenwald/moodle-coursepilot/issues/361) abzuwägen):
Kurspilot-Dateien teilen sich den Privatbereich und dessen Quota mit den übrigen privaten Dateien;
die Schule kann Private Files insgesamt abschalten (operatives Restrisiko); der Bestand muss einmal
migriert werden; der #344-Schalter schützt weiterhin nur den Maschinenzugriff (Teil 3.2, als
stimmig bewertet).

**Option 2 als Fallback**, falls die Instanz den Privatbereich nicht als Kurspilot-Ablage freigeben
will: dieselbe Verwaltungsmechanik, unveränderter Privacy-Provider, keine Migration — aber nur ein
Zugangsweg, keine Filepicker-Quelle/Alias-Weitergabe und eine eigene Verwaltungs-UI, die Kurspilot
dauerhaft pflegt.

**Option 3 nicht als Ablageort**: keine Verwaltung, neue Capability, zweites Plugin, zweiter
Deployment-Pfad, Admin-Aktivierung — und ihr einziger Mehrwert (Filepicker-Eintrag) ist bei Option 1
bereits Core-Bestandteil.

---

# Quellen

**Moodle-Quellcode** (Branch `MOODLE_500_STABLE`, gegen `main` gegengeprüft; `main`-Pfade mit
`public/`-Präfix):

- `user/files.php:28-56` — Seite „Meine Dateien", Capability-Prüfung, Filemanager-Formular.
- `user/classes/form/private_files.php:55,137-145,158-159` — Filemanager-Optionen (Subdirs, Quota),
  Schreibziel `user`/`private`/`0`.
- `lib/db/access.php:619-628` — `moodle/user:manageownfiles` (Archetyp `user=ALLOW`).
- `repository/draftfiles_ajax.php:71-200` — Verwaltungsoptionen des Filemanagers (`mkdir`, `delete`,
  `deleteselected`, `updatefile`, `updatedir`, `zip`, `downloadselected`, `downloaddir`, `unzip`).
- `repository/lib.php:3319-3362` (`repository_download_selected_files`) und `:753-800`
  (`check_capability` mit Eigentümerprüfung für Nutzerkontext-Instanzen und „Login als"-Sperre).
- `repository/user/lib.php:59-60,159` und `repository/user/db/access.php:30-36`,
  `repository/user/db/install.php` — Core-Repository „Private files".
- `user/classes/privacy/provider.php:306,414` — Core-Auskunft/-Löschung für `user/private`.
- `lib/filelib.php:334-360` (`file_postupdate_standard_filemanager`), `:1107`
  (`file_save_draft_area_files`), `:5376-5385` (Plugin-Dateiauslieferung über
  `<component>_pluginfile()`).

**Moodle-Dokumentation:**

- docs.moodle.org/405/en/Private_files (Wayback-Schnappschuss vom 2024-10-10; Originalseite liefert
  anonym `403`): Zugangswege, Massenlöschung, Alias/Verweis, Quota, Abschaltweg.
- moodledev.io/docs/apis/plugintypes/local (abgerufen 2026-08-22): Local-Plugin-Struktur,
  `settings.php`, Navigations-Callbacks.
- moodledev.io/docs/apis/plugintypes/repository (abgerufen 2026-08-22): Repository-API
  (`get_listing`, `supported_returntypes`, Instanzen, `plugin_init`, Capability-Konvention).

**Kurspilot-Bestand** (`origin/moodle-native-mcp`):

- `Plugin/src/local_kurspilot/classes/context_files.php` (Anker, Isolation, Sandbox),
  `classes/personal_data.php` und `classes/external/{list_context_files,read_context_file}.php`
  (#344-Schalter), `classes/privacy/provider.php` (#345), `settings.php`
  (`contextroot`, `allowpersonaldata`), `db/services.php`, `db/access.php`, `connections.php`,
  `lib.php` (Seiten-/Callback-Muster).

**Tickets:**

- [#343](https://github.com/matthiasgruenwald/moodle-coursepilot/issues/343) (Kontextablage:
  auflisten und lesen), [#344](https://github.com/matthiasgruenwald/moodle-coursepilot/issues/344)
  (Schalter personenbezogene Kontextdaten),
  [#345](https://github.com/matthiasgruenwald/moodle-coursepilot/issues/345) (Privacy-Provider),
  [#352](https://github.com/matthiasgruenwald/moodle-coursepilot/issues/352) (Kontextbereich
  schreibend, Zwischenstand-Kommentar vom 2026-08-22),
  [#361](https://github.com/matthiasgruenwald/moodle-coursepilot/issues/361) (Entscheidungsticket
  Ablageort), [#346](https://github.com/matthiasgruenwald/moodle-coursepilot/issues/346) (Karte).
