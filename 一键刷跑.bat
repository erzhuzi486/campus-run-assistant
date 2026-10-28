@echo off
chcp 65001 >nul
cd /d "%~dp0"

rem 优先用 PATH 里的 python；找不到再试常见安装位置
where python >nul 2>nul
if %errorlevel%==0 (
    start "" python "%~dp0run_gui.py"
    exit
)

for %%P in (
    "%LOCALAPPDATA%\Programs\Python\Python314\python.exe"
    "%LOCALAPPDATA%\Programs\Python\Python313\python.exe"
    "%LOCALAPPDATA%\Programs\Python\Python312\python.exe"
) do (
    if exist %%P (
        start "" %%P "%~dp0run_gui.py"
        exit
    )
)

echo [错误] 没有找到 Python，请先安装 Python 3.10+ 并勾选 Add to PATH
echo 下载地址: https://www.python.org/downloads/
pause