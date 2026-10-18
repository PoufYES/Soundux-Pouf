param([ValidateSet('start')][string]$Action = 'start')
$ErrorActionPreference = 'Stop'
try {
    & (Join-Path $PSScriptRoot 'start.ps1')
} catch {
    Add-Type -AssemblyName System.Windows.Forms
    [void][Windows.Forms.MessageBox]::Show($_.Exception.Message, 'Soundux - Controle web')
}
