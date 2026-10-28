# apks

两个用于打通「雷电 9 里真摄像头」的极简 App，都是原生实现、只有 20 KB。

| 文件 | 包名 | 版本 | targetSdk | 用途 |
|---|---|---|---|---|
| `fixcam_v2.apk` | `com.fixcam.v2` | 1.0 | 29 | **必需**。装上后模拟器的相机服务才会正确挂载前置/后置 |
| `camprobe.apk` | `com.fix.cam` | — | 29 | 可选。相机链路诊断，画面异常时用它判断卡在哪一层 |

## 为什么 targetSdk 是 29

Android 11（API 30）起对摄像头与存储加了更严格的限制，高 targetSdk 的 App 在模拟器里拿不到 `ldcam` 送出的帧。
这两个 App 刻意停在 API 29，就是为了避开这些限制 —— 这是"摄像头能用"的关键，不是随便写低的。

## 安装

```bat
D:\leidian\LDPlayer9\adb.exe -s emulator-5554 install -r apks\fixcam_v2.apk
D:\leidian\LDPlayer9\adb.exe -s emulator-5554 install -r apks\camprobe.apk
```

## 验证是否生效

```bat
D:\leidian\LDPlayer9\adb.exe -s emulator-5554 shell dumpsys media.camera
```

看到 `Number of camera devices: 2` 就是挂上了（前置 + 后置）。显示 `0` 说明没生效，回去检查是否装成功、雷电 GUI 里是否选了摄像头设备。

## 来源

从已配置好的模拟器中通过 `adb pull` 导出：

```bat
adb shell pm path com.fixcam.v2          :: package:/data/app/.../base.apk
adb pull /data/app/.../base.apk fixcam_v2.apk
```
