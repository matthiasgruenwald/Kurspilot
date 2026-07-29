'use strict';

const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { config, isConfigured, hasBrowserCredentials } = require('./helpers/env');
const { McpFixture } = require('./helpers/mcp-fixture');
const { MoodlePage } = require('./helpers/moodle-page');

test.skip(!isConfigured, '.env.e2e fehlt oder unvollstaendig');

const TEST_SECTIONNUM = 1;

let mcp;
let tmpDir;

test.beforeAll(async () => {
  mcp = new McpFixture(config.moodleUrl, config.moodleToken);
  await mcp.start();
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'resource-e2e-'));
});

test.afterAll(async () => {
  if (mcp) mcp.stop();
  if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
});

function writeTempFile(name, body) {
  const filePath = path.join(tmpDir, name);
  fs.writeFileSync(filePath, body, 'utf8');
  return filePath;
}

test('moodle_create_resource legt Datei-Ressource an und sie ist auf der Kursseite sichtbar', async ({ page }) => {
  test.skip(!hasBrowserCredentials, 'MOODLE_USERNAME/MOODLE_PASSWORD fehlen in .env.e2e');

  const stamp = Date.now();
  const resourceName = `E2E-Datei ${stamp}`;
  const filePath = writeTempFile(`arbeitsblatt-${stamp}.txt`, 'E2E-Testdatei fuer mod_resource');

  const created = await mcp.callTool('moodle_create_resource', {
    courseid: config.courseId,
    sectionnum: TEST_SECTIONNUM,
    name: resourceName,
    filepath: filePath,
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

  const resourceLink = moduleItem.locator('a.aalink').first();
  await expect(resourceLink).toBeVisible();
  await expect(resourceLink).toBeEnabled();
  await expect(resourceLink).toHaveAttribute('href', /mod\/resource\/view\.php/);
});
