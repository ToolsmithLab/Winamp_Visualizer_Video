param(
    [Parameter(Mandatory = $true)]
    [string]$ElectronPath,
    [Parameter(Mandatory = $true)]
    [string]$Workspace,
    [Parameter(Mandatory = $true)]
    [int]$Port,
    [Parameter(Mandatory = $true)]
    [string]$UserDataDirectory,
    [Parameter(Mandatory = $true)]
    [string]$StandardOutputLog,
    [Parameter(Mandatory = $true)]
    [string]$StandardErrorLog,
    [switch]$Packaged
)

$ErrorActionPreference = "Stop"
$env:ELECTRON_RUN_AS_NODE = $null
$env:ELECTRON_ENABLE_LOGGING = "1"
Set-Location -LiteralPath $Workspace

$launchArguments = @(
    "--noerrdialogs",
    "--remote-debugging-port=$Port",
    "--user-data-dir=$UserDataDirectory"
)
if (-not $Packaged) {
    $launchArguments += "."
}
$launchArguments += "--avs-runtime-test"

& $ElectronPath @launchArguments `
    1> $StandardOutputLog `
    2> $StandardErrorLog

exit $LASTEXITCODE
