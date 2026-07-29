'use strict';

const { test, expect } = require('@playwright/test');
const { config, isConfigured, hasBrowserCredentials } = require('./helpers/env');
const { McpFixture } = require('./helpers/mcp-fixture');
const { MoodlePage } = require('./helpers/moodle-page');

test.skip(!isConfigured, '.env.e2e fehlt oder unvollstaendig');

const TEST_SECTIONNUM = 1;

let mcp;

test.beforeAll(async () => {
  mcp = new McpFixture(config.moodleUrl, config.moodleToken);
  await mcp.start();
});

test.afterAll(async () => {
  if (mcp) mcp.stop();
});

test('moodle_create_forum: Forum auf Kursseite sichtbar, "Neues Thema"-Button erreichbar', async ({ page }) => {
  test.skip(!hasBrowserCredentials, 'MOODLE_USERNAME/MOODLE_PASSWORD fehlen in .env.e2e');

  const stamp = Date.now();
  const forumName = `E2E-Forum ${stamp}`;

  const created = await mcp.callTool('moodle_create_forum', {
    courseid: config.courseId,
    sectionnum: TEST_SECTIONNUM,
    name: forumName,
    intro: 'E2E-Test mod_forum',
    type: 'general',
  });

  expect(created.cmid).toBeGreaterThan(0);

  const moodlePage = new MoodlePage(page, config.moodleUrl, config);
  await moodlePage.login();
  await moodlePage.goToCourse(config.courseId);
  await moodlePage.waitForCourseContent();

  const moduleItem = page.locator(`#module-${created.cmid}`);
  const sectionItem = page.locator('.section-item', { has: moduleItem }).first();

  if (!(await moduleItem.isVisible())) {
    await sectionItem.locator('a[data-bs-toggle="collapse"]').first().click();
  }

  await expect(moduleItem).toBeVisible({ timeout: 10_000 });

  const forumLink = moduleItem.locator('a.aalink').first();
  await expect(forumLink).toBeVisible();
  await expect(forumLink).toBeEnabled();
  await expect(forumLink).toHaveAttribute('href', /mod\/forum\/view\.php/);

  await forumLink.click();
  await page.waitForURL(/mod\/forum\/view\.php/, { timeout: 15_000 });

  const newTopicButton = page.getByRole('link', { name: /Neues Thema hinzufügen|Add a new discussion topic/i });
  await expect(newTopicButton).toBeVisible({ timeout: 10_000 });
  await expect(newTopicButton).toBeEnabled();
});
