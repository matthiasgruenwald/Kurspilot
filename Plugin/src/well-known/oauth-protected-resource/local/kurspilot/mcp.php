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
 * RFC-9728-Standardpfad fuer die Protected-Resource-Metadaten (#337-Fix).
 *
 * Analog zu oauth-authorization-server/.../oauth.php, hier fuer die
 * Ressource mcp.php: RFC 9728 §3.1 verlangt ".well-known/oauth-protected-
 * resource" direkt hinter dem Host, den Ressourcenpfad dahinter. Ein Client,
 * der die Connector-URL direkt in Discovery uebersetzt (statt zuerst einen
 * 401 mit WWW-Authenticate abzuwarten), findet nur diesen Pfad. Ruft
 * dieselbe Quelle auf wie oauth/protected-resource.php und die PATH_INFO-
 * Kurzform in dispatcher::handle()
 * ({@see \local_kurspilot\oauth_lib::protected_resource_metadata()}).
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
echo json_encode(oauth_lib::protected_resource_metadata($CFG->wwwroot), JSON_UNESCAPED_SLASHES);
