param(
    [string]$ApiBase = "http://localhost:4000/api",
    [string]$AdminEmail = "admin@example.com",
    [string]$AdminPassword = "Admin@12345"
)

$ErrorActionPreference = "Stop"

function Invoke-Api {
    param(
        [Parameter(Mandatory = $true)][string]$Method,
        [Parameter(Mandatory = $true)][string]$Path,
        [Microsoft.PowerShell.Commands.WebRequestSession]$Session,
        $Body
    )

    $arguments = @{
        Method = $Method
        Uri = "$ApiBase$Path"
        ErrorAction = "Stop"
    }
    if ($Session) { $arguments.WebSession = $Session }
    if ($null -ne $Body) {
        $arguments.ContentType = "application/json"
        $arguments.Body = ($Body | ConvertTo-Json -Depth 12)
    }
    Invoke-RestMethod @arguments
}

function New-LoginSession {
    param([string]$Email, [string]$Password)
    $session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
    $login = Invoke-Api -Method POST -Path "/auth/login" -Session $session -Body @{
        email = $Email
        password = $Password
    }
    Write-Host "Signed in: $($login.user.email) [$($login.user.role)]"
    return $session
}

function New-DemoUser {
    param($AdminSession, [string]$Name, [string]$Email, [string]$Role, [string]$Password)
    $response = Invoke-Api -Method POST -Path "/users" -Session $AdminSession -Body @{
        name = $Name
        email = $Email
        role = $Role
        password = $Password
    }
    return $response.user
}

Write-Host "Checking API health at $ApiBase/health ..."
$health = Invoke-Api -Method GET -Path "/health"
if ($health.status -ne "ok") { throw "API health check did not return status=ok" }

$stamp = (Get-Date).ToUniversalTime().ToString("yyyyMMddHHmmss")
$password = "Scenario@12345"
$today = (Get-Date).Date
$todayText = $today.ToString("yyyy-MM-dd")
$warrantyEndText = $today.AddYears(1).ToString("yyyy-MM-dd")
$nextReplacementText = $today.AddDays(330).ToString("yyyy-MM-dd")
$proposedBudget = 20000
$serviceCost = 10000
$partUnitCost = 15000
$counterBudget = 22000
$revisedServiceCost = 9000
$revisedPartUnitCost = 14500
$expectedFinalTotal = $revisedServiceCost + $revisedPartUnitCost

$operatorEmail = "m55.operator.$stamp@example.com"
$providerEmail = "m55.provider.$stamp@example.com"
$managerEmail = "m55.manager.$stamp@example.com"

$adminSession = New-LoginSession -Email $AdminEmail -Password $AdminPassword
$null = Invoke-Api -Method PATCH -Path "/organization-profile" -Session $adminSession -Body @{
    companyName = "University of Colombo - Faculty of Technology"
    address = "Pitipana, Homagama, Sri Lanka"
    registrationNumber = "UOC-FOT"
    phone = "+94 11 275 8000"
    email = "technology@cmb.ac.lk"
}
$operator = New-DemoUser -AdminSession $adminSession -Name "M55 Machine Operator" -Email $operatorEmail -Role "MACHINE_OPERATOR" -Password $password
$provider = New-DemoUser -AdminSession $adminSession -Name "M55 Service Provider" -Email $providerEmail -Role "SERVICE_PROVIDER" -Password $password
$manager = New-DemoUser -AdminSession $adminSession -Name "M55 Manager" -Email $managerEmail -Role "MANAGER" -Password $password
Write-Host "Created scenario users."

$operatorSession = New-LoginSession -Email $operatorEmail -Password $password
$machineResponse = Invoke-Api -Method POST -Path "/machines" -Session $operatorSession -Body @{
    assetCode = "M55-$stamp"
    name = "Milestone 5.5 Test Lathe"
    category = "Machine tool"
    location = "Scenario Workshop"
    manufacturer = "University Test Lab"
    model = "M55"
    serialNumber = "SN-$stamp"
    warrantyStart = $todayText
    warrantyEnd = $warrantyEndText
    status = "ACTIVE"
}
$machine = $machineResponse.machine
if ($machine.operatorId -ne $operator.id) { throw "Machine was not automatically assigned to the creating operator" }
Write-Host "Created and auto-assigned machine $($machine.assetCode)."

$partResponse = Invoke-Api -Method POST -Path "/machines/$($machine.id)/parts" -Session $operatorSession -Body @{
    name = "Drive belt"
    partNumber = "DB-$stamp"
    quantity = 1
    warrantyStart = $today.AddYears(-1).ToString("yyyy-MM-dd")
    warrantyEnd = $todayText
    replacementDue = $todayText
}
$part = $partResponse.part

$null = Invoke-Api -Method POST -Path "/machines/$($machine.id)/plans" -Session $operatorSession -Body @{
    title = "Monthly safety inspection"
    description = "Milestone 5.5 acceptance plan"
    frequency = "MONTHLY"
    nextDueDate = $todayText
    thresholdDays = 7
    isActive = $true
}
Write-Host "Created part and maintenance plan with due dates."

$scheduler = Invoke-Api -Method POST -Path "/alerts/run-scheduler" -Session $adminSession
Write-Host "Alert scheduler: $($scheduler.result.created) created, $($scheduler.result.existing) existing."

$alerts = Invoke-Api -Method GET -Path "/alerts" -Session $operatorSession
$replacementAlert = $alerts.alerts | Where-Object {
    $_.machine.id -eq $machine.id -and $_.type -eq "PART_REPLACEMENT"
} | Select-Object -First 1
if (-not $replacementAlert) { throw "The expected PART_REPLACEMENT alert was not generated" }

$acknowledged = Invoke-Api -Method PATCH -Path "/alerts/$($replacementAlert.id)/acknowledge" -Session $operatorSession
if ($acknowledged.alert.status -ne "ACKNOWLEDGED") { throw "Alert acknowledgement failed" }
$reopened = Invoke-Api -Method PATCH -Path "/alerts/$($replacementAlert.id)/reopen" -Session $operatorSession
if ($reopened.alert.status -ne "OPEN") { throw "Alert reopen failed" }
Write-Host "Verified alert acknowledge and reopen."

$requestResponse = Invoke-Api -Method POST -Path "/work-orders" -Session $operatorSession -Body @{
    machineId = $machine.id
    sourceAlertId = $replacementAlert.id
    title = "Replace due drive belt"
    description = "Generated by the Milestone 5.5 acceptance scenario."
    category = "PART_REPLACEMENT"
    priority = "HIGH"
    scheduledDate = $todayText
}
$workOrder = $requestResponse.workOrder
$submitted = Invoke-Api -Method POST -Path "/work-orders/$($workOrder.id)/submit" -Session $operatorSession
if ($submitted.workOrder.status -ne "PENDING_MANAGEMENT_APPROVAL") { throw "Request did not enter management review" }
Write-Host "Operator submitted service request $($workOrder.id)."

$dispatched = Invoke-Api -Method POST -Path "/work-orders/$($workOrder.id)/approve-and-dispatch" -Session $adminSession -Body @{
    providerId = $provider.id
    proposedBudget = $proposedBudget
}
if ($dispatched.workOrder.status -ne "SENT_TO_PROVIDER") { throw "Management dispatch failed" }

$providerSession = New-LoginSession -Email $providerEmail -Password $password
$accepted = Invoke-Api -Method POST -Path "/work-orders/$($workOrder.id)/accept" -Session $providerSession
if ($accepted.workOrder.status -ne "PROVIDER_ACCEPTED") { throw "Provider acceptance failed" }
$started = Invoke-Api -Method POST -Path "/work-orders/$($workOrder.id)/start" -Session $providerSession
if ($started.workOrder.status -ne "IN_PROGRESS") { throw "Provider could not start the accepted request" }

$null = Invoke-Api -Method PATCH -Path "/work-orders/$($workOrder.id)/service-details" -Session $providerSession -Body @{
    completedDate = $todayText
    serviceCost = $serviceCost
    notes = "Replaced drive belt, aligned pulleys, and completed a test run."
    providerBusinessName = "M55 Engineering Services"
    providerAddress = "Scenario Service Centre, Colombo"
    providerRegistrationNumber = "PV-M55-$stamp"
    providerContact = $providerEmail
    invoiceNumber = "INV-M55-$stamp"
}
$replacementResponse = Invoke-Api -Method POST -Path "/work-orders/$($workOrder.id)/replacements" -Session $providerSession -Body @{
    machinePartId = $part.id
    partName = "Drive belt"
    partNumber = "DB-NEW-$stamp"
    quantity = 1
    unitCost = $partUnitCost
    warrantyStart = $todayText
    warrantyEnd = $warrantyEndText
    nextReplacementDate = $nextReplacementText
    notes = "Replacement fitted during Milestone 5.5 scenario."
}
$null = Invoke-Api -Method POST -Path "/work-orders/$($workOrder.id)/evidence" -Session $providerSession -Body @{
    type = "SERVICE_REPORT"
    fileName = "service-report-$stamp.pdf"
    fileUrl = "/scenario/service-report-$stamp.pdf"
    notes = "Acceptance-test service report metadata"
}
$completion = Invoke-Api -Method POST -Path "/work-orders/$($workOrder.id)/submit-completion" -Session $providerSession
if ($completion.workOrder.status -ne "AWAITING_PAYMENT_APPROVAL") { throw "Completion was not sent for payment approval" }
Write-Host "Provider completed service and submitted the service slip."

$managerSession = New-LoginSession -Email $managerEmail -Password $password
$managementAlerts = Invoke-Api -Method GET -Path "/alerts" -Session $managerSession
$paymentAlert = $managementAlerts.alerts | Where-Object {
    $_.type -eq "PAYMENT_APPROVAL" -and $_.paymentWorkOrderId -eq $workOrder.id
} | Select-Object -First 1
if (-not $paymentAlert) { throw "Management payment approval alert was not created" }

$countered = Invoke-Api -Method POST -Path "/work-orders/$($workOrder.id)/counter-payment" -Session $managerSession -Body @{
    counterBudget = $counterBudget
    reason = "Please review the labour charge and drive belt unit price."
}
if ($countered.workOrder.status -ne "PRICE_REVISION_REQUESTED") { throw "Management counteroffer failed" }

$null = Invoke-Api -Method PATCH -Path "/work-orders/$($workOrder.id)/service-details" -Session $providerSession -Body @{
    serviceCost = $revisedServiceCost
    notes = "Labour charge revised after management counteroffer."
}
$null = Invoke-Api -Method PATCH -Path "/work-orders/$($workOrder.id)/replacements/$($replacementResponse.replacement.id)" -Session $providerSession -Body @{
    machinePartId = $part.id
    partName = "Drive belt"
    partNumber = "DB-NEW-$stamp"
    quantity = 1
    unitCost = $revisedPartUnitCost
    warrantyStart = $todayText
    warrantyEnd = $warrantyEndText
    nextReplacementDate = $nextReplacementText
    notes = "Unit price revised after management counteroffer."
}
$revisedCompletion = Invoke-Api -Method POST -Path "/work-orders/$($workOrder.id)/submit-completion" -Session $providerSession
if ($revisedCompletion.workOrder.status -ne "AWAITING_PAYMENT_APPROVAL") { throw "Revised receipt was not returned for payment approval" }
Write-Host "Management countered and the provider resubmitted a revised total that does not equal the counter budget."

$managementAlerts = Invoke-Api -Method GET -Path "/alerts" -Session $managerSession
$paymentAlert = $managementAlerts.alerts | Where-Object {
    $_.type -eq "PAYMENT_APPROVAL" -and $_.paymentWorkOrderId -eq $workOrder.id
} | Select-Object -First 1
if (-not $paymentAlert -or $paymentAlert.status -ne "OPEN") { throw "Payment alert was not reopened after the revised submission" }
$null = Invoke-Api -Method PATCH -Path "/alerts/$($paymentAlert.id)/acknowledge" -Session $managerSession
$closed = Invoke-Api -Method POST -Path "/work-orders/$($workOrder.id)/approve-payment" -Session $managerSession -Body @{
    paymentReference = "PAY-$stamp"
}
if ($closed.workOrder.status -ne "CLOSED") { throw "Payment approval did not close the request" }

$partsAfterPayment = Invoke-Api -Method GET -Path "/machines/$($machine.id)/parts" -Session $operatorSession
$updatedPart = $partsAfterPayment.parts | Where-Object { $_.id -eq $part.id } | Select-Object -First 1
if (-not $updatedPart) { throw "Updated machine part was not found" }
if ($updatedPart.warrantyEnd.Substring(0, 10) -ne $warrantyEndText) { throw "Replacement warranty date was not applied to the machine part" }
if ($updatedPart.replacementDue.Substring(0, 10) -ne $nextReplacementText) { throw "Next replacement date was not applied to the machine part" }

$finalOrder = Invoke-Api -Method GET -Path "/work-orders/$($workOrder.id)" -Session $managerSession
if ($finalOrder.workOrder.status -ne "CLOSED") { throw "Final work order verification failed" }
$actualPartsTotal = 0
foreach ($replacement in $finalOrder.workOrder.replacements) {
    $actualPartsTotal += ([decimal]$replacement.quantity * [decimal]$replacement.unitCost)
}
$actualFinalTotal = [decimal]$finalOrder.workOrder.serviceCost + $actualPartsTotal
if ($actualFinalTotal -ne $expectedFinalTotal) { throw "Final total calculation failed" }
if (($actualFinalTotal - [decimal]$finalOrder.workOrder.proposedBudget) -ne 1500) { throw "Budget variance calculation failed" }
if ($finalOrder.workOrder.priceCounterOffers.Count -lt 1) { throw "Counteroffer history was not preserved" }

$managementPayments = Invoke-Api -Method GET -Path "/dashboard/payments" -Session $managerSession
$managementPayment = $managementPayments.payments | Where-Object { $_.id -eq $workOrder.id } | Select-Object -First 1
if (-not $managementPayment) { throw "Closed payment was not added to the management payment ledger" }
if ($managementPayment.direction -ne "OUTFLOW") { throw "Management payment was not classified as cash outflow" }
if ([decimal]$managementPayment.paymentValue -ne $expectedFinalTotal) { throw "Management payment ledger total is incorrect" }

$providerPayments = Invoke-Api -Method GET -Path "/dashboard/payments" -Session $providerSession
$providerPayment = $providerPayments.payments | Where-Object { $_.id -eq $workOrder.id } | Select-Object -First 1
if (-not $providerPayment) { throw "Closed payment was not added to the provider payment ledger" }
if ($providerPayment.direction -ne "INFLOW") { throw "Provider payment was not classified as cash inflow" }
if ([decimal]$providerPayment.paymentValue -ne $expectedFinalTotal) { throw "Provider payment ledger total is incorrect" }

$operatorActivity = Invoke-Api -Method GET -Path "/dashboard/activity" -Session $operatorSession
if (@($operatorActivity.events | Where-Object { $_.actor.id -ne $operator.id }).Count -gt 0) {
    throw "Operator activity feed exposed another role's audit event"
}
$providerActivity = Invoke-Api -Method GET -Path "/dashboard/activity" -Session $providerSession
if (@($providerActivity.events | Where-Object { $_.actor.id -ne $provider.id }).Count -gt 0) {
    throw "Provider activity feed exposed another user's audit event"
}

Write-Host ""
Write-Host "MILESTONE 5.5 LIVE SCENARIO PASSED" -ForegroundColor Green
Write-Host "Machine: $($machine.assetCode)"
Write-Host "Work order: $($workOrder.id)"
Write-Host "Payment reference: PAY-$stamp"
Write-Host "Initial budget: LKR $proposedBudget"
Write-Host "Counter budget: LKR $counterBudget"
Write-Host "Final total: LKR $actualFinalTotal (LKR 1500 over the counter budget)"
Write-Host "Payment ledgers: management outflow and provider inflow verified"
Write-Host "Applied warranty end: $warrantyEndText"
Write-Host "Applied replacement due: $nextReplacementText"
