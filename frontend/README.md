# AutoApply customer client

This is the customer-facing React + TypeScript application. The restricted operations console is a separate application in `admin-console/`.

## Local development

```powershell
npm ci
Copy-Item .env.example .env.local
npm run dev
```

The Vite client runs at `http://localhost:5173`. Set `VITE_API_BASE_URL` to the API origin including its `/v1` prefix, for example `http://localhost:3000/v1`. This variable is public in the browser bundle; never put credentials or API secrets in it.

## Backend integration

The client uses the existing NestJS API for signup (`POST /auth/signup`), OTP delivery and verification (`POST /auth/otp/send`, `/auth/otp/verify`), password login, user profile and job preferences, job discovery, application preparation/approval, subscriptions, referrals, and the dashboard. Requests include credentials. Browser access and refresh tokens are stored in HttpOnly cookies; access-token refresh is retried once after an unauthorized response.

The backend accepts the configured client origin through `CORS_ORIGIN`. For production, use HTTPS, set the exact deployed origins, replace all development credentials, apply database migrations, and publish approved legal/policy content before onboarding users. Admin data is served by the separate operations API and is never bundled into this app.

## Current service boundaries

- Applications remain server-authoritative. The client can start preparation, provide the exact missing form answers, and approve/decline an application; it never reports an application as submitted based only on a click.
- Billing checkout redirects only to the payment URL returned by the backend/provider. Invoice history is currently unavailable from the backend.
- The backend does not currently implement arbitrary job-link intake, resume upload/processing, notifications, legal policy publishing, connected accounts, or tailored resume generation. Those screens are not substitutes for working service behavior; these capabilities must not be advertised as live until implemented and validated.
- Legal pages intentionally do not invent terms. Supply approved content through a future backend legal-content source before production launch.

## Build

```powershell
npm run build
```

The app uses React Router; the production web server must serve the SPA entry point for client-side routes while forwarding `/v1` requests to the API.
