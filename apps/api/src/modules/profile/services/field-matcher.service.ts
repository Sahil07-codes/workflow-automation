import { Injectable } from '@nestjs/common';
import { AnswerBankService } from './answer-bank.service';

export interface MatchableFormField {
  id: string;
  name: string;
  label: string;
  type: string;
  required: boolean;
  options?: string[];
  placeholder?: string;
}

export interface FieldMatchResult {
  field_id: string;
  field_name: string;
  matched_value: unknown;
  source: 'profile' | 'answer_bank' | 'unknown';
  confidence: number;
  reason: string;
  requires_user_input: boolean;
}

@Injectable()
export class FieldMatcherService {
  private readonly profileAliases: Record<string, string[]> = {
    first_name: ['first_name', 'firstname', 'given_name', 'fname'],
    last_name: ['last_name', 'lastname', 'family_name', 'lname'],
    email: ['email', 'email_address', 'contact_email'],
    phone: ['phone', 'phone_number', 'mobile', 'mobile_number'],
    location: ['location', 'city', 'hometown', 'current_location'],
    years_of_experience: ['years_of_experience', 'experience_years', 'years_exp'],
    current_company: ['current_company', 'company_name', 'employer'],
    current_role: ['current_role', 'job_title', 'position'],
    linkedin_url: ['linkedin', 'linkedin_url', 'linkedin_profile'],
    github_url: ['github', 'github_url', 'github_profile'],
    portfolio_url: ['portfolio', 'portfolio_url', 'website'],
  };

  constructor(private readonly answerBank: AnswerBankService) {}

  async matchField(
    field: MatchableFormField,
    userId: string,
    profile: Record<string, unknown>,
  ): Promise<FieldMatchResult> {
    const terms = [field.name, field.label, field.placeholder ?? '']
      .join(' ')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_');
    const flattened = this.flattenProfile(profile);

    for (const [profileKey, aliases] of Object.entries(this.profileAliases)) {
      if (!aliases.some((alias) => terms.includes(alias))) continue;
      const value = flattened.get(profileKey) ??
        aliases.map((alias) => flattened.get(alias)).find((item) => item !== undefined);
      if (value !== undefined && value !== null && value !== '') {
        return {
          field_id: field.id,
          field_name: field.name,
          matched_value: value,
          source: 'profile',
          confidence: 0.95,
          reason: `Matched profile field ${profileKey}`,
          requires_user_input: false,
        };
      }
    }

    const answer = (await this.answerBank.findSimilarAnswers(userId, field.label, 1))[0];
    if (answer) {
      return {
        field_id: field.id,
        field_name: field.name,
        matched_value: answer.answer,
        source: 'answer_bank',
        confidence: answer.confidence,
        reason: `Matched answer to "${answer.questionText}"`,
        requires_user_input: false,
      };
    }

    return {
      field_id: field.id,
      field_name: field.name,
      matched_value: null,
      source: 'unknown',
      confidence: 0,
      reason: 'No profile or answer-bank match',
      requires_user_input: field.required,
    };
  }

  private flattenProfile(
    profile: Record<string, unknown>,
    prefix = '',
    result = new Map<string, unknown>(),
  ): Map<string, unknown> {
    for (const [key, value] of Object.entries(profile)) {
      const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]+/g, '_');
      const path = prefix ? `${prefix}_${normalizedKey}` : normalizedKey;
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        this.flattenProfile(value as Record<string, unknown>, path, result);
      } else if (value !== null && value !== undefined) {
        result.set(path, value);
        result.set(normalizedKey, value);
      }
    }
    return result;
  }
}
