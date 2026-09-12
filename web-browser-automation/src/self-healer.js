import { callGeminiDirectRpc, getCachedGeminiSession } from './gemini-web-rpc-client.js';

export async function findSelectorViaRPC(page, targetDescription) {
    console.log(`[Self-Healing] Attempting to find selector for: ${targetDescription}`);
    
    // Get the DOM around the input area
    const domHtml = await page.evaluate(() => {
        const inputArea = document.querySelector('rich-textarea') || document.querySelector('chat-window');
        if (!inputArea) return document.body.innerHTML.substring(0, 5000);
        return inputArea.parentElement.parentElement.innerHTML;
    });

    const session = getCachedGeminiSession();
    if (!session || !session.SNlM0e) {
        console.warn("[Self-Healing] No valid session to call RPC for healing.");
        return null;
    }

    const prompt = `I am trying to automate a webpage using Playwright. 
I need to find the CSS selector for a specific element: "${targetDescription}".
Here is a snippet of the HTML DOM:
\`\`\`html
${domHtml.substring(0, 20000)}
\`\`\`
Return ONLY the CSS selector string that uniquely identifies this element. Do not include markdown formatting or explanations.`;

    try {
        console.log("[Self-Healing] Calling Gemini RPC...");
        const responseText = await callGeminiDirectRpc(prompt);
        let selector = responseText.trim();
        // Remove markdown backticks if present
        if (selector.startsWith('`') && selector.endsWith('`')) {
            selector = selector.replace(/^`+|`+$/g, '').trim();
        }
        if (selector.startsWith('css')) {
            selector = selector.substring(3).trim();
        }
        console.log(`[Self-Healing] Gemini suggested selector: ${selector}`);
        return selector;
    } catch (e) {
        console.error(`[Self-Healing] Failed to get selector via RPC: ${e.message}`);
        return null;
    }
}
