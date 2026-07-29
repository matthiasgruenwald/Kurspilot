'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ENV_PATH = path.resolve(__dirname, '..', '..', '..', '.env.e2e');

function loadEnvFile() {
  if (!fs.existsSync(ENV_PATH)) return {};
  const lines = fs.readFileSync(ENV_PATH, 'utf8').split('\n');
  const vars = {};
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    vars[trimmed.slice(0, eq)] = trimmed.slice(eq + 1);
  }
  return vars;
}

const env = loadEnvFile();

const config = {
  moodleUrl: env.MOODLE_URL || process.env.MOODLE_URL || '',
  moodleToken: env.MOODLE_TOKEN || process.env.MOODLE_TOKEN || '',
  courseId: Number(env.MOODLE_TEST_COURSEID || process.env.MOODLE_TEST_COURSEID || 0),
  username: env.MOODLE_USERNAME || process.env.MOODLE_USERNAME || '',
  password: env.MOODLE_PASSWORD || process.env.MOODLE_PASSWORD || '',
};

const isConfigured = Boolean(config.moodleUrl && config.moodleToken && config.courseId);
const hasBrowserCredentials = Boolean(config.username && config.password);

module.exports = { config, isConfigured, hasBrowserCredentials };
