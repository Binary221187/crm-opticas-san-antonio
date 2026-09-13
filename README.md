# Ópticas San Antonio · CRM

Private multi-branch CRM built with React, Vinext, Cloudflare Workers and D1.

## First use

Open the private Site through the owning ChatGPT account. Create the first developer account with a username and password (12+ characters). No default credentials or patient samples are seeded. Add branches, users, products and patients. App accounts supplement the Sites access gate; team members must also be allowed by the Site access policy before they can reach the application.

Roles: developer, administrator, medical technologist, seller/cashier and assembly technician. Developers assign module permissions and branch scopes. Developer access covers all branches. Module permission grants read/write access; clinical access is separate. Clinical edits are restricted to the author or developer. Assembly staff can be assigned multiple branches.

## Implemented

- Persistent patient CRUD, linked-record deletion protection and deactivation.
- Clinical encounters, history, free-text OD/OI prescription, diagnosis and follow-up.
- Visual seven-day calendar, create/edit/cancel, provider overlap checks.
- Inventory by branch, stock thresholds and CLP prices.
- POS numeric keypad, quantities, discounts, payment method, cash received/change, internal printable receipt and sales history.
- Lab status board with timestamped transitions.
- User management, hashed passwords, expiring HttpOnly sessions, lockout and server-side authorization.

## Persistence and concurrency

D1 stores users, hashed sessions and one versioned JSON workspace document. Writes to business records use an optimistic version compare-and-swap; a sale and its stock deductions are committed together. Sale keys prevent duplicate retries. This is a bounded first release for a small workspace, not a large-volume clinical system: growing workloads should migrate the JSON workspace to relational business tables. Migrations in drizzle are schema-only. Production data is never seeded by tests.

## Verification

- `node tests/crm.mjs`: real route logic against isolated in-memory SQLite and simulated platform identity/cookies; verifies role and branch boundaries, clinical visibility, CSRF, appointment overlap, stock, duplicate and concurrent sale requests, linked patient protection, lockout and lab transitions.
- `node node_modules/typescript/bin/tsc --noEmit`
- Build through Sites build helper; preserve the managed execution profile.

No browser/end-to-end QA or supported WebMCP runtime was available under this task's browser permissions. The optional navigate_crm tool was source checked only. Tests do not prove hosted end-to-end behavior.

## Operational limits

Receipts are internal only; no SII electronic tax document, payment gateway, WhatsApp connector or automated backups are included. This release has not undergone an independent clinical-data security/compliance audit or load testing. Validate with test records before using real patient information. Shared usage requires configuring Site access for the intended staff. Do not make it public to bypass that step.

## V2 additions

- Granular module/action permissions stored compatibly with legacy V1 permission arrays. Existing grants are preserved; changing a role in the developer form applies its current preset. New assembly users get inventory read and movement create/read access.
- Medical technologists manage their own weekly slots and date overrides only in assigned branches. Developers can manage all schedules. New or rescheduled appointments must fit availability; cancelling/reactivating and overlap checks are enforced server-side. Schedule changes that invalidate existing future bookings are rejected.
- Patient age and WhatsApp reminder consent; clinical encounters preserve identity and age at the appointment, prior prescription, OD/OI, ADD, DP, visual acuity OD/OI and observations.
- Branch logos in R2. Browser resizes raster images to at most 512px; server checks permissions, branch scope, size and PNG/JPEG/WebP signatures. Logo metadata uses the same optimistic workspace commit; failed writes clean up new blobs.
- WhatsApp reminders are prepared for manual send with wa.me. Staff explicitly record the send and patient confirmation. No automatic sender, webhook or scheduled automation is connected. No messages were sent while developing.
- Append-only inventory movements for receipts, consumption associated with orders and sales. Stock updates are atomic with movements. Lab notes are timestamped; browser polls every 5 seconds while visible and shows changes. No push delivery when the app is closed.
- Three reversible device-local appearance previews: Clínica Clara, San Antonio Signature, Óptica Studio. Original style remains the default.

The V2 source is saved for review; publishing an update to the existing live Site is a separate step. No production schema migration is required for these JSON document additions. The R2 binding must be provisioned when V2 is deployed.
