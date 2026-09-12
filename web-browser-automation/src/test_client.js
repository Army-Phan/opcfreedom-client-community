import { callGeminiWeb } from './gemini-web-client.js';
import path from 'path';

async function run() {
    console.log("Starting test...");
    const dummyImagePath = path.resolve('dummy.png');
    
    // We expect callGeminiWeb to open Chrome, upload the image, type the text, and get a response.
    try {
        const response = await callGeminiWeb("Describe this image in 5 words.", dummyImagePath);
        console.log("====================");
        console.log("Gemini Response:");
        console.log(response);
        console.log("====================");
    } catch (e) {
        console.error("Test failed:", e);
    }
}

run();
