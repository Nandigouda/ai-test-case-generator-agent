// decisionEngine.js
// Core decision logic extracted from story_api.js
const logger = require('../../config/logger');
const { VectorSearch } = require('./vectorSearch');
const { JiraService } = require('./jiraService');
const { areStringsIdentical, areStringsSimilar } = require('../utils/stringUtils');

class DecisionEngine {
  constructor() {
    this.vectorSearch = new VectorSearch();
    this.jiraService = new JiraService();
  }

  /**
   * Main decision function: NEW, UPDATE, or DUPLICATE
   * @param {string} storyId - Story ID
   * @param {string} summary - Story summary
   * @param {string} description - Story description
   * @param {object} vectorTable - Vector table data
   * @returns {Promise<object>} Decision result with action and details
   */
  async makeDecision(storyId, summary, description, vectorTable) {
    try {
      logger.info(`🤔 Decision Engine: Analyzing story ${storyId}`);
      
      // Force log the vector table state for debugging
      logger.info(`📊 Vector table loaded with ${vectorTable?.storyIds?.length || 0} stories`);
      if (vectorTable?.storyIds?.length > 0) {
        logger.info(`📋 Available stories: ${JSON.stringify(vectorTable.storyIds)}`);
      }
      
      // NEW LOGIC: Check LOCAL storage first for content similarity (80% threshold)
      logger.info(`🔍 Step 1: Checking local storage for content similarity (80% threshold)...`);
      const contentSimilarity = await this._checkLocalContentSimilarity(storyId, summary, description, vectorTable);
      if (contentSimilarity) {
        return contentSimilarity;
      }

      // 2. Check for exact story ID match in local storage
      logger.info(`🔍 Step 2: Checking local storage for exact story ID match...`);
      const exactMatch = this._checkExactStoryIdMatch(storyId, summary, description, vectorTable);
      if (exactMatch) {
        return exactMatch;
      }

      // 3. No duplicates found - this is a new story
      logger.info(`✨ Step 3: No duplicates found - new story confirmed`);
      logger.info(`✨ Step 5: No duplicates found - new story confirmed`);
      return {
        action: 'NEW',
        storyId: storyId,
        confidence: 0,
        reason: 'No duplicates found in local storage - ready for test generation',
        duplicateChecks: {
          localContentSimilarity: 'CHECKED_NO_DUPLICATES',
          localStoryId: 'CHECKED_NO_DUPLICATES'
        },
        similarStories: await this.vectorSearch.searchSimilar(`${summary}\n${description}`, vectorTable, 3, 0.3)
      };

    } catch (error) {
      logger.error(`Decision engine failed: ${error.message}`);
      return {
        action: 'ERROR',
        error: error.message,
        storyId: storyId
      };
    }
  }

  /**
   * Check local storage for content similarity (80% threshold)
   * This replaces Jira duplicate check for better local control
   * @private
   */
  async _checkLocalContentSimilarity(storyId, summary, description, vectorTable) {
    if (!vectorTable || !vectorTable.storyIds || vectorTable.storyIds.length === 0) {
      logger.info(`📭 No local stories to compare against`);
      return null;
    }

    logger.info(`🔍 Checking local content similarity for: ${storyId}`);
    
    const currentContent = `${summary}\n${description}`.toLowerCase();
    const SIMILARITY_THRESHOLD = 0.8; // 80% similarity threshold
    
    for (let i = 0; i < vectorTable.storyIds.length; i++) {
      const existingStoryId = vectorTable.storyIds[i];
      const existingSummary = vectorTable.summaries?.[i] || '';
      const existingDescription = vectorTable.descriptions?.[i] || '';
      const existingContent = `${existingSummary}\n${existingDescription}`.toLowerCase();
      
      // Calculate similarity using string utils
      const summaryMatch = areStringsSimilar(summary.toLowerCase(), existingSummary.toLowerCase());
      const descriptionMatch = areStringsSimilar(description.toLowerCase(), existingDescription.toLowerCase());
      
      // Calculate overall similarity score
      let similarityScore = 0;
      if (summaryMatch) similarityScore += 0.6; // Summary is 60% weight
      if (descriptionMatch) similarityScore += 0.4; // Description is 40% weight
      
      logger.info(`📊 Similarity with ${existingStoryId}: ${Math.round(similarityScore * 100)}%`);
      
      if (similarityScore >= SIMILARITY_THRESHOLD) {
        logger.info(`🔄 LOCAL CONTENT SIMILARITY DETECTED: ${Math.round(similarityScore * 100)}% match with ${existingStoryId}`);
        
        return {
          action: 'UPDATE',
          storyId: storyId,
          confidence: Math.round(similarityScore * 100),
          reason: `Story content is ${Math.round(similarityScore * 100)}% similar to existing story ${existingStoryId} in local storage`,
          existingRecord: {
            index: i,
            storyId: existingStoryId,
            summary: existingSummary,
            description: existingDescription,
            testCaseIds: vectorTable.testCaseIds?.[i] || [],
            testCaseDetails: vectorTable.testCaseDetails?.[i] || [],
            jiraTestCases: vectorTable.jiraTestCases?.[i] || []
          },
          duplicateType: 'LOCAL_CONTENT_SIMILARITY',
          matchDetails: {
            summaryMatch: summaryMatch,
            descriptionMatch: descriptionMatch,
            overallScore: similarityScore,
            threshold: SIMILARITY_THRESHOLD
          }
        };
      }
    }
    
    logger.info(`✅ No content similarity found above ${Math.round(SIMILARITY_THRESHOLD * 100)}% threshold`);
    return null;
  }

  /**
   * Check Jira for duplicates (REMOVED from main flow but kept for manual checks)
   * @private
   */
  async _checkJiraDuplicates(storyId, summary, description) {
    try {
      logger.info(`🌐 Checking Jira for duplicates of story: ${storyId}`);
      
      const jiraResult = await this.jiraService.searchForDuplicateIssues(
        storyId, 
        summary, 
        description, 
        'DEC' // Your project key
      );

      if (jiraResult.isDuplicate) {
        logger.info(`🔁 JIRA DUPLICATE DETECTED: ${jiraResult.duplicateType}`);
        
        return {
          action: 'DUPLICATE',
          storyId: storyId,
          confidence: jiraResult.confidence,
          reason: jiraResult.reason,
          duplicateSource: 'JIRA',
          duplicateType: jiraResult.duplicateType,
          matchField: jiraResult.matchField,
          existingRecord: {
            storyId: jiraResult.existingIssue.storyId,
            summary: jiraResult.existingIssue.summary,
            description: jiraResult.existingIssue.description,
            url: jiraResult.existingIssue.url || `https://nikhilnandigoud.atlassian.net/browse/${jiraResult.existingIssue.storyId}`,
            source: 'JIRA'
          },
          detailedReason: this._generateDetailedDuplicateReason(jiraResult),
          jiraDetails: jiraResult
        };
      }

      logger.info(`✅ No duplicates found in Jira for story: ${storyId}`);
      return null;

    } catch (error) {
      logger.warn(`Jira duplicate check failed: ${error.message}`);
      // Continue with local checks if Jira fails
      return null;
    }
  }

  /**
   * Check for exact story ID match
   * @private
   */
  _checkExactStoryIdMatch(storyId, summary, description, vectorTable) {
    if (!storyId || !vectorTable) return null;

    // Enhanced search to ensure we find existing stories
    let existingRecord = null;
    
    // Method 1: Use vector search service
    try {
      existingRecord = this.vectorSearch.findByStoryId(storyId, vectorTable);
    } catch (error) {
      logger.warn(`Vector search failed: ${error.message}`);
    }
    
    // Method 2: Direct search if vector search fails
    if (!existingRecord && vectorTable.storyIds) {
      const index = vectorTable.storyIds.indexOf(storyId);
      if (index !== -1) {
        existingRecord = {
          index: index,
          storyId: storyId,
          summary: vectorTable.summaries?.[index] || '',
          description: vectorTable.descriptions?.[index] || '',
          testCaseIds: vectorTable.testCaseIds?.[index] || []
        };
        logger.info(`📋 Found ${storyId} using direct search at index ${index}`);
      }
    }
    
    if (!existingRecord) {
      logger.info(`❌ Story ${storyId} not found in local vector table`);
      return null;
    }

    logger.info(`📋 Found exact story ID match in local storage: ${storyId}`);

    const existingSummary = existingRecord.summary || '';
    const existingDescription = existingRecord.description || '';

    logger.info(`🔍 Comparing content for ${storyId}:`);
    logger.info(`📝 Existing summary: "${existingSummary}"`);
    logger.info(`📝 New summary: "${summary}"`);
    logger.info(`📝 Existing description: "${existingDescription}"`);
    logger.info(`📝 New description: "${description}"`);

    // Check if content has changed
    const summaryChanged = !areStringsIdentical(existingSummary, summary);
    const descriptionChanged = !areStringsIdentical(existingDescription, description);

    logger.info(`🔄 Summary changed: ${summaryChanged}`);
    logger.info(`🔄 Description changed: ${descriptionChanged}`);

    if (summaryChanged || descriptionChanged) {
      logger.info(`🔄 Content change detected for story ${storyId} - triggering update`);
      return {
        action: 'UPDATE',
        storyId: storyId,
        confidence: 100,
        reason: 'Story ID exists in local storage but content changed',
        duplicateSource: 'LOCAL_STORAGE',
        duplicateType: 'STORY_ID_MATCH_CONTENT_CHANGED',
        matchField: 'storyId',
        existingRecord: existingRecord,
        changes: {
          summary: summaryChanged,
          description: descriptionChanged
        },
        detailedReason: `Story ID "${storyId}" already exists in local storage. ${summaryChanged ? 'Summary' : ''}${summaryChanged && descriptionChanged ? ' and ' : ''}${descriptionChanged ? 'Description' : ''} content has changed - updating existing record.`
      };
    } else {
      logger.info(`🔁 Identical content detected for story ${storyId}`);
      return {
        action: 'DUPLICATE',
        storyId: storyId,
        confidence: 100,
        reason: 'Exact story ID match with identical content in local storage',
        duplicateSource: 'LOCAL_STORAGE',
        duplicateType: 'EXACT_STORY_ID_MATCH',
        matchField: 'storyId',
        existingRecord: existingRecord,
        detailedReason: `Story ID "${storyId}" already exists in local storage with identical summary and description content. No action needed - returning existing test cases.`,
        existingTestCaseIds: existingRecord.testCaseIds || []
      };
    }
  }

  /**
   * Check for content-based duplicates across all stories
   * @private
   */
  _checkContentBasedDuplicates(storyId, summary, description, vectorTable) {
    if (!vectorTable || !vectorTable.summaries) return null;

    for (let i = 0; i < vectorTable.summaries.length; i++) {
      const existingSummary = vectorTable.summaries[i] || '';
      const existingDescription = vectorTable.descriptions[i] || '';
      const existingStoryId = vectorTable.storyIds[i] || '';

      // Skip if it's the same story ID (already handled above)
      if (existingStoryId === storyId) continue;

      // Check for exact content match
      const summaryMatch = areStringsIdentical(existingSummary, summary);
      const descriptionMatch = areStringsIdentical(existingDescription, description);

      if (summaryMatch && descriptionMatch) {
        logger.info(`🔁 Content-based duplicate: "${storyId}" matches "${existingStoryId}"`);
        
        return {
          action: 'DUPLICATE',
          storyId: storyId,
          confidence: 100,
          reason: `Identical summary and description content matches existing story "${existingStoryId}" in local storage`,
          duplicateSource: 'LOCAL_STORAGE',
          duplicateType: 'EXACT_CONTENT_MATCH',
          matchField: 'summary_and_description',
          duplicateOf: existingStoryId,
          existingRecord: this.vectorSearch._buildRecordFromIndex(i, vectorTable),
          detailedReason: `Both summary ("${summary}") and description content are identical to existing story "${existingStoryId}" in local storage. This appears to be a complete duplicate.`,
          existingTestCaseIds: vectorTable.testCaseIds?.[i] || []
        };
      }

      // Check for exact summary match only
      if (summaryMatch && !descriptionMatch) {
        logger.info(`🔁 Summary duplicate: "${storyId}" summary matches "${existingStoryId}"`);
        
        return {
          action: 'DUPLICATE',
          storyId: storyId,
          confidence: 95,
          reason: `Summary matches existing story "${existingStoryId}" in local storage`,
          duplicateSource: 'LOCAL_STORAGE',
          duplicateType: 'EXACT_SUMMARY_MATCH',
          matchField: 'summary',
          duplicateOf: existingStoryId,
          existingRecord: this.vectorSearch._buildRecordFromIndex(i, vectorTable),
          detailedReason: `Summary ("${summary}") is identical to existing story "${existingStoryId}" in local storage, but description differs. This is likely a duplicate with minor description changes.`,
          existingTestCaseIds: vectorTable.testCaseIds?.[i] || []
        };
      }

      // Check for near-identical description (95% similarity)
      if (!summaryMatch && areStringsSimilar(existingDescription, description, 0.95)) {
        const similarity = Math.round(95); // Minimum 95% for this check
        
        logger.info(`🔁 Near-duplicate description: "${storyId}" is ${similarity}% similar to "${existingStoryId}"`);
        
        return {
          action: 'DUPLICATE',
          storyId: storyId,
          confidence: similarity,
          reason: `Description content is ${similarity}% similar to existing story "${existingStoryId}" in local storage`,
          duplicateSource: 'LOCAL_STORAGE',
          duplicateType: 'SIMILAR_DESCRIPTION_MATCH',
          matchField: 'description',
          duplicateOf: existingStoryId,
          similarity: similarity,
          existingRecord: this.vectorSearch._buildRecordFromIndex(i, vectorTable),
          detailedReason: `Description content is ${similarity}% similar to existing story "${existingStoryId}" in local storage. Summary differs but description indicates likely duplicate content.`,
          existingTestCaseIds: vectorTable.testCaseIds?.[i] || []
        };
      }
    }

    return null;
  }

  /**
   * Check for vector similarity duplicates
   * @private
   */
  async _checkVectorSimilarity(storyId, summary, description, vectorTable) {
    try {
      const storyText = `${summary}\n${description}`;
      const similarStories = await this.vectorSearch.findHighSimilarity(storyText, vectorTable, 0.85);

      if (similarStories.length > 0) {
        const topMatch = similarStories[0];
        const similarity = Math.round(topMatch.similarity * 100);

        logger.info(`🔁 Vector similarity duplicate: ${similarity}% similar to "${topMatch.storyId}"`);

        return {
          action: 'DUPLICATE',
          storyId: storyId,
          confidence: similarity,
          reason: `High semantic similarity (${similarity}%) to existing story "${topMatch.storyId}" in local storage`,
          duplicateSource: 'LOCAL_STORAGE',
          duplicateType: 'VECTOR_SIMILARITY_MATCH',
          matchField: 'semantic_content',
          duplicateOf: topMatch.storyId,
          similarity: similarity,
          existingRecord: topMatch,
          detailedReason: `AI semantic analysis indicates ${similarity}% similarity to existing story "${topMatch.storyId}" in local storage. Content appears to address the same requirements with different wording.`,
          existingTestCaseIds: topMatch.testCaseIds || []
        };
      }

      return null;

    } catch (error) {
      logger.warn(`Vector similarity check failed: ${error.message}`);
      return null;
    }
  }

  /**
   * Generate detailed reason for duplicate detection
   * @private
   */
  _generateDetailedDuplicateReason(jiraResult) {
    const { duplicateType, existingIssue, matchField, confidence } = jiraResult;
    
    switch (duplicateType) {
      case 'EXACT_STORY_ID':
        return `Story ID "${existingIssue.storyId}" already exists in Jira. This is an exact match and indicates the story has already been created.`;
      
      case 'EXACT_SUMMARY':
        return `Story summary "${existingIssue.summary}" exactly matches existing Jira issue "${existingIssue.storyId}". This suggests the same requirement is already being tracked.`;
      
      case 'SIMILAR_DESCRIPTION':
        return `Story description content is highly similar (${confidence}% confidence) to existing Jira issue "${existingIssue.storyId}". The requirements appear to overlap significantly.`;
      
      default:
        return `Duplicate detected in Jira with ${confidence}% confidence. Match type: ${duplicateType}`;
    }
  }

  /**
   * Get decision summary for logging
   * @param {object} decision - Decision result
   * @returns {string} Human-readable summary
   */
  getDecisionSummary(decision) {
    switch (decision.action) {
      case 'NEW':
        return `✨ NEW story: No duplicates found in Jira or local storage`;
      case 'UPDATE':
        return `🔄 UPDATE story: ${decision.storyId} (content changed in ${decision.duplicateSource})`;
      case 'DUPLICATE':
        const source = decision.duplicateSource || 'unknown';
        const type = decision.duplicateType || 'unknown';
        const confidence = decision.confidence || 'unknown';
        return `🔁 DUPLICATE: ${type} (${confidence}% confidence) in ${source} - ${decision.reason}`;
      case 'ERROR':
        return `❌ ERROR: ${decision.error}`;
      default:
        return `❓ UNKNOWN action: ${decision.action}`;
    }
  }

  /**
   * Get detailed duplicate explanation for user interface
   * @param {object} decision - Decision result
   * @returns {object} User-friendly explanation
   */
  getDetailedExplanation(decision) {
    if (decision.action !== 'DUPLICATE') {
      return {
        isDuplicate: false,
        explanation: 'This story is unique and will proceed with test case generation.'
      };
    }

    const explanation = {
      isDuplicate: true,
      duplicateType: decision.duplicateType,
      confidence: decision.confidence,
      matchField: decision.matchField,
      source: decision.duplicateSource,
      existingStory: {
        id: decision.existingRecord?.storyId || decision.duplicateOf,
        summary: decision.existingRecord?.summary,
        url: decision.existingRecord?.url
      },
      detailedReason: decision.detailedReason || decision.reason,
      existingTestCases: decision.existingTestCaseIds || []
    };

    // Add specific explanations based on duplicate type
    switch (decision.duplicateType) {
      case 'EXACT_STORY_ID':
        explanation.userMessage = `⚠️ Story ID already exists in Jira`;
        explanation.recommendation = 'Use a different story ID or update the existing story';
        break;
      
      case 'EXACT_STORY_ID_MATCH':
        explanation.userMessage = `⚠️ Story ID already exists in local storage with identical content`;
        explanation.recommendation = 'This story has already been processed - returning existing test cases';
        break;
      
      case 'EXACT_SUMMARY':
        explanation.userMessage = `⚠️ Story summary already exists in Jira`;
        explanation.recommendation = 'Consider if this is truly a new requirement or update the existing story';
        break;
      
      case 'EXACT_CONTENT_MATCH':
        explanation.userMessage = `⚠️ Identical content already exists in local storage`;
        explanation.recommendation = 'This story appears to be a complete duplicate';
        break;
      
      case 'SIMILAR_DESCRIPTION':
        explanation.userMessage = `⚠️ Very similar content found in Jira`;
        explanation.recommendation = 'Review existing story to avoid duplicate work';
        break;
      
      case 'VECTOR_SIMILARITY_MATCH':
        explanation.userMessage = `⚠️ Semantically similar content detected`;
        explanation.recommendation = 'AI analysis suggests this addresses similar requirements';
        break;
      
      default:
        explanation.userMessage = `⚠️ Duplicate content detected`;
        explanation.recommendation = 'Review existing stories before proceeding';
    }

    return explanation;
  }
}

module.exports = { DecisionEngine };
