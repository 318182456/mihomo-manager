@echo off
setlocal
set "CHROME_JP_SCRIPT=%~f0"
set "CHROME_JP_MODE=%~1"
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -Command "$source=[IO.File]::ReadAllText($env:CHROME_JP_SCRIPT,[Text.Encoding]::UTF8); $marker='#'+' POWERSHELL_PAYLOAD'; $offset=$source.IndexOf($marker); if($offset -lt 0){exit 1}; & ([ScriptBlock]::Create($source.Substring($offset+$marker.Length)))"
set "CHROME_JP_RESULT=%ERRORLEVEL%"
if /I "%CHROME_JP_MODE%"=="--check" exit /b %CHROME_JP_RESULT%
echo.
pause
exit /b %CHROME_JP_RESULT%
# POWERSHELL_PAYLOAD
$ErrorActionPreference = 'Stop'
$chromeData = Join-Path $env:LOCALAPPDATA 'Google\Chrome\User Data'
$statePath = Join-Path $chromeData 'Local State'
$backupPath = $null
$chromeWasClosed = $false
$chromeRestarted = $false
$chromeExe = $null
$profileName = 'Default'

function Start-UserChrome {
    Start-Process -FilePath $chromeExe -ArgumentList @(
        ('--profile-directory="{0}"' -f $profileName),
        '--restore-last-session'
    ) | Out-Null
}

try {
    Write-Host 'Chrome 地区一键切换：日本' -ForegroundColor Cyan
    Write-Host '仅调整 Chrome 本地地区，不修改 Clash、Google 账号或付款国家。'

    if (-not (Test-Path -LiteralPath $statePath -PathType Leaf)) {
        throw '未找到当前 Windows 用户的 Chrome 配置。请先启动一次正式版 Chrome。'
    }
    $initial = [IO.File]::ReadAllText($statePath) | ConvertFrom-Json
    if ($initial.profile.last_used) { $profileName = $initial.profile.last_used }
    if ($profileName -notmatch '^(Default|Profile \d+)$') {
        throw '当前 Chrome 配置目录名称不符合预期，未进行修改。'
    }

    $chromePaths = @(
        (Join-Path $env:ProgramFiles 'Google\Chrome\Application\chrome.exe'),
        (Join-Path ${env:ProgramFiles(x86)} 'Google\Chrome\Application\chrome.exe'),
        (Join-Path $env:LOCALAPPDATA 'Google\Chrome\Application\chrome.exe')
    )
    $chromeExe = $chromePaths | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } | Select-Object -First 1
    if (-not $chromeExe) { throw '未找到正式版 Chrome 程序。' }

    if ($env:CHROME_JP_MODE -eq '--check') {
        Write-Host ('检查通过：配置 {0}；将设置 variations_permanent_overridden_country=jp。' -f $profileName)
        Write-Host '检查模式：未关闭 Chrome，也未修改任何配置。'
        exit 0
    }

    $currentSession = (Get-Process -Id $PID).SessionId
    # 排除 Playwright 等使用独立 user-data-dir 的浏览器，只处理同一登录会话的正式版 Chrome。
    $roots = @(Get-CimInstance Win32_Process -Filter "Name = 'chrome.exe'" | Where-Object {
        $_.SessionId -eq $currentSession -and
        $_.ExecutablePath -ieq $chromeExe -and
        $_.CommandLine -and
        $_.CommandLine -notmatch '--type=' -and
        $_.CommandLine -notmatch '--user-data-dir(?:=|\s)'
    })
    if ($roots.Count) {
        Write-Host '正在正常关闭 Chrome，请先保存未提交的网页内容……' -ForegroundColor Yellow
        foreach ($root in $roots) {
            $proc = Get-Process -Id $root.ProcessId -ErrorAction SilentlyContinue
            if ($proc) { $null = $proc.CloseMainWindow() }
        }
        $deadline = [DateTime]::UtcNow.AddSeconds(12)
        do {
            Start-Sleep -Milliseconds 400
            $remaining = @($roots | Where-Object { Get-Process -Id $_.ProcessId -ErrorAction SilentlyContinue })
        } while ($remaining.Count -gt 0 -and [DateTime]::UtcNow -lt $deadline)

        if ($remaining.Count) {
            $answer = Read-Host 'Chrome 仍有后台进程。确认网页内容已保存，强制关闭并继续？输入 Y 确认，其他输入取消'
            if ($answer -notmatch '^[yY]$') { throw '操作已取消，地区配置未修改。' }
            foreach ($root in $remaining) {
                # 再核对进程身份，防止 PID 被其他进程复用。
                $live = Get-CimInstance Win32_Process -Filter ('ProcessId = {0}' -f $root.ProcessId)
                if ($live -and $live.ExecutablePath -ieq $chromeExe -and $live.CreationDate -eq $root.CreationDate) {
                    & taskkill.exe /PID $root.ProcessId /T /F | Out-Null
                    if ($LASTEXITCODE -ne 0) { throw 'Chrome 关闭失败，地区配置未修改。' }
                }
            }
        }
        $chromeWasClosed = $true
    }

    # 修改前再次检查默认用户数据是否仍被 Chrome 使用。
    $stillRunning = @(Get-CimInstance Win32_Process -Filter "Name = 'chrome.exe'" | Where-Object {
        $_.SessionId -eq $currentSession -and $_.ExecutablePath -ieq $chromeExe -and
        $_.CommandLine -and $_.CommandLine -notmatch '--type=' -and
        $_.CommandLine -notmatch '--user-data-dir(?:=|\s)'
    })
    if ($stillRunning.Count) { throw 'Chrome 尚未完全退出，未修改配置。' }

    $original = [IO.File]::ReadAllText($statePath)
    $state = $original | ConvertFrom-Json
    # 新版 Chrome 的地区种子已迁移至独立文件，使用其内置的永久地区覆盖配置。
    $state | Add-Member -NotePropertyName 'variations_permanent_overridden_country' -NotePropertyValue 'jp' -Force
    $updated = $state | ConvertTo-Json -Depth 100 -Compress
    $backupPath = [IO.Path]::GetTempFileName()
    [IO.File]::WriteAllText($backupPath, $original, [Text.UTF8Encoding]::new($false))
    try {
        [IO.File]::WriteAllText($statePath, $updated, [Text.UTF8Encoding]::new($false))
        $check = [IO.File]::ReadAllText($statePath) | ConvertFrom-Json
        if ($check.variations_permanent_overridden_country -ne 'jp') { throw '地区设置回读校验失败。' }
    } catch {
        [IO.File]::WriteAllText($statePath, $original, [Text.UTF8Encoding]::new($false))
        throw
    }

    Start-UserChrome
    $chromeRestarted = $true
    Write-Host '已设置为日本（jp），并重新打开 Chrome，尝试恢复原标签页。' -ForegroundColor Green
    Write-Host '中文界面保持不变。Gemini 仍需可用的网络出口和符合条件的账号。'
} catch {
    Write-Host ('操作未完成：' + $_.Exception.Message) -ForegroundColor Red
    if ($chromeWasClosed -and -not $chromeRestarted -and $chromeExe) {
        try { Start-UserChrome } catch { Write-Host '请手动重新打开 Chrome。' }
    }
    exit 1
} finally {
    if ($backupPath -and (Test-Path -LiteralPath $backupPath -PathType Leaf)) {
        Remove-Item -LiteralPath $backupPath -Force
    }
}
