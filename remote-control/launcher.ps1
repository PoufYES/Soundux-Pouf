param([switch]$CopyLink)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[Windows.Forms.Application]::EnableVisualStyles()
$runDir = Join-Path $env:LOCALAPPDATA 'Soundux-Pouf'
$script:addresses = @()

$form = New-Object Windows.Forms.Form
$form.Text = 'Soundux - Controle no celular'
$form.ClientSize = New-Object Drawing.Size(570, 290)
$form.StartPosition = 'CenterScreen'
$form.FormBorderStyle = 'FixedDialog'
$form.MaximizeBox = $false
$start = New-Object Windows.Forms.Button
$start.Text = 'Iniciar / abrir controle'
$start.SetBounds(20, 20, 530, 42)
$label = New-Object Windows.Forms.Label
$label.Text = 'Conexao do PC usada pelo celular (Wi-Fi, cabo ou rede USB):'
$label.SetBounds(20, 80, 530, 24)
$networks = New-Object Windows.Forms.ComboBox
$networks.DropDownStyle = 'DropDownList'
$networks.SetBounds(20, 108, 530, 28)
$copy = New-Object Windows.Forms.Button
$copy.Text = 'Copiar link do celular'
$copy.SetBounds(20, 150, 530, 40)
$status = New-Object Windows.Forms.Label
$status.SetBounds(20, 205, 530, 65)
$form.Controls.AddRange(@($start, $label, $networks, $copy, $status))

function Update-Networks {
    $selected = if ($networks.SelectedIndex -ge 0) { $script:addresses[$networks.SelectedIndex].IP } else { '' }
    $items = @(Get-NetIPConfiguration -ErrorAction SilentlyContinue |
        Where-Object { $_.NetAdapter.Status -eq 'Up' } |
        Sort-Object @{Expression={if ($_.IPv4DefaultGateway) { 0 } else { 1 }}}, InterfaceAlias |
        ForEach-Object {
            $adapter = $_
            foreach ($ip in $adapter.IPv4Address.IPAddress) {
                if ($ip -and $ip -ne '127.0.0.1' -and $ip -notlike '169.254.*') {
                    [pscustomobject]@{ IP = $ip; Label = "$($adapter.InterfaceAlias) - $ip" }
                }
            }
        })
    if (($items.Label -join '|') -ne ($script:addresses.Label -join '|')) {
        $script:addresses = $items
        $networks.Items.Clear()
        foreach ($item in $items) { [void]$networks.Items.Add($item.Label) }
        if ($items.Count) {
            $networks.SelectedIndex = 0
            for ($i = 0; $i -lt $items.Count; $i++) {
                if ($items[$i].IP -eq $selected) { $networks.SelectedIndex = $i }
            }
        }
    }
    $copy.Enabled = ($items.Count -gt 0 -and (Test-Path -LiteralPath (Join-Path $runDir 'remote-token')))
}

$start.Add_Click({
    $start.Enabled = $false
    $status.Text = 'Iniciando o controle...'
    $form.Refresh()
    try {
        & (Join-Path $PSScriptRoot 'start.ps1')
        Update-Networks
        $status.Text = 'Controle aberto. Selecione a conexao e copie o link para o celular.'
    } catch {
        $status.Text = 'Falha ao iniciar: ' + $_.Exception.Message
    } finally { $start.Enabled = $true }
})
$copy.Add_Click({
    try {
        Update-Networks
        if ($networks.SelectedIndex -lt 0) { throw 'Nenhuma conexao de rede disponivel.' }
        if (-not (Get-NetTCPConnection -LocalPort 3210 -State Listen -ErrorAction SilentlyContinue)) {
            throw 'Clique em Iniciar / abrir controle primeiro.'
        }
        $token = (Get-Content -LiteralPath (Join-Path $runDir 'remote-token') -Raw).Trim()
        $ip = $script:addresses[$networks.SelectedIndex].IP
        [Windows.Forms.Clipboard]::SetText("http://${ip}:3210/?key=$token")
        $status.Text = "Link completo copiado ($ip). Abra no celular. Se mudar de rede, copie novamente."
    } catch { $status.Text = $_.Exception.Message }
})
$timer = New-Object Windows.Forms.Timer
$timer.Interval = 5000
$timer.Add_Tick({ try { Update-Networks } catch { $status.Text = 'Nao foi possivel atualizar as conexoes: ' + $_.Exception.Message } })
$form.Add_Shown({
    try { Update-Networks } catch { $status.Text = $_.Exception.Message }
    $timer.Start()
    if ($CopyLink -and $copy.Enabled) { $copy.PerformClick() }
})
$form.Add_FormClosed({ $timer.Stop(); $timer.Dispose() })
$status.Text = 'Inicie o controle e copie o link. PC e celular precisam ter acesso pela mesma rede.'
[void]$form.ShowDialog()
$form.Dispose()
