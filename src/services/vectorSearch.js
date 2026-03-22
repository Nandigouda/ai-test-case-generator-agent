// vectorSearch.js
// Vector search logic extracted from table_vector_db.js
const logger = require('../../config/logger');
const { EmbeddingService } = require('./embeddingService');

class VectorSearch {
  constructor() {
    this.embeddingService = new EmbeddingService();
  }

  /**
   * Search for similar records using vector similarity
   * @param {string} queryText - Text to search for
   * @param {object} vectorTable - Vector table data
   * @param {number} limit - Maximum number of results
   * @param {number} threshold - Minimum similarity threshold
   * @returns {Promise<Array>} Similar records with similarity scores
   */
  async searchSimilar(queryText, vectorTable, limit = 5, threshold = 0.1) {
    try {
      if (!queryText || !vectorTable || !vectorTable.embeddings) {
        return [];
      }

      // Generate embedding for query text
      const queryEmbedding = await this.embeddingService.generateEmbedding(queryText);
      
      const results = [];
      
      // Calculate similarity with all stored embeddings
      for (let i = 0; i < vectorTable.embeddings.length; i++) {
        const storedEmbedding = vectorTable.embeddings[i];
        
        if (!storedEmbedding) continue;
        
        const similarity = this.embeddingService.calculateCosineSimilarity(
          queryEmbedding, 
          storedEmbedding
        );
        
        if (similarity >= threshold) {
          results.push({
            index: i,
            similarity: similarity,
            storyId: vectorTable.storyIds?.[i] || `STORY-${i}`,
            summary: vectorTable.summaries?.[i] || '',
            description: vectorTable.descriptions?.[i] || '',
            testCaseIds: vectorTable.testCaseIds?.[i] || [],
            testCaseDetails: vectorTable.testCaseDetails?.[i] || [],
            timestamp: vectorTable.timestamps?.[i] || null,
            metadata: {
              projectId: vectorTable.projectIds?.[i],
              version: vectorTable.versions?.[i],
              jiraIssueKey: vectorTable.jiraIssueKeys?.[i]
            }
          });
        }
      }
      
      // Sort by similarity score (descending) and limit results
      results.sort((a, b) => b.similarity - a.similarity);
      
      const limitedResults = results.slice(0, limit);
      
      logger.debug(`Vector search found ${limitedResults.length} similar records (threshold: ${threshold})`);
      
      return limitedResults;
      
    } catch (error) {
      logger.error(`Vector search failed: ${error.message}`);
      return [];
    }
  }

  /**
   * Find records with similarity above threshold
   * @param {string} queryText - Text to search for
   * @param {object} vectorTable - Vector table data
   * @param {number} threshold - Similarity threshold (default: 0.85)
   * @returns {Promise<Array>} High similarity records
   */
  async findHighSimilarity(queryText, vectorTable, threshold = 0.85) {
    const results = await this.searchSimilar(queryText, vectorTable, 10, threshold);
    return results.filter(result => result.similarity >= threshold);
  }

  /**
   * Find exact or near-exact matches
   * @param {string} queryText - Text to search for
   * @param {object} vectorTable - Vector table data
   * @returns {Promise<Array>} Very high similarity records (>95%)
   */
  async findExactMatches(queryText, vectorTable) {
    return await this.findHighSimilarity(queryText, vectorTable, 0.95);
  }

  /**
   * Search by story ID with fuzzy matching
   * @param {string} storyId - Story ID to search for
   * @param {object} vectorTable - Vector table data
   * @returns {object|null} Found record or null
   */
  findByStoryId(storyId, vectorTable) {
    if (!storyId || !vectorTable || !vectorTable.storyIds) {
      logger.info(`❌ findByStoryId failed: storyId=${storyId}, vectorTable=${!!vectorTable}, storyIds=${!!vectorTable?.storyIds}`);
      return null;
    }

    logger.info(`🔍 Searching for storyId: ${storyId} in ${vectorTable.storyIds.length} stories`);
    logger.info(`📋 Available story IDs: ${JSON.stringify(vectorTable.storyIds)}`);

    // Check search index first
    if (vectorTable.searchIndex && vectorTable.searchIndex[storyId] !== undefined) {
      const index = vectorTable.searchIndex[storyId];
      logger.info(`✅ Found in search index at index ${index}`);
      return this._buildRecordFromIndex(index, vectorTable);
    }

    // Fallback to linear search
    const index = vectorTable.storyIds.findIndex(id => id === storyId);
    if (index !== -1) {
      logger.info(`✅ Found in linear search at index ${index}`);
      return this._buildRecordFromIndex(index, vectorTable);
    }

    logger.info(`❌ Story ${storyId} not found in vector table`);
    return null;
  }

  /**
   * Search test cases by test case ID
   * @param {string} testCaseId - Test case ID to search for
   * @param {object} vectorTable - Vector table data
   * @returns {object|null} Test case details with related story
   */
  findTestCaseById(testCaseId, vectorTable) {
    if (!testCaseId || !vectorTable) {
      return null;
    }

    // Search through all test case details
    for (let i = 0; i < (vectorTable.testCaseDetails || []).length; i++) {
      const testCaseArray = vectorTable.testCaseDetails[i];
      
      if (Array.isArray(testCaseArray)) {
        const testCase = testCaseArray.find(tc => tc.testCaseId === testCaseId);
        
        if (testCase) {
          return {
            testCase: testCase,
            storyId: vectorTable.storyIds?.[i] || `STORY-${i}`,
            summary: vectorTable.summaries?.[i] || '',
            description: vectorTable.descriptions?.[i] || '',
            index: i
          };
        }
      }
    }

    return null;
  }

  /**
   * Get all test cases for a story
   * @param {string} storyId - Story ID
   * @param {object} vectorTable - Vector table data
   * @returns {Array} Array of test cases
   */
  getTestCasesByStoryId(storyId, vectorTable) {
    const record = this.findByStoryId(storyId, vectorTable);
    return record ? (record.testCaseDetails || []) : [];
  }

  /**
   * Build record object from table index
   * @private
   */
  _buildRecordFromIndex(index, vectorTable) {
    return {
      index: index,
      storyId: vectorTable.storyIds?.[index],
      summary: vectorTable.summaries?.[index],
      description: vectorTable.descriptions?.[index],
      embedding: vectorTable.embeddings?.[index],
      testCaseIds: vectorTable.testCaseIds?.[index] || [],
      testCaseDetails: vectorTable.testCaseDetails?.[index] || [],
      jiraTestCases: vectorTable.jiraTestCases?.[index] || [],
      timestamp: vectorTable.timestamps?.[index],
      metadata: {
        projectId: vectorTable.projectIds?.[index],
        version: vectorTable.versions?.[index],
        jiraIssueKey: vectorTable.jiraIssueKeys?.[index],
        lastUpdated: vectorTable.lastUpdated?.[index]
      }
    };
  }
}

module.exports = { VectorSearch };
