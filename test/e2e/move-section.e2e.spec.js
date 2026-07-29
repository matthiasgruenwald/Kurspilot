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

test('move_section to non-existing target creates it and shows on course page (#226)', async ({ page }) => {
  test.skip(!hasBrowserCredentials, 'MOODLE_USERNAME/MOODLE_PASSWORD fehlen in .env.e2e');

  const uniqueName = `E2E-Move #226 ${Date.now()}`;
  const sections = await mcp.callTool('moodle_get_sections', { courseid: config.courseId });
  const maxSection = Math.max(...sections.map(s => s.sectionnum));
  const sourceNum = maxSection;
  const targetNum = maxSection + 2;

  await mcp.callTool('moodle_ensure_section', {
    courseid: config.courseId,
    sectionnum: sourceNum,
    name: uniqueName,
  });

  const result = await mcp.callTool('moodle_move_section', {
    courseid: config.courseId,
    sectionnum: sourceNum,
    targetsectionnum: targetNum,
  });
  expect(result.moved).toBe(1);

  const afterSections = await mcp.callTool('moodle_get_sections', { courseid: config.courseId });
  const moved = afterSections.find(s => s.name === uniqueName);
  expect(moved).toBeTruthy();
  expect(moved.sectionnum).toBeGreaterThan(sourceNum);

  const moodlePage = new MoodlePage(page, config.moodleUrl, config);
  await moodlePage.login();
  await moodlePage.goToCourse(config.courseId);
  await moodlePage.waitForCourseContent();

  const sectionNames = page.locator('.sectionname');
  await expect(sectionNames.filter({ hasText: uniqueName })).toHaveCount(1, { timeout: 10_000 });

  await mcp.callTool('moodle_move_section', {
    courseid: config.courseId,
    sectionnum: moved.sectionnum,
    targetsectionnum: sourceNum,
  });
});
