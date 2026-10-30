# Engineering Task Specification — Himanshu
**Role:** Frontend Lead — Design System, Public Marketing, Authentication, Buyer Dashboard, AI Requirement Intake & Supplier Catalogue UI  
**Assigned Tasks:** 10 Tasks (`HIM-01` to `HIM-10` out of 50 Total Tasks)

---

## 1. Zero-Collision Ownership & Parallel Work Contract

To ensure your work never collides with **Prakhar**, **Sahil**, **Srujan**, or **Sujar**, you own the following exclusive frontend directories and files:

* `client/src/index.css` & `client/tailwind.config.js`
* `client/src/components/ui/*` (Buttons, Inputs, Tables, Badges, Dialogs, Skeletons, Alerts, Tabs)
* `client/src/api/axiosClient.js`, `auth.api.js`, `requirements.api.js`, `suppliers.api.js`, `notifications.api.js`
* `client/src/context/AuthContext.jsx`, `NotificationContext.jsx`
* `client/src/layouts/PublicLayout.jsx`, `AppShellLayout.jsx`
* `client/src/pages/public/LandingPage.jsx`
* `client/src/pages/auth/LoginPage.jsx`, `RegisterPage.jsx`
* `client/src/pages/dashboard/BuyerDashboardPage.jsx`, `ProfilePage.jsx`
* `client/src/pages/requirements/RequirementsListPage.jsx`, `RequirementCreatePage.jsx`, `RequirementDetailPage.jsx`
* `client/src/pages/suppliers/SupplierCataloguePage.jsx`, `SupplierDetailPage.jsx`
* `client/src/tests/requirementsUi.test.jsx`, `client/src/tests/catalogueUi.test.jsx`

---

## 2. Detailed 10-Task Breakdown for Himanshu

### Task `HIM-01`: B2B SaaS Design System, Tailwind Theme & Accessible `shadcn/ui` Primitives
* **Exclusive Files:**
  * `client/tailwind.config.js`
  * `client/src/index.css`
  * `client/src/components/ui/*` (`Button.jsx`, `Input.jsx`, `Select.jsx`, `Table.jsx`, `Badge.jsx`, `Dialog.jsx`, `Skeleton.jsx`, `Alert.jsx`, `Tabs.jsx`, `Toast.jsx`)
* **Implementation Details:**
  1. Configure the visual direction:
     * Primary Structural Navy: `#0F172A` (`slate-900`) and `#1E293B` (`slate-800`).
     * Clean Surfaces: Warm Off-White `#F8FAFC` (`slate-50`) and Crisp White `#FFFFFF` with `#E2E8F0` borders.
     * Positive/MOQ Progress Accent: Emerald `#10B981` and Teal `#0D9488`.
     * Warning/Countdown Accent: Amber `#F59E0B`; Error/Shortfall Accent: Rose `#E11D48`.
  2. Configure `tabular-nums` utility classes for all financial and quantity columns, visible keyboard focus rings, and responsive typography.
* **Verification & Tests:** Component render test verifying accessible labels, focus states, and badge variants.

---

### Task `HIM-02`: Centralized Axios API Client, Error Interceptor, `AuthContext` & `NotificationContext`
* **Exclusive Files:**
  * `client/src/api/axiosClient.js`
  * `client/src/api/auth.api.js`
  * `client/src/api/notifications.api.js`
  * `client/src/context/AuthContext.jsx`
  * `client/src/context/NotificationContext.jsx`
* **Implementation Details:**
  1. Build `axiosClient.js` with automatic JWT Bearer token attachment, `X-Correlation-Id` generation, and normalized error extraction.
  2. Build `AuthContext.jsx` providing `user`, `profile` (`Shop` or `Supplier`), `login()`, `register()`, `logout()`, `refreshProfile()`, and role helper flags (`isShopOwner`, `isSupplier`, `isAdmin`, `isReviewer`).
  3. Build `NotificationContext.jsx` polling/fetching unread notifications and exposing `markAsRead()` and toast triggers.
* **Verification & Tests:** Unit test verifying token persistence and automatic `401 Unauthorized` session cleanup.

---

### Task `HIM-03`: Public Landing Page (`/`) & Interactive Value Proposition Showcase
* **Exclusive Files:**
  * `client/src/layouts/PublicLayout.jsx`
  * `client/src/pages/public/LandingPage.jsx`
* **Implementation Details:**
  1. Build a polished B2B SaaS landing page explaining:
     * The procurement problem **Aap Ki Dukan (CoBuy AI)** solves for small shops, kirana stores, cafés, bakeries, and restaurants.
     * How AI-assisted invoice & text requirement extraction works.
     * How the Two-Level MOQ Engine works (Wholesaler MOQ $MOQ_W$, $20\%$ Retailer MOQ $MOQ_R$, $1\%$ Step Multiples, and 72-hour pool timers).
     * How bulk price tiers unlock and how transparent paise-accurate cost allocation works (featuring an interactive preview of the $₹4,800$ calculation).
  2. Include clear **Sign In**, **Register Business**, and **Explore Demo** calls to action that connect directly into the live application.
* **Verification & Tests:** Component test verifying all navigation links and interactive tier previews render accurately.

---

### Task `HIM-04`: Authentication Pages (`/login`, `/register`) & One-Click Demo Account Switcher
* **Exclusive Files:**
  * `client/src/pages/auth/LoginPage.jsx`
  * `client/src/pages/auth/RegisterPage.jsx`
* **Implementation Details:**
  1. Build `LoginPage.jsx` with email/password validation, clear error states, and a **Quick Demo Sign-In Panel** allowing evaluators to sign in with one click as **Shop A** (*Hazratganj Café*), **Shop B** (*Gomti Bakery*), **Shop C** (*Awadh Bistro*), **Wholesaler 1** (*Bharat EcoPack*), **Admin**, or **Read-Only Reviewer**.
  2. Build `RegisterPage.jsx` collecting user name, email, password, role (`SHOP_OWNER` or `SUPPLIER`), business name, business type, delivery area, and address.
* **Verification & Tests:** RTL test verifying form validation and login submission flow.

---

### Task `HIM-05`: Authenticated Application Shell (`AppShellLayout`), Role-Based Navigation & Route Guards
* **Exclusive Files:**
  * `client/src/layouts/AppShellLayout.jsx`
* **Implementation Details:**
  1. Build the responsive sidebar and top header bar adapting links to the user's role:
     * Retailer links: Dashboard, Requirements, Supplier Catalogue, Group Buys, Orders, Payments & Refunds, Notifications, Shop Profile.
     * Wholesaler link: Supplier Portal.
     * Admin links: Admin Overview, Manage Suppliers, Manage Offers, Pool/Order Reconciliation, Audit & AI Logs.
  2. Display a visible role badge (`SHOP_OWNER`, `SUPPLIER`, `ADMIN`, `REVIEWER`) and an unread notification bell dropdown.
  3. Implement `<ProtectedRoute allowedRoles={[...]} />` redirecting unauthenticated users to `/login`.
* **Verification & Tests:** RTL test verifying role-based sidebar links and route guard redirection.

---

### Task `HIM-06`: Retailer Dashboard (`/dashboard`) & Business Profile Management (`/profile`)
* **Exclusive Files:**
  * `client/src/pages/dashboard/BuyerDashboardPage.jsx`
  * `client/src/pages/dashboard/ProfilePage.jsx`
* **Implementation Details:**
  1. Build `BuyerDashboardPage.jsx` displaying real backend data:
     * KPI summary row (Active Pools Joined, Pending Snapshot Approvals, 24h Under-MOQ Decisions Required, Total Verified Savings).
     * Active Group-Buy Pools table with MOQ progress bars and live 72h countdowns.
     * Action Required banner for any pool in `UNDER_MOQ_DECISION_PENDING` or `AWAITING_APPROVALS`.
     * Recent Requirements, Orders, and Notifications feed, plus Quick Action buttons.
  2. Build `ProfilePage.jsx` allowing shop owners and suppliers to view and edit their business profile, delivery area, and GSTIN/contact details.
* **Verification & Tests:** RTL test verifying loading skeletons, empty states, error recovery, and profile form updates.

---

### Task `HIM-07`: Purchasing Requirement Intake Page (`/requirements`, `/requirements/new`) — Form, NL Text, Upload & CSV
* **Exclusive Files:**
  * `client/src/api/requirements.api.js`
  * `client/src/pages/requirements/RequirementsListPage.jsx`
  * `client/src/pages/requirements/RequirementCreatePage.jsx`
* **Implementation Details:**
  1. Build `RequirementsListPage.jsx` showing all submitted requirements with status badges (`DRAFT`, `PROCESSING`, `NEEDS_REVIEW`, `CONFIRMED`, `FAILED_EXTRACTION`), source type icons, quantities, and quick links to match offers.
  2. Build `RequirementCreatePage.jsx` with 4 tabbed intake modes:
     * **Natural-Language Prompt:** Textarea with example prompts + "Extract with AI" button.
     * **Invoice / Document Upload:** Drag-and-drop uploader (`PDF`, `PNG`, `JPG`, `WEBP` $\le 10\text{ MB}$) showing selected filename, upload progress bar, and AI extraction trigger.
     * **Structured Form:** Direct manual entry of all product and delivery attributes.
     * **CSV Bulk Import:** Upload repeatable purchasing CSV templates.
* **Verification & Tests:** RTL test verifying file type/size client validation, upload status feedback, and manual entry submission.

---

### Task `HIM-08`: AI Extraction Review, Uncertainty Diff & Confirmation Page (`/requirements/:requirementId`)
* **Exclusive Files:**
  * `client/src/pages/requirements/RequirementDetailPage.jsx`
  * `client/src/tests/requirementsUi.test.jsx`
* **Implementation Details:**
  1. Visually distinguish **AI-Extracted Fields** from **User-Confirmed Fields** (**FR-AI-004**).
  2. Highlight any field listed in `uncertainFields` or missing (`null`) with an Amber warning badge requiring human verification.
  3. Display AI confidence score and extraction provenance (Live AI vs. Demo Fallback Mode).
  4. Provide explicit **Save as Draft**, **Confirm Requirement** (unlocking pool creation/joining), and **Reject** buttons, plus a manual fallback editor if AI extraction failed.
  5. Once `CONFIRMED`, display the inline panel of **Compatible Supplier Offers & Matching Explanations** returned by `GET /api/offers/search?requirementId=...`.
* **Verification & Tests:** RTL test verifying that unconfirmed requirements cannot join pools until the user edits missing fields and clicks **Confirm Requirement**.

---

### Task `HIM-09`: Supplier Catalogue, Provenance Badges & Side-by-Side Offer Comparison Page (`/suppliers`)
* **Exclusive Files:**
  * `client/src/api/suppliers.api.js`
  * `client/src/pages/suppliers/SupplierCataloguePage.jsx`
  * `client/src/tests/catalogueUi.test.jsx`
* **Implementation Details:**
  1. Build `SupplierCataloguePage.jsx` with search, category filter, delivery area filter, MOQ filter, and sorting (lowest landed cost, lowest MOQ, freshest quote).
  2. Display clear data provenance badges on every offer (`DEMO SAMPLE DATA` vs. `SUPPLIER SUBMITTED` vs. `VERIFIED LIVE`) and quote expiry timestamps.
  3. Display each offer's **Wholesaler MOQ ($MOQ_W$)**, **Retailer Minimum MOQ ($20\% \rightarrow MOQ_R$)**, **Step Multiple ($1\% \rightarrow \text{Step}$)**, and quantity price tiers.
  4. Build an interactive **Side-by-Side Offer Comparison Drawer/Table** (`POST /api/offers/compare`) comparing up to $4$ offers across unit tiers, shipping terms, tax inclusion/exclusion, lead time, and AI trade-off summary.
* **Verification & Tests:** RTL test verifying offer filtering, comparison table rendering, and provenance badge visibility.

---

### Task `HIM-10`: Supplier Detail Page & Custom Quote Request Modal (`/suppliers/:supplierId`)
* **Exclusive Files:**
  * `client/src/pages/suppliers/SupplierDetailPage.jsx`
* **Implementation Details:**
  1. Display full supplier profile, service areas, verification status, and complete table of active product offers.
  2. Build the **Request Custom / Updated Quote Modal** (`POST /api/quotes/requests`) allowing shop owners to request custom pricing when a quote is expired or when no existing offer fits their quantity/delivery constraints.
  3. Provide direct **"Start Group-Buy Pool with This Offer"** action linking to `/group-buys/create?offerId=...`.
* **Verification & Tests:** RTL test verifying supplier detail rendering and custom quote form submission.