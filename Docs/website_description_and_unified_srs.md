# System Requirements Specification (SRS)

## Aap Ki Dukan (CoBuy AI) — AI-Assisted Group Procurement Platform for Small Businesses

**Document version:** 2.0 (Unified Master Specification — Union of Personas 1, 2, 3 & 4)  
**Status:** Authoritative Specification for Full-Stack Implementation & Hackathon MVP  
**Prepared on:** 28 October 2026  
**Target implementation:** JavaScript / MERN Stack (React + Vite, Tailwind CSS + shadcn/ui, Node.js + Express.js, MongoDB + Mongoose)  
**Testing stack:** Vitest, React Testing Library, Supertest, and Playwright (with injectable test clock)  
**Payment environment:** PayPal Sandbox for the prototype (with configurable local/mock adapter for offline tests)

---

## Document Control

| Field | Description |
|---|---|
| Product name | **Aap Ki Dukan — CoBuy AI** |
| Product type | Web-based B2B AI-assisted group procurement and bulk-order coordination SaaS platform |
| Primary users | Independent retail shops, kirana stores, cafés, bakeries, restaurants (**Retailers / Shop Owners**), participating **Wholesalers / Suppliers**, **Platform Administrators**, and **Read-Only Reviewers** |
| Main value proposition | Help small businesses extract purchasing needs via AI, combine compatible demand to meet Wholesaler Minimum Order Quantities ($MOQ_W$) while enforcing fair Retailer Minimum Order Quantities ($MOQ_R$) and step multiples, unlock bulk price tiers within a 72-hour window, transparently allocate costs, and coordinate approvals, payments, refunds, and order fulfilment |
| Specification purpose | Define the complete union of scope, functional and non-functional requirements, mathematical rules, 72-hour/24-hour workflows, UI/UX design system, API contracts, database schemas, implementation phases, and acceptance criteria |

> **Important implementation note:** This SRS distinguishes the prototype from a production financial escrow marketplace while prohibiting any fake or decorative UI functionality. PayPal Sandbox demonstrates real server-verified checkout, delta payment adjustments, and refund state tracking. However, collecting funds from multiple buyers and automatically settling a third-party wholesaler in production requires specific PayPal marketplace capabilities, compliance onboarding, and account approvals. Therefore, **buyer payment capture** and **supplier settlement** are tracked as separate business entities. Unless a live supplier-payout integration is explicitly enabled and verified, supplier settlement must be recorded and visibly labeled as `SIMULATED` or `MANUAL`. Similarly, seeded catalogue records must be clearly badged as `DEMO SAMPLE DATA` and never misrepresented as verified live supplier quotes.

---

## 1. Introduction

### 1.1 Purpose

**Aap Ki Dukan (CoBuy AI)** is a production-grade, responsive B2B web platform through which independent businesses submit purchasing requirements, identify compatible demand from other businesses, combine quantities into group-buy pools, compare wholesaler offers, and coordinate bulk purchases.

Hosted AI services assist with:
1. Extracting and normalizing structured product requirements from natural-language text, invoices, images, or PDFs.
2. Suggesting compatible catalogue products and explaining attribute matches or mismatches.
3. Summarizing trade-offs across verified supplier quotes.
4. Providing data-grounded advisory recommendations when a group-buy pool expires below the wholesaler's MOQ after 72 hours.

**Deterministic backend logic remains the single source of truth** for Wholesaler MOQ ($MOQ_W$), Retailer Minimum MOQ ($MOQ_R$), step-multiple quantity rules, price-tier selection, shipping allocation, versioned pricing snapshots, 72-hour pool timers, 24-hour under-MOQ buyer decision windows, PayPal Sandbox payment verification, refunds, role permissions, and order-state transitions.

### 1.2 Product Scope

The platform supports the following end-to-end connected workflow:

1. **Public Discovery & Onboarding:** A visitor explores the public landing page explaining the group procurement workflow, MOQ mechanics, and transparent cost allocation, then registers an account and creates a business profile (`Shop` for retailers or `Supplier` for wholesalers).
2. **Requirement Intake:** A shop owner enters a purchasing requirement via a structured form, natural-language text, CSV import, or supported invoice/image/PDF upload (up to $10\text{ MB}$).
3. **AI Extraction & Normalization:** The backend AI adapter extracts structured product attributes (name, category, quantity, unit, pack size, material/specifications, brand constraints, required-by date, delivery location) and flags missing or uncertain fields.
4. **Human-in-the-Loop Review:** The shop owner inspects, edits, and explicitly confirms the extracted requirement (or uses manual entry fallback if the AI provider is unavailable).
5. **Supplier Discovery & Matching:** The backend searches the MongoDB supplier catalogue for compatible offers, filtering out hard-constraint failures and displaying side-by-side comparisons with data provenance badges (`SEEDED_DEMO`, `SUPPLIER_SUBMITTED`, `VERIFIED_LIVE`).
6. **Wholesaler & Retailer MOQ Validation:** For any selected offer with a Wholesaler MOQ ($MOQ_W$, e.g., $1000\text{ units}$), the backend enforces a configurable Retailer Minimum MOQ percentage ($p_{\min}$, default $20\% \rightarrow 200\text{ units}$) and a Retailer Step Increment percentage ($p_{\text{step}}$, default $1\% \rightarrow \text{multiples of } 10\text{ units}$).
7. **Group-Buy Pool & 72-Hour Timer:** Eligible shops create or join a compatible group-buy pool. Publishing a pool starts an authoritative server-side **72-hour countdown timer**.
8. **Pay-at-Join & Customization Window:** Buyers complete PayPal Sandbox checkout when joining (or per configured pool policy) so only verified contributions count toward $MOQ_W$. While the pool is open (before reaching $MOQ_W$ and before the 72-hour deadline), buyers may customize permitted quantities or withdraw, triggering automatic recalculation and delta payments or refunds.
9. **Early MOQ Lock vs. 72-Hour Expiry Below MOQ:**
   * **Early Lock:** If aggregate eligible quantity $Q_{\text{pool}}$ reaches $MOQ_W$ before 72 hours, the pool locks immediately, freezes an authoritative versioned `PriceSnapshot`, and notifies participants.
   * **Under-MOQ 24-Hour Decision Window:** If 72 hours expire with $Q_{\text{pool}} < MOQ_W$, the pool locks and opens a **24-hour buyer decision window**. Participants view the shortfall, current/revised pricing, supplier feasibility, and an AI recommendation, and must explicitly choose **Proceed with the proposed order** or **Cancel my participation** (silence is never treated as consent).
10. **Cost Approval & Financial Reconciliation:** Each participating shop explicitly approves its itemized final `PriceSnapshot`. Unlocking a lower bulk tier triggers an automatic partial refund of the savings delta; an approved under-MOQ revised quote or post-approval checkout triggers a verified balance payment.
11. **Order Confirmation & Fulfilment:** Once all supplier, approval, and payment conditions are satisfied, the backend creates the final `Order`, tracks member-level allocations, separates buyer payments from `SupplierSettlement` (`SIMULATED`, `MANUAL`, or `CONFIRMED`), and maintains a chronological activity and audit history.

### 1.3 Goals

* Reduce manual effort required to turn messy invoices or natural-language requests into structured purchasing requirements.
* Help independent retailers combine demand to meet high wholesaler MOQs while enforcing practical retailer minimum quantities and step multiples.
* Make group-buy quantities, MOQ progress, bulk price tiers, shipping allocations, and per-shop savings completely transparent and reproducible.
* Enforce a deterministic 72-hour MOQ countdown and a safe 24-hour under-MOQ buyer decision workflow with automated refund tracking.
* Provide supplier comparisons grounded in verified or clearly labeled sample quote data rather than unsupported AI claims.
* Deliver a cohesive, trustworthy B2B SaaS interface (deep navy, warm off-white, emerald/teal accents) with zero fake buttons or disconnected screens.
* Validate every phase with automated unit, integration, and end-to-end tests, including the mandatory $₹4,800$ pricing test and the Wholesaler/Retailer MOQ step-multiple test.

### 1.4 Non-Goals for the MVP

The MVP does not need to:

* Train a custom foundation LLM or custom computer-vision OCR model from scratch.
* Guarantee that AI-generated product matches are accurate without human review.
* Automatically negotiate binding legal contracts with suppliers without human approval.
* Crawl or scrape arbitrary third-party supplier websites without permission.
* Execute real-money bank transfers during the hackathon demonstration.
* Hold, pool, escrow, split, or disburse real funds unless the selected payment configuration expressly supports the flow and has compliance approval.
* Automatically issue live supplier payouts unless eligible PayPal payout capabilities are enabled and verified.
* Provide fleet management, warehouse management, tax filing, or lending/credit services.

### 1.5 Intended Audience

This SRS is intended for the software architecture and engineering team, frontend/backend developers, AI integration engineers, database designers, QA/test engineers, UI/UX designers, and hackathon evaluators.

### 1.6 Definitions and Abbreviations

| Term | Meaning |
|---|---|
| **AI Extraction** | Converting natural-language text, an uploaded invoice image, or a PDF document into structured purchasing fields |
| **Product Normalization** | Converting varied product descriptions into canonical attributes (category, capacity/size, material, pack size, unit) |
| **Candidate Match** | A suggested product equivalence between a requirement and catalogue offer that requires rule validation and user review |
| **Wholesaler MOQ ($MOQ_W$)** | The minimum total order quantity required by a wholesaler/supplier for a group-buy pool (e.g., $1000\text{ units}$) |
| **Retailer MOQ ($MOQ_R$)** | The minimum quantity a single retailer must order to join a pool, defined as a configurable percentage $p_{\min}$ of $MOQ_W$ (default $20\%$, e.g., $200\text{ units}$ when $MOQ_W = 1000$) |
| **Step Multiple ($\text{Step}$)** | The required increment multiple for a retailer's order quantity, defined as a configurable percentage $p_{\text{step}}$ of $MOQ_W$ (default $1\%$, e.g., multiples of $10\text{ units}$ when $MOQ_W = 1000$) |
| **Group-Buy Pool** | A shared purchasing group that aggregates compatible confirmed requirements from multiple retailers toward $MOQ_W$ |
| **72-Hour MOQ Timer** | The authoritative server-side 3-day window after pool publication during which retailers can join, edit quantities, or withdraw |
| **24-Hour Decision Window** | The configurable post-expiry window (default $24\text{ hours}$) when a pool expires below $MOQ_W$, requiring explicit buyer consent (`PROCEED` or `CANCEL`) |
| **Price Snapshot** | An immutable, versioned backend record freezing the selected tier price, shipping allocation, and per-shop payable breakdown for explicit approval |
| **Contribution** | One shop's intended, paid, and approved share of a group-buy pool |
| **Delta Payment / Refund** | A secondary payment capture or partial refund triggered when a quantity edit, tier unlock, or revised quote changes a buyer's payable share |
| **Supplier Settlement** | The financial payout status between the platform and the wholesaler, tracked strictly separately from buyer payment captures |
| **Human-in-the-Loop** | A workflow requiring explicit user confirmation before AI outputs, material substitutions, or price changes take effect |
| **RBAC** | Role-Based Access Control (`SHOP_OWNER`, `SUPPLIER`, `ADMIN`, `REVIEWER`) |

---

## 2. Overall Description

### 2.1 Product Perspective

**Aap Ki Dukan (CoBuy AI)** is a modular full-stack JavaScript web application comprising:
* A **React + Vite frontend** styled with **Tailwind CSS**, **shadcn/ui** components, and **Lucide React** icons.
* A **Node.js + Express.js backend** exposing RESTful APIs with strict separation of routes, controllers, validators, domain services, provider adapters, and scheduled jobs.
* A **MongoDB + Mongoose persistence layer** using multi-document ACID transactions and optimistic concurrency control.
* A **server-side AI adapter** connecting to a hosted LLM/Vision API with strict JSON schema validation.
* A **server-side PayPal Sandbox adapter** handling Orders v2 creation, capture verification, refunds, and webhook reconciliation.
* A **private file-storage adapter** for uploaded invoices and documents.

### 2.2 User Classes

#### 2.2.1 Shop Owner / Retailer (`SHOP_OWNER`)
Manages a retail business profile (`Shop`), submits purchasing requirements (form, text, CSV, or invoice upload), reviews and confirms AI-extracted data, compares supplier offers, creates or joins group-buy pools (satisfying $MOQ_R$ and $\text{Step}$ rules), completes PayPal Sandbox payments, customizes or withdraws contributions while pools are open, votes during 24-hour under-MOQ decision windows, approves final versioned `PriceSnapshot` breakdowns, tracks refunds and orders, and downloads Purchase Order summaries.

#### 2.2.2 Wholesaler / Supplier (`SUPPLIER`)
Represents a wholesale vendor with products, $MOQ_W$, retailer MOQ/step percentages ($p_{\min}, p_{\text{step}}$), quantity price tiers, delivery regions, lead times, and quote validity. In the MVP, supplier accounts and catalogue entries can be managed by administrators or accessed directly through the dedicated **Supplier Portal** to manage offers, respond to quote requests, confirm under-MOQ feasibility or submit revised quotes, and update order fulfilment statuses.

#### 2.2.3 Platform Administrator (`ADMIN`)
Manages users, shops, suppliers, product catalogue moderation, data provenance labels, pool and order monitoring, stalled/expired order resolution, payment and refund reconciliation, AI provider error logs, and demo data seeding. All administrative mutations are recorded in an immutable `AuditLog`.

#### 2.2.4 Demo Evaluator / Read-Only Reviewer (`REVIEWER`)
Inspects seeded demonstration scenarios, active and expired pools, AI extraction results, cost allocations, PayPal Sandbox transaction states, and audit logs without modifying business or financial records.

### 2.3 Operating Environment

* **Browsers:** Modern desktop, tablet, and mobile browsers (Chrome, Firefox, Safari, Edge).
* **Frontend:** React 18+, Vite, React Router v6, Tailwind CSS, shadcn/ui, Lucide React icons.
* **Backend:** Node.js LTS, Express.js, Mongoose ODM, `node-cron` scheduler with injectable `ClockService`.
* **Database:** MongoDB Atlas or local MongoDB Replica Set.
* **External Integrations:** Hosted AI API (server-side), PayPal JavaScript SDK + PayPal REST APIs in Sandbox mode.
* **Testing Environment:** Vitest, React Testing Library, Supertest, and Playwright.

### 2.4 Design and Implementation Constraints

* JavaScript (ES2022+) is used throughout both frontend and backend.
* Private API keys and secrets (`AI_API_KEY`, `PAYPAL_CLIENT_SECRET`, `JWT_SECRET`) must reside exclusively on the server and never be exposed to client code.
* All AI outputs, uploaded documents, OCR texts, and supplier descriptions are treated as untrusted input, validated against server-side schemas, and isolated from prompt-injection privilege escalation.
* Authoritative financial calculations must run on the backend using integer minor units (e.g., paise/cents)—never floating-point math in React components or LLM prompts.
* Product compatibility must verify material attributes, unit definitions, and pack sizes rather than relying solely on product names or embedding similarity.
* Deadlines (72-hour MOQ timer and 24-hour decision timer) must be enforced by backend validation and server-side scheduled jobs, never by the browser clock.
* No button, filter, or workflow may be decorative or return fabricated success states.

### 2.5 Assumptions and Dependencies

* The initial deployment includes a repeatable database seeder with realistic demo shops, compatible and incompatible requirements, tiered supplier offers, and active pools clearly marked as `SEEDED_DEMO`.
* Each group-buy pool operates in a single currency (e.g., `INR` or `USD`); cross-currency conversion is outside MVP scope.
* Default MOQ granularity parameters are $p_{\min} = 20\%$ (Retailer MOQ) and $p_{\text{step}} = 1\%$ (Step Multiple) of $MOQ_W$, with per-offer configuration and explicit integer overrides supported for smaller box-count offers.
* The default post-expiry decision window for under-MOQ pools is $24\text{ hours}$ after the initial $72\text{ hours}$.

---

## 3. System Features and Functional Requirements

Requirement identifiers are normative. **MUST** indicates a mandatory requirement; **SHOULD** indicates a high-value requirement included in the design; **MAY** indicates an optional extension.

### 3.1 Accounts, Authentication, and Business Profiles

* **FR-AUTH-001 (MUST):** The system shall allow a user to register with a name, normalized email, password, role (`SHOP_OWNER` or `SUPPLIER`), and business name.
* **FR-AUTH-002 (MUST):** The system shall authenticate registered users before permitting access to protected pages or private API endpoints.
* **FR-AUTH-003 (MUST):** The system shall hash passwords using `bcrypt` or `argon2` and shall never store or log plaintext passwords.
* **FR-AUTH-004 (MUST):** The system shall support logout and invalidation of the active session or token.
* **FR-AUTH-005 (MUST):** The system shall enforce role-based access control (`SHOP_OWNER`, `SUPPLIER`, `ADMIN`, `REVIEWER`) on both frontend routes and backend middleware.
* **FR-AUTH-006 (MUST):** A shop owner or supplier shall be able to create, view, and edit permitted fields of their business profile (`Shop` or `Supplier`), including business type, delivery address/service area, and contact details.
* **FR-AUTH-007 (SHOULD):** The system should support password-reset flows through a verified channel before production release.
* **FR-AUTH-008 (MUST):** Resource ownership checks shall prevent any shop from reading or modifying another shop's private requirements, uploaded invoices, contributions, payments, or refunds.

### 3.2 Purchasing Requirements Intake and Document Uploads

* **FR-REQ-001 (MUST):** A shop owner shall be able to create a purchasing requirement via a structured form or natural-language text (e.g., *"We need 25 boxes of 12-ounce food-safe paper cups for our café in Lucknow within two weeks"*).
* **FR-REQ-002 (MUST):** A requirement shall record product name, category, original description, requested quantity, unit, pack size, material/specifications, brand constraints, required-by date, delivery location/area, and purchasing constraints.
* **FR-REQ-003 (MUST):** The system shall support uploading supported invoice, image, or document files (`PDF`, `PNG`, `JPG`, `WEBP`) up to a configurable limit defaulting to $10\text{ MB}$.
* **FR-REQ-004 (MUST):** The UI shall display the selected filename, upload progress/processing status, validation errors, and recoverable failure options.
* **FR-REQ-005 (MUST):** The user shall be able to review, edit, confirm, or reject AI-extracted fields before the requirement becomes `CONFIRMED`.
* **FR-REQ-006 (MUST):** The system shall persist the original input, private file reference, AI-extracted fields, user-confirmed fields, confidence/uncertainty flags, status, and timestamps.
* **FR-REQ-007 (MUST):** A shop owner shall be able to save a requirement as a `DRAFT` prior to confirmation.
* **FR-REQ-008 (SHOULD):** The system should support CSV import for repeat purchasing requirements.
* **FR-REQ-009 (MUST):** The backend shall reject unsupported MIME types, oversized files, and malformed uploads.
* **FR-REQ-010 (MUST):** Uploaded documents shall be stored privately with generated safe filenames, never exposed via unauthenticated public URLs, and never executed as macros or code.

### 3.3 AI Extraction, Normalization, Matching, and Under-MOQ Advisory

* **FR-AI-001 (MUST):** All AI calls shall execute through a server-side adapter (`extractRequirement`, `normalizeProduct`, `matchProducts`, `summarizeQuotes`, `recommendUnderMOQAction`).
* **FR-AI-002 (MUST):** AI extraction shall return structured fields (category, name, quantity, unit, pack size, material/specs, brand constraints, deadline, delivery area) plus explicit `uncertainFields` and confidence indicators.
* **FR-AI-003 (MUST):** Every AI response shall be validated against a strict server-side schema (Zod/Joi) before persistence or use.
* **FR-AI-004 (MUST):** The UI shall visually distinguish unverified AI-extracted values from user-confirmed values.
* **FR-AI-005 (MUST):** The AI shall never invent missing quantities, certifications, prices, MOQs, supplier willingness, or delivery dates; unknown attributes must remain `null` and flagged for human review.
* **FR-AI-006 (MUST):** When AI extraction fails or times out, the system shall log the error in `AIExecutionLog` and provide an immediate manual-entry fallback.
* **FR-AI-007 (MUST):** Product matching shall combine hard compatibility filters (unit, pack size, category, delivery coverage) with attribute comparison (capacity, material, food-grade/certifications, brand constraints).
* **FR-AI-008 (MUST):** The UI shall explain suggested matches and explicitly highlight detected mismatches or required substitutions.
* **FR-AI-009 (MUST):** When a group-buy pool expires at 72 hours below $MOQ_W$, the AI advisory service shall generate a structured recommendation for buyers grounded strictly in verified backend data (achieved quantity, shortfall, current tier price, valid alternative supplier offers, individual cost/shipping share, quote freshness, and open uncertainties).
* **FR-AI-010 (MUST):** AI models shall never create orders, calculate authoritative totals, approve snapshots, or authorize/capture payments.
* **FR-AI-011 (MUST):** Every AI invocation shall be logged in `AIExecutionLog` with provider, model, operation type, latency, token metadata, and validation status (without logging secrets or raw sensitive PII).

### 3.4 Supplier Catalogue, Discovery, and Offer Comparison

* **FR-SUP-001 (MUST):** The system shall persist `Supplier`, `Product`, and `SupplierOffer` records in MongoDB.
* **FR-SUP-002 (MUST):** Each `SupplierOffer` shall record supplier, product, specifications, pack unit, pack size, currency, base unit price, quantity price tiers, Wholesaler MOQ ($MOQ_W$), Retailer MOQ percentage ($p_{\min}$), Retailer step percentage ($p_{\text{step}}$), delivery areas, lead time, shipping terms, tax inclusion/exclusion notes, availability, quote timestamp, and expiry date.
* **FR-SUP-003 (MUST):** The catalogue shall support search, filtering, sorting, supplier detail views, and side-by-side offer comparison.
* **FR-SUP-004 (MUST):** The backend shall filter out offers that fail hard constraints (unsupported delivery area, expired quote, or incompatible unit/specification).
* **FR-SUP-005 (MUST):** Every supplier and offer record shall carry a visible provenance badge: `SEEDED_DEMO`, `SUPPLIER_SUBMITTED`, `VERIFIED_LIVE`, or `EXTERNAL_API`.
* **FR-SUP-006 (MUST):** Seeded demo offers shall never be labeled as live verified supplier quotes.
* **FR-SUP-007 (MUST):** When no compatible offer exists, the UI shall display a clear empty state allowing manual quote request entry or draft pool creation.

### 3.5 Group-Buy Pools, Wholesaler MOQ, Retailer MOQ, and Step Multiples

* **FR-POOL-001 (MUST):** Eligible shop owners shall be able to discover open pools or create a new pool from a `CONFIRMED` requirement and compatible `SupplierOffer`.
* **FR-POOL-002 (MUST):** Every pool shall enforce the **Two-Level MOQ and Step-Multiple Rule**:
  1. **Wholesaler MOQ ($MOQ_W$):** The total pool target quantity required by the wholesaler (e.g., $MOQ_W = 1000\text{ units}$).
  2. **Retailer Minimum MOQ ($MOQ_R$):** Each participating retailer must order at least $p_{\min}\%$ of $MOQ_W$ (default $20\%$, or explicit override), calculated as:
     $$MOQ_R = \max\left(1, \left\lceil MOQ_W \times \frac{p_{\min}}{100} \right\rceil\right)$$
     *(For $MOQ_W = 1000$ and $p_{\min} = 20\%$, a retailer must buy at least $200\text{ units}$.)*
  3. **Retailer Step Increment ($\text{Step}$):** Each retailer's order quantity $Q_i$ must be an exact integer multiple of $p_{\text{step}}\%$ of $MOQ_W$ (default $1\%$, or explicit override), calculated as:
     $$\text{Step} = \max\left(1, \left\lfloor MOQ_W \times \frac{p_{\text{step}}}{100} \right\rfloor\right)$$
     *(For $MOQ_W = 1000$ and $p_{\text{step}} = 1\%$, $\text{Step} = 10$, so a retailer must buy $\ge 200\text{ units}$ in multiples of $10$, e.g., $200, 210, 220, \dots$)*
* **FR-POOL-003 (MUST):** The backend shall reject any join or quantity edit where $Q_i < MOQ_R$ or $(Q_i \bmod \text{Step}) \ne 0$.
* **FR-POOL-004 (MUST):** Only compatible units, pack sizes, and material specifications may be combined in a pool; any material substitution requires explicit approval from the affected shop.
* **FR-POOL-005 (MUST):** Prevent duplicate active contributions by the same shop in the same pool.
* **FR-POOL-006 (MUST):** The pool detail page shall display current participants (or anonymized summary for non-members), $Q_{\text{pool}}$, $MOQ_W$, $MOQ_R$, $\text{Step}$, MOQ shortfall, active price tier, next tier threshold, estimated savings, shipping allocation method, live countdown timer, and chronological activity history.

### 3.6 Mandatory Three-Day (72-Hour) MOQ Workflow & 24-Hour Under-MOQ Decision Engine

* **FR-TIMER-001 (MUST — Starting the Timer):** When a pool is published (`RECRUITING`), the backend shall set its authoritative deadline to exactly $72\text{ hours}$ after publication (`publishedAt + 72h`), display a live countdown on the frontend, and enforce expiration via backend validation and a scheduled background job.
* **FR-TIMER-002 (MUST — Pay-at-Join Verification):** When joining a pool under the default `PAY_AT_JOIN` policy, the buyer completes PayPal Sandbox checkout; only contributions with backend-verified `PAID` status count as eligible quantities toward $MOQ_W$.
* **FR-TIMER-003 (MUST — Customization & Withdrawal Window):** A participant may edit their quantity (respecting $MOQ_R$ and $\text{Step}$) or withdraw only until the **first** of these two events occurs:
  1. The pool's eligible paid quantity reaches the Wholesaler MOQ ($Q_{\text{pool}} \ge MOQ_W$).
  2. The pool's 72-hour deadline expires.
* **FR-TIMER-004 (MUST — Delta Recalculation on Change):** When a valid quantity edit or withdrawal occurs before lock, the backend shall immediately recalculate $Q_{\text{pool}}$, active price tier, merchandise shares, and shipping allocation. If a quantity increase raises the buyer's payable amount, require explicit buyer confirmation and PayPal payment of the delta before activating the increase. If a decrease or withdrawal lowers the amount, initiate a tracked `Refund`.
* **FR-TIMER-005 (MUST — Early Lock at MOQ):** The instant $Q_{\text{pool}} \ge MOQ_W$ prior to 72 hours, the backend shall atomically lock the pool (`MOQ_REACHED` $\rightarrow$ `AWAITING_APPROVALS`), record `lockedAt` and `lockReason = 'MOQ_REACHED_EARLY'`, close the customization/withdrawal window, freeze an authoritative `PriceSnapshot`, and notify all participants.
* **FR-TIMER-006 (MUST — Expiry at 72 Hours Below MOQ):** If the 72-hour timer expires with $Q_{\text{pool}} < MOQ_W$, the backend shall lock the pool (`UNDER_MOQ_DECISION_PENDING`), record `lockedAt` and `lockReason = 'EXPIRED_72H_UNDER_MOQ'`, set a configurable **24-hour decision deadline** (`decisionDeadline = lockedAt + 24h`), generate the AI under-MOQ recommendation, and notify all active participants.
* **FR-DEC-001 (MUST — Explicit Buyer Decision Page):** During the 24-hour decision window, each active buyer shall be presented with explicit **Proceed with the proposed order** (`PROCEED`) and **Cancel my participation** (`CANCEL`) actions alongside the current quantity, shortfall, supplier feasibility status, current/revised cost breakdown, and AI recommendation with uncertainties.
* **FR-DEC-002 (MUST — Silence Is Never Consent):** Non-responsive buyers who do not submit a decision before the 24-hour `decisionDeadline` shall be automatically marked `EXPIRED_NO_RESPONSE`, excluded from the remaining order, and issued a full refund.
* **FR-DEC-003 (MUST — Comprehensive Under-MOQ Edge-Case Handling):** The backend shall deterministically handle and test all 10 under-MOQ scenarios:
  1. All participating buyers agree to `PROCEED`.
  2. All buyers choose `CANCEL` (pool cancelled; full refunds issued).
  3. Mixed responses: some buyers `PROCEED` and others `CANCEL` (cancelling buyers refunded; remaining quantity recalculated).
  4. One or more buyers do not respond within 24 hours (treated as cancelled, refunded, remaining pool recalculated).
  5. The wholesaler/supplier does not accept an order below $MOQ_W$ (pool cancelled unless a valid alternative quote is accepted; full refunds issued).
  6. A valid revised supplier quotation becomes available for the lower quantity (new `PriceSnapshot` frozen; remaining buyers must explicitly approve revised commercial terms).
  7. Revised pricing or reverting to a higher unit-price tier requires extra payment (`UNDER_MOQ_SURCHARGE` delta payment created).
  8. Extra payment fails or times out (pool transitions to `NEEDS_REVIEW` or `CANCELLED`; previously captured payments refunded).
  9. Remaining proceeding participants no longer meet the minimum viable quantity or pricing requirement (pool cancelled; remaining participants refunded).
  10. Pool must be cancelled due to supplier rejection or unresolvable shortfall (all captured payments refunded and audit logged).

### 3.7 Deterministic Pricing, Savings, and Cost Allocation Engine

* **FR-PRICE-001 (MUST):** All authoritative pricing calculations shall execute on the backend using integer minor units (e.g., paise for `INR`, cents for `USD`).
* **FR-PRICE-002 (MUST):** Quantity-tier pricing shall apply only when the pool's verified eligible quantity $Q_{\text{pool}}$ meets or exceeds the tier threshold.
* **FR-PRICE-003 (MUST):** Shipping and shared fees shall be allocated using a disclosed deterministic rule (`PER_UNIT`, `PER_WEIGHT`, or `EQUAL_SHARE`), with any integer-division remainder reconciled to the last share so the sum of participant shares equals the exact authoritative group total.
* **FR-PRICE-004 (MUST):** Estimated costs shall be clearly distinguished from final payable amounts; unknown shipping, taxes, or duties shall be labeled `EXCLUDED`, `ESTIMATED`, or `PENDING` rather than silently treated as zero.
* **FR-PRICE-005 (MUST):** Claimed savings shall only be displayed against a defensible, verified baseline price with a visible source and timestamp.
* **FR-PRICE-006 (MUST — Mandatory $₹4,800$ Calculation Verification):** Given base price $₹100/\text{box}$, tier $30\text{–}49\text{ boxes} = ₹90/\text{box}$, tier $\ge 50\text{ boxes} = ₹80/\text{box}$, and confirmed contributions of $20$, $15$, and $25\text{ boxes}$ (shipping excluded), the engine must deterministically compute:
  * Total quantity $= 60\text{ boxes}$
  * Selected price tier $= ₹80/\text{box}$
  * Merchandise total $= ₹4,800$
  * Participant A ($20\text{ boxes}$) $= ₹1,600$; Participant B ($15\text{ boxes}$) $= ₹1,200$; Participant C ($25\text{ boxes}$) $= ₹2,000$
  * Sum of contribution shares $= ₹4,800$.

### 3.8 Supplier Quote Evaluation

* **FR-QUOTE-001 (MUST):** The system shall store custom or revised `Quote` records linking supplier, product/offer, pool (optional), quoted quantity, currency, unit price, tiers, shipping conditions, tax inclusion, lead time, validity timestamp, and provenance.
* **FR-QUOTE-002 (MUST):** Quotes shall be compared using a deterministic backend calculation of estimated landed cost; AI summaries must cite only backend-calculated numbers.
* **FR-QUOTE-003 (SHOULD):** Shop owners and administrators should be able to request updated quotes when an offer is stale or when a pool locks below $MOQ_W$.

### 3.9 Participant Approvals, Order Finalization, and Fulfilment

* **FR-ORDER-001 (MUST):** Before an order is finalized, the backend shall freeze a versioned `PriceSnapshot` showing supplier/offer, specifications, approved substitutions, quantity, unit price, shipping share, rounding adjustment, total payable amount, currency, and cancellation rules.
* **FR-ORDER-002 (MUST):** Each participating shop shall explicitly approve its final `PriceSnapshot`.
* **FR-ORDER-003 (MUST):** Any material change in price, shipping, or quantity after approval shall automatically invalidate prior approvals (`INVALIDATED_BY_CHANGE`), create a new snapshot version, and require fresh buyer approval.
* **FR-ORDER-004 (MUST):** When all approvals and payment conditions (`FUNDED`) are met, the backend shall generate the authoritative `Order` record containing both group-level totals and member-level allocations.
* **FR-ORDER-005 (MUST):** A supplier order is confirmed only via supplier portal action, admin verification, or an explicitly labeled `SIMULATED` demo confirmation—never from an AI output or browser redirect.
* **FR-ORDER-006 (SHOULD):** Participants and suppliers shall be able to download a structured Purchase Order (PO) summary document.

### 3.10 Payments, Adjustments, Refunds, and Supplier Settlement

* **FR-PAY-001 (MUST):** PayPal Sandbox orders shall be created on the server using backend-calculated amounts and currencies.
* **FR-PAY-002 (MUST):** Payment captures shall be verified server-side with PayPal REST APIs before marking any `Payment` as `PAID`.
* **FR-PAY-003 (MUST):** Payment processing and webhook handlers (`POST /api/payments/webhook`) shall be idempotent and protected by unique provider ID constraints (`providerOrderId`, `providerCaptureId`, `idempotencyKey`).
* **FR-PAY-004 (MUST):** All Sandbox checkouts shall display a prominent `TEST TRANSACTION — PAYPAL SANDBOX` indicator; if offline mock mode is used for automated testing, it must be labeled `SIMULATED DEV PAYMENT`.
* **FR-PAY-005 (MUST — Separate Refund Tracking):** The system shall track `Refund` records separately from payments across states `REQUESTED`, `PROCESSING`, `COMPLETED`, and `FAILED` for early withdrawals, quantity reductions, bulk-tier price drops (refunding the savings delta when a lower price tier is unlocked after pay-at-join), pool cancellations, non-responsive under-MOQ buyers, and supplier rejections.
* **FR-PAY-006 (MUST — Distinct Supplier Settlement):** `SupplierSettlement` shall be stored and displayed separately from buyer payments with explicit states (`NOT_STARTED`, `SIMULATED`, `PENDING`, `CONFIRMED`, `FAILED`, `NEEDS_REVIEW`) and modes (`DEMO`, `MANUAL`, `INTEGRATED`).

### 3.11 Notifications, Activity Timeline, and Dashboards

* **FR-NOTIF-001 (MUST):** The backend shall generate persistent in-app notifications (with timestamps, `isRead` status, and target links) for: pool created/joined, payment success/failure, quantity/option changes, MOQ progress milestones, early MOQ lock, 72-hour expiry below MOQ, proceed/cancel decision required, 24-hour decision deadline approaching/expired, supplier quote revision, revised cost approval required, refund initiated/completed/failed, supplier confirmation/rejection, and order delivery updates.
* **FR-NOTIF-002 (MUST):** Notification dispatch failures shall never roll back or alter payment, refund, pool, or order states.
* **FR-NOTIF-003 (MUST):** Every pool and order detail page shall display a chronological activity history recording actor, action, timestamp, and safe metadata.

### 3.12 Supplier Portal, Administrative Workspace, and Audit Trail

* **FR-ADMIN-001 (MUST):** The Supplier Portal and Admin Workspace shall allow authorized users to manage supplier profiles, products, offers, MOQ/step parameters, quote freshness, and order confirmations.
* **FR-ADMIN-002 (MUST):** Administrators shall have a reconciliation dashboard surfacing stalled pools, expired quotes, unknown/failed payments, failed refunds, and AI provider errors.
* **FR-ADMIN-003 (MUST):** Every administrative action and state transition shall write an immutable `AuditLog` entry.
* **FR-ADMIN-004 (MUST):** Administrators shall never overwrite or erase captured payment facts; any financial adjustment must be recorded as a distinct reconciliation or refund event.

---

## 4. Business Rules

* **BR-001:** Only `CONFIRMED` requirements may be used to create or join a group-buy pool.
* **BR-002:** Product similarity scores do not establish compatibility; unit, pack size, and material specifications must match or have explicit participant substitution consent.
* **BR-003 (Wholesaler MOQ Rule):** Each offer defines an authoritative Wholesaler MOQ ($MOQ_W$) in canonical pack units.
* **BR-004 (Retailer MOQ Percentage Rule):** Each retailer joining a pool must order at least $MOQ_R = \max(1, \lceil MOQ_W \times (p_{\min}/100) \rceil)$, where $p_{\min}$ defaults to $20\%$ (e.g., $200\text{ units}$ when $MOQ_W = 1000$).
* **BR-005 (Retailer Step Multiple Rule):** Each retailer's order quantity $Q_i$ must be a multiple of $\text{Step} = \max(1, \lfloor MOQ_W \times (p_{\text{step}}/100) \rfloor)$, where $p_{\text{step}}$ defaults to $1\%$ (e.g., multiples of $10\text{ units}$ when $MOQ_W = 1000$).
* **BR-006:** Only contributions with backend-verified `PAID` status (under `PAY_AT_JOIN`) or verified approval status count toward $Q_{\text{pool}}$.
* **BR-007:** Every published pool has an authoritative 72-hour deadline enforced on the backend.
* **BR-008:** Quantity edits and withdrawals are permitted only while the pool is in `RECRUITING` ($Q_{\text{pool}} < MOQ_W$ and current server time $< \text{deadline}$).
* **BR-009:** Reaching $Q_{\text{pool}} \ge MOQ_W$ before 72 hours immediately locks the pool and stops ordinary edits or withdrawals.
* **BR-010:** Expiring at 72 hours with $Q_{\text{pool}} < MOQ_W$ locks the pool and starts a 24-hour buyer decision window (`PROCEED` vs. `CANCEL`).
* **BR-011:** Silence during the 24-hour decision window is never treated as consent; non-responsive buyers are automatically cancelled and refunded.
* **BR-012:** A buyer choosing `PROCEED` below $MOQ_W$ does not force a wholesaler to accept a sub-MOQ order; supplier feasibility confirmation or a valid revised quote is required.
* **BR-013:** All monetary values and shares are calculated in integer minor units on the backend; the sum of participant shares must reconcile exactly with the authoritative order total.
* **BR-014:** Any material price, tier, or shipping increase after snapshot approval invalidates prior approvals and requires explicit re-approval and delta payment verification; never charge a buyer silently.
* **BR-015:** Buyer payment capture, buyer refunds, and supplier settlement are separate lifecycles and must never be conflated.
* **BR-016:** Seeded demo catalogue data, test sandbox payments, and simulated supplier settlements must always carry explicit disclosure badges.

---

## 5. Use Cases

### UC-01: Register a Retailer Shop or Wholesaler Account
* **Primary actor:** Shop Owner / Wholesaler
* **Main flow:** User submits registration details $\rightarrow$ Backend validates input, normalizes email, checks uniqueness, hashes password $\rightarrow$ Creates `User` and `Shop` (or `Supplier`) $\rightarrow$ Returns session token and redirects to role dashboard.
* **Exception flow:** Duplicate email or invalid fields return field-level validation errors with zero partial writes.

### UC-02: Submit a Requirement via Text, Form, CSV, or Invoice Upload
* **Primary actor:** Shop Owner
* **Main flow:** User enters natural-language text or uploads a supported invoice (`PDF`/`PNG`/`JPG` $\le 10\text{ MB}$) $\rightarrow$ Backend stores file privately and invokes `aiAdapter.extractRequirement()` $\rightarrow$ Backend schema-validates AI output and flags uncertain attributes $\rightarrow$ User reviews, edits, and confirms requirement (`CONFIRMED`).
* **Exception flow:** If file type/size is invalid, upload is rejected immediately; if AI times out or fails schema validation, `AIExecutionLog` records the failure and the UI switches seamlessly to manual form entry.

### UC-03: Compare Compatible Supplier Offers
* **Primary actor:** Shop Owner
* **Main flow:** User opens a confirmed requirement $\rightarrow$ Backend filters catalogue offers by hard constraints (unit, pack size, delivery area, quote validity) and ranks candidates via `matchProducts()` $\rightarrow$ UI displays side-by-side comparison showing $MOQ_W$, $MOQ_R$ ($20\%$), $\text{Step}$ ($1\%$), price tiers, provenance badges, and AI trade-off summary.
* **Exception flow:** If no compatible offer exists, the system displays an empty state with options to request a custom quote or create a draft pool.

### UC-04: Join a Group-Buy Pool with Retailer MOQ & Step Validation and Pay-at-Join
* **Primary actor:** Shop Owner
* **Main flow:** User selects an open pool and enters quantity $Q_i$ $\rightarrow$ Backend validates $Q_i \ge MOQ_R$ and $(Q_i \bmod \text{Step}) = 0$ $\rightarrow$ Backend creates `Contribution` (`PENDING_PAYMENT`) and PayPal Sandbox order $\rightarrow$ User approves PayPal checkout $\rightarrow$ Backend captures and verifies payment idempotently $\rightarrow$ Contribution becomes `ACTIVE`, $Q_{\text{pool}}$ and tier pricing recalculate, and activity event is logged.
* **Exception flow:** Quantity violating $MOQ_R$ or $\text{Step}$ is rejected with an exact calculation explanation; unverified or cancelled PayPal checkout leaves $Q_{\text{pool}}$ unchanged.

### UC-05: Customize Quantity or Withdraw Within the 72-Hour Window
* **Primary actor:** Shop Owner
* **Preconditions:** Pool is in `RECRUITING` ($Q_{\text{pool}} < MOQ_W$ and server time $< 72\text{h}$ deadline).
* **Main flow:**
  * *Quantity Increase:* Buyer increases $Q_i$ by a valid multiple of $\text{Step}$ $\rightarrow$ Backend calculates delta cost $\rightarrow$ Buyer completes PayPal Sandbox payment for the difference $\rightarrow$ Pool total and tier update.
  * *Quantity Decrease or Withdrawal:* Buyer lowers $Q_i$ ($\ge MOQ_R$) or withdraws $\rightarrow$ Backend updates pool total/tier and creates a tracked `Refund` (`REQUESTED` $\rightarrow$ `COMPLETED`) for the reduced/withdrawn amount.

### UC-06: Early Pool Lock When Wholesaler MOQ Is Reached
* **Primary actor:** Platform Workflow
* **Main flow:** A verified contribution pushes $Q_{\text{pool}} \ge MOQ_W$ before the 72-hour deadline $\rightarrow$ Backend atomically locks the pool (`MOQ_REACHED` $\rightarrow$ `AWAITING_APPROVALS`), stops ordinary edits/withdrawals, freezes an immutable `PriceSnapshot`, and notifies all participants to approve their final breakdown.

### UC-07: 72-Hour Expiry Below MOQ & 24-Hour Under-MOQ Buyer Decision Workflow
* **Primary actor:** Platform Scheduler / Shop Owners / Wholesaler
* **Main flow:**
  1. Server clock reaches 72-hour `deadline` with $Q_{\text{pool}} < MOQ_W$.
  2. Scheduled job locks pool (`UNDER_MOQ_DECISION_PENDING`), sets `decisionDeadline = lockedAt + 24h`, generates AI under-MOQ advisory, and notifies participants.
  3. Each active buyer visits `/group-buys/:poolId/decision` and selects **Proceed with the proposed order** or **Cancel my participation**.
  4. Cancelling and non-responsive buyers (after 24h) are excluded and issued full `Refund` records.
  5. If remaining buyers proceed and the wholesaler accepts the sub-MOQ quantity (or remaining buyers approve a valid revised supplier quote and complete any delta surcharge payment), the pool advances to `FUNDED`. Otherwise, the pool transitions to `CANCELLED` and all remaining buyers receive full refunds.

### UC-08: Approve Final Price Snapshot, Finalize Order, and Track Settlement
* **Primary actor:** Shop Owners / Wholesaler / Admin
* **Main flow:** Participants review and explicitly approve the frozen `PriceSnapshot` $\rightarrow$ If bulk tier unlocking reduced the unit price below what a buyer paid at join, the backend automatically issues a savings-delta `Refund`; if a balance is due, the buyer completes PayPal checkout $\rightarrow$ Pool reaches `FUNDED` $\rightarrow$ Backend creates the `Order` and `SupplierSettlement` (`SIMULATED` or `PENDING`) $\rightarrow$ Wholesaler/Admin confirms the order $\rightarrow$ Participants track delivery and download the PO summary.

---

## 6. External Interface Requirements

### 6.1 User Interface & Design System

#### Visual Direction (Premium, Trustworthy B2B SaaS)
* **Color System:**
  * Primary structure & navigation: **Deep Navy** (`#0F172A` / `slate-900`) and **Slate** (`#1E293B`).
  * Surfaces: **Warm Off-White** (`#F8FAFC`) and **Clean White** (`#FFFFFF`) with subtle borders (`#E2E8F0`).
  * Positive actions, MOQ progress & savings: **Emerald** (`#10B981`) and **Teal** (`#0D9488`).
  * Warnings, 72h/24h countdown alerts & under-MOQ states: **Amber** (`#F59E0B`).
  * Errors, rejections & shortfalls: **Rose/Red** (`#E11D48`).
* **Typography & Layout:**
  * Clean sans-serif typography with `tabular-nums` alignment for all financial tables, MOQ counters, and timers.
  * Consistent **Lucide React** icons, accessible `shadcn/ui` dialogs/dropdowns, keyboard navigation, visible focus states, and responsive layouts across desktop, tablet, and mobile.
  * Structured comparison tables, MOQ tier progress bars, itemized financial receipts, and chronological timelines instead of repetitive generic cards.

#### Required Screens & Frontend Routes
1. **Public Landing Page (`/`)**: Explains the procurement problem solved by **Aap Ki Dukan (CoBuy AI)**, AI extraction, Wholesaler/Retailer MOQ & Step mechanics, bulk tier unlocking, transparent cost allocation, and Sign In / Register CTAs.
2. **Authentication (`/login`, `/register`)**: Role-aware onboarding + quick demo account switcher in development/demo mode.
3. **Buyer Dashboard (`/dashboard`)**: Active pools, 72h countdowns, MOQ progress, pending snapshot approvals, 24h under-MOQ decision alerts, recent orders, and quick actions.
4. **Business Profile (`/profile`)**: Shop and Supplier profile management.
5. **Requirements (`/requirements`, `/requirements/new`, `/requirements/:requirementId`)**: Form/text/upload/CSV intake, AI extraction review, uncertainty indicators, edit/confirm controls, and candidate offer matching.
6. **Supplier Catalogue & Comparison (`/suppliers`, `/suppliers/:supplierId`)**: Search, filter, side-by-side quote comparison, provenance badges, and custom quote request.
7. **Group-Buy Marketplace & Detail (`/group-buys`, `/group-buys/create`, `/group-buys/:poolId`)**: Pool discovery, live 72h countdown, $MOQ_W / MOQ_R / \text{Step}$ interactive calculator, join/edit/withdraw controls, and activity timeline.
8. **Snapshot Approval & Under-MOQ Decision (`/group-buys/:poolId/approve`, `/group-buys/:poolId/decision`)**: Itemized `PriceSnapshot` approval screen and 24-hour under-MOQ `PROCEED` / `CANCEL` decision screen with AI advisory.
9. **Payments & Refunds (`/payments`, `/refunds`)**: PayPal Sandbox checkout modal (`TEST TRANSACTION` badge), payment history, delta adjustments, and refund status tracker.
10. **Orders (`/orders`, `/orders/:orderId`)**: Order status, member shares, separate `SupplierSettlement` status badge, PO summary download, and audit history.
11. **Notifications (`/notifications`)**: Real-time in-app notification center.
12. **Supplier Portal (`/supplier-portal`)**: Offer management, quote responses, under-MOQ feasibility decisions, and order confirmation.
13. **Admin Workspace (`/admin`, `/admin/suppliers`, `/admin/offers`, `/admin/group-buys`, `/admin/orders`, `/admin/audit-logs`)**: Catalogue moderation, stalled pool/payment reconciliation, AI execution logs, and immutable audit log viewer.

### 6.2 Backend API Interface

| Method | Endpoint | Purpose | Access |
|---|---|---|---|
| `GET` | `/api/health` | Service & database health check + current server clock | Public |
| `POST` | `/api/auth/register` | Register a shop owner or supplier account | Public |
| `POST` | `/api/auth/login` | Authenticate and issue JWT / session | Public |
| `POST` | `/api/auth/logout` | Invalidate active session/token | Authenticated |
| `GET` | `/api/me` | Get current user and Shop/Supplier profile | Authenticated |
| `PATCH` | `/api/shops/me` | Update permitted shop profile fields | `SHOP_OWNER` |
| `POST` | `/api/uploads` | Upload supported invoice/image/PDF/CSV ($\le 10\text{ MB}$) | `SHOP_OWNER` |
| `GET` | `/api/uploads/:id/download` | Download own private uploaded document | Owner / `ADMIN` |
| `POST` | `/api/requirements` | Create manual or natural-language requirement | `SHOP_OWNER` |
| `POST` | `/api/requirements/import-csv` | Bulk-create draft requirements from CSV | `SHOP_OWNER` |
| `GET` | `/api/requirements` | List own requirements (or all for Admin/Reviewer) | `SHOP_OWNER`, `ADMIN`, `REVIEWER` |
| `GET` | `/api/requirements/:id` | Read requirement details & extraction metadata | Owner / `ADMIN` / `REVIEWER` |
| `PATCH` | `/api/requirements/:id` | Edit, confirm (`CONFIRMED`), or reject requirement | Owner / `ADMIN` |
| `POST` | `/api/requirements/:id/extract` | Run AI extraction and normalization on requirement | Owner / `ADMIN` |
| `GET` | `/api/suppliers` | Search and filter suppliers | Authenticated |
| `GET` | `/api/suppliers/:id` | Read supplier detail and active offers | Authenticated |
| `GET` | `/api/products/search` | Search normalized products | Authenticated |
| `GET` | `/api/offers/search` | Search compatible offers for a confirmed requirement | Authenticated |
| `POST` | `/api/offers/compare` | Deterministic landed-cost comparison + AI summary | Authenticated |
| `POST` | `/api/quotes/requests` | Request custom or updated supplier quote | `SHOP_OWNER`, `ADMIN` |
| `PATCH` | `/api/quotes/:id/respond` | Supplier/Admin submits quote pricing & validity | `SUPPLIER`, `ADMIN` |
| `GET` | `/api/pools` | List/filter group-buy pools | Authenticated |
| `POST` | `/api/pools` | Create and publish a 72-hour group-buy pool | `SHOP_OWNER`, `ADMIN` |
| `GET` | `/api/pools/:id` | View pool detail, MOQ/Step rules, shares & timeline | Authenticated |
| `POST` | `/api/pools/:id/contributions` | Join pool (validates $MOQ_R$, $\text{Step}$, compatibility) | `SHOP_OWNER` |
| `PATCH` | `/api/pools/:id/contributions/:contributionId` | Edit quantity while pool is open ($< MOQ_W$ & $< 72\text{h}$) | Contribution Owner |
| `DELETE` | `/api/pools/:id/contributions/:contributionId` | Withdraw while pool is open and initiate refund | Contribution Owner |
| `POST` | `/api/pools/:id/approve` | Explicitly approve frozen `PriceSnapshot` | Contribution Owner |
| `POST` | `/api/pools/:id/decision` | Submit 24h under-MOQ decision (`PROCEED` / `CANCEL`) | Contribution Owner |
| `POST` | `/api/pools/:id/supplier-feasibility` | Wholesaler accepts, revises quote, or rejects sub-MOQ pool | `SUPPLIER`, `ADMIN` |
| `POST` | `/api/pools/:id/finalize` | Validate all preconditions and create final `Order` | Workflow / `ADMIN` |
| `POST` | `/api/payments/create-order` | Create PayPal Sandbox order from server snapshot | `SHOP_OWNER` |
| `POST` | `/api/payments/:paymentId/capture` | Capture & verify PayPal payment on server idempotently | `SHOP_OWNER` |
| `GET` | `/api/payments` | List buyer payment records | Owner / `ADMIN` / `REVIEWER` |
| `GET` | `/api/payments/:paymentId` | Read single payment status & reconciliation info | Owner / `ADMIN` / `REVIEWER` |
| `POST` | `/api/payments/webhook` | Receive and verify PayPal webhook events | Signed Provider Webhook |
| `GET` | `/api/refunds` | List refund statuses (`REQUESTED` $\rightarrow$ `COMPLETED`) | Owner / `ADMIN` / `REVIEWER` |
| `GET` | `/api/orders` | List finalized orders | Authenticated |
| `GET` | `/api/orders/:id` | Get order detail, member shares & `SupplierSettlement` | Participant / `SUPPLIER` / `ADMIN` / `REVIEWER` |
| `GET` | `/api/orders/:id/activity` | Get chronological order activity history | Participant / `SUPPLIER` / `ADMIN` / `REVIEWER` |
| `GET` | `/api/orders/:id/po-summary` | Download Purchase Order summary | Participant / `SUPPLIER` / `ADMIN` |
| `PATCH` | `/api/orders/:id/supplier-status` | Confirm, reject, or update order delivery status | `SUPPLIER`, `ADMIN` |
| `GET` | `/api/notifications` | List in-app notifications for current user | Authenticated |
| `PATCH` | `/api/notifications/:id/read` | Mark notification(s) as read | Authenticated |
| `POST` | `/api/admin/suppliers` | Create/manage supplier record | `ADMIN` |
| `PATCH` | `/api/admin/suppliers/:id` | Update/verify supplier record | `ADMIN` |
| `POST` | `/api/admin/offers` | Create/update supplier offer & MOQ/step parameters | `ADMIN`, `SUPPLIER` |
| `GET` | `/api/admin/reconciliation` | Inspect stalled pools, payment/refund exceptions & AI errors | `ADMIN`, `REVIEWER` |
| `POST` | `/api/admin/jobs/run-lifecycle-check` | Trigger 72h/24h scheduled expiration jobs (supports test clock) | `ADMIN` |
| `GET` | `/api/admin/audit-logs` | Query immutable `AuditLog` and `AIExecutionLog` records | `ADMIN`, `REVIEWER` |

### 6.3 AI Service Interface

The backend AI adapter (`server/src/services/ai/`) exposes five schema-validated methods:
* `extractRequirement(input)`: Extracts structured purchasing fields and `uncertainFields` from text or document buffers.
* `normalizeProduct(description, attributes)`: Maps raw descriptions to canonical product specifications.
* `matchProducts(requirement, catalogueCandidates)`: Evaluates hard compatibility and ranks candidate offers with explicit match/mismatch reasons.
* `summarizeQuotes(verifiedQuotes, calculatedComparison)`: Produces a natural-language trade-off summary grounded strictly in backend-calculated landed costs.
* `recommendUnderMOQAction(poolContext, alternativeOffers)`: Produces a structured advisory recommendation (`SUGGEST_PROCEED`, `SUGGEST_WAIT_FOR_REVISED_QUOTE`, `SUGGEST_CANCEL`) with supporting cost/quantity figures and explicit uncertainty warnings when a pool expires below $MOQ_W$.

### 6.4 Supplier Data Interface
Uses the internal MongoDB catalogue as the primary source, with every offer tagged by `dataSourceType` (`SEEDED_DEMO`, `SUPPLIER_SUBMITTED`, `VERIFIED_LIVE`, `EXTERNAL_API`). Optional external product discovery APIs sit behind a normalizing adapter.

### 6.5 PayPal Interface
Uses the PayPal JavaScript SDK on the frontend and PayPal Orders v2 / Captures / Refunds REST APIs on the backend. Supports a configurable `PAYMENT_MODE=sandbox|mock` so local automated tests can run deterministically without misrepresenting mock transactions as verified live PayPal captures.

### 6.6 File Upload Interface
Validates file extensions and MIME magic bytes (`PDF`, `PNG`, `JPG`, `WEBP`, `CSV`), enforces `MAX_UPLOAD_SIZE_MB=10`, writes to a private storage directory (`UPLOAD_STORAGE_MODE=local|s3`) using UUID filenames, and serves files exclusively through ownership-verified controller streams.

---

## 7. Data Requirements and Conceptual Model

All monetary fields use **integer minor units** (e.g., paise/cents). Full Mongoose schemas and indexes are specified in `database_schemas.md`.

1. **`User`**: `name`, `email` (unique, normalized), `passwordHash`, `role` (`SHOP_OWNER`, `SUPPLIER`, `ADMIN`, `REVIEWER`), `status`, `lastLoginAt`.
2. **`Shop`**: `ownerUserId`, `name`, `businessType`, `deliveryAddress`, `deliveryArea`, `contactDetails`, `preferredCurrency`.
3. **`Supplier`**: `ownerUserId` (optional for Supplier Portal), `name`, `contactReference`, `serviceAreas`, `verificationStatus`, `activeStatus`, `dataSourceType`.
4. **`UploadedDocument`**: `uploadedByUserId`, `shopId`, `originalFilename`, `storageKey`, `mimeType`, `sizeBytes`, `sha256Hash`, `status`, `retentionExpiresAt`.
5. **`Requirement`**: `shopId`, `createdByUserId`, `sourceType` (`TEXT`, `FORM`, `IMAGE`, `PDF`, `CSV`), `originalDescription`, `uploadedDocumentId`, `extractedFields`, `confirmedFields`, `normalizedAttributes`, `requestedQuantity`, `quantityUnit`, `packSize`, `requiredBy`, `deliveryArea`, `constraints`, `uncertainFields`, `confidenceScore`, `status` (`DRAFT`, `PROCESSING`, `NEEDS_REVIEW`, `CONFIRMED`, `FAILED_EXTRACTION`, `REJECTED`, `ARCHIVED`), `confirmedByUserId`, `confirmedAt`.
6. **`Product`**: `canonicalName`, `category`, `baseUnit`, `packSizeDescription`, `specifications` (material, capacity, foodSafe, certifications), `synonyms`, `brandConstraint`.
7. **`SupplierOffer`**: `supplierId`, `productId`, `supplierProductDescription`, `packUnit`, `packSize`, `currency`, `baseUnitPriceMinor`, `quantityTiers` (`minQuantity`, `unitPriceMinor`), `minimumOrderQuantity` ($MOQ_W$), `retailerMoqPercentage` ($p_{\min}$, default $20$), `retailerStepPercentage` ($p_{\text{step}}$, default $1$), `minRetailerQuantityOverride`, `quantityStepMultipleOverride`, `deliveryAreas`, `leadTimeDays`, `shippingTerms`, `flatShippingCostMinor`, `shippingAllocationMethod`, `taxInclusion`, `availabilityStatus`, `quoteTimestamp`, `expiresAt`, `dataSourceType`, `verificationStatus`.
8. **`Quote`**: `supplierId`, `productId`, `supplierOfferId`, `poolId`, `requestedByUserId`, `quotedQuantity`, `currency`, `unitPriceMinor`, `quantityTiers`, `shippingCostMinor`, `taxInclusion`, `leadTimeDays`, `validUntil`, `source`, `status` (`REQUESTED`, `PROVIDED`, `ACCEPTED`, `EXPIRED`, `REJECTED`).
9. **`GroupBuyPool`**: `title`, `productId`, `supplierOfferId`, `activeQuoteId`, `currency`, `targetMoq` ($MOQ_W$), `retailerMoqPercentage` ($p_{\min}$), `retailerStepPercentage` ($p_{\text{step}}$), `minRetailerQuantity` ($MOQ_R$), `quantityStepMultiple` ($\text{Step}$), `totalEligibleQuantity` ($Q_{\text{pool}}$), `currentUnitPriceMinor`, `estimatedMerchandiseTotalMinor`, `shippingCostMinor`, `shippingAllocationMethod`, `paymentPolicy` (`PAY_AT_JOIN`, `PAY_AFTER_APPROVAL`), `publishedAt`, `deadline` ($+72\text{h}$), `lockedAt`, `lockReason`, `decisionDeadline` ($+24\text{h}$), `supplierUnderMoqStatus`, `aiUnderMoqRecommendation`, `latestPriceSnapshotId`, `state`, `closureReason`, `createdByUserId`.
10. **`Contribution`**: `poolId`, `shopId`, `requirementId`, `createdByUserId`, `quantity` ($Q_i$), `unit`, `approvedSubstitution`, `unitPriceMinor`, `estimatedMerchandiseShareMinor`, `estimatedShippingShareMinor`, `finalTotalPayableMinor`, `totalPaidMinor`, `totalRefundedMinor`, `approvalStatus` (`NOT_REQUIRED_YET`, `PENDING_APPROVAL`, `APPROVED`, `INVALIDATED_BY_CHANGE`, `REJECTED`), `approvedPriceSnapshotId`, `approvedAt`, `underMoqDecision` (`NOT_APPLICABLE`, `PENDING`, `PROCEED`, `CANCEL`, `EXPIRED_NO_RESPONSE`), `underMoqDecisionAt`, `state` (`PENDING_PAYMENT`, `ACTIVE`, `WITHDRAWN`, `CANCELLED_UNDER_MOQ`, `REFUNDED`, `FINALIZED`).
11. **`PriceSnapshot`**: `poolId`, `version`, `supplierOfferId`, `quoteId`, `currency`, `totalEligibleQuantity`, `appliedUnitPriceMinor`, `merchandiseTotalMinor`, `shippingCostMinor`, `shippingAllocationMethod`, `groupTotalPayableMinor`, `memberShares` (array of itemized per-shop breakdowns), `isSuperseded`, `createdAt`.
12. **`Payment`**: `poolId`, `contributionId`, `shopId`, `payerUserId`, `paymentPurpose` (`INITIAL_JOIN`, `QUANTITY_INCREASE_DELTA`, `POST_APPROVAL_FINAL`, `UNDER_MOQ_SURCHARGE`), `provider` (`PAYPAL_SANDBOX`, `MOCK_DEV`), `providerOrderId`, `providerCaptureId`, `idempotencyKey`, `amountMinor`, `currency`, `paymentStatus` (`CREATED`, `BUYER_ACTION_REQUIRED`, `APPROVED`, `CAPTURE_PENDING`, `PAID`, `CANCELLED`, `FAILED`, `REFUNDED`, `PARTIALLY_REFUNDED`, `UNKNOWN`, `NEEDS_REVIEW`), `isTestTransaction`, `capturedAt`, `lastReconciledAt`.
13. **`Refund`**: `paymentId`, `poolId`, `contributionId`, `shopId`, `amountMinor`, `currency`, `reason` (`BUYER_WITHDRAWAL`, `QUANTITY_REDUCTION`, `TIER_PRICE_DROP_SAVINGS`, `POOL_CANCELLED`, `UNDER_MOQ_BUYER_CANCEL`, `UNDER_MOQ_NO_RESPONSE`, `SUPPLIER_REJECTED`, `EXTRA_PAYMENT_FAILURE_ROLLBACK`), `providerRefundId`, `idempotencyKey`, `status` (`REQUESTED`, `PROCESSING`, `COMPLETED`, `FAILED`), `completedAt`.
14. **`Order`**: `orderNumber`, `poolId`, `supplierId`, `supplierOfferId`, `priceSnapshotId`, `currency`, `totalQuantity`, `unit`, `merchandiseTotalMinor`, `shippingTotalMinor`, `grandTotalMinor`, `memberOrders` (per-shop sub-orders), `supplierConfirmationStatus`, `supplierReference`, `isSimulatedConfirmation`, `orderState` (`CONFIRMED`, `PROCESSING`, `SHIPPED`, `DELIVERED`, `FULFILLED`, `CANCELLED`, `EXCEPTION`).
15. **`SupplierSettlement`**: `orderId`, `poolId`, `supplierId`, `amountMinor`, `currency`, `settlementStatus` (`NOT_STARTED`, `SIMULATED`, `PENDING`, `CONFIRMED`, `FAILED`, `NEEDS_REVIEW`), `mode` (`DEMO`, `MANUAL`, `INTEGRATED`), `providerReference`, `confirmedAt`.
16. **`Notification`**: `recipientUserId`, `shopId`, `type`, `title`, `message`, `linkUrl`, `relatedPoolId`, `relatedOrderId`, `isRead`, `readAt`.
17. **`AuditLog` (`AuditEvent`)**: `correlationId`, `actorId`, `actorRole`, `action`, `resourceType`, `resourceId`, `poolId`, `orderId`, `metadata`, `createdAt`.
18. **`AIExecutionLog`**: `correlationId`, `triggeredByUserId`, `operation` (`EXTRACT_REQUIREMENT`, `NORMALIZE_PRODUCT`, `MATCH_PRODUCTS`, `SUMMARIZE_QUOTES`, `UNDER_MOQ_RECOMMENDATION`), `provider`, `model`, `status`, `latencyMs`, `schemaValidated`, `errorCode`, `createdAt`.

---

## 8. State Models and Workflows

### 8.1 Requirement Lifecycle
`DRAFT` $\rightarrow$ `PROCESSING` $\rightarrow$ `NEEDS_REVIEW` $\rightarrow$ `CONFIRMED`  
*(Exception/Terminal states: `FAILED_EXTRACTION` $\rightarrow$ manual edit $\rightarrow$ `CONFIRMED`, `REJECTED`, `ARCHIVED`)*

### 8.2 Group-Buy Pool Lifecycle (Union of SRS + 72h MOQ & 24h Decision Workflow)
* **Standard Path (MOQ Reached within 72h):**  
  `DRAFT` $\rightarrow$ `RECRUITING` (72h timer active) $\rightarrow$ `MOQ_REACHED` (Early Lock) $\rightarrow$ `AWAITING_APPROVALS` (Freeze `PriceSnapshot`) $\rightarrow$ `AWAITING_PAYMENT` (if delta/final payment needed) $\rightarrow$ `FUNDED` $\rightarrow$ `SUPPLIER_ORDER_PENDING` $\rightarrow$ `ORDERED` $\rightarrow$ `FULFILLED`.
* **Under-MOQ Path (72h Timer Expires with $Q_{\text{pool}} < MOQ_W$):**  
  `RECRUITING` $\rightarrow$ `UNDER_MOQ_DECISION_PENDING` (24h decision window + AI recommendation) $\rightarrow$ `AWAITING_SUPPLIER_UNDER_MOQ_FEASIBILITY` / `AWAITING_REVISED_QUOTE_APPROVAL` $\rightarrow$ `AWAITING_APPROVALS` $\rightarrow$ `AWAITING_PAYMENT` $\rightarrow$ `FUNDED` $\rightarrow$ `SUPPLIER_ORDER_PENDING` $\rightarrow$ `ORDERED` $\rightarrow$ `FULFILLED`.
* **Exception/Terminal States:**  
  `EXPIRED`, `CANCELLED`, `FAILED`, `NEEDS_REVIEW`.

### 8.3 Payment & Refund Lifecycles
* **Payment:** `CREATED` $\rightarrow$ `BUYER_ACTION_REQUIRED` $\rightarrow$ `APPROVED` $\rightarrow$ `CAPTURE_PENDING` $\rightarrow$ `PAID` $\rightarrow$ (`PARTIALLY_REFUNDED` | `REFUNDED`). Exception states: `CANCELLED`, `FAILED`, `UNKNOWN`, `NEEDS_REVIEW`.
* **Refund:** `REQUESTED` $\rightarrow$ `PROCESSING` $\rightarrow$ `COMPLETED` (or `FAILED` $\rightarrow$ Admin Reconciliation).

### 8.4 Supplier Settlement Lifecycle
* **Demo / MVP Mode:** `NOT_STARTED` $\rightarrow$ `SIMULATED` (visibly badged).
* **Manual / Integrated Mode:** `NOT_STARTED` $\rightarrow$ `PENDING` $\rightarrow$ `CONFIRMED` (or `FAILED` / `NEEDS_REVIEW`).

---

## 9. Non-Functional Requirements

* **NFR-SEC-001 to 010 (Security):** HTTPS in production; environment-variable secret isolation; `bcrypt` password hashing; backend RBAC and ownership enforcement on every endpoint; strict Zod request/AI schema validation; endpoint rate limiting (auth, uploads, AI, payments); safe UUID file storage; cryptographic webhook verification; and XSS/prompt-injection sanitization.
* **NFR-PRIV-001 to 005 (Privacy):** Minimal data collection; private authenticated invoice access; scrubbed structured logs (never logging passwords, tokens, or full raw invoices); documented retention policy.
* **NFR-PERF-001 to 004 (Performance):** $< 2.0\text{s}$ 95th-percentile response time for catalogue and pool queries under $20$ concurrent users and $5,000$ seeded offers; non-blocking UI loading skeletons; $15\text{s}$ timeout on external AI calls; compound MongoDB indexes on all lookup keys.
* **NFR-REL-001 to 005 (Reliability & Concurrency):** Manual fallback when AI is down; MongoDB transactions / atomic updates for concurrent pool joins, early MOQ locks, and 72h expirations; idempotent payment captures and refunds.
* **NFR-USE-001 to 005 (Usability & Accessibility):** Non-technical retailer clarity; tabular financial formatting; responsive mobile/tablet/desktop layouts; WCAG AA contrast, keyboard navigation, and non-color-only status indicators.
* **NFR-MAINT-001 to 005 (Maintainability & Testability):** Modular service architecture; pure deterministic pricing functions; provider adapters for AI and PayPal; injectable `ClockService` for instant 72h/24h time travel in automated tests.

---

## 10. Error Handling Requirements

The system shall gracefully handle and recover from:
1. Duplicate account registration or invalid credentials.
2. Quantity violating Retailer Minimum MOQ ($Q_i < MOQ_R$) or Step Multiple ($Q_i \bmod \text{Step} \ne 0$).
3. Unsupported file type, file $> 10\text{ MB}$, or unreadable invoice upload.
4. AI provider timeout, rate limit, or malformed JSON output (enabling manual entry fallback).
5. Incompatible units, pack sizes, or unapproved material substitutions when joining a pool.
6. Concurrent join/edit attempts right as a pool hits $MOQ_W$ or expires at 72 hours (`409 Conflict`).
7. Quote expiration or price/shipping modification after participant snapshot approval (automatically invalidating stale approvals).
8. Buyer silence during the 24-hour under-MOQ decision window (auto-cancelling and refunding the silent buyer).
9. Supplier rejection of an under-MOQ pool or failed delta surcharge payment (rolling back and refunding remaining buyers).
10. Cancelled, failed, delayed, or duplicate PayPal Sandbox captures/webhooks and failed refund attempts (surfacing in Admin Reconciliation).

---

## 11. AI Quality, Safety, and Validation Requirements

* **Advisory Boundary:** AI assists with extraction, normalization, matching explanation, quote summarization, and under-MOQ buyer guidance; it never invents prices, fabricates supplier consent, or executes financial transitions.
* **Matching Strategy:** Applies hard deterministic filters first (pack unit, category, delivery coverage, active quote), followed by attribute comparison (size/capacity, material, food-safety, brand constraints) and mismatch explanations.
* **Prompt-Injection Defense:** Invoice OCR text and supplier descriptions are wrapped in untrusted data blocks with system instructions forbidding instruction overrides or tool execution.

---

## 12. Testing and Acceptance Criteria

### 12.1 Mandatory Per-Phase Testing Rule
Every feature must be tested in the same implementation phase using **Vitest**, **React Testing Library**, **Supertest**, and **Playwright**. Deadline workflows must use the injectable `ClockService` so 72-hour and 24-hour tests execute in milliseconds.

### 12.2 Mandatory Business Calculation Tests

#### Test A: Mandatory $₹4,800$ Tiered Pricing & Allocation Test
* **Input:** Base price $= ₹100/\text{box}$ ($10000\text{ paise}$); $30\text{–}49\text{ boxes} = ₹90/\text{box}$; $\ge 50\text{ boxes} = ₹80/\text{box}$. Confirmed contributions: Shop A $= 20\text{ boxes}$, Shop B $= 15\text{ boxes}$, Shop C $= 25\text{ boxes}$. Shipping excluded.
* **Expected Output:**
  * Total eligible quantity $= 60\text{ boxes}$
  * Selected price tier $= ₹80/\text{box}$ ($8000\text{ paise}$)
  * Merchandise total $= ₹4,800$ ($480000\text{ paise}$)
  * Shop A $= ₹1,600$; Shop B $= ₹1,200$; Shop C $= ₹2,000$; Sum of shares $= ₹4,800$.

#### Test B: Mandatory Wholesaler MOQ ($1000$), Retailer MOQ ($20\%$), and Step Multiple ($1\%$) Test
* **Input:** Wholesaler Offer with $MOQ_W = 1000\text{ units}$, $p_{\min} = 20\%$, $p_{\text{step}} = 1\%$.
* **Expected Output:**
  * Derived Retailer Minimum MOQ $MOQ_R = 200\text{ units}$.
  * Derived Step Multiple $\text{Step} = 10\text{ units}$.
  * Contribution of $190\text{ units}$ is **rejected** (`BELOW_RETAILER_MOQ`).
  * Contribution of $205\text{ units}$ is **rejected** (`INVALID_STEP_MULTIPLE`).
  * Contributions of $200\text{ units}$, $210\text{ units}$, and $590\text{ units}$ are **accepted**, summing to $Q_{\text{pool}} = 1000\text{ units}$ and triggering immediate Early MOQ Lock.

### 12.3 Complete 24-Point MVP Definition of Done
1. Application starts cleanly using documented commands.
2. Public landing page, registration, login, and logout work end-to-end.
3. Backend enforces authentication, RBAC (`SHOP_OWNER`, `SUPPLIER`, `ADMIN`, `REVIEWER`), and resource ownership.
4. Shops and suppliers can manage their business profiles.
5. Structured form, natural-language text, CSV import, and invoice/image/PDF upload ($\le 10\text{ MB}$) work.
6. AI output is schema-validated and editable, with working manual fallback.
7. Supplier offers are persistent in MongoDB and display explicit provenance badges (`DEMO SAMPLE DATA` vs. `VERIFIED`).
8. Compatible requirements can join pools while incompatible units/specifications are blocked or require explicit substitution approval.
9. Wholesaler MOQ ($MOQ_W$), Retailer MOQ ($20\%$), and Step Multiple ($1\%$) rules are enforced on the backend.
10. The mandatory $₹4,800$ pricing unit test and the $MOQ_W = 1000 / MOQ_R = 200 / \text{Step} = 10$ unit test pass.
11. The 72-hour MOQ countdown, early MOQ lock, and pre-lock customization/withdrawal window work deterministically.
12. Expiring at 72 hours below $MOQ_W$ opens the 24-hour buyer decision workflow (`PROCEED` / `CANCEL`) with AI recommendation and handles all 10 under-MOQ edge cases.
13. Participants review and explicitly approve versioned, itemized `PriceSnapshot` breakdowns.
14. Price or quantity changes after approval automatically invalidate stale approvals.
15. PayPal Sandbox payments (pay-at-join and delta/post-approval) are verified server-side and protected by idempotency.
16. Refunds (`REQUESTED`, `PROCESSING`, `COMPLETED`, `FAILED`) are tracked separately for withdrawals, tier drops, cancellations, and non-responses.
17. Missing or simulated payment integrations are clearly disclosed with visible badges.
18. `SupplierSettlement` is tracked and displayed separately from buyer payment captures.
19. Order states, PO downloads, in-app notifications, and chronological activity timelines reflect real backend operations.
20. Supplier Portal and Admin Workspace (including payment/order reconciliation and audit logs) are protected and functional.
21. Loading skeletons, empty states, validation errors, confirmation dialogs, and recovery states work across desktop and mobile.
22. Automated unit, integration, and Playwright E2E tests and production builds pass.
23. `README.md` and all 12 `docs/` files are complete with setup instructions, `.env.example`, seeding commands, and demo credentials.
24. The complete 3-shop hackathon demonstration scenario runs smoothly from start to finish.

---

## 13. Deployment and Configuration

### 13.1 Environment Variables (`.env.example`)
```dotenv
NODE_ENV=development
PORT=5000
CLIENT_ORIGIN=http://localhost:5173

MONGODB_URI=mongodb://127.0.0.1:27017/aap_ki_dukan_cobuy
JWT_SECRET=replace_with_64_char_random_secret
JWT_EXPIRES_IN=7d

AI_PROVIDER=gemini_or_openai
AI_API_KEY=replace_with_server_side_ai_key
AI_MODEL=gemini-2.5-flash
AI_TIMEOUT_MS=15000

PAYMENT_MODE=sandbox
PAYPAL_CLIENT_ID=replace_with_sandbox_client_id
PAYPAL_CLIENT_SECRET=replace_with_sandbox_secret
PAYPAL_BASE_URL=https://api-m.sandbox.paypal.com
PAYPAL_WEBHOOK_ID=replace_with_webhook_id

UPLOAD_STORAGE_MODE=local
MAX_UPLOAD_SIZE_MB=10
POOL_DURATION_HOURS=72
UNDER_MOQ_DECISION_HOURS=24
DEFAULT_RETAILER_MOQ_PERCENT=20
DEFAULT_RETAILER_STEP_PERCENT=1
```

---

## 14. Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Incorrect AI product match | Shops pool incompatible products | Hard deterministic unit/spec filters, visible mismatch warnings, mandatory owner confirmation |
| Retailer micro-orders fragmenting wholesale packs | Wholesaler refuses fulfilment | Enforce Retailer Minimum MOQ ($20\%$) and Step Multiple ($1\%$) on every join and edit |
| Pool stalls below MOQ at 72 hours | Buyers' funds locked indefinitely | Automated 72h lock + 24h explicit `PROCEED`/`CANCEL` decision window + automatic refund for silent/cancelling buyers |
| Concurrent joins or duplicate PayPal callbacks | Corrupted quantities or double charges | MongoDB ACID transactions, optimistic concurrency, and unique idempotency indexes on `providerOrderId` / `providerCaptureId` |
| Stale supplier pricing or mid-pool quote changes | Financial discrepancy | Quote expiry timestamps, immutable `PriceSnapshot` versioning, and automatic approval invalidation on material change |
| Unclear distinction between demo and live data | Misleading evaluators or buyers | Mandatory UI badges for `SEEDED_DEMO`, `TEST TRANSACTION`, and `SIMULATED SETTLEMENT` |

---

## 15. Repository Structure and Documentation Blueprint

```text
cobuy-ai/
├── client/                         # React + Vite + Tailwind + shadcn/ui frontend
├── server/                         # Node.js + Express + Mongoose backend
├── e2e/                            # Playwright end-to-end test suite
├── docs/                           # 12 Mandatory Project Documentation Files:
│   ├── PROJECT_OVERVIEW.md
│   ├── FEATURE_MATRIX.md
│   ├── USER_FLOWS.md
│   ├── ROUTES_AND_PAGES.md
│   ├── API_SPECIFICATION.md
│   ├── DATABASE_SCHEMA.md
│   ├── GROUP_BUY_BUSINESS_RULES.md
│   ├── PAYMENTS_AND_REFUNDS.md
│   ├── SOURCE_CODE_FILE_MAP.md
│   ├── TEST_STRATEGY.md
│   ├── IMPLEMENTATION_ROADMAP.md
│   └── ACCEPTANCE_CRITERIA.md
├── .env.example
├── .gitignore
├── LICENSE
└── README.md
```

---

## 16. Unified Implementation Phases

* **Phase 0:** Architecture blueprint, complete `docs/` suite, and source code file map.
* **Phase 1:** Project scaffolding (React/Vite + Express), environment validation, MongoDB connection, injectable `ClockService`, health endpoint, and test runners.
* **Phase 2:** Authentication, RBAC (`SHOP_OWNER`, `SUPPLIER`, `ADMIN`, `REVIEWER`), Shop/Supplier profiles, public landing page, and app shell.
* **Phase 3:** Supplier catalogue, products, offers (with $MOQ_W, p_{\min}, p_{\text{step}}$), custom quotes, provenance badges, admin CRUD, and repeatable demo seed script.
* **Phase 4:** Purchasing requirements intake (form, text, CSV, invoice/PDF upload), AI extraction adapter, schema validation, review/edit/confirm UI, and manual fallback.
* **Phase 5:** Product normalization, compatibility verification, candidate matching engine, and side-by-side supplier comparison.
* **Phase 6:** Deterministic pricing engine, Wholesaler/Retailer MOQ & Step validator, shipping allocation, versioned `PriceSnapshot` service, and mandatory $₹4,800$ & $MOQ_W=1000$ unit tests.
* **Phase 7:** Group-buy pool creation, marketplace discovery, joining, quantity customization, withdrawal, and base state transitions.
* **Phase 8:** Mandatory 72-hour timer, scheduled expiration job, early MOQ lock, 24-hour under-MOQ decision workflow (`PROCEED` / `CANCEL`), AI under-MOQ advisor, supplier feasibility/revised quotes, and all 10 edge-case tests.
* **Phase 9:** PayPal Sandbox checkout (pay-at-join & delta/post-approval), capture verification, webhook idempotency, and multi-state `Refund` processing.
* **Phase 10:** Final snapshot approvals, `Order` creation, PO summary download, supplier confirmation/rejection, and separate `SupplierSettlement` tracking.
* **Phase 11:** Buyer dashboard, Supplier portal, Admin reconciliation workspace, Reviewer mode, and in-app notification center.
* **Phase 12:** Concurrency hardening, security/accessibility verification, and full Playwright E2E test suite.
* **Phase 13:** Deployment configuration, seeded hackathon demo verification, and final engineering handoff.

---

## 17. Hackathon Demonstration Scenario

A complete, repeatable end-to-end demonstration using seeded accounts:
1. **Landing & Onboarding:** Open the public landing page, review the value proposition, and sign in as **Shop A** (*Lucknow Café*).
2. **AI Requirement Intake:** Upload a sample invoice or enter *"We need 20 boxes of 12-oz food-safe paper cups within two weeks"*, inspect the AI-extracted fields and confidence indicators, and click **Confirm Requirement**.
3. **Supplier Comparison & MOQ Rules:** Compare two seeded supplier offers showing provenance badges (`DEMO SAMPLE DATA`), tier pricing ($₹100$ base, $₹90$ for $30\text{–}49$, $₹80$ for $\ge 50$), Wholesaler MOQ ($MOQ_W$), Retailer MOQ ($20\%$), and Step Multiple ($1\%$).
4. **72-Hour Pool & Multi-Shop Aggregation:** Join the active pool as **Shop A** ($20\text{ boxes}$), **Shop B** ($15\text{ boxes}$), and **Shop C** ($25\text{ boxes}$) via PayPal Sandbox checkout (`TEST TRANSACTION`). Also demonstrate how an invalid quantity violating the Retailer MOQ or Step Multiple is blocked with a clear mathematical explanation.
5. **Early Lock & $₹4,800$ Breakdown:** Show the combined quantity reaching $60\text{ boxes}$ ($\ge 50\text{ MOQ}$), automatically locking the pool early, unlocking the $₹80/\text{box}$ bulk tier ($₹4,800$ total: $₹1,600$, $₹1,200$, and $₹2,000$), freezing the `PriceSnapshot`, and issuing automatic tier-savings refunds where applicable.
6. **Under-MOQ 24-Hour Decision Demo:** Inspect a second seeded pool where the 72-hour timer expired below $MOQ_W$ (e.g., $600 / 1000\text{ units}$), displaying the AI under-MOQ recommendation, the **Proceed** vs. **Cancel** buyer decision buttons, and tracked refund statuses.
7. **Order Finalization, Settlement & Audit Trail:** Approve the snapshot, view the confirmed `Order`, download the PO summary, verify the separate `SIMULATED` `SupplierSettlement` badge, and inspect the chronological activity and admin audit logs.

---

## 18. Open Decisions Before Production

1. **Production Payment Recipient & Escrow Model:** Whether production uses direct supplier checkout, PayPal Multiparty / Commerce Platform split payments, or a licensed escrow partner.
2. **Automated Supplier Payouts:** Confirming regulatory and PayPal account eligibility before enabling live automated supplier disbursements.
3. **Supplier KYB & Verification:** Formalizing business verification documents (GSTIN/PAN/business license) required to upgrade a supplier from `SUPPLIER_SUBMITTED` to `VERIFIED_LIVE`.
4. **Logistics, GST & Invoicing:** Defining whether wholesalers issue individual tax invoices per participating retailer or a consolidated logistics manifest.
5. **Dispute & Returns Policy:** Establishing SLAs for damaged deliveries, post-delivery quality disputes, and chargeback handling.

---

## Appendix A — Minimum Definition of Done

The release is complete when a reviewer can run the documented application, register or sign in with seeded demo accounts, submit and confirm requirements via text and file upload, inspect AI-derived matches with uncertainty flags, compare seeded supplier offers, validate Wholesaler MOQ ($MOQ_W$), Retailer MOQ ($20\%$), and Step Multiples ($1\%$), experience both the early-MOQ lock ($₹4,800$ test) and the 72-hour under-MOQ 24-hour decision workflow, approve a versioned `PriceSnapshot`, complete a server-verified PayPal Sandbox payment, track refunds and separate `SIMULATED` supplier settlement states, and audit the full chronological history.

## Appendix B — Requirements Priority Summary

| Area | MVP Priority | Notes |
|---|---|---|
| Authentication, RBAC & Business Profiles | **Must** | `SHOP_OWNER`, `SUPPLIER`, `ADMIN`, `REVIEWER` |
| Requirement Intake (Form, Text, Upload, CSV) & User Review | **Must** | Private storage + manual fallback required |
| AI Extraction, Normalization, Matching & Under-MOQ Advisory | **Must** | Server-side adapter + strict schema validation |
| Supplier Catalogue, Provenance Badges & Quote Comparison | **Must** | Seeded demo catalogue clearly badged |
| Two-Level MOQ Engine ($MOQ_W$, $20\%$ Retailer MOQ, $1\%$ Step) | **Must** | Enforced on every pool join and quantity edit |
| 72-Hour MOQ Timer, Early Lock & Pre-Lock Edit/Withdraw Window | **Must** | Server-authoritative timestamps + injectable clock |
| 24-Hour Under-MOQ Buyer Decision Workflow (All 10 Edge Cases) | **Must** | Explicit `PROCEED` / `CANCEL`; silence is never consent |
| Deterministic Pricing Engine, Cost Allocation & $₹4,800$ Test | **Must** | Integer minor units (paise/cents) on backend |
| Versioned Price Snapshots & Explicit Participant Approval | **Must** | Automatic invalidation on material price/quantity change |
| PayPal Sandbox Checkout, Idempotency & Separate Refund Tracker | **Must** | Server-verified captures + multi-state `Refund` records |
| Separate Supplier Settlement Tracking | **Must** | Visibly labeled `SIMULATED` or `MANUAL` in MVP |
| Buyer Dashboard, Supplier Portal, Admin Workspace & Audit Logs | **Must** | Complete end-to-end operational visibility |
| Automated Unit, Integration & Playwright E2E Test Suite | **Must** | Tested in every phase before advancing |

**End of document.**