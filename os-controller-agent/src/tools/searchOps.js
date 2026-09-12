import fs from 'fs-extra';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * Tìm kiếm file theo tên bằng PowerShell (nhanh và hỗ trợ wildcard như *.pdf, banner*)
 */
export async function searchFilesByName(query, searchPath = 'D:\\') {
  const resolved = path.resolve(searchPath);
  if (!await fs.pathExists(resolved)) {
    throw new Error(`Thư mục tìm kiếm không tồn tại: ${resolved}`);
  }

  // Use PowerShell Get-ChildItem for recursive search with error handling for locked directories
  const psCmd = `powershell -NoProfile -Command "Get-ChildItem -Path '${resolved}' -Filter '${query}' -Recurse -File -ErrorAction SilentlyContinue | Select-Object -First 50 | ForEach-Object { $_.FullName }"`;
  
  try {
    const { stdout } = await execAsync(psCmd, { maxBuffer: 1024 * 1024 * 10 });
    const files = stdout.split(/\r?\n/).map(f => f.trim()).filter(f => f && f.length > 0);
    
    return {
      success: true,
      query,
      searchPath: resolved,
      totalFound: files.length,
      files
    };
  } catch (err) {
    throw new Error(`Lỗi khi tìm kiếm file "${query}": ${err.message}`);
  }
}

/**
 * Tìm kiếm nội dung văn bản bên trong file (Sử dụng PowerShell Select-String / findstr)
 */
export async function searchFilesByContent(pattern, searchPath = 'D:\\AIWebsite', fileExtension = '*.js') {
  const resolved = path.resolve(searchPath);
  if (!await fs.pathExists(resolved)) {
    throw new Error(`Thư mục tìm kiếm không tồn tại: ${resolved}`);
  }

  const psCmd = `powershell -NoProfile -Command "Get-ChildItem -Path '${resolved}' -Filter '${fileExtension}' -Recurse -File -ErrorAction SilentlyContinue | Select-String -Pattern '${pattern}' | Select-Object -First 30 | ForEach-Object { \\"$($_.Path):$($_.LineNumber): $($_.Line.Trim())\\" }"`;

  try {
    const { stdout } = await execAsync(psCmd, { maxBuffer: 1024 * 1024 * 10 });
    const matches = stdout.split(/\r?\n/).map(m => m.trim()).filter(m => m && m.length > 0);

    return {
      success: true,
      pattern,
      searchPath: resolved,
      totalMatches: matches.length,
      matches
    };
  } catch (err) {
    throw new Error(`Lỗi khi tìm nội dung "${pattern}": ${err.message}`);
  }
}

/**
 * Lấy danh sách các file vừa chỉnh sửa hoặc tạo mới gần đây nhất
 */
export async function getRecentFiles(limit = 10, searchPath = 'D:\\') {
  const resolved = path.resolve(searchPath);
  if (!await fs.pathExists(resolved)) {
    throw new Error(`Thư mục tìm kiếm không tồn tại: ${resolved}`);
  }

  const psCmd = `powershell -NoProfile -Command "Get-ChildItem -Path '${resolved}' -Recurse -File -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First ${limit} | ForEach-Object { \\"$($_.FullName)|$($_.LastWriteTime.ToString('yyyy-MM-dd HH:mm:ss'))|$($_.Length)\\" }"`;

  try {
    const { stdout } = await execAsync(psCmd, { maxBuffer: 1024 * 1024 * 10 });
    const lines = stdout.split(/\r?\n/).map(l => l.trim()).filter(l => l && l.length > 0);
    const files = lines.map(line => {
      const [filePath, lastModified, sizeBytes] = line.split('|');
      return { filePath, lastModified, sizeBytes: parseInt(sizeBytes || 0, 10) };
    });

    return {
      success: true,
      searchPath: resolved,
      count: files.length,
      files
    };
  } catch (err) {
    throw new Error(`Lỗi khi lấy file gần đây: ${err.message}`);
  }
}
