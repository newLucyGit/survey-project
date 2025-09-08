@echo off
REM Security Test Runner - Bypasses execution policy issues
REM Run this batch file to execute security tests automatically

echo Running Security Regression Tests...
echo =====================================

REM Change to the correct directory
cd /d "%~dp0"

REM Check if security test script exists
if not exist "scripts\security-test.ps1" (
    echo ERROR: Security test script not found at scripts\security-test.ps1
    echo Please ensure the script exists before running tests.
    pause
    exit /b 1
)

REM Run the PowerShell script with bypass policy
echo.
echo Starting PowerShell security tests...
powershell.exe -ExecutionPolicy Bypass -NoProfile -Command "& '.\scripts\security-test.ps1'"

REM Check the exit code
if %ERRORLEVEL% EQU 0 (
    echo.
    echo ✅ All security tests PASSED - Application is secure!
    echo.
) else (
    echo.
    echo ❌ Security tests FAILED - Review issues before deployment!
    echo.
)

REM Always pause so you can see the results
pause
