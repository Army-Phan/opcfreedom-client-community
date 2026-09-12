import fs from 'fs-extra';
import path from 'path';

/**
 * Kiểm tra Directory Guard: ngăn chặn chỉnh sửa hoặc xóa trong C:\Windows và C:\Program Files
 */
export function assertSafePath(targetPath, action = 'thao tác') {
  const normalized = path.resolve(targetPath).toLowerCase();
  const forbiddenPrefixes = [
    'c:\\windows',
    'c:\\program files',
    'c:\\program files (x86)'
  ];

  for (const forbidden of forbiddenPrefixes) {
    if (normalized === forbidden || normalized.startsWith(forbidden + '\\')) {
      throw new Error(`[Directory Guard] Quyền truy cập bị từ chối: Không thể thực hiện "${action}" trong thư mục bảo vệ hệ thống (${forbidden}).`);
    }
  }
  return true;
}

/**
 * Di chuyển file hoặc thư mục
 */
export async function moveEntry(source, dest) {
  assertSafePath(source, 'di chuyển');
  assertSafePath(dest, 'đích di chuyển');
  if (!await fs.pathExists(source)) {
    throw new Error(`File hoặc thư mục nguồn không tồn tại: ${source}`);
  }
  await fs.ensureDir(path.dirname(dest));
  await fs.move(source, dest, { overwrite: true });
  return { success: true, message: `Đã di chuyển thành công từ ${source} tới ${dest}`, path: dest };
}

/**
 * Sao chép file hoặc thư mục
 */
export async function copyEntry(source, dest) {
  assertSafePath(dest, 'sao chép vào');
  if (!await fs.pathExists(source)) {
    throw new Error(`File hoặc thư mục nguồn không tồn tại: ${source}`);
  }
  await fs.ensureDir(path.dirname(dest));
  await fs.copy(source, dest, { overwrite: true });
  return { success: true, message: `Đã sao chép thành công tới ${dest}`, path: dest };
}

/**
 * Tạo thư mục mới
 */
export async function createDirectory(dirPath) {
  assertSafePath(dirPath, 'tạo thư mục');
  await fs.ensureDir(dirPath);
  return { success: true, message: `Đã tạo thư mục: ${dirPath}`, path: dirPath };
}

/**
 * Liệt kê danh sách file & thư mục
 */
export async function listDirectory(dirPath) {
  const resolved = path.resolve(dirPath);
  if (!await fs.pathExists(resolved)) {
    throw new Error(`Thư mục không tồn tại: ${resolved}`);
  }
  const items = await fs.readdir(resolved, { withFileTypes: true });
  const result = [];

  for (const item of items) {
    const fullPath = path.join(resolved, item.name);
    let size = 0;
    let modified = null;
    try {
      const stats = await fs.stat(fullPath);
      size = stats.size;
      modified = stats.mtime;
    } catch (e) {}

    result.push({
      name: item.name,
      path: fullPath,
      isDirectory: item.isDirectory(),
      sizeBytes: item.isDirectory() ? null : size,
      modifiedAt: modified
    });
  }

  return { success: true, path: resolved, totalItems: result.length, items: result };
}

/**
 * Xóa file hoặc thư mục
 */
export async function deleteEntry(targetPath) {
  assertSafePath(targetPath, 'xóa dữ liệu');
  const resolved = path.resolve(targetPath);
  if (!await fs.pathExists(resolved)) {
    throw new Error(`File hoặc thư mục không tồn tại: ${resolved}`);
  }
  await fs.remove(resolved);
  return { success: true, message: `Đã xóa thành công: ${resolved}` };
}

/**
 * Đọc nội dung file văn bản
 */
export async function readFileContent(filePath, encoding = 'utf-8') {
  const resolved = path.resolve(filePath);
  if (!await fs.pathExists(resolved)) {
    throw new Error(`File không tồn tại: ${resolved}`);
  }
  const content = await fs.readFile(resolved, encoding);
  return { success: true, path: resolved, content };
}

/**
 * Ghi nội dung vào file văn bản
 */
export async function writeFileContent(filePath, content) {
  assertSafePath(filePath, 'ghi file');
  const resolved = path.resolve(filePath);
  await fs.ensureDir(path.dirname(resolved));
  await fs.writeFile(resolved, content, 'utf-8');
  return { success: true, message: `Đã ghi file: ${resolved}`, path: resolved };
}
