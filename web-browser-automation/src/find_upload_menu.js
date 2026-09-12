import { chromium } from 'playwright';
import path from 'path';

async function testUploadFlow() {
    const profilePath = 'd:\\AIWebsite\\opcfreedom\\web-browser-automation\\data\\states\\gemini_chrome_profile';
    const context = await chromium.launchPersistentContext(profilePath, {
        headless: false,
        channel: 'chrome',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await context.newPage();
    console.log("Navigating to Gemini...");
    await page.goto('https://gemini.google.com/app', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(5000); 

    const plusBtn = page.locator('button[aria-label*="Nội dung tải lên"], button[aria-label*="Upload content"], button[aria-label*="Tải hình ảnh"]').first();
    if (await plusBtn.count() > 0) {
        console.log("Found Plus button, clicking...");
        await plusBtn.click();
        await page.waitForTimeout(2000);

        // Check if file input is revealed
        const fileInput = page.locator('input[type="file"]').first();
        if (await fileInput.count() > 0) {
            console.log("input[type=file] is now in the DOM!");
        } else {
            console.log("input[type=file] STILL NOT in the DOM. Looking for menu items...");
            // Let's dump the menu items
            const menuItems = await page.locator('menu-item, li, [role="menuitem"]').all();
            for (let i = 0; i < menuItems.length; i++) {
                const text = await menuItems[i].textContent();
                const ariaLabel = await menuItems[i].getAttribute('aria-label');
                if (text.trim()) {
                    console.log(`Menu item ${i}: text="${text.trim()}", aria-label="${ariaLabel}"`);
                }
            }
        }
    } else {
        console.log("Plus button not found!");
    }

    await context.close();
}

testUploadFlow().catch(console.error);
