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

test('moodle_create_choice: Abstimmung auf Kursseite sichtbar, Optionen als Radio erkennbar', async ({ page }) => {
  test.skip(!hasBrowserCredentials, 'MOODLE_USERNAME/MOODLE_PASSWORD fehlen in .env.e2e');

  const stamp = Date.now();
  const choiceName = `E2E-Abstimmung ${stamp}`;
  const options = [`E2E-Option A ${stamp}`, `E2E-Option B ${stamp}`, `E2E-Option C ${stamp}`];

  const created = await mcp.callTool('moodle_create_choice', {
    courseid: config.courseId,
    sectionnum: TEST_SECTIONNUM,
    name: choiceName,
    intro: 'E2E-Test mod_choice',
    options,
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

  const choiceLink = moduleItem.locator('a.aalink').first();
  await expect(choiceLink).toBeVisible();
  await expect(choiceLink).toBeEnabled();
  await expect(choiceLink).toHaveAttribute('href', /mod\/choice\/view\.php/);

  await choiceLink.click();
  await page.waitForURL(/mod\/choice\/view\.php/, { timeout: 15_000 });

  const radios = page.locator('input[type="radio"][name="answer"]');
  await expect(radios.first()).toBeVisible({ timeout: 10_000 });
  await expect(radios).toHaveCount(options.length);

  for (const optionText of options) {
    await expect(page.getByText(optionText).first()).toBeVisible();
  }
});
