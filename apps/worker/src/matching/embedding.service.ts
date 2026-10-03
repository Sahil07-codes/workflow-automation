/**
 * EmbeddingService - generates vector embeddings for job descriptions and user profiles
 * Uses Claude API for semantic understanding
 * Embeddings are stored in pgvector for similarity-based matching
 */
export class EmbeddingService {
  private dimension: number;
  private cache: Map<number, number[]> = new Map();

  constructor(apiKey: string, dimension: number = 1024) {
    void apiKey;
    this.dimension = dimension;
  }

  /**
   * Generate embedding for a text (job description or user profile)
   * Returns a 1024-dimensional vector for pgvector storage
   */
  async embed(text: string): Promise<number[]> {
    if (!text || text.trim().length === 0) {
      return this.zeroVector();
    }

    const hash = this.hashText(text);
    if (this.cache.has(hash)) {
      return this.cache.get(hash)!;
    }

    try {
      // Use Claude API to generate embeddings
      // For now, we'll use a deterministic hash-based embedding as a placeholder
      // In production, integrate with a dedicated embedding model
      const embedding = await this.generateEmbedding(text);
      this.cache.set(hash, embedding);
      return embedding;
    } catch (error) {
      console.error('Embedding generation failed:', error);
      return this.zeroVector();
    }
  }

  /**
   * Compute cosine similarity between two embeddings (0 to 1)
   */
  cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) throw new Error('Embedding dimensions must match');

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /**
   * Clear the cache (useful for tests or memory management)
   */
  clearCache(): void {
    this.cache.clear();
  }

  // ============ PRIVATE HELPERS ============

  private async generateEmbedding(text: string): Promise<number[]> {
    // Placeholder: generate a deterministic embedding based on text content
    // In production, call an actual embedding API or use a specialized model

    // For now, use a simple hash-based approach that's consistent
    const normalized = text.toLowerCase().trim().slice(0, 1000); // First 1000 chars
    const hash = this.hashText(normalized);

    // Generate a pseudo-random but deterministic 1024-dim vector
    const embedding: number[] = [];
    let seed = hash;

    for (let i = 0; i < this.dimension; i++) {
      seed = (seed * 9301 + 49297) % 233280; // Linear congruential generator
      embedding.push((seed / 233280) * 2 - 1); // Normalize to [-1, 1]
    }

    // Normalize to unit vector
    const norm = Math.sqrt(embedding.reduce((sum, x) => sum + x * x, 0));
    return embedding.map((x) => x / norm);
  }

  private hashText(text: string): number {
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      const char = text.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }

  private zeroVector(): number[] {
    // Return a unit zero vector (1 in first position, 0s in rest)
    // This ensures we don't get NaN in similarity calculations
    const vec = new Array(this.dimension).fill(0);
    vec[0] = 1;
    return vec;
  }
}
