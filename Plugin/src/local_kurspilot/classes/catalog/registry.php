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

namespace local_kurspilot\catalog;

/**
 * Die Freigabeliste des Feldkatalogs (Spec 0015 §2.5): "eine Aktivitätsart
 * ist unterstützt, wenn ihr Katalog geprüft ist". Eine neue Art ist eine neue
 * Katalogdatei plus ein Eintrag hier, kein neuer Endpunkt.
 *
 * @package    local_kurspilot
 * @copyright  2026 Kurspilot
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
final class registry {

    /**
     * modname => Katalogklasse.
     *
     * @var array<string, class-string<module_catalog>>
     */
    private const CATALOGS = [
        'label' => label::class,
        'page' => page::class,
        'url' => url::class,
        'folder' => folder::class,
        'resource' => resource::class,
    ];

    /**
     * Katalogisierte Modultypen, gleich ob per Vehikel oder Einzelwerkzeug
     * geschrieben (Spec 0015 §3.1: "fuer jeden katalogisierten Modultyp").
     *
     * @return string[]
     */
    public static function known_modnames(): array {
        return array_keys(self::CATALOGS);
    }

    /**
     * @param string $modname
     * @return module_catalog|null Die Katalogklasse selbst - null, wenn die
     *         Aktivitaetsart nicht gefuehrt wird.
     */
    public static function for(string $modname): ?string {
        return self::CATALOGS[$modname] ?? null;
    }
}
