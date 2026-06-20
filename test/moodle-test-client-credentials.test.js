'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { loadMoodleTestConfig } = require('./helpers/moodle-test-client');

test('Integrationstest-Zugang liest URL und Token aus dem Moodle-Token-Speicher', () => {
  const config = loadMoodleTestConfig({
    env: { MOODLE_TEST_COURSEID: '42' },
    readCredentials: () => ({
      url: 'https://moodle.example.test',
      token: 'token-aus-keychain',
    }),
  });

  assert.deepEqual(config, {
    moodleUrl: 'https://moodle.example.test',
    moodleToken: 'token-aus-keychain',
    moodleTestCourseId: '42',
    source: 'keychain',
  });
});

test('Integrationstest-Zugang ignoriert MOODLE_URL und MOODLE_TOKEN aus der Prozess-Env', () => {
  const config = loadMoodleTestConfig({
    env: {
      MOODLE_URL: 'https://alte-env.example.test',
      MOODLE_TOKEN: 'alter-env-token',
      MOODLE_TEST_COURSEID: '7',
    },
    readCredentials: () => ({
      url: 'https://keychain-moodle.example.test',
      token: 'keychain-token',
    }),
  });

  assert.equal(config.source, 'keychain');
  assert.equal(config.moodleUrl, 'https://keychain-moodle.example.test');
  assert.equal(config.moodleToken, 'keychain-token');
  assert.equal(config.moodleTestCourseId, '7');
});

test('fehlender Keychain-Zugriff ueberspringt Integrationstests statt hart zu scheitern', () => {
  const config = loadMoodleTestConfig({
    env: { MOODLE_TEST_COURSEID: '7' },
    readCredentials: () => {
      throw new Error('Operation not permitted');
    },
  });

  assert.deepEqual(config, {
    moodleUrl: '',
    moodleToken: '',
    moodleTestCourseId: '7',
    source: 'missing',
  });
});
