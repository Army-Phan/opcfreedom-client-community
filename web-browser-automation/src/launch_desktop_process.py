"""
Desktop Process Launcher for Windows (WinSta0\\Default)
Bypasses AGY Virtual Desktop / Sandbox Isolation to force Chrome onto visible user screen.
"""
import ctypes
import ctypes.wintypes
import sys
import os

kernel32 = ctypes.windll.kernel32

class STARTUPINFO(ctypes.Structure):
    _fields_ = [
        ('cb',              ctypes.wintypes.DWORD),
        ('lpReserved',      ctypes.wintypes.LPWSTR),
        ('lpDesktop',       ctypes.wintypes.LPWSTR),
        ('lpTitle',         ctypes.wintypes.LPWSTR),
        ('dwX',             ctypes.wintypes.DWORD),
        ('dwY',             ctypes.wintypes.DWORD),
        ('dwXSize',         ctypes.wintypes.DWORD),
        ('dwYSize',         ctypes.wintypes.DWORD),
        ('dwXCountChars',   ctypes.wintypes.DWORD),
        ('dwYCountChars',   ctypes.wintypes.DWORD),
        ('dwFillAttribute', ctypes.wintypes.DWORD),
        ('dwFlags',         ctypes.wintypes.DWORD),
        ('wShowWindow',     ctypes.wintypes.WORD),
        ('cbReserved2',     ctypes.wintypes.WORD),
        ('lpReserved2',     ctypes.c_char_p),
        ('hStdInput',       ctypes.wintypes.HANDLE),
        ('hStdOutput',      ctypes.wintypes.HANDLE),
        ('hStdError',       ctypes.wintypes.HANDLE),
    ]

class PROCESS_INFORMATION(ctypes.Structure):
    _fields_ = [
        ('hProcess',    ctypes.wintypes.HANDLE),
        ('hThread',     ctypes.wintypes.HANDLE),
        ('dwProcessId', ctypes.wintypes.DWORD),
        ('dwThreadId',  ctypes.wintypes.DWORD),
    ]

def launch_on_default_desktop(cmd_line):
    si = STARTUPINFO()
    si.cb = ctypes.sizeof(STARTUPINFO)
    si.lpDesktop = r"WinSta0\Default"
    si.dwFlags = 1  # STARTF_USESHOWWINDOW
    si.wShowWindow = 1  # SW_NORMAL

    pi = PROCESS_INFORMATION()

    NORMAL_PRIORITY_CLASS = 0x00000020
    CREATE_NEW_CONSOLE = 0x00000010

    success = kernel32.CreateProcessW(
        None,
        cmd_line,
        None,
        None,
        False,
        NORMAL_PRIORITY_CLASS | CREATE_NEW_CONSOLE,
        None,
        None,
        ctypes.byref(si),
        ctypes.byref(pi)
    )

    if success:
        print(f"SUCCESS:{pi.dwProcessId}")
        kernel32.CloseHandle(pi.hProcess)
        kernel32.CloseHandle(pi.hThread)
        sys.exit(0)
    else:
        err = kernel32.GetLastError()
        print(f"ERROR:{err}")
        sys.exit(err)

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("ERROR:Missing command line argument")
        sys.exit(1)
    
    command = " ".join(sys.argv[1:])
    launch_on_default_desktop(command)
