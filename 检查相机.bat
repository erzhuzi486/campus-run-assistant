@echo off
chcp 65001 >nul
cd /d "%~dp0"
where python >nul 2>nul
if %errorlevel%==0 (
    python "%~dp0检查相机.py"
    echo.
    pause
    exit
)
for %%P in (
    "%LOCALAPPDATA%\Programs\Python\Python314\python.exe"
    "%LOCALAPPDATA%\Programs\Python\Python313\python.exe"
    "%LOCALAPPDATA%\Programs\Python\Python312\python.exe"
) do (
    if exist %%P (
        %%P "%~dp0检查相机.py"
        echo.
        pause
        exit
    )
)
echo [错误] 没有找到 Python，请先安装 Python 3.10+
pause