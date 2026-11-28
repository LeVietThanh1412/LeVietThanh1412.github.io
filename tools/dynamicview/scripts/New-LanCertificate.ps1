param([System.Net.IPAddress[]]$Address)

$ErrorActionPreference = 'Stop'
$folder = Join-Path $PSScriptRoot '../.certs'
$openssl = Get-Command openssl.exe -ErrorAction SilentlyContinue
$gitOpenSsl = Join-Path $env:ProgramFiles 'Git/usr/bin/openssl.exe'
if (Test-Path -LiteralPath $gitOpenSsl) { $openssl = Get-Item -LiteralPath $gitOpenSsl }
if (-not $openssl) { throw 'Can cai Git for Windows hoac OpenSSL de tao chung chi.' }
$executable = if ($openssl.Source) { $openssl.Source } else { $openssl.FullName }

function Invoke-OpenSsl {
    & $executable @args
    if ($LASTEXITCODE -ne 0) { throw "OpenSSL gap loi ($LASTEXITCODE)." }
}

if (-not $Address) {
    $Address = Get-NetIPAddress -AddressFamily IPv4 |
        Where-Object IPAddress -Match '^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)' |
        Select-Object -ExpandProperty IPAddress
}
$names = @('DNS:localhost', 'IP:127.0.0.1', 'IP:::1')
$names += $Address | ForEach-Object { "IP:$_" }
$names = ($names | Select-Object -Unique) -join ','
New-Item -ItemType Directory -Path $folder -Force | Out-Null
Push-Location $folder
try {
    @"
[req]
distinguished_name = dn
[dn]
[ca]
basicConstraints = critical,CA:true,pathlen:0
keyUsage = critical,keyCertSign,cRLSign
subjectKeyIdentifier = hash
[server]
basicConstraints = critical,CA:false
keyUsage = critical,digitalSignature,keyEncipherment
extendedKeyUsage = serverAuth
subjectAltName = $names
subjectKeyIdentifier = hash
authorityKeyIdentifier = keyid,issuer
"@ | Set-Content -Encoding Ascii -LiteralPath 'lan-openssl.cnf'
    if (-not (Test-Path -LiteralPath 'rootCA.pem')) {
        if (Test-Path -LiteralPath 'rootCA-key.pem') { throw 'Thieu rootCA.pem cua khoa hien tai.' }
        Invoke-OpenSsl req -new -x509 -newkey rsa:3072 -noenc -sha256 -days 1825 -config lan-openssl.cnf -extensions ca -subj /CN=DynamicView-Local-CA -keyout rootCA-key.pem -out rootCA.pem
    }
    Invoke-OpenSsl x509 -in rootCA.pem -outform DER -out rootCA.crt
    Invoke-OpenSsl req -new -newkey rsa:2048 -noenc -config lan-openssl.cnf -subj /CN=localhost -keyout server-key.pem -out server.csr
    Invoke-OpenSsl x509 -req -in server.csr -CA rootCA.pem -CAkey rootCA-key.pem -CAcreateserial -out server.pem -days 365 -sha256 -extfile lan-openssl.cnf -extensions server
    Invoke-OpenSsl verify -CAfile rootCA.pem server.pem
} finally {
    Pop-Location
}
Write-Host "Chung chi cho $names"
Write-Host 'Khoi dong lai server. Cai .certs/rootCA.crt tren dien thoai, sau do mo HTTPS.'
