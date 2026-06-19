'use strict';

const { readCredentials } = require('../../scripts/moodle-credentials');

function loadMoodleTestConfig(options = {}) {
  const env = options.env || process.env;
  const readCredentialsFn = options.readCredentials || readCredentials;
  const courseId = env.MOODLE_TEST_COURSEID || '';

  try {
    const credentials = readCredentialsFn();
    if (credentials) {
      return {
        moodleUrl: credentials.url,
        moodleToken: credentials.token,
        moodleTestCourseId: courseId,
        source: 'keychain',
      };
    }
  } catch {
    // No Keychain access in this process: integration tests will skip cleanly.
  }

  return {
    moodleUrl: '',
    moodleToken: '',
    moodleTestCourseId: courseId,
    source: 'missing',
  };
}

const testConfig = loadMoodleTestConfig();
const MOODLE_URL = testConfig.moodleUrl;
const MOODLE_TOKEN = testConfig.moodleToken;
const MOODLE_TEST_COURSEID = testConfig.moodleTestCourseId;

const hasMoodleTestConfig = Boolean(MOODLE_URL && MOODLE_TOKEN && MOODLE_TEST_COURSEID);

const SKIP_REASON = (
  'Benötigt Moodle-Zugangsdaten im macOS-Schluesselbund ' +
  'und MOODLE_TEST_COURSEID als Umgebungsvariable.'
);

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
  loadMoodleTestConfig,
  hasMoodleTestConfig,
  SKIP_REASON,
  MOODLE_TEST_COURSEID,
  callMoodle,
};
