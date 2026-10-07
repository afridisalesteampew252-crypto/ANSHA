# Agent verification and inquiry workflow

Merged into `main` in PR #119 on 7 October 2026. The production website deployment succeeded, and all three required database migrations were subsequently applied together. Database activation is verified independently of the GitHub merge.

## Verify an agent

1. An admin creates a **Sales** or **Freelancer** account under **Team → Users**, or uses an existing account with one of those roles.
2. The agent opens **My verification** (`/admin/agents`) and submits their full name, contact email and phone. An admin can also enter these details from **Agent verification**.
3. An active admin reviews the submitted name, phone and email, then saves a decision. Verification is a manual admin review; it does not perform email/SMS OTP, identity-document or KYC checks. Rejection and suspension require a reason, visible to that agent.
4. An active, verified agent can copy their public referral link and receive inquiry assignments. Pending, rejected, suspended and inactive agents cannot use this access.

The contact email is separate from the account's sign-in email. Saving genuinely changed contact details on a verified or rejected record returns it to **Awaiting admin review**; formatting-only changes preserve the existing review. Editing a suspended record keeps it suspended and retains the reason until an admin explicitly changes the decision. Referral codes remain the same across contact updates and reviews.

The review screen submits the exact contact details it displayed. If those details changed meanwhile, approval fails with a refresh-and-review message; reload the latest submission before deciding.

## Receive customer inquiries

Public website and mobile forms require a name, message, and **phone or valid email**. A customer can inquire without creating an account and receives the actual inquiry reference after a successful submission. Signed-in customer identity is resolved on the server; the public form cannot choose another customer account.

An agent's shared link contains `?ref=...`. The browser keeps the first well-formed referral for 30 days, without replacing it with later links or extending its original expiry. This depends on the same browser's storage: private browsing, cleared/blocked storage and another device can lose attribution. Capturing or opening a link does not create an inquiry or commission.

On submission, the server accepts attribution only for a currently active, verified agent. Invalid, inactive or unverified referral codes are ignored so the customer's inquiry can still be received. Browser storage alone does not establish a trusted introducer.

**An admin assigns both direct and referred website inquiries.** A referral records who introduced the customer; it does not automatically assign the inquiry, transfer customer ownership or expose it to that introducer. An inquiry without a valid referral appears as a direct customer inquiry for admin assignment.

## Assign and follow up

Use **Inquiries** (`/admin/inquiries`), or **My inquiries** for agents:

1. Find new, unassigned or overdue inquiries. Filter by stage, source, introducer or assignee, or search the inquiry reference and contact details.
2. An admin opens an inquiry and selects an active, verified sales agent or freelancer. Assigning a new inquiry moves it to **Assigned**. Reassignment changes who handles follow-up; the original introducer and referral snapshot are fixed attribution, independent of the assignee, and cannot be rewritten during follow-up or transfer.
3. Admin/staff and the currently assigned, verified agent can update the stages **New, Assigned, Contacted, Quoted, Won or Lost**, add notes and set the next follow-up. Follow-up entry uses the operator's local time; clear it to remove the date. An **Assigned** inquiry must have an assignee.
4. Review the inquiry's activity history for assignment, stage, follow-up and note changes. Won, lost and archived inquiries are excluded from overdue work.

Agents see their assigned inquiries and their own manually created submissions while those remain unassigned. Own-created, unassigned submissions are **read-only** until an admin assigns them. Creating a lead does not grant self-assignment or access to other unassigned leads. Once an inquiry is transferred, agent access follows the current assignment.

The inbox loads up to 300 matching records. Stage totals follow the current server search/stage scope; source, introducer, assignee and overdue filters refine the loaded list. Narrow the search or stage when looking for older records.

## Log WhatsApp and phone conversations

Admin/staff or a verified agent can use **Add inquiry** and select **WhatsApp**, **Phone call** or **Manual / other conversation**. Record the contact details and message; linking a stock item is optional. A verified agent's manual submission records that agent as the introducer and remains available for admin assignment.

These entries are manually logged conversations. This release does not automatically import WhatsApp messages or calls.

## Link an existing customer carefully

Only an admin can link an inquiry to an existing active customer. Review the suggested contact matches or search the customer list, choose the correct record, then save. Suggestions never automatically merge customers, create a customer, change account ownership or transfer financial records. Matching contact details are a prompt to check the record, not proof that two people are the same customer.

The customer's active portal account can then see that inquiry under **Your stock inquiries**, including inquiries first submitted as a guest or logged manually by an agent. The current customer link controls access: unlinking or changing that link removes the former customer's access. Changing a portal account's customer mapping also updates its inquiry access. The original submission identity remains unchanged; it is a fallback only for legacy inquiries without a customer link. Internal follow-up notes, activity and files remain private to authorized operations users and agents.

A portal inquiry already belongs to its customer account and cannot be moved to a different account through this screen. Customer ownership/reassignment remains its separate authorized workflow.

## Privacy, history and sales outcomes

- Active admins can review all sales/freelancer verification records. Agents can read/edit their own contact submission; staff, managers and accounts cannot approve agents or browse all verification contacts.
- Active admin/staff have the operational inquiry inbox. Verified agents have only their permitted assigned/own-unassigned inquiry scope, including related activity and request files. Managers/accounts do not gain inquiry inbox access. Anonymous customers cannot browse inquiries; signed-in customers retain their own linked-inquiry access.
- Verification contact changes and review decisions enter the existing admin-only, append-only audit log. Inquiry follow-up changes enter append-only request activity; assignment notifications and due reminders follow permitted recipient access.
- Previously closed inquiries migrate to **Archived**, preserving history without guessing whether a sale was won or lost. Review the conversation before explicitly reclassifying its sales stage.
- **Won is a sales-tracking stage.** This release does not generate invoices, mark payments approved, calculate referral commissions or pay agents automatically. Existing invoice/payment/commission procedures remain the source of financial results.

## Release order

The original feature's production activation is complete. For a new environment, apply the three migrations in order before activating the website changes:

1. `20261007100000_sales_agent_verification.sql`
2. `20261007101000_sales_inquiry_workflow.sql`
3. `20261007101100_scope_workspace_requests_to_agents.sql`
4. `20261007102000_customer_linked_inquiry_visibility.sql` (forward customer-visibility repair, already activated in production)

The inquiry migration depends on verification; the third migration scopes existing request RPCs, activity, attachments, files and reminders. Apply the original three together, followed by the visibility repair, then activate the reviewed website and check contact submission/review, anonymous inquiry receipts, admin assignment, customer links and cross-agent isolation.

Coordinate this cutover with the website release: the intake migration revokes the direct inserts used by the older public forms. Those older forms cannot submit between the database update and activation of the new website. Complete the build and review before starting that production cutover.
