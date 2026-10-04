# AutoApply — Page-by-Page Frontend Prompt Pack v2

Generated from the uploaded AutoApply Product & Architecture Design Document and the corrected repository-agnostic build approach.

## Rules for use

1. Give the coding agent the repository and **one prompt at a time** in the order below.
2. Before implementation, it must inspect the repository; it must not assume whether backend/API/auth/database functionality exists.
3. If functionality exists, integrate it. If missing, create a clean frontend contract instead of fake behavior.
4. Do not move to the next prompt until the current page is implemented, tested, and visually checked.
5. Use the shared AutoApply color system in every page. Blue is primary, green success, amber attention, red error, restrained purple accent.
6. Do not invent product facts, pricing, quotas, integrations, job sources, testimonials, user counts, or legal content.

## Route/page count

**Total prompt files: 52**

### Public + Auth
01 Landing, 02 Signup, 03 Email Verification, 04 Mobile Verification, 05 Google Reconciliation, 06 Account Verified, 07 Login
### Onboarding
08 Shell, 09 Resume Upload, 10 Resume Processing, 11 Extraction Review, 12 Missing Information, 13 Job Preferences, 14 Profile Review
### Core Product
15 Dashboard, 16 Job Discovery, 17 Job Details, 18 Applications List, 19 Application Detail, 20 Preparation, 21 Needs Input, 22 Approval, 23 Batch Approval, 24 Manual Assist
### User Management
25 Profile, 26 Resume, 27 Preferences, 28 Answer Bank, 29 Notifications, 30 Billing, 31 Referrals, 32 Settings, 33 Security/Sessions, 34 Privacy/Data Controls
### Public Legal + Special Entry
35 Privacy, 36 Terms, 37 Refunds, 38 Referral Landing, 39 Approval Link Landing
### Admin / Support
40 Admin Dashboard, 41 Users, 42 User Detail, 43 Applications, 44 Application Detail, 45 Adapters, 46 Feature Flags, 47 Audit Log
### Phase 2 / Gated
48 Connected Accounts, 49 Connected-Account Consent, 50 Tailored Resume Generator, 51 Tailored Resume Preview, 52 Server-Side Dummy Account Mode

## Important source alignment

Core product rules: approval before submission, never guess unknown fields, answer bank, job discovery, matching/preparation, application states, billing, referrals, admin/support, and Phase 2 modules are defined in the product design document. The document also defines the backend-oriented architecture/API surface; the prompts intentionally do not assume those implementations are already present in the current repository.

## Suggested build cadence

Build one page → run tests/typecheck/lint/build → inspect in browser → fix → freeze → next page. Do not build all 52 prompts in one giant generation request.