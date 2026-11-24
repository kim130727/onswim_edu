param(
    [ValidateSet("setup", "python-test", "student-typecheck", "student-test", "editor-build", "check")]
    [string]$Task = "check"
)

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot
$MobileRoot = Join-Path $RepoRoot "apps/mobile"
$EditorRoot = Join-Path $RepoRoot "src/modu_math_web/editor_next"

function Invoke-PythonTests {
    Push-Location $RepoRoot
    try {
        $env:PYTHONPATH = Join-Path $RepoRoot "src"
        uv run pytest
        if ($LASTEXITCODE -ne 0) { throw "Python tests failed" }
    }
    finally {
        Pop-Location
    }
}

function Invoke-StudentTypecheck {
    Push-Location $MobileRoot
    try {
        npm run typecheck
        if ($LASTEXITCODE -ne 0) { throw "Student app typecheck failed" }
    }
    finally {
        Pop-Location
    }
}

function Invoke-StudentTests {
    Push-Location $MobileRoot
    try {
        npm run test
        if ($LASTEXITCODE -ne 0) { throw "Student app tests failed" }
    }
    finally {
        Pop-Location
    }
}

function Invoke-EditorBuild {
    Push-Location $EditorRoot
    try {
        npm run typecheck
        if ($LASTEXITCODE -ne 0) { throw "Editor typecheck failed" }
        npm run build
        if ($LASTEXITCODE -ne 0) { throw "Editor build failed" }
    }
    finally {
        Pop-Location
    }
}

switch ($Task) {
    "setup" {
        Push-Location $MobileRoot; npm install; Pop-Location
        Push-Location $EditorRoot; npm install; Pop-Location
    }
    "python-test" {
        Invoke-PythonTests
    }
    "student-typecheck" {
        Invoke-StudentTypecheck
    }
    "student-test" {
        Invoke-StudentTests
    }
    "editor-build" {
        Invoke-EditorBuild
    }
    "check" {
        Invoke-PythonTests
        Invoke-StudentTypecheck
        Invoke-StudentTests
        Invoke-EditorBuild
    }
}
