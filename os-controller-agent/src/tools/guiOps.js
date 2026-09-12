import fs from 'fs-extra';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * Tự động nhận diện cửa sổ hộp thoại chọn file của Windows Explorer (Open File / Save As Dialog)
 * và tự động điền đường dẫn tuyệt đối rồi nhấn Enter/Open
 */
export async function handleNativeFileDialog(filePath, action = 'open') {
  const resolvedPath = path.resolve(filePath);
  if (action === 'open' && !await fs.pathExists(resolvedPath)) {
    throw new Error(`File cần upload không tồn tại: ${resolvedPath}`);
  }

  // PowerShell script using UI Automation / WScript.Shell to find and interact with Open/Save As dialog
  const psScript = `
    Add-Type -AssemblyName System.Windows.Forms
    $shell = New-Object -ComObject WScript.Shell
    
    # Wait up to 10 seconds for standard Open/Save As dialog titles in English or Vietnamese
    $dialogTitles = @("Open", "Save As", "Chọn tệp", "Mở", "Lưu dưới dạng", "Select File")
    $found = $false
    
    for ($i = 0; $i -lt 20; $i++) {
      foreach ($title in $dialogTitles) {
        if ($shell.AppActivate($title)) {
          $found = $true
          break
        }
      }
      if ($found) { break }
      Start-Sleep -Milliseconds 500
    }

    if (-not $found) {
      # Try activating whatever active foreground window is currently focused
      Start-Sleep -Milliseconds 500
    }

    # Send exact file path to the File Name text box and press Enter
    Start-Sleep -Milliseconds 500
    $shell.SendKeys("${resolvedPath.replace(/\\/g, '\\\\')}")
    Start-Sleep -Milliseconds 500
    $shell.SendKeys("~") # '~' is Enter in SendKeys syntax
  `;

  try {
    await execAsync(`powershell -NoProfile -Command "${psScript.replace(/"/g, '\\"')}"`, { timeout: 15000 });
    return {
      success: true,
      action,
      filePath: resolvedPath,
      message: `Đã tự động điền đường dẫn và xác nhận vào hộp thoại Windows Explorer: ${resolvedPath}`
    };
  } catch (err) {
    throw new Error(`Lỗi khi xử lý hộp thoại Explorer: ${err.message}`);
  }
}

/**
 * Đưa cửa sổ ứng dụng cụ thể lên trên cùng màn hình theo tiêu đề
 */
export async function focusWindow(windowTitle) {
  if (!windowTitle) throw new Error('Tiêu đề cửa sổ không hợp lệ');

  const psScript = `
    $shell = New-Object -ComObject WScript.Shell
    $activated = $shell.AppActivate("${windowTitle}")
    if ($activated) { "SUCCESS" } else { "NOT_FOUND" }
  `;

  try {
    const { stdout } = await execAsync(`powershell -NoProfile -Command "${psScript.replace(/"/g, '\\"')}"`);
    const res = stdout.trim();
    if (res.includes('SUCCESS')) {
      return { success: true, message: `Đã focus vào cửa sổ: ${windowTitle}` };
    } else {
      return { success: false, message: `Không tìm thấy cửa sổ có tiêu đề: ${windowTitle}` };
    }
  } catch (err) {
    throw new Error(`Lỗi khi focus cửa sổ "${windowTitle}": ${err.message}`);
  }
}

/**
 * Giả lập gửi chuỗi phím tắt tới cửa sổ đang active (Copy ^C, Paste ^V, Enter ~, Tab {TAB})
 */
export async function sendKeyboardKeys(keys) {
  if (!keys) throw new Error('Chuỗi phím không hợp lệ');

  const psScript = `
    Add-Type -AssemblyName System.Windows.Forms
    [System.Windows.Forms.SendKeys]::SendWait("${keys.replace(/"/g, '`"')}")
  `;

  try {
    await execAsync(`powershell -NoProfile -Command "${psScript.replace(/"/g, '\\"')}"`);
    return { success: true, message: `Đã gửi chuỗi phím: ${keys}` };
  } catch (err) {
    throw new Error(`Lỗi khi gửi phím tắt: ${err.message}`);
  }
}
