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
 * Protected-Resource-Metadaten nach RFC 9728 (#302, Punkt 2).
 *
 * Verlinkt aus dem WWW-Authenticate-Header von mcp.php (Adresse 1 von 2,
 * #335); die zweite Adresse ist PATH_INFO auf mcp.php selbst
 * (.well-known/oauth-protected-resource), fuer Clients, die den Header nie
 * lesen und den Pfad aus der Ressourcen-URL ableiten. Beide Adressen rufen
 * dieselbe Quelle auf ({@see \local_kurspilot\oauth_lib::protected_resource_metadata()}).
 *
 * @package    local_kurspilot
 * @copyright  2026 Kurspilot
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

define('NO_MOODLE_COOKIES', true);
define('NO_DEBUG_DISPLAY', true);

require(__DIR__ . '/../../../config.php');

use local_kurspilot\oauth_lib;

header('Content-Type: application/json');
header('Cache-Control: no-store');
echo json_encode(oauth_lib::protected_resource_metadata($CFG->wwwroot), JSON_UNESCAPED_SLASHES);
