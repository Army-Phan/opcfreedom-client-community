import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function testGeminiImage() {
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

    // Find file input and upload a dummy image
    console.log("Looking for file input...");
    let fileInput = page.locator('input[type="file"]').first();
    
    if (await fileInput.count() === 0) {
        console.log("Clicking upload button to reveal file input...");
        const uploadBtn = page.locator('button[aria-label*="Upload image"], button[aria-label*="Tải hình ảnh"]').first();
        if (await uploadBtn.count() > 0) {
            await uploadBtn.click();
            await page.waitForTimeout(1000);
            fileInput = page.locator('input[type="file"]').first();
        } else {
            console.log("Upload button not found!");
            // maybe it's a plus icon?
            const plusBtn = page.locator('button[aria-label*="Upload"], button[aria-label*="Tải"]').first();
            if (await plusBtn.count() > 0) {
                await plusBtn.click();
                await page.waitForTimeout(1000);
                fileInput = page.locator('input[type="file"]').first();
            }
        }
    }

    const dummyImgPath = path.resolve(__dirname, '../dummy.png');
    const base64Png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
    if (!fs.existsSync(dummyImgPath)) {
        fs.writeFileSync(dummyImgPath, Buffer.from(base64Png, 'base64'));
    }

    if (await fileInput.count() > 0) {
        console.log("Found file input, setting file...");
        await fileInput.setInputFiles(dummyImgPath);
        await page.waitForTimeout(3000); // Wait for thumbnail
        await page.screenshot({ path: path.resolve(__dirname, '../debug_after_upload.png') });
    } else {
        console.log("Still no file input found.");
    }

    const promptInput = page.locator('rich-textarea [contenteditable="true"], div.ql-editor[contenteditable="true"], textarea').filter({ visible: true }).first();
    if (await promptInput.count() > 0) {
        console.log("Found prompt input, clicking and typing...");
        await promptInput.click();
        await page.waitForTimeout(500);
        await page.keyboard.insertText("What is this image?");
        await page.waitForTimeout(1000);
        await page.screenshot({ path: path.resolve(__dirname, '../debug_after_text.png') });
        
        const sendButton = page.locator('button[aria-label*="Send"], button.send-button, button[aria-label*="Gửi"]').filter({ visible: true }).first();
        if (await sendButton.count() > 0) {
            console.log("Found send button, clicking...");
            await sendButton.click();
            await page.waitForTimeout(5000); // Wait for rpc
            await page.screenshot({ path: path.resolve(__dirname, '../debug_after_send.png') });
        } else {
            console.log("Send button not found.");
        }
    } else {
        console.log("Prompt input not found.");
    }

    await context.close();
}

testGeminiImage().catch(console.error);
