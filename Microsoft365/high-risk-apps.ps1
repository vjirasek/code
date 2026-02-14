# Global CA Policy Stress-Test by Vladimir Jirasek
# Checks for "All Cloud Apps" coverage and hidden exclusions
# Install-Module Microsoft.Graph.Identity.SignIns -Scope CurrentUser -Force
# Import-Module Microsoft.Graph.Identity.SignIns
# Connect-MgGraph -Scopes "Policy.Read.All", "Policy.Read.ConditionalAccess"

$RiskyApps = @{
    "Azure CLI"              = "04b07795-8ddb-461a-bbee-02f9e1bf7b46"
    "Azure PowerShell"       = "1950a258-227b-4e31-a9cf-717495945fc2"
    "Graph Explorer"         = "de8bc8b5-d9f9-48b1-a8ad-b748da725064"
    "Azure Service Mgmt"     = "797f4846-ba00-4fd7-ba43-dac1f8f63013"
}

# Ensure connection
if (-not (Get-Module -Name Microsoft.Graph.Identity.SignIns)) {
    Import-Module Microsoft.Graph.Identity.SignIns
}
try {
    Get-MgIdentityConditionalAccessPolicy -Top 1 -ErrorAction Stop | Out-Null
}
catch {
    Write-Host "Connecting to Graph..." -ForegroundColor Cyan
    Connect-MgGraph -Scopes "Policy.Read.All"
}

Write-Host "Fetching and analyzing ALL Enabled Policies..." -ForegroundColor Cyan
$Policies = Get-MgIdentityConditionalAccessPolicy | Where-Object { $_.State -eq 'enabled' }

$AllCloudAppsPolicies = @()

foreach ($Policy in $Policies) {
    # Check if policy targets "All Cloud Apps"
    if ($Policy.Conditions.Applications.IncludeApplications -contains 'All') {
        
        $Exclusions = @()
        
        # Check for Risky App Exclusions
        if ($Policy.Conditions.Applications.ExcludeApplications) {
            foreach ($AppID in $Policy.Conditions.Applications.ExcludeApplications) {
                if ($RiskyApps.Values -contains $AppID) {
                    $AppName = $RiskyApps.Keys | Where-Object { $RiskyApps[$_] -eq $AppID }
                    $Exclusions += "EXPLICIT HOLE: $AppName"
                }
            }
            if ($Policy.Conditions.Applications.ExcludeApplications.Count -gt 0) {
                 $Exclusions += "Excludes $($Policy.Conditions.Applications.ExcludeApplications.Count) total apps"
            }
        }

        # Check for User/Role Exclusions (The "Break Glass" or "Service Account" hole)
        if ($Policy.Conditions.Users.ExcludeUsers.Count -gt 0) {
            $Exclusions += "Excludes $($Policy.Conditions.Users.ExcludeUsers.Count) specific users"
        }
        if ($Policy.Conditions.Users.ExcludeGroups.Count -gt 0) {
            $Exclusions += "Excludes $($Policy.Conditions.Users.ExcludeGroups.Count) groups"
        }
        if ($Policy.Conditions.Users.ExcludeRoles.Count -gt 0) {
            $Exclusions += "Excludes $($Policy.Conditions.Users.ExcludeRoles.Count) roles"
        }

        $AllCloudAppsPolicies += [PSCustomObject]@{
            PolicyName      = $Policy.DisplayName
            TargetUsers     = if ($Policy.Conditions.Users.IncludeUsers -contains 'All') { "All Users" } else { "Specific Roles/Groups" }
            GrantControls   = ($Policy.GrantControls.BuiltInControls -join ', ')
            RiskFactor      = if ($Exclusions.Count -gt 0) { "HAS EXCLUSIONS" } else { "Solid" }
            ExclusionDetails = ($Exclusions -join '; ')
        }
    }
}

# Output Analysis
if ($AllCloudAppsPolicies.Count -gt 0) {
    Write-Host "`nFOUND: The following policies target 'All Cloud Apps':" -ForegroundColor Green
    $AllCloudAppsPolicies | Format-Table -AutoSize
    
    Write-Host "`nCRITICAL CHECK:" -ForegroundColor Yellow
    Write-Host "1. Look at 'ExclusionDetails'. If you see 'Azure Service Mgmt' or similar, the zero trust hole exists."
    Write-Host "2. If 'TargetUsers' is NOT 'All Users', ensure your Admin Roles are included."
}
else {
    Write-Host "`nCRITICAL FAIL: No ENABLED policy targets 'All Cloud Apps'." -ForegroundColor Red
    Write-Host "Your environment relies entirely on app-by-app scoping, which validates the vulnerability."
}