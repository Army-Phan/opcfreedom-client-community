import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';

async function findUploadBtn() {
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

    const buttons = await page.locator('button').all();
    console.log(`Found ${buttons.length} buttons`);
    for (let i = 0; i < buttons.length; i++) {
        const ariaLabel = await buttons[i].getAttribute('aria-label');
        const className = await buttons[i].getAttribute('class');
        // Only log buttons that might be the plus icon (usually they don't have text inside)
        const text = await buttons[i].textContent();
        if (ariaLabel && !text.trim() && (ariaLabel.toLowerCase().includes('tải') || ariaLabel.toLowerCase().includes('ảnh') || ariaLabel.toLowerCase().includes('hình') || ariaLabel.toLowerCase().includes('thêm') || ariaLabel.toLowerCase().includes('upload') || ariaLabel.toLowerCase().includes('add') || ariaLabel.toLowerCase().includes('đính') || ariaLabel.toLowerCase().includes('attach'))) {
            console.log(`Button ${i}: aria-label="${ariaLabel}", class="${className}"`);
        }
    }

    await context.close();
}

findUploadBtn().catch(console.error);
