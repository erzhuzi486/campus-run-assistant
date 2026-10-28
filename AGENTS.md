# AGENTS.md

> 给 AI 编码助手的部署指令。人类读者请直接看 [`README.md`](README.md) 和 [`环境复刻.md`](环境复刻.md)。

**你是谁**：你正在一台 Windows 电脑上，任务是把本仓库部署成可运行状态。

**最终目标**：让这台电脑能跑「校园跑定位投喂工具」——雷电 9 模拟器 + 定位注入 + 摄像头可用。

**完成判定**：执行 `python doctor.py`，退出码为 `0` 且末尾输出「全部达标，环境与目标一致」。
达不到就不要报告完成。

---

## 一、先探测，别急着装

按顺序执行，遇到非预期结果就停下并报告：

```bat
python --version        :: 需要 3.10+，且必须带 tkinter
node --version          :: 需要 16+，仅「配速规划台」需要
python -c "import tkinter; print('tk ok')"
```

如果 `python` 不存在，先装 Python 3.10+ 并勾选 **Add Python to PATH**。

**然后立刻检查是否已经部署过**：

```bat
python doctor.py
```

- 全绿 → **直接跳到第六节**，不要再动任何东西
- 有红色 `✗` → 按下面顺序处理，只处理报红的项
- 命令本身报错 → 说明在本仓库目录外执行，先 `cd` 到仓库根目录

---

## 二、雷电模拟器：必须是 9.x，不能是 14

先探测：

```bat
python -c "import os,glob;print('\n'.join(glob.glob('D:/leidian/*/ldconsole.exe')+glob.glob('C:/LDPlayer/*/ldconsole.exe')))"
```

**如果找到了 9.x 的 ldconsole.exe** → 记下它的目录，跳到第三节。

**如果只找到 14** → 告诉用户必须改装雷电 9.5.42。不要尝试修 14，它的 `ldcam.exe` 相机模块坏了（开相机时进程数为 0、HAL 返回纯色、JPEG 全零），改任何设置都救不回来。

**如果什么都没找到** → 让用户去雷电官网下载 **雷电 9**（9.5.42 或更新的 9.x），装到默认路径即可。脚本会自动探测，不要求装在 D 盘。

判断版本的命令：

```bat
powershell -NoProfile -Command "(Get-Item '<雷电目录>\dnplayer.exe').VersionInfo.FileVersion"
```

输出必须以 `9.` 开头。

---

## 三、对齐实例参数

**必须先完全关闭雷电**（运行中被改会被覆写）：

```bat
ldconsole.exe quitall
```

然后：

```bat
python apply_config.py --dry-run    :: 先看要改什么
python apply_config.py              :: 确认后写入
```

脚本只改这 7 项：分辨率 1920×1080、DPI 280、CPU 6 核、内存 6144 MB、Root 开、ADB 开、帧率 60。

**不要**手动修改 `vms/config/*.config` 里的 IMEI / IMSI / AndroidID / MAC —— 那些是设备指纹，每台机器各自生成，改了反而出问题。

如果脚本报「模拟器正在运行」，回到上一步 `quitall` 后重试。

---

## 四、安装相机修复 App（摄像头能用的关键）

重启雷电（**用桌面图标启动，不要用命令行**，命令行启动时 ADB 经常不打开），等它完全起来，然后：

```bat
<雷电目录>\adb.exe devices
```

要看到至少一台 `device` 状态。若为空，先确认雷电设置里「ADB 调试」是开的，再重试。

然后装两个包：

```bat
<雷电目录>\adb.exe -s emulator-5554 install -r apks\fixcam_v2.apk
<雷电目录>\adb.exe -s emulator-5554 install -r apks\camprobe.apk
```

`fixcam_v2.apk` 是**必需**的。它的 `targetSdkVersion=29` 是刻意设低的，用来绕开 Android 11+ 对摄像头的限制。没有它，模拟器里相机会挂不上。

设备号不是 `emulator-5554` 时，用 `adb devices` 输出里的实际值替换。

---

## 五、摄像头设置（唯一必须人工的一步）

**这一步你无法代劳**，必须让用户手动操作，然后等用户确认完成：

> 雷电右上角菜单 → 设置 → 相机
> 1. 「前置摄像头」选 **电脑摄像头**
> 2. 设备下拉里选**用户自己那台摄像头**（每台机器名字不同，不要照抄作者的 `HD webcam`）
> 3. 「后置摄像头」同样设置
> 4. 保存

这些设置不落盘（不在 `leidian0.config`，也不在注册表），脚本无法写入。

设置完可以验证：

```bat
<雷电目录>\adb.exe -s emulator-5554 shell dumpsys media.camera
```

输出里 `Number of camera devices:` 应该是 **2**。是 `0` 就让用户回去检查设备下拉是否选中了。

---

## 六、验收

```bat
python doctor.py
```

必须看到「全部达标，环境与目标一致」。有红项按提示回去处理。

然后启动主程序确认界面能起来：

```bat
一键刷跑.vbs
```

**顺手建个桌面快捷方式**（这样桌面图标和作者一致，双击直达、无黑框）：

```bat
python install_shortcut.py
```

脚本会自动找 `pythonw.exe`，把快捷方式的图标指向仓库里的 `app.ico`。不给 `--out` 就建到桌面。

---

## 七、失败处理

| 现象 | 判断 | 处理 |
|---|---|---|
| `doctor.py` 报版本 14.x | 装错版本 | 重装雷电 9，14 的相机模块不可用 |
| `adb devices` 为空 | ADB 没起来 | 用桌面图标重启雷电；确认设置里 ADB 调试已开 |
| `Number of camera devices: 0` | 相机没挂上 | 确认 `fixcam_v2.apk` 安装成功 → 确认 GUI 里选了设备 → 确认摄像头没被微信/腾讯会议独占 |
| 相机画面纯色/淡青色 | ldcam 占着设备不送帧 | 重插 USB 摄像头；设备管理器里禁用再启用；换 USB 口 |
| `apply_config.py` 报找不到配置 | 雷电没启动过 | 启动一次雷电让它生成 `vms/config/*.config` |
| 4:3 画面被压扁 | 已知限制 | 用 16:9 档位，640×480 是 1280×720 横向压缩 18.5% 得来的 |

---

## 八、禁止事项

- **不要**把 `vms/`、`*.vmdk`、`*.vdi` 加进仓库或上传 —— 那是几十 GB 的个人实例镜像
- **不要**升级到雷电 14
- **不要**修改 IMEI / IMSI / AndroidID / MAC 等设备指纹
- **不要**为了让 `doctor.py` 变绿而改脚本里的判定阈值 —— 那是验收标准，不是障碍
- **不要**在模拟器运行中修改实例配置
- 定位注入只在**用户自己的模拟器**里跑，不要接到真实设备

---

## 九、仓库结构速查

```
run_gui.py          图形界面主程序（tkinter）
apply_config.py     一键对齐实例参数
doctor.py           环境体检 / 验收
local-agent.js      配速规划台的 AI 桥（可选，node local-agent.js）
apks/               相机修复与诊断 APK
core.js             轨迹算法（browser + node 共用）
环境复刻.md          人类可读的完整复刻指南
```

技术原理与实测数据见 `技术原理.md`，踩过的坑见 `踩坑记录.md`。
