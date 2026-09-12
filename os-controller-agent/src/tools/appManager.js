import { exec } from 'child_process';
import { promisify } from 'util';
import os from 'os';

const execAsync = promisify(exec);

/**
 * Cài đặt phần mềm tự động qua winget (Windows) hoặc apt-get (Ubuntu)
 */
export async function installPackage(packageIdOrName) {
  if (!packageIdOrName || typeof packageIdOrName !== 'string') {
    throw new Error('Mã phần mềm (Package ID) không hợp lệ');
  }

  let cmd;
  if (os.platform() === 'win32') {
    cmd = `winget install --silent --accept-package-agreements --accept-source-agreements --exact --id "${packageIdOrName}"`;
  } else {
    cmd = `sudo apt-get update && sudo apt-get install -y "${packageIdOrName}"`;
  }
  
  try {
    const { stdout, stderr } = await execAsync(cmd, { timeout: 600000 }); // 10 mins timeout
    return {
      success: true,
      packageId: packageIdOrName,
      message: `Cài đặt thành công ${packageIdOrName}`,
      output: stdout
    };
  } catch (err) {
    if (os.platform() === 'win32') {
      // If exact ID fails, try searching and installing without --exact (Windows fallback)
      try {
        const fallbackCmd = `winget install --silent --accept-package-agreements --accept-source-agreements "${packageIdOrName}"`;
        const { stdout } = await execAsync(fallbackCmd, { timeout: 600000 });
        return {
          success: true,
          packageId: packageIdOrName,
          message: `Cài đặt thành công ${packageIdOrName} (Fallback mode)`,
          output: stdout
        };
      } catch (fallbackErr) {
        throw new Error(`Lỗi khi cài đặt phần mềm "${packageIdOrName}": ${fallbackErr.message || err.message}`);
      }
    } else {
      throw new Error(`Lỗi khi cài đặt phần mềm "${packageIdOrName}": ${err.message}`);
    }
  }
}

/**
 * Tra cứu mã phần mềm trên kho Windows winget hoặc Ubuntu apt-cache
 */
export async function searchPackage(query) {
  if (!query) throw new Error('Từ khóa tra cứu không hợp lệ');

  const cmd = os.platform() === 'win32' ? `winget search "${query}"` : `apt-cache search "${query}"`;
  try {
    const { stdout } = await execAsync(cmd);
    const lines = stdout.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
    return {
      success: true,
      query,
      rawOutput: stdout,
      lines: lines.slice(0, 30) // top 30 results
    };
  } catch (err) {
    throw new Error(`Lỗi khi tra cứu phần mềm "${query}": ${err.message}`);
  }
}

/**
 * Lấy danh sách phần mềm đang cài đặt trên máy (Windows Registry hoặc Ubuntu dpkg-query)
 */
export async function listInstalledApps() {
  const cmd = os.platform() === 'win32'
    ? `powershell -NoProfile -Command "Get-ItemProperty HKLM:\\Software\\Wow6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*, HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\* | Where-Object { $_.DisplayName -ne $null } | Select-Object DisplayName, DisplayVersion, Publisher | Select-Object -First 60 | ForEach-Object { \\"$($_.DisplayName)|$($_.DisplayVersion)|$($_.Publisher)\\" }"`
    : `dpkg-query -W -f='\${Package}|\${Version}|\${Maintainer}\\n'`;

  try {
    const { stdout } = await execAsync(cmd, { maxBuffer: 1024 * 1024 * 5 });
    const apps = stdout.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0).map(line => {
      const [name, version, publisher] = line.split('|');
      return { name, version: version || 'N/A', publisher: publisher || 'N/A' };
    });

    return {
      success: true,
      totalApps: apps.length,
      apps: apps.slice(0, 60)
    };
  } catch (err) {
    throw new Error(`Lỗi khi liệt kê phần mềm: ${err.message}`);
  }
}

/**
 * Mở ứng dụng/phần mềm (ví dụ chrome, notepad hoặc file thực thi)
 */
export async function launchApp(appPathOrName, args = '') {
  if (!appPathOrName) throw new Error('Tên hoặc đường dẫn ứng dụng không hợp lệ');

  const cmd = os.platform() === 'win32'
    ? `powershell -NoProfile -Command "Start-Process '${appPathOrName}' ${args ? `-ArgumentList '${args}'` : ''}"`
    : `nohup ${appPathOrName} ${args} > /dev/null 2>&1 &`;
  try {
    await execAsync(cmd);
    return {
      success: true,
      message: `Đã khởi chạy ứng dụng: ${appPathOrName} ${args}`,
      app: appPathOrName
    };
  } catch (err) {
    throw new Error(`Không thể khởi chạy ứng dụng "${appPathOrName}": ${err.message}`);
  }
}

/**
 * Đóng ứng dụng / tiến trình theo tên
 */
export async function closeApp(processName) {
  if (!processName) throw new Error('Tên tiến trình cần đóng không hợp lệ');
  const cleanName = processName.replace(/\.exe$/i, '');

  const cmd = os.platform() === 'win32'
    ? `powershell -NoProfile -Command "Stop-Process -Name '${cleanName}' -Force -ErrorAction SilentlyContinue"`
    : `killall -9 "${cleanName}" || pkill -9 -f "${cleanName}"`;
  try {
    await execAsync(cmd);
    return {
      success: true,
      message: `Đã đóng tiến trình: ${cleanName}`
    };
  } catch (err) {
    throw new Error(`Không thể đóng tiến trình "${cleanName}": ${err.message}`);
  }
}
