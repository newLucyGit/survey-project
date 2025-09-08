# PowerShell script to convert CSV to Excel with formatting
# Ensure Excel COM object is available
try {
    $excel = New-Object -ComObject Excel.Application
    $excel.Visible = $false
    $excel.DisplayAlerts = $false

    # Open CSV file
    $csvPath = "C:\Users\shobh\Documents\Surface Laptop\iCloudDrive\Surface Laptop\WebApps\SurveyManagement\SurveyProject\security-analysis.csv"
    $workbook = $excel.Workbooks.Open($csvPath)
    $worksheet = $workbook.Worksheets.Item(1)

    # Auto-fit columns
    $worksheet.Columns.AutoFit() | Out-Null

    # Format header row
    $headerRange = $worksheet.Range("A1:K1")
    $headerRange.Font.Bold = $true
    $headerRange.Interior.Color = 0x366092  # Dark blue
    $headerRange.Font.Color = 0xFFFFFF      # White text

    # Format Priority column with color coding
    $lastRow = $worksheet.UsedRange.Rows.Count
    for ($i = 2; $i -le $lastRow; $i++) {
        $priorityCell = $worksheet.Cells.Item($i, 1)
        switch ($priorityCell.Value2) {
            "CRITICAL" { 
                $priorityCell.Interior.Color = 0x0000FF  # Red
                $priorityCell.Font.Color = 0xFFFFFF     # White text
            }
            "HIGH" { 
                $priorityCell.Interior.Color = 0x0080FF  # Orange
                $priorityCell.Font.Color = 0xFFFFFF     # White text
            }
            "MEDIUM" { 
                $priorityCell.Interior.Color = 0x00FFFF  # Yellow
                $priorityCell.Font.Color = 0x000000     # Black text
            }
            "LOW" { 
                $priorityCell.Interior.Color = 0x00FF00  # Green
                $priorityCell.Font.Color = 0x000000     # Black text
            }
        }
    }

    # Add borders to all data
    $dataRange = $worksheet.Range("A1:K$lastRow")
    $dataRange.Borders.LineStyle = 1
    $dataRange.Borders.Weight = 2

    # Set column widths for better readability
    $worksheet.Columns.Item(1).ColumnWidth = 10   # Priority
    $worksheet.Columns.Item(2).ColumnWidth = 12   # Category
    $worksheet.Columns.Item(3).ColumnWidth = 25   # Issue Title
    $worksheet.Columns.Item(4).ColumnWidth = 40   # Description
    $worksheet.Columns.Item(5).ColumnWidth = 20   # Code Location
    $worksheet.Columns.Item(6).ColumnWidth = 10   # Risk Level
    $worksheet.Columns.Item(7).ColumnWidth = 30   # Business Impact
    $worksheet.Columns.Item(8).ColumnWidth = 30   # Technical Impact
    $worksheet.Columns.Item(9).ColumnWidth = 40   # Recommended Solution
    $worksheet.Columns.Item(10).ColumnWidth = 15  # Implementation Effort
    $worksheet.Columns.Item(11).ColumnWidth = 12  # Timeline

    # Enable text wrapping for description columns
    $worksheet.Columns.Item(4).WrapText = $true
    $worksheet.Columns.Item(7).WrapText = $true
    $worksheet.Columns.Item(8).WrapText = $true
    $worksheet.Columns.Item(9).WrapText = $true

    # Save as Excel file
    $excelPath = "C:\Users\shobh\Documents\Surface Laptop\iCloudDrive\Surface Laptop\WebApps\SurveyManagement\SurveyProject\Security-Analysis-Report.xlsx"
    $workbook.SaveAs($excelPath, 51)  # 51 = xlOpenXMLWorkbook
    
    Write-Host "Excel file created successfully: $excelPath" -ForegroundColor Green
    
    # Clean up
    $workbook.Close()
    $excel.Quit()
    [System.Runtime.Interopservices.Marshal]::ReleaseComObject($excel) | Out-Null
    
} catch {
    Write-Host "Error creating Excel file: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "CSV file is available at: security-analysis.csv" -ForegroundColor Yellow
}
