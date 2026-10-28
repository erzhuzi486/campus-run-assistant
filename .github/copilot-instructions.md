# Copilot / AI 助手部署说明

本仓库的部署与验收标准见根目录 **`AGENTS.md`**。

要点：

1. 目标平台是 **Windows + 雷电模拟器 9.x**（不能用 14，它的相机模块是坏的）
2. 验收命令：`python doctor.py`，退出码 0 且输出「全部达标」即完成
3. 自动化脚本：`python apply_config.py` 对齐实例参数（需先 `ldconsole quitall`）
4. 相机修复 APK 在 `apks/`，必须安装才能让摄像头挂上
5. 摄像头设备选择**必须人工**在雷电 GUI 完成，无法脚本化

详细步骤、失败排查、禁止事项全部在 `AGENTS.md`。
