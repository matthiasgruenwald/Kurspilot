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

namespace local_kurspilot\privacy;

use core_privacy\local\metadata\collection;
use core_privacy\local\request\approved_contextlist;
use core_privacy\local\request\approved_userlist;
use core_privacy\local\request\contextlist;
use core_privacy\local\request\userlist;
use core_privacy\local\request\writer;
use core_privacy\local\request\transform;
use local_kurspilot\context_files;

/**
 * Voller Privacy-Provider (#336, erweitert in #345 um Kontextdateien aus
 * #343): die Autorisierungscode- und Token-Tabellen binden `userid` an die
 * Lehrkraft, die den Client autorisiert hat - `null_provider` traegt hier
 * nicht (anders als beim Moodle-Webservice-Token, siehe
 * core_webservice\privacy\provider), weil lokale, plugin-eigene Tabellen
 * betroffen sind, kein Core-Loeschmechanismus existiert. Voller Provider wie
 * im Resolutionskommentar zu #298 (Punkt 7) vereinbart: metadata\provider +
 * request\plugin\provider + core_userlist_provider.
 *
 * Zwei Kontextebenen: Autorisierungscodes/Token haengen am Systemkontext
 * (kein Kurs-/Modulbezug), Kontextdateien (#343) am privaten Nutzerkontext
 * der jeweiligen Lehrkraft ({@see \local_kurspilot\context_files}).
 *
 * Protokollereignisse (#339) sind bewusst NICHT hier abgedeckt: das Ablegen,
 * Exportieren und Loeschen der eigentlichen Log-Eintraege besorgt Moodle-Core
 * zentral ueber logstore_standard's eigenen Privacy-Provider (der exportiert/
 * loescht alle Log-Eintraege eines Nutzers unabhaengig vom ausloesenden
 * Plugin) - ein eigener Export-/Loeschpfad hier waere doppelte, mit Core
 * kollidierende Arbeit. Die Ereignisse selbst tragen bereits die dafuer
 * noetigen Merkmale (userid, contextid, component), siehe
 * classes/event/tool_access_*.php.
 *
 * @package    local_kurspilot
 * @copyright  2026 Kurspilot
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
final class provider implements
    \core_privacy\local\metadata\provider,
    \core_privacy\local\request\plugin\provider,
    \core_privacy\local\request\core_userlist_provider {

    /**
     * @param collection $collection
     * @return collection
     */
    public static function get_metadata(collection $collection): collection {
        $collection->add_database_table('local_kurspilot_oauth_code', [
            'clientid' => 'privacy:metadata:oauth_code:clientid',
            'userid' => 'privacy:metadata:oauth_code:userid',
            'redirecturi' => 'privacy:metadata:oauth_code:redirecturi',
            'codechallenge' => 'privacy:metadata:oauth_code:codechallenge',
            'expires' => 'privacy:metadata:oauth_code:expires',
            'used' => 'privacy:metadata:oauth_code:used',
        ], 'privacy:metadata:oauth_code');

        $collection->add_database_table('local_kurspilot_oauth_token', [
            'clientid' => 'privacy:metadata:oauth_token:clientid',
            'userid' => 'privacy:metadata:oauth_token:userid',
            'expires' => 'privacy:metadata:oauth_token:expires',
            'refreshexpires' => 'privacy:metadata:oauth_token:refreshexpires',
            'revoked' => 'privacy:metadata:oauth_token:revoked',
            'timecreated' => 'privacy:metadata:oauth_token:timecreated',
        ], 'privacy:metadata:oauth_token');

        $collection->add_subsystem_link('core_files', [], 'privacy:metadata:core_files');

        return $collection;
    }

    /**
     * @param int $userid
     * @return contextlist
     */
    public static function get_contexts_for_userid(int $userid): contextlist {
        global $DB;

        $contextlist = new contextlist();
        $hasoauthdata = $DB->record_exists('local_kurspilot_oauth_code', ['userid' => $userid])
            || $DB->record_exists('local_kurspilot_oauth_token', ['userid' => $userid]);
        if ($hasoauthdata) {
            $contextlist->add_system_context();
        }

        $usercontext = \context_user::instance($userid);
        if (self::context_user_has_files($usercontext)) {
            $contextlist->add_user_context($userid);
        }

        return $contextlist;
    }

    /**
     * @param userlist $userlist
     */
    public static function get_users_in_context(userlist $userlist): void {
        $context = $userlist->get_context();

        if ($context instanceof \context_system) {
            $userlist->add_from_sql('userid', 'SELECT userid FROM {local_kurspilot_oauth_code}', []);
            $userlist->add_from_sql('userid', 'SELECT userid FROM {local_kurspilot_oauth_token}', []);
            return;
        }

        if ($context instanceof \context_user && self::context_user_has_files($context)) {
            $userlist->add_user($context->instanceid);
        }
    }

    /**
     * Ob im Nutzerkontext tatsaechlich Kontextdateien liegen - anders als
     * core_user::get_users_in_context() (die den Kontexteigentuemer blind
     * hinzufuegt) prueft dieser Provider den echten Dateibestand, damit ein
     * beliebiger Nutzerkontext ohne Kontextdateien nicht faelschlich
     * auftaucht.
     *
     * @param \context_user $context
     * @return bool
     */
    private static function context_user_has_files(\context_user $context): bool {
        $fs = get_file_storage();
        foreach ($fs->get_area_files($context->id, context_files::COMPONENT, context_files::FILEAREA, context_files::ITEMID) as $file) {
            if (!$file->is_directory()) {
                return true;
            }
        }
        return false;
    }

    /**
     * @param approved_contextlist $contextlist
     */
    public static function export_user_data(approved_contextlist $contextlist): void {
        global $DB;

        $userid = (int) $contextlist->get_user()->id;
        foreach ($contextlist->get_contexts() as $context) {
            if ($context instanceof \context_user && (int) $context->instanceid === $userid) {
                writer::with_context($context)->export_area_files(
                    [get_string('pluginname', 'local_kurspilot')],
                    context_files::COMPONENT,
                    context_files::FILEAREA,
                    context_files::ITEMID
                );
                continue;
            }

            if (!$context instanceof \context_system) {
                continue;
            }

            $codes = $DB->get_records('local_kurspilot_oauth_code', ['userid' => $userid]);
            $exportedcodes = array_map(static fn($record): \stdClass => (object) [
                'clientid' => $record->clientid,
                'redirecturi' => $record->redirecturi,
                'expires' => transform::datetime($record->expires),
                'used' => transform::yesno($record->used),
            ], array_values($codes));

            $tokens = $DB->get_records('local_kurspilot_oauth_token', ['userid' => $userid]);
            $exportedtokens = array_map(static fn($record): \stdClass => (object) [
                'clientid' => $record->clientid,
                'expires' => transform::datetime($record->expires),
                'refreshexpires' => transform::datetime($record->refreshexpires),
                'revoked' => transform::yesno($record->revoked),
                'timecreated' => transform::datetime($record->timecreated),
            ], array_values($tokens));

            writer::with_context($context)->export_data(
                [get_string('pluginname', 'local_kurspilot')],
                (object) ['oauth_codes' => $exportedcodes, 'oauth_tokens' => $exportedtokens]
            );
        }
    }

    /**
     * @param \context $context
     */
    public static function delete_data_for_all_users_in_context(\context $context): void {
        global $DB;

        if ($context instanceof \context_user) {
            self::delete_context_files($context);
            return;
        }

        if (!$context instanceof \context_system) {
            return;
        }
        $DB->delete_records('local_kurspilot_oauth_code');
        $DB->delete_records('local_kurspilot_oauth_token');
    }

    /**
     * Loescht alle Kontextdateien (#343) im gegebenen Nutzerkontext.
     *
     * @param \context $context
     */
    private static function delete_context_files(\context $context): void {
        get_file_storage()->delete_area_files(
            $context->id,
            context_files::COMPONENT,
            context_files::FILEAREA,
            context_files::ITEMID
        );
    }

    /**
     * @param approved_contextlist $contextlist
     */
    public static function delete_data_for_user(approved_contextlist $contextlist): void {
        global $DB;

        $userid = (int) $contextlist->get_user()->id;
        foreach ($contextlist->get_contexts() as $context) {
            if ($context instanceof \context_user && (int) $context->instanceid === $userid) {
                self::delete_context_files($context);
            }
        }

        if (!in_array(SYSCONTEXTID, $contextlist->get_contextids(), true)) {
            return;
        }
        $DB->delete_records('local_kurspilot_oauth_code', ['userid' => $userid]);
        $DB->delete_records('local_kurspilot_oauth_token', ['userid' => $userid]);
    }

    /**
     * @param approved_userlist $userlist
     */
    public static function delete_data_for_users(approved_userlist $userlist): void {
        global $DB;

        $context = $userlist->get_context();

        if ($context instanceof \context_user) {
            self::delete_context_files($context);
            return;
        }

        if (!$context instanceof \context_system) {
            return;
        }
        [$insql, $inparams] = $DB->get_in_or_equal($userlist->get_userids(), SQL_PARAMS_NAMED);
        $DB->delete_records_select('local_kurspilot_oauth_code', "userid $insql", $inparams);
        $DB->delete_records_select('local_kurspilot_oauth_token', "userid $insql", $inparams);
    }
}
