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
 * Upgrade-Schritte. Das Plugin war bereits installiert (#309/#312/#334),
 * bevor die OAuth-Client-Tabelle (#335) hinzukam - Moodle diff't install.xml
 * nicht automatisch gegen ein bestehendes Plugin, deshalb legen wir sie hier
 * an. Gleiches Muster fuer die Code-/Token-Tabellen aus #336.
 *
 * @package    local_kurspilot
 * @copyright  2026 Kurspilot
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

defined('MOODLE_INTERNAL') || die();

/**
 * @param int $oldversion
 * @return bool
 */
function xmldb_local_kurspilot_upgrade(int $oldversion): bool {
    global $DB;

    $dbman = $DB->get_manager();

    if ($oldversion < 2026082001) {
        $table = new xmldb_table('local_kurspilot_oauth_client');
        $table->add_field('id', XMLDB_TYPE_INTEGER, '10', null, XMLDB_NOTNULL, XMLDB_SEQUENCE);
        $table->add_field('clientid', XMLDB_TYPE_CHAR, '255', null, XMLDB_NOTNULL);
        $table->add_field('clientname', XMLDB_TYPE_CHAR, '255');
        $table->add_field('redirecturis', XMLDB_TYPE_TEXT, null, null, XMLDB_NOTNULL);
        $table->add_field('tokenendpointauthmethod', XMLDB_TYPE_CHAR, '32', null, XMLDB_NOTNULL, null, 'none');
        $table->add_field('clientsecret', XMLDB_TYPE_CHAR, '128');
        $table->add_field('source', XMLDB_TYPE_CHAR, '16', null, XMLDB_NOTNULL, null, 'dcr');
        $table->add_field('timecreated', XMLDB_TYPE_INTEGER, '10', null, XMLDB_NOTNULL);
        $table->add_key('primary', XMLDB_KEY_PRIMARY, ['id']);
        $table->add_index('clientid', XMLDB_INDEX_UNIQUE, ['clientid']);
        if (!$dbman->table_exists($table)) {
            $dbman->create_table($table);
        }

        upgrade_plugin_savepoint(true, 2026082001, 'local', 'kurspilot');
    }

    if ($oldversion < 2026082002) {
        $codetable = new xmldb_table('local_kurspilot_oauth_code');
        $codetable->add_field('id', XMLDB_TYPE_INTEGER, '10', null, XMLDB_NOTNULL, XMLDB_SEQUENCE);
        $codetable->add_field('code', XMLDB_TYPE_CHAR, '64', null, XMLDB_NOTNULL);
        $codetable->add_field('clientid', XMLDB_TYPE_CHAR, '255', null, XMLDB_NOTNULL);
        $codetable->add_field('userid', XMLDB_TYPE_INTEGER, '10', null, XMLDB_NOTNULL);
        $codetable->add_field('redirecturi', XMLDB_TYPE_TEXT, null, null, XMLDB_NOTNULL);
        $codetable->add_field('codechallenge', XMLDB_TYPE_CHAR, '128', null, XMLDB_NOTNULL);
        $codetable->add_field('expires', XMLDB_TYPE_INTEGER, '10', null, XMLDB_NOTNULL);
        $codetable->add_field('used', XMLDB_TYPE_INTEGER, '1', null, XMLDB_NOTNULL, null, '0');
        $codetable->add_key('primary', XMLDB_KEY_PRIMARY, ['id']);
        $codetable->add_index('code', XMLDB_INDEX_UNIQUE, ['code']);
        if (!$dbman->table_exists($codetable)) {
            $dbman->create_table($codetable);
        }

        $tokentable = new xmldb_table('local_kurspilot_oauth_token');
        $tokentable->add_field('id', XMLDB_TYPE_INTEGER, '10', null, XMLDB_NOTNULL, XMLDB_SEQUENCE);
        $tokentable->add_field('accesstoken', XMLDB_TYPE_CHAR, '64', null, XMLDB_NOTNULL);
        $tokentable->add_field('refreshtoken', XMLDB_TYPE_CHAR, '64', null, XMLDB_NOTNULL);
        $tokentable->add_field('clientid', XMLDB_TYPE_CHAR, '255', null, XMLDB_NOTNULL);
        $tokentable->add_field('userid', XMLDB_TYPE_INTEGER, '10', null, XMLDB_NOTNULL);
        $tokentable->add_field('expires', XMLDB_TYPE_INTEGER, '10', null, XMLDB_NOTNULL);
        $tokentable->add_field('refreshexpires', XMLDB_TYPE_INTEGER, '10', null, XMLDB_NOTNULL);
        $tokentable->add_field('revoked', XMLDB_TYPE_INTEGER, '1', null, XMLDB_NOTNULL, null, '0');
        $tokentable->add_field('timecreated', XMLDB_TYPE_INTEGER, '10', null, XMLDB_NOTNULL);
        $tokentable->add_key('primary', XMLDB_KEY_PRIMARY, ['id']);
        $tokentable->add_index('accesstoken', XMLDB_INDEX_UNIQUE, ['accesstoken']);
        $tokentable->add_index('refreshtoken', XMLDB_INDEX_UNIQUE, ['refreshtoken']);
        if (!$dbman->table_exists($tokentable)) {
            $dbman->create_table($tokentable);
        }

        upgrade_plugin_savepoint(true, 2026082002, 'local', 'kurspilot');
    }

    return true;
}
