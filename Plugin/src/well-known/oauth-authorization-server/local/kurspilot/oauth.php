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
 * RFC-8414-Standardpfad fuer die Autorisierungsserver-Metadaten (#337-Fix).
 *
 * RFC 8414 §3.1 verlangt fuer einen Issuer mit Pfadkomponente
 * (local/kurspilot/oauth.php), dass ".well-known/oauth-authorization-server"
 * DIREKT hinter dem Host steht und der Issuer-Pfad DAHINTER angehaengt wird -
 * umgekehrt zur PATH_INFO-Loesung in local/kurspilot/oauth.php selbst
 * (".well-known" hinter der Datei). Claude.ai (Custom Connector) probiert
 * ausschliesslich den RFC-Standardpfad und findet ohne diese Datei nie den
 * Login-Screen. Deshalb dieser echte, pfadgleiche Dateibaum ausserhalb des
 * Plugin-Verzeichnisses im Moodle-Wurzelverzeichnis - kein Rewrite noetig,
 * die URL entspricht 1:1 dem Dateipfad. Ruft dieselbe Quelle wie oauth.php
 * auf ({@see \local_kurspilot\oauth_lib::authorization_server_metadata()}).
 *
 * @package    local_kurspilot
 * @copyright  2026 Kurspilot
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

define('NO_MOODLE_COOKIES', true);
define('NO_DEBUG_DISPLAY', true);

require(__DIR__ . '/../../../../config.php');

use local_kurspilot\oauth_lib;

header('Cache-Control: no-store');
header('Content-Type: application/json');
echo json_encode(oauth_lib::authorization_server_metadata($CFG->wwwroot), JSON_UNESCAPED_SLASHES);
