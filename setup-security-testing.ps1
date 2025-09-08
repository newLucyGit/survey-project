# PowerShell Security Test Setup Script
# Run this once to configure your environment for automatic security testing

Write-Host "Setting up Security Testing Environment..." -ForegroundColor Cyan
Write-Host "=======================================" -ForegroundColor Cyan

# Check current execution policy
Write-Host "`nCurrent PowerShell Execution Policy:" -ForegroundColor Yellow
Get-ExecutionPolicy -List | Format-Table -AutoSize

# Check if we need to change the policy
$currentPolicy = Get-ExecutionPolicy -Scope CurrentUser
if ($currentPolicy -eq "Restricted" -or $currentPolicy -eq "Undefined") {
    Write-Host "`nCurrent policy blocks script execution" -ForegroundColor Red
    Write-Host "Configuring RemoteSigned policy for CurrentUser..." -ForegroundColor Green
    
    try {
        Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser -Force
        Write-Host "Successfully set execution policy to RemoteSigned" -ForegroundColor Green
    }
    catch {
        Write-Host "Failed to set execution policy: $($_.Exception.Message)" -ForegroundColor Red
        Write-Host "Try running PowerShell as Administrator" -ForegroundColor Yellow
        exit 1
    }
} else {
    Write-Host "`nExecution policy already allows local scripts" -ForegroundColor Green
}

# Unblock the security test script if it exists
$scriptPath = ".\scripts\security-test.ps1"
if (Test-Path $scriptPath) {
    Write-Host "`nUnblocking security test script..." -ForegroundColor Green
    try {
        Unblock-File -Path $scriptPath
        Write-Host "Security test script unblocked" -ForegroundColor Green
    }
    catch {
        Write-Host "Script may already be unblocked: $($_.Exception.Message)" -ForegroundColor Yellow
    }
} else {
    Write-Host "`nSecurity test script not found at: $scriptPath" -ForegroundColor Yellow
}

# Test if we can run the script now
Write-Host "`nTesting script execution..." -ForegroundColor Cyan
if (Test-Path $scriptPath) {
    try {
        # Try to load the script but dont execute it
        $null = Get-Content $scriptPath -ErrorAction Stop
        Write-Host "Security test script is ready to execute" -ForegroundColor Green
        
        Write-Host "`nYou can now run security tests with:" -ForegroundColor Cyan
        Write-Host "   .\scripts\security-test.ps1" -ForegroundColor White
        Write-Host "   .\scripts\security-test.ps1 -Verbose" -ForegroundColor White
        Write-Host "   .\scripts\security-test.ps1 -ExportResults" -ForegroundColor White
    }
    catch {
        Write-Host "Script still has issues: $($_.Exception.Message)" -ForegroundColor Red
    }
} else {
    Write-Host "Security test script not found" -ForegroundColor Yellow
}

# Show final policy status
Write-Host "`nFinal Execution Policy Status:" -ForegroundColor Yellow
Get-ExecutionPolicy -List | Format-Table -AutoSize

Write-Host "`nSetup Complete!" -ForegroundColor Green
Write-Host "Your environment is now configured for automatic security testing" -ForegroundColor Cyan
Write-Host "`nFor future automation, you can create batch files or use:" -ForegroundColor Yellow
Write-Host "   powershell -ExecutionPolicy Bypass -File `".\scripts\security-test.ps1`"" -ForegroundColor White
