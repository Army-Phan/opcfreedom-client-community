import { runTool } from './src/runner.js';
import fs from 'fs';
import path from 'path';

const toolPath = path.join(process.cwd(), 'data', 'tools', 'post_dang_bai_fb.json');
const tool = JSON.parse(fs.readFileSync(toolPath, 'utf8'));

runTool(tool, {}).then(runId => {
  console.log('Started run:', runId);
}).catch(console.error);
