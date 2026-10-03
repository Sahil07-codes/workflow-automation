# Approval Workflow

## Overview

The approval workflow ensures users review and approve applications before submission.

## Flow Diagram

```
Form Filled
    ↓
Screenshot Taken
    ↓
Payload Encrypted
    ↓
Hash Computed
    ↓
Approval Email Sent
    ↓
User Clicks Link
    ↓
Token Verified
    ↓
Application Approved
    ↓
Submit to Employer
```

## Token Security

### Token Generation

- 32 random bytes → 64 hex characters
- Never stored in plaintext
- Only the SHA-256 hash is stored

### Token Verification

- Constant-time comparison (prevents timing attacks)
- Check expiry (48 hours)
- Check not already used
- Check applicationId matches

### Token Expiry

- Default: 48 hours
- Configurable per deployment
- Automatic cleanup of expired tokens

## Email Preview

The approval email includes:
- Job details (company, title, location)
- Match score
- Form preview (field values)
- Screenshot of filled form
- Approve/Escalate/Decline buttons
- Security information

## API Integration

```
GET /v1/applications/{appId}/approve?token={plaintext_token}
├─ Hash token
├─ Verify against stored hash
├─ Check expiry & usage
├─ Mark as used
├─ Update application state
└─ Enqueue submission job

Response:
{
  "state": "APPROVED",
  "approved_at": "2026-10-03T10:45:00Z",
  "message": "Submitted to employer"
}
```

## Failure Scenarios

| Scenario | Response | Action |
|----------|----------|--------|
| Token expired | 401 Unauthorized | Resend approval email |
| Token already used | 409 Conflict | User already approved |
| Token invalid | 401 Unauthorized | Check email link |
| Application not found | 404 Not Found | Contact support |
