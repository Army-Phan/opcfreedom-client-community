import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

async function run() {
  console.log("Launching browser...");
  const context = await chromium.launchPersistentContext(path.resolve('data/states/gemini_chrome_profile'), {
    headless: true,
    channel: 'chrome'
  });

  const page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();
  
  try {
    console.log("Navigating to Gemini...");
    await page.goto('https://gemini.google.com/app', { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(5000);

    console.log("Dumping elements...");
    const elements = await page.evaluate(() => {
      const all = document.querySelectorAll('*');
      const found = [];
      for (const el of all) {
        if (el.tagName === 'SCRIPT' || el.tagName === 'STYLE') continue;
        const text = el.innerText || '';
        const aria = el.getAttribute('aria-label') || '';
        const title = el.getAttribute('title') || '';
        if (text.toLowerCase().includes('tempor') || text.toLowerCase().includes('tạm thời') || text.toLowerCase().includes('nháp') ||
            aria.toLowerCase().includes('tempor') || aria.toLowerCase().includes('tạm thời') || aria.toLowerCase().includes('nháp') ||
            title.toLowerCase().includes('tempor') || title.toLowerCase().includes('tạm thời') || title.toLowerCase().includes('nháp')) {
          found.push({
            tag: el.tagName,
            class: el.className,
            ariaLabel: aria,
            title: title,
            text: text.slice(0, 50).replace(/\n/g, ' '),
            html: el.outerHTML.slice(0, 150)
          });
        }
      }
      return found;
    });
    
    fs.writeFileSync('C:/Users/Admin/.gemini/antigravity/brain/e7a9cbb7-fbd9-4702-b240-dd97e54aecd8/scratch/gemini_temp_elements.json', JSON.stringify(elements, null, 2));
    console.log("Dumped to gemini_temp_elements.json");
    
  } catch (err) {
    console.error(err);
  } finally {
    await context.close();
  }
}

run();
