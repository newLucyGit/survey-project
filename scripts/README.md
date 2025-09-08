# Security Regression Test Suite

Comprehensive automated security testing framework for the Survey Management Application.

## Overview

This test suite validates security controls across multiple categories to ensure the application maintains enterprise-grade security standards. Uses PowerShell for Windows environments with Docker containerization.

## Test Categories

1. **Authentication Tests** - Login validation, invalid credentials, unauthenticated access
2. **Authorization (RBAC) Tests** - Role-based access control enforcement
3. **Input Validation Tests** - Data validation, MCQ requirements, invalid data rejection
4. **SQL Injection Protection** - Protection against SQL injection attacks
5. **Data Integrity Tests** - Foreign key constraints, error handling

## Available Scripts

### PowerShell Version
```powershell
# Basic test run
.\security-test.ps1

# Verbose output
.\security-test.ps1 -Verbose

# Export results to JSON
.\security-test.ps1 -ExportResults

# Full run with all options
.\security-test.ps1 -Verbose -ExportResults
```

**Note**: If PowerShell execution policy blocks the script, you can run:
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

## Configuration

### Environment Variables
- `TEST_BASE_URL` - Backend API URL (default: http://localhost:5000)
- `TEST_FRONTEND_URL` - Frontend URL (default: http://localhost:3000)
- `TEST_OUTPUT_PATH` - Results export path (default: ./security-test-results.json)
- `TEST_TIMEOUT` - Request timeout in ms (default: 10000)

### Command Line Options
- `--verbose` / `-v` - Detailed output
- `--export` / `-e` - Export results to JSON
- PowerShell only: `-ExportResults`, `-Verbose`

## Test Credentials

The test suite uses predefined test accounts:
- **Admin**: username=admin, password=admin123
- **Creator**: username=creator, password=creator123

## CI/CD Integration

Both scripts return appropriate exit codes:
- **Exit 0**: All tests passed
- **Exit 1**: Tests failed or execution error

### GitHub Actions Example
```yaml
- name: Run Security Tests
  run: |
    cd scripts
    powershell -ExecutionPolicy Bypass -File security-test.ps1
```

### Jenkins Example
```groovy
stage('Security Tests') {
    steps {
        dir('scripts') {
            powershell 'Set-ExecutionPolicy Bypass -Scope Process; .\\security-test.ps1'
        }
    }
}
```

## Output Format

### Console Output
- Color-coded results (green=pass, red=fail, yellow=warn)
- Test execution timestamps
- Category-based organization
- Summary statistics

### JSON Export
```json
{
  "testSuite": "Security Regression Tests",
  "executionDate": "2025-01-27T...",
  "baseUrl": "http://localhost:5000",
  "totalTests": 14,
  "passedTests": 14,
  "failedTests": 0,
  "overallResult": "PASS",
  "testCategories": [
    {
      "name": "Authentication",
      "tests": [...],
      "passCount": 4,
      "failCount": 0
    }
  ]
}
```

## Test Results Interpretation

### Security Status Indicators
- **All tests pass**: Application is secure and ready for deployment
- **Authentication failures**: Check JWT implementation, password validation
- **Authorization failures**: Review RBAC implementation, role restrictions
- **Input validation failures**: Enhance data validation, add missing checks
- **SQL injection vulnerabilities**: Implement parameterized queries, input sanitization
- **Data integrity issues**: Check foreign key constraints, error handling

## Development Workflow

1. **Pre-commit**: Run security tests before committing changes
2. **CI Pipeline**: Automated security validation on every push
3. **Release**: Full security validation before deployment
4. **Regression**: Regular testing after security updates

## Extending the Test Suite

### Adding New Test Categories
1. Create new test function following the pattern
2. Add to execution sequence in main function
3. Update documentation

### Custom Test Environment
```javascript
// Node.js version
const config = {
    baseUrl: 'https://your-api.com',
    timeout: 15000
};

// PowerShell version
$TestConfig = @{
    BaseUrl = "https://your-api.com"
    Timeout = 15000
}
```

## Troubleshooting

### Common Issues
- **Connection refused**: Ensure backend server is running on correct port
- **Authentication failed**: Verify test credentials exist in database
- **Timeout errors**: Increase timeout value for slower environments
- **Permission denied**: Check file permissions for result export

### Debug Mode
Run with verbose output to see detailed request/response information:
```bash
npm run test:verbose
```

## Security Best Practices

This test suite validates implementation of:
- JWT-based authentication with proper token validation
- Role-based access control (RBAC) with strict boundaries
- Input validation with comprehensive data checks
- SQL injection protection through parameterized queries
- Data integrity through foreign key constraints
- Error handling that doesn't expose sensitive information

## Version History

- **v1.0.0**: Initial release with 5 test categories and dual-platform support
- Cross-platform compatibility (Windows PowerShell & Node.js)
- CI/CD integration with proper exit codes
- JSON export for test result archival
- Comprehensive security validation

## Support

For issues or enhancements:
1. Check existing test results for failure patterns
2. Review console output for specific error messages
3. Verify environment configuration
4. Ensure all dependencies are installed
