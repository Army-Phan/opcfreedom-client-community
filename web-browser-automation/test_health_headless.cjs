const { chromium } = require('playwright');
const path = require('path');

const profilePath = path.join(__dirname, 'data/states/gemini_chrome_profile');

(async () => {
  const context = await chromium.launchPersistentContext(profilePath, {
    headless: true,
    channel: 'chrome',
    args: ['--disable-blink-features=AutomationControlled']
  });
  const page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();
  await page.goto('https://gemini.google.com/app', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000); 
  
  const hasEditableInput = await page.locator('[contenteditable="true"], rich-textarea, textarea, div.ql-editor').filter({ visible: true }).count() > 0;
  const pageTitle = await page.title();
  const pageUrl = page.url();

  console.log({ hasEditableInput, pageTitle, pageUrl });
  
  await context.close();
})();
