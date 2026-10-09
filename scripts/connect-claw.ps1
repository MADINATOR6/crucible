# Run once in the user's interactive console. Never supply the key as an argument.
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'claw-credential-store.ps1')
Write-Host 'One-time Claw login: paste your full Anthropic API key at the hidden prompt.'
Write-Host 'It will be encrypted for your Windows account, outside the repository.'
$credentialInput = Read-Host 'API key (hidden)' -AsSecureString
try {
    $plain = ([PSCredential]::new('claw',$credentialInput)).GetNetworkCredential().Password.Trim()
    if ($plain -notmatch '^sk-ant-\S+$') { throw 'Use the full Anthropic secret, not the key ID.' }
    $trimmed = ConvertTo-SecureString $plain -AsPlainText -Force
    Save-ClawCredential $trimmed
    Write-Host 'Saved. Both agents can now use scripts/claw.ps1 without another key prompt.'
    Write-Host 'This saves the key only; it does not make an API request or confirm billing.'
} catch {
    Write-Host 'Claw login could not be saved. No key or raw error was printed.'
    exit 1
} finally {
    if ($credentialInput) { $credentialInput.Dispose() }
    if ($trimmed) { $trimmed.Dispose() }
    Remove-Variable credentialInput,trimmed,plain -ErrorAction SilentlyContinue
}
