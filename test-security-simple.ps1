# Quick Security Test Runner
# This can be run directly without changing execution policies

Write-Host "Running Security Tests..." -ForegroundColor Cyan

# Test basic PowerShell functionality
try {
    Write-Host "Testing PowerShell execution..." -ForegroundColor Yellow
    
    # Check if we can access the script directory
    if (Test-Path ".\scripts\security-test.ps1") {
        Write-Host "✅ Security test script found" -ForegroundColor Green
        
        # Try to run it with explicit execution policy
        Write-Host "Executing security tests..." -ForegroundColor Yellow
        
        # Use dot sourcing with explicit execution policy
        $result = powershell -ExecutionPolicy Bypass -NoProfile -Command "& '.\scripts\security-test.ps1'"
        
        if ($LASTEXITCODE -eq 0) {
            Write-Host "✅ Security tests completed successfully" -ForegroundColor Green
        } else {
            Write-Host "❌ Security tests failed" -ForegroundColor Red
        }
    } else {
        Write-Host "❌ Security test script not found at .\scripts\security-test.ps1" -ForegroundColor Red
    }
}
catch {
    Write-Host "❌ Error running security tests: $($_.Exception.Message)" -ForegroundColor Red
}
