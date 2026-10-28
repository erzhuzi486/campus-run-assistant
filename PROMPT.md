# 部署提示词

把这个文件里的内容复制给别的电脑上的 AI 助手，它就能自己完成部署。

---

## 标准版（推荐，直接整段复制）

```text
请帮我在这台 Windows 电脑上部署一个开源工具，仓库地址：

https://github.com/erzhuzi486/campus-run-assistant

要求：

1. 先把仓库弄到本地。git clone 不通就用 zip 包下载：
   https://github.com/erzhuzi486/campus-run-assistant/archive/refs/heads/main.zip

2. 读仓库根目录的 AGENTS.md —— 那是专门写给 AI 的部署说明书，严格按它执行。

3. 目标状态：运行 python doctor.py 输出「全部达标，环境与目标一致」，且退出码为 0。
   达不到就不要说部署完成。

4. 中途需要我在雷电模拟器 GUI 里手动选摄像头时，停下来告诉我具体点哪里、选什么。
   这一步不要试图用脚本代劳。

5. 缺 Python / Node.js / 雷电模拟器时，先告诉我该装哪个版本（雷电必须 9.x，不能 14），
   等我确认再装。

6. 不要修改 doctor.py 里的判定阈值来让检查通过。

7. 卡住时把完整报错贴给我，不要自己猜着改代码。
```

---

## 极简版（对方上下文有限时用）

```text
部署 https://github.com/erzhuzi486/campus-run-assistant
读 AGENTS.md 照做，直到 python doctor.py 全绿。
要在雷电里选摄像头时停下来问我。别改 doctor.py 的判定值。
```

---

## 只能读网页、不能执行命令的 AI

这种情况它帮不了部署，只能当说明书用。直接问它：

```text
请阅读 https://raw.githubusercontent.com/erzhuzi486/campus-run-assistant/main/环境复刻.md
然后一步一步指导我在这台 Windows 电脑上操作。
我有：雷电模拟器（版本我待会儿告诉你）、Python、一个 USB 摄像头。
```

---

## 手动部署的命令清单

不想用 AI 的话，按这个顺序敲：

```bat
:: 0. 拿代码
git clone https://github.com/erzhuzi486/campus-run-assistant.git
cd campus-run-assistant

:: 1. 看现状差什么
python doctor.py

:: 2. 装雷电 9（不要 14）后，先完全关闭它，再对齐参数
python apply_config.py

:: 3. 用桌面图标启动雷电，等进入桌面后装相机包
<雷电目录>\adb.exe devices
<雷电目录>\adb.exe -s emulator-5554 install -r apks\fixcam_v2.apk
<雷电目录>\adb.exe -s emulator-5554 install -r apks\camprobe.apk

:: 4. 手动设置：雷电右上角菜单 → 设置 → 相机 → 前置/后置都选「电脑摄像头」+ 你的设备

:: 5. 验收 + 建快捷方式
python doctor.py
python install_shortcut.py
```

---

## 部署完成后应该看到

```text
[✓] 雷电版本          9.5.42.0（9.x，支持电脑摄像头）
[✓] ldcam.exe        存在
[✓] 实例              雷电模拟器（运行中）
[✓] 分辨率/DPI         1920x1080 @ 280
[✓] CPU/内存          6 核 / 6144 MB
[✓] Root             已开启
[✓] ADB 调试          已开启
[✓] 帧率              60 fps
[✓] ADB 连接          1 台在线：emulator-5554
[✓] 已装 com.fixcam.v2 相机修复版（摄像头能用的关键）
[✓] 已装 com.fix.cam   CamProbe（相机链路诊断）
[✓] 宿主机摄像头         <你的摄像头名字>
--------------------------------------------------------------
全部达标，环境与目标一致，可以直接用。
```

最后一行不是「全部达标」，就是还有项目没配好，按上面的 `→` 提示继续处理。
