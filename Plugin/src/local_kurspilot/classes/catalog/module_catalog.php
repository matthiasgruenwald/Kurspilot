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
 * Vertrag einer Aktivitätsart im Feldkatalog (Spec 0015 §2). Eine
 * implementierende Klasse je Modultyp unter \local_kurspilot\catalog\.
 *
 * Der modulübergreifende Block (Sichtbarkeit, Stealth, Gruppenmodus,
 * Gruppierung, idnumber, Abschnittszuordnung, {@see shared_block}) ist
 * bewusst NICHT Teil dieses Interface - er steht einmal und wird von
 * describe_module_fields für jede Art zusätzlich eingeblendet (Spec 0015
 * §2.3). Eine Implementierung darf ihn nicht duplizieren.
 *
 * @package    local_kurspilot
 * @copyright  2026 Kurspilot
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
interface module_catalog {

    /**
     * Moodle-Modulname (mod_XXX ohne Praefix), z.B. "label".
     *
     * @return string
     */
    public static function modname(): string;

    /**
     * Kategorie 1: echte Instanz-Datenbankfelder.
     *
     * @return field[]
     */
    public static function fields(): array;

    /**
     * Kategorie 2: Nicht-DB-Felder, die die *_instance()-Funktionen
     * ungeschuetzt lesen (Spec 0015 §2.2).
     *
     * @return field[]
     */
    public static function pseudofields(): array;

    /**
     * Kategorie 3: modulspezifische Sperrliste - zusaetzlich zur
     * durchgaengigen Sperrliste aus {@see shared_block::BLOCKLIST}, die
     * describe_module_fields fuer jede Art anhaengt.
     *
     * @return string[] Feldnamen.
     */
    public static function blocklist(): array;

    /**
     * Kategorie 4: Kombinationsregeln - Beziehungen zwischen Feldern, die nur
     * in Moodles validation() stehen (Spec 0015 §2.2).
     *
     * @return string[] Je Regel ein deutscher Satz.
     */
    public static function combination_rules(): array;

    /**
     * Kategorie 5: Nebenwirkungsvermerke - Felder mit Wirkung ueber die
     * Aktivitaet hinaus (Spec 0015 §2.2).
     *
     * @return string[] Je Vermerk ein deutscher Satz.
     */
    public static function side_effects(): array;

    /**
     * Feldbuendel (Presets): Name => Feld=>Wert-Vorbelegung. Ueberstimmt
     * keine von der Lehrkraft ausdruecklich genannten Felder (Spec 0015
     * §2.4). Leer, wenn die Aktivitaetsart keine Buendel hat.
     *
     * @return array<string, array<string, mixed>>
     */
    public static function bundles(): array;

    /**
     * Schreibweg: null, wenn ueber das Vehikel (update_moduleinfo()) - sonst
     * der Name des Einzelwerkzeugs, das stattdessen schreibt (Spec 0015
     * §3.1, z.B. "update_quiz_settings").
     *
     * @return string|null
     */
    public static function schreibweg(): ?string;
}
