import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function debugGemini() {
    const profilePath = 'd:\\AIWebsite\\opcfreedom\\web-browser-automation\\data\\states\\gemini_chrome_profile';
    console.log("Using profile at:", profilePath);
    
    const context = await chromium.launchPersistentContext(profilePath, {
        headless: false,
        channel: 'chrome',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await context.newPage();
    console.log("Navigating to Gemini...");
    await page.goto('https://gemini.google.com/app', { waitUntil: 'domcontentloaded', timeout: 30000 });
    
    await page.waitForTimeout(5000); // let UI settle
    await page.screenshot({ path: 'd:\\AIWebsite\\opcfreedom\\web-browser-automation\\debug_1_loaded.png' });
    console.log("Saved debug_1_loaded.png");

    console.log("Finding prompt input...");
    const promptInput = page.locator('[contenteditable="true"], rich-textarea, textarea').filter({ visible: true }).first();
    
    if (await promptInput.count() === 0) {
        console.log("Prompt input not found!");
        // let's try to dump outerHTML of body
        const bodyHtml = await page.evaluate(() => document.body.outerHTML);
        fs.writeFileSync('d:\\AIWebsite\\opcfreedom\\web-browser-automation\\debug_body.html', bodyHtml);
        console.log("Dumped body to debug_body.html");
    } else {
        const outerHtml = await promptInput.evaluate(el => el.outerHTML);
        fs.writeFileSync('d:\\AIWebsite\\opcfreedom\\web-browser-automation\\debug_prompt.html', outerHtml);
        console.log("Dumped prompt outerHTML to debug_prompt.html");
        console.log("Prompt input found. Attempting to click and type...");
        try {
            await promptInput.click({ timeout: 5000 });
            await page.waitForTimeout(500);
            await promptInput.fill("Hello Gemini, this is a test").catch(async (e) => {
                console.log("Fill failed, trying insertText...", e.message);
                await promptInput.click();
                await page.keyboard.insertText("Hello Gemini, this is a test");
            });
            await page.waitForTimeout(1000);
            await page.screenshot({ path: 'd:\\AIWebsite\\opcfreedom\\web-browser-automation\\debug_2_typed.png' });
            console.log("Saved debug_2_typed.png");
            
            // Try to find send button
            const sendButtonSelector = [
                'button.send-button:not([aria-label*="Stop"]):not([aria-label*="Dừng"]):not([aria-label*="stop"]):not([aria-label*="dừng"])',
                'button[aria-label="Send message"]',
                'button[aria-label="Gửi tin nhắn"]',
                'div.send-button-container button:not([aria-label*="Stop"]):not([aria-label*="Dừng"]):not([aria-label*="stop"]):not([aria-label*="dừng"])',
                'div.text-input-field-container button[aria-label*="message"]:not([aria-label*="Stop"]):not([aria-label*="Dừng"]):not([aria-label*="stop"]):not([aria-label*="dừng"])',
                'div.text-input-field-container button[aria-label*="tin nhắn"]:not([aria-label*="Stop"]):not([aria-label*="Dừng"]):not([aria-label*="stop"]):not([aria-label*="dừng"])',
                'div.text-input-field-container button.send-button-v2:not([aria-label*="Stop"]):not([aria-label*="Dừng"]):not([aria-label*="stop"]):not([aria-label*="dừng"])'
            ].join(', ');
            
            const sendButton = page.locator(sendButtonSelector).filter({ visible: true }).first();
            if (await sendButton.count() > 0) {
                console.log("Send button found! Clicking...");
                await sendButton.click();
                await page.waitForTimeout(2000);
                await page.screenshot({ path: 'd:\\AIWebsite\\opcfreedom\\web-browser-automation\\debug_3_sent.png' });
                console.log("Saved debug_3_sent.png");
            } else {
                console.log("Send button NOT found!");
                const allButtons = await page.locator('button').all();
                console.log(`Found ${allButtons.length} total buttons on page.`);
            }

        } catch (e) {
            console.error("Error typing:", e);
        }
    }
    
    await context.close();
}

debugGemini().catch(console.error);
