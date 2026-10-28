# -*- coding: utf-8 -*-
"""环境体检 —— 检查本机能否复现「定位投喂 + 摄像头可用」的目标环境。

用法：
    python doctor.py

输出一份对照报告：哪些达标、哪些要改、怎么改。
只读不写，不会修改任何配置。
"""
import glob
import json
import os
import re
import subprocess
import sys

# ---------------- 目标环境基线 ----------------
TARGET_VERSION_PREFIX = "9."          # 只有雷电 9 支持电脑摄像头
TARGET = {
    "resolution": (1920, 1080),
    "dpi": 280,
    "cpu": 6,
    "memory": 6144,
    "root": True,
    "adb": True,
    "fps": 60,
}
REQUIRED_APPS = {
    "com.fixcam.v2": "相机修复版（摄像头能用的关键）",
    "com.fix.cam": "CamProbe（相机链路诊断）",
}
# 业务 App：不在仓库里（体积 124 MB 超过 GitHub 单文件限制），需要自行获取
OPTIONAL_APPS = {
    "com.joyrunworld.app": "悦跑世界（校园跑平台 App）",
}

OK, WARN, BAD = "✓", "!", "✗"
rows = []


def add(level, item, detail, fix=""):
    rows.append((level, item, detail, fix))


def find_ldplayer():
    """按 环境变量 → 常见目录 → 盘符浅扫描 的顺序找雷电安装根目录"""
    cands = []
    env = os.environ.get("LDCONSOLE", "").strip('"')
    if env:
        cands.append(env)
    for d in (r"D:\leidian\LDPlayer9", r"D:\leidian\LDPlayer14",
              r"D:\LDPlayer\LDPlayer9", r"D:\LDPlayer\LDPlayer14",
              r"D:\雷电模拟器\leidian\LDPlayer9", r"D:\雷电模拟器\leidian\LDPlayer14",
              r"C:\LDPlayer\LDPlayer9", r"C:\LDPlayer\LDPlayer14",
              r"C:\Program Files\LDPlayer\LDPlayer9"):
        cands.append(os.path.join(d, "ldconsole.exe"))
    for drive in "CDEFG":
        root = drive + ":\\"
        if not os.path.exists(root):
            continue
        for pat in ("*/ldconsole.exe", "*/*/ldconsole.exe", "*/*/*/ldconsole.exe"):
            cands.extend(glob.glob(os.path.join(root, pat)))
    for c in cands:
        if c and os.path.isfile(c):
            return c
    return None


def run(cmd, timeout=15):
    try:
        p = subprocess.run(cmd, capture_output=True, timeout=timeout,
                           encoding="mbcs", errors="replace")
        return p.returncode, (p.stdout or "") + (p.stderr or "")
    except Exception as e:
        return -1, str(e)


def file_version(path):
    """读 exe 的文件版本号（不依赖第三方库）"""
    code, out = run(["powershell", "-NoProfile", "-Command",
                     f"(Get-Item '{path}').VersionInfo.FileVersion"])
    if code == 0 and out.strip():
        return out.strip()
    return ""


def check_ldplayer():
    ldc = find_ldplayer()
    if not ldc:
        add(BAD, "雷电安装", "未找到 ldconsole.exe",
            "装雷电 9.5.42（不要用 14），见 README「环境要求」")
        return None, None

    root = os.path.dirname(ldc)
    ver = file_version(os.path.join(root, "dnplayer.exe"))
    if ver.startswith(TARGET_VERSION_PREFIX):
        add(OK, "雷电版本", f"{ver}（9.x，支持电脑摄像头）")
    elif ver:
        add(BAD, "雷电版本", f"{ver}（不是 9.x）",
            "雷电 14 的 ldcam 送不出帧，必须换回 9.5.42")
    else:
        add(WARN, "雷电版本", "读不到版本号（文件可能不完整）")

    if os.path.isfile(os.path.join(root, "ldcam.exe")):
        add(OK, "ldcam.exe", "存在")
    else:
        add(BAD, "ldcam.exe", "缺失", "这个版本没有相机模块，换 9.5.42")

    return root, ldc


def check_instance(root, ldc):
    """用 list2 拿实时参数，用 vms/config 里的实例配置补 CPU/内存/Root 等"""
    code, out = run([ldc, "list2"])
    if code != 0:
        add(WARN, "实例列表", "ldconsole list2 调用失败", "确认雷电已安装完整")
        return

    # list2 列序：index,title,topHwnd,bindHwnd,isRunning,pid,vboxPid,width,height,dpi
    insts = []
    for line in out.splitlines():
        p = line.strip().split(",")
        if len(p) >= 10 and p[0].isdigit():
            insts.append(p)

    if not insts:
        add(BAD, "实例列表", "一个实例都没有", "打开雷电，新建一个模拟器实例")
        return

    p = insts[0]
    add(OK, "实例", f"{p[1]}（{'运行中' if p[4] == '1' else '未启动'}）")

    # 分辨率直接看 list2，最实时
    w, h, dpi = p[7], p[8], p[9]
    if (int(w), int(h)) == TARGET["resolution"] and int(dpi) == TARGET["dpi"]:
        add(OK, "分辨率/DPI", f"{w}x{h} @ {dpi}")
    else:
        add(WARN, "分辨率/DPI",
            f"当前 {w}x{h} @ {dpi}，目标 {TARGET['resolution'][0]}x{TARGET['resolution'][1]} @ {TARGET['dpi']}",
            "python apply_config.py")

    # 其余参数在实例配置文件里
    cfgs = [f for f in glob.glob(os.path.join(root, "vms", "config", "*.config"))
            if os.path.basename(f) != "leidians.config"]
    if not cfgs:
        add(WARN, "实例配置", "vms\\config 下没有实例配置", "先启动一次模拟器让它生成")
        return

    cfg_path = cfgs[0]
    try:
        cfg = json.load(open(cfg_path, encoding="utf-8"))
    except Exception as e:
        add(WARN, "实例配置", f"解析 {os.path.basename(cfg_path)} 失败：{e}")
        return

    cpu = cfg.get("advancedSettings.cpuCount")
    mem = cfg.get("advancedSettings.memorySize")
    if cpu == TARGET["cpu"] and mem == TARGET["memory"]:
        add(OK, "CPU/内存", f"{cpu} 核 / {mem} MB")
    else:
        add(WARN, "CPU/内存", f"当前 {cpu} 核 / {mem} MB，目标 {TARGET['cpu']} 核 / {TARGET['memory']} MB",
            "python apply_config.py")

    if cfg.get("basicSettings.rootMode"):
        add(OK, "Root", "已开启")
    else:
        add(BAD, "Root", "未开启", "必须开，否则摄像头与定位注入都可能失败")

    if cfg.get("basicSettings.adbDebug"):
        add(OK, "ADB 调试", "已开启")
    else:
        add(BAD, "ADB 调试", "未开启", "设置里打开「ADB 调试」")

    fps = cfg.get("basicSettings.fps")
    if fps == TARGET["fps"]:
        add(OK, "帧率", f"{fps} fps")
    else:
        add(WARN, "帧率", f"当前 {fps} fps，目标 {TARGET['fps']} fps（影响 ldcam 稳定性）",
            "python apply_config.py")


def check_camera():
    """枚举宿主机摄像头（雷电 9 需要手动选到具体设备）"""
    code, out = run(["powershell", "-NoProfile", "-Command",
                     "Get-PnpDevice -Class Camera,Image -ErrorAction SilentlyContinue | "
                     "Where-Object {$_.Status -eq 'OK'} | ForEach-Object {$_.FriendlyName}"])
    names = [x.strip() for x in out.splitlines() if x.strip() and "Get-PnpDevice" not in x]
    if names:
        add(OK, "宿主机摄像头", "、".join(names),
            "在雷电「设置 → 相机」里把前置/后置都选成这台设备")
    else:
        add(BAD, "宿主机摄像头", "没检测到可用摄像头",
            "检查 USB 摄像头是否插好、驱动是否正常，或被其他程序独占")


def check_adb(ldc_root):
    adb = os.path.join(ldc_root, "adb.exe")
    if not os.path.isfile(adb):
        add(WARN, "ADB", "雷电目录下没有 adb.exe", "装 platform-tools 或重装雷电")
        return

    code, out = run([adb, "devices"])
    devices = [l.split("\t")[0] for l in out.splitlines()
               if "\t" in l and "device" in l]
    if not devices:
        add(BAD, "ADB 连接", "没有在线设备",
            "先用桌面图标启动雷电（命令行启动 ADB 常打不开），确认已开 ADB 调试")
        return

    add(OK, "ADB 连接", f"{len(devices)} 台在线：{', '.join(devices)}")

    serial = devices[0]
    code, out = run([adb, "-s", serial, "shell", "pm", "list", "packages"])
    installed = {l.replace("package:", "").strip() for l in out.splitlines() if l.startswith("package:")}
    for pkg, desc in REQUIRED_APPS.items():
        if pkg in installed:
            add(OK, f"已装 {pkg}", desc)
        else:
            add(BAD, f"缺 {pkg}", desc,
                f'adb -s {serial} install -r apks/{pkg.replace(".", "_")}.apk')

    # 业务 App：装了才真正能跑，但不强制（不同学校平台可能不同）
    for pkg, desc in OPTIONAL_APPS.items():
        if pkg in installed:
            add(OK, f"已装 {pkg}", desc)
        else:
            add(WARN, f"未装 {pkg}", desc + " —— 工具本身能用，但模拟器里没东西可跑",
                "获取方式见 环境复刻.md「安装悦跑世界」，装好再执行 "
                f"adb -s {serial} install -r <apk路径>")


def main():
    print("=" * 62)
    print(" 校园跑助手 · 环境体检")
    print("=" * 62)
    print()

    root, ldc = check_ldplayer()
    if root and ldc:
        check_instance(root, ldc)
        check_adb(root)
    check_camera()

    width = max(len(r[1]) for r in rows) + 2
    for level, item, detail, fix in rows:
        print(f"[{level}] {item:<{width}} {detail}")
        if fix:
            print(f"      {'':<{width}} → {fix}")

    bad = sum(1 for r in rows if r[0] == BAD)
    warn = sum(1 for r in rows if r[0] == WARN)
    print()
    print("-" * 62)
    if bad == 0 and warn == 0:
        print("全部达标，环境与目标一致，可以直接用。")
    elif bad == 0:
        print(f"基本可用，有 {warn} 项与目标环境不同（不影响主流程）。")
    else:
        print(f"有 {bad} 项必须修复、{warn} 项建议对齐，按上面 → 的提示处理。")
    print("-" * 62)
    return 0 if bad == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
