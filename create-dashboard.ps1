# Security Analysis Dashboard
# PowerShell script to create a comprehensive security dashboard
try {
    $excel = New-Object -ComObject Excel.Application
    $excel.Visible = $false
    $excel.DisplayAlerts = $false

    # Create new workbook
    $workbook = $excel.Workbooks.Add()
    
    # Remove default worksheets except first one
    while ($workbook.Worksheets.Count -gt 1) {
        $workbook.Worksheets.Item($workbook.Worksheets.Count).Delete()
    }

    # Create Summary Dashboard worksheet
    $summarySheet = $workbook.Worksheets.Item(1)
    $summarySheet.Name = "Security Dashboard"

    # Dashboard Title
    $summarySheet.Cells.Item(1, 1).Value2 = "Survey Management Application - Security Analysis Dashboard"
    $summarySheet.Cells.Item(1, 1).Font.Size = 16
    $summarySheet.Cells.Item(1, 1).Font.Bold = $true
    $summarySheet.Range("A1:F1").Merge() | Out-Null

    # Summary Statistics
    $summarySheet.Cells.Item(3, 1).Value2 = "SECURITY RISK SUMMARY"
    $summarySheet.Cells.Item(3, 1).Font.Bold = $true
    $summarySheet.Cells.Item(3, 1).Font.Size = 14

    $summarySheet.Cells.Item(5, 1).Value2 = "Risk Level"
    $summarySheet.Cells.Item(5, 2).Value2 = "Count"
    $summarySheet.Cells.Item(5, 3).Value2 = "Percentage"
    $summarySheet.Cells.Item(5, 4).Value2 = "Avg. Implementation Time"

    # Risk level data
    $summarySheet.Cells.Item(6, 1).Value2 = "CRITICAL"
    $summarySheet.Cells.Item(6, 2).Value2 = 8
    $summarySheet.Cells.Item(6, 3).Value2 = "40%"
    $summarySheet.Cells.Item(6, 4).Value2 = "3-5 days"

    $summarySheet.Cells.Item(7, 1).Value2 = "HIGH"
    $summarySheet.Cells.Item(7, 2).Value2 = 6
    $summarySheet.Cells.Item(7, 3).Value2 = "30%"
    $summarySheet.Cells.Item(7, 4).Value2 = "2-3 days"

    $summarySheet.Cells.Item(8, 1).Value2 = "MEDIUM"
    $summarySheet.Cells.Item(8, 2).Value2 = 4
    $summarySheet.Cells.Item(8, 3).Value2 = "20%"
    $summarySheet.Cells.Item(8, 4).Value2 = "1 week"

    $summarySheet.Cells.Item(9, 1).Value2 = "LOW"
    $summarySheet.Cells.Item(9, 2).Value2 = 2
    $summarySheet.Cells.Item(9, 3).Value2 = "10%"
    $summarySheet.Cells.Item(9, 4).Value2 = "3-5 days"

    # Color code the risk levels
    $summarySheet.Cells.Item(6, 1).Interior.Color = 0x0000FF  # Red for CRITICAL
    $summarySheet.Cells.Item(6, 1).Font.Color = 0xFFFFFF
    $summarySheet.Cells.Item(7, 1).Interior.Color = 0x0080FF  # Orange for HIGH
    $summarySheet.Cells.Item(7, 1).Font.Color = 0xFFFFFF
    $summarySheet.Cells.Item(8, 1).Interior.Color = 0x00FFFF  # Yellow for MEDIUM
    $summarySheet.Cells.Item(9, 1).Interior.Color = 0x00FF00  # Green for LOW

    # Category breakdown
    $summarySheet.Cells.Item(12, 1).Value2 = "ISSUES BY CATEGORY"
    $summarySheet.Cells.Item(12, 1).Font.Bold = $true
    $summarySheet.Cells.Item(12, 1).Font.Size = 14

    $summarySheet.Cells.Item(14, 1).Value2 = "Category"
    $summarySheet.Cells.Item(14, 2).Value2 = "Critical Issues"
    $summarySheet.Cells.Item(14, 3).Value2 = "Total Issues"
    $summarySheet.Cells.Item(14, 4).Value2 = "Priority Action Required"

    $summarySheet.Cells.Item(15, 1).Value2 = "Security"
    $summarySheet.Cells.Item(15, 2).Value2 = 5
    $summarySheet.Cells.Item(15, 3).Value2 = 9
    $summarySheet.Cells.Item(15, 4).Value2 = "IMMEDIATE"

    $summarySheet.Cells.Item(16, 1).Value2 = "Database"
    $summarySheet.Cells.Item(16, 2).Value2 = 2
    $summarySheet.Cells.Item(16, 3).Value2 = 3
    $summarySheet.Cells.Item(16, 4).Value2 = "IMMEDIATE"

    $summarySheet.Cells.Item(17, 1).Value2 = "Authentication"
    $summarySheet.Cells.Item(17, 2).Value2 = 1
    $summarySheet.Cells.Item(17, 3).Value2 = 2
    $summarySheet.Cells.Item(17, 4).Value2 = "HIGH"

    $summarySheet.Cells.Item(18, 1).Value2 = "Architecture"
    $summarySheet.Cells.Item(18, 2).Value2 = 0
    $summarySheet.Cells.Item(18, 3).Value2 = 2
    $summarySheet.Cells.Item(18, 4).Value2 = "MEDIUM"

    $summarySheet.Cells.Item(19, 1).Value2 = "Operations"
    $summarySheet.Cells.Item(19, 2).Value2 = 0
    $summarySheet.Cells.Item(19, 3).Value2 = 2
    $summarySheet.Cells.Item(19, 4).Value2 = "MEDIUM"

    $summarySheet.Cells.Item(20, 1).Value2 = "Development"
    $summarySheet.Calls.Item(20, 2).Value2 = 0
    $summarySheet.Cells.Item(20, 3).Value2 = 2
    $summarySheet.Cells.Item(20, 4).Value2 = "LOW"

    # Executive Summary
    $summarySheet.Cells.Item(23, 1).Value2 = "EXECUTIVE SUMMARY"
    $summarySheet.Cells.Item(23, 1).Font.Bold = $true
    $summarySheet.Cells.Item(23, 1).Font.Size = 14

    $executiveSummary = @"
CRITICAL FINDINGS:
• 8 Critical security vulnerabilities identified requiring immediate attention
• Hardcoded secrets and weak authentication present severe risks
• Database security completely inadequate for enterprise use
• No input validation exposes application to injection attacks

BUSINESS IMPACT:
• High risk of data breach and complete system compromise
• Potential compliance violations and regulatory issues
• Significant operational risk in production environment
• Customer trust and reputation at risk

RECOMMENDED ACTIONS:
Phase 1 (Week 1): Address all CRITICAL security issues
Phase 2 (Week 2-3): Implement database security and monitoring
Phase 3 (Month 2): Architectural improvements and testing
Phase 4 (Month 3): Production readiness and CI/CD

ESTIMATED EFFORT: 2-3 months for full enterprise readiness
IMMEDIATE EFFORT: 1-2 weeks for critical security fixes
"@

    $summarySheet.Cells.Item(25, 1).Value2 = $executiveSummary
    $summarySheet.Range("A25:F35").Merge() | Out-Null
    $summarySheet.Cells.Item(25, 1).WrapText = $true

    # Format the summary sheet
    $summarySheet.Range("A5:D9").Borders.LineStyle = 1
    $summarySheet.Range("A14:D20").Borders.LineStyle = 1
    $summarySheet.Columns.AutoFit() | Out-Null

    # Save the dashboard
    $dashboardPath = "C:\Users\shobh\Documents\Surface Laptop\iCloudDrive\Surface Laptop\WebApps\SurveyManagement\SurveyProject\Security-Dashboard.xlsx"
    $workbook.SaveAs($dashboardPath, 51)
    
    Write-Host "Security Dashboard created: $dashboardPath" -ForegroundColor Green
    
    $workbook.Close()
    $excel.Quit()
    [System.Runtime.Interopservices.Marshal]::ReleaseComObject($excel) | Out-Null
    
} catch {
    Write-Host "Error creating dashboard: $($_.Exception.Message)" -ForegroundColor Red
}
