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
 * Anker des Kontextbereichs (Karte #297, Issue #343, Umzug #407): Moodles
 * Private Files der aufrufenden Lehrkraft - `component=user`,
 * `filearea=private`, `itemid=0`, `contextid=context_user::instance($USER->id)`,
 * eingegrenzt auf den Unterordner aus {@see root()} (Default `kurspilot`).
 *
 * Die Isolation kommt nicht aus einer Pfadpruefung, sondern daraus, dass
 * component/filearea/itemid/contextid **nie** aus Client-Eingaben stammen -
 * es gibt schlicht keinen Parameter, ueber den sich ein anderer Bereich
 * adressieren liesse ("harte Grenze im Plugincode"). Seit dem Umzug auf
 * `user/private` (Spec 0016 §1) traegt zusaetzlich der fixierte Wurzelordner:
 * kein anderer Unterordner der Private Files ist erreichbar. Die Pfadpruefung
 * in {@see resolve_directory()}/{@see resolve_file()} ist die Verteidigung
 * gegen `../`-Segmente, die aus diesem Ordner herausfuehren wuerden.
 *
 * @package    local_kurspilot
 * @copyright  2026 Kurspilot
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
final class context_files {

    /** @var string Moodle-Dateikomponente - Moodles Private Files (Spec 0016 §1.2). */
    public const COMPONENT = 'user';

    /** @var string Alleiniger, fuer die KI erreichbarer Dateibereich. */
    public const FILEAREA = 'private';

    /** @var int Fester Item-Bezug - der Bereich kennt keine weiteren Items. */
    public const ITEMID = 0;

    /** @var string Komponente des Altbestands vor dem Umzug (#407). */
    public const LEGACY_COMPONENT = 'local_kurspilot';

    /** @var string Dateibereich des Altbestands vor dem Umzug (#407). */
    public const LEGACY_FILEAREA = 'kurspilot_context';

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

    /**
     * Standard-Nutzerrecht auf die eigenen Dateien (Spec 0016 §1.1) - fuer
     * die Schreibendpunkte aus Phase 2. Seit dem Umzug auf `user/private`
     * schreibt Kurspilot in denselben Bereich wie "Meine Dateien", also gilt
     * dieselbe Freigabe.
     *
     * @throws \required_capability_exception
     */
    public static function require_manage_own_files(): void {
        require_capability('moodle/user:manageownfiles', self::own_context());
    }

    /**
     * Restplatz in Byte nach Nutzerquote (Spec 0016 §1.3) - `file_storage`
     * setzt `$CFG->userquota` nicht selbst durch, nur die Core-UI tut das.
     * Kurspilot schriebe sonst als einziger an der Schulgrenze vorbei.
     *
     * @return int|null Restplatz in Byte, oder null wenn keine Grenze gilt
     *         (Quote aus, unbegrenzt, oder `moodle/user:ignoreuserquota`).
     */
    public static function remaining_quota(): ?int {
        global $CFG;

        $quota = (int) ($CFG->userquota ?? 0);
        if ($quota <= 0 || has_capability('moodle/user:ignoreuserquota', self::own_context())) {
            return null;
        }
        return max(0, $quota - (int) file_get_user_used_space());
    }

    /**
     * Kopiert den Altbestand aus der alten Filearea in die Private Files
     * (Spec 0016 §3.1, Einmal-Fall beim Plugin-Upgrade). Der relative Pfad
     * bleibt gleich - die Dateien lagen schon in der alten Filearea unter
     * dem Wurzelordner und sind danach unter demselben Kurspilot-Pfad
     * erreichbar. Kollision = ueberspringen und ins Upgrade-Log schreiben;
     * der Altbestand wird **nicht** geloescht (Rueckweg).
     *
     * Dateien ausserhalb des Wurzelordners bleiben liegen: sie wuerden sonst
     * lose in der Wurzel von "Meine Dateien" landen, wo Kurspilot sie ohnehin
     * nicht mehr sieht. Sie sind im Upgrade-Log genannt, damit die Lehrkraft
     * sie bei Bedarf selbst holen kann.
     *
     * Die Nutzerquote wird hier bewusst nicht geprueft: der Umzug ist ein
     * einmaliger Systemvorgang und darf nicht am Kontostand einer einzelnen
     * Person scheitern - er kopiert nur, was die Person ohnehin schon belegt.
     *
     * @return int Zahl der kopierten Dateien.
     */
    public static function migrate_legacy_files(): int {
        global $DB;

        $fs = get_file_storage();
        $root = self::root();
        $copied = 0;
        $legacy = $DB->get_recordset('files', [
            'component' => self::LEGACY_COMPONENT,
            'filearea' => self::LEGACY_FILEAREA,
        ]);
        foreach ($legacy as $record) {
            if ($record->filename === '.') {
                // Ordner-Platzhalter - create_file_from_storedfile() legt die
                // Ordner der kopierten Dateien ohnehin selbst an.
                continue;
            }
            if (!str_starts_with($record->filepath, $root)) {
                mtrace('local_kurspilot: Kontextdatei uebersprungen (liegt ausserhalb von "' . $root . '"): '
                    . $record->filepath . $record->filename . ' (Kontext ' . $record->contextid . ')');
                continue;
            }
            $target = [
                'contextid' => $record->contextid,
                'component' => self::COMPONENT,
                'filearea' => self::FILEAREA,
                'itemid' => self::ITEMID,
                'filepath' => $record->filepath,
                'filename' => $record->filename,
            ];
            if ($fs->file_exists(...array_values($target))) {
                mtrace('local_kurspilot: Kontextdatei uebersprungen (existiert bereits in "Meine Dateien"): '
                    . $record->filepath . $record->filename . ' (Kontext ' . $record->contextid . ')');
                continue;
            }
            $fs->create_file_from_storedfile($target, (int) $record->id);
            $copied++;
        }
        $legacy->close();

        return $copied;
    }
}
