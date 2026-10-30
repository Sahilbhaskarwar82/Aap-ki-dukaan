# System Requirements Specification (SRS)

## CoBuy AI — AI-Assisted Group Procurement Platform for Small Businesses

**Document version:** 1.0  
**Status:** Draft for hackathon MVP  
**Prepared on:** 21 October 2026  
**Target implementation:** JavaScript / MERN stack  
**Payment environment:** PayPal Sandbox for the prototype

---

## Document Control

| Field | Description |
|---|---|
| Product name | CoBuy AI (working name) |
| Product type | Web-based B2B group procurement and bulk-order coordination platform |
| Primary users | Independent shops, cafés, bakeries, restaurants, and participating suppliers |
| Main value proposition | Help small businesses combine compatible purchasing requirements, discover suitable suppliers, evaluate bulk pricing, and coordinate orders and payments |
| Specification purpose | Define the scope, behaviors, interfaces, constraints, and acceptance criteria for the first usable version |

> **Important implementation note:** This SRS distinguishes the hackathon prototype from a production marketplace. PayPal Sandbox can demonstrate checkout and payment-status handling, but collecting funds for multiple buyers and settling a third-party supplier may require specific PayPal products, account approval, onboarding, and compliance checks. The MVP must not claim that supplier settlement is automated unless that integration is actually enabled and tested. A simulated supplier-settlement record is acceptable for the demo and must be labeled as simulated.

## 1. Introduction

### 1.1 Purpose

CoBuy AI is a web platform through which independent businesses submit their purchasing needs, identify compatible requirements from other businesses, combine demand into a potential bulk order, compare supplier offers, and coordinate the purchase. AI assists with interpreting unstructured requirements and suggesting product matches. Deterministic backend logic remains responsible for quantities, eligibility rules, pricing calculations, order state, and payment-state validation.

This document defines the functional and non-functional requirements, system boundaries, architecture, data concepts, external interfaces, key workflows, security requirements, and acceptance tests needed to implement the MVP.

### 1.2 Product Scope

The product supports the following high-level workflow:

1. A shop owner creates an account and a shop profile.
2. The owner enters a purchasing requirement in text or uploads a supported invoice/image/file.
3. The AI service extracts a structured product request from the submitted material.
4. The owner reviews and corrects the extracted information.
5. The platform searches its supplier catalogue for potentially suitable products and offers.
6. The platform suggests existing group-buy pools or allows a new pool to be proposed.
7. Compatible requests may be grouped after product specifications and business rules are checked.
8. The system calculates quantities, MOQ progress, price tiers, estimated shipping, and per-shop cost shares.
9. Each participant reviews and explicitly approves its item, quantity, deadline, and estimated final cost.
10. After the group-buy conditions are met, participants complete the configured payment flow.
11. The platform records payment statuses and coordinates order confirmation with the supplier.
12. Participants can view order status, supplier details, and an audit history.

### 1.3 Goals

- Reduce manual effort required to turn invoices or natural-language requests into structured purchasing requirements.
- Help businesses discover other shops seeking compatible products.
- Make group-buy quantity, MOQ requirements, discounts, shipping, and allocation transparent.
- Provide a supplier comparison process based on verified quote data rather than unsupported AI claims.
- Demonstrate a meaningful AI integration and a working PayPal Sandbox payment experience.
- Build an end-to-end product that can be implemented by a small hackathon team using JavaScript.

### 1.4 Non-Goals for the MVP

The MVP does not need to:

- Train a custom foundation model or custom computer-vision model.
- Guarantee that AI-generated product matches are correct without review.
- Automatically negotiate binding supplier contracts.
- Crawl arbitrary websites or scrape supplier websites without permission.
- Guarantee live supplier availability or market-wide price coverage.
- Execute real-money transactions during the hackathon demo.
- Hold, pool, escrow, split, or disburse real funds unless the selected payment configuration expressly supports the intended flow and has been approved.
- Automatically issue real supplier payouts unless eligible PayPal capabilities and required approvals are confirmed.
- Provide logistics fleet management, warehouse management, accounting software, tax filing, or a full enterprise procurement suite.
- Operate as a lender, insurer, or credit provider.

### 1.5 Intended Audience

This SRS is intended for the project team, frontend and backend developers, AI integrators, testers, UI/UX designers, hackathon evaluators, and anyone reviewing the product scope.

### 1.6 Definitions and Abbreviations

| Term | Meaning |
|---|---|
| AI extraction | Converting text, a voice transcript, or an uploaded document into structured purchasing fields |
| Product normalization | Converting varying product descriptions into a comparable representation of product attributes |
| Candidate match | A suggested product equivalence that still requires validation or user review |
| MOQ | Minimum order quantity required by a supplier or a price tier |
| Group-buy pool | A proposed or active shared purchase that aggregates compatible requirements from multiple shops |
| Supplier quote | A price and fulfilment offer supplied by a registered supplier or an authorized data source |
| Contribution | One shop's intended or confirmed share of a group order |
| Payment capture | The operation that completes a payment after the relevant approval and payment-provider requirements are met |
| Sandbox | A payment-provider test environment that does not represent a live-money transaction |
| Human-in-the-loop | A workflow in which a person reviews or approves a recommendation or consequential action |
| RBAC | Role-based access control |
| API | Application Programming Interface |
| SRS | System Requirements Specification |

## 2. Overall Description

### 2.1 Product Perspective

CoBuy AI is a web application with a React frontend, a Node.js/Express backend, MongoDB storage, an external AI model API, and PayPal Sandbox integration. Supplier discovery initially uses a curated or manually populated supplier database. Optional product-discovery APIs may be added behind a provider adapter, but the core product must remain usable without them.

### 2.2 User Classes

#### 2.2.1 Shop Owner

A shop owner manages a business profile, submits requirements, reviews AI-extracted data, joins or leaves eligible group-buy pools before commitment deadlines, reviews supplier offers, approves costs, makes payments through the configured checkout, and tracks orders.

#### 2.2.2 Supplier

A supplier profile may be created or managed by an administrator for the MVP. A supplier can be modeled as an external business with products, MOQs, price tiers, delivery regions, estimated lead times, and quote validity. A future supplier portal may allow suppliers to update catalogue entries and respond to quotation requests.

#### 2.2.3 Platform Administrator

An administrator manages users, supplier records, product catalogue quality, suspicious content, order exceptions, and platform configuration. Administrative actions must be recorded in an audit log.

#### 2.2.4 Demo Evaluator / Read-Only Reviewer

A reviewer may inspect seeded scenarios, orders, AI results, payment sandbox events, and audit logs without modifying business or payment data. This is optional for the MVP and may be implemented through a demo account.

### 2.3 Operating Environment

- Modern desktop and mobile web browsers.
- Frontend: React with Vite, JavaScript, and a component library such as Tailwind CSS and shadcn/ui.
- Backend: a supported Node.js LTS release and Express.js.
- Database: MongoDB Atlas or a compatible MongoDB deployment with Mongoose.
- AI provider: one selected hosted model/API supporting the input types used by the project and returning structured output.
- Payment integration: PayPal JavaScript SDK and relevant PayPal REST APIs in Sandbox.
- Hosting: a static frontend host such as Vercel and a Node.js host such as Render, or an equivalent deployment arrangement.

### 2.4 Design and Implementation Constraints

- JavaScript is the primary application language for both frontend and backend.
- Secrets and private API credentials must remain on the backend.
- AI output is untrusted input and must be validated before being stored or used by business logic.
- All authoritative financial calculations must be performed by backend code using decimal-safe arithmetic or integer minor units, not by an LLM.
- Product compatibility must be based on relevant specifications, not only similar names or embeddings.
- The application must not treat an AI suggestion, a browser redirect, or a client-supplied status as proof of payment.
- External API rate limits, model capabilities, payment account permissions, and vendor-data coverage may constrain implementation.
- If live supplier data cannot be obtained lawfully and reliably, seeded demo supplier records must be clearly identified as sample data.

### 2.5 Assumptions and Dependencies

- The initial demo uses a small, seeded set of suppliers and products.
- Shop owners provide accurate quantities and can review extracted details before committing.
- Supplier quotes include, or can be supplemented with, the product pack size, currency, MOQ, price tiers, delivery area, expected lead time, and quote expiry where applicable.
- The project team has access to an AI API key and PayPal Developer Sandbox credentials.
- The initial scope is a single currency per group order. Currency conversion is outside the MVP.
- Exact real-world payment collection and supplier settlement depend on the selected PayPal product, account eligibility, and current provider requirements.
- External supplier integrations are optional; an internal catalogue and seeded quotations are sufficient for the demo.

## 3. System Features and Functional Requirements

Requirement identifiers are normative. **MUST** indicates a requirement for the MVP; **SHOULD** indicates a desirable requirement; **MAY** indicates an optional feature.

### 3.1 Account and Authentication

- **FR-AUTH-001 (MUST):** The system shall allow a new shop owner to register with a name, email, password, and shop name.
- **FR-AUTH-002 (MUST):** The system shall authenticate registered users before permitting access to private shop, order, and payment information.
- **FR-AUTH-003 (MUST):** The system shall hash passwords using a suitable password-hashing algorithm and shall never store plaintext passwords.
- **FR-AUTH-004 (MUST):** The system shall support logout and invalidation of the active session or token according to the implemented session design.
- **FR-AUTH-005 (MUST):** The system shall enforce role-based access control for shop owners and administrators.
- **FR-AUTH-006 (MUST):** A shop owner shall be able to view and update permitted fields of their shop profile.
- **FR-AUTH-007 (SHOULD):** The system should support password-reset flows through a verified channel before production release.
- **FR-AUTH-008 (MUST):** Users shall not be able to read or modify another shop's private requirements, payment records, or contribution data unless explicitly authorized by a group-order workflow or administrative permission.

### 3.2 Shop Profile and Requirements Intake

- **FR-REQ-001 (MUST):** A shop owner shall be able to create a purchasing requirement using a form or plain-language text.
- **FR-REQ-002 (MUST):** A requirement shall record product description, requested quantity, quantity unit or pack unit, required-by date where known, delivery area, and optional quality/specification constraints.
- **FR-REQ-003 (MUST):** The system shall support upload of at least one selected document or image type for AI extraction in the MVP, subject to file-size and format restrictions.
- **FR-REQ-004 (MUST):** The system shall show the file name, upload progress or processing status, and a clear error if an upload fails.
- **FR-REQ-005 (MUST):** The system shall allow the owner to edit, confirm, or reject extracted fields before those fields become an approved requirement.
- **FR-REQ-006 (MUST):** The system shall store the original user input or an approved reference to it, extracted values, processing status, timestamps, and the owner who submitted it.
- **FR-REQ-007 (MUST):** The system shall allow a shop owner to save a requirement as a draft before joining a group-buy pool.
- **FR-REQ-008 (SHOULD):** The system should support CSV import for repeat purchasing if it can be implemented without disrupting the MVP.
- **FR-REQ-009 (MUST):** The system shall reject unsupported file formats, over-limit files, and files that fail basic validation.
- **FR-REQ-010 (MUST):** The system shall not execute macros or treat file content as executable instructions.

### 3.3 AI Extraction and Product Normalization

- **FR-AI-001 (MUST):** The system shall send only the necessary text or uploaded content to the selected AI service through a server-side integration.
- **FR-AI-002 (MUST):** The AI extraction flow shall attempt to return a validated structure containing product category, product name/description, quantity, unit, pack size where stated, material/specifications where stated, delivery deadline where stated, and uncertainty or missing-field indicators.
- **FR-AI-003 (MUST):** The backend shall validate the AI response against a schema before accepting it.
- **FR-AI-004 (MUST):** The user interface shall distinguish extracted values from user-confirmed values.
- **FR-AI-005 (MUST):** The AI shall not invent missing quantities, product certifications, exact prices, supplier availability, delivery dates, or specifications. Unknown values shall be represented as unknown or flagged for review.
- **FR-AI-006 (MUST):** The system shall allow the owner to correct AI-extracted fields.
- **FR-AI-007 (MUST):** The system shall identify potential product equivalents using the available catalogue and a comparison of relevant attributes.
- **FR-AI-008 (MUST):** A low-confidence, incomplete, or conflicting match shall be marked for human review rather than automatically treated as equivalent.
- **FR-AI-009 (MUST):** Product matching shall consider applicable fields such as size/capacity, material, food-contact or other relevant requirements, pack count, product type, brand constraints, and other catalogue-specific attributes.
- **FR-AI-010 (MUST):** The system shall preserve the original description alongside normalized attributes so users can inspect why a match was proposed.
- **FR-AI-011 (SHOULD):** The UI should show an explanation of the most important matching factors and any meaningful mismatch.
- **FR-AI-012 (MUST):** AI-generated recommendations shall not directly create or capture a payment.
- **FR-AI-013 (MUST):** The system shall record the AI provider/model identifier, request timestamp, result status, and relevant structured result metadata while avoiding unnecessary storage of sensitive prompt content.
- **FR-AI-014 (SHOULD):** The system should handle transient AI provider errors with a retry or manual-entry fallback.
- **FR-AI-015 (MUST):** AI calls shall be subject to input-size limits, request timeouts, and server-side rate limiting.

### 3.4 Supplier Catalogue and Supplier Discovery

- **FR-SUP-001 (MUST):** The system shall store supplier records containing supplier name, contact or reference information, service area, status, and available product/offer references.
- **FR-SUP-002 (MUST):** A supplier product offer shall support product description/specifications, pack unit, currency, unit price, MOQ, quantity-tier pricing where applicable, lead time, delivery coverage, stock/availability note where known, quote timestamp, and expiry where applicable.
- **FR-SUP-003 (MUST):** The backend shall search the internal supplier catalogue for offers compatible with a confirmed product requirement.
- **FR-SUP-004 (MUST):** The system shall filter out offers that fail hard constraints such as unsupported delivery area, invalid/expired quote, incompatible product specification, or unmet MOQ where the supplier does not support order aggregation across the pool.
- **FR-SUP-005 (MUST):** The platform shall identify whether each offer is verified supplier data, a supplier-submitted quote, an external API result, or seeded demo data.
- **FR-SUP-006 (MUST):** The user interface shall not describe seeded data as a live supplier quote.
- **FR-SUP-007 (MUST):** The system shall display the basis of each supplier offer, including currency, per-unit/pack unit, MOQ, delivery estimate, quote date, and any known shipping/tax exclusions.
- **FR-SUP-008 (SHOULD):** An administrator should be able to create, update, deactivate, and verify supplier and product records.
- **FR-SUP-009 (SHOULD):** The system should support requesting quotes from registered suppliers and storing their responses.
- **FR-SUP-010 (MAY):** The system may integrate a third-party product discovery API behind an adapter layer.
- **FR-SUP-011 (MUST):** External data shall be validated and normalized before being used in supplier comparisons.
- **FR-SUP-012 (MUST):** The system shall not claim to have searched all suppliers in a market unless the data source actually supports that claim.
- **FR-SUP-013 (MUST):** A displayed supplier recommendation shall be based on explicit attributes such as final estimated cost, MOQ feasibility, product compatibility, delivery fit, and quote freshness.

### 3.5 Group-Buy Pool Management

- **FR-POOL-001 (MUST):** An eligible shop owner shall be able to view available pools that may match their confirmed requirements.
- **FR-POOL-002 (MUST):** An eligible shop owner shall be able to join a pool by selecting a compatible product/offer and confirming quantity and constraints.
- **FR-POOL-003 (MUST):** The system shall only combine requirements when the product and pack-unit compatibility rules are satisfied or an explicitly approved substitution is in place.
- **FR-POOL-004 (MUST):** The backend shall calculate total quantity from confirmed contributions; AI shall not calculate the authoritative total.
- **FR-POOL-005 (MUST):** Each pool shall contain a target MOQ or target quantity, a deadline, a lifecycle status, a selected or proposed supplier offer, and its contributions.
- **FR-POOL-006 (MUST):** The interface shall show progress toward the relevant MOQ or price tier and explain which quantity threshold unlocks which price.
- **FR-POOL-007 (MUST):** The system shall recalculate totals, price tiers, and eligible cost shares after a contribution changes, subject to pool rules.
- **FR-POOL-008 (MUST):** The system shall prevent a pool from being finalized if its required quantity, approvals, supplier quote, or other configured preconditions are missing.
- **FR-POOL-009 (MUST):** The system shall define clear states such as Draft, Recruiting, MOQ Reached, Awaiting Buyer Approval, Awaiting Payment, Funded, Supplier Order Pending, Ordered, Fulfilled, Cancelled, and Expired. Some states may be combined for the initial UI, but valid transitions must be enforced.
- **FR-POOL-010 (MUST):** Joining, changing quantity, or withdrawing shall be allowed only while the pool is in an eligible state and before its configured commitment cutoff.
- **FR-POOL-011 (MUST):** The system shall record the time and user associated with joining, changing, approving, or withdrawing from a pool.
- **FR-POOL-012 (MUST):** The system shall prevent duplicate active contributions by the same shop for the same pool unless multiple contribution lines are explicitly supported.
- **FR-POOL-013 (SHOULD):** The system should support pool creation from a normalized requirement when no suitable active pool exists.
- **FR-POOL-014 (MUST):** Any pool cancellation or expiry shall set a reason and a timestamp.

### 3.6 Pricing, Savings, and Allocation

- **FR-PRICE-001 (MUST):** All authoritative pricing calculations shall occur in the backend using decimal-safe arithmetic or integer minor units.
- **FR-PRICE-002 (MUST):** The system shall calculate merchandise totals using the selected supplier quote and the correct pack/quantity unit.
- **FR-PRICE-003 (MUST):** The system shall apply quantity-tier pricing only when the total eligible quantity meets the supplier's stated threshold.
- **FR-PRICE-004 (MUST):** The system shall display estimated totals separately from final payable amounts whenever shipping, tax, or any other cost component is unknown.
- **FR-PRICE-005 (MUST):** The system shall define the allocation method for shipping and other shared costs (for example, per unit, per weight, or an equal share) and disclose the method to participants before approval.
- **FR-PRICE-006 (MUST):** The system shall calculate each shop's share from the approved quantities and disclosed allocation method, then verify that the sum of shares equals the group total, subject only to explicitly displayed rounding treatment.
- **FR-PRICE-007 (MUST):** The system shall display the currency for every price and shall not mix currencies in one pool.
- **FR-PRICE-008 (MUST):** The system shall show the comparison baseline used for any claimed savings and label the baseline source and timestamp.
- **FR-PRICE-009 (MUST):** The system shall not claim guaranteed savings when the comparison price is unverified, expired, or not comparable.
- **FR-PRICE-010 (MUST):** The system shall recalculate the final share and require renewed approval when a price, quantity, shipping charge, or other material cost changes after approval.
- **FR-PRICE-011 (SHOULD):** The system should show an itemized cost breakdown per shop.

### 3.7 Supplier Quote Evaluation

- **FR-QUOTE-001 (MUST):** The system shall store supplier quotes with supplier, product/offer, quantity, currency, price tiers, shipping conditions, delivery estimate, quote validity, and provenance.
- **FR-QUOTE-002 (MUST):** The system shall compare valid quotes using a deterministic calculation of total estimated landed cost based on known costs.
- **FR-QUOTE-003 (MUST):** The platform may use AI to summarize trade-offs, but all numerical claims in the summary must be grounded in backend-calculated values.
- **FR-QUOTE-004 (MUST):** The system shall identify when a quote lacks enough information for a reliable comparison.
- **FR-QUOTE-005 (SHOULD):** The system should let an administrator or shop owner request an updated quote when a quote is stale or expired.

### 3.8 Approval and Order Finalization

- **FR-ORDER-001 (MUST):** Before payment, each participant shall see the supplier/offer, product specifications, quantity, price, allocated shipping/fees, total payable amount, currency, deadline, and cancellation rules.
- **FR-ORDER-002 (MUST):** Each participant shall explicitly approve their final contribution and amount.
- **FR-ORDER-003 (MUST):** The backend shall store the approved price breakdown and a version or snapshot so later price changes do not overwrite the historical approval.
- **FR-ORDER-004 (MUST):** A group order shall be ready for payment only after required MOQ conditions, quote validity, participant approvals, and product/quantity checks have passed.
- **FR-ORDER-005 (MUST):** The system shall prevent a supplier order from being marked confirmed based only on an AI response or frontend event.
- **FR-ORDER-006 (MUST):** The system shall record supplier-order confirmation using a supplier reference, administrator confirmation, or an explicitly labeled simulated confirmation in demo mode.
- **FR-ORDER-007 (MUST):** Any failure to complete an order shall produce a visible status and reason.
- **FR-ORDER-008 (SHOULD):** The system should support a downloadable order summary or purchase-order document.

### 3.9 Payment Integration

#### 3.9.1 MVP Payment Model

The hackathon MVP shall use PayPal Sandbox to demonstrate buyer checkout and reliable payment-status tracking. The implementation must choose and document a supported recipient and settlement model. The default demo can use sandbox buyers and a configured sandbox merchant, track each participant's payment separately, and show supplier settlement as simulated unless a real supported supplier-settlement integration is enabled.

#### 3.9.2 Requirements

- **FR-PAY-001 (MUST):** The system shall create payment orders from the backend using the approved contribution amount and currency.
- **FR-PAY-002 (MUST):** The browser shall not be trusted to set or modify the authoritative amount, recipient, currency, or final payment status.
- **FR-PAY-003 (MUST):** The system shall store the internal contribution ID, provider order ID, provider capture/transaction ID where available, amount, currency, timestamps, and normalized status.
- **FR-PAY-004 (MUST):** The system shall verify provider results on the backend before marking a contribution as paid.
- **FR-PAY-005 (MUST):** The system shall support idempotent processing so repeated requests or webhook deliveries do not double-record a payment or initiate duplicate fulfillment.
- **FR-PAY-006 (MUST):** The system shall handle at least Pending, Approved/Authorized if used, Captured/Paid, Failed, Cancelled, Refunded, and Unknown/Needs Review statuses as appropriate for the chosen flow.
- **FR-PAY-007 (MUST):** The system shall not mark a contribution paid solely because the user returned to a success URL.
- **FR-PAY-008 (MUST):** The system shall display payment errors in understandable language without exposing secret provider details.
- **FR-PAY-009 (MUST):** The system shall reconcile local records against provider order/capture data when needed and identify inconsistent states for review.
- **FR-PAY-010 (MUST):** The system shall keep client IDs, secret keys, webhook verification configuration, and other credentials in server-side environment variables or an equivalent secret manager.
- **FR-PAY-011 (MUST):** The system shall clearly label all sandbox payments as test transactions.
- **FR-PAY-012 (MUST):** The MVP shall not implement a pooled wallet, escrow service, or automatic transfer to a real supplier unless that financial flow is confirmed to be supported by the selected payment product and account.
- **FR-PAY-013 (SHOULD):** Where supported and appropriate, the implementation should process provider webhooks and verify their authenticity before acting on them.
- **FR-PAY-014 (SHOULD):** The design should leave room for authorization-then-capture if the configured PayPal product and authorization validity window fit the actual business workflow. This is not required for the first MVP.
- **FR-PAY-015 (MUST):** Any refund or void behavior must follow the actual payment state and provider-supported operations; the UI must not promise an automatic refund or release without confirmation.
- **FR-PAY-016 (MUST):** Supplier settlement must be represented by an explicit state such as Not Started, Simulated, Pending, Confirmed, Failed, or Needs Review, and must not be confused with buyer payment capture.

### 3.10 Notifications and Activity History

- **FR-NOTIF-001 (MUST):** The system shall display in-app status updates for important events, including a pool reaching MOQ, approval requests, payment status, supplier-order confirmation, cancellation, and expiry.
- **FR-NOTIF-002 (SHOULD):** The system should support email notifications if an email provider is available and configured.
- **FR-NOTIF-003 (MUST):** The system shall show a chronological activity history for each group order.
- **FR-NOTIF-004 (MUST):** Notification delivery failure shall not alter the underlying order or payment state.

### 3.11 Administrative and Audit Features

- **FR-ADMIN-001 (MUST):** An administrator shall be able to view and manage supplier and product records within authorized permissions.
- **FR-ADMIN-002 (MUST):** An administrator shall be able to inspect pools and identify stalled, expired, or inconsistent orders.
- **FR-ADMIN-003 (MUST):** Administrative changes to supplier offers, quote status, order state, and payment annotations shall be logged.
- **FR-ADMIN-004 (MUST):** Audit records shall include actor, action, affected resource, timestamp, and safe contextual metadata.
- **FR-ADMIN-005 (MUST):** The system shall not allow an administrator to edit captured payment facts as though a payment had not occurred. Corrections must be represented through a separate audit event and provider reconciliation.
- **FR-ADMIN-006 (SHOULD):** The system should support marking individual supplier records as verified, unverified, inactive, or demo-only.

## 4. Business Rules

- **BR-001:** Only approved/confirmed requirement data may be used as authoritative input to a purchasing pool.
- **BR-002:** Product descriptions that appear similar are not automatically considered equivalent. Relevant specifications must be compatible.
- **BR-003:** Any substitution that changes a material product attribute must be approved by the affected shop before commitment.
- **BR-004:** MOQ and price-tier eligibility are calculated on the exact units defined by the supplier offer. Boxes, cases, pieces, and cartons must not be mixed without a validated conversion.
- **BR-005:** The authoritative pool total equals the sum of eligible confirmed contributions, excluding withdrawn or invalid contributions.
- **BR-006:** The final payable amount per shop must be based on an approved price snapshot.
- **BR-007:** If any material price changes after approval, affected participants must approve the new amount before payment.
- **BR-008:** A pool cannot move to Funded unless the configured payment completion condition is satisfied.
- **BR-009:** Buyer payment and supplier settlement are different business events and must be tracked separately.
- **BR-010:** Payment actions must be idempotent and verified server-side.
- **BR-011:** AI recommendations are advisory. AI cannot override hard constraints, role permissions, user approvals, or payment-provider results.
- **BR-012:** Seeded demo supplier data, estimated prices, and simulated settlements must be disclosed as such.
- **BR-013:** Costs such as shipping, taxes, payment fees, or duties that are not known must be displayed as excluded, estimated, or pending rather than silently treated as zero.
- **BR-014:** Only one currency is allowed within an MVP group order.
- **BR-015:** A pool may have a defined deadline after which new participants cannot join and the pool may expire or proceed based on its configured conditions.

## 5. Use Cases

### UC-01: Register a Shop

**Primary actor:** Shop owner  
**Preconditions:** User has access to the web app and a valid email address.  
**Main flow:**
1. User submits registration details and shop details.
2. Backend validates the input and checks for an existing account.
3. Password is securely hashed.
4. Account and shop profile are created.
5. User receives confirmation and can sign in.

**Exception flows:** Invalid input, duplicate email, or database failure results in a clear error with no partial account creation.

### UC-02: Submit a Requirement Using Text

**Primary actor:** Shop owner  
**Preconditions:** User is authenticated.  
**Main flow:**
1. User enters a purchasing description and any known fields.
2. Backend validates the request.
3. AI extracts/normalizes fields and returns structured output.
4. Backend schema-validates the response.
5. UI presents fields and uncertainty for user review.
6. User edits and confirms the requirement.
7. Requirement is saved as confirmed.

**Exception flows:** If AI is unavailable or the result is invalid, the user can manually fill the form and save the requirement.

### UC-03: Submit an Invoice

**Primary actor:** Shop owner  
**Preconditions:** User is authenticated; file type and size meet limits.  
**Main flow:**
1. User uploads a supported image or document.
2. Backend validates file metadata and stores it through the configured storage approach.
3. AI extracts line items and relevant attributes where supported.
4. UI shows extracted items and any uncertain fields.
5. User corrects and confirms the relevant item(s).
6. Confirmed item(s) become purchasing requirements.

**Exception flows:** Unsupported file, excessive size, unreadable document, or provider failure results in a manual-entry path and an error message.

### UC-04: Match a Requirement to a Supplier Offer

**Primary actor:** Shop owner  
**Preconditions:** A confirmed requirement and usable supplier catalogue data exist.  
**Main flow:**
1. Backend searches products by category and relevant attributes.
2. Backend filters hard constraint failures.
3. AI may help rank or explain candidates.
4. UI shows offer data, data provenance, MOQ, tier pricing, delivery estimate, and limitations.
5. User selects a suitable offer or chooses to wait/request a quote.

**Exception flows:** No compatible offer exists; platform communicates this and offers manual quote entry or a new-pool draft rather than inventing a supplier.

### UC-05: Join a Group-Buy Pool

**Primary actor:** Shop owner  
**Preconditions:** Pool is open and the requirement is compatible.  
**Main flow:**
1. User chooses a pool and quantity.
2. Backend validates the quantity and eligibility.
3. Backend recomputes MOQ progress and eligible pricing.
4. UI displays updated pool progress and the user's estimated share.
5. User confirms participation.
6. Backend records the contribution and activity event.

**Exception flows:** Pool closed, quote expired, incompatible unit/specification, or stale data causes the operation to be rejected and refreshed.

### UC-06: Finalize a Group Order

**Primary actor:** Platform workflow / administrator  
**Preconditions:** Pool meets its required quantity and has a valid quote.  
**Main flow:**
1. Backend freezes the candidate order snapshot.
2. The final cost breakdown is calculated.
3. Each shop reviews and approves its amount.
4. Backend verifies all necessary approvals and quote validity.
5. Pool moves to the payment-eligible state.

**Exception flows:** Quote expiry or changed cost invalidates the snapshot and requires a refresh/re-approval.

### UC-07: Pay a Contribution in PayPal Sandbox

**Primary actor:** Shop owner  
**Preconditions:** User is authenticated, contribution is approved, and the order is eligible for payment.  
**Main flow:**
1. Frontend requests a checkout session from the backend.
2. Backend derives amount and currency from the approved server-side snapshot and creates a provider order.
3. User approves checkout in PayPal Sandbox.
4. Backend performs the allowed capture operation and verifies the provider response.
5. Backend updates the contribution payment state idempotently.
6. UI displays the verified result.

**Exception flows:** User cancels, provider rejects, capture fails, response times out, or webhook is delayed. The UI shows a pending/failed/needs-review state and does not infer success from a redirect alone.

### UC-08: Complete or Expire a Pool

**Primary actor:** Platform workflow / administrator  
**Preconditions:** Pool deadline is reached or all completion conditions have been evaluated.  
**Main flow:**
1. Backend evaluates MOQ, approvals, quote validity, and payment conditions.
2. If conditions are satisfied, the order moves to the next valid state.
3. If conditions cannot be met, the pool expires or is cancelled with a reason.
4. The system informs participants and records the transition.

**Exception flows:** A provider or database outage may place the order in Needs Review until reconciliation completes.

## 6. External Interface Requirements

### 6.1 User Interface

The web interface shall provide at least these screens:

1. **Authentication:** register, sign in, and logout.
2. **Shop dashboard:** active requirements, joined pools, pending approvals, payment status, and recent activity.
3. **New requirement:** natural-language input, supported file upload, AI extraction status, review/edit form.
4. **Supplier catalogue and comparison:** search, filters, product detail, quote source, MOQ, price tiers, and delivery data.
5. **Group-buy marketplace:** pool status, current quantity, target MOQ, deadline, and eligibility information.
6. **Pool detail:** participants or anonymized participation summary as appropriate, product specifications, contributions, price tiers, shipping rule, and activity log.
7. **Approval and checkout:** itemized amount, terms, cancellation/expiry behavior, and PayPal Sandbox checkout.
8. **Order detail:** payment states, supplier-order status, receipt/reference identifiers, and next steps.
9. **Admin workspace:** supplier catalogue maintenance, demo-data indicators, and exception review.

UI principles:

- Show the difference between estimated and final price.
- Display currency and units beside every monetary value and quantity.
- Use explicit buttons for approve, join, leave, pay, and cancel actions.
- Use clear loading, empty, success, error, and retry states.
- Do not show a misleading "paid" or "supplier paid" badge without verified supporting state.
- Make AI uncertainty and product substitutions visible.
- Provide keyboard-accessible controls and readable contrast.

### 6.2 Backend API Interface

The following REST endpoints are an initial proposal. Exact request and response formats may evolve, but equivalent functionality must be implemented.

| Method | Endpoint | Purpose | Access |
|---|---|---|---|
| POST | `/api/auth/register` | Register a shop owner and shop | Public |
| POST | `/api/auth/login` | Authenticate | Public |
| POST | `/api/auth/logout` | End session where supported | Authenticated |
| GET | `/api/me` | Get current user and shop profile | Authenticated |
| PATCH | `/api/shops/me` | Update permitted shop fields | Shop owner |
| POST | `/api/requirements` | Create a manual/text requirement | Shop owner |
| GET | `/api/requirements` | List own requirements | Shop owner |
| GET | `/api/requirements/:id` | Read an own requirement | Owner/admin |
| PATCH | `/api/requirements/:id` | Edit a draft/uncommitted requirement | Owner/admin within policy |
| POST | `/api/requirements/:id/extract` | Run AI extraction/normalization | Owner/admin |
| POST | `/api/uploads` | Upload supported file for extraction | Shop owner |
| GET | `/api/suppliers` | Search/list permitted supplier data | Authenticated |
| GET | `/api/suppliers/:id` | Read supplier detail | Authenticated |
| GET | `/api/products/search` | Search normalized supplier products | Authenticated |
| GET | `/api/offers/search` | Search eligible offers for a requirement | Authenticated |
| POST | `/api/quotes/requests` | Request supplier quote where supported | Authenticated |
| GET | `/api/pools` | Search or list group-buy pools | Authenticated |
| POST | `/api/pools` | Create a draft pool where authorized | Shop owner/admin |
| GET | `/api/pools/:id` | View pool detail | Authenticated if eligible |
| POST | `/api/pools/:id/contributions` | Join pool or add contribution | Shop owner |
| PATCH | `/api/pools/:id/contributions/:contributionId` | Change quantity while eligible | Contribution owner |
| DELETE | `/api/pools/:id/contributions/:contributionId` | Withdraw while eligible | Contribution owner |
| POST | `/api/pools/:id/approve` | Approve final cost snapshot | Contribution owner |
| POST | `/api/pools/:id/finalize` | Validate finalization conditions | Authorized workflow/admin |
| POST | `/api/payments/create-order` | Create provider checkout order | Authenticated participant |
| POST | `/api/payments/:paymentId/capture` | Capture/complete an approved payment when supported | Authenticated participant, server-validated |
| GET | `/api/payments/:paymentId` | Read payment state | Owner/admin |
| POST | `/api/payments/webhook` | Receive provider webhook events | Provider verification required |
| GET | `/api/orders/:id` | Get order status and breakdown | Authorized participant/admin |
| GET | `/api/orders/:id/activity` | Get order activity history | Authorized participant/admin |
| POST | `/api/admin/suppliers` | Create supplier record | Admin |
| PATCH | `/api/admin/suppliers/:id` | Update supplier record | Admin |
| POST | `/api/admin/offers` | Create/update supplier offer | Admin |
| GET | `/api/admin/reconciliation` | Review payment/order inconsistencies | Admin |

All request bodies must be validated. Authorization must be enforced on the backend for every private resource. The API must use consistent error responses and avoid returning secrets or sensitive provider payloads.

### 6.3 AI Service Interface

The AI integration should be wrapped in a backend service module, not scattered throughout route handlers. Example logical interface:

- `extractRequirement(input)`: returns normalized product request candidates and uncertainty flags.
- `normalizeProduct(description, attributes)`: returns structured attributes and missing fields.
- `matchProducts(requirement, catalogueCandidates)`: returns ranked candidate IDs, attribute comparisons, mismatch reasons, and confidence signals.
- `summarizeQuotes(verifiedQuotes, calculatedComparison)`: returns a natural-language explanation grounded in supplied verified values.

The AI must not independently create authoritative supplier data, final prices, transaction IDs, payment confirmations, or order-state transitions. Provider-specific JSON schema or structured-output features may be used if available. A schema validator must still run server-side.

### 6.4 Supplier Data Interface

The first supplier interface shall be the internal MongoDB catalogue and admin tools. Optional external supplier/product APIs shall be implemented as provider adapters, with normalized data returned to a common internal offer schema. Integration must respect each source's usage terms, rate limits, and attribution requirements.

### 6.5 PayPal Interface

- Use the PayPal JavaScript SDK for the checkout UI where appropriate.
- Create orders and perform permitted capture operations from the backend.
- Use the configured Sandbox client credentials and merchant/buyer test accounts.
- Verify payment outcomes from the provider response and, where implemented, authenticated webhooks.
- Use idempotency and provider identifiers to avoid duplicate payment records.
- Keep buyer payment status separate from supplier settlement status.
- Confirm that the chosen PayPal product and account support the intended transaction recipient and payout model before promising automated settlement.

### 6.6 File Upload Interface

- Accept only explicitly supported MIME types/extensions and enforce a configured size limit.
- Use generated storage names rather than trusting user-supplied paths.
- Store files in configured object storage or another controlled location; do not store arbitrary executable content.
- Avoid public file URLs for invoices by default.
- Apply malware scanning where practical before production use.
- Provide a deletion/retention policy for uploads.

## 7. Data Requirements and Conceptual Model

The initial data model may use MongoDB collections. The following describes minimum logical entities rather than an immutable database schema.

### 7.1 User

Fields:

- `id`
- `name`
- `email` (unique and normalized)
- `passwordHash`
- `role` (`SHOP_OWNER`, `ADMIN`, optional `REVIEWER`)
- `status` (`ACTIVE`, `DISABLED`, `PENDING_VERIFICATION` as applicable)
- `createdAt`, `updatedAt`, `lastLoginAt`

### 7.2 Shop

Fields:

- `id`
- `ownerUserId`
- `name`
- `businessType`
- `deliveryAddress` or delivery area fields required for fulfilment
- `contactDetails` as necessary
- `preferredCurrency` (MVP default)
- `createdAt`, `updatedAt`

Sensitive location/contact data must be restricted to authorized users and purposes.

### 7.3 Requirement

Fields:

- `id`, `shopId`, `createdByUserId`
- `sourceType` (`TEXT`, `FORM`, `IMAGE`, `PDF`, `CSV` where supported)
- `originalDescription`
- `fileReference` where applicable
- `normalizedProductAttributes`
- `requestedQuantity`, `quantityUnit`, `packSize`
- `requiredBy`, `deliveryArea`, `constraints`
- `extractionStatus`, `reviewStatus`, `confidence/uncertainty metadata`
- `confirmedByUserId`, `confirmedAt`
- `createdAt`, `updatedAt`

### 7.4 Supplier

Fields:

- `id`, `name`, `contactReference`, `serviceAreas`
- `verificationStatus`, `activeStatus`, `dataSourceType`
- `createdAt`, `updatedAt`

### 7.5 Product and Supplier Offer

Product fields:

- `id`, `canonicalName`, `category`, `specifications`, `synonyms`, `brand/brandConstraint` where relevant

Offer fields:

- `id`, `supplierId`, `productId`, `supplierProductDescription`
- `packUnit`, `packSize`, `currency`, `baseUnitPrice`
- `quantityTiers` (minimum quantity, price, and applicable unit)
- `minimumOrderQuantity`, `deliveryAreas`, `leadTime`
- `shippingTerms`, `taxInclusion`, `availabilityStatus`
- `quoteTimestamp`, `expiresAt`, `dataSourceType`, `verificationStatus`

### 7.6 GroupBuyPool

Fields:

- `id`, `title`, `productId` or normalized product snapshot
- `supplierOfferId` or quote reference
- `currency`, `targetMOQ`, `deadline`, `state`
- `priceBreakdownVersion`, `totalEligibleQuantity`, `estimatedTotal`
- `createdBy`, `createdAt`, `updatedAt`, `closedAt`, `closureReason`

### 7.7 Contribution

Fields:

- `id`, `poolId`, `shopId`, `requirementId`
- `quantity`, `unit`, `approvedProduct/substitution`
- `estimatedShare`, `finalShare`, `allocationRule`
- `approvalStatus`, `approvedPriceSnapshotId`, `approvedAt`
- `state`, `createdAt`, `updatedAt`, `withdrawnAt`

### 7.8 Quote

Fields:

- `id`, `supplierId`, `product/offer reference`, `poolId` where applicable
- `quotedQuantity`, `currency`, `unit price`, `quantity tiers`
- `shippingCost/conditions`, `tax inclusion`, `leadTime`, `validUntil`
- `source`, `rawReference`, `status`, `createdAt`

### 7.9 Payment

Fields:

- `id`, `poolId`, `contributionId`, `shopId`
- `provider`, `providerOrderId`, `providerCaptureId` if applicable
- `amount`, `currency`, `paymentStatus`, `paymentModel`
- `createdAt`, `approvedAt`, `capturedAt`, `lastReconciledAt`
- safe error code and reconciliation notes

Do not store card numbers, CVV, PayPal passwords, or unnecessary raw payment data.

### 7.10 SupplierSettlement

Fields:

- `id`, `poolId`, `supplierId`, `amount`, `currency`
- `settlementStatus` (`NOT_STARTED`, `SIMULATED`, `PENDING`, `CONFIRMED`, `FAILED`, `NEEDS_REVIEW`)
- `providerReference` where applicable
- `mode` (`DEMO`, `MANUAL`, `INTEGRATED`)
- `confirmedAt`, `createdAt`, `updatedAt`, `notes`

### 7.11 AuditEvent

Fields:

- `id`, `actorId`, `actorRole`, `action`, `resourceType`, `resourceId`
- safe `metadata`, `createdAt`, correlation/request identifier where useful

### 7.12 Entity Relationships

- One user owns or manages a shop profile according to the initial account model.
- One shop may submit many requirements.
- A product may have offers from many suppliers.
- A group-buy pool aggregates one or more compatible contributions.
- Each contribution belongs to one pool and one shop.
- A contribution may have one or more payment attempts, but no more than the correct amount may be captured for the approved contribution.
- A pool may have one selected supplier offer and a separate supplier settlement record.
- Audit events reference actors and resources without becoming the authoritative financial ledger.

## 8. State Models and Workflows

### 8.1 Requirement Lifecycle

`DRAFT → PROCESSING → NEEDS_REVIEW → CONFIRMED`

Alternative terminal/exception states: `FAILED_EXTRACTION`, `REJECTED`, `ARCHIVED`.

Manual entry may skip AI processing but must still pass validation and user confirmation.

### 8.2 Group-Buy Pool Lifecycle

Suggested state progression:

`DRAFT → RECRUITING → MOQ_REACHED → AWAITING_APPROVALS → AWAITING_PAYMENT → FUNDED → SUPPLIER_ORDER_PENDING → ORDERED → FULFILLED`

Possible alternate states: `EXPIRED`, `CANCELLED`, `FAILED`, `NEEDS_REVIEW`.

The backend shall enforce allowed transitions. For example, an expired pool cannot accept a new contribution, and a pool with unverified payment statuses cannot be marked funded.

### 8.3 Payment Lifecycle

Provider-specific state details must follow the chosen PayPal flow. The application's normalized lifecycle may be:

`CREATED → BUYER_ACTION_REQUIRED → APPROVED → CAPTURE_PENDING → PAID`

Exception states: `CANCELLED`, `FAILED`, `UNKNOWN`, `REFUNDED`, `NEEDS_REVIEW`.

`APPROVED` is not equivalent to `PAID`. A browser success page is not proof of capture. Payment updates must be idempotent and reconciled using provider identifiers.

### 8.4 Supplier Settlement Lifecycle

`NOT_STARTED → SIMULATED` for a demo, or `NOT_STARTED → PENDING → CONFIRMED` for a supported integrated flow. Additional states include `FAILED` and `NEEDS_REVIEW`.

Supplier settlement must remain distinct from individual buyer payment capture.

## 9. Non-Functional Requirements

### 9.1 Security

- **NFR-SEC-001:** All hosted traffic shall use HTTPS.
- **NFR-SEC-002:** Secrets shall be kept in environment variables or a secret manager and excluded from source control.
- **NFR-SEC-003:** Passwords shall be hashed with an appropriate password-hashing function; passwords shall never be logged.
- **NFR-SEC-004:** Backend authorization shall verify resource ownership and role on every private endpoint.
- **NFR-SEC-005:** All request payloads, uploaded files, and AI output shall be validated before use.
- **NFR-SEC-006:** The backend shall use rate limits for authentication, file upload, AI requests, and payment creation.
- **NFR-SEC-007:** The implementation shall defend against common web risks, including injection, cross-site scripting, cross-site request forgery where applicable to the auth model, insecure direct-object references, and unsafe file uploads.
- **NFR-SEC-008:** Errors and logs shall not expose passwords, tokens, API keys, payment secrets, or unnecessary personal data.
- **NFR-SEC-009:** Payment callbacks/webhooks shall be authenticated or cryptographically verified using the provider's prescribed mechanism when available.
- **NFR-SEC-010:** Any AI-supplied string displayed in the UI shall be escaped/safely rendered and must not be interpreted as executable code or trusted system instructions.

### 9.2 Privacy and Data Handling

- **NFR-PRIV-001:** The system shall collect only data needed for the stated procurement workflow.
- **NFR-PRIV-002:** Invoice images and extracted data may contain business-confidential or personal details and shall be accessible only to authorized users and services.
- **NFR-PRIV-003:** The team shall document which data is sent to the AI provider and apply the provider's data-handling settings and terms appropriate to the project.
- **NFR-PRIV-004:** Logs shall avoid retaining full invoice content or full prompts unless required for debugging and approved for the environment.
- **NFR-PRIV-005:** A deletion/retention approach for uploaded files and user records shall be defined before production deployment.

### 9.3 Performance

- **NFR-PERF-001:** Under a hackathon/demo load of 20 concurrent users and a seeded catalogue of 5,000 offers, common catalogue and pool-list requests should generally complete within 2 seconds at the 95th percentile, excluding external AI/payment latency.
- **NFR-PERF-002:** Normal UI navigation should provide loading feedback quickly and avoid blocking the whole application on a slow AI response.
- **NFR-PERF-003:** Long-running AI or file-processing operations shall have a timeout and a recoverable status.
- **NFR-PERF-004:** Backend queries shall use suitable indexes for common lookups such as email, supplier/product references, pool state/deadline, contribution IDs, and provider payment IDs.

These targets are initial project targets and should be adjusted based on measured deployment capacity.

### 9.4 Availability and Reliability

- **NFR-REL-001:** A temporary AI-provider failure shall not make manual requirement entry unavailable.
- **NFR-REL-002:** A payment-provider timeout shall leave the payment in a non-final or reviewable state until reconciled.
- **NFR-REL-003:** Duplicate HTTP requests or webhook events shall not cause duplicate captures, duplicate contribution records, or duplicate supplier-order finalization.
- **NFR-REL-004:** The backend shall validate state transitions and use database safeguards/transactions where appropriate.
- **NFR-REL-005:** The product shall display external integration failures rather than silently proceeding as if successful.

### 9.5 Usability and Accessibility

- **NFR-USE-001:** The core workflow shall be understandable to a non-technical shop owner.
- **NFR-USE-002:** Every field shall have an understandable label and validation error.
- **NFR-USE-003:** Financial and quantity information shall be displayed consistently and clearly.
- **NFR-USE-004:** The main workflow shall be usable on common desktop and mobile screen sizes.
- **NFR-USE-005:** Core controls shall support keyboard navigation and visible focus states; color alone shall not convey a critical status.

### 9.6 Maintainability and Testability

- **NFR-MAINT-001:** Frontend, backend routes, business services, AI adapter, supplier-data adapter, and payment adapter shall be separated into maintainable modules.
- **NFR-MAINT-002:** Business calculations shall be written as testable functions independent of UI and AI provider calls.
- **NFR-MAINT-003:** The project shall document local setup, environment variables, sandbox configuration, database setup, seed data, and test commands.
- **NFR-MAINT-004:** External providers shall be wrapped in adapters to allow mock services during automated tests.
- **NFR-MAINT-005:** The code repository shall include a license file and setup instructions for a public hackathon submission where required by the event rules.

### 9.7 Scalability

- **NFR-SCALE-001:** The design should allow more suppliers, products, shops, and group-buy pools without requiring a fundamental rewrite.
- **NFR-SCALE-002:** AI and supplier search should remain behind service interfaces so providers can be changed.
- **NFR-SCALE-003:** Background job infrastructure is optional for the MVP and may be added later for scheduled expiry checks, bulk notifications, or retryable processing.

### 9.8 Observability

- **NFR-OBS-001:** The backend shall log key state transitions and integration outcomes using structured logs.
- **NFR-OBS-002:** Each request should have a correlation ID where practical.
- **NFR-OBS-003:** Admins should be able to diagnose orders that are stuck due to stale quotes, failed AI calls, delayed webhooks, or payment mismatches.
- **NFR-OBS-004:** Logs shall be scrubbed of unnecessary personal and payment data.

## 10. Error Handling Requirements

The application shall handle at least the following conditions:

- Invalid registration or duplicate account.
- Missing required product attributes.
- Unsupported, oversized, unreadable, or maliciously structured upload.
- AI service unavailable, rate limited, timed out, or returned invalid structured output.
- No compatible supplier offer found.
- Supplier quote expired or lacks shipping information.
- Product units or specifications conflict.
- Pool expired, closed, or failed MOQ.
- Quantity or price changed after approval.
- Payment order creation failed.
- Buyer cancelled checkout.
- Payment capture timed out or returned an ambiguous status.
- Duplicate webhook or out-of-order provider event.
- Supplier settlement is not enabled, simulated, failed, or requires manual review.
- Database connection loss or unexpected server error.

Errors shall result in a safe state, a readable message, and a recovery path where feasible. The system must not infer success to avoid showing an error.

## 11. AI Quality, Safety, and Validation Requirements

### 11.1 General AI Principles

- AI shall support extraction, normalization, matching, and explanation; it shall not be the authoritative source for financial facts.
- Unknown values must remain unknown rather than being guessed.
- AI results must be schema validated, and user review is mandatory before using unconfirmed data for a purchase.
- AI explanations must be grounded in retrieved catalogue records and validated quotes.
- Similarity scores are signals, not proof of product equivalence.

### 11.2 Matching Strategy

The matching process should combine:

1. Hard filters for essential attributes and unit compatibility.
2. Normalized text/category matching and, where useful, embeddings or semantic similarity.
3. Comparison of material attributes such as capacity, material, pack count, product use, certifications/requirements, brand constraints, and size.
4. Confidence and mismatch indicators.
5. Human approval when relevant attributes are missing or differ.

### 11.3 Evaluation

The team should maintain a small evaluation set containing examples of:

- Different descriptions of the same compatible product.
- Similar names but incompatible product sizes/materials.
- Missing quantities or units.
- Invoice text with OCR/extraction errors.
- Product variants with different pack sizes.
- Requests for a brand-specific item that should not be substituted automatically.

Measure extraction field accuracy and matching precision on this set before the final demo. The goal is to minimize dangerous false matches, not simply maximize the number of matches.

### 11.4 Prompt and Tool Security

- Uploaded documents and supplier descriptions are untrusted data, not instructions to the AI system.
- Do not let document text override system prompts, reveal secrets, or trigger payment actions.
- The model must not receive PayPal secret credentials.
- Any tool/action request produced by AI must be checked against an allowlist and server-side authorization before execution.
- AI output shall not be allowed to change payment recipients, approved amounts, or account permissions.

## 12. Testing and Acceptance Criteria

### 12.1 Test Levels

- **Unit tests:** quantity sums, unit conversions, tier selection, shipping allocation, state transitions, schema validation, and payment idempotency.
- **Integration tests:** MongoDB models, AI adapter with mocked responses, supplier search, payment adapter in sandbox/mocked mode, and webhook verification.
- **End-to-end tests:** shop registration, requirement submission, pool joining, approval, sandbox checkout, and order-status display.
- **Security tests:** access control, resource ownership, input validation, upload restrictions, secret handling, and common web vulnerabilities.
- **AI evaluation tests:** extraction accuracy, false-match handling, uncertainty display, and resistance to prompt-injection content in documents.

### 12.2 MVP Acceptance Criteria

The MVP is acceptable when all of the following are demonstrated:

1. A shop owner can register, sign in, and create a shop profile.
2. At least three seeded shop accounts can submit different descriptions of a purchasing need.
3. AI converts text and at least one supported document/image input into reviewable structured requirements, or manual entry remains available if extraction fails.
4. A user can correct and confirm extracted requirements.
5. The supplier catalogue returns known sample offers with clear demo/live provenance.
6. The system identifies compatible product requests and flags uncertain or incompatible requests instead of blindly merging them.
7. The backend calculates combined quantity and price tiers correctly for a defined test dataset.
8. The UI shows a group-buy pool progressing toward a configured MOQ.
9. Each shop can review and approve an itemized final cost snapshot.
10. A PayPal Sandbox checkout flow can be completed, or an equally clear integration test using the official sandbox credentials is shown, and the application only records payment success after backend verification.
11. The system can show how a failed, cancelled, pending, or unknown payment differs from a successful capture.
12. Supplier settlement is either genuinely integrated and verified for the chosen PayPal setup or visibly labeled as simulated/manual in the demo.
13. The order activity log explains key changes from requirement submission through payment and supplier-order status.
14. The public repository includes setup instructions, environment-variable documentation, seeded demo data instructions, test instructions, and a license file.
15. A reviewer can run the application using the documented instructions or access a working hosted demo.

### 12.3 Example Business Calculation Test

Given one compatible offer with:

- 1 box as the quantity unit;
- base price ₹100 per box;
- price ₹90 per box for 30–49 boxes;
- price ₹80 per box for 50 or more boxes;
- confirmed contributions of 20, 15, and 25 boxes;
- shipping excluded for this test;

Expected results:

- Total eligible quantity = 60 boxes.
- Applicable tier = ₹80 per box.
- Merchandise total = ₹4,800.
- Per-shop merchandise shares = ₹1,600, ₹1,200, and ₹2,000 respectively.
- Sum of shares = ₹4,800.

This test verifies ordinary backend calculations, not AI capability.

## 13. Deployment and Configuration

### 13.1 Environments

The project should separate at least:

- **Local development:** local frontend/backend, development database or isolated database, mocked external services where convenient.
- **Demo/staging:** hosted frontend/backend, seeded demo catalogue, AI integration, PayPal Sandbox.
- **Production (future):** separate credentials and infrastructure, approved payment model, stronger monitoring, data retention/deletion controls, and any required legal/compliance review.

Never reuse development or Sandbox secrets as production credentials.

### 13.2 Proposed Environment Variables

Names are examples and should be adapted to the chosen providers. Values must never be committed to source control.

```dotenv
NODE_ENV=development
PORT=5000
CLIENT_ORIGIN=http://localhost:5173
MONGODB_URI=replace_with_database_connection_string
JWT_SECRET=replace_with_long_random_secret
AI_PROVIDER=replace_with_selected_provider
AI_API_KEY=replace_with_ai_provider_key
PAYPAL_CLIENT_ID=replace_with_sandbox_client_id
PAYPAL_CLIENT_SECRET=replace_with_sandbox_secret
PAYPAL_BASE_URL=provider_sandbox_base_url
UPLOAD_STORAGE_MODE=local_or_object_storage
MAX_UPLOAD_SIZE_MB=10
```

Validate required environment variables at server startup. Do not expose secret variables to the frontend build. Only public values explicitly designed for browser use, such as a PayPal client ID, may be delivered to the frontend as required by the provider SDK.

### 13.3 Deployment Checklist

- Build and test frontend and backend separately.
- Configure CORS for the exact frontend origin.
- Enable HTTPS in the hosted environment.
- Provision the database and create necessary indexes.
- Load clearly labeled seed supplier/product data for the demo.
- Configure AI and PayPal Sandbox credentials as host secrets.
- Configure return/cancel URLs for PayPal checkout.
- Configure and verify webhook endpoints if webhooks are used.
- Test a complete successful payment and a cancelled/failed payment.
- Test how the application responds when the AI API or payment provider is unavailable.
- Confirm that the demo never displays seeded suppliers or simulated settlement as live/verified.

## 14. Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Incorrect AI product match | A shop may agree to the wrong product | Hard attribute filters, visible mismatches, owner approval, conservative matching threshold |
| Inaccurate or stale supplier pricing | Misleading savings or failed order | Store quote timestamp/expiry, provenance, and freshness status; request updated quotes when needed |
| Missing supplier data | The product cannot find a viable source | Seed a curated demo catalogue; support admin quote entry; label demo data clearly |
| PayPal product/account does not support planned settlement flow | Supplier cannot be paid automatically | Validate provider capabilities early; separate buyer payments from supplier settlement; simulate settlement for demo if needed |
| Partial buyer payment | Group purchase may not be fully funded | Explicit pool/payment deadlines, visible contribution statuses, reconciliation, and defined cancellation policy |
| Duplicate or delayed webhook | Incorrect payment/order state | Signature verification, idempotency, provider-ID uniqueness, reconciliation process |
| AI-provider outage or rate limits | Extraction/matching unavailable | Manual-entry fallback, timeouts, retry limits, cached catalogue candidates |
| Sensitive invoice exposure | Business or personal information leak | Access controls, private storage, minimal logs, retention/deletion rules |
| Scope creep | MVP does not reach an end-to-end demo | Implement the core workflow first; defer multi-agent negotiation, forecasting, live scraping, and advanced payout flows |
| Unclear product substitution consent | Disputes or unsuitable orders | Require explicit per-shop approval for material substitutions |

## 15. Suggested Repository Structure

An example structure suitable for a JavaScript implementation:

```text
cobuy-ai/
├── client/                         # React + Vite frontend
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── features/
│   │   │   ├── requirements/
│   │   │   ├── suppliers/
│   │   │   ├── groupBuys/
│   │   │   └── payments/
│   │   ├── api/
│   │   └── main.jsx
│   └── package.json
├── server/                         # Node.js + Express backend
│   ├── src/
│   │   ├── config/
│   │   ├── middleware/
│   │   ├── models/
│   │   ├── routes/
│   │   ├── controllers/
│   │   ├── services/
│   │   │   ├── ai/
│   │   │   ├── supplierSearch/
│   │   │   ├── pricing/
│   │   │   ├── groupBuy/
│   │   │   └── payments/
│   │   ├── validators/
│   │   ├── jobs/
│   │   ├── utils/
│   │   └── app.js
│   ├── tests/
│   └── package.json
├── docs/
│   └── system-requirements-specification.md
├── .env.example
├── .gitignore
├── LICENSE
└── README.md
```

The actual structure may differ, but AI, pricing, supplier search, and payment operations should remain separate services to support testing and provider changes.

## 16. Suggested Implementation Phases

### Phase 1 — Foundation

- Create the repository and React/Vite + Express applications.
- Configure MongoDB Atlas and Mongoose.
- Implement registration, login, role checks, shop profiles, error handling, and environment validation.

### Phase 2 — Supplier Catalogue and Requirements

- Implement supplier, product, offer, and requirement models.
- Seed realistic but clearly labeled demo data.
- Build manual requirement entry, product search, supplier detail, and offer comparison.

### Phase 3 — AI Integration

- Implement server-side extraction with structured response validation.
- Add document/image intake for the chosen supported formats.
- Implement product normalization and candidate-match explanations.
- Create an evaluation dataset containing both valid and invalid product matches.

### Phase 4 — Group-Buy Logic

- Implement pool lifecycle, contributions, MOQ progress, price tiers, shipping allocation, approval snapshots, deadlines, and cancellation states.
- Write unit tests for calculations and state transitions.

### Phase 5 — PayPal Sandbox

- Create sandbox buyer and merchant accounts as required.
- Implement backend order creation and capture according to the selected supported flow.
- Validate provider responses; add webhook handling and idempotency if used.
- Record supplier settlement as simulated/manual unless actual integration is enabled.

### Phase 6 — Dashboard, Testing, and Demo

- Build AG Grid views for supplier comparisons, order progress, contribution/payment statuses, and audit events.
- Test success and failure paths.
- Deploy the frontend/backend and create a reliable seeded demo scenario.
- Document setup and record a short end-to-end demo showing AI extraction, compatible matching, MOQ progress, approval, and Sandbox payment status.

## 17. Hackathon Demonstration Scenario

A suggested three-minute demo:

1. Sign in as Shop A and upload an invoice or enter a natural-language requirement.
2. Show AI extraction and the owner confirming or correcting the result.
3. Repeat with Shop B and Shop C using different descriptions for a compatible product.
4. Show the platform identifying compatible requests and aggregating quantities.
5. Show the supplier catalogue and compare at least two offers using actual seeded attributes, MOQs, and tier prices.
6. Show the combined order reaching its configured MOQ and display each shop's itemized share.
7. Approve a contribution and complete a PayPal Sandbox checkout.
8. Show verified sandbox payment status and a separate supplier-settlement state, labeled simulated if no supplier settlement API is integrated.
9. Finish by showing the order activity/audit trail.

The demonstration should make the role of each system component clear: AI interprets and suggests; the backend validates and calculates; supplier records provide candidate offers; users approve consequential decisions; PayPal Sandbox demonstrates the supported payment path.

## 18. Open Decisions Before Production

The following decisions must be resolved before the system is treated as a live commercial marketplace:

1. **Payment recipient model:** Does each buyer pay the supplier directly, does the platform receive buyer payments, or will an approved marketplace product handle the flow?
2. **Supplier payout support:** Is the platform eligible and approved to use the required PayPal product for vendor settlement or payouts?
3. **Supplier verification:** What due diligence is needed before suppliers and quotes are marked verified?
4. **Cancellation and refunds:** What policy applies when MOQ is reached but one buyer does not pay, a supplier cancels, or goods are not delivered?
5. **Shipping and taxes:** Who is responsible for shipping, tax calculation, invoices, and local obligations?
6. **Commercial and regulatory obligations:** What marketplace, payment, consumer/business, privacy, and tax requirements apply in each target jurisdiction?
7. **AI data policy:** Which invoice data may be sent to the selected model provider, and what retention settings apply?
8. **Supplier data source:** Will discovery use a curated catalogue, supplier portal, authorized APIs, or a combination?
9. **Currency and localization:** Which currencies, units, and regions will be supported after the MVP?
10. **Operational support:** Who handles buyer disputes, supplier disputes, incorrect product matches, refunds, and payment reconciliation?

These are open decisions, not assumed capabilities. The hackathon prototype may use documented demo choices, but production behavior must be based on verified provider capabilities and applicable requirements.

---

## Appendix A — Minimum Definition of Done

The first release is done when a reviewer can run the documented application, register or use demo shops, submit and confirm requirements, see AI-derived product matching with uncertainty handling, find seeded supplier offers, join a group buy, see a correct MOQ and pricing calculation, approve an amount, complete a PayPal Sandbox payment, and inspect the recorded status history. Any simulated supplier settlement must be visibly labeled.

## Appendix B — Requirements Priority Summary

| Area | MVP priority | Notes |
|---|---|---|
| Authentication and role checks | Must | Required for private business data |
| Requirement entry and user review | Must | Manual fallback required |
| AI extraction and product normalization | Must | Use one provider initially |
| Supplier catalogue/search | Must | Seeded data sufficient for the hackathon |
| Product compatibility and confirmation | Must | Avoid unreviewed substitutions |
| Group-buy and MOQ calculations | Must | Backend-authoritative logic |
| Supplier quote comparison | Must | Ground all values in stored offers |
| Cost allocation and approval | Must | Itemized and reproducible |
| PayPal Sandbox checkout | Must | Server-side verification and clear statuses |
| Automated real supplier payout | Not required | Depends on provider product and account eligibility |
| Supplier self-service portal | Later | Admin-managed suppliers are sufficient for MVP |
| Predictive restocking/outreach | Later | Not needed to prove the core value |
| Autonomous negotiation agents | Later | Not needed for the first functional product |
| Vector database/advanced retrieval | Optional later | Start with catalogue filters and structured attributes |
| Email notifications | Should | In-app notifications are sufficient initially |
| Advanced analytics | Later | Basic dashboard and audit log first |

**End of document.**
