# -*- coding: utf-8 -*-
"""
检查相机.py —— 判断雷电模拟器里的相机画面是不是"真电脑摄像头"

背景：雷电的相机有两套来源
  1. 真电脑摄像头（ldcam.exe 抓 DirectShow）
  2. 内置合成场景（ldcam 抓不到帧时的回落，淡青色底 + 小块动画）
两者外观差别很大，肉眼有时难分辨，本脚本用 5 个信号交叉判断。

用法：
  双击 检查相机.bat
  或  python 检查相机.py

可配置环境变量：
  LDCONSOLE     ldconsole.exe 路径
  ADB           adb.exe 路径
  FFMPEG        ffmpeg.exe 路径
  CAMERA_NAME   摄像头设备名（默认自动探测第一个视频设备）
  SERIAL        adb 设备序列号（默认 emulator-5554）
"""
import os
import re
import shutil
import subprocess
import sys
import time

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

SERIAL = os.environ.get("SERIAL", "emulator-5554")

LD_SEARCH = [
    r"D:\leidian\LDPlayer9",
    r"D:\leidian\LDPlayer14",
    r"D:\LDPlayer\LDPlayer9",
    r"D:\LDPlayer\LDPlayer14",
    r"C:\LDPlayer\LDPlayer9",
    r"C:\LDPlayer\LDPlayer14",
    r"D:\雷电模拟器\leidian\LDPlayer9",
    r"D:\雷电模拟器\leidian\LDPlayer14",
]

_HERE = os.path.dirname(os.path.abspath(__file__))
ADB_SEARCH = [
    os.path.join(_HERE, "platform-tools"),
    os.path.expandvars(r"%LOCALAPPDATA%\Android\Sdk\platform-tools"),
    os.path.expandvars(r"%USERPROFILE%\platform-tools"),
    os.path.expandvars(r"%USERPROFILE%\AppData\Local\Android\Sdk\platform-tools"),
    r"D:\platform-tools",
    r"C:\platform-tools",
    r"C:\Program Files\platform-tools",
]

FFMPEG_SEARCH = [
    r"C:\Program Files\BlueStacks_nxt_cn",
    r"C:\ffmpeg\bin",
    r"C:\Program Files\ffmpeg\bin",
]


def find_tool(env_key, exe, search_dirs):
    """环境变量 > PATH > 常见目录"""
    v = os.environ.get(env_key, "").strip('"')
    if v and os.path.exists(v):
        return v
    p = shutil.which(exe)
    if p:
        return p
    for d in search_dirs:
        cand = os.path.join(d, exe)
        if os.path.exists(cand):
            return cand
    return None


def run(cmd, timeout=20, encoding="utf-8"):
    try:
        r = subprocess.run(cmd, capture_output=True, timeout=timeout)
        return (r.stdout or b"").decode(encoding, "ignore")
    except Exception:
        return ""


def out(msg=""):
    print(msg)


def detect_camera_name(ffmpeg):
    """从 ffmpeg 的设备枚举里取第一个视频设备名"""
    env = os.environ.get("CAMERA_NAME", "").strip('"')
    if env:
        return env
    if not ffmpeg:
        return "HD webcam"
    txt = run([ffmpeg, "-hide_banner", "-list_devices", "true", "-f", "dshow", "-i", "dummy"],
              timeout=25)
    in_video = False
    for line in txt.splitlines():
        if "DirectShow video devices" in line:
            in_video = True
            continue
        if "DirectShow audio devices" in line:
            break
        if in_video:
            m = re.search(r'"([^"]+)"', line)
            if m:
                return m.group(1)
    return "HD webcam"


def main():
    out("=" * 64)
    out("雷电模拟器 · 相机状态检查")
    out("=" * 64)

    ld = find_tool("LDCONSOLE", "ldconsole.exe", LD_SEARCH)
    adb = find_tool("ADB", "adb.exe", ADB_SEARCH)
    ff = find_tool("FFMPEG", "ffmpeg.exe", FFMPEG_SEARCH)
    cam = detect_camera_name(ff)

    out("ldconsole : %s" % (ld or "未找到"))
    out("adb       : %s" % (adb or "未找到"))
    out("ffmpeg    : %s" % (ff or "未找到（信号2 跳过）"))
    out("摄像头名  : %s" % cam)
    out()

    if not ld:
        out("[错误] 找不到 ldconsole.exe")
        out("       请安装雷电模拟器，或用环境变量 LDCONSOLE 指定路径")
        return 1
    if not adb:
        out("[错误] 找不到 adb.exe")
        out("       请安装 Android platform-tools，或用环境变量 ADB 指定路径")
        return 1

    # ---- 信号0：模拟器是否运行 ----
    st = ""
    for one in run([ld, "list2"], encoding="gbk").splitlines():
        cols = one.split(",")
        if len(cols) >= 5:
            st = cols[4].strip()
            break
    ok0 = st == "1"
    out("信号0  模拟器运行状态 : %s" % ("运行中 [OK]" if ok0 else "未运行 [NG] (state=%s)" % st))

    # ---- 信号1：ldcam 进程 ----
    has_ldcam = re.search(r"ldcam\.exe", run(["tasklist"], encoding="gbk"), re.I) is not None
    out("信号1  ldccam 进程     : %s" % ("存在 [OK]" if has_ldcam else "不存在 [NG]"))

    # ---- 信号4：是否有 App 正在使用相机 ----
    dump = run([adb, "-s", SERIAL, "shell", "dumpsys media.camera"])
    clients, client_name = 0, ""
    m = re.search(r"Active Camera Clients:\s*\[([^\]]*)\]", dump, re.S)
    if m:
        pkgs = re.findall(r"Client Package Name: ([\w.]+)", m.group(1))
        clients, client_name = len(pkgs), (pkgs[0] if pkgs else "")
    out("信号4  相机是否被使用  : %s" % (
        ("被 %s 使用中 [OK]" % client_name) if clients else "无 App 使用（相机未打开）"))

    # ---- 信号3：HAL 取帧超时 ----
    run([adb, "-s", SERIAL, "logcat", "-c"])
    time.sleep(6)
    n110 = len(re.findall(r"waitRelative error: -110", run([adb, "-s", SERIAL, "logcat", "-d"])))
    ok3 = n110 == 0
    out("信号3  6秒内取帧超时  : %d 次 %s" % (n110, "[OK]" if ok3 else "[NG] 管道不健康"))

    # ---- 信号2：摄像头是否被 ldccam 独占 ----
    ok2 = None
    if ff:
        tmp = os.path.join(os.environ.get("TEMP", "."), "_cam_probe.jpg")
        try:
            if os.path.exists(tmp):
                os.remove(tmp)
        except Exception:
            pass
        run([ff, "-hide_banner", "-loglevel", "error", "-f", "dshow",
             "-i", "video=%s" % cam, "-frames:v", "1", "-y", tmp], timeout=25)
        got = os.path.exists(tmp) and os.path.getsize(tmp) > 1000
        ok2 = not got
        if got and clients == 0:
            out("信号2  摄像头占用情况 : 空闲（相机没开，属正常）")
        else:
            out("信号2  摄像头占用情况 : %s" % (
                "被 ldccam 独占 [OK]（= 真摄像头）" if ok2
                else "空闲 [NG]（= 合成场景，ldcam 没在抓）"))
    else:
        out("信号2  摄像头占用情况 : 跳过（无 ffmpeg）")

    # ---- 结论 ----
    out()
    out("-" * 64)
    if clients == 0:
        out("结论：相机当前没有被任何 App 打开，无法判断画面真假")
        out("   · 请先打开相机界面，再重跑本脚本")
        out("-" * 64)
        return 2

    problems = []
    if not ok0:
        problems.append("模拟器没运行，先启动它")
    if not has_ldcam:
        problems.append("ldcam 进程缺失：关闭虚拟机内相机 → 重启模拟器")
    if ok2 is False:
        problems.append("摄像头空闲 = 当前是合成画面：关相机 → 杀 ldccam → 重启模拟器 → 再开相机")
    if not ok3:
        problems.append("存在取帧超时：相机管道不稳，画面可能卡住或回落")

    if not problems:
        out("结论：真摄像头画面，可以正常使用")
        out("-" * 64)
        return 0

    out("结论：当前画面是合成场景，或管道不健康")
    for p in problems:
        out("   · " + p)
    out("-" * 64)
    out()
    out("恢复步骤（按顺序）")
    out("  1) 虚拟机里退出相机界面")
    out("  2) 结束 ldcam.exe")
    out("     taskkill /F /IM ldcam.exe")
    out("  3) 重启模拟器（关窗口，再双击图标启动）")
    out("  4) 重新打开相机，重跑本脚本")
    return 1


if __name__ == "__main__":
    sys.exit(main())
