const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

(async () => {
  const profilePath = path.resolve('data/states/shared_omnichannel_profile');
  const context = await chromium.launchPersistentContext(profilePath, { headless: true, channel: 'chrome' });
  const page = await context.newPage();
  await page.goto('https://www.facebook.com');
  await page.waitForTimeout(5000);
  
  const menuBtn = page.locator('svg[aria-label="Your profile"]').first();
  if (await menuBtn.count() > 0) {
    await menuBtn.click();
    await page.waitForTimeout(2000);
    const seeAllBtn = page.locator('div[role="button"]:has-text("See all profiles")').first();
    if (await seeAllBtn.count() > 0) {
      await seeAllBtn.click();
      await page.waitForTimeout(3000);
      const dialog = page.locator('div[role="dialog"]').first();
      const html = await dialog.evaluate(el => el.innerHTML);
      fs.writeFileSync('dialog_html.txt', html);
      console.log("Dumped HTML to dialog_html.txt");
    } else {
      console.log("No see all profiles button found");
    }
  } else {
    console.log("No menu button found");
  }
  await context.close();
})();
