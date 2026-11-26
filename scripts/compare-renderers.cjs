// Optional spike tool. See DESIGN011 for the two preview URLs and Playwright setup.
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
        version: 1,
        balls: Array.from({ length: 50 }, (_, index) => types[index % types.length]),
        timestamp: Date.now(),
      }));
    });
    await page.goto(url);
    await page.locator('[aria-label="50 of 50 balls"]').waitFor();
    await page.locator('.game-canvas canvas').waitFor();
    await page.waitForTimeout(1500);
    return await page.evaluate(async () => {
      const canvas = document.querySelector('.game-canvas canvas');
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
        cssPixels: [bounds.width, bounds.height],
        meanMs: deltas.reduce((sum, delta) => sum + delta, 0) / deltas.length,
        medianMs: deltas[179],
        p95Ms: deltas[341],
        bricksBroken: document.querySelector('.stat-bricks .stat-value').textContent,
      };
    });
  } finally {
    await context.close();
  }
}

async function main() {
  const urls = process.argv.slice(2);
  if (!urls.length) throw new Error('Supply the preview URLs in measurement order.');
  const browser = await chromium.launch({ channel: 'chrome' });
  try {
    console.log(await browser.version());
    for (const url of urls) console.log(url, await measure(browser, url));
  } finally {
    await browser.close();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
