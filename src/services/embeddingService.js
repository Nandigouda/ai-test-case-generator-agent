// embeddingService.js
// Enhanced embedding service extracted and improved from embeddings.js
const axios = require('axios');
const logger = require('../../config/logger');

class EmbeddingService {
  constructor() {
    this.apiKey = process.env.AZURE_OPENAI_API_KEY;
    this.endpoint = process.env.AZURE_OPENAI_ENDPOINT;
    this.deployment = process.env.AZURE_OPENAI_EMBEDDINGS_DEPLOYMENT || 'text-embedding-ada-002';
    this.cache = new Map(); // Simple in-memory cache
  }

  /**
   * Generate embedding for text using Azure OpenAI
   * @param {string} text - Text to generate embedding for
   * @param {boolean} useCache - Whether to use caching (default: true)
   * @returns {Promise<number[]>} 1536-dimensional vector
   */
  async generateEmbedding(text, useCache = true) {
    if (!text || text.trim() === '') {
      throw new Error('Text cannot be empty for embedding generation');
    }

    // Check cache first
    const cacheKey = this._getCacheKey(text);
    if (useCache && this.cache.has(cacheKey)) {
      logger.debug('Using cached embedding for text');
      return this.cache.get(cacheKey);
    }

    try {
      const url = `${this.endpoint}/openai/deployments/${this.deployment}/embeddings?api-version=2023-05-15`;
      const headers = {
        'api-key': this.apiKey,
        'Content-Type': 'application/json'
      };
      
      const data = { 
        input: text.trim(),
        model: this.deployment 
      };
      
      logger.debug(`Generating embedding for text length: ${text.length}`);
      const response = await axios.post(url, data, { headers });
      
      const embedding = response.data.data[0].embedding;
      
      // Cache the result
      if (useCache) {
        this.cache.set(cacheKey, embedding);
      }
      
      logger.debug(`Generated embedding with ${embedding.length} dimensions`);
      return embedding;
      
    } catch (error) {
      logger.error(`Azure OpenAI embeddings failed: ${error.message}`);
      throw new Error(`Failed to generate embeddings: ${error.message}`);
    }
  }

  /**
   * Generate embeddings for multiple texts in batch
   * @param {string[]} texts - Array of texts
   * @param {boolean} useCache - Whether to use caching
   * @returns {Promise<number[][]>} Array of embeddings
   */
  async generateBatchEmbeddings(texts, useCache = true) {
    const embeddings = [];
    
    for (const text of texts) {
      try {
        const embedding = await this.generateEmbedding(text, useCache);
        embeddings.push(embedding);
      } catch (error) {
        logger.warn(`Failed to generate embedding for text: ${text.substring(0, 50)}...`);
        embeddings.push(null);
      }
    }
    
    return embeddings;
  }

  /**
   * Calculate cosine similarity between two embeddings
   * @param {number[]} embedding1 - First embedding vector
   * @param {number[]} embedding2 - Second embedding vector
   * @returns {number} Similarity score between -1 and 1
   */
  calculateCosineSimilarity(embedding1, embedding2) {
    if (!embedding1 || !embedding2 || embedding1.length !== embedding2.length) {
      return 0;
    }

    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;

    for (let i = 0; i < embedding1.length; i++) {
      dotProduct += embedding1[i] * embedding2[i];
      norm1 += embedding1[i] * embedding1[i];
      norm2 += embedding2[i] * embedding2[i];
    }

    if (norm1 === 0 || norm2 === 0) {
      return 0;
    }

    return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
  }

  /**
   * Clear embedding cache
   */
  clearCache() {
    this.cache.clear();
    logger.debug('Embedding cache cleared');
  }

  /**
   * Get cache statistics
   * @returns {object} Cache stats
   */
  getCacheStats() {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys()).map(key => key.substring(0, 50) + '...')
    };
  }

  /**
   * Health check method to verify service is working
   * @returns {Promise<boolean>}
   */
  async healthCheck() {
    try {
      if (!this.apiKey || !this.endpoint) {
        throw new Error('Azure OpenAI credentials not configured');
      }

      // Test with a simple embedding request
      await this.generateEmbedding('health check test', false);
      logger.debug('Embedding service health check passed');
      return true;
    } catch (error) {
      logger.warn(`Embedding service health check failed: ${error.message}`);
      return false;
    }
  }

  /**
   * Generate cache key for text
   * @private
   */
  _getCacheKey(text) {
    return text.trim().toLowerCase();
  }
}

module.exports = { EmbeddingService };
