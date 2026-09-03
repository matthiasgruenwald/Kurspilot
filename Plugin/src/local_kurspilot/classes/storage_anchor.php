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
 * Gemeinsamer Ablageort-Anker (Issue #444, Spec: Ablageort als eine Sache
 * #442 §1/§4/§5): haelt, was
 * {@see context_files} und {@see material_files} bislang doppelt trugen -
 * Komponente/Dateibereich/Itembezug, eigener Nutzerkontext, Wurzelaufloesung,
 * Segmentpruefung, Verzeichnis-/Dateiaufloesung in beide Richtungen, Recht
 * auf die eigenen Dateien, Restquote, Quotenpruefung, Dateisatz und die
 * Schreibchoreografie mit Zwischendatei.
 *
 * Ein Bereich ({@see storage_area}) ist ein Wertesatz, kein Typ - es gibt
 * bewusst keinen Ortsadapter mit eigener Schnittstelle, solange nur ein
 * Ablageort (Moodles Private Files) existiert (siehe ADR zu Issue #444).
 * context_files und material_files bleiben die oeffentliche Schnittstelle
 * fuer ihre rund 20 Aufrufer unveraendert und delegieren intern hierher.
 *
 * @package    local_kurspilot
 * @copyright  2026 Kurspilot
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
final class storage_anchor {

    /** @var string Moodle-Dateikomponente - Moodles Private Files. */
    public const COMPONENT = 'user';

    /** @var string Alleiniger, fuer die KI erreichbarer Dateibereich. */
    public const FILEAREA = 'private';

    /** @var int Fester Item-Bezug - kein Bereich kennt weitere Items. */
    public const ITEMID = 0;

    /** @var string Namensvorsatz der Zwischendatei in {@see replace()}. */
    public const TEMP_PREFIX = '.kurspilot-neu-';

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
     * Wurzelordner eines Bereichs, per dessen Plugin-Einstellung konfigurierbar.
     *
     * @param storage_area $area
     * @return string Immer mit fuehrendem und abschliessendem "/".
     */
    private static function root(storage_area $area): string {
        $configured = trim((string) (get_config('local_kurspilot', $area->rootsetting) ?: $area->defaultroot), '/');
        return $configured === '' ? '/' : '/' . $configured . '/';
    }

    /**
     * Zerlegt einen Client-Pfad in saubere Segmente und weist jedes `.`/`..`
     * ab - das erzwingt "kein Pfad, der herausfuehrt" direkt im Plugincode.
     *
     * @param storage_area $area
     * @param string $path
     * @return string[]
     */
    private static function segments(storage_area $area, string $path): array {
        $normalised = str_replace('\\', '/', $path);
        $segments = [];
        foreach (explode('/', $normalised) as $segment) {
            if ($segment === '') {
                continue;
            }
            if ($segment === '.' || $segment === '..') {
                throw new \moodle_exception($area->invalidpathkey, 'local_kurspilot');
            }
            $segments[] = $segment;
        }
        return $segments;
    }

    /**
     * Loest einen optionalen Client-Unterordner zu einem vollstaendigen
     * Moodle-Dateipfad innerhalb des Bereichs auf.
     *
     * @param storage_area $area
     * @param string $path Relativer Unterordner, z.B. "" oder "faecher/mathe".
     * @return string Immer mit fuehrendem und abschliessendem "/".
     */
    public static function resolve_directory(storage_area $area, string $path): string {
        $segments = self::segments($area, $path);
        return rtrim(self::root($area) . implode('/', $segments), '/') . '/';
    }

    /**
     * Der Client-Pfad zu einem aufgeloesten Verzeichnis - relativ zur
     * Wurzel, also in derselben Schreibweise, die jedes Werkzeug auch
     * entgegennimmt. Die Wurzel selbst ist der leere Pfad.
     *
     * @param storage_area $area
     * @param string $directory Ergebnis von {@see resolve_directory()}
     * @return string
     */
    public static function relative_directory(storage_area $area, string $directory): string {
        return trim(substr($directory, strlen(self::root($area))), '/');
    }

    /**
     * Der Client-Pfad einer Datei - wie {@see relative_directory()}, nur mit
     * Dateinamen. Eine Datei an der Wurzel ist schlicht ihr Dateiname.
     *
     * @param storage_area $area
     * @param string $directory Ergebnis von {@see resolve_directory()}
     * @param string $filename
     * @return string
     */
    public static function relative_file(storage_area $area, string $directory, string $filename): string {
        $relative = self::relative_directory($area, $directory);
        return $relative === '' ? $filename : $relative . '/' . $filename;
    }

    /**
     * Loest einen Client-Dateipfad (Ordner + Dateiname) auf.
     *
     * @param storage_area $area
     * @param string $path z.B. "vorlagen.md" oder "faecher/mathe/notiz.md".
     * @return array{0: string, 1: string} [Ordnerpfad, Dateiname]
     */
    public static function resolve_file(storage_area $area, string $path): array {
        $segments = self::segments($area, $path);
        if (empty($segments)) {
            throw new \moodle_exception($area->invalidpathkey, 'local_kurspilot');
        }
        $filename = array_pop($segments);
        return [self::resolve_directory($area, implode('/', $segments)), $filename];
    }

    /**
     * Wie {@see resolve_file()}, aber mit den engeren Schreibregeln:
     * Ordnersegmente nur aus `[A-Za-z0-9_-]`, Dateiname geprueft ueber die
     * bereichseigene Namensregel ({@see storage_area::$checkwritablename}) -
     * die eine echte, bereichsspezifische Policy-Methode. Lesen bleibt
     * bewusst grosszuegiger - der Altbestand und von Hand angelegte Dateien
     * sollen lesbar bleiben, auch wenn Kurspilot sie so nie geschrieben haette.
     *
     * @param storage_area $area
     * @param string $path z.B. "plan.md" oder "faecher/mathe/profil.md".
     * @return array{0: string, 1: string} [Ordnerpfad, Dateiname]
     * @throws \moodle_exception invalidpathkey des Bereichs / bereichseigener Namensfehler
     */
    public static function resolve_writable_file(storage_area $area, string $path): array {
        [$directory, $filename] = self::resolve_file($area, $path);

        // Nur die Ordnersegmente - der Dateiname darf als einziger einen
        // Punkt tragen und wird gleich mit seiner eigenen Regel geprueft.
        $folders = self::segments($area, $path);
        array_pop($folders);
        foreach ($folders as $segment) {
            if (!preg_match('/^[A-Za-z0-9_-]+$/', $segment)) {
                throw new \moodle_exception($area->invalidpathkey, 'local_kurspilot');
            }
        }
        ($area->checkwritablename)($filename);
        return [$directory, $filename];
    }

    /**
     * Standard-Nutzerrecht auf die eigenen Dateien - fuer alle
     * Schreibendpunkte, unabhaengig vom Bereich: beide schreiben in denselben
     * Bereich wie "Meine Dateien", also gilt dieselbe Freigabe.
     *
     * @throws \required_capability_exception
     */
    public static function require_manage_own_files(): void {
        require_capability('moodle/user:manageownfiles', self::own_context());
    }

    /**
     * Restplatz in Byte nach Nutzerquote - `file_storage` setzt
     * `$CFG->userquota` nicht selbst durch, nur die Core-UI tut das.
     * Root-unabhaengig: bezieht sich auf die gesamte Nutzerquote, nicht auf
     * einen Unterordner.
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
     * Weist einen Schreibvorgang ab, der die Nutzerquote sprengen wuerde.
     *
     * @param storage_area $area
     * @param int $additionalbytes Zuwachs gegenueber dem bisherigen Stand.
     * @throws \moodle_exception quotaerrorkey des Bereichs
     */
    public static function require_quota(storage_area $area, int $additionalbytes): void {
        $remaining = self::remaining_quota();
        if ($remaining === null || $additionalbytes <= $remaining) {
            return;
        }
        throw new \moodle_exception($area->quotaerrorkey, 'local_kurspilot', '', (object) [
            'remaining' => format_float($remaining / 1048576, 1),
            'needed' => format_float($additionalbytes / 1048576, 1),
        ]);
    }

    /**
     * Moodle-Dateisatz fuer eine Datei in einem Bereich.
     *
     * @param int $contextid
     * @param string $directory
     * @param string $filename
     * @return array
     */
    public static function filerecord(int $contextid, string $directory, string $filename): array {
        return [
            'contextid' => $contextid,
            'component' => self::COMPONENT,
            'filearea' => self::FILEAREA,
            'itemid' => self::ITEMID,
            'filepath' => $directory,
            'filename' => $filename,
        ];
    }

    /**
     * Setzt den Inhalt einer Datei neu - der eine Schreibvorgang, den sich
     * alle Schreibendpunkte teilen.
     *
     * Der neue Inhalt kommt zuerst unter einem Zwischennamen in den Dateipool,
     * erst danach faellt die alte Datei weg. Die naheliegende Reihenfolge -
     * loeschen, dann neu anlegen - ist nicht rettbar: `stored_file::delete()`
     * entfernt den Blob der letzten Referenz physisch aus dem Dateipool, und
     * eine umschliessende Transaktion holt ihn nicht zurueck. Sie stellt beim
     * Rollback nur die Datenbankzeile wieder her, die dann auf einen Blob
     * zeigt, den es nicht mehr gibt - die Lehrkraft haette ihre Datei
     * verloren, ohne dass jemand sie ueberschrieben hat.
     *
     * Bricht es zwischen Loeschen und Umbenennen ab, bleibt die Zwischendatei
     * mit dem vollstaendigen neuen Inhalt in "Meine Dateien" liegen. Sichtbar
     * und unschoen, aber nichts ist weg - der Zweck der Uebung.
     *
     * @param \stored_file|null $existing Bisherige Datei, falls vorhanden.
     * @param array $filerecord Ziel aus {@see filerecord()}.
     * @param string $content Vollstaendiger neuer Inhalt.
     */
    public static function replace(?\stored_file $existing, array $filerecord, string $content): void {
        $fs = get_file_storage();
        if (!$existing) {
            $fs->create_file_from_string($filerecord, $content);
            return;
        }

        $temprecord = $filerecord;
        $temprecord['filename'] = self::TEMP_PREFIX . uniqid() . '-' . $filerecord['filename'];
        $new = $fs->create_file_from_string($temprecord, $content);
        $existing->delete();
        $new->rename($filerecord['filepath'], $filerecord['filename']);
    }
}
