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

// surface.php.
$string['surface'] = 'Kurspilot-Datenoberfläche';
$string['surfaceintro'] = 'Kurspilot gibt ausschließlich lehrkraftbezogene Kursgestaltung frei. Diese Seite zeigt die vereinbarte Oberfläche und gleicht sie mit der auf dieser Instanz tatsächlich registrierten ab.';
$string['surfaceallowed'] = 'Freigegebene Werkzeuge';
$string['surfaceforbidden'] = 'Verbotene Namensbestandteile';
$string['surfaceregistered'] = 'Tatsächlich registrierte Webservice-Funktionen';
$string['surfacestatus'] = 'Abgleichstatus';
$string['surfaceok'] = 'Die registrierte Oberfläche entspricht dem Vertrag.';
$string['surfaceviolations'] = 'Die registrierte Oberfläche verletzt den Vertrag:';

// OAuth (#313).
$string['settingremoteaccess'] = 'Fernzugriff erlauben';
$string['settingremoteaccessdesc'] = 'Notbremse: Wenn ausgeschaltet, akzeptiert der MCP-Endpunkt keine Access-Token mehr - sofort und unabhängig davon, welche Token noch gültig wären. Bestehende Verbindungen müssen sich neu autorisieren, sobald diese Einstellung wieder eingeschaltet wird.';
$string['settingallowpersonaldata'] = 'Personenbezogene Kontextdateien übertragen';
$string['settingallowpersonaldatadesc'] = 'Erlaubt die Übertragung von Kontextdateien, die als personenbezogen markiert sind (personenbezug: true), an den KI-Anbieter. Standardmäßig aus. Ohne Wirkung, solange local_kurspilot keine Kontextdatei-Werkzeuge anbietet - bereits angelegt, damit der Consent-Screen den echten Stand zeigt.';
$string['authorizetitle'] = 'Kurspilot verbinden';
$string['remoteaccessdisabled'] = 'Der Fernzugriff auf Kurspilot ist auf dieser Instanz derzeit ausgeschaltet.';
$string['invalidauthorizerequest'] = 'Unvollständige Autorisierungsanfrage.';
$string['pkcerequired'] = 'PKCE mit S256 ist Pflicht.';
$string['unknownclient'] = 'Unbekannter Client.';
$string['redirecturimismatch'] = 'Die redirect_uri ist für diesen Client nicht registriert.';
$string['consentintro'] = 'Sie erlauben <strong>{$a}</strong>, in Ihrem Namen auf Ihre Moodle-Kurse zuzugreifen. Es gelten Ihre eigenen Rechte - Sie sehen nichts, was Sie nicht ohnehin sehen dürfen.';
$string['consentgranted'] = '<strong>Freigegeben:</strong> Kursliste, Abschnitte, Aktivitäten und deren Inhalte (Seitentexte, Aufgabenstellungen, Fragen) sowie Ihre Kurspilot-Kontextdateien.';
$string['consentdenied'] = '<strong>Nicht freigegeben:</strong> Abgaben, Forenbeiträge, Testversuche, Bewertungen, Teilnehmendenlisten.';
$string['consenttransfer'] = '<strong>Übertragung an den KI-Anbieter:</strong> Alles, was Kurspilot auf Anfrage liest, wird an den KI-Anbieter übertragen und dort verarbeitet. Es läuft nichts im Hintergrund - übertragen wird nur, was ein Werkzeug auf Anfrage zurückgibt.';
$string['consentpersonaldataoff'] = 'Diese Moodle-Instanz überträgt <strong>keine</strong> Kontextdateien, die als personenbezogen markiert sind (personenbezug: true). Solche Dateien werden Ihnen als gesperrt angezeigt.';
$string['consentpersonaldataon'] = 'Diese Moodle-Instanz überträgt <strong>auch</strong> Kontextdateien, die als personenbezogen markiert sind (personenbezug: true) - etwa Lerngruppenprofile mit Schülernamen. Ihre Schule hat das ausdrücklich freigegeben.';
$string['consentabbreviate'] = 'Welche personenbezogenen Angaben Sie in Kontextdateien ablegen dürfen, richtet sich nach den Vorgaben Ihrer Schule und den Bestimmungen Ihres Landesdatenschutzes. Kurspilot prüft das nicht. Wo es für die Planung ausreicht, verwenden Sie Kürzel statt Namen.';
$string['consentrevoke'] = 'Sie können diese Verbindung jederzeit unter Profil → Meine Kurspilot-Verbindungen widerrufen.';
$string['consentconfirm'] = 'Verbinden';
