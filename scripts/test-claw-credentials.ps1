# Synthetic Windows-user encryption only. No real credential or provider is accessed.
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'claw-credential-store.ps1')
$temp = Join-Path ([IO.Path]::GetTempPath()) ('crucible-credential-test-' + [guid]::NewGuid().ToString('N'))
$null = New-Item -ItemType Directory -Path $temp
$names = @('LOCALAPPDATA','ANTHROPIC_API_KEY','ANTHROPIC_AUTH_TOKEN','CRUCIBLE_CLAW_EXE','CLAW_TEST_TOKEN','CLAW_TEST_KEY')
$previous = @{}
foreach ($name in $names) { $previous[$name] = [Environment]::GetEnvironmentVariable($name,'Process') }
function Assert($condition,[string]$message) { if (-not $condition) { throw $message } }
try {
    $env:LOCALAPPDATA = $temp
    $env:ANTHROPIC_API_KEY = $null
    $env:ANTHROPIC_AUTH_TOKEN = $null
    Assert ($null -eq (Read-ClawCredential)) 'Missing store must remain optional.'
    Write-Output 'PASS: no saved credential is optional'
    $synthetic = ('sk-ant-' + 'synthetic-test-only')
    $credentialInput = ConvertTo-SecureString $synthetic -AsPlainText -Force
    try { Save-ClawCredential $credentialInput } finally { $credentialInput.Dispose() }
    $path = Get-ClawCredentialPath
    Assert (-not [IO.File]::ReadAllText($path).Contains($synthetic)) 'Plaintext was saved.'
    $loaded = Read-ClawCredential
    try { Assert (([PSCredential]::new('test',$loaded)).GetNetworkCredential().Password -ceq $synthetic) 'DPAPI round trip failed.' } finally { $loaded.Dispose() }
    Write-Output 'PASS: saved ciphertext decrypts for the same Windows user'
    $acl = Get-Acl -LiteralPath (Split-Path -Parent $path)
    $sid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
    $rules = @($acl.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier]))
    Assert ($acl.AreAccessRulesProtected -and $rules.Count -eq 1 -and $rules[0].IdentityReference.Value -eq $sid) 'Storage ACL is not private to this Windows user.'
    Write-Output 'PASS: credential directory has private user ACL'
    $mock = Join-Path $temp 'fake-claw.ps1'
    [IO.File]::WriteAllText($mock, 'if ($env:ANTHROPIC_AUTH_TOKEN -cne $env:CLAW_TEST_TOKEN -or $env:ANTHROPIC_API_KEY -cne $env:CLAW_TEST_KEY) { exit 31 }; exit 0')
    $env:CRUCIBLE_CLAW_EXE = $mock
    $env:CLAW_TEST_TOKEN = $synthetic
    $env:CLAW_TEST_KEY = $null
    foreach ($session in 1..2) {
        & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'claw.ps1') prompt synthetic-only
        Assert ($LASTEXITCODE -eq 0) 'A fresh session did not load the saved login.'
    }
    Write-Output 'PASS: two fresh processes reuse the login without prompts'
    $oldPath = $env:PATH
    & (Join-Path $PSScriptRoot 'claw.ps1') prompt synthetic-only
    Assert ($LASTEXITCODE -eq 0 -and -not $env:ANTHROPIC_AUTH_TOKEN -and $env:PATH -ceq $oldPath) 'Credential or PATH leaked into parent environment.'
    Write-Output 'PASS: wrapper restores parent environment'
    [IO.File]::WriteAllText($path,'deliberately corrupt fixture')
    $env:ANTHROPIC_AUTH_TOKEN = 'explicit-session-token'
    $env:CLAW_TEST_TOKEN = $env:ANTHROPIC_AUTH_TOKEN
    & (Join-Path $PSScriptRoot 'claw.ps1') prompt synthetic-only
    Assert ($LASTEXITCODE -eq 0 -and $env:ANTHROPIC_AUTH_TOKEN -ceq 'explicit-session-token') 'Explicit token precedence failed.'
    $env:ANTHROPIC_AUTH_TOKEN = $null
    $env:CLAW_TEST_TOKEN = $null
    $env:ANTHROPIC_API_KEY = 'explicit-session-key'
    $env:CLAW_TEST_KEY = $env:ANTHROPIC_API_KEY
    & (Join-Path $PSScriptRoot 'claw.ps1') prompt synthetic-only
    Assert ($LASTEXITCODE -eq 0 -and $env:ANTHROPIC_API_KEY -ceq 'explicit-session-key') 'Explicit API key precedence failed.'
    Write-Output 'PASS: explicit token and API key override saved credentials'
    $env:ANTHROPIC_API_KEY = $null
    $env:CLAW_TEST_KEY = $null
    foreach ($flag in @('--help','--version','-V','help','version')) {
        & (Join-Path $PSScriptRoot 'claw.ps1') $flag
        Assert ($LASTEXITCODE -eq 0) 'Metadata probe decrypted corrupt store.'
    }
    Write-Output 'PASS: metadata probes never decrypt the store'
    $rejected = $false
    try { $null = Read-ClawCredential } catch { $rejected = $_.Exception.Message -like 'Saved Claw credential cannot be decrypted*' }
    Assert $rejected 'Corrupt store was accepted or unsafe error printed.'
    Write-Output 'PASS: corrupt ciphertext fails safely'
    Write-Output 'RESULT: 8 passed; 0 failed'
} finally {
    foreach ($name in $names) { [Environment]::SetEnvironmentVariable($name,$previous[$name],'Process') }
    $resolved = [IO.Path]::GetFullPath($temp)
    $tempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\') + '\'
    if (-not $resolved.StartsWith($tempRoot,[StringComparison]::OrdinalIgnoreCase) -or (Split-Path -Leaf $resolved) -notmatch '^crucible-credential-test-[0-9a-f]{32}$') { throw 'Unsafe test cleanup path.' }
    Remove-Item -LiteralPath $resolved -Recurse -Force
}
