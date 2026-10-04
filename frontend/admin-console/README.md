# AutoApply Admin Console

This is a **separate frontend application** for authorized owner/operations users. It is not bundled into the customer client, and it does not contain server or backend code.

## Run

```powershell
Copy-Item .env.example .env.local
npm ci
npm run dev
```

The console runs at `http://localhost:5180`. It is a separate frontend build from the customer client. Build it with `npm run build`.

## Backend contract

The console uses credentialed requests to the existing service:

- `GET /admin/overview` for database-backed metrics and the application funnel.
- `GET /admin/users`, `/admin/applications`, `/admin/subscriptions`, `/admin/referrals`, `/admin/adapters`, `/admin/flags`, and `/admin/audit-log` for paginated operational lists.
- Lists accept `q`, `status`, and `cursor`; results may be arrays or objects containing `items`, `results`, `records`, or the collection-specific property, with optional `pagination.next_cursor` / `previous_cursor`.
- Optional mutations must arrive as server-provided `actions` descriptors with a same-service `/admin/` `endpoint`, `method` (`POST`, `PATCH`, or `DELETE`), `name`, `label`, and `enabled` flag. Optional `confirmation_required`, `reason_required`, `description`, and `payload` fields control the UI. Confirmation and reason prompts follow those descriptors.

The backend exposes read-only operational endpoints to `ADMIN` and `SUPERADMIN` accounts and returns server-derived data; admin accounts must be provisioned by an authorized operator. The current event log shows application lifecycle events, not an audit of administrator actions. No analytics, pricing, referral awards, or subscription changes are fabricated in this UI. The console does not provide an admin login or role switch and cannot grant access. Configure the backend's exact CORS origin list and secure cookie settings for this separate app origin. Admin actions are deliberately unavailable until they have audited server implementations.
