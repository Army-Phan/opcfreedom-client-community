import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * Kiểm tra Safety Controller: chặn lệnh nguy hiểm phá hoại hệ thống
 */
export function assertSafeCommand(cmd) {
  const normalized = cmd.toLowerCase();
  const dangerousPatterns = [
    'format-volume',
    'clear-disk',
    'rmdir /s /q c:\\windows',
    'rmdir /s /q c:\\program files',
    'remove-item -recurse -force c:\\windows',
    'remove-item c:\\windows',
    'del /f /s /q c:\\*',
    'del c:\\windows',
    'rd /s /q c:\\windows',
    'stop-computer -force',
    'restart-computer -force'
  ];

  for (const pattern of dangerousPatterns) {
    if (normalized.includes(pattern)) {
      throw new Error(`[Safety Controller] Lệnh bị từ chối do vi phạm quy tắc bảo vệ hệ thống: "${pattern}"`);
    }
  }
  return true;
}

/**
 * Thực thi lệnh PowerShell với bộ lọc bảo mật
 */
export async function runPowerShell(script, timeoutMs = 60000) {
  assertSafeCommand(script);
  
  const cmd = `powershell -NoProfile -ExecutionPolicy Bypass -Command "${script.replace(/"/g, '\\"')}"`;
  try {
    const { stdout, stderr } = await execAsync(cmd, { timeout: timeoutMs, maxBuffer: 1024 * 1024 * 10 });
    return {
      success: true,
      stdout: stdout ? stdout.trim() : '',
      stderr: stderr ? stderr.trim() : ''
    };
  } catch (err) {
    return {
      success: false,
      error: err.message,
      stdout: err.stdout ? err.stdout.trim() : '',
      stderr: err.stderr ? err.stderr.trim() : ''
    };
  }
}

/**
 * Thực thi lệnh Command Prompt (cmd.exe) với bộ lọc bảo mật
 */
export async function runCmd(commandString, timeoutMs = 60000) {
  assertSafeCommand(commandString);

  try {
    const { stdout, stderr } = await execAsync(commandString, { timeout: timeoutMs, maxBuffer: 1024 * 1024 * 10 });
    return {
      success: true,
      stdout: stdout ? stdout.trim() : '',
      stderr: stderr ? stderr.trim() : ''
    };
  } catch (err) {
    return {
      success: false,
      error: err.message,
      stdout: err.stdout ? err.stdout.trim() : '',
      stderr: err.stderr ? err.stderr.trim() : ''
    };
  }
}
