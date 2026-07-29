'use strict';

const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { startSetupBrowserServer, launchSetupBrowserServer } = require('../../lib/setup-browser-server');

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
    await expect(page.locator('#service-stopped-overlay')).toBeVisible();
    await expect(page.locator('#service-stopped-overlay')).toContainText('Sie können diesen Tab schließen.');
    await expect(page.locator('main')).toHaveJSProperty('inert', true);
    await page.clock.fastForward(8000);
    await expect(page.locator('#server-gone-banner')).toBeHidden();
  });
});

test.describe('maintenance card layout', () => {
  test('closed cards have equal heights and opening a card only moves the card below it', async ({ page }) => {
    await page.goto(baseURL);

    const closedHeights = await page.locator('.card').evaluateAll(cards => cards.map(card => card.getBoundingClientRect().height));
    expect(new Set(closedHeights).size).toBe(1);

    const before = await page.evaluate(() => ({
      activities: document.querySelector('[data-card-id="activities"]').getBoundingClientRect().top,
      crop: document.querySelector('[data-card-id="crop-backend"]').getBoundingClientRect().top,
      version: document.querySelector('[data-card-id="version"]').getBoundingClientRect().top,
    }));
    await page.locator('.card-edit[data-card-id="workspace"]').click();
    const after = await page.evaluate(() => ({
      activities: document.querySelector('[data-card-id="activities"]').getBoundingClientRect().top,
      crop: document.querySelector('[data-card-id="crop-backend"]').getBoundingClientRect().top,
      version: document.querySelector('[data-card-id="version"]').getBoundingClientRect().top,
    }));
    expect(after.activities).toBe(before.activities);
    expect(after.version).toBe(before.version);
    expect(after.crop).toBeGreaterThan(before.crop);
  });

  test('column actions move with their own column; other columns flow around the wide-opened card (#235)', async ({ page }) => {
    await page.goto(baseURL);
    const before = await page.evaluate(() => ({
      abort: document.getElementById('abort-button').getBoundingClientRect().top,
      restart: document.getElementById('restart-setup-button').getBoundingClientRect().top,
    }));
    await page.locator('.card-edit[data-card-id="activities"]').click();
    const after = await page.evaluate(() => {
      const restart = document.getElementById('restart-setup-button').getBoundingClientRect();
      return {
        abort: document.getElementById('abort-button').getBoundingClientRect().top,
        restart: restart.top,
        restartVisible: restart.height > 0,
      };
    });
    expect(after.abort).toBeGreaterThan(before.abort);
    // Die Drittspalte fliesst um die breit geöffnete Card in die zweite Zeile,
    // bleibt dabei aber vollständig sichtbar (Spec 0007, #235).
    expect(after.restart).toBeGreaterThan(before.restart);
    expect(after.restartVisible).toBe(true);
  });

  test('wide card spans two grid columns with two text columns; every card stays visible (#235)', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(baseURL);
    const closedCol1 = await page.locator('.card-column').first().boundingBox();

    await page.locator('.card-edit[data-card-id="activities"]').click();
    await expect(page.locator('.card-edit[data-card-id="activities"]')).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('.card-column').first()).toHaveCSS('grid-column', 'span 2');

    const layout = await page.evaluate(() => {
      const rect = el => el.getBoundingClientRect();
      const col1 = rect(document.querySelector('.card-column:nth-of-type(1)'));
      const col2 = rect(document.querySelector('.card-column:nth-of-type(2)'));
      const detail = document.querySelector('[data-card-detail="activities"]');
      return {
        col1: { w: col1.width, bottom: col1.bottom },
        col2w: col2.width,
        columnCount: getComputedStyle(detail).columnCount,
        textColumnLefts: [...new Set([...detail.children].map(c => Math.round(rect(c).left)))],
        cards: [...document.querySelectorAll('.card')].map(c => ({ w: rect(c).width, h: rect(c).height })),
        overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      };
    });
    expect(layout.col1.w).toBeGreaterThan(closedCol1.width * 1.5);
    expect(layout.col1.w).toBeLessThan(layout.col2w * 2.5);
    expect(layout.columnCount).toBe('2');
    expect(layout.textColumnLefts.length).toBe(2);
    for (const card of layout.cards) {
      expect(card.w).toBeGreaterThan(0);
      expect(card.h).toBeGreaterThan(0);
    }
    expect(layout.overflow).toBe(false);
  });

  test('wide card stays single-column in a narrow window (#235)', async ({ page }) => {
    await page.setViewportSize({ width: 900, height: 1024 });
    await page.goto(baseURL);
    await page.locator('.card-edit[data-card-id="activities"]').click();
    await expect(page.locator('.card-column').first()).toHaveCSS('grid-column', 'span 1');
    const layout = await page.evaluate(() => {
      const detail = document.querySelector('[data-card-detail="activities"]');
      return {
        columnCount: getComputedStyle(detail).columnCount,
        display: getComputedStyle(detail).display,
        textColumnLefts: [...new Set([...detail.children].map(c => Math.round(c.getBoundingClientRect().left)))],
      };
    });
    expect(layout.columnCount).toBe('1');
    expect(layout.display).toBe('grid');
    expect(layout.textColumnLefts.length).toBe(1);
  });

  test('tablet does not wrap three independent columns into a 2+1 grid', async ({ page }) => {
    await page.setViewportSize({ width: 900, height: 1024 });
    await page.goto(baseURL);
    const leftEdges = await page.locator('.card-column').evaluateAll(columns => (
      columns.map(column => column.getBoundingClientRect().left)
    ));
    expect(new Set(leftEdges).size).toBe(1);
  });

  test('activity choices stay in one row and version actions stay in the card header', async ({ page }) => {
    await page.goto(baseURL);
    await page.locator('.card-edit[data-card-id="activities"]').click();

    const activityChoice = page.locator('[data-card-detail="activities"] .checkbox-choice').first();
    await expect(activityChoice.locator('.activity-icon')).toBeVisible();
    await expect(activityChoice.locator('span')).toHaveText('Textseite');
    await expect(activityChoice).toHaveCSS('display', 'flex');
    await expect(page.locator('.card-column').first()).toHaveCSS('display', 'grid');
    await expect(page.locator('[data-card-id="version"] .card-header .version-check-button')).toHaveText('erneut prüfen');
    await expect(page.locator('.version-check-button')).toHaveClass(/btn-tertiary/);
  });

  test('version status is shown once in the summary', async ({ page }) => {
    await page.goto(baseURL);
    await expect(page.locator('[data-card-summary="version"]')).toContainText('Aktuelle Version:');
    await expect(page.locator('.version-result')).toBeHidden();
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

test('reopening the app replaces the existing service with a fresh page', async () => {
  const runtimeStatePath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'kurspilot-tab-close-e2e-')), 'setup-server.json');
  const tool = await startSetupBrowserServer({
    openBrowser: () => {},
    runtimeStatePath,
    idleTimeoutMs: 0,
    firstRequestTimeoutMs: 0,
    statusOptions: statusOptions(),
  });

  const openedUrls = [];
  const relaunched = await launchSetupBrowserServer({
    runtimeStatePath,
    openBrowser: url => openedUrls.push(url),
    statusOptions: statusOptions(),
  });
  try {
    expect(relaunched.reused).toBe(false);
    expect(relaunched.url).not.toBe(tool.url);
    expect(openedUrls).toEqual([relaunched.url]);
    await tool.closed;
  } finally {
    await relaunched.close();
  }
});

test.describe('version card focus management', () => {
  test('auto-check on load does not leave focus on version card', async ({ page }) => {
    await page.goto(baseURL);
    await expect(page.locator('[data-card-summary="version"]')).not.toHaveText('–');
    const focused = await page.evaluate(() => document.activeElement?.tagName);
    // auto-check must NOT steal focus (body or html is fine)
    expect(['BODY', 'HTML', null].includes(focused) || focused === undefined).toBeTruthy();
    // card must not be is-open after auto-check finishes
    await expect(page.locator('[data-card-id="version"]')).not.toHaveClass(/is-open/);
  });

  test('erneut prüfen: card gets is-open and focus after check', async ({ page }) => {
    await page.goto(baseURL);
    await expect(page.locator('[data-card-summary="version"]')).not.toHaveText('–');
    const btn = page.locator('.version-check-button');
    await btn.click();
    await expect(btn).not.toBeDisabled();
    // is-open stays after user-triggered check (matches other card behaviour)
    await expect(page.locator('[data-card-id="version"]')).toHaveClass(/is-open/);
    // focus on card article
    const focused = await page.evaluate(() => document.activeElement?.getAttribute('data-card-id'));
    expect(focused).toBe('version');
  });

  test('Installieren: closes other cards, is-open during install, focus on card after', async ({ page }) => {
    const updateServer = await startSetupBrowserServer({
      openBrowser: () => {},
      idleTimeoutMs: 0,
      firstRequestTimeoutMs: 0,
      statusOptions: statusOptions(),
      updateOptions: {
        checkAppUpdate: async () => ({ updateAvailable: true, versionCurrent: '0.0.1', versionNew: '9.9.9' }),
        checkImageMagickUpdate: async () => ({ supported: false }),
        applyAppUpdate: async () => ({ ok: true }),
      },
    });
    try {
      await page.goto(updateServer.url);
      await page.locator('.card-edit[data-card-id="moodle"]').click();
      await expect(page.locator('.card[data-card-id="moodle"]')).toHaveClass(/is-open/);
      await expect(page.locator('.version-check-button')).toHaveText('Installieren');
      await page.locator('.version-check-button').click();
      // other cards closed immediately
      await expect(page.locator('.card[data-card-id="moodle"]')).not.toHaveClass(/is-open/);
      // wait for install + re-check to finish
      await expect(page.locator('.version-check-button')).not.toBeDisabled();
      // focus lands on version card article
      const focused = await page.evaluate(() => document.activeElement?.getAttribute('data-card-id'));
      expect(focused).toBe('version');
    } finally {
      await updateServer.close();
    }
  });
});
