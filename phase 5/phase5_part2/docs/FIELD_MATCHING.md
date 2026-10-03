# Field Matching Strategy

## Overview

Field matching is the process of automatically filling form fields with data from the user's profile or answer bank.

## Three-Step Matching Process

### Step 1: Deterministic Matching (Confidence: 0.95-0.99)

Exact pattern matching against known field names.

**Examples:**
- `first_name` → profile.firstName
- `email` → profile.email
- `phone` → profile.phone
- `years_of_experience` → profile.yearsOfExperience

**Supported Patterns:**
- 30+ common field name patterns
- Case-insensitive matching
- Works with underscores, camelCase, spaces

### Step 2: Answer Bank Lookup (Confidence: 0.70-0.85)

Fuzzy string matching against user's stored answers.

**Example:**
- Form field: "Tell us about your current role"
- Stored answer: "Senior Software Engineer at TechCorp"
- Confidence: 0.78 (78% similar)

**Implementation:**
- Levenshtein distance algorithm
- Minimum threshold: 0.75 similarity
- Up to 10 recent answers checked

### Step 3: Unknown Fields (Confidence: 0.00)

Fields that couldn't be matched by Steps 1 or 2.

**Examples:**
- "What is your visa sponsorship status?"
- "Earliest start date?"
- "Why are you interested in this role?"

**Action:**
- Mark as `requires_user_input: true`
- Flag for escalation
- Send urgent notification to user

## Field Mapping Reference

| Pattern | Profile Field | Confidence |
|---------|---------------|------------|
| first_name, firstname | firstName | 0.99 |
| last_name, lastname | lastName | 0.99 |
| email | email | 0.99 |
| phone | phone | 0.98 |
| location, city | location | 0.95 |
| years_of_experience | yearsOfExperience | 0.92 |
| current_company | currentCompany | 0.88 |
| current_role | currentRole | 0.88 |
| linkedin | linkedinUrl | 0.90 |
| github | githubUrl | 0.90 |

## Integration Example

```typescript
const matcher = new FieldMatcherService(prisma);

const field = {
  id: 'field-1',
  name: 'email_address',
  label: 'Email',
  type: 'email',
  required: true,
};

const result = await matcher.matchField(field, userId, profile);

if (result.requires_user_input) {
  // Ask user to fill this field
  await sendEscalationEmail(userId, field, result.reason);
} else {
  // Use matched value
  await fillFormField(formId, field.id, result.matched_value);
}
```
