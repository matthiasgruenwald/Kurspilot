# Kurspilot-Nebenbereich als Ablageort des Kontextbereichs — unabhängig vom Private-files-Schalter

**Recherche zu [#362](https://github.com/matthiasgruenwald/moodle-coursepilot/issues/362)**, Karte
[#346](https://github.com/matthiasgruenwald/moodle-coursepilot/issues/346). Aufbauend auf
[#360](https://github.com/matthiasgruenwald/moodle-coursepilot/issues/360)
(Bericht `docs/research/0360-sichtbarer-ablageort-kontextbereich.md`, Branch
`research/0360-sichtbarer-ablageort`; im Folgenden als „Bericht 360" zitiert, z. B. „360 §2.2").

- **Quellstand Moodle:** Branch `MOODLE_500_STABLE` auf `github.com/moodle/moodle`
  (Testinstanz läuft Moodle 5.0.8); Pfade ohne Präfix = Moodle-Quellbaum. Die zitierten
  Mechaniken sind gegen `main` (5.x) gegengeprüft und dort inhaltlich unverändert
  (dort unter `public/`).
- **Quellstand Kurspilot:** Worktree auf `origin/moodle-native-mcp`; Kurspilot-Dateien mit
  `Plugin/src/…` ausgewiesen.
- **docs.moodle.org** liefert anonyme Abfragen `403`; wo Nutzerdokumentation nötig ist, wird
  der Wayback-Schnappschuss aus Bericht 360 (§2.1) mitverwendet. moodledev.io ist frei erreichbar.
- **Nicht wiederholt** werden die Befunde aus Bericht 360 (Optionen 1–3 einzeln, Migration,
  #344-Verhältnis); sie werden hier nur bestätigt, wo die Kombination sie berührt (Teil f).

**Die geprüfte Kombination** (Ticket #362):

1. **Ablage** bleibt die plugin-eigene Filearea `local_kurspilot`/`kurspilot_context`, `itemid=0`
   im eigenen Nutzerkontext (`Plugin/src/local_kurspilot/classes/context_files.php:40-46,57-60`).
2. **Verwaltung** über eine Kurspilot-Plugin-Seite mit Filemanager nach dem Muster von
   `Plugin/src/local_kurspilot/connections.php` plus einem neuen `local_kurspilot_pluginfile()`
   in `Plugin/src/local_kurspilot/lib.php` (heute existiert dort nur
   `local_kurspilot_myprofile_navigation()`, `lib.php:38-57`).
3. **Filepicker-Reiter „Kurspilot"** über ein neues `repository_kurspilot` (Plugin-Typ
   `repository/`): Kopie (`FILE_INTERNAL`) / Alias (`FILE_REFERENCE`) in andere Kontexte.

---

## Ergebnis in einem Satz

**Die Kombination erfüllt das Blackbox-Veto (sichtbar, lesbar, verwaltbar, mehrere Wege,
Weitergabe) vollständig und als einzige Option ohne jede Abhängigkeit vom Private-files-Schalter;
der Preis ist ein zweites Plugin mit eigenem Deployment-Pfad, eine selbst gepflegte
Verwaltungs-UI (~550–700 Zeilen eigener Code gegenüber ~50–100 bei Option 1) und eine
Core-Falle, die man kennen muss: die File-Browser-API ist für die Kurspilot-Filearea blind,
deshalb muss `repository_kurspilot` drei Repository-Methoden selbst überschreiben.**

## Empfehlung

| | |
|---|---|
| **Empfohlen** | **Nebenbereich als alleiniger Ablageort** — wenn die Unabhängigkeit vom Private-files-Schalter harte Anforderung bleibt (laut #362 der erklärte Wunsch der Lehrkraft). Die Kombination ist tragfähig, migrationsfrei und das einzige Konstrukt, das den Schalter überlebt. |
| **Alternative** | Option 1 (User-Private-Files, Bericht 360) — wenn die Schule Private Files garantiert aktiviert lässt; dann deutlich weniger eigener Code. |
| **Verworfen** | Parallelbetrieb beider Ablageorte gleichzeitig (ein Anker, eine Wahrheit — Teil g). |

---

# Teil 1 — Was die Kombination trägt (Kurzbewertung vorab)

- Die Filearea ist **konstruktionsunabhängig** vom Private-files-Schalter: Der Schalter besteht aus
  der Capability `moodle/user:manageownfiles` und der Sichtbarkeit des Core-Repositories `user`
  (Bericht 360 §2.1 „Kosten/Risiken"). Keines von beiden berührt eine Filearea der Komponente
  `local_kurspilot` — weder beim Speichern (Webservices, Files-API) noch beim Anzeigen
  (Kurspilot-Seite prüft eigene Voraussetzungen, nicht `manageownfiles`).
- Die Verwaltungsseite erbt **dieselbe Filemanager-Mechanik** wie „Meine Dateien"
  (Bericht 360 §2.2): Löschen inkl. Massenlöschung, Umbenennen, Verschieben, Zip/Unzip,
  Download — alles Core-Unterbau (`repository/draftfiles_ajax.php`), kein Kurspilot-Endpunkt.
- Das Repository-Plugin liefert den in #360 vermissten **zweiten Zugangsweg** und die
  **Alias-Weitergabe**: Der Filepicker-Reiter „Kurspilot" erscheint in jeder Dateiauswahl der
  Instanz und kopiert/verweist Dateien in Kurse und Aktivitäten.

# Teil 2 — Die Ticketfragen

## a) Blackbox-Veto: Kombination gegen Option 1

| Blackbox-Kriterium | Option 1: User-Private-Files (Bericht 360 §2.1) | Kombination (Filearea + Plugin-Seite + Repository) |
|---|---|---|
| **Sichtbar** | Nutzermenü „Meine Dateien" (`user/files.php:28-55`) | Kurspilot-Seite, verlinkt über Profilnavigation (Muster `Plugin/src/local_kurspilot/lib.php:38-57`) + Filepicker-Reiter „Kurspilot" (sichtbar in jeder Dateiauswahl) |
| **Lesbar** | Filemanager + Core-`repository_user` | Filemanager + Einzeldownload über `local_kurspilot_pluginfile()` (Pflicht: eigener Zugriffscheck, Teil c) + Repository-Listing |
| **Verwaltbar** (Löschen/Masse, Umbenennen, Verschieben, Zip) | Core „Meine Dateien", `repository/draftfiles_ajax.php:71-200` | Dieselbe Mechanik auf der Kurspilot-Seite (Bericht 360 §2.2); derselbe Core-Unterbau, kein Kurspilot-Endpunkt |
| **Mehrere Wege** | Menü, Filepicker-Quelle, Zip-Export, optional E-Mail | Profilseite, Filepicker-Reiter, Zip-Export — aber **alle Wege sind Kurspilot-eigen**, keiner führt über die Core-Privatdatei-UI |
| **Weitergabe** | Filepicker „Private files": Kopie/Alias in jeden Kontext (`FILE_INTERNAL`/`FILE_REFERENCE`, Bericht 360 §2.1) | Filepicker „Kurspilot": Kopie/Alias in jeden Kontext (Teil c) + Zip für außerhäusige Pakete |

**Vollständigkeit:** Ja — alle fünf Kriterien sind erfüllt, und zwar ohne Berührung mit
`moodle/user:manageownfiles` oder `repository/user:view` (Teil d belegt, dass der Schalter die
Kombination nicht erreicht).

**Wo die Kombination hinter Option 1 zurückbleibt:**

1. **Kein Core-Ort:** Die Dateien tauchen nirgends in der Standard-Privatdatei-Verwaltung auf;
   die Lehrkraft muss den Kurspilot-Einstieg kennen (Profilnavigation). Option 1 liegt dort, wo
   Moodle-Nutzer Dateien ohnehin vermuten.
2. **Selbst gepflegte UI:** Verwaltungsseite und Download-Callback sind Kurspilot-Code (Teil e);
   jede Moodle-Änderung am Filemanager-Unterbau muss Kurspilot nachvollziehen. Bei Option 1 ist
   die UI Core.
3. **Zweites Plugin als bewegliches Teil:** `repository_kurspilot` braucht Deployment,
   Admin-Sichtbarkeit und eine eigene Capability (Teil b) — mehr Betriebsfläche als ein
   Core-Repository, das bereits installiert ist.
4. **Core-Falle File-Browser:** Die Alias-/Kopiertechnik verlangt drei Methoden-Overrides
   (Teil c, Punkt 4) — machbar, aber nicht geschenkt.
5. **Kein E-Mail-Zugang** (Option 1 hat ihn optional, docs.moodle.org „Private files").

**Wo die Kombination besser ist als Option 1:** unabhängig vom Schul-Schalter (der eigentliche
Auftrag); keine Vermischung mit privaten Dateien der Lehrkraft (eigene Area statt Unterordner);
keine gemeinsame Quota (`userquota` gilt nur, wo Code sie anwendet —
`user/classes/form/private_files.php:137-138`; die Kurspilot-Seite definiert ihre Optionen selbst);
keine Migration (die Area bleibt, wo sie ist).

## b) Filepicker-Quelle: nur über ein `repository/`-Plugin

**Ja, ein `repository/`-Plugin ist der einzige Weg.** Belegkette:

- Die Reiterliste des Filepickers baut `initialise_filepicker()` ausschließlich aus
  `repository::get_instances()` (`repository/lib.php:3117,3153-3160`; die Einträge werden per
  Instanz-ID keyed, `:3183-3185`).
- `get_instances()` liest nur die Tabellen `{repository}` + `{repository_instances}`
  (`repository/lib.php:1076-1078`) und lädt Klassen ausschließlich aus
  `$CFG->dirroot/repository/<typ>/lib.php` (`repository/lib.php:1117`); `get_types()` tut
  dasselbe (`:706-746`, Datei-Check `:722`).
- Die Admin-Übersicht entdeckt neue Repository-Plugins ausschließlich über
  `core_component::get_plugin_list('repository')` (`admin/repository.php:385`).
- Es gibt keinen Hook, mit dem ein `local/`-Plugin eine Instanz, einen Typ oder einen Reiter
  registrieren könnte (`initialise_filepicker()` kennt nur `disable_types` zum Ausschließen,
  `repository/lib.php:3139-3142`).

**Bedeutung des zweiten Plugins:**

- **Deployment:** `scripts/deploy-plugin.sh` synced heute nur `Plugin/src/local_coursepilot` →
  `/opt/moodle/local/coursepilot/` (`scripts/deploy-plugin.sh:4,9`) und läuft danach
  `admin/cli/upgrade.php` (`:11-12`). Für `repository_kurspilot` braucht das Skript einen zweiten
  rsync-Block (Ziel `/opt/moodle/repository/kurspilot/`); `upgrade.php` installiert das neue
  Plugin dann automatisch (Versionserkennung ist plugin-übergreifend). Alternativ Zip-Upload per
  Admin-UI. Einmaliger Aufwand: klein; dauerhaft: ein zweiter Sync-Pfad, der bei jedem
  Plugin-Release mitlaufen muss.
- **Admin-Aktivierung:** kann entfallen. Muster `repository/user/db/install.php:18-26`: Das
  Install-Skript legt den Typ sichtbar an; `repository_type::create()` erzeugt für Plugins ohne
  Instanz-Optionen automatisch die System-Instanz (`repository/lib.php:244-257`) und ruft
  `plugin_init()` (`:261`). Nach `upgrade.php` ist der Reiter also ohne manuellen Admin-Klick da.
  Die Administration kann den Typ später jederzeit verstecken/löschen
  (`repository/lib.php:419-427`, `admin/repository.php`) — das ist dann aber ein
  Kurspilot-eigener Schalter, nicht der Private-files-Schalter der Schule.
- **Updates:** üblicher Weg (`version.php` + `upgrade.php`); zu beachten laut moodledev.io:
  Änderungen an `db/access.php` wirken nur bei Neuinstallation, nicht auf bestehenden Instanzen
  (Abschnitt „db/access.php — Changing initial configuration").

## c) Kann `repository_kurspilot` die Filearea eines anderen Components sicher listen?

**Ja — mit derselben Eigentümerschaft wie heute und drei nötigen Methoden-Overrides.**

1. **Eigentümer-Durchsetzung:** `get_listing()` leitet den Kontext ausschließlich aus `$USER` ab
   (`context_user::instance($USER->id)`, Muster `repository/user/lib.php:77`) und listet dann
   `get_file_storage()->get_area_files($context->id, 'local_kurspilot', 'kurspilot_context', 0)`.
   Es gibt keinen Parameter, über den ein fremder Kontext adressierbar wäre — dieselbe harte
   Grenze wie in `context_files.php:24-31`. Core-seitig läuft vor jeder Aktion
   `check_capability()` (`repository/repository_ajax.php:84`), das ist `final`
   (`repository/lib.php:753`) und für Nutzerkontext-Instanzen zusätzlich die Eigentümerprüfung
   `$repocontext->instanceid != $USER->id` → Zugriff verweigert (`repository/lib.php:775-778`).
   Wählt man statt der System-Instanz (Muster `repository_user`) eine Instanz im Nutzerkontext,
   erzwingt der Core diese Prüfung sogar selbst.
2. **Parameterreinigung:** `source`/Pfad-Parameter sind base64-kodierte JSON-Paare und werden mit
   `clean_param(…, PARAM_PATH)`/`PARAM_FILE` gereinigt (Muster `repository/user/lib.php:63-68`);
   die Basis-Klasse tut dasselbe in `get_file_reference()` (`repository/lib.php:1625-1646`).
   Zusätzlich schützt der Core den Download-Aufruf mit einem HMAC-`sourcekey`
   (`repository/repository_ajax.php:162-170`, `repository/lib.php:2845`).
3. **„Login als"-Sperre:** Der Core sperrt private Repositories bei „Login als"
   (`repository/lib.php:766-770`), ausgelöst durch `contains_private_data()` oder eine Instanz im
   Nutzerkontext. `repository_user` setzt bewusst `false` (`repository/user/lib.php:167-169`) —
   bei „Login als" sieht die Administration die Privatdateien der imitierten Person (das ist die
   Semantik der vollständigen Imitation). Kurspilot kann strenger sein als der Core:
   `contains_private_data()` auf `true` setzen → der Picker-Reiter ist bei „Login als" gesperrt.
   Empfehlung: `true` (Kontextbereich ist persönlich, und die Sperre kostet nichts).
4. **Die Core-Falle (wichtigster neuer Befund):** Die File-Browser-API, die `repository_user`
   zum Listen benutzt, kennt im Nutzerkontext nur hartkodierte Areas —
   `get_area_user_private`, `get_area_user_profile`, `get_area_user_draft`, `get_area_user_backup`
   (`lib/filebrowser/file_info_context_user.php:94,136,178,217`); für jede andere Kombination
   liefert sie `null` (`:61-83`, Methodenname-Dispatch `:77-80`). Folgen für
   `repository_kurspilot` mit `has_moodle_files()=true`:
   - `get_listing()` kann den File-Browser nicht verwenden (er fände nichts) → direkt über
     `get_file_storage()` listen (siehe Punkt 1). Das ist eher einfacher als das
     `repository_user`-Vorbild.
   - Die Basis-Implementierung von `file_is_accessible()` prüft über den File-Browser
     (`repository/lib.php:844-858`) und würde jede Datei der Kurspilot-Area als unzugänglich
     melden → der Download-Aktion im Picker bricht ab (`repository/repository_ajax.php:209-211`).
     **Die Methode ist nicht `final` und muss überschrieben werden** (eigene Prüfung:
     Kontext aus `$USER`, Component/Filearea/Itemid fest verdrahtet).
   - Ebenso `get_reference_details()` (`repository/lib.php:1259-1287`, sonst Anzeige
     „undisclosedsource") und zweckmäßigerweise `get_file_source_info()` (`:1337-1343`) —
     Overrides mit eigener Namensanzeige („Kurspilot-Kontextbereich").

   Diese Overrides sind klein (je 5–15 Zeilen) und geschlossen testbar, aber sie sind der Teil,
   den man kennen muss, bevor man baut.
5. **Alias-Folgeeffekt (neu, nicht in Bericht 360):** `FILE_REFERENCE` legt einen Verweis an, der
   Änderungen am Original nachzieht (Bericht 360 §2.1). Für den Kontextbereich heißt das: Wird
   z. B. `plan.md` per Alias in eine Kursaktivität gelegt, landet jedes spätere KI-Append auch im
   Kurs. Das ist die gewünschte Weitergabe-Seite, aber die Lehrkraft sollte es wissen;
   `supported_returntypes()` kann jederzeit auf `FILE_INTERNAL` eingeschränkt werden
   (Muster `repository/user/lib.php:158-160`), wenn Aliase unerwünscht sind.

## d) Private-files-Schalter: kein Override — Vermutung bestätigt

Der Schalter wirkt an zwei Stellen (Bericht 360 §2.1 „Kosten/Risiken"), und keine davon ist
plugin-seitig überschreibbar:

1. **Capability `moodle/user:manageownfiles`:** hart verdrahtet in
   `require_capability('moodle/user:manageownfiles', $context)` (`user/files.php:34`), definiert
   als `captype=write`, `contextlevel=CONTEXT_SYSTEM`, Archetyp `user=ALLOW`
   (`lib/db/access.php:619-628`). Es gibt keinen Hook, keinen Filter und keine
   Bereichsausnahme: Entzug der Capability sperrt die Seite „Meine Dateien" instanzweit für die
   betroffene Rolle. Ein Plugin kann eine Capability-Prüfung eines anderen Bausteins weder
   umgehen noch ersetzen — es kann nur einen eigenen Zugangsweg mit eigener Prüfung bauen
   (genau das tut die Kurspilot-Seite mit `require_login()` nach dem Muster
   `Plugin/src/local_kurspilot/connections.php:37`).
2. **Repository-Aktivierung:** Der Reiter „Private files" erscheint nur, solange der Typ in
   `{repository}` sichtbar ist (`get_instances()` filtert `r.visible = 1`,
   `repository/lib.php:1098-1100`) und die aufrufende Person `repository/user:view` hat
   (`repository/user/db/access.php:30-36`, geprüft in `check_capability()`,
   `repository/lib.php:760`). Auch hier: keine Plugin-API, die Sichtbarkeit oder Capability eines
   fremden Typs zu erzwingen.

**Folgerung:** Der Private-files-Schalter gilt unentrinnbar seitenweit — aber nur für die
Private-files-Bausteine selbst. Die Kombination umgeht ihn nicht (das wäre ein Sicherheitsmodell
gegen den Admin), sondern **braucht ihn nicht**: Filearea, Kurspilot-Seite und
`repository_kurspilot` haben je eigene, Kurspilot-kontrollierte Voraussetzungen. Nur die
Kombination (oder ein vergleichbares Parallelkonstrukt) erreicht die gewünschte Unabhängigkeit;
Option 1 bleibt schalterabhängig.

## e) Preis gegen das Leitmotiv „weniger Programmcode" (#346)

Grobe Schätzung auf Basis der Core-Vorbilder (alle Zeilenangaben aus `MOODLE_500_STABLE`):

| Bestandteil | Option 1 (alles Core) | Kombination |
|---|---|---|
| Ablage | Konstanten-Tausch in `context_files.php` (~5 Zeilen) + Migration als Upgrade-Schritt (~40–60) | 0 — Area bleibt |
| Privacy-Provider | Datei-Teil fällt an den Core, Provider schrumpft (~−80) | 0 — Provider bleibt unverändert (Teil f) |
| Verwaltungs-UI | 0 (Core „Meine Dateien") | Seite (~60, Muster `user/files.php`, 59 Zeilen) + Filemanager-Form (~190, Muster `user/classes/form/private_files.php`, 192 Zeilen) + `local_kurspilot_pluginfile()` (~50; Pflicht-Zugriffscheck, da der Core im „arbitrary context"-Zweig nichts prüft, `lib/filelib.php:5406-5418`) + Sprachzeichen/Navigation (~20) |
| Filepicker-Quelle | 0 (Core-`repository_user` bereits installiert) | `repository_kurspilot`: `lib.php` (~220–260; Vorbild `repository/user/lib.php` mit 178 Zeilen, plus Overrides aus Teil c und `file_storage`-Listing) + `db/access.php` (~15) + `db/install.php` (~10) + `version.php`/Sprache (~20) |
| Deployment | 0 | +1 rsync-Block in `scripts/deploy-plugin.sh` (~8) |
| **Summe (neu/geändert)** | **~50–100 Zeilen, 0 neue Plugins, 0 neue Capability** | **~550–700 Zeilen dauerhaft eigener Code, 2. Plugin, 2. Deployment-Pfad, 1 neue Capability (`repository/kurspilot:view`)** |

Die Kombination kostet also etwa das 6–8-fache an eigenem Code gegenüber Option 1. Die
Filemanager-Verwaltung selbst ist dabei in beiden Fällen geschenkt (derselbe Core-Unterbau); der
Unterschied ist die Schale drumherum. Gegen das Leitmotiv der Karte (#346) ist die Kombination
klar im Nachteil — rechtfertigen kann sie nur die Unabhängigkeit vom Schul-Schalter.

## f) Bestätigung der #360-Befunde für die Kombination

Alle Vorabbefunde aus Bericht 360 halten auch für die Kombination, weil die Filearea unverändert
bleibt (Kombination = Bericht-360-Option 2 + Option 3):

- **#343-Vertrag unverändert** (Bericht 360 §2.2, Q2): speicherunabhängige Werkzeugoberfläche
  (Toolnamen bleiben), Personenisolation (component/filearea/itemid/contextid nie aus
  Client-Eingaben, `context_files.php:24-31`) und Pfad-Sandbox (`:80-120`) bleiben buchstäblich,
  wie sie sind. Das Repository liest die Area nur, die Sandbox bleibt alleinige KI-Grenze.
- **#344-Schalter wirkt nur auf Maschinenzugriff** (Bericht 360 §3.2): Die Picker-Auswahl ist eine
  Handlung der Lehrkraft, kein Maschinenzugriff; die Schreibseite lehnt markierte Dateien bei
  ausgeschaltetem Schalter weiter plugin-seitig ab (#352-Zwischenstand, „Personenbezug"). Dass die
  Eigentümerin ihre markierte Datei auf der Kurspilot-Seite öffnen kann, ist wie in Bericht 360
  bewertet stimmig und braucht keine UI-Durchsetzung. Optional: Kennzeichnung „für KI gesperrt"
  in der Kurspilot-Liste (Bericht 360 §3.2, letzter Absatz).
- **#345-Privacy-Provider findet die Dateien am alten Ort** (Bericht 360 §2.2, Q4): Der Provider
  exportiert und löscht die Area weiter über die `context_files`-Konstanten
  (`Plugin/src/local_kurspilot/classes/privacy/provider.php:137-146,156-163,216-226`). Das
  Repository-Plugin selbst speichert nichts und bekäme einen `null_provider`.
- **Append-Tauglichkeit** (Bericht 360 §2.2, Q6): `append_context_file` arbeitet auf derselben
  Filearea wie heute — keine Änderung.
- **Gemeinsames Restrisiko paralleles UI-Editieren** (Bericht 360 §3.4): Die Kombination bringt
  eine Filemanager-UI ins Spiel, also gilt das Risiko ebenfalls: Hängt ein offener Draft der
  Lehrkraft, während die KI ein Journal-Append schreibt, kann ihr Speichern das Append
  überschreiben. Die #352-Absicherung (`expected_contenthash` für Voll-Writes, Appends ungeprüft,
  kleines Fenster, Schaden wiederherstellbar) deckt es wie bei Option 1.
- **Neuer Alias-Folgeeffekt** gegenüber Bericht 360: Teil c, Punkt 5 (Alias zieht KI-Appends in
  den Kurs nach).

## g) Empfehlung: alleiniger Ablageort, Ergänzung oder verwerfen?

**Empfohlen: Nebenbereich als alleiniger Ablageort** — unter der Bedingung, dass die
Unabhängigkeit vom Private-files-Schalter harte Anforderung ist (laut #362 der erklärte Wunsch
der Lehrkraft). Begründung:

1. **Als alleiniger Ablageort tragfähig:** Die Kombination erfüllt das Blackbox-Veto vollständig
   (Teil a), ist migrationsfrei (die #343-Area bleibt), lässt #343/#344/#345 unverändert (Teil f)
   und ist das einzige geprüfte Konstrukt, das den Schul-Schalter überlebt (Teil d). Sie ersetzt
   Option 1 ersatzlos, nicht nur teilweise.
2. **Als Ergänzung/Fallback neben Option 1: verwerfen.** Zwei Ablageorte gleichzeitig brechen das
   #343-Ein-Anker-Prinzip (genau eine hart verdrahtete Area) und den #352-Grundsatz „ein
   generischer Schreibvorgang": Jeder Write/Append müsste doppeln oder synchronisieren, die
   KI-Sandbox hätte zwei Wahrheiten. Ein „Fallback" im Sinne von *erst Option 1, bei Abschaltung
   umziehen* ist technisch möglich (der Anker steckt hinter den `context_files`-Konstanten),
   bezahlt aber Migration zweimal und lässt den Ablageort politisch wackeln — das ist nicht die
   gewünschte Automatik („der Arbeitsbereich soll automatisch da sein").
3. **Verwerfen insgesamt: nicht empfohlen.** Damit bliebe nur Option 1 mit dem dokumentierten
   Abschalt-Risiko (Bericht 360 §2.1) — und genau dieses Risiko ist der Auftrag von #362.

**Für das Entscheidungsticket #361** heißt das: Die Wahl ist binär —
*Unabhängigkeit gewünscht* → Kombination als alleiniger Ablageort (Preis: Teil e);
*Private Files garantiert* → Option 1 (Bericht 360). Beides gleichzeitig ist weder nötig noch
sinnvoll. Wenn die Kombination gewählt wird, empfiehlt die Recherche zwei Festlegungen gleich
mitzutreffen: `contains_private_data()=true` („Login als"-Sperre strenger als der Core, Teil c)
und `supported_returntypes()` zunächst `FILE_INTERNAL | FILE_REFERENCE` (Alias nur anbieten, wenn
der Folgeeffekt kommuniziert ist, Teil c Punkt 5).

---

# Quellen

**Moodle-Quellcode** (Branch `MOODLE_500_STABLE`, gegen `main` gegengeprüft):

- `repository/lib.php:30-32` — `FILE_EXTERNAL`/`FILE_INTERNAL`/`FILE_REFERENCE`.
- `repository/lib.php:213-265` — `repository_type::create()`: System-Instanz automatisch bei
  Typ-Anlage (`:244-257`), `plugin_init()`-Aufruf (`:261`).
- `repository/lib.php:706-746` (`get_types`, Klassen nur aus `/repository/<typ>/lib.php`, `:722`)
  und `:1018-1120` (`get_instances`, `{repository}`+`{repository_instances}` `:1076-1078`,
  Sichtbarkeitsfilter `:1098-1100`, Klassenpfad-Check `:1117`) — Picker-Quellen kommen nur aus
  `repository/`-Plugins.
- `repository/lib.php:753-804` — `check_capability()` (`final`): Capability-Prüfung `:760`,
  „Login als"-Sperre `:766-770`, Eigentümerprüfung Nutzerkontext-Instanzen `:775-778`.
- `repository/lib.php:844-858` (`file_is_accessible`, File-Browser-basiert), `:1259-1287`
  (`get_reference_details`), `:1337-1343` (`get_file_source_info`), `:1625-1646`
  (`get_file_reference`, Parameterreinigung) — die drei Override-Punkte aus Teil c.
- `repository/lib.php:2845` (`get_secret_key`); `repository/repository_ajax.php:36-84`
  (Login/Sesskey/`check_capability`), `:136-260` (Download-Aktion: Sourcekey `:162-170`,
  `file_is_accessible`-Gate `:209-211`, Alias über `create_file_from_reference` `:240-254`),
  `:3117-3201` (`initialise_filepicker`, Reiterliste `:3153-3160`).
- `repository/user/lib.php:43-45,53-142,149-151,158-160,167-169` — Vorbild `repository_user`
  (Manage-Link `:59-60`, Parameterreinigung `:63-68`, Kontextableitung `:77`, Rückgabetypen,
  `contains_private_data`); `repository/user/db/install.php:18-26` (Typ-Anlage bei
  Installation); `repository/user/db/access.php:30-36` (`repository/user:view`).
- `lib/filebrowser/file_browser.php:77-92,126-144` und
  `lib/filebrowser/file_info_context_user.php:61-83,94,136,178,217` — File-Browser-Whitelist im
  Nutzerkontext (Blindheit für `local_kurspilot`-Areas).
- `admin/repository.php:385` — Repository-Entdeckung ausschließlich über
  `core_component::get_plugin_list('repository')`.
- `user/files.php:28-55` — Seite „Meine Dateien", `manageownfiles`-Guard `:34`.
- `user/classes/form/private_files.php:55,123-126,136-145,157-160` — Filemanager-Formular,
  Quota, Schreibziel `user`/`private`/`0`.
- `lib/db/access.php:619-628` — `moodle/user:manageownfiles`.
- `repository/draftfiles_ajax.php:34-50,71-200` — Filemanager-Verwaltungsaktionen
  (`mkdir`/`delete`/`deleteselected`/`updatefile`/`updatedir`/`zip`/`downloadselected`/
  `downloaddir`/`unzip`), nur eigener Draft-Bereich.
- `lib/filelib.php:334-360` (`file_postupdate_standard_filemanager`), `:1107`
  (`file_save_draft_area_files`), `:4485` (`file_pluginfile`), `:5406-5418`
  („arbitrary context"-Zweig ohne Zugriffsprüfung — Callback muss selbst prüfen).

**Moodle-Dokumentation:**

- moodledev.io/docs/apis/plugintypes/repository (abgerufen 2026-08-23): Plugin-Struktur
  (`lib.php`, `db/access.php`, `version.php`, Sprache), `supported_returntypes`-Semantik im
  Picker, Instanz-Erzeugung über `db/install.php`/`plugin_init`, Capability-Warnung für
  Bestandsinstallationen.
- docs.moodle.org/405/en/Private_files (Wayback-Schnappschuss 2024-10-10, via Bericht 360):
  Zugangswege, Abschaltweg über `manageownfiles` + Repository-Deaktivierung.

**Kurspilot-Bestand** (`origin/moodle-native-mcp`, Worktree):

- `Plugin/src/local_kurspilot/classes/context_files.php:24-31,40-46,57-60,80-120` — Anker,
  Isolation, Sandbox.
- `Plugin/src/local_kurspilot/settings.php:62-68,77-82` — `contextroot`, `allowpersonaldata`.
- `Plugin/src/local_kurspilot/db/access.php:27-47` — heutige Capabilities (keine Datei-Capability).
- `Plugin/src/local_kurspilot/lib.php:38-57` — Profilnavigations-Muster; kein `pluginfile` heute.
- `Plugin/src/local_kurspilot/connections.php:33-55` — Seiten-Muster (`require_login`, Sesskey).
- `Plugin/src/local_kurspilot/classes/privacy/provider.php:137-146,150-163,196-226` — #345-Provider.
- `scripts/deploy-plugin.sh:4,9,11-12` — Deployment synced nur `local/coursepilot`.

**Tickets und Vorarbeit:**

- [#360](https://github.com/matthiasgruenwald/moodle-coursepilot/issues/360) + Bericht
  `docs/research/0360-sichtbarer-ablageort-kontextbereich.md` (Branch
  `research/0360-sichtbarer-ablageort`) — Optionen 1–3, #344-Verhältnis, Restrisiko 3.4.
- [#352](https://github.com/matthiasgruenwald/moodle-coursepilot/issues/352) — Zwischenstand
  „Kontextbereich schreibend" (2026-08-22): Schreibvorgänge, Personenbezug, Gleichzeitigkeit.
- [#343](https://github.com/matthiasgruenwald/moodle-coursepilot/issues/343) (Vertrag),
  [#344](https://github.com/matthiasgruenwald/moodle-coursepilot/issues/344) (Schalter),
  [#345](https://github.com/matthiasgruenwald/moodle-coursepilot/issues/345) (Privacy),
  [#346](https://github.com/matthiasgruenwald/moodle-coursepilot/issues/346) (Karte, Leitmotiv),
  [#361](https://github.com/matthiasgruenwald/moodle-coursepilot/issues/361) (Entscheidungsticket).
