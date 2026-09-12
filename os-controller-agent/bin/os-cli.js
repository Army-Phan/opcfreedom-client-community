#!/usr/bin/env node

import * as fileOps from '../src/tools/fileOps.js';
import * as searchOps from '../src/tools/searchOps.js';
import * as sysMonitor from '../src/tools/sysMonitor.js';

const command = process.argv[2];
const arg1 = process.argv[3];
const arg2 = process.argv[4];

async function main() {
  console.log(`[OS CLI] Lệnh thực thi: ${command || 'help'}`);

  try {
    if (command === 'sys') {
      const res = await sysMonitor.getSystemMetrics();
      console.log(JSON.stringify(res, null, 2));
    } else if (command === 'search') {
      const res = await searchOps.searchFilesByName(arg1 || '*.js', arg2 || 'D:\\');
      console.log(JSON.stringify(res, null, 2));
    } else if (command === 'list') {
      const res = await fileOps.listDirectory(arg1 || 'D:\\');
      console.log(JSON.stringify(res, null, 2));
    } else {
      console.log(`
Cách dùng CLI:
  node bin/os-cli.js sys                  -> Xem thông số hiệu năng CPU/RAM/Disk
  node bin/os-cli.js search <pattern>     -> Tìm kiếm file theo wildcard
  node bin/os-cli.js list <dir>           -> Liệt kê danh sách file & folder
      `);
    }
  } catch (err) {
    console.error('[OS CLI Error]:', err.message);
    process.exit(1);
  }
}

main();
