param(
  [Parameter(Mandatory=$true)][ValidateSet('guard', 'shortcuts')][string]$Action,
  [string]$AppId = ''
)
$ErrorActionPreference = 'Stop'
if ($Action -eq 'guard') {
  $memory = (Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory * 1024
  $lockPath = "$env:USERPROFILE\.copilot\mizan-host.lock"
  $present = Test-Path $lockPath
  $owned = $false
  if ($present -and $env:PLAY100_HOST_LOCK_TOKEN) {
    $lock = Get-Content -LiteralPath $lockPath -Raw | ConvertFrom-Json
    $owned = $lock.token -ceq $env:PLAY100_HOST_LOCK_TOKEN -and
      $lock.holder -eq 'play-100 readiness lane (57722abf)' -and
      [DateTimeOffset]::Parse($lock.expectedRelease) -gt [DateTimeOffset]::Now
  }
  @{
    lockPresent = $present
    lockOwned = $owned
    lockExpiresAt = $(if ($owned) { $lock.expectedRelease } else { $null })
    freeBytes = $memory
    platform = (Get-CimInstance Win32_OperatingSystem).Caption
  } | ConvertTo-Json -Compress
  exit
}
if ($AppId -notmatch '^[a-p]{32}$') { throw 'Invalid Chrome application identity.' }
$shell = New-Object -ComObject WScript.Shell
$roots = @(
  [Environment]::GetFolderPath('StartMenu'),
  [Environment]::GetFolderPath('CommonStartMenu'),
  [Environment]::GetFolderPath('DesktopDirectory'),
  [Environment]::GetFolderPath('CommonDesktopDirectory')
) | Select-Object -Unique
$matches = @(
  foreach ($root in $roots) {
    if (-not (Test-Path -LiteralPath $root)) { continue }
    foreach ($file in Get-ChildItem -LiteralPath $root -Filter '*.lnk' -Recurse -File) {
      $shortcut = $shell.CreateShortcut($file.FullName)
      if ($shortcut.Arguments -match "--app-id=$AppId(?:\s|$)") {
        @{
          path = $file.FullName
          arguments = $shortcut.Arguments
          target = $shortcut.TargetPath
          startMenu = $root -in @([Environment]::GetFolderPath('StartMenu'), [Environment]::GetFolderPath('CommonStartMenu'))
        }
      }
    }
  }
)
ConvertTo-Json -InputObject $matches -Compress
