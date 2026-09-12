#!/usr/bin/env node

import path from 'path';
import fs from 'fs-extra';
import { fileURLToPath } from 'url';
import * as fileOps from '../src/tools/fileOps.js';
import * as searchOps from '../src/tools/searchOps.js';
import * as sysMonitor from '../src/tools/sysMonitor.js';
import * as commandRunner from '../src/engine/commandRunner.js';

let passed = 0;
let failed = 0;

function assert(condition, testName, details = '') {
  if (condition) {
    passed++;
    console.log(`✅ PASS: ${testName}`);
  } else {
    failed++;
    console.error(`❌ FAIL: ${testName} ${details ? `(${details})` : ''}`);
  }
}

async function runAllTests() {
  console.log('====================================================');
  console.log('🧪 BẮT ĐẦU KIỂM THỬ TỰ ĐỘNG OS CONTROLLER AGENT');
  console.log('====================================================\n');

  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const testDir = path.resolve(__dirname, '../tmp_test_os_agent');

  // Test Case 1: Directory Guard (Bảo vệ C:\Windows)
  try {
    let caught = false;
    try {
      fileOps.assertSafePath('C:\\Windows\\System32\\config.sys', 'xóa');
    } catch (e) {
      caught = e.message.includes('Directory Guard') || e.message.includes('Quyền truy cập bị từ chối');
    }
    assert(caught, 'Test Case 1: Directory Guard chặn thao tác trong C:\\Windows');
  } catch (err) {
    assert(false, 'Test Case 1: Directory Guard', err.message);
  }

  // Test Case 2: Directory Guard (Bảo vệ C:\Program Files)
  try {
    let caught = false;
    try {
      fileOps.assertSafePath('C:\\Program Files\\Microsoft\\app.exe', 'ghi');
    } catch (e) {
      caught = e.message.includes('Directory Guard') || e.message.includes('Quyền truy cập bị từ chối');
    }
    assert(caught, 'Test Case 2: Directory Guard chặn thao tác trong C:\\Program Files');
  } catch (err) {
    assert(false, 'Test Case 2: Directory Guard', err.message);
  }

  // Test Case 3: Thao tác file an toàn (Tạo thư mục & ghi file)
  try {
    await fs.remove(testDir).catch(() => {});
    const fileA = path.join(testDir, 'sample_a.txt');
    await fileOps.writeFileContent(fileA, 'Hello OS Agent');
    const readRes = await fileOps.readFileContent(fileA);
    assert(readRes.content === 'Hello OS Agent', 'Test Case 3: Ghi & đọc file văn bản an toàn thành công');
  } catch (err) {
    assert(false, 'Test Case 3: Thao tác file an toàn', err.message);
  }

  // Test Case 4: Di chuyển file (Move Entry)
  try {
    const fileA = path.join(testDir, 'sample_a.txt');
    const fileB = path.join(testDir, 'subfolder', 'sample_b.txt');
    await fileOps.moveEntry(fileA, fileB);
    const existsB = await fs.pathExists(fileB);
    const existsA = await fs.pathExists(fileA);
    assert(existsB && !existsA, 'Test Case 4: Di chuyển file từ nguồn sang đích thành công');
  } catch (err) {
    assert(false, 'Test Case 4: Di chuyển file', err.message);
  }

  // Test Case 5: Liệt kê danh sách thư mục (List Directory)
  try {
    const listRes = await fileOps.listDirectory(testDir);
    assert(listRes.success && listRes.items.length > 0, 'Test Case 5: Liệt kê danh sách file/folder trong thư mục');
  } catch (err) {
    assert(false, 'Test Case 5: Liệt kê danh sách', err.message);
  }

  // Test Case 6: Tìm kiếm file siêu tốc (SearchOps)
  try {
    const searchRes = await searchOps.searchFilesByName('package.json', path.resolve(__dirname, '..'));
    assert(searchRes.success && searchRes.files.length > 0, 'Test Case 6: Tìm kiếm file package.json bằng PowerShell thành công');
  } catch (err) {
    assert(false, 'Test Case 6: Tìm kiếm file', err.message);
  }

  // Test Case 7: Giám sát thông số hệ thống (SysMonitor Metrics)
  try {
    const metrics = await sysMonitor.getSystemMetrics();
    assert(metrics.success && metrics.cpu && metrics.memory && metrics.disks, 'Test Case 7: Lấy thông số hiệu năng % CPU, RAM, ổ đĩa C:\\/D:\\');
  } catch (err) {
    assert(false, 'Test Case 7: Giám sát thông số hệ thống', err.message);
  }

  // Test Case 8: Safety Controller (Bộ lọc lệnh nguy hiểm của CommandRunner)
  try {
    let caughtCmd = false;
    try {
      commandRunner.assertSafeCommand('format-volume -DriveLetter D');
    } catch (e) {
      caughtCmd = e.message.includes('Safety Controller');
    }
    assert(caughtCmd, 'Test Case 8: Safety Controller chặn lệnh phá hoại ổ cứng format-volume');
  } catch (err) {
    assert(false, 'Test Case 8: Safety Controller', err.message);
  }

  // Cleanup dọn dẹp thư mục test
  await fs.remove(testDir).catch(() => {});

  console.log('\n====================================================');
  console.log(`📊 KẾT QUẢ KIỂM THỬ: ${passed} PASS / ${failed} FAIL`);
  console.log('====================================================\n');

  if (failed > 0) {
    process.exit(1);
  } else {
    console.log('🎉 TẤT CẢ TEST CASES ĐÃ PASS 100%! HỆ THỐNG HOẠT ĐỘNG HOÀN HẢO.\n');
    process.exit(0);
  }
}

runAllTests();
