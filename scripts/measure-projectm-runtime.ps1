param(
  [Parameter(Mandatory = $true)]
  [string]$AppDirectory,
  [Parameter(Mandatory = $true)]
  [string]$OutputPath,
  [int]$DurationSeconds = 6
)

$resolvedAppDirectory = (Resolve-Path -LiteralPath $AppDirectory).Path
$samples = [System.Collections.Generic.List[object]]::new()
$started = Get-Date
$previousCpu = @{}
$previousAt = $started
$modules = @()

while (((Get-Date) - $started).TotalSeconds -lt $DurationSeconds) {
  $now = Get-Date
  $processes = Get-Process -ErrorAction SilentlyContinue | Where-Object {
    ($_.Path -and $_.Path.StartsWith($resolvedAppDirectory, [System.StringComparison]::OrdinalIgnoreCase)) -or
    $_.ProcessName -eq "projectm-host"
  }
  $elapsed = [Math]::Max(0.001, ($now - $previousAt).TotalSeconds)
  foreach ($process in $processes) {
    $key = $process.Id
    $cpuSeconds = if ($null -ne $process.CPU) { [double]$process.CPU } else { 0.0 }
    $previous = if ($previousCpu.ContainsKey($key)) { [double]$previousCpu[$key] } else { $cpuSeconds }
    $cpuPercent = (($cpuSeconds - $previous) / $elapsed) * 100.0
    $previousCpu[$key] = $cpuSeconds
    $samples.Add([pscustomobject]@{
      at = $now.ToString("o")
      id = $process.Id
      name = $process.ProcessName
      cpuPercentOfOneCore = [Math]::Round([Math]::Max(0, $cpuPercent), 2)
      workingSetMb = [Math]::Round($process.WorkingSet64 / 1MB, 2)
      privateMb = [Math]::Round($process.PrivateMemorySize64 / 1MB, 2)
      handles = $process.HandleCount
      threads = $process.Threads.Count
      path = $process.Path
    })
    if ($process.ProcessName -eq "projectm-host" -and $modules.Count -eq 0) {
      try {
        $modules = $process.Modules | ForEach-Object {
          [pscustomobject]@{
            name = $_.ModuleName
            path = $_.FileName
            version = $_.FileVersionInfo.FileVersion
          }
        } | Where-Object {
          $_.name -in @(
            "projectm-host.exe",
            "projectM-4.dll",
            "glew32.dll",
            "msvcp140.dll",
            "vcruntime140.dll",
            "vcruntime140_1.dll",
            "opengl32.dll"
          )
        }
      } catch {
        $modules = @()
      }
    }
  }
  $previousAt = $now
  Start-Sleep -Milliseconds 500
}

$summary = [pscustomobject]@{
  durationSeconds = $DurationSeconds
  logicalProcessors = [Environment]::ProcessorCount
  peakAggregateWorkingSetMb = [Math]::Round(
    ($samples | Group-Object at | ForEach-Object {
      ($_.Group | Measure-Object workingSetMb -Sum).Sum
    } | Measure-Object -Maximum).Maximum,
    2
  )
  peakAggregatePrivateMb = [Math]::Round(
    ($samples | Group-Object at | ForEach-Object {
      ($_.Group | Measure-Object privateMb -Sum).Sum
    } | Measure-Object -Maximum).Maximum,
    2
  )
  peakAggregateHandles = (
    $samples | Group-Object at | ForEach-Object {
      ($_.Group | Measure-Object handles -Sum).Sum
    } | Measure-Object -Maximum
  ).Maximum
  peakProjectMWorkingSetMb = (
    $samples | Where-Object name -eq "projectm-host" |
    Measure-Object workingSetMb -Maximum
  ).Maximum
  peakProjectMHandles = (
    $samples | Where-Object name -eq "projectm-host" |
    Measure-Object handles -Maximum
  ).Maximum
  peakProjectMCpuPercentOfOneCore = (
    $samples | Where-Object name -eq "projectm-host" |
    Measure-Object cpuPercentOfOneCore -Maximum
  ).Maximum
}

$report = [pscustomobject]@{
  generatedAt = (Get-Date).ToString("o")
  appDirectory = $resolvedAppDirectory
  summary = $summary
  loadedModules = $modules
  samples = $samples
}

$parent = Split-Path -Parent $OutputPath
if ($parent) {
  New-Item -ItemType Directory -Path $parent -Force | Out-Null
}
$report | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $OutputPath -Encoding UTF8
$summary | Format-List
