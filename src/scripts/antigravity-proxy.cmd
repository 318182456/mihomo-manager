@echo off
setlocal
rem Portable user proxy environment settings. No system proxy changes or app launch.
rem Requires an existing HTTP/mixed proxy listener (for example Mihomo).
rem Other applications reading user proxy settings will also be affected.
set "PROXY_SERVER=127.0.0.1:7890"
set "PROXY_URL=http://%PROXY_SERVER%"

if /I "%~1"=="set" goto set_proxy
if /I "%~1"=="clear" goto clear_proxy
if /I "%~1"=="check" goto check_proxy
if not "%~1"=="" goto usage

echo User proxy environment: %PROXY_URL%
echo.
echo   1. Set proxy environment variables
echo   2. Clear proxy environment variables
echo   3. Exit
echo.
choice /C 123 /N /M "Select [1/2/3]: "
if errorlevel 255 goto usage
if errorlevel 3 exit /b 0
if errorlevel 2 goto clear_proxy
if errorlevel 1 goto set_proxy
exit /b 0

:set_proxy
rem setx persists to the current user's environment, not the machine environment.
setx HTTP_PROXY "%PROXY_URL%" >nul
if errorlevel 1 goto failed
setx HTTPS_PROXY "%PROXY_URL%" >nul
if errorlevel 1 goto failed
setx ALL_PROXY "%PROXY_URL%" >nul
if errorlevel 1 goto failed
setx NO_PROXY "localhost,127.0.0.1,::1" >nul
if errorlevel 1 goto failed
echo.
echo Proxy environment saved for the current Windows user: %PROXY_URL%
echo Keep Mihomo running. No application was started.
goto refresh_notice

:clear_proxy
for %%V in (HTTP_PROXY HTTPS_PROXY ALL_PROXY NO_PROXY) do (
    reg query "HKCU\Environment" /v %%V >nul 2>&1
    if not errorlevel 1 (
        reg delete "HKCU\Environment" /v %%V /f >nul
        if errorlevel 1 goto failed
    )
)
echo.
echo User HTTP_PROXY, HTTPS_PROXY, ALL_PROXY and NO_PROXY removed.
echo Windows system proxy settings were not changed.
goto refresh_notice

:check_proxy
echo Read-only check of current user proxy environment variables:
for %%V in (HTTP_PROXY HTTPS_PROXY ALL_PROXY NO_PROXY) do reg query "HKCU\Environment" /v %%V 2>nul
exit /b 0

:refresh_notice
echo.
echo Already-running processes keep their old environment.
echo Save your work and sign out, then sign in, for reliable manual app launches.
echo This script will not sign out, close or start your applications.
pause
exit /b 0

:failed
echo.
echo A setting could not be changed. Some earlier changes may have succeeded.
echo Check user proxy settings before retrying.
pause
exit /b 1

:usage
echo Usage: %~nx0 [set^|clear^|check]
exit /b 1
