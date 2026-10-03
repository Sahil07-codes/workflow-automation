import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import * as crypto from 'crypto';

export interface MatchResult {
  field_id: string;
  field_name: string;
  matched_value: any;
  source: 'profile' | 'answer_bank' | 'llm' | 'unknown';
  confidence: number;
  reason: string;
  requires_user_input: boolean;
}

export interface FormField {
  id: string;
  name: string;
  label: string;
  type: string;
  required: boolean;
  options?: string[];
  placeholder?: string;
}

@Injectable()
export class FieldMatcherService {
  private logger = new Logger(FieldMatcherService.name);

  private readonly fieldMappings = {
    'first_name|firstname|given_name|fname': {
      profile_field: 'firstName',
      extractor: (profile: any) => profile.firstName,
      confidence: 0.99,
    },
    'last_name|lastname|family_name|lname': {
      profile_field: 'lastName',
      extractor: (profile: any) => profile.lastName,
      confidence: 0.99,
    },
    'email|email_address|contact_email|e-mail': {
      profile_field: 'email',
      extractor: (profile: any) => profile.email,
      confidence: 0.99,
    },
    'phone|phone_number|mobile|mobile_number|contact_phone': {
      profile_field: 'phone',
      extractor: (profile: any) => profile.phone,
      confidence: 0.98,
    },
    'location|city|hometown|current_location': {
      profile_field: 'location',
      extractor: (profile: any) => profile.location,
      confidence: 0.95,
    },
    'years_of_experience|experience_years|years_exp|experience_level': {
      profile_field: 'yearsOfExperience',
      extractor: (profile: any) => Math.ceil(profile.yearsOfExperience),
      confidence: 0.92,
    },
    'current_company|company_name|employer|company': {
      profile_field: 'currentCompany',
      extractor: (profile: any) => profile.currentCompany,
      confidence: 0.88,
    },
    'current_role|job_title|position|role': {
      profile_field: 'currentRole',
      extractor: (profile: any) => profile.currentRole,
      confidence: 0.88,
    },
    'linkedin|linkedin_url|linkedin_profile': {
      profile_field: 'linkedinUrl',
      extractor: (profile: any) => profile.linkedinUrl,
      confidence: 0.90,
    },
    'github|github_url|github_profile': {
      profile_field: 'githubUrl',
      extractor: (profile: any) => profile.githubUrl,
      confidence: 0.90,
    },
    'portfolio|portfolio_url|website': {
      profile_field: 'portfolioUrl',
      extractor: (profile: any) => profile.portfolioUrl,
      confidence: 0.85,
    },
  };

  constructor(private prisma: PrismaService) {}

  async matchField(
    field: FormField,
    userId: string,
    profile: any,
  ): Promise<MatchResult> {
    // Step 1: Try deterministic matching
    const deterministicMatch = await this.matchFieldDeterministic(field, profile);
    if (deterministicMatch) {
      this.logger.debug(`Deterministic match for field: ${field.name}`);
      return deterministicMatch;
    }

    // Step 2: Try answer bank
    const answerBankMatch = await this.matchFieldAnswerBank(field, userId);
    if (answerBankMatch && answerBankMatch.confidence >= 0.75) {
      this.logger.debug(`Answer bank match for field: ${field.name}`);
      return answerBankMatch;
    }

    // Step 3: LLM matching would go here (stubbed for now)
    // For production, integrate Claude API

    // Step 4: Unknown field
    return {
      field_id: field.id,
      field_name: field.name,
      matched_value: null,
      source: 'unknown',
      confidence: 0,
      reason: 'Could not match field to profile or answer bank',
      requires_user_input: true,
    };
  }

  private async matchFieldDeterministic(
    field: FormField,
    profile: any,
  ): Promise<MatchResult | null> {
    const fieldNameLower = field.name.toLowerCase().trim();
    const fieldLabelLower = field.label.toLowerCase().trim();

    for (const [pattern, mapping] of Object.entries(this.fieldMappings)) {
      const patterns = pattern.split('|');
      for (const p of patterns) {
        if (fieldNameLower.includes(p) || fieldLabelLower.includes(p)) {
          const value = mapping.extractor(profile);

          if (value !== null && value !== undefined && value !== '') {
            return {
              field_id: field.id,
              field_name: field.name,
              matched_value: value,
              source: 'profile',
              confidence: mapping.confidence,
              reason: `Deterministic match for pattern "${p}"`,
              requires_user_input: false,
            };
          }
        }
      }
    }

    return null;
  }

  private async matchFieldAnswerBank(
    field: FormField,
    userId: string,
  ): Promise<MatchResult | null> {
    try {
      const answers = await this.prisma.answerBank.findMany({
        where: { userId },
        take: 10,
      });

      for (const answer of answers) {
        const similarity = this.calculateSimilarity(
          field.label.toLowerCase(),
          answer.questionText.toLowerCase(),
        );

        if (similarity > 0.75) {
          return {
            field_id: field.id,
            field_name: field.name,
            matched_value: answer.answer,
            source: 'answer_bank',
            confidence: 0.7 + similarity * 0.15,
            reason: `Answer bank match for question: "${answer.questionText}"`,
            requires_user_input: false,
          };
        }
      }
    } catch (error) {
      this.logger.error(`Answer bank lookup failed: ${error.message}`);
    }

    return null;
  }

  private calculateSimilarity(str1: string, str2: string): number {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;

    if (longer.length === 0) return 1.0;

    const editDistance = this.levenshtein(longer, shorter);
    return (longer.length - editDistance) / longer.length;
  }

  private levenshtein(s1: string, s2: string): number {
    const costs: number[] = [];
    for (let k = 0; k <= s1.length; k++) costs[k] = k;

    for (let i = 1; i <= s2.length; i++) {
      costs[0] = i;
      let nw = i - 1;

      for (let j = 1; j <= s1.length; j++) {
        const cj = Math.min(
          1 + Math.min(costs[j], costs[j - 1]),
          nw + (s1[j - 1] === s2[i - 1] ? 0 : 1),
        );
        nw = costs[j];
        costs[j] = cj;
      }
    }

    return costs[s1.length];
  }
}
