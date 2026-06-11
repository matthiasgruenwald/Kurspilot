'use strict';

const { loadEnvFile } = require('./load-env');

loadEnvFile();

const MOODLE_URL = process.env.MOODLE_URL || '';
const MOODLE_TOKEN = process.env.MOODLE_TOKEN || '';
const MOODLE_TEST_COURSEID = process.env.MOODLE_TEST_COURSEID || '';

const hasMoodleTestConfig = Boolean(MOODLE_URL && MOODLE_TOKEN && MOODLE_TEST_COURSEID);

const SKIP_REASON = 'Benötigt MOODLE_URL, MOODLE_TOKEN und MOODLE_TEST_COURSEID (siehe .env.example)';

/**
 * Ruft eine Moodle-Webservice-Funktion über die REST-API auf.
 * Spiegelt callMoodle aus moodle-mcp.js für Integrationstests.
 */
async function callMoodle(wsfunction, params = {}) {
  const body = new URLSearchParams({
    wstoken: MOODLE_TOKEN,
    wsfunction,
    moodlewsrestformat: 'json',
    ...params,
  });

  const res = await fetch(`${MOODLE_URL}/webservice/rest/server.php`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  const data = await res.json();

  if (data && data.exception) {
    throw new Error(`Moodle Fehler: ${data.message} (${data.errorcode})`);
  }

  return data;
}

module.exports = {
  hasMoodleTestConfig,
  SKIP_REASON,
  MOODLE_TEST_COURSEID,
  callMoodle,
};
