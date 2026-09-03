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
 * Die eine GD-Pruefung (Spec 0018 §3.3): Moodles admin/environment.xml
 * fuehrt GD fuer jede Version als "required", ein Moodle ohne GD installiert
 * nicht - trotzdem eine defensive Pruefung mit klarer Meldung statt eines
 * kryptischen Fatal Errors aus imagecreatefromstring(), falls es doch einmal
 * fehlt. Kein Fallback-Design, kein zweiter Bildpfad (§3.3): fehlt GD, sind
 * Vorschau und Zuschnitt gesperrt, Hochladen und Einbetten laufen weiter.
 *
 * @package    local_kurspilot
 * @copyright  2026 Kurspilot
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
final class gd_support {

    /**
     * Endungen, die GD als Rasterbild lesen und schreiben kann - SVG bewusst
     * ausgeschlossen (raster-only, §3.3/§5). Gemeinsam fuer
     * preview_material_file und crop_material_file statt je Klasse
     * dupliziert, damit ein spaeteres GD-Format (z.B. AVIF) an einer Stelle
     * ergaenzt wird.
     *
     * @var string[]
     */
    public const RASTER_IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp'];

    /** @var bool|null Testueberschreibung, siehe {@see self::override_for_testing()}. */
    private static ?bool $overridefortests = null;

    /**
     * @return bool
     */
    public static function available(): bool {
        return self::$overridefortests ?? (extension_loaded('gd') && function_exists('imagecreatefromstring'));
    }

    /**
     * Erzwingt einen festen Rueckgabewert fuer {@see self::available()} -
     * einzig fuer PHPUnit, um den sonst untestbaren "GD fehlt"-Zweig zu
     * pruefen (echtes Moodle hat GD als "required", #430-Codereview). Nach
     * dem Test mit null zuruecksetzen.
     *
     * @param bool|null $value null = keine Ueberschreibung (echte Pruefung).
     */
    public static function override_for_testing(?bool $value): void {
        self::$overridefortests = $value;
    }
}
