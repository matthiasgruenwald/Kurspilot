'use strict';

const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const { createMoodleClient } = require('../lib/moodle-client');

let requestedUrls = [];
let originalFetch;

beforeEach(() => {
  requestedUrls = [];
  originalFetch = globalThis.fetch;
  globalThis.fetch = async url => {
    requestedUrls.push(String(url));
    return { json: async () => ({}) };
  };
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

test('createMoodleClient ergaenzt fehlendes Protokoll vor dem ersten Request (Issue #242)', async () => {
  const { callMoodle } = createMoodleClient('moo.gruenwald.fun', 'token-123');

  await callMoodle('core_course_get_contents', { courseid: 7 });

  assert.deepStrictEqual(requestedUrls, ['https://moo.gruenwald.fun/webservice/rest/server.php']);
});

test('createMoodleClient laesst vorhandenes Protokoll unangetastet (http:// fuer lokale Testinstanzen)', async () => {
  const { callMoodle } = createMoodleClient('http://localhost:8080', 'token-123');

  await callMoodle('core_course_get_contents', { courseid: 7 });

  assert.deepStrictEqual(requestedUrls, ['http://localhost:8080/webservice/rest/server.php']);
});
