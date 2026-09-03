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
 * Anker des Materialordners (Spec 0018 §2, Issue #428): Geschwisterordner zu
 * {@see context_files} in denselben Private Files der aufrufenden Lehrkraft -
 * `component=user`, `filearea=private`, `itemid=0`, eingegrenzt auf den
 * Unterordner aus {@see root()} (Default `kurspilot-material`).
 *
 * Der Ort steckt bewusst hinter genau diesem Konstantensatz (Spec 0018 §2.3):
 * kein Endpunkt kennt COMPONENT/FILEAREA/ITEMID/Wurzel selbst, sie kommen
 * ausschliesslich von hier. Ein spaeterer Umzug (z.B. an ein angebundenes
 * Repository) aendert nur diese Klasse - siehe tests/material_files_test.php,
 * das genau das mit einem eigenen Konstantensatz beweist, ohne einen
 * Endpunkttest anzufassen.
 *
 * Anders als der Kontextbereich (nur `.md`, Spec 0016 §5.1) fuehrt der
 * Materialordner Binaerdateien nach Whitelist (Spec 0018 §6) - deshalb eigene
 * Pfad-/Schreibregeln statt Wiederverwendung von context_files::resolve_writable_file().
 *
 * @package    local_kurspilot
 * @copyright  2026 Kurspilot
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
final class material_files {

    /** @var string Moodle-Dateikomponente - Moodles Private Files (Spec 0018 §2.1). */
    public const COMPONENT = 'user';

    /** @var string Alleiniger, fuer die KI erreichbarer Dateibereich. */
    public const FILEAREA = 'private';

    /** @var int Fester Item-Bezug - der Bereich kennt keine weiteren Items. */
    public const ITEMID = 0;

    /** @var string Default-Wurzelordner, ueberschreibbar per Plugin-Einstellung. */
    private const DEFAULT_ROOT = 'kurspilot-material';

    /**
     * Allgemeine Upload-Whitelist (Spec 0018 §6) - unveraendert aus dem
     * lokalen Weg uebernommen, siehe lib/assign-tools.js UPLOAD_MIME_TYPES.
     *
     * @var string[]
     */
    private const ALLOWED_UPLOAD_EXTENSIONS = [
        'pdf', 'docx', 'doc', 'xlsx', 'xls', 'pptx', 'ppt', 'html', 'htm',
        'png', 'jpg', 'jpeg', 'gif', 'svg', 'txt', 'csv', 'zip',
    ];

    /**
     * Engere Whitelist einbettbarer Bilder (Spec 0018 §6) - unveraendert aus
     * dem lokalen Weg uebernommen, siehe lib/assign-tools.js EMBED_IMAGE_MIME_TYPES.
     * SVG bleibt bewusst zulaessig (Spec 0018 §6).
     *
     * @var string[]
     */
    private const ALLOWED_IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'];

    /**
     * Anteil der Nutzerquote, unter dem eine Warnung erscheint (Spec 0018 §8.1).
     */
    private const QUOTA_WARNING_RATIO = 0.1;

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
     * `local_kurspilot/materialroot` konfigurierbar (Spec 0018 §2.1).
     *
     * @return string Immer mit fuehrendem und abschliessendem "/".
     */
    private static function root(): string {
        $configured = trim((string) (get_config('local_kurspilot', 'materialroot') ?: self::DEFAULT_ROOT), '/');
        return $configured === '' ? '/' : '/' . $configured . '/';
    }

    /**
     * Zerlegt einen Client-Pfad in saubere Segmente und weist jedes `.`/`..`
     * ab - dieselbe Regel wie {@see context_files}, Spec 0016 §5.1.
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
                throw new \moodle_exception('invalidmaterialpath', 'local_kurspilot');
            }
            $segments[] = $segment;
        }
        return $segments;
    }

    /**
     * Loest einen optionalen Client-Unterordner zu einem vollstaendigen
     * Moodle-Dateipfad innerhalb des Materialordners auf.
     *
     * @param string $path Relativer Unterordner, z.B. "" oder "faecher/mathe".
     * @return string Immer mit fuehrendem und abschliessendem "/".
     */
    public static function resolve_directory(string $path): string {
        $segments = self::segments($path);
        return rtrim(self::root() . implode('/', $segments), '/') . '/';
    }

    /**
     * Der Client-Pfad zu einem aufgeloesten Verzeichnis - relativ zur
     * Wurzel. Die Wurzel selbst ist der leere Pfad.
     *
     * @param string $directory Ergebnis von {@see resolve_directory()}
     * @return string
     */
    public static function relative_directory(string $directory): string {
        return trim(substr($directory, strlen(self::root())), '/');
    }

    /**
     * Der Client-Pfad einer Datei - wie {@see relative_directory()}, nur mit
     * Dateinamen.
     *
     * @param string $directory Ergebnis von {@see resolve_directory()}
     * @param string $filename
     * @return string
     */
    public static function relative_file(string $directory, string $filename): string {
        $relative = self::relative_directory($directory);
        return $relative === '' ? $filename : $relative . '/' . $filename;
    }

    /**
     * Loest einen Client-Dateipfad (Ordner + Dateiname) auf - lesend, ohne
     * Endungspruefung (Altbestand/von Hand abgelegte Dateien bleiben lesbar).
     *
     * @param string $path z.B. "screenshot.png" oder "faecher/mathe/blatt.pdf".
     * @return array{0: string, 1: string} [Ordnerpfad, Dateiname]
     */
    public static function resolve_file(string $path): array {
        $segments = self::segments($path);
        if (empty($segments)) {
            throw new \moodle_exception('invalidmaterialpath', 'local_kurspilot');
        }
        $filename = array_pop($segments);
        return [self::resolve_directory(implode('/', $segments)), $filename];
    }

    /**
     * Alle zulaessigen Dateiendungen (Spec 0018 §6), Vereinigung beider
     * Whitelists.
     *
     * @return string[]
     */
    public static function allowed_extensions(): array {
        return array_values(array_unique(array_merge(self::ALLOWED_UPLOAD_EXTENSIONS, self::ALLOWED_IMAGE_EXTENSIONS)));
    }

    /**
     * Ob eine Dateiendung in einer der beiden Whitelists steht.
     *
     * @param string $filename
     * @return bool
     */
    public static function is_allowed_extension(string $filename): bool {
        $extension = strtolower(pathinfo($filename, PATHINFO_EXTENSION));
        return $extension !== '' && in_array($extension, self::allowed_extensions(), true);
    }

    /**
     * Die engere Einbett-Whitelist (Spec 0018 §6, Issue #433) - dieselbe
     * Menge wie ALLOWED_IMAGE_EXTENSIONS, oeffentlich fuer die Pruefung beim
     * Einbetten in eine Aktivitaetsbeschreibung: ein PDF darf im
     * Materialordner liegen und als "Zusaetzliche Datei" angehaengt werden
     * (Issue #429), aber nicht als `<img>` in den Intro-Text.
     *
     * @return string[]
     */
    public static function allowed_embed_image_extensions(): array {
        return self::ALLOWED_IMAGE_EXTENSIONS;
    }

    /**
     * Ob eine Dateiendung in der Einbett-Whitelist steht (Spec 0018 §6).
     *
     * @param string $filename
     * @return bool
     */
    public static function is_allowed_embed_image_extension(string $filename): bool {
        $extension = strtolower(pathinfo($filename, PATHINFO_EXTENSION));
        return $extension !== '' && in_array($extension, self::ALLOWED_IMAGE_EXTENSIONS, true);
    }

    /**
     * Wie {@see resolve_file()}, aber mit den Schreibregeln aus Spec 0018 §2.4
     * (uebernommen aus Spec 0016 §5.1): Ordnersegmente nur aus
     * `[A-Za-z0-9_-]`, Dateiname derselbe Zeichenvorrat plus eine zulaessige
     * Endung (Spec 0018 §6) statt der `.md`-Regel des Kontextbereichs.
     *
     * @param string $path z.B. "screenshot.png" oder "faecher/mathe/blatt.pdf".
     * @return array{0: string, 1: string} [Ordnerpfad, Dateiname]
     * @throws \moodle_exception invalidmaterialpath / materialfiledisallowedtype
     */
    public static function resolve_writable_file(string $path): array {
        [$directory, $filename] = self::resolve_file($path);

        $folders = self::segments($path);
        array_pop($folders);
        foreach ($folders as $segment) {
            if (!preg_match('/^[A-Za-z0-9_-]+$/', $segment)) {
                throw new \moodle_exception('invalidmaterialpath', 'local_kurspilot');
            }
        }
        if (!preg_match('/^[A-Za-z0-9_-]+\.[A-Za-z0-9]+$/', $filename) || !self::is_allowed_extension($filename)) {
            throw new \moodle_exception('materialfiledisallowedtype', 'local_kurspilot', '', (object) [
                'filename' => $filename,
                'allowed' => implode(', ', self::allowed_extensions()),
            ]);
        }
        return [$directory, $filename];
    }

    /**
     * Standard-Nutzerrecht auf die eigenen Dateien (wie context_files) - der
     * Materialordner liegt im selben Bereich wie "Meine Dateien".
     *
     * @throws \required_capability_exception
     */
    public static function require_manage_own_files(): void {
        require_capability('moodle/user:manageownfiles', self::own_context());
    }

    /**
     * Restplatz in Byte nach Nutzerquote - dieselbe, root-unabhaengige
     * Berechnung wie {@see context_files::remaining_quota()}; hier
     * wiederverwendet statt verdoppelt, weil sie sich auf die gesamte
     * Nutzerquote bezieht, nicht auf einen Unterordner.
     *
     * @return int|null Restplatz in Byte, oder null wenn keine Grenze gilt.
     */
    public static function remaining_quota(): ?int {
        return context_files::remaining_quota();
    }

    /**
     * Weist einen Schreibvorgang ab, der die Nutzerquote sprengen wuerde -
     * das deckt auch die volle Quote ab (Restplatz 0, jeder positive Zuwachs
     * scheitert), Spec 0018 §8.1.
     *
     * @param int $additionalbytes Zuwachs gegenueber dem bisherigen Stand.
     * @throws \moodle_exception materialquotaexceeded
     */
    public static function require_quota(int $additionalbytes): void {
        $remaining = self::remaining_quota();
        if ($remaining === null || $additionalbytes <= $remaining) {
            return;
        }
        throw new \moodle_exception('materialquotaexceeded', 'local_kurspilot', '', (object) [
            'remaining' => format_float($remaining / 1048576, 1),
            'needed' => format_float($additionalbytes / 1048576, 1),
        ]);
    }

    /**
     * Warnmeldung, wenn nach einem Schreibvorgang weniger als 10% der
     * Nutzerquote uebrig bleiben (Spec 0018 §8.1, Form wie Spec 0016 §5.4).
     *
     * @param int $additionalbytes Zuwachs gegenueber dem bisherigen Stand.
     * @return string|null Warnmeldung, oder null wenn keine Warnung noetig ist.
     */
    public static function quota_warning(int $additionalbytes): ?string {
        global $CFG;

        $remaining = self::remaining_quota();
        $quota = (int) ($CFG->userquota ?? 0);
        if ($remaining === null || $quota <= 0) {
            return null;
        }
        $remainingafter = max(0, $remaining - $additionalbytes);
        if ($remainingafter / $quota >= self::QUOTA_WARNING_RATIO) {
            return null;
        }
        return get_string('materialquotawarning', 'local_kurspilot', format_float($remainingafter / 1048576, 1));
    }

    /**
     * Moodle-Dateisatz fuer eine Datei im Materialordner.
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
     * Loest eine Liste von Materialordner-Pfaden zu einem Dateimanager-Entwurf
     * auf (Spec 0018 §4.2/§7: "der Verweisweg ist fuer alle Herkuenfte
     * derselbe Pfad ab dem Materialordner"). Der Entwurf wird zuerst mit den
     * bereits an $targetcontextid/$component/$filearea/$itemid haengenden
     * Dateien vorbelegt (file_prepare_draft_area) - bestehende Anhaenge
     * bleiben also erhalten, ein Aufruf haengt nur an, ersetzt nicht.
     *
     * Rein lesend gegenueber dem Materialordner: jede Quelldatei wird
     * kopiert, nie verschoben oder geloescht - scheitert der Aufrufer danach
     * beim eigentlichen Schreiben, bleibt die Materialdatei unangetastet
     * liegen (Spec 0018 §4.2 "kein Verlust im Fehlerfall").
     *
     * @param int $targetcontextid Kontext der Zielaktivitaet (Modulkontext).
     * @param string $component z.B. "mod_assign".
     * @param string $filearea z.B. "introattachment".
     * @param int $itemid
     * @param array $paths Materialordner-Pfade, z.B. ["arbeitsblatt.pdf"].
     * @return int Entwurfs-Itemid, direkt als *_update_instance()-Feldwert nutzbar.
     * @throws \moodle_exception invalidmaterialpath / materialfilenotfound
     */
    public static function resolve_into_draft(
        int $targetcontextid,
        string $component,
        string $filearea,
        int $itemid,
        array $paths
    ): int {
        $fs = get_file_storage();
        $draftitemid = 0;
        file_prepare_draft_area($draftitemid, $targetcontextid, $component, $filearea, $itemid);

        $usercontext = self::own_context();
        foreach ($paths as $path) {
            if (!is_string($path)) {
                throw new \moodle_exception('invalidmaterialpath', 'local_kurspilot');
            }
            [$directory, $filename] = self::resolve_file($path);
            $source = $fs->get_file($usercontext->id, self::COMPONENT, self::FILEAREA, self::ITEMID, $directory, $filename);
            if (!$source) {
                throw new \moodle_exception(
                    'materialfilenotfound',
                    'local_kurspilot',
                    '',
                    self::relative_file($directory, $filename)
                );
            }

            $existing = $fs->get_file($usercontext->id, 'user', 'draft', $draftitemid, '/', $filename);
            if ($existing) {
                // Gleicher Dateiname erneut referenziert - juengste Version gewinnt.
                $existing->delete();
            }
            $fs->create_file_from_storedfile([
                'contextid' => $usercontext->id,
                'component' => 'user',
                'filearea' => 'draft',
                'itemid' => $draftitemid,
                'filepath' => '/',
                'filename' => $filename,
            ], $source);
        }

        return $draftitemid;
    }

    /**
     * Setzt den Inhalt einer Materialdatei neu - {@see context_files::replace()}
     * wiederverwendet statt verdoppelt: die Funktion ist rein
     * dateisystemisch (Zwischendatei, dann erst die alte weg, Spec 0016 §5.3)
     * und kennt weder Kontext- noch Materialwurzel.
     *
     * @param \stored_file|null $existing Bisherige Datei, falls vorhanden.
     * @param array $filerecord Ziel aus {@see filerecord()}.
     * @param string $content Vollstaendiger neuer Inhalt.
     */
    public static function replace(?\stored_file $existing, array $filerecord, string $content): void {
        context_files::replace($existing, $filerecord, $content);
    }
}
