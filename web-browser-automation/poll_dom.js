import { chromium } from 'playwright';
import fs from 'fs';

(async () => {
  console.log('Waiting for browser on port 9222...');
  
  while (true) {
    try {
      const browser = await chromium.connectOverCDP('http://localhost:9222');
      const contexts = browser.contexts();
      if (contexts.length > 0) {
        const pages = contexts[0].pages();
        for (const page of pages) {
          const url = page.url();
          if (url.includes('youtube.com')) {
            const html = await page.content();
            fs.writeFileSync('youtube_dump.html', html);
            console.log(`[${new Date().toLocaleTimeString()}] DOM saved to youtube_dump.html (URL: ${url})`);
          }
        }
      }
      await browser.close();
    } catch (e) {
      // Ignore connection errors and retry
    }
    await new Promise(r => setTimeout(r, 1000));
  }
})();
