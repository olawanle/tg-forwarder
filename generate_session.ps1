param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$GeneratorArgs
)

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
    throw "Python was not found. Install Python 3.12+ and reopen PowerShell."
}

Write-Host "Installing session-generator dependencies..."
python -m pip install -q -r requirements.txt
if ($LASTEXITCODE -ne 0) {
    throw "Dependency installation failed."
}

Write-Host ""
python -m forwarder.bootstrap_telegram @GeneratorArgs
if ($LASTEXITCODE -ne 0) {
    throw "Session generation failed."
}
