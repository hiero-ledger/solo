// SPDX-License-Identifier: Apache-2.0

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as puppeteer from 'puppeteer';

async function main() {
  const argv = process.argv.slice(2);
  const url = argv[0] || 'http://localhost:8000';
  const out = argv[1] || 'screenshots/screenshot.png';
  const width = Number.parseInt(process.env.SCREENSHOT_WIDTH || '1200', 10);
  // allow automatic height calculation by setting SCREENSHOT_HEIGHT=auto
  const heightEnvironment = process.env.SCREENSHOT_HEIGHT || 'auto';
  const autoHeight = String(heightEnvironment).toLowerCase() === 'auto';
  let height = autoHeight ? 800 : Number.parseInt(heightEnvironment, 10);
  if (!autoHeight && (!Number.isFinite(height) || height <= 0)) {
    height = 800;
  }
  const fullPage = (process.env.SCREENSHOT_FULL || 'false').toLowerCase() === 'true';
  const waitMs = Number.parseInt(process.env.SCREENSHOT_WAIT_MS || '500', 10);

  try {
    // ensure output directory exists
    fs.mkdirSync(path.dirname(out), {recursive: true});

    const browser = await puppeteer.launch({
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const page = await browser.newPage();
    await page.setViewport({width, height});

    console.log(`Navigating to ${url} ...`);
    await page.goto(url, {waitUntil: 'networkidle2', timeout: 30_000});

    // small wait to allow any client-side rendering to finish
    if (waitMs > 0) {
      await new Promise(resolve => setTimeout(resolve, waitMs));
    }

    // if automatic height requested, compute page content height and adjust viewport
    if (autoHeight) {
      try {
        const contentHeight = await page.evaluate(() =>
          Math.max(
            document.documentElement.scrollHeight || 0,
            document.body.scrollHeight || 0,
            document.documentElement.clientHeight || 0,
          ),
        );
        const maxHeight = Number.parseInt(process.env.SCREENSHOT_MAX_HEIGHT || '16000', 10) || 16_000;
        const finalHeight = Math.min(contentHeight || height, maxHeight);
        // set viewport to computed height so screenshot captures the desired area
        await page.setViewport({width, height: finalHeight});
        console.log(`Auto-calculated height=${finalHeight} (contentHeight=${contentHeight}, max=${maxHeight})`);
      } catch (error) {
        console.warn('Failed to auto-calculate height, using fallback height=', height, error);
      }
    }

    console.log(`Capturing screenshot to ${out} (fullPage=${fullPage})`);
    await page.screenshot({path: out, fullPage});

    await browser.close();
    console.log('Screenshot saved.');
  } catch (error) {
    console.error('Failed to capture screenshot:', error);
    throw error;
  }
}

// eslint-disable-next-line unicorn/prefer-top-level-await
main().then(r => console.log('Done'));
