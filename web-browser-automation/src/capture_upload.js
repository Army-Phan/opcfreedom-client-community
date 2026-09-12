import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function captureUpload() {
    const profilePath = 'd:\\AIWebsite\\opcfreedom\\web-browser-automation\\data\\states\\gemini_chrome_profile';
    console.log("Using profile at:", profilePath);
    
    const context = await chromium.launchPersistentContext(profilePath, {
        headless: false,
        channel: 'chrome',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await context.newPage();
    
    // Intercept requests
    page.on('request', request => {
        const url = request.url();
        if (url.includes('upload') || url.includes('content-push') || url.includes('f6vFac')) {
            console.log('>>> Request:', request.method(), url);
            const headers = request.headers();
            if (headers['content-type']) {
                console.log('    Content-Type:', headers['content-type']);
            }
        }
    });

    page.on('response', async response => {
        const url = response.url();
        if (url.includes('upload') || url.includes('content-push') || url.includes('f6vFac')) {
            console.log('<<< Response:', response.status(), url);
            try {
                const text = await response.text();
                console.log('    Body snippet:', text.substring(0, 300));
            } catch(e) {}
        }
    });

    console.log("Navigating to Gemini...");
    await page.goto('https://gemini.google.com/app', { waitUntil: 'domcontentloaded', timeout: 30000 });
    
    await page.waitForTimeout(5000); 

    // Find file input and upload a dummy image
    const fileInput = page.locator('input[type="file"]').first();
    
    // Create a dummy image
    const dummyImgPath = path.resolve(__dirname, '../dummy.png');
    // A 1x1 transparent png
    const base64Png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
    fs.writeFileSync(dummyImgPath, Buffer.from(base64Png, 'base64'));

    if (await fileInput.count() > 0) {
        console.log("Uploading dummy image...");
        await fileInput.setInputFiles(dummyImgPath);
        
        await page.waitForTimeout(3000); // Wait for upload request to fire and complete

        const promptInput = page.locator('rich-textarea [contenteditable="true"], div.ql-editor[contenteditable="true"], textarea').filter({ visible: true }).first();
        if (await promptInput.count() > 0) {
            console.log("Typing prompt...");
            await promptInput.click();
            await page.waitForTimeout(500);
            await promptInput.fill("What is this image?");
            
            const sendButton = page.locator('button[aria-label*="Send"], button.send-button').filter({ visible: true }).first();
            if (await sendButton.count() > 0) {
                console.log("Clicking send...");
                await sendButton.click();
                await page.waitForTimeout(5000); // Wait for rpc
            }
        }
    } else {
        console.log("File input not found");
    }

    await context.close();
}

captureUpload().catch(console.error);
