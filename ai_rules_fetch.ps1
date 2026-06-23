# AI 规则集抓取合并脚本（PowerShell 版）
# 等价于原 bash 脚本逻辑

$ErrorActionPreference = "Continue"

$ScriptDir = "d:\test\318182456\mihomo-manager"
$OutFile   = Join-Path $ScriptDir "ai_combined.list"
$TmpDir    = Join-Path $env:TEMP "ai_rules_$(Get-Random)"
New-Item -ItemType Directory -Path $TmpDir -Force | Out-Null

Write-Host "临时目录: $TmpDir"
Write-Host "输出文件: $OutFile"
Write-Host ""

# 文本规则 URL
$urls = @(
    "https://raw.githubusercontent.com/juewuy/ShellClash/master/rules/ai.list"
    "https://raw.githubusercontent.com/DustinWin/domain-list-custom/domains/ai.list"
    "https://raw.githubusercontent.com/ACL4SSR/ACL4SSR/master/Clash/Ruleset/OpenAi.list"
    "https://raw.githubusercontent.com/cmliu/ACL4SSR/main/Clash/Copilot.list"
    "https://raw.githubusercontent.com/cmliu/ACL4SSR/main/Clash/GithubCopilot.list"
    "https://raw.githubusercontent.com/cmliu/ACL4SSR/main/Clash/Claude.list"
    "https://raw.githubusercontent.com/liandu2024/clash/main/list/AI.list"
)

# .mrs 二进制规则 URL（需 mihomo 转换，跳过提示）
$mrsUrls = @(
    "https://github.com/666OS/rules/raw/release/mihomo/domain/AI.mrs"
    "https://github.com/666OS/rules/raw/release/mihomo/ip/AI.mrs"
    "https://raw.githubusercontent.com/echs-top/proxy/main/mrs/domain/ai.mrs"
    "https://raw.githubusercontent.com/DustinWin/ruleset_geodata/refs/heads/mihomo-ruleset/ai.mrs"
    "https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/meta/geo/geosite/category-ai-!cn.mrs"
)

$combined = [System.Collections.Generic.List[string]]::new()

# --- 下载文本规则 ---
foreach ($u in $urls) {
    $fname   = [System.IO.Path]::GetFileName(($u -split '[?#]')[0])
    $outpath = Join-Path $TmpDir $fname
    Write-Host "下载: $u"
    try {
        Invoke-WebRequest -Uri $u -OutFile $outpath -UseBasicParsing -TimeoutSec 20 -ErrorAction Stop
        # 过滤注释和空行
        $lines = Get-Content $outpath -Encoding UTF8 | Where-Object { $_ -notmatch '^\s*(#|//|;|$)' }
        $combined.AddRange([string[]]$lines)
        Write-Host "  OK: $($lines.Count) 条"
    } catch {
        Write-Host "  警告：下载失败（跳过）: $($_.Exception.Message)"
    }
}

# --- .mrs 文件处理 ---
$mihomoCmd = Get-Command mihomo -ErrorAction SilentlyContinue
if ($mihomoCmd) {
    foreach ($u in $mrsUrls) {
        $fname   = [System.IO.Path]::GetFileName(($u -split '[?#]')[0])
        $outpath = Join-Path $TmpDir $fname
        Write-Host "下载 .mrs: $u"
        try {
            Invoke-WebRequest -Uri $u -OutFile $outpath -UseBasicParsing -TimeoutSec 20 -ErrorAction Stop
            $txtpath = $outpath -replace '\.mrs$', '.list'
            & mihomo convert-ruleset domain mrs $outpath $txtpath 2>&1 | Out-Null
            if (Test-Path $txtpath) {
                $lines = Get-Content $txtpath -Encoding UTF8 | Where-Object { $_ -notmatch '^\s*(#|//|;|$)' }
                $combined.AddRange([string[]]$lines)
                Write-Host "  转换 OK: $($lines.Count) 条"
            }
        } catch {
            Write-Host "  警告：失败（跳过）: $($_.Exception.Message)"
        }
    }
} else {
    Write-Host ""
    Write-Host "提示：未找到 mihomo，跳过 $($mrsUrls.Count) 个 .mrs 文件转换"
}

# --- 去重排序输出 ---
$totalRaw = $combined.Count
$unique   = $combined | Sort-Object -Unique
$unique | Set-Content $OutFile -Encoding UTF8

Write-Host ""
Write-Host "================================================"
Write-Host "合并完成"
Write-Host "  原始条目: $totalRaw"
Write-Host "  去重后:   $($unique.Count)"
Write-Host "  输出文件: $OutFile"
Write-Host "================================================"

# 清理临时目录
Remove-Item $TmpDir -Recurse -Force
