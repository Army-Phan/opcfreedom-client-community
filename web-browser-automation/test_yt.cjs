const { chromium } = require('playwright-extra');

(async () => {
  const activeProfileDir = require('path').resolve(__dirname, '../data/browser_profiles/shared_omnichannel_profile');
  const context = await chromium.launchPersistentContext(activeProfileDir, {
    headless: true,
    channel: 'chrome',
    viewport: { width: 1280, height: 720 },
    args: ['--window-size=1280,720']
  });
  
  const page = await context.newPage();
  console.log('Navigating to YouTube Studio...');
  await page.goto('https://studio.youtube.com', { waitUntil: 'networkidle' });
  await page.waitForTimeout(5000);
  console.log('URL after navigation:', page.url());
  
  console.log('Checking upload icon...');
  const iconHtml = await page.evaluate(() => {
    const icon = document.querySelector('ytcp-icon-button[aria-label="Upload videos"], button[aria-label="Upload videos"], #upload-icon');
    return icon ? icon.outerHTML : null;
  });
  console.log('Upload icon HTML:', iconHtml);
  
  const createBtnHtml = await page.evaluate(() => {
    const btn = document.querySelector('button[aria-label="Create"]');
    return btn ? btn.outerHTML : null;
  });
  console.log('Create button HTML:', createBtnHtml);

  await context.close();
})();
