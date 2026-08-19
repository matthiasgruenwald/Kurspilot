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
 * JWKS-Dokument, leer.
 *
 * jwks_uri ist nur deklariert, weil der OIDC-Namensraum es erzwingt (#302,
 * Punkt 2) - local_kurspilot ist kein OIDC-Provider und stellt keine
 * signierten ID-Token aus. Access-Token sind opake DB-Werte (oauth_lib), ein
 * leeres, aber valides JWKS-Dokument ist die ehrliche Antwort statt
 * Signierschluessel zu erzeugen, die nie etwas signieren.
 *
 * ponytail: kein Schluesselmaterial, weil es keinen Verwendungszweck hat.
 * Wird ein Verwendungszweck sichtbar (z. B. signierte ID-Token fuer echtes
 * OIDC), kommt hier RS256-Schluesselmaterial rein - Moodle vendort
 * firebase/php-jwt bereits (lib/php-jwt).
 *
 * @package    local_kurspilot
 * @copyright  2026 Kurspilot
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

define('NO_MOODLE_COOKIES', true);
define('NO_DEBUG_DISPLAY', true);

require(__DIR__ . '/../../../config.php');

header('Content-Type: application/json');
header('Cache-Control: no-store');
echo json_encode(['keys' => []]);
