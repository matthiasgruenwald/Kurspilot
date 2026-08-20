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
 * Schluesselendpunkt (#336). Duenne Schale um
 * {@see \local_kurspilot\oauth_lib::jwks_document()}: leer, aber valide.
 * jwks_uri ist nur deklariert, weil der OIDC-Namensraum es erzwingt (#302,
 * Punkt 2) - local_kurspilot ist kein OIDC-Provider und stellt keine
 * signierten ID-Token aus; Access-Token sind opake DB-Werte.
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
echo json_encode(oauth_lib::jwks_document());
