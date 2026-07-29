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
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'folder-e2e-'));
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

test('moodle_create_folder + upload_folder_file: Ordner auf Kursseite sichtbar, Datei darin erreichbar', async ({ page }) => {
  test.skip(!hasBrowserCredentials, 'MOODLE_USERNAME/MOODLE_PASSWORD fehlen in .env.e2e');

  const stamp = Date.now();
  const folderName = `E2E-Verzeichnis ${stamp}`;
  const fileName = `e2e-dokument-${stamp}.txt`;
  const filePath = writeTempFile(fileName, 'E2E-Testdatei fuer mod_folder');

  const created = await mcp.callTool('moodle_create_folder', {
    courseid: config.courseId,
    sectionnum: TEST_SECTIONNUM,
    name: folderName,
  });

  expect(created.cmid).toBeGreaterThan(0);

  const uploaded = await mcp.callTool('moodle_upload_folder_file', {
    cmid: created.cmid,
    filepath: filePath,
  });

  expect(uploaded.fileid).toBeGreaterThan(0);
  expect(uploaded.files).toContain(`/${fileName}`);

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

  const folderLink = moduleItem.locator('a.aalink').first();
  await expect(folderLink).toBeVisible();
  await expect(folderLink).toBeEnabled();
  await expect(folderLink).toHaveAttribute('href', /mod\/folder\/view\.php/);

  await folderLink.click();
  await page.waitForURL(/mod\/folder\/view\.php/, { timeout: 15_000 });

  const fileEntry = page.locator('a[href*="pluginfile.php"]', { hasText: fileName }).first();
  await expect(fileEntry).toBeVisible({ timeout: 10_000 });
  await expect(fileEntry).toHaveAttribute('href', /pluginfile\.php\/\d+\/mod_folder\/content\//);
});
