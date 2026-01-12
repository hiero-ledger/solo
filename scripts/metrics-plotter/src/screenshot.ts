import * as fs from 'fs';
import * as path from 'path';
import * as puppeteer from 'puppeteer';

async function main() {
  const argv = process.argv.slice(2);
  const url = argv[0] || 'http://localhost:8000';
  const out = argv[1] || 'screenshots/screenshot.png';
  const width = parseInt(process.env.SCREENSHOT_WIDTH || '1200', 10);
  // allow automatic height calculation by setting SCREENSHOT_HEIGHT=auto
  const heightEnv = process.env.SCREENSHOT_HEIGHT || 'auto';
  const autoHeight = String(heightEnv).toLowerCase() === 'auto';
  let height = autoHeight ? 800 : parseInt(heightEnv, 10);
  if (!autoHeight && (!isFinite(height) || height <= 0)) height = 800;
  const fullPage = (process.env.SCREENSHOT_FULL || 'false').toLowerCase() === 'true';
  const waitMs = parseInt(process.env.SCREENSHOT_WAIT_MS || '500', 10);

  try {
    // ensure output directory exists
    fs.mkdirSync(path.dirname(out), { recursive: true });

    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    await page.setViewport({ width, height });

    console.log(`Navigating to ${url} ...`);
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

    // small wait to allow any client-side rendering to finish
    if (waitMs > 0) await new Promise(resolve => setTimeout(resolve, waitMs));

    // if automatic height requested, compute page content height and adjust viewport
    if (autoHeight) {
      try {
        const contentHeight = await page.evaluate(() => Math.max(
          document.documentElement.scrollHeight || 0,
          document.body.scrollHeight || 0,
          document.documentElement.clientHeight || 0
        ));
        const maxHeight = parseInt(process.env.SCREENSHOT_MAX_HEIGHT || '16000', 10) || 16000;
        const finalHeight = Math.min(contentHeight || height, maxHeight);
        // set viewport to computed height so screenshot captures the desired area
        await page.setViewport({ width, height: finalHeight });
        console.log(`Auto-calculated height=${finalHeight} (contentHeight=${contentHeight}, max=${maxHeight})`);
      } catch (e) {
        console.warn('Failed to auto-calculate height, using fallback height=', height, e);
      }
    }

    console.log(`Capturing screenshot to ${out} (fullPage=${fullPage})`);
    await page.screenshot({ path: out, fullPage });

    await browser.close();
    console.log('Screenshot saved.');
    process.exit(0);
  } catch (err) {
    console.error('Failed to capture screenshot:', err);
    process.exit(2);
  }
}

main();
