import Anthropic from '@anthropic-ai/sdk';
import { EmbeddingService } from './embedding.service';
import { NormalizedJob, DiscoveryQuery } from '@autoapply/shared/schemas/jobs.schema';

interface UserPreferences {
  minSalary?: number;
  excludedCompanies: string[];
  locations: string[];
  minMatchScore: number;
  roles: string[];
}

interface ScoreResult {
  score: number;
  reasons: string[];
  missingSkills: string[];
}

/**
 * MatchScoringService - implements multi-stage filtering and scoring pipeline
 * Stage 1: Hard filters (location, salary, excluded companies)
 * Stage 2: Embedding similarity (pgvector cosine similarity)
 * Stage 3: LLM scoring (only for high-embedding candidates)
 */
export class MatchScoringService {
  private client: Anthropic;
  private embeddingService: EmbeddingService;
  private embeddingSimilarityThreshold: number;
  private llmScoringEnabled: boolean;

  constructor(
    apiKey: string,
    embeddingService: EmbeddingService,
    embeddingSimilarityThreshold: number = 0.65,
    llmScoringEnabled: boolean = true,
  ) {
    this.client = new Anthropic({ apiKey });
    this.embeddingService = embeddingService;
    this.embeddingSimilarityThreshold = embeddingSimilarityThreshold;
    this.llmScoringEnabled = llmScoringEnabled;
  }

  /**
   * Score a job against user preferences
   * Returns null if job fails hard filters or scoring, undefined if below threshold
   */
  async scoreJob(job: NormalizedJob, userPreferences: UserPreferences, userProfileSummary: string): Promise<ScoreResult | null> {
    // Stage 1: Hard filters (cheap, fast)
    const hardFilterResult = this.applyHardFilters(job, userPreferences);
    if (!hardFilterResult.passed) {
      return null; // Job fails hard filters - don't score further
    }

    // Stage 2: Embedding similarity (medium cost)
    const jobEmbedding = await this.embeddingService.embed(job.jdText || job.title);
    const profileEmbedding = await this.embeddingService.embed(userProfileSummary);
    const similarity = this.embeddingService.cosineSimilarity(jobEmbedding, profileEmbedding);

    if (similarity < this.embeddingSimilarityThreshold) {
      return null; // Job doesn't meet embedding threshold
    }

    // Stage 3: LLM scoring (expensive - only for high-embedding candidates)
    if (this.llmScoringEnabled) {
      try {
        const llmScore = await this.scoringWithLLM(job, userPreferences, userProfileSummary, similarity);
        return llmScore;
      } catch (error) {
        console.warn(`LLM scoring failed for job ${job.externalId}:`, error);
        // Fallback: use embedding similarity as score (0-100 scale)
        return {
          score: Math.round(similarity * 100),
          reasons: ['Embedding-based similarity scoring (LLM unavailable)'],
          missingSkills: [],
        };
      }
    }

    // Fallback: return embedding-based score
    return {
      score: Math.round(similarity * 100),
      reasons: ['Embedding-based similarity scoring'],
      missingSkills: [],
    };
  }

  // ============ PRIVATE HELPERS ============

  private applyHardFilters(job: NormalizedJob, prefs: UserPreferences): { passed: boolean; reasons: string[] } {
    const failures: string[] = [];

    // Filter 1: Location
    if (prefs.locations.length > 0 && job.location) {
      const jobLocNorm = this.normalizeText(job.location);
      const matchesLocation = prefs.locations.some((loc) => this.normalizeText(loc) === jobLocNorm || jobLocNorm.includes(this.normalizeText(loc)));
      if (!matchesLocation) {
        failures.push(`Location "${job.location}" not in preferences`);
      }
    }

    // Filter 2: Salary floor
    if (prefs.minSalary && job.salaryMin && job.salaryMin < prefs.minSalary) {
      failures.push(`Salary ${job.salaryMin} below minimum ${prefs.minSalary}`);
    }

    // Filter 3: Excluded companies
    if (prefs.excludedCompanies.length > 0) {
      const jobCompanyNorm = this.normalizeText(job.company);
      const isExcluded = prefs.excludedCompanies.some(
        (exc) => this.normalizeText(exc) === jobCompanyNorm || jobCompanyNorm.includes(this.normalizeText(exc)),
      );
      if (isExcluded) {
        failures.push(`Company "${job.company}" is in exclude list`);
      }
    }

    return {
      passed: failures.length === 0,
      reasons: failures,
    };
  }

  private async scoringWithLLM(job: NormalizedJob, prefs: UserPreferences, userProfile: string, embeddingSimilarity: number): Promise<ScoreResult> {
    const prompt = `You are a job matching expert. Analyze how well this job matches the candidate's profile and preferences.

CANDIDATE PROFILE:
${userProfile}

TARGET ROLES: ${prefs.roles.join(', ')}

JOB DETAILS:
Title: ${job.title}
Company: ${job.company}
Location: ${job.location || 'Not specified'}
Salary: ${job.salaryMin ? `₹${job.salaryMin}` : 'Not specified'} - ${job.salaryMax ? `₹${job.salaryMax}` : 'Not specified'}
Employment Type: ${job.employmentType || 'Not specified'}
Description: ${(job.jdText || '').slice(0, 2000)}

EMBEDDING SIMILARITY SCORE: ${Math.round(embeddingSimilarity * 100)}/100

Provide a JSON response with:
{
  "score": <0-100 integer>,
  "reasons": [<array of 2-3 reasons for this score as strings>],
  "missingSkills": [<array of key skills the candidate lacks>]
}

Rules:
- Score only based on explicit facts in the profile and job description
- Do NOT invent experience or skills the candidate doesn't have
- Consider role match, location, and salary fit
- Return valid JSON only, no additional text`;

    const response = await this.client.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 300,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '';

    try {
      // Extract JSON from response (handle markdown code blocks)
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('No JSON found in response');

      const result = JSON.parse(jsonMatch[0]);

      return {
        score: Math.max(0, Math.min(100, parseInt(result.score, 10) || 0)),
        reasons: Array.isArray(result.reasons) ? result.reasons : [],
        missingSkills: Array.isArray(result.missingSkills) ? result.missingSkills : [],
      };
    } catch (error) {
      console.error('Failed to parse LLM scoring response:', text, error);
      throw error;
    }
  }

  private normalizeText(text: string): string {
    return text
      .toLowerCase()
      .trim()
      .replace(/\s+/g, ' ')
      .replace(/[^\w\s]/g, '');
  }
}
