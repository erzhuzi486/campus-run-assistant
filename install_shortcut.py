# -*- coding: utf-8 -*-
"""在桌面创建「一键刷跑」快捷方式（带自定义图标）。

用法：
    python install_shortcut.py                # 创建到桌面
    python install_shortcut.py --out <目录>   # 创建到指定目录（测试用）

等价于手动「右键 → 新建快捷方式」，只是把图标、工作目录、参数都配好了。
不依赖 pywin32，走系统自带的 WScript.Shell。
"""
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
LNK_NAME = "一键刷跑.lnk"

PYW_CANDIDATES = [
    os.path.expandvars(r"%LOCALAPPDATA%\Programs\Python\Python314\pythonw.exe"),
    os.path.expandvars(r"%LOCALAPPDATA%\Programs\Python\Python313\pythonw.exe"),
    os.path.expandvars(r"%LOCALAPPDATA%\Programs\Python\Python312\pythonw.exe"),
    os.path.expandvars(r"%LOCALAPPDATA%\Programs\Python\Python311\pythonw.exe"),
    os.path.expandvars(r"%LOCALAPPDATA%\Programs\Python\Python310\pythonw.exe"),
    r"C:\Python314\pythonw.exe",
    r"C:\Python313\pythonw.exe",
    r"C:\Python312\pythonw.exe",
]


def find_pythonw():
    for p in PYW_CANDIDATES:
        if os.path.isfile(p):
            return p
    # 兜底：PATH 里的 pythonw
    for d in os.environ.get("PATH", "").split(os.pathsep):
        p = os.path.join(d, "pythonw.exe")
        if os.path.isfile(p):
            return p
    return None


def desktop_dir():
    out = subprocess.run(
        ["powershell", "-NoProfile", "-Command", "[Environment]::GetFolderPath('Desktop')"],
        capture_output=True, text=True, encoding="mbcs", errors="replace")
    d = (out.stdout or "").strip()
    return d if d and os.path.isdir(d) else os.path.expanduser("~/Desktop")


def main():
    out_dir = None
    if "--out" in sys.argv:
        i = sys.argv.index("--out")
        if i + 1 < len(sys.argv):
            out_dir = sys.argv[i + 1]
    if not out_dir:
        out_dir = desktop_dir()

    target = os.path.join(HERE, "run_gui.py")
    icon = os.path.join(HERE, "app.ico")

    if not os.path.isfile(target):
        print(f"✗ 找不到 {target}，请在项目目录内运行本脚本")
        return 1

    pyw = find_pythonw()
    if not pyw:
        print("✗ 没找到 pythonw.exe")
        print("  → 安装 Python 3.10+ 并勾选 Add Python to PATH")
        return 1
    print(f"pythonw : {pyw}")

    os.makedirs(out_dir, exist_ok=True)
    lnk = os.path.join(out_dir, LNK_NAME)

    # 用 WScript.Shell 建快捷方式；路径用单引号包裹，内部单引号转义
    def q(s):
        return "'" + s.replace("'", "''") + "'"

    ps = (
        f"$sh = New-Object -ComObject WScript.Shell; "
        f"$s = $sh.CreateShortcut({q(lnk)}); "
        f"$s.TargetPath = {q(pyw)}; "
        f"$s.Arguments = {q('\"' + target + '\"')}; "
        f"$s.WorkingDirectory = {q(HERE)}; "
        f"$s.IconLocation = {q(icon + ',0')}; "
        f"$s.Description = '校园跑 · 定位投喂工具'; "
        f"$s.WindowStyle = 1; "
        f"$s.Save()"
    )

    r = subprocess.run(["powershell", "-NoProfile", "-Command", ps],
                       capture_output=True, text=True, encoding="mbcs", errors="replace")
    if r.returncode != 0:
        print("✗ 创建失败：")
        print((r.stderr or r.stdout or "").strip()[:500])
        return 1

    if os.path.isfile(lnk):
        print(f"✓ 已创建：{lnk}")
        print(f"  目标：{target}")
        print(f"  图标：{icon}")
        print("  双击即可启动（无控制台黑框）")
        return 0

    print("✗ 命令执行了但没生成文件，请手动检查")
    return 1


if __name__ == "__main__":
    sys.exit(main())
