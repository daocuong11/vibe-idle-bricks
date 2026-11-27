// Optional spike tool. See DESIGN017 for preview URLs and Playwright setup.
const { chromium } = require('playwright');

async function measure(browser, url) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    deviceScaleFactor: 2,
  });
  try {
    const page = await context.newPage();
    await page.addInitScript(() => {
      const types = ['basic', 'fast', 'heavy', 'plasma', 'explosive', 'sniper'];
      localStorage.setItem('idleBricksSave', JSON.stringify({
        version: 6,
        balls: Array.from({ length: 50 }, (_, index) => types[index % types.length]),
        timestamp: Date.now(),
      }));
    });
    await page.goto(url);
    await page.locator('.stat-balls .stat-value').waitFor();
    await page.locator('.game-canvas canvas[role="img"]').waitFor();
    await page.waitForTimeout(2000);
    return await page.evaluate(async () => {
      const canvas = document.querySelector('.game-canvas canvas[role="img"]');
      const bounds = canvas.getBoundingClientRect();
      const deltas = [];
      let previous;
      await new Promise(resolve => {
        function sample(now) {
          if (previous !== undefined) deltas.push(now - previous);
          previous = now;
          if (deltas.length === 360) resolve();
          else requestAnimationFrame(sample);
        }
        requestAnimationFrame(sample);
      });
      deltas.sort((a, b) => a - b);
      return {
        backingPixels: [canvas.width, canvas.height],
        cssPixels: [Math.round(bounds.width), Math.round(bounds.height)],
        meanMs: +(deltas.reduce((sum, delta) => sum + delta, 0) / deltas.length).toFixed(2),
        medianMs: +deltas[179].toFixed(2),
        p95Ms: +deltas[341].toFixed(2),
        bricksBroken: document.querySelector('.stat-bricks .stat-value').textContent,
        balls: document.querySelector('.stat-balls .stat-value').textContent,
      };
    });
  } finally {
    await context.close();
  }
}

async function main() {
  const urls = process.argv.slice(2);
  if (!urls.length) throw new Error('Supply preview URLs in measurement order.');
  const browser = await chromium.launch({ channel: 'chrome' });
  try {
    console.log(await browser.version());
    for (const url of urls) console.log(url, JSON.stringify(await measure(browser, url)));
  } finally {
    await browser.close();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
