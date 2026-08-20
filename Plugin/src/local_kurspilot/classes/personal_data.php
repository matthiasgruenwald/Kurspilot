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

namespace local_kurspilot;

/**
 * Der Schalter fuer personenbezogene Kontextdaten (Issue #344, ADR 0011).
 * Wirkt auf der Markierung im YAML-Frontmatter einer Kontextdatei
 * (`kurspilot.personenbezug: true`), nicht auf ihrem Inhalt - siehe
 * Spezifikation 0010, Abschnitt "Frontmatter"/"Personenbezug und Varianten".
 *
 * ponytail: kein YAML-Parser im Projekt (kein symfony/yaml, kein
 * ext-yaml) und fuer eine einzelne, eindeutig benannte Flag-Pruefung auch
 * nicht noetig - eine Regex auf den Frontmatter-Block reicht.
 *
 * @package    local_kurspilot
 * @copyright  2026 Kurspilot
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
final class personal_data {

    /**
     * Ob die Instanz personenbezogen markierte Kontextdateien an die KI
     * ausliefert. Standard: aus (siehe `settings.php`).
     *
     * @return bool
     */
    public static function allowed(): bool {
        return (bool) get_config('local_kurspilot', 'allowpersonaldata');
    }

    /**
     * Ob der Dateiinhalt im YAML-Frontmatter als personenbezogen markiert
     * ist (`kurspilot.personenbezug: true`).
     *
     * @param string $content
     * @return bool
     */
    public static function is_marked(string $content): bool {
        if (!preg_match('/^---\s*\n(.*?)\n---\s*\n/s', $content, $matches)) {
            return false;
        }
        return (bool) preg_match('/personenbezug:\s*true\b/', $matches[1]);
    }
}
