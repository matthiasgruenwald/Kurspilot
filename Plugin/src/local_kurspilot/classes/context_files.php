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
 * Anker des Kontextbereichs (Karte #297, Issue #343): ein einziger, fest
 * verdrahteter Dateibereich im privaten Nutzerkontext der aufrufenden
 * Lehrkraft - `component=local_kurspilot`, `filearea=kurspilot_context`,
 * `itemid=0`, `contextid=context_user::instance($USER->id)`.
 *
 * Die Isolation kommt nicht aus einer Pfadpruefung, sondern daraus, dass
 * component/filearea/itemid/contextid **nie** aus Client-Eingaben stammen -
 * es gibt schlicht keinen Parameter, ueber den sich ein anderer Bereich
 * adressieren liesse ("harte Grenze im Plugincode"). Die Pfadpruefung in
 * {@see resolve_directory()}/{@see resolve_file()} ist zusaetzliche
 * Verteidigung gegen `../`-Segmente innerhalb dieses einen Bereichs, nicht
 * der einzige Schutz.
 *
 * @package    local_kurspilot
 * @copyright  2026 Kurspilot
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
final class context_files {

    /** @var string Moodle-Dateikomponente. */
    public const COMPONENT = 'local_kurspilot';

    /** @var string Alleiniger, fuer die KI erreichbarer Dateibereich. */
    public const FILEAREA = 'kurspilot_context';

    /** @var int Fester Item-Bezug - der Bereich kennt keine weiteren Items. */
    public const ITEMID = 0;

    /** @var string Default-Wurzelordner, ueberschreibbar per Plugin-Einstellung. */
    private const DEFAULT_ROOT = 'kurspilot';

    /**
     * Der eigene Nutzerkontext der angemeldeten Person - niemals aus
     * Client-Eingaben ableitbar.
     *
     * @return \context_user
     */
    public static function own_context(): \context_user {
        global $USER;
        return \context_user::instance($USER->id);
    }

    /**
     * Wurzelordner innerhalb des Dateibereichs, per Plugin-Einstellung
     * `local_kurspilot/contextroot` konfigurierbar (Spec 0012, Abschnitt 5).
     *
     * @return string Immer mit fuehrendem und abschliessendem "/".
     */
    private static function root(): string {
        $configured = trim((string) (get_config('local_kurspilot', 'contextroot') ?: self::DEFAULT_ROOT), '/');
        return $configured === '' ? '/' : '/' . $configured . '/';
    }

    /**
     * Zerlegt einen Client-Pfad in saubere Segmente und weist jedes `.`/`..`
     * ab - das erzwingt "kein Pfad, der herausfuehrt" direkt im Plugincode.
     *
     * @param string $path
     * @return string[]
     */
    private static function segments(string $path): array {
        $normalised = str_replace('\\', '/', $path);
        $segments = [];
        foreach (explode('/', $normalised) as $segment) {
            if ($segment === '') {
                continue;
            }
            if ($segment === '.' || $segment === '..') {
                throw new \moodle_exception('invalidcontextpath', 'local_kurspilot');
            }
            $segments[] = $segment;
        }
        return $segments;
    }

    /**
     * Loest einen optionalen Client-Unterordner zu einem vollstaendigen
     * Moodle-Dateipfad innerhalb des Kontextbereichs auf.
     *
     * @param string $path Relativer Unterordner, z.B. "" oder "faecher/mathe".
     * @return string Immer mit fuehrendem und abschliessendem "/".
     */
    public static function resolve_directory(string $path): string {
        $segments = self::segments($path);
        return rtrim(self::root() . implode('/', $segments), '/') . '/';
    }

    /**
     * Loest einen Client-Dateipfad (Ordner + Dateiname) auf.
     *
     * @param string $path z.B. "vorlagen.md" oder "faecher/mathe/notiz.md".
     * @return array{0: string, 1: string} [Ordnerpfad, Dateiname]
     */
    public static function resolve_file(string $path): array {
        $segments = self::segments($path);
        if (empty($segments)) {
            throw new \moodle_exception('invalidcontextpath', 'local_kurspilot');
        }
        $filename = array_pop($segments);
        return [self::resolve_directory(implode('/', $segments)), $filename];
    }
}
