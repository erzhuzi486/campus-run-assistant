# -*- coding: utf-8 -*-
"""把雷电实例配置对齐到目标基线（1920x1080@280 / 6核6GB / Root / ADB / 60fps）。

用法：
    python apply_config.py --dry-run   # 先看会改什么，不动文件
    python apply_config.py             # 实际写入（需先关闭模拟器）

只修改下面这几项，其余字段（IMEI、机型、共享目录等）原样保留，不动你的设备指纹。
原配置会备份成 <实例名>.config.bak。
"""
import glob
import json
import os
import shutil
import subprocess
import sys

TARGET = {
    "advancedSettings.resolution": {"width": 1920, "height": 1080},
    "advancedSettings.resolutionDpi": 280,
    "advancedSettings.cpuCount": 6,
    "advancedSettings.memorySize": 6144,
    "basicSettings.rootMode": True,
    "basicSettings.adbDebug": 1,
    "basicSettings.fps": 60,
}

SEARCH_DIRS = [
    r"D:\leidian\LDPlayer9", r"D:\leidian\LDPlayer14",
    r"D:\LDPlayer\LDPlayer9", r"D:\LDPlayer\LDPlayer14",
    r"D:\雷电模拟器\leidian\LDPlayer9", r"D:\雷电模拟器\leidian\LDPlayer14",
    r"C:\LDPlayer\LDPlayer9", r"C:\LDPlayer\LDPlayer14",
    r"C:\Program Files\LDPlayer\LDPlayer9",
]


def find_root():
    env = os.environ.get("LDCONSOLE", "").strip('"')
    if env and os.path.isfile(env):
        return os.path.dirname(env)
    for d in SEARCH_DIRS:
        if os.path.isfile(os.path.join(d, "ldconsole.exe")):
            return d
    for drive in "CDEFG":
        root = drive + ":\\"
        if not os.path.exists(root):
            continue
        for pat in ("*/ldconsole.exe", "*/*/ldconsole.exe", "*/*/*/ldconsole.exe"):
            hits = glob.glob(os.path.join(root, pat))
            if hits:
                return os.path.dirname(hits[0])
    return None


def is_running(ldc):
    try:
        p = subprocess.run([ldc, "runninglist"], capture_output=True, timeout=15,
                           encoding="mbcs", errors="replace")
        return bool((p.stdout or "").strip())
    except Exception:
        return False


def find_config(root):
    cands = [f for f in glob.glob(os.path.join(root, "vms", "config", "*.config"))
             if os.path.basename(f) != "leidians.config"]
    return cands[0] if cands else None


def main():
    dry = "--dry-run" in sys.argv

    root = find_root()
    if not root:
        print("✗ 没找到雷电安装目录。先确认已装雷电 9，或设置环境变量 LDCONSOLE 指向 ldconsole.exe")
        return 1
    print(f"雷电目录：{root}")

    cfg_path = find_config(root)
    if not cfg_path:
        print("✗ 没找到实例配置（vms\\config\\*.config）。先启动一次模拟器让它生成。")
        return 1

    cfg = json.load(open(cfg_path, encoding="utf-8"))
    print(f"实例配置：{os.path.basename(cfg_path)}")
    print()

    changes = []
    for key, want in TARGET.items():
        cur = cfg.get(key)
        if cur == want:
            print(f"  = {key}: {cur}")
        else:
            print(f"  * {key}: {cur}  ->  {want}")
            changes.append((key, want))

    if not changes:
        print("\n已经是目标配置，无需修改。")
        return 0

    if dry:
        print(f"\n[dry-run] 共 {len(changes)} 项待修改，未写入。去掉 --dry-run 实际执行。")
        return 0

    if is_running(os.path.join(root, "ldconsole.exe")):
        print("\n✗ 模拟器正在运行，改动会被覆盖。请先关闭雷电再执行。")
        return 1

    bak = cfg_path + ".bak"
    shutil.copy2(cfg_path, bak)
    print(f"\n已备份 -> {os.path.basename(bak)}")

    for key, want in changes:
        cfg[key] = want

    with open(cfg_path, "w", encoding="utf-8") as f:
        json.dump(cfg, f, ensure_ascii=False, indent=4)

    print(f"已写入 {len(changes)} 项。启动雷电后 python doctor.py 复检。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
