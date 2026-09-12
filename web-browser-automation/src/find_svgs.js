import { chromium } from 'playwright';
import fs from 'fs';

async function findSVGs() {
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
    for (let i = 0; i < buttons.length; i++) {
        const ariaLabel = await buttons[i].getAttribute('aria-label');
        if (ariaLabel && (ariaLabel.toLowerCase().includes('nội dung tải lên') || ariaLabel.toLowerCase().includes('upload') || ariaLabel.toLowerCase().includes('gửi') || ariaLabel.toLowerCase().includes('send'))) {
            const svgPath = await buttons[i].locator('svg path').first();
            if (await svgPath.count() > 0) {
                const d = await svgPath.getAttribute('d');
                console.log(`Button: ${ariaLabel} => SVG Path: ${d ? d.substring(0, 50) + '...' : 'null'}`);
            }
        }
    }
    await context.close();
}

findSVGs().catch(console.error);
