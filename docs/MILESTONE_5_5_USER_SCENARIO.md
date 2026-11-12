# Milestone 5.5 User Scenario

## Role responsibilities

| Role | Main responsibility in this scenario |
|---|---|
| Admin | Creates accounts, can review and dispatch requests, and can approve payment. |
| Owner | Business authority who can review, dispatch, reject, cancel, and approve payment. |
| Manager | Runs the daily service workflow and has the same operational approval actions as Owner. |
| Machine Operator | Registers their own machines, maintains parts and dates, responds to alerts, and raises service requests. |
| Service Provider | Accepts assigned requests, performs service, records replacements/evidence, and submits completion. |

Owner and Manager intentionally overlap for operational continuity. Admin remains the only role that manages user accounts. Owner represents business authority; Manager handles day-to-day execution.

## Expected status path

`DRAFT -> PENDING_MANAGEMENT_APPROVAL -> SENT_TO_PROVIDER -> PROVIDER_ACCEPTED -> IN_PROGRESS -> AWAITING_PAYMENT_APPROVAL -> CLOSED`

`REJECTED` and `CANCELLED` are terminal alternatives. Old Milestone 5 statuses remain readable for existing records, but new requests follow the path above.

## Stage 1: Prepare accounts

1. Sign in as Admin.
2. Create one active Machine Operator, one active Service Provider, and one active Manager.
3. Confirm only Admin can open user administration.
4. As Admin, open **Overview > Organization identity** and enter the university/company name, address, registration number, phone, and email.

Expected result: all three accounts can sign in and have only their role-specific navigation and actions. The organization details appear on printable service receipts for every role.

## Stage 2: Register the asset and dates

1. Sign in as Machine Operator.
2. Open **Machines and maintenance** and select **Add machine**.
3. Enter the asset code, name, category, location, warranty start, and warranty end.
4. Save the machine. The operator assignment is automatic and cannot be changed by the operator.
5. Add a part with its part number, quantity, warranty dates, and replacement due date.
6. Add an active maintenance plan with a next due date and alert threshold.

Expected result: the operator can edit their own machine, parts, and plans, but cannot delete the machine or reassign it to another operator.

## Stage 3: Generate and respond to an alert

1. Sign in as Admin or Manager and open **Alerts**.
2. Select **Run checks**.
3. Sign back in as the Machine Operator and open **Alerts**.
4. Confirm the part replacement or maintenance alert shows the correct machine, source, and due date.
5. Select **Acknowledge** and confirm the status changes to `ACKNOWLEDGED`.
6. Select **Reopen** and confirm it returns to `OPEN`.
7. Select **Create service request**.

Expected result: the service request editor opens with the machine, source alert, request title, and category already selected. Machine details, parts, warranty/replacement dates, and active plan count are visible before saving.

## Stage 4: Submit and dispatch the request

1. As Machine Operator, choose a priority, add the problem description and preferred date, then save.
2. Confirm the request is `DRAFT` and select **Submit for review**.
3. Sign in as Admin, Owner, or Manager.
4. Open the request in `PENDING_MANAGEMENT_APPROVAL`.
5. Select an active Service Provider, enter the organization's **Proposed budget**, and choose **Approve and send**.

Expected result: the request becomes `SENT_TO_PROVIDER`. Management approval is recorded in the audit log. The operator does not need to approve a second time because the operator created and submitted the request.

## Stage 5: Provider service and completion

1. Sign in as the assigned Service Provider.
2. Confirm only assigned, dispatched requests are visible and no permission error appears when opening one.
3. Open the request and select **Accept request**. Confirm `PROVIDER_ACCEPTED`.
4. Select **Start work**. Confirm `IN_PROGRESS`.
5. Enter the completed date, service/labour charge, service notes, provider business name, provider address, provider registration number, contact, and invoice/receipt number.
6. Add a replacement line. Select the existing machine part when applicable, or use **New or unlisted part** for an extra part. Enter quantity, unit cost, new warranty dates, and the next replacement date.
7. Add service-report and invoice or payment-slip evidence metadata.
8. Confirm the system automatically displays proposed budget, parts total, service/labour charge, final total, and over/under-budget variance.
9. Use **Print service slip** and confirm the organization heading, provider identity, invoice number, machine, service, replacement, financial summary, warranty, and evidence details are present.
10. Select **Submit completion**.

Expected result: the request becomes `AWAITING_PAYMENT_APPROVAL`. Replacement dates are recorded on the request but are not applied to the live asset register until payment approval.

## Stage 6: Price counteroffer, payment approval, and closure

1. Sign in as Owner or Manager.
2. Open **Alerts** and confirm a payment-approval alert exists for the completed request.
3. Open the request and review the printable service slip, evidence, costs, and replacement dates.
4. When the receipt needs revision, enter a **Counter budget** and a required reason/message, then select **Counter and request revision**.
5. Sign in as the assigned Service Provider. Confirm the counter budget, management message, and reviewed provider total are visible.
6. Edit the real service/labour charge or edit replacement quantity/unit price as appropriate. The revised final total does not need to equal the counter budget.
7. Select **Resubmit revised receipt**. Confirm the request returns to `AWAITING_PAYMENT_APPROVAL` and the same payment alert is reopened.
8. As Owner or Manager, either send another counteroffer or enter an invoice/transaction reference and select **Approve payment and close**. Admin may approve but cannot create a price counteroffer.

Expected result:

- The request becomes `CLOSED`.
- The payment alert becomes `RESOLVED`.
- Existing part warranty and replacement dates are updated, or a new Machine Part is created for an unlisted replacement.
- The approver, approval time, payment reference, and applied part IDs are audited.
- Every counter budget, reviewed provider total, reason, author, and provider response time remains in counteroffer history.

## Stage 7: Final operator verification

1. Sign in as the Machine Operator.
2. Open the machine and inspect its parts.
3. Confirm the provider's new warranty end and next replacement dates now appear.
4. Open the closed service request and confirm it is read-only and printable.
5. Open **Overview** as Operator and Provider and confirm each recent activity feed shows only actions personally performed by that signed-in user.

## Stage 8: Activity hierarchy and payment reporting

1. Sign in as Admin and confirm **Recent activity** can show actions from every role.
2. Sign in as Owner and confirm the feed contains Owner, Manager, and Machine Operator actions, but no Admin or Service Provider actions.
3. Sign in as Manager and confirm the feed contains Manager and Machine Operator actions only.
4. Open **Payments** as Admin, Owner, or Manager. Confirm the closed request appears as organization cash outflow.
5. Confirm the payment row shows the machine, provider, replaced parts and line totals, payment date/reference, approving person's name, proposed budget, final value, and over/under-budget result.
6. Confirm the monthly chart compares organization outflow against the proposed budget.
7. Sign in as the Service Provider and open **Payments**. Confirm the same payment appears as cash inflow and no other provider's payment is visible.
8. Confirm management variance colors show overspending in red and savings in green.
9. Confirm Service Provider variance colors use the provider's income perspective: above budget is green and below budget is red.
10. Confirm the Machine Operator has no Payments tab and receives backend denial for the payment endpoint.

## Negative checks

- A Machine Operator cannot create a request for another operator's machine.
- An operator cannot assign a Service Provider.
- An inactive or non-provider account cannot be dispatched a request.
- A Service Provider cannot see or mutate a request assigned to someone else.
- Work cannot start before provider acceptance.
- Replacement lines cannot be edited during payment review, but become editable when management requests a price revision.
- Admin, Machine Operator, and Service Provider cannot create a management price counteroffer.
- A revised provider total is not required to equal the counter budget.
- A resolved alert cannot be reopened.
- Payment cannot be approved before provider completion submission.
- A closed, rejected, or cancelled request cannot be cancelled or moved backward.

## Automated live check

With Docker, the API, and the database running, execute:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\milestone-5-5-live-scenario.ps1
```

The script performs this scenario through the API and ends with `MILESTONE 5.5 LIVE SCENARIO PASSED` only after it verifies the updated part dates and closed request.
