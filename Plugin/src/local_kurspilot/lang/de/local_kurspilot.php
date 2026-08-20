<?php
// This file is part of Moodle - http://moodle.org/
//
// Moodle is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// Moodle is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with Moodle.  If not, see <http://www.gnu.org/licenses/>.

/**
 * Deutsche Strings.
 *
 * @package    local_kurspilot
 * @copyright  2026 Kurspilot
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

defined('MOODLE_INTERNAL') || die();

$string['pluginname'] = 'Kurspilot';
$string['kurspilot:use'] = 'Kurspilot in einem Kurs nutzen';
$string['kurspilot:useremote'] = 'KI-Chat mit Kurspilot verbinden (Fernzugriff)';
$string['capabilitymissing'] = 'CAPABILITY_MISSING:{$a}';

// Fernzugriffs-Steuerung (#338).
$string['remoteaccessdisabled'] = 'Der Fernzugriff ist durch die Administration vorübergehend gesperrt.';
$string['settingremoteaccessenabled'] = 'Fernzugriff erlauben';
$string['settingremoteaccessenabled_desc'] = 'Notbremse: sperrt sofort jeden weiteren Zugriff über den MCP-Endpunkt. Bereits ausgestellte Zugriffstoken bleiben dabei gültig — für den Sicherheitsvorfall zusätzlich den Sammelwiderruf auf der Verbindungsübersicht nutzen. Der normale Moodle-Login ist von dieser Einstellung nicht betroffen.';
$string['connections'] = 'Kurspilot-Verbindungen';
$string['connectionsintro'] = 'Alle aktiven Fernzugriffsverbindungen dieser Instanz. Ein Widerruf entwertet das zugehörige Token sofort — ein weiterer Zugriff damit schlägt danach fehl.';
$string['myconnections'] = 'Meine Kurspilot-Verbindungen';
$string['myconnectionsintro'] = 'KI-Anwendungen, die Sie mit Kurspilot verbunden haben. Ein Widerruf entwertet die Verbindung sofort.';
$string['connectionnoconnections'] = 'Keine aktiven Verbindungen.';
$string['connectionclient'] = 'Anwendung';
$string['connectionperson'] = 'Person';
$string['connectionsince'] = 'Verbunden seit';
$string['connectionexpires'] = 'Zugriffstoken gültig bis';
$string['connectionrevoke'] = 'Widerrufen';
$string['connectionrevokeall'] = 'Alle Verbindungen widerrufen';
$string['connectionrevokeallconfirm'] = 'Wirklich alle ausgestellten Zugriffs- und Erneuerungstoken entwerten? Jede Verbindung muss danach neu hergestellt werden.';

// surface.php.
$string['surface'] = 'Kurspilot-Datenoberfläche';
$string['surfaceintro'] = 'Kurspilot gibt ausschließlich lehrkraftbezogene Kursgestaltung frei. Diese Seite zeigt die vereinbarte Oberfläche und gleicht sie mit der auf dieser Instanz tatsächlich registrierten ab.';
$string['surfaceallowed'] = 'Freigegebene Werkzeuge';
$string['surfaceforbidden'] = 'Verbotene Namensbestandteile';
$string['surfaceregistered'] = 'Tatsächlich registrierte Webservice-Funktionen';
$string['surfacestatus'] = 'Abgleichstatus';
$string['surfaceok'] = 'Die registrierte Oberfläche entspricht dem Vertrag.';
$string['surfaceviolations'] = 'Die registrierte Oberfläche verletzt den Vertrag:';

// oauth/authorize.php, oauth/token.php (#336).
$string['authorizetitle'] = 'Kurspilot verbinden';
$string['authorizetitleclient'] = 'Kurspilot mit {$a} verbinden';
$string['authorizeerror'] = 'Autorisierungsfehler: {$a}';
$string['consentconfirm'] = 'Verbindung erlauben';
$string['consentdeny'] = 'Ablehnen';
$string['consentintro'] = 'Sie erlauben <strong>{$a}</strong>, in Ihrem Namen auf Ihre Moodle-Kurse zuzugreifen. Es gelten Ihre eigenen Rechte — Sie sehen nichts, was Sie nicht ohnehin sehen dürfen.';
$string['consentgranted'] = '<strong>Freigegeben:</strong> Kursliste, Abschnitte, Aktivitäten und deren Inhalte (Seitentexte, Aufgabenstellungen, Fragen) sowie Ihre Kurspilot-Kontextdateien.';
$string['consentdenied'] = '<strong>Nicht freigegeben:</strong> Abgaben, Forenbeiträge, Testversuche, Bewertungen, Teilnehmendenlisten.';
$string['consenttransfer'] = '<strong>Übertragung an den KI-Anbieter:</strong> Alles, was Kurspilot auf Anfrage liest, wird an den KI-Anbieter übertragen und dort verarbeitet. Es läuft nichts im Hintergrund — übertragen wird nur, was ein Werkzeug auf Anfrage zurückgibt.';
$string['consentpersonaldataoff'] = 'Diese Moodle-Instanz überträgt <strong>keine</strong> Kontextdateien, die als personenbezogen markiert sind (personenbezug: true). Solche Dateien werden Ihnen als gesperrt angezeigt.';
$string['consentpersonaldataon'] = 'Diese Moodle-Instanz überträgt <strong>auch</strong> Kontextdateien, die als personenbezogen markiert sind (personenbezug: true) — etwa Lerngruppenprofile mit Schülernamen. Ihre Schule hat das ausdrücklich freigegeben.';
$string['consentabbreviate'] = 'Welche personenbezogenen Angaben Sie in Kontextdateien ablegen dürfen, richtet sich nach den Vorgaben Ihrer Schule und den Bestimmungen Ihres Landesdatenschutzes. Kurspilot prüft das nicht. Wo es für die Planung ausreicht, verwenden Sie Kürzel statt Namen.';
$string['consentrevoke'] = 'Sie können diese Verbindung jederzeit unter Profil → Meine Kurspilot-Verbindungen widerrufen.';

// classes/privacy/provider.php (#336).
$string['privacy:metadata:oauth_code'] = 'Kurzlebige, PKCE-gebundene Autorisierungscodes für den OAuth-Zustimmungsdialog.';
$string['privacy:metadata:oauth_code:clientid'] = 'Die Kennung des KI-Clients, für den der Code ausgestellt wurde.';
$string['privacy:metadata:oauth_code:userid'] = 'Die Nutzer-ID der Lehrkraft, die zugestimmt hat.';
$string['privacy:metadata:oauth_code:redirecturi'] = 'Das Umleitungsziel des Clients.';
$string['privacy:metadata:oauth_code:codechallenge'] = 'Die PKCE-S256-Challenge des Clients.';
$string['privacy:metadata:oauth_code:expires'] = 'Ablaufzeitpunkt des Codes.';
$string['privacy:metadata:oauth_code:used'] = 'Ob der Code bereits eingelöst wurde.';
$string['privacy:metadata:oauth_token'] = 'Zugriffs- und Erneuerungstoken, mit denen ein KI-Client im Namen der Lehrkraft auf Kurspilot zugreift.';
$string['privacy:metadata:oauth_token:clientid'] = 'Die Kennung des KI-Clients.';
$string['privacy:metadata:oauth_token:userid'] = 'Die Nutzer-ID der Lehrkraft, in deren Namen der Client zugreift.';
$string['privacy:metadata:oauth_token:expires'] = 'Ablaufzeitpunkt des Zugriffstokens.';
$string['privacy:metadata:oauth_token:refreshexpires'] = 'Ablaufzeitpunkt des Erneuerungstokens.';
$string['privacy:metadata:oauth_token:revoked'] = 'Ob das Token widerrufen bzw. durch Rotation entwertet wurde.';
$string['privacy:metadata:oauth_token:timecreated'] = 'Ausstellungszeitpunkt.';
