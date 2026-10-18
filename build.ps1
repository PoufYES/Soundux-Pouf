$ErrorActionPreference = 'Stop'
$vswhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio/Installer/vswhere.exe'
$vs = & $vswhere -latest -products '*' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
if (-not $vs) { throw 'Instale o Visual Studio Build Tools com ferramentas C++.' }
$cmake = Join-Path $vs 'Common7/IDE/CommonExtensions/Microsoft/CMake/CMake/bin/cmake.exe'
$buildRoot = Join-Path $env:TEMP 'soundux-source-build'
New-Item -ItemType Directory -Path $buildRoot -Force | Out-Null
$nuget = Join-Path $buildRoot 'nuget.exe'
if (-not (Test-Path -LiteralPath $nuget)) {
    Invoke-WebRequest 'https://dist.nuget.org/win-x86-commandline/v6.14.0/nuget.exe' -OutFile $nuget
}
$previousPath = $env:PATH
try {
    $env:PATH = $buildRoot + ';' + $env:PATH
    $ErrorActionPreference = 'Continue'
    & $cmake -S $PSScriptRoot -B (Join-Path $buildRoot 'build') -G 'Visual Studio 17 2022' -A x64 -DEMBED_PATH=OFF
    if ($LASTEXITCODE) { throw 'Falha na configuracao CMake.' }
    & $cmake --build (Join-Path $buildRoot 'build') --config Release --parallel 4
    if ($LASTEXITCODE) { throw 'Falha na compilacao.' }
    $ErrorActionPreference = 'Stop'
    & python (Join-Path $PSScriptRoot 'remote-control/prepare-ui.py')
    if ($LASTEXITCODE) { throw 'Falha ao preparar a interface.' }
    Copy-Item -LiteralPath (Join-Path $buildRoot 'build/Release/soundux.exe') -Destination (Join-Path $PSScriptRoot 'soundux.exe') -Force
} finally { $env:PATH = $previousPath }
Write-Output 'Compilado: soundux.exe na raiz do projeto.'
