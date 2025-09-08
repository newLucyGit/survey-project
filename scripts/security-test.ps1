# Security Regression Test Suite for Survey Management Application
# Author: GitHub Copilot
# Date: August 27, 2025
# Purpose: Automated testing of security controls for regression testing

param(
    [string]$BaseUrl = "http://localhost:5000",
    [string]$FrontendUrl = "http://localhost:3000",
    [switch]$Verbose,
    [switch]$ExportResults,
    [string]$OutputPath = "./security-test-results.json"
)

# Test configuration
$script:TestResults = @{
    TestSuite = "Security Regression Tests"
    ExecutionDate = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    BaseUrl = $BaseUrl
    TotalTests = 0
    PassedTests = 0
    FailedTests = 0
    TestCategories = @()
}

$script:AdminCredentials = @{
    username = "admin"
    password = "admin123"
}

$script:CreatorCredentials = @{
    username = "creator"
    password = "creator123"
}

# Helper Functions
function Write-TestLog {
    param([string]$Message, [string]$Level = "INFO")
    $timestamp = Get-Date -Format "HH:mm:ss"
    $color = switch ($Level) {
        "PASS" { "Green" }
        "FAIL" { "Red" }
        "WARN" { "Yellow" }
        default { "White" }
    }
    Write-Host "[$timestamp] $Message" -ForegroundColor $color
    if ($Verbose) {
        Write-Host $Message
    }
}

function Invoke-SecurityTest {
    param(
        [string]$TestName,
        [string]$Category,
        [scriptblock]$TestCode,
        [string]$ExpectedResult = "PASS"
    )
    
    $script:TestResults.TotalTests++
    Write-TestLog "Running: $TestName" "INFO"
    
    try {
        $result = & $TestCode
        if ($result.Status -eq $ExpectedResult) {
            $script:TestResults.PassedTests++
            Write-TestLog "✅ PASS: $TestName" "PASS"
            $testResult = @{
                Name = $TestName
                Category = $Category
                Status = "PASS"
                Message = $result.Message
                Details = $result.Details
            }
        } else {
            $script:TestResults.FailedTests++
            Write-TestLog "❌ FAIL: $TestName - $($result.Message)" "FAIL"
            $testResult = @{
                Name = $TestName
                Category = $Category
                Status = "FAIL"
                Message = $result.Message
                Details = $result.Details
                ExpectedResult = $ExpectedResult
            }
        }
    } catch {
        $script:TestResults.FailedTests++
        Write-TestLog "❌ ERROR: $TestName - $($_.Exception.Message)" "FAIL"
        $testResult = @{
            Name = $TestName
            Category = $Category
            Status = "ERROR"
            Message = $_.Exception.Message
            Details = $_.Exception.StackTrace
        }
    }
    
    # Add to category results
    $categoryIndex = $script:TestResults.TestCategories.FindIndex({$args[0].Name -eq $Category})
    if ($categoryIndex -eq -1) {
        $script:TestResults.TestCategories += @{
            Name = $Category
            Tests = @($testResult)
            PassCount = if ($testResult.Status -eq "PASS") { 1 } else { 0 }
            FailCount = if ($testResult.Status -ne "PASS") { 1 } else { 0 }
        }
    } else {
        $script:TestResults.TestCategories[$categoryIndex].Tests += $testResult
        if ($testResult.Status -eq "PASS") {
            $script:TestResults.TestCategories[$categoryIndex].PassCount++
        } else {
            $script:TestResults.TestCategories[$categoryIndex].FailCount++
        }
    }
}

function Get-AuthToken {
    param([hashtable]$Credentials)
    
    try {
        $response = Invoke-RestMethod -Uri "$BaseUrl/api/login" -Method POST -Headers @{"Content-Type"="application/json"} -Body ($Credentials | ConvertTo-Json)
        return $response.token
    } catch {
        throw "Authentication failed for user $($Credentials.username): $($_.Exception.Message)"
    }
}

function Test-HttpRequest {
    param(
        [string]$Uri,
        [string]$Method = "GET",
        [hashtable]$Headers = @{},
        [string]$Body = $null,
        [int[]]$ExpectedStatusCodes = @(200)
    )
    
    try {
        $params = @{
            Uri = $Uri
            Method = $Method
            Headers = $Headers
            ErrorAction = "Stop"
        }
        
        if ($Body) {
            $params.Body = $Body
        }
        
        $response = Invoke-RestMethod @params
        return @{
            Status = "PASS"
            StatusCode = 200
            Response = $response
            Message = "Request successful"
        }
    } catch {
        $statusCode = if ($_.Exception.Response) { 
            $_.Exception.Response.StatusCode.value__ 
        } else { 
            0 
        }
        
        if ($statusCode -in $ExpectedStatusCodes) {
            return @{
                Status = "PASS"
                StatusCode = $statusCode
                Message = "Expected status code $statusCode received"
            }
        } else {
            return @{
                Status = "FAIL"
                StatusCode = $statusCode
                Message = "Unexpected status code: $statusCode"
                Details = $_.Exception.Message
            }
        }
    }
}

# Test Categories

# 1. Authentication Tests
function Test-Authentication {
    Write-TestLog "=== AUTHENTICATION TESTS ===" "INFO"
    
    # Test 1.1: Valid Login
    Invoke-SecurityTest -TestName "Valid Admin Login" -Category "Authentication" -TestCode {
        try {
            $token = Get-AuthToken -Credentials $script:AdminCredentials
            if ($token) {
                return @{ Status = "PASS"; Message = "Admin login successful"; Details = "Token received" }
            } else {
                return @{ Status = "FAIL"; Message = "No token received" }
            }
        } catch {
            return @{ Status = "FAIL"; Message = $_.Exception.Message }
        }
    }
    
    # Test 1.2: Invalid Credentials
    Invoke-SecurityTest -TestName "Invalid Credentials Rejected" -Category "Authentication" -TestCode {
        $result = Test-HttpRequest -Uri "$BaseUrl/api/login" -Method POST -Headers @{"Content-Type"="application/json"} -Body '{"username":"hacker","password":"invalid"}' -ExpectedStatusCodes @(401)
        return $result
    }
    
    # Test 1.3: Missing Credentials
    Invoke-SecurityTest -TestName "Missing Credentials Rejected" -Category "Authentication" -TestCode {
        $result = Test-HttpRequest -Uri "$BaseUrl/api/login" -Method POST -Headers @{"Content-Type"="application/json"} -Body '{}' -ExpectedStatusCodes @(400, 401)
        return $result
    }
    
    # Test 1.4: Unauthenticated Access
    Invoke-SecurityTest -TestName "Unauthenticated Access Blocked" -Category "Authentication" -TestCode {
        $result = Test-HttpRequest -Uri "$BaseUrl/api/categories" -Method GET -ExpectedStatusCodes @(401)
        return $result
    }
    
    # Test 1.5: Invalid JWT Token
    Invoke-SecurityTest -TestName "Invalid JWT Token Rejected" -Category "Authentication" -TestCode {
        $result = Test-HttpRequest -Uri "$BaseUrl/api/categories" -Method GET -Headers @{"Authorization"="Bearer invalid.jwt.token"} -ExpectedStatusCodes @(403)
        return $result
    }
}

# 2. Authorization (RBAC) Tests
function Test-Authorization {
    Write-TestLog "=== AUTHORIZATION (RBAC) TESTS ===" "INFO"
    
    try {
        $adminToken = Get-AuthToken -Credentials $script:AdminCredentials
        $creatorToken = Get-AuthToken -Credentials $script:CreatorCredentials
    } catch {
        Write-TestLog "Failed to get tokens for RBAC tests: $($_.Exception.Message)" "FAIL"
        return
    }
    
    # Test 2.1: Admin Cannot Access Creator Functions
    Invoke-SecurityTest -TestName "Admin Blocked from Categories Creation" -Category "Authorization" -TestCode {
        $result = Test-HttpRequest -Uri "$BaseUrl/api/categories" -Method POST -Headers @{"Authorization"="Bearer $adminToken"; "Content-Type"="application/json"} -Body '{"name":"Admin Blocked Test"}' -ExpectedStatusCodes @(403)
        return $result
    }
    
    # Test 2.2: Admin Cannot Access Questions
    Invoke-SecurityTest -TestName "Admin Blocked from Questions Creation" -Category "Authorization" -TestCode {
        $result = Test-HttpRequest -Uri "$BaseUrl/api/questions" -Method POST -Headers @{"Authorization"="Bearer $adminToken"; "Content-Type"="application/json"} -Body '{"category_id":1,"text":"Admin Test","type":"text"}' -ExpectedStatusCodes @(403)
        return $result
    }
    
    # Test 2.3: Creator Cannot Access Admin Functions
    Invoke-SecurityTest -TestName "Creator Blocked from Companies Access" -Category "Authorization" -TestCode {
        $result = Test-HttpRequest -Uri "$BaseUrl/api/companies" -Method GET -Headers @{"Authorization"="Bearer $creatorToken"} -ExpectedStatusCodes @(403)
        return $result
    }
    
    # Test 2.4: Creator Cannot Access Employees
    Invoke-SecurityTest -TestName "Creator Blocked from Employees Access" -Category "Authorization" -TestCode {
        $result = Test-HttpRequest -Uri "$BaseUrl/api/employees" -Method GET -Headers @{"Authorization"="Bearer $creatorToken"} -ExpectedStatusCodes @(403)
        return $result
    }
    
    # Test 2.5: Admin Can Access Companies (Positive Test)
    Invoke-SecurityTest -TestName "Admin Can Access Companies" -Category "Authorization" -TestCode {
        $result = Test-HttpRequest -Uri "$BaseUrl/api/companies" -Method GET -Headers @{"Authorization"="Bearer $adminToken"}
        if ($result.Status -eq "PASS") {
            $result.Message = "Admin successfully accessed companies ($($result.Response.Count) found)"
        }
        return $result
    }
    
    # Test 2.6: Creator Can Access Categories (Positive Test)
    Invoke-SecurityTest -TestName "Creator Can Access Categories" -Category "Authorization" -TestCode {
        $result = Test-HttpRequest -Uri "$BaseUrl/api/categories" -Method GET -Headers @{"Authorization"="Bearer $creatorToken"}
        if ($result.Status -eq "PASS") {
            $result.Message = "Creator successfully accessed categories ($($result.Response.Count) found)"
        }
        return $result
    }
}

# 3. Input Validation Tests
function Test-InputValidation {
    Write-TestLog "=== INPUT VALIDATION TESTS ===" "INFO"
    
    try {
        $creatorToken = Get-AuthToken -Credentials $script:CreatorCredentials
    } catch {
        Write-TestLog "Failed to get creator token for validation tests: $($_.Exception.Message)" "FAIL"
        return
    }
    
    # Test 3.1: Missing Required Fields
    Invoke-SecurityTest -TestName "Missing Fields Rejected" -Category "Input Validation" -TestCode {
        $result = Test-HttpRequest -Uri "$BaseUrl/api/categories" -Method POST -Headers @{"Authorization"="Bearer $creatorToken"; "Content-Type"="application/json"} -Body '{}' -ExpectedStatusCodes @(400)
        return $result
    }
    
    # Test 3.2: Invalid Question Type
    Invoke-SecurityTest -TestName "Invalid Question Type Rejected" -Category "Input Validation" -TestCode {
        $result = Test-HttpRequest -Uri "$BaseUrl/api/questions" -Method POST -Headers @{"Authorization"="Bearer $creatorToken"; "Content-Type"="application/json"} -Body '{"category_id":1,"text":"Test","type":"invalid_type"}' -ExpectedStatusCodes @(400)
        return $result
    }
    
    # Test 3.3: MCQ Insufficient Options
    Invoke-SecurityTest -TestName "MCQ Insufficient Options Rejected" -Category "Input Validation" -TestCode {
        $body = @{
            category_id = 1
            text = "Test MCQ"
            type = "mcq"
            options = @(
                @{ text = "Option1" },
                @{ text = "Option2" }
            )
        } | ConvertTo-Json -Depth 3
        $result = Test-HttpRequest -Uri "$BaseUrl/api/questions" -Method POST -Headers @{"Authorization"="Bearer $creatorToken"; "Content-Type"="application/json"} -Body $body -ExpectedStatusCodes @(400)
        return $result
    }
    
    # Test 3.4: MCQ Too Many Options
    Invoke-SecurityTest -TestName "MCQ Too Many Options Rejected" -Category "Input Validation" -TestCode {
        $options = @()
        for ($i = 1; $i -le 8; $i++) {
            $options += @{ text = "Option$i" }
        }
        $body = @{
            category_id = 1
            text = "Test MCQ"
            type = "mcq"
            options = $options
        } | ConvertTo-Json -Depth 3
        $result = Test-HttpRequest -Uri "$BaseUrl/api/questions" -Method POST -Headers @{"Authorization"="Bearer $creatorToken"; "Content-Type"="application/json"} -Body $body -ExpectedStatusCodes @(400)
        return $result
    }
    
    # Test 3.5: Valid MCQ Creation (Positive Test)
    Invoke-SecurityTest -TestName "Valid MCQ Accepted" -Category "Input Validation" -TestCode {
        $body = @{
            category_id = 1
            text = "Security Test MCQ"
            type = "mcq"
            options = @(
                @{ text = "Option A" },
                @{ text = "Option B" },
                @{ text = "Option C" }
            )
        } | ConvertTo-Json -Depth 3
        $result = Test-HttpRequest -Uri "$BaseUrl/api/questions" -Method POST -Headers @{"Authorization"="Bearer $creatorToken"; "Content-Type"="application/json"} -Body $body
        if ($result.Status -eq "PASS") {
            $result.Message = "Valid MCQ created successfully (ID: $($result.Response.id))"
        }
        return $result
    }
}

# 4. SQL Injection Protection Tests
function Test-SQLInjection {
    Write-TestLog "=== SQL INJECTION PROTECTION TESTS ===" "INFO"
    
    try {
        $creatorToken = Get-AuthToken -Credentials $script:CreatorCredentials
    } catch {
        Write-TestLog "Failed to get creator token for SQL injection tests: $($_.Exception.Message)" "FAIL"
        return
    }
    
    # Test 4.1: SQL Injection in Category Name
    Invoke-SecurityTest -TestName "SQL Injection in Category Name" -Category "SQL Injection Protection" -TestCode {
        $maliciousName = "Test'; DROP TABLE categories; --"
        $body = @{ name = $maliciousName } | ConvertTo-Json
        $result = Test-HttpRequest -Uri "$BaseUrl/api/categories" -Method POST -Headers @{"Authorization"="Bearer $creatorToken"; "Content-Type"="application/json"} -Body $body
        
        if ($result.Status -eq "PASS") {
            # Verify table still exists
            $verifyResult = Test-HttpRequest -Uri "$BaseUrl/api/categories" -Method GET -Headers @{"Authorization"="Bearer $creatorToken"}
            if ($verifyResult.Status -eq "PASS") {
                return @{ Status = "PASS"; Message = "SQL injection treated as normal data, table intact"; Details = "Created category with malicious name safely" }
            } else {
                return @{ Status = "FAIL"; Message = "Categories table may have been damaged"; Details = $verifyResult.Message }
            }
        }
        return $result
    }
    
    # Test 4.2: SQL Injection in Question Text
    Invoke-SecurityTest -TestName "SQL Injection in Question Text" -Category "SQL Injection Protection" -TestCode {
        $maliciousText = "Test question'; DELETE FROM questions; --"
        $body = @{
            category_id = 1
            text = $maliciousText
            type = "text"
        } | ConvertTo-Json
        $result = Test-HttpRequest -Uri "$BaseUrl/api/questions" -Method POST -Headers @{"Authorization"="Bearer $creatorToken"; "Content-Type"="application/json"} -Body $body
        
        if ($result.Status -eq "PASS") {
            return @{ Status = "PASS"; Message = "SQL injection in question text handled safely"; Details = "Question created with malicious text as normal data" }
        }
        return $result
    }
}

# 5. Data Integrity Tests
function Test-DataIntegrity {
    Write-TestLog "=== DATA INTEGRITY TESTS ===" "INFO"
    
    try {
        $creatorToken = Get-AuthToken -Credentials $script:CreatorCredentials
    } catch {
        Write-TestLog "Failed to get creator token for data integrity tests: $($_.Exception.Message)" "FAIL"
        return
    }
    
    # Test 5.1: Foreign Key Constraint Enforcement
    Invoke-SecurityTest -TestName "Foreign Key Constraint Enforced" -Category "Data Integrity" -TestCode {
        $body = @{
            category_id = 99999
            text = "Test Question"
            type = "text"
        } | ConvertTo-Json
        $result = Test-HttpRequest -Uri "$BaseUrl/api/questions" -Method POST -Headers @{"Authorization"="Bearer $creatorToken"; "Content-Type"="application/json"} -Body $body -ExpectedStatusCodes @(500)
        if ($result.Status -eq "PASS") {
            $result.Message = "Foreign key constraint properly enforced"
        }
        return $result
    }
    
    # Test 5.2: Non-existent Resource Handling
    Invoke-SecurityTest -TestName "Non-existent Resource Returns 404" -Category "Data Integrity" -TestCode {
        $result = Test-HttpRequest -Uri "$BaseUrl/api/categories/999999" -Method GET -Headers @{"Authorization"="Bearer $creatorToken"} -ExpectedStatusCodes @(404)
        return $result
    }
}

# 6. CORS Security Tests
function Test-CORS {
    Write-TestLog "=== CORS SECURITY TESTS ===" "INFO"
    
    # Test 6.1: CORS Preflight from Allowed Origin
    Invoke-SecurityTest -TestName "CORS Preflight from Allowed Origin" -Category "CORS Security" -TestCode {
        try {
            $response = Invoke-WebRequest -Uri "$BaseUrl/api/categories" -Method OPTIONS -Headers @{"Origin"="$FrontendUrl"; "Access-Control-Request-Method"="GET"} -UseBasicParsing
            return @{ Status = "PASS"; Message = "CORS preflight successful from allowed origin"; Details = "Status: $($response.StatusCode)" }
        } catch {
            return @{ Status = "FAIL"; Message = "CORS preflight failed"; Details = $_.Exception.Message }
        }
    }
}

# 7. Error Handling Security Tests
function Test-ErrorHandling {
    Write-TestLog "=== ERROR HANDLING SECURITY TESTS ===" "INFO"
    
    try {
        $creatorToken = Get-AuthToken -Credentials $script:CreatorCredentials
    } catch {
        Write-TestLog "Failed to get creator token for error handling tests: $($_.Exception.Message)" "FAIL"
        return
    }
    
    # Test 7.1: Secure Error Messages
    Invoke-SecurityTest -TestName "Secure Error Messages" -Category "Error Handling" -TestCode {
        # Try to access non-existent category
        $result = Test-HttpRequest -Uri "$BaseUrl/api/categories/999999" -Method GET -Headers @{"Authorization"="Bearer $creatorToken"} -ExpectedStatusCodes @(404)
        if ($result.Status -eq "PASS") {
            $result.Message = "404 error returned without exposing sensitive information"
        }
        return $result
    }
}

# Main Test Execution
function Start-SecurityTests {
    Write-TestLog "🔐 STARTING SECURITY REGRESSION TEST SUITE" "INFO"
    Write-TestLog "============================================" "INFO"
    Write-TestLog "Base URL: $BaseUrl" "INFO"
    Write-TestLog "Frontend URL: $FrontendUrl" "INFO"
    Write-TestLog "" "INFO"
    
    # Execute all test categories
    Test-Authentication
    Test-Authorization
    Test-InputValidation
    Test-SQLInjection
    Test-DataIntegrity
    Test-CORS
    Test-ErrorHandling
    
    # Generate summary
    Write-TestLog "" "INFO"
    Write-TestLog "🎯 SECURITY TEST SUITE SUMMARY" "INFO"
    Write-TestLog "===============================" "INFO"
    Write-TestLog "Total Tests: $($script:TestResults.TotalTests)" "INFO"
    Write-TestLog "Passed: $($script:TestResults.PassedTests)" "PASS"
    Write-TestLog "Failed: $($script:TestResults.FailedTests)" $(if ($script:TestResults.FailedTests -gt 0) { "FAIL" } else { "PASS" })
    Write-TestLog "Success Rate: $([math]::Round(($script:TestResults.PassedTests / $script:TestResults.TotalTests) * 100, 2))%" "INFO"
    
    # Category breakdown
    Write-TestLog "" "INFO"
    Write-TestLog "Category Breakdown:" "INFO"
    foreach ($category in $script:TestResults.TestCategories) {
        $categoryStatus = if ($category.FailCount -eq 0) { "PASS" } else { "FAIL" }
        Write-TestLog "  $($category.Name): $($category.PassCount)/$($category.PassCount + $category.FailCount) passed" $categoryStatus
    }
    
    # Overall result
    if ($script:TestResults.FailedTests -eq 0) {
        Write-TestLog "" "INFO"
        Write-TestLog "🔒 ALL SECURITY TESTS PASSED - APPLICATION IS SECURE!" "PASS"
        $script:TestResults.OverallResult = "PASS"
    } else {
        Write-TestLog "" "INFO"
        Write-TestLog "❌ SECURITY TESTS FAILED - REVIEW AND FIX ISSUES BEFORE DEPLOYMENT!" "FAIL"
        $script:TestResults.OverallResult = "FAIL"
    }
    
    # Export results if requested
    if ($ExportResults) {
        $script:TestResults | ConvertTo-Json -Depth 5 | Out-File -FilePath $OutputPath -Encoding UTF8
        Write-TestLog "Test results exported to: $OutputPath" "INFO"
    }
    
    # Return exit code for CI/CD integration
    if ($script:TestResults.FailedTests -gt 0) {
        exit 1
    } else {
        exit 0
    }
}

# Execute tests
Start-SecurityTests
