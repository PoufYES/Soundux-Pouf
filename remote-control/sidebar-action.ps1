param([ValidateSet('start','copy')][string]$Action = 'start')
$ErrorActionPreference = 'Stop'
try {
    if ($Action -eq 'start') {
        & (Join-Path $PSScriptRoot 'start.ps1')
    } else {
        & (Join-Path $PSScriptRoot 'copy-link.ps1')
    }
} catch {
    Add-Type -AssemblyName System.Windows.Forms
    [void][Windows.Forms.MessageBox]::Show($_.Exception.Message, 'Soundux - Controle web')
}
