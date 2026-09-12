import { chromium } from 'playwright';
import fs from 'fs';

(async () => {
  try {
    const browser = await chromium.connectOverCDP('http://localhost:9222');
    const contexts = browser.contexts();
    if (contexts.length === 0) {
      console.log('No contexts found.');
      return;
    }
    const pages = contexts[0].pages();
    for (const page of pages) {
      const url = page.url();
      if (url.includes('youtube.com')) {
        console.log('Found YouTube page:', url);
        const html = await page.content();
        fs.writeFileSync('youtube_dump.html', html);
        console.log('DOM saved to youtube_dump.html');
      }
    }
    await browser.close();
  } catch (e) {
    console.error('Error:', e.message);
  }
})();
