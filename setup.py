# -*- coding: utf-8 -*-
"""一键部署：把本机配置对齐到目标环境（相机设置仍需人工，见 AGENTS.md 第五节）。

用法：
    python setup.py --check     # 只体检，不改任何东西
    python setup.py             # 执行自动部署

自动完成的：对齐实例参数 → 安装相机修复 APK → 复检
不会做的：启动模拟器、设置摄像头（这两步需要人工或由 agent 另行安排）
"""
import glob
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))


def run(cmd, **kw):
    return subprocess.run(cmd, capture_output=True, encoding="mbcs", errors="replace", **kw)


def find_ldplayer():
    env = os.environ.get("LDCONSOLE", "").strip('"')
    if env and os.path.isfile(env):
        return os.path.dirname(env)
    for d in (r"D:\leidian\LDPlayer9", r"D:\LDPlayer\LDPlayer9",
              r"D:\雷电模拟器\leidian\LDPlayer9", r"C:\LDPlayer\LDPlayer9",
              r"C:\Program Files\LDPlayer\LDPlayer9"):
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


def main():
    check_only = "--check" in sys.argv
    try:
        sys.stdout.reconfigure(line_buffering=True)   # 避免与子进程输出顺序错乱
    except Exception:
        pass

    print("=" * 60)
    print(" 校园跑助手 · 一键部署")
    print("=" * 60)

    # 1. 找雷电
    root = find_ldplayer()
    if not root:
        print("\n✗ 没找到雷电 9 的 ldconsole.exe")
        print("  → 到雷电官网下载「雷电 9」安装（不要装雷电 14）")
        print("  → 装完重跑本脚本，或手动指定：set LDCONSOLE=<路径>\\ldconsole.exe")
        return 1
    print(f"\n雷电目录：{root}")

    ver = ""
    try:
        p = run(["powershell", "-NoProfile", "-Command",
                 f"(Get-Item '{os.path.join(root, 'dnplayer.exe')}').VersionInfo.FileVersion"])
        ver = (p.stdout or "").strip()
    except Exception:
        pass
    if not ver.startswith("9."):
        print(f"✗ 版本是 {ver or '未知'}，不是 9.x")
        print("  → 雷电 14 的相机模块不可用，必须换回雷电 9")
        return 1
    print(f"版本：{ver} ✓")

    if check_only:
        print("\n[--check] 只体检，不修改：\n")
        return subprocess.run([sys.executable, os.path.join(HERE, "doctor.py")]).returncode

    # 2. 模拟器必须是关闭状态
    ldc = os.path.join(root, "ldconsole.exe")
    p = run([ldc, "runninglist"])
    if (p.stdout or "").strip():
        print("\n✗ 模拟器正在运行，配置改动会被覆盖")
        print(f"  → 先执行：\"{ldc}\" quitall")
        print("  → 然后重跑本脚本；启动时请用桌面图标（命令行启动 ADB 常打不开）")
        return 1
    print("模拟器已关闭 ✓")

    # 3. 对齐实例参数
    print("\n[1/3] 对齐实例参数…")
    p = subprocess.run([sys.executable, os.path.join(HERE, "apply_config.py")],
                       encoding="mbcs", errors="replace")
    if p.returncode != 0:
        print("  ✗ apply_config.py 执行失败，先处理上面的报错")
        return 1

    # 4. 装 APK（需要模拟器在跑，这里给指引）
    print("\n[2/3] 安装相机修复 APK")
    print("  这一步需要模拟器正在运行，脚本不会替你启动。请：")
    print("    ① 用桌面图标启动雷电，等完全进入桌面")
    print(f"    ② 执行：\"{os.path.join(root, 'adb.exe')}\" devices   :: 要看到一台 device")
    print(f"    ③ 执行：\"{os.path.join(root, 'adb.exe')}\" -s emulator-5554 install -r apks\\fixcam_v2.apk")
    print(f"    ④ 执行：\"{os.path.join(root, 'adb.exe')}\" -s emulator-5554 install -r apks\\camprobe.apk")
    print("    ⑤ 业务 App（悦跑世界 com.joyrunworld.app）不在仓库里（124MB 超 GitHub 限制），")
    print("       获取与安装方式见 环境复刻.md「第三步之二：装悦跑世界」")

    # 5. 复检
    print("\n[3/3] 复检")
    print("  装完 APK 并设置好摄像头后，执行：python doctor.py")
    print("  看到「全部达标」即完成。")
    print("\n部署流程到此结束。摄像头需要在雷电 GUI 里手动选设备，见 AGENTS.md 第五节。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
