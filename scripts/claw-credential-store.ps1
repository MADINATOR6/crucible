# Windows DPAPI binds ciphertext to this Windows account on this machine.
function Get-ClawCredentialPath {
    Join-Path $env:LOCALAPPDATA 'Crucible\credentials\claw.dpapi'
}
function Read-ClawCredential {
    $path = Get-ClawCredentialPath
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { return $null }
    foreach ($entry in @((Split-Path -Parent (Split-Path -Parent $path)),(Split-Path -Parent $path),$path)) {
        if ((Get-Item -LiteralPath $entry).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Linked credential storage refused.' }
    }
    try { return (ConvertTo-SecureString ([IO.File]::ReadAllText($path)) -ErrorAction Stop) }
    catch { throw 'Saved Claw credential cannot be decrypted. Run scripts/connect-claw.ps1 again in your own console.' }
}
function Save-ClawCredential([Security.SecureString]$Secret) {
    if (-not $Secret -or $Secret.Length -eq 0) { throw 'Empty Claw credential refused.' }
    $path = Get-ClawCredentialPath
    $folder = Split-Path -Parent $path
    $parent = Split-Path -Parent $folder
    foreach ($entry in @($parent,$folder,$path)) {
        if ((Test-Path -LiteralPath $entry) -and ((Get-Item -LiteralPath $entry).Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Linked credential storage refused.' }
    }
    $null = New-Item -ItemType Directory -Path $folder -Force
    $sid = [Security.Principal.WindowsIdentity]::GetCurrent().User
    $acl = New-Object Security.AccessControl.DirectorySecurity
    $acl.SetOwner($sid)
    $acl.SetAccessRuleProtection($true,$false)
    $rule = New-Object Security.AccessControl.FileSystemAccessRule($sid,'FullControl','ContainerInherit,ObjectInherit','None','Allow')
    $acl.AddAccessRule($rule)
    Set-Acl -LiteralPath $folder -AclObject $acl -ErrorAction Stop
    $tempFile = Join-Path $folder ([guid]::NewGuid().ToString('N') + '.tmp')
    try {
        $encrypted = ConvertFrom-SecureString $Secret -ErrorAction Stop
        [IO.File]::WriteAllText($tempFile,$encrypted,(New-Object Text.UTF8Encoding($false)))
        Move-Item -LiteralPath $tempFile -Destination $path -Force -ErrorAction Stop
    } finally { if (Test-Path -LiteralPath $tempFile) { Remove-Item -LiteralPath $tempFile -Force } }
}
