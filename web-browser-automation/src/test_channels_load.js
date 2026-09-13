import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';
import { findChromiumExecutable } from './login-channels.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const profilePath = path.resolve(__dirname, '../../data/browser_profiles/shared_omnichannel_profile');

async function testPage(url, name) {
  console.log(\n================== TESTING  () ==================);
  const launchOptions = {
    headless: true,
    args: ['--no-sandbox', '--disable-blink-features=AutomationControlled']
  };
  const execPath = findChromiumExecutable();
  if (execPath) launchOptions.executablePath = execPath;

  const context = await chromium.launchPersistentContext(profilePath, launchOptions);
  try {
    const page = await context.newPage();
    const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(e => {
      console.warn([] Warning goto: );
      return null;
    });
    await page.waitForTimeout(3000);
    const title = await page.title();
    const finalUrl = page.url();
    console.log([] Title: "");
    console.log([] URL: );
    console.log([] Status: );
  } finally {
    await context.close();
  }
}

async function main() {
  await testPage('https://chat.zalo.me/', 'ZALO');
  await testPage('https://web.telegram.org/a/', 'TELEGRAM');
  await testPage('https://x.com/home', 'X');
  await testPage('https://www.tiktok.com/', 'TIKTOK');
}

main().catch(console.error);
