$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
$runDir = Join-Path $env:LOCALAPPDATA 'Soundux-Pouf'
$tokenPath = Join-Path $runDir 'remote-token'
if (-not (Test-Path -LiteralPath $tokenPath)) {
    throw 'Clique em INICIAR WEB antes de copiar o link.'
}

# Re-read addresses and Windows route priorities on every click. Ignore VPNs,
# virtual switches, loopback and disconnected adapters when choosing the LAN.
$adapters = @(Get-NetAdapter | Where-Object { $_.Status -eq 'Up' -and $_.HardwareInterface })
$interfaces = @(Get-NetIPInterface -AddressFamily IPv4)
$routes = @(Get-NetRoute -AddressFamily IPv4 -DestinationPrefix '0.0.0.0/0' -ErrorAction SilentlyContinue)
$candidates = @(foreach ($adapter in $adapters) {
    $interface = $interfaces | Where-Object { $_.InterfaceIndex -eq $adapter.ifIndex } | Select-Object -First 1
    $route = $routes | Where-Object { $_.InterfaceIndex -eq $adapter.ifIndex } | Sort-Object RouteMetric | Select-Object -First 1
    foreach ($address in @(Get-NetIPAddress -InterfaceIndex $adapter.ifIndex -AddressFamily IPv4 -ErrorAction SilentlyContinue)) {
        if ($address.AddressState -ne 'Preferred' -or $address.SkipAsSource -or
            $address.IPAddress -like '169.254.*' -or $address.IPAddress -like '127.*') { continue }
        [pscustomobject]@{
            IP = $address.IPAddress
            NoGateway = if ($route) { 0 } else { 1 }
            Metric = [long]$interface.InterfaceMetric + $(if ($route) { [long]$route.RouteMetric } else { 0 })
            Index = $adapter.ifIndex
        }
    }
})
$selected = $candidates | Sort-Object NoGateway, Metric, Index, IP | Select-Object -First 1
if (-not $selected) { throw 'Nenhuma conexao de rede local ativa. Conecte o Wi-Fi ou o cabo e tente novamente.' }
$token = (Get-Content -LiteralPath $tokenPath -Raw).Trim()
if (-not $token) { throw 'Chave do controle indisponivel. Clique em INICIAR WEB.' }
$link = 'http://' + $selected.IP + ':3210/?key=' + [uri]::EscapeDataString($token)
# Clipboard.SetText retries temporary clipboard contention internally.
[Windows.Forms.Clipboard]::SetText($link)
