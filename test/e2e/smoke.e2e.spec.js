'use strict';

const { test, expect } = require('@playwright/test');
const { config, isConfigured, hasBrowserCredentials } = require('./helpers/env');
const { McpFixture } = require('./helpers/mcp-fixture');
const { MoodlePage } = require('./helpers/moodle-page');

test.skip(!isConfigured, '.env.e2e fehlt oder unvollstaendig');

let mcp;

test.beforeAll(async () => {
  mcp = new McpFixture(config.moodleUrl, config.moodleToken);
  await mcp.start();
});

test.afterAll(async () => {
  if (mcp) mcp.stop();
});

test('moodle_get_sections returns sections via MCP JSON-RPC', async () => {
  const sections = await mcp.callTool('moodle_get_sections', { courseid: config.courseId });
  expect(Array.isArray(sections)).toBe(true);
  expect(sections.length).toBeGreaterThan(0);
  const named = sections.filter(s => s.name && s.name.trim());
  expect(named.length).toBeGreaterThan(0);
});

test('course page shows section names from MCP', async ({ page }) => {
  test.skip(!hasBrowserCredentials, 'MOODLE_USERNAME/MOODLE_PASSWORD fehlen in .env.e2e');

  const sections = await mcp.callTool('moodle_get_sections', { courseid: config.courseId });
  const named = sections.filter(s => s.name && s.name.trim() && !/^\(Abschnitt \d+\)$/.test(s.name));
  expect(named.length).toBeGreaterThan(0);

  const moodlePage = new MoodlePage(page, config.moodleUrl, config);
  await moodlePage.login();
  await moodlePage.goToCourse(config.courseId);
  await moodlePage.waitForCourseContent();

  const sectionNames = page.locator('.sectionname');
  await expect(sectionNames.first()).toBeVisible();
  for (const section of named) {
    await expect(sectionNames.filter({ hasText: section.name })).toHaveCount(1, { timeout: 5_000 });
  }
});
