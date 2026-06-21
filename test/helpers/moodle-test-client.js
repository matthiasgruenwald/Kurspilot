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

// Optionales Token eines Nutzers OHNE moodle/question:managecategory im
// Fragenbank-Kontext, fuer Tests, die eine erwartete Ablehnung pruefen.
// Wird ueber die Umgebungsvariable MOODLE_TEST_TOKEN_NO_MANAGECATEGORY
// bereitgestellt; ohne diese Variable werden die betroffenen Tests sauber
// uebersprungen (kein zweiter Webservice-Nutzer im Standard-Setup noetig).
const MOODLE_TOKEN_NO_MANAGECATEGORY = process.env.MOODLE_TEST_TOKEN_NO_MANAGECATEGORY || '';
const hasNoManagecategoryTestConfig = Boolean(hasMoodleTestConfig && MOODLE_TOKEN_NO_MANAGECATEGORY);
const SKIP_REASON_NO_MANAGECATEGORY = (
  'Benötigt zusätzlich MOODLE_TEST_TOKEN_NO_MANAGECATEGORY (Token eines Nutzers ' +
  'ohne moodle/question:managecategory im Fragenbank-Kontext).'
);

/**
 * Ruft eine Moodle-Webservice-Funktion über die REST-API mit einem
 * bestimmten Token auf. Spiegelt callMoodle aus moodle-mcp.js für
 * Integrationstests.
 */
async function callMoodleWithToken(token, wsfunction, params = {}) {
  const body = new URLSearchParams({
    wstoken: token,
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

/**
 * Ruft eine Moodle-Webservice-Funktion mit dem Standard-Testtoken auf.
 */
async function callMoodle(wsfunction, params = {}) {
  return callMoodleWithToken(MOODLE_TOKEN, wsfunction, params);
}

/**
 * Ruft eine Moodle-Webservice-Funktion mit dem Token eines Nutzers ohne
 * moodle/question:managecategory auf (siehe MOODLE_TOKEN_NO_MANAGECATEGORY).
 */
async function callMoodleAsUserWithoutManagecategory(wsfunction, params = {}) {
  return callMoodleWithToken(MOODLE_TOKEN_NO_MANAGECATEGORY, wsfunction, params);
}

module.exports = {
  loadMoodleTestConfig,
  hasMoodleTestConfig,
  SKIP_REASON,
  MOODLE_TEST_COURSEID,
  callMoodle,
  callMoodleWithToken,
  callMoodleAsUserWithoutManagecategory,
  hasNoManagecategoryTestConfig,
  SKIP_REASON_NO_MANAGECATEGORY,
};
