'use strict';

const { test, expect } = require('@playwright/test');
const { startSetupBrowserServer } = require('../../lib/setup-browser-server');

const VIEWPORTS = [
  { name: 'mobile', width: 375, height: 812 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1440, height: 900 },
];

function statusOptions() {
  return {
    detectClients: () => ({ codex: true, claude: true, opencode: false }),
    readCredentials: () => ({ url: 'https://moodle.example.test', token: 'test-token' }),
    readWorkspaceSetting: () => ({
      ok: true,
      status: 'configured',
      contextRoot: '/Users/test/Kurspilot',
    }),
    getClientSetupStatus: () => ({ codex: { needsRepair: false }, claude: { needsRepair: false } }),
    platform: 'darwin',
    isImageMagickAvailable: () => false,
    isSipsAvailable: () => true,
  };
}

let server;
let baseURL;

test.beforeAll(async () => {
  server = await startSetupBrowserServer({
    openBrowser: () => {},
    idleTimeoutMs: 0,
    firstRequestTimeoutMs: 0,
    statusOptions: statusOptions(),
    updateOptions: {
      checkAppUpdate: async () => ({ updateAvailable: false, versionCurrent: '1.0.0' }),
      checkImageMagickUpdate: async () => ({ supported: false }),
    },
  });
  baseURL = server.url;
});

test.afterAll(async () => {
  if (server) await server.close();
});

for (const vp of VIEWPORTS) {
  test.describe(`viewport ${vp.width}px (${vp.name})`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    test('renders maintenance page with header, cards, and footer', async ({ page }) => {
      await page.goto(baseURL);
      await expect(page.locator('h1')).toHaveText('Kurspilot');
      await expect(page.locator('.status-line')).toContainText('Alles läuft');
      await expect(page.locator('.card-grid')).toBeVisible();
      await expect(page.locator('article[data-card-id="moodle"]')).toBeVisible();
      await expect(page.locator('article[data-card-id="workspace"]')).toBeVisible();
      await expect(page.locator('article[data-card-id="clients"]')).toBeVisible();
      await expect(page.locator('article[data-card-id="activities"]')).toBeVisible();
      await expect(page.locator('#abort-button')).toBeVisible();
      await expect(page.locator('#restart-setup-button')).toBeVisible();
    });

    test('MCP activities inline summary shows count and names', async ({ page }) => {
      await page.goto(baseURL);
      const summary = page.locator('[data-card-summary="activities"]');
      await expect(summary).toContainText('Aktivitäten:');
      await expect(summary).toContainText('·');
    });

    test('card grid has no horizontal overflow', async ({ page }) => {
      await page.goto(baseURL);
      const overflow = await page.evaluate(() => {
        return document.documentElement.scrollWidth > document.documentElement.clientWidth;
      });
      expect(overflow).toBe(false);
    });
  });
}

test.describe('light and dark mode', () => {
  test('light mode uses light surface token', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto(baseURL);
    const bg = await page.evaluate(() => {
      return getComputedStyle(document.body).backgroundColor;
    });
    expect(bg).toBe('rgb(247, 249, 251)');
  });

  test('dark mode uses dark surface token', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto(baseURL);
    const bg = await page.evaluate(() => {
      return getComputedStyle(document.body).backgroundColor;
    });
    expect(bg).toBe('rgb(18, 22, 27)');
  });

  test('dark mode text is light-colored', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto(baseURL);
    const color = await page.evaluate(() => {
      return getComputedStyle(document.body).color;
    });
    expect(color).toBe('rgb(232, 237, 242)');
  });
});

test.describe('card open state and focus management', () => {
  test('cards start closed with aria-expanded=false', async ({ page }) => {
    await page.goto(baseURL);
    const triggers = page.locator('.card-edit');
    const count = await triggers.count();
    expect(count).toBeGreaterThan(0);
    for (let i = 0; i < count; i++) {
      await expect(triggers.nth(i)).toHaveAttribute('aria-expanded', 'false');
    }
  });

  test('clicking edit opens card with is-open class and aria-expanded=true', async ({ page }) => {
    await page.goto(baseURL);
    const trigger = page.locator('.card-edit[data-card-id="moodle"]');
    await trigger.click();
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('.card[data-card-id="moodle"]')).toHaveClass(/is-open/);
    await expect(page.locator('[data-card-detail="moodle"]')).toBeVisible();
  });

  test('opening one card closes others', async ({ page }) => {
    await page.goto(baseURL);
    await page.locator('.card-edit[data-card-id="moodle"]').click();
    await expect(page.locator('.card[data-card-id="moodle"]')).toHaveClass(/is-open/);

    await page.locator('.card-edit[data-card-id="workspace"]').click();
    await expect(page.locator('.card[data-card-id="workspace"]')).toHaveClass(/is-open/);
    await expect(page.locator('.card[data-card-id="moodle"]')).not.toHaveClass(/is-open/);
  });

  test('focus moves to first field on open', async ({ page }) => {
    await page.goto(baseURL);
    await page.locator('.card-edit[data-card-id="moodle"]').click();
    const focused = await page.evaluate(() => {
      const el = document.activeElement;
      return el ? el.tagName + '[name=' + (el.name || '') + ']' : null;
    });
    expect(focused).toContain('INPUT');
  });

  test('closing card returns focus to trigger', async ({ page }) => {
    await page.goto(baseURL);
    const trigger = page.locator('.card-edit[data-card-id="moodle"]');
    await trigger.click();
    await expect(page.locator('[data-card-detail="moodle"]')).toBeVisible();
    await trigger.click();
    await expect(page.locator('[data-card-detail="moodle"]')).toBeHidden();
    const focused = await page.evaluate(() => {
      const el = document.activeElement;
      return el ? el.className : null;
    });
    expect(focused).toContain('card-edit');
  });
});

test.describe('button states', () => {
  test('buttons have minimum 44px height', async ({ page }) => {
    await page.goto(baseURL);
    const abortButton = page.locator('#abort-button');
    const box = await abortButton.boundingBox();
    expect(box.height).toBeGreaterThanOrEqual(44);
  });

  test('disabled button has reduced opacity', async ({ page }) => {
    await page.goto(baseURL);
    const opacity = await page.evaluate(() => {
      const btn = document.createElement('button');
      btn.className = 'btn-primary';
      btn.disabled = true;
      document.body.appendChild(btn);
      const style = getComputedStyle(btn);
      const result = style.opacity;
      btn.remove();
      return result;
    });
    expect(opacity).toBe('0.55');
  });

  test('focus-visible outline is present on buttons', async ({ page }) => {
    await page.goto(baseURL);
    await page.locator('#abort-button').focus();
    const outline = await page.evaluate(() => {
      const btn = document.getElementById('abort-button');
      btn.focus();
      return getComputedStyle(btn).outlineStyle;
    });
    expect(outline).not.toBe('none');
  });

  test('tertiary actions are bordered buttons without underlining', async ({ page }) => {
    await page.goto(baseURL);
    const style = await page.locator('.card-edit').first().evaluate(button => {
      const computed = getComputedStyle(button);
      return { borderStyle: computed.borderStyle, textDecoration: computed.textDecorationLine };
    });
    expect(style.borderStyle).toBe('solid');
    expect(style.textDecoration).toBe('none');
  });

  test('intentional shutdown keeps the shutdown message instead of showing a restart warning', async ({ page }) => {
    await page.clock.install();
    await page.goto(baseURL);
    await page.route('**/abort?token=*', route => route.fulfill({ status: 200 }));
    await page.route('**/health', route => route.fulfill({ status: 503 }));

    await page.locator('#abort-button').click();
    await expect(page.locator('#abort-status')).toHaveText('Dienst beendet. Sie können diesen Tab schließen.');
    await page.clock.fastForward(8000);
    await expect(page.locator('#server-gone-banner')).toBeHidden();
  });
});

test.describe('keyboard navigation', () => {
  test('Tab moves focus between interactive elements', async ({ page }) => {
    await page.goto(baseURL);
    await page.keyboard.press('Tab');
    const first = await page.evaluate(() => document.activeElement?.tagName);
    expect(first).toBeTruthy();
    await page.keyboard.press('Tab');
    const second = await page.evaluate(() => document.activeElement?.tagName);
    expect(second).toBeTruthy();
  });

  test('Enter/Space activates card edit button', async ({ page }) => {
    await page.goto(baseURL);
    const trigger = page.locator('.card-edit[data-card-id="moodle"]');
    await trigger.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('[data-card-detail="moodle"]')).toBeVisible();
  });

  test('card edit buttons are reachable via Tab', async ({ page }) => {
    await page.goto(baseURL);
    let found = false;
    for (let i = 0; i < 30; i++) {
      await page.keyboard.press('Tab');
      const cls = await page.evaluate(() => document.activeElement?.className || '');
      if (cls.includes('card-edit')) {
        found = true;
        break;
      }
    }
    expect(found).toBe(true);
  });
});
