const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const profilePath = path.join(__dirname, 'data/states/gemini_chrome_profile');

(async () => {
  const context = await chromium.launchPersistentContext(profilePath, {
    headless: false,
    channel: 'chrome',
    args: ['--disable-blink-features=AutomationControlled']
  });
  const page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();
  console.log('Navigating to Gemini...');
  await page.goto('https://gemini.google.com/app', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(10000); 
  
  const editables = await page.evaluate(() => {
    const nodes = document.querySelectorAll('[contenteditable="true"], textarea, rich-textarea, input, [role="textbox"], .text-input-field');
    return Array.from(nodes).map(n => ({
      tagName: n.tagName,
      id: n.id,
      className: n.className,
      role: n.getAttribute('role'),
      visible: n.getBoundingClientRect().width > 0,
    }));
  });
  console.log('Editable nodes found:', editables);
  
  await context.close();
})();
