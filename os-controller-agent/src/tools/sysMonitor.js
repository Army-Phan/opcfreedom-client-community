import os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * Lấy các chỉ số hiệu năng hệ thống: % CPU, dung lượng RAM trống/đã dùng, các ổ cứng
 */
export async function getSystemMetrics() {
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;
  const memUsagePercent = ((usedMem / totalMem) * 100).toFixed(1);

  // CPU load estimation over 1s using os.cpus()
  const cpus = os.cpus();
  let totalIdle = 0;
  let totalTick = 0;
  cpus.forEach(cpu => {
    for (const type in cpu.times) {
      totalTick += cpu.times[type];
    }
    totalIdle += cpu.times.idle;
  });
  const cpuUsagePercent = (100 - (totalIdle / totalTick) * 100).toFixed(1);

  // Get disk space cross-platform
  let disks = [];
  try {
    if (os.platform() === 'win32') {
      const psCmd = `powershell -NoProfile -Command "Get-CimInstance -ClassName Win32_LogicalDisk | Select-Object DeviceID, Size, FreeSpace | ForEach-Object { \\"$($_.DeviceID)|$($_.Size)|$($_.FreeSpace)\\" }"`;
      const { stdout } = await execAsync(psCmd);
      disks = stdout.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0).map(line => {
        const [deviceId, size, free] = line.split('|');
        const sizeBytes = parseInt(size || 0, 10);
        const freeBytes = parseInt(free || 0, 10);
        const usedBytes = sizeBytes - freeBytes;
        return {
          drive: deviceId,
          sizeGB: (sizeBytes / (1024 ** 3)).toFixed(1),
          freeGB: (freeBytes / (1024 ** 3)).toFixed(1),
          usedPercent: sizeBytes > 0 ? ((usedBytes / sizeBytes) * 100).toFixed(1) : '0.0'
        };
      });
    } else {
      const { stdout } = await execAsync("df -k");
      disks = stdout.split('\n')
        .slice(1)
        .map(line => {
          const parts = line.trim().split(/\s+/);
          if (parts.length < 6) return null;
          const [fs, blocks, used, avail, usePercent, mount] = parts;
          if (!fs.startsWith('/dev') && fs !== 'tmpfs') return null;
          const sizeBytes = parseInt(blocks, 10) * 1024;
          const freeBytes = parseInt(avail, 10) * 1024;
          return {
            drive: mount,
            sizeGB: (sizeBytes / (1024 ** 3)).toFixed(1),
            freeGB: (freeBytes / (1024 ** 3)).toFixed(1),
            usedPercent: usePercent.replace('%', '')
          };
        })
        .filter(d => d !== null);
    }
  } catch (e) {}

  return {
    success: true,
    platform: os.platform(),
    osVersion: os.release(),
    cpu: {
      model: cpus[0] ? cpus[0].model : 'Unknown',
      cores: cpus.length,
      usagePercent: `${cpuUsagePercent}%`
    },
    memory: {
      totalGB: (totalMem / (1024 ** 3)).toFixed(2),
      usedGB: (usedMem / (1024 ** 3)).toFixed(2),
      freeGB: (freeMem / (1024 ** 3)).toFixed(2),
      usagePercent: `${memUsagePercent}%`
    },
    disks
  };
}

/**
 * Liệt kê các tiến trình (Process) đang chiếm nhiều RAM/CPU nhất
 */
export async function listRunningProcesses(limit = 15) {
  try {
    let processes = [];
    if (os.platform() === 'win32') {
      const psCmd = `powershell -NoProfile -Command "Get-Process | Sort-Object WorkingSet64 -Descending | Select-Object -First ${limit} | ForEach-Object { \\"$($_.ProcessName)|$($_.Id)|$(($_.WorkingSet64 / 1MB).ToString('F1'))|$(if ($_.CPU) { $_.CPU.ToString('F1') } else { '0.0' })\\" }"`;
      const { stdout } = await execAsync(psCmd);
      processes = stdout.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0).map(line => {
        const [name, pid, memMB, cpuSeconds] = line.split('|');
        return {
          name,
          pid: parseInt(pid || 0, 10),
          memoryMB: parseFloat(memMB || 0),
          cpuSeconds: parseFloat(cpuSeconds || 0)
        };
      });
    } else {
      const { stdout } = await execAsync(`ps -eo comm,pid,rss,%cpu --sort=-rss | head -n ${limit + 1}`);
      const lines = stdout.split('\n').slice(1);
      processes = lines.map(line => {
        const parts = line.trim().split(/\s+/);
        if (parts.length < 4) return null;
        const [name, pid, rssKB, cpu] = parts;
        return {
          name,
          pid: parseInt(pid || 0, 10),
          memoryMB: parseFloat((parseInt(rssKB || 0, 10) / 1024).toFixed(1)),
          cpuSeconds: parseFloat(cpu || 0)
        };
      }).filter(p => p !== null);
    }

    return {
      success: true,
      totalCount: processes.length,
      processes
    };
  } catch (err) {
    throw new Error(`Lỗi khi lấy danh sách tiến trình: ${err.message}`);
  }
}
