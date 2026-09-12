import dotenv from 'dotenv';
import { callGeminiWithRetry } from './gemini-client.js';

dotenv.config();

const modelName = process.env.GEMINI_MODEL || 'gemini-3.5-flash';

export async function generateSteps(url, prompt, toolName) {
  const systemInstruction = `You are an expert web automation script writer. Your job is to convert a user's natural language request into a sequence of automation steps that can be run by Playwright.
Adhere strictly to the requested JSON schema.

Identify if the user's instructions require any input parameters that could be dynamic (such as login usernames, passwords, search strings, message texts). Instead of hardcoding these values into the steps, you must:
1. Define them in the 'inputs' config array. Each input has:
   - name: variable name to use, lowercase letters and underscores only (e.g. "username", "search_query")
   - label: user-friendly label in Vietnamese (e.g. "Tên đăng nhập", "Từ khóa tìm kiếm")
   - type: either "text" or "password"
   - description: a short hint for the user
2. In the step's 'value' field, reference the variable using double curly braces, e.g. {{username}} or {{search_query}}.

Each step must have:
1. id: unique string (e.g. step_1, step_2)
2. type: must be one of:
   - 'click': click on an element (fails if not found)
   - 'click_if_exists': clicks element if it exists, doesn't fail if not found (good for modals, cookies)
   - 'fill': fills an input or textarea with a value
   - 'press': presses a key on an element (e.g. 'Enter', 'Tab', etc.)
   - 'wait': waits for a selector to appear, or waits for a duration (if value is a number like 2000)
   - 'scroll': scrolls the page. Value can be 'down', 'up', or a selector to scroll to
   - 'scrape': scrapes content. Config is required:
       - scope: 'single' (extracts one item) or 'multiple' (extracts an array of items matching selector)
       - fields: array of fields to extract. Each field has name and relative selector. To scrape attributes, append @attributeName to the selector (e.g. 'a@href').
   - 'screenshot': takes a screenshot of the viewport.
3. selector: CSS selector. Be as specific and robust as possible.
4. value: value associated with action. Can include variable placeholders like {{username}}.
5. description: What the step is doing.

Guidelines for selectors:
- Try to use standard CSS selectors: e.g. input[name='q'], button[type='submit'], #search-results, etc.
- CRITICAL: Always use single quotes inside CSS attribute selectors (e.g., input[name='q'] instead of input[name="q"]) to prevent nested double-quotes from breaking JSON string parsing.
- When scraping multiple items, the step 'selector' should be the container or item selector (e.g. 'div.search-item'), and the fields' selectors should be relative to the item (e.g. 'h3.title').

Given:
Start URL: ${url}
Tool Name: ${toolName}
User Instructions: ${prompt}

Generate the steps.`;

  try {
    const response = await callGeminiWithRetry((client) => 
      client.models.generateContent({
        model: modelName,
        contents: `Generate a web browsing automation script for URL: ${url}. Instructions: ${prompt}`,
        config: {
          systemInstruction,
          responseMimeType: 'application/json',
          responseSchema: {
          type: 'OBJECT',
          properties: {
            name: { type: 'STRING' },
            description: { type: 'STRING' },
            startUrl: { type: 'STRING' },
            inputs: {
              type: 'ARRAY',
              description: 'Dynamic user inputs needed to run the tool',
              items: {
                type: 'OBJECT',
                properties: {
                  name: { type: 'STRING', description: 'Variable name to use in steps, e.g. "username", "query"' },
                  label: { type: 'STRING', description: 'User-friendly label to display in UI, e.g. "Tên đăng nhập", "Từ khóa"' },
                  type: { type: 'STRING', enum: ['text', 'password'], description: 'HTML input type' },
                  description: { type: 'STRING', description: 'Hint for the user' }
                },
                required: ['name', 'label', 'type']
              }
            },
            steps: {
              type: 'ARRAY',
              items: {
                type: 'OBJECT',
                properties: {
                  id: { type: 'STRING' },
                  type: { type: 'STRING', enum: ['click', 'click_if_exists', 'fill', 'press', 'wait', 'scroll', 'scrape', 'screenshot'] },
                  selector: { type: 'STRING', description: 'CSS selector for the element. Leave empty if not applicable.' },
                  value: { type: 'STRING', description: 'Text value, key value, wait time, or scroll direction. Can use {{var}}.' },
                  description: { type: 'STRING', description: 'Description of what this step does.' },
                  config: {
                    type: 'OBJECT',
                    properties: {
                      scope: { type: 'STRING', enum: ['single', 'multiple'] },
                      fields: {
                        type: 'ARRAY',
                        items: {
                          type: 'OBJECT',
                          properties: {
                            name: { type: 'STRING', description: 'Name of the field (e.g., title, link)' },
                            selector: { type: 'STRING', description: 'Relative selector.' }
                          },
                          required: ['name', 'selector']
                        }
                      }
                    }
                  }
                },
                required: ['id', 'type', 'description']
              }
            }
          },
          required: ['name', 'description', 'startUrl', 'inputs', 'steps']
        }
      }
    })
  );

    const resultText = response.text;
    console.log("=== RAW GEMINI WEB RESPONSE ===");
    console.log(resultText);
    console.log("===============================");
    const parsed = JSON.parse(resultText);
    
    if (toolName) {
      parsed.name = toolName;
    }
    
    // Post-process the fields array to map format: { fieldName: selector }
    if (parsed.steps) {
      parsed.steps.forEach(step => {
        if (step.config && Array.isArray(step.config.fields)) {
          const fieldMap = {};
          step.config.fields.forEach(f => {
            fieldMap[f.name] = f.selector;
          });
          step.config.fields = fieldMap;
        }
      });
    }
    
    return parsed;
  } catch (error) {
    console.error("Error generating steps with Gemini:", error);
    throw error;
  }
}
