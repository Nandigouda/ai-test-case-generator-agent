// storyRoutes.js
// Clean API routes for story management (refactored from story_api.js)
const express = require('express');
const router = express.Router();

const { DecisionEngine } = require('../services/decisionEngine');
const { LLMService } = require('../services/llmService');
const { VectorStorage } = require('../services/vectorStorage');
const { JiraService } = require('../services/jiraService');
const logger = require('../../config/logger');

// Initialize services
const decisionEngine = new DecisionEngine();
const llmService = new LLMService();
const vectorStorage = new VectorStorage();
const jiraService = new JiraService();

// Initialize vector storage when module loads
vectorStorage.initialize().then(() => {
  logger.info('✅ VectorStorage initialized in API routes');
  
  // Inject vectorStorage into LLMService for unique ID generation
  llmService.setVectorStorage(vectorStorage);
  logger.info('✅ VectorStorage injected into LLMService');
  
}).catch(error => {
  logger.error(`❌ Failed to initialize VectorStorage in API routes: ${error.message}`);
});

/**
 * POST /auto-testcase - Main endpoint for manual test case generation
 * Refactored from the original story_api.js but using modular services
 */
router.post('/auto-testcase', async (req, res) => {
  try {
    let { summary, description, story_id, project_id, version } = req.body;
    
    // Sanitize and validate story_id
    if (!story_id || typeof story_id !== 'string') {
      story_id = 'UNKNOWN-001';
      logger.warn(`⚠️ Invalid or missing story_id, using default: ${story_id}`);
    } else {
      // Trim whitespace and limit length
      story_id = story_id.trim();
      if (story_id === '') {
        story_id = 'EMPTY-001';
        logger.warn(`⚠️ Empty story_id provided, using default: ${story_id}`);
      }
      // Limit story_id length to prevent extremely long IDs
      if (story_id.length > 50) {
        story_id = story_id.substring(0, 50);
        logger.warn(`⚠️ Story ID truncated to 50 characters: ${story_id}`);
      }
    }
    
    // Validate required fields
    if (!summary || !description || 
        summary.trim() === '' || description.trim() === '') {
      return res.status(400).json({
        error: 'Missing required fields',
        message: 'summary and description are required for test case generation.',
        provided: { 
          story_id: story_id, 
          summary: !!summary, 
          summary: !!summary, 
          description: !!description 
        },
        example: {
          story_id: "PROJ-123",
          summary: "As a user, I want to login to the system",
          description: "Please add a detailed description here explaining the functionality, acceptance criteria, and expected behavior."
        },
        note: 'A detailed description helps generate better and more comprehensive test cases'
      });
    }

    const startTime = Date.now();
    logger.info(`Processing manual story: ${summary}`);

    // Step 1: Get vector table data for decision making
    const vectorTable = vectorStorage.getTable();
    
    // Step 2: Use Decision Engine to determine action
    const decision = await decisionEngine.makeDecision(story_id, summary, description, vectorTable);
    logger.info(`Decision: ${decision.action} (${decision.confidence}% confidence)`);

    let testCases = [];
    let testCaseIds = [];
    
    // Step 3: Handle different decision paths
    switch (decision.action) {
      case 'DUPLICATE':
        logger.info(`📋 Duplicate detected for ${story_id}: ${decision.reason}`);
        
        // Get detailed explanation for user-friendly feedback
        const explanation = decisionEngine.getDetailedExplanation(decision);
        
        return res.json({
          status: "success",
          message: decision.detailedReason || decision.reason,
          action: "duplicate",
          duplicateDetails: {
            type: decision.duplicateType,
            source: decision.duplicateSource,
            confidence: decision.confidence,
            matchField: decision.matchField,
            existingStory: {
              id: decision.existingRecord?.storyId || decision.duplicateOf,
              summary: decision.existingRecord?.summary,
              url: decision.existingRecord?.url
            }
          },
          testCaseIds: decision.existingTestCaseIds || decision.existingRecord?.testCaseIds || [],
          storyId: story_id,
          duplicateOf: decision.duplicateOf || decision.existingRecord?.storyId,
          similarity: decision.similarity,
          userExplanation: explanation,
          note: `API: ${explanation.userMessage} - ${explanation.recommendation}`,
          timestamp: new Date().toISOString(),
          processingTime: `${Date.now() - startTime}ms`
        });

      case 'UPDATE':
        logger.info(`🔄 Updating existing story: ${story_id}`);
        // Generate updated test cases
        testCases = await llmService.generateTestCases(
          `${summary}\n${description}`, 
          { existingTestCases: decision.existingRecord?.testCaseDetails }
        );
        
        // Update in Jira (future: implement Jira update logic here)
        // Placeholder: just use testCaseIds from generated test cases
        testCaseIds = testCases.map(tc => tc.testCaseId);
        
        // Update vector storage
        await vectorStorage.updateRecord(story_id, summary, description, {
          testCaseIds: testCaseIds,
          testCaseDetails: testCases,
          version: version || '2.0',
          projectId: project_id || 'default-project',
          updateReason: decision.detailedReason || decision.reason
        });
        
        break;

      case 'NEW':
      default:
        logger.info(`🆕 Creating new test cases for: ${story_id}`);
        // Generate new test cases with unique IDs
        testCases = await llmService.generateTestCases(
          `${summary}\n${description}`, 
          { 
            similarStories: decision.similarStories,
            storyId: story_id,
            projectId: project_id || 'default-project'
          }
        );
        
        // Create test cases in Jira and get real Jira IDs
        const jiraResults = [];
        testCaseIds = [];
        
        for (let i = 0; i < testCases.length; i++) {
          const testCase = testCases[i];
          // Add test case ID and ensure proper format
          testCase.testCaseId = `TC_${String(i + 1).padStart(3, '0')}`;
          testCase.storyId = story_id;
          testCase.projectId = project_id || 'DEC';
          
          try {
            logger.info(`📝 Creating test case ${testCase.testCaseId} in Jira...`);
            const jiraResult = await jiraService.createTestCaseInJira(testCase);
            jiraResults.push(jiraResult);
            
            if (jiraResult.success) {
              testCaseIds.push(jiraResult.jiraKey); // Use Jira key as ID
              logger.info(`✅ Created test case in Jira: ${jiraResult.jiraKey}`);
            } else {
              testCaseIds.push(testCase.testCaseId); // Fallback to local ID
              logger.error(`❌ Failed to create test case in Jira: ${jiraResult.error}`);
            }
          } catch (error) {
            logger.error(`❌ Error creating test case in Jira: ${error.message}`);
            testCaseIds.push(testCase.testCaseId); // Fallback to local ID
            jiraResults.push({
              success: false,
              error: error.message,
              testCaseId: testCase.testCaseId
            });
          }
        }
        
        // Create Jira test case mappings for storage
        const jiraTestCases = jiraResults.map((result, index) => ({
          localId: testCases[index].testCaseId,
          jiraKey: result.success ? result.jiraKey : null,
          jiraId: result.success ? result.jiraId : null,
          summary: testCases[index].summary || testCases[index].description,
          createdVia: 'manual', // This is from /auto-testcase endpoint
          jiraUrl: result.success ? result.url : null,
          status: result.success ? 'created' : 'failed',
          error: result.success ? null : result.error
        }));
        
        // Store in vector database with Jira results
        await vectorStorage.addRecord(story_id, summary, description, {
          testCaseIds: testCaseIds,
          testCaseDetails: testCases,
          jiraResults: jiraResults,
          jiraTestCases: jiraTestCases, // NEW: Store Jira mappings
          createdVia: 'manual', // NEW: Track creation method
          version: version || '1.0',
          projectId: project_id || 'default-project',
          duplicateChecks: decision.duplicateChecks
        });
        
        break;
    }

    const processingTime = Date.now() - startTime;
    
    // Enhanced response for UPDATE and NEW actions
    const response = {
      status: "success",
      message: decision.action === 'UPDATE' ? "Test cases updated successfully" : "New test cases created successfully",
      action: decision.action.toLowerCase(),
      testCaseIds: testCaseIds,
      testCasesGenerated: testCases.length,
      similarityScore: decision.similarity || 0,
      storyId: story_id,
      processingTime: `${processingTime}ms`,
      timestamp: new Date().toISOString()
    };

    // Add Jira results if available (for NEW actions)
    if (typeof jiraResults !== 'undefined' && jiraResults.length > 0) {
      response.jiraResults = jiraResults;
      response.jiraCreationSummary = {
        total: jiraResults.length,
        successful: jiraResults.filter(r => r.success).length,
        failed: jiraResults.filter(r => !r.success).length
      };
      
      // NEW: Add clean Jira test case mappings for frontend
      response.jiraTestCases = jiraResults
        .filter(r => r.success)
        .map(r => ({
          jiraKey: r.jiraKey,
          jiraId: r.jiraId,
          summary: r.testCaseId, // Local test case ID for reference
          jiraUrl: r.url
        }));
    }

    // Add duplicate check information for transparency
    if (decision.duplicateChecks) {
      response.duplicateChecksPerformed = decision.duplicateChecks;
    }

    // Add update details if this was an UPDATE action
    if (decision.action === 'UPDATE' && decision.changes) {
      response.updateDetails = {
        reason: decision.detailedReason || decision.reason,
        changes: decision.changes,
        source: decision.duplicateSource
      };
    }

    return res.json(response);
    
  } catch (error) {
    logger.error('Manual test case generation failed:', error.message);
    res.status(500).json({
      error: 'Test case generation failed',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * POST /clear-vectors - Clear vector database
 */
router.post('/clear-vectors', async (req, res) => {
  try {
    logger.info('🗑️ Clearing vector database...');
    await vectorStorage.clearAllRecords();
    res.json({
      message: 'Local vector database cleared successfully',
      status: 'success',
      note: 'Database is now empty. Use /auto-testcase to add new stories.'
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to clear vector database',
      message: error.message
    });
  }
});

/**
 * GET /vector-stats - Get vector database statistics
 */
router.get('/vector-stats', async (req, res) => {
  try {
    const stats = vectorStorage.getTableStats();
    res.json({
      success: true,
      stats: stats,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to get vector database stats',
      message: error.message
    });
  }
});

/**
 * GET /test-case/:testCaseId - Get test case details by ID
 */
router.get('/test-case/:testCaseId', async (req, res) => {
  try {
    const { testCaseId } = req.params;
    
    if (!testCaseId) {
      return res.status(400).json({
        error: 'Test case ID is required'
      });
    }

    const table = vectorStorage.getTable();
    const index = table.searchIndex[testCaseId];
    
    if (index === undefined) {
      return res.status(404).json({
        error: 'Test case not found',
        message: `No test case found with ID: ${testCaseId}`
      });
    }
    
    const result = {
      testCaseId: testCaseId,
      storyId: table.storyIds[index],
      summary: table.summaries[index],
      description: table.descriptions[index],
      testCases: table.testCaseDetails[index] || [],
      timestamp: table.timestamps[index],
      version: table.versions[index]
    };
    
    if (!result) {
      return res.status(404).json({
        error: 'Test case not found',
        testCaseId: testCaseId
      });
    }

    return res.json({
      status: 'success',
      testCase: result
    });
    
  } catch (error) {
    logger.error('Error retrieving test case details:', error.message);
    return res.status(500).json({
      error: 'Failed to retrieve test case details',
      message: error.message
    });
  }
});

/**
 * GET /story/:storyId/test-cases - Get all test cases for a story
 */
router.get('/story/:storyId/test-cases', async (req, res) => {
  try {
    const { storyId } = req.params;
    
    if (!storyId) {
      return res.status(400).json({
        error: 'Story ID is required'
      });
    }

    const table = vectorStorage.getTable();
    const index = table.searchIndex[storyId];
    
    if (index === undefined) {
      return res.status(404).json({
        error: 'Story not found',
        message: `No story found with ID: ${storyId}`
      });
    }
    
    const testCases = {
      storyId: storyId,
      summary: table.summaries[index],
      description: table.descriptions[index],
      testCases: table.testCaseDetails[index] || [],
      testCaseIds: table.testCaseIds[index] || [],
      testCaseStatuses: table.testCaseStatuses[index] || [],
      timestamp: table.timestamps[index],
      version: table.versions[index]
    };
    
    return res.json({
      status: 'success',
      storyId: storyId,
      testCases: testCases
    });
    
  } catch (error) {
    logger.error('Error retrieving story test cases:', error.message);
    return res.status(500).json({
      error: 'Failed to retrieve story test cases',
      message: error.message
    });
  }
});


/**
 * PUT /test-case/:testCaseId - Update specific test case
 */
router.put('/test-case/:testCaseId', async (req, res) => {
  try {
    const { testCaseId } = req.params;
    const { description, steps, expectedOutcome } = req.body;
    
    // Validate required fields
    if (!description || !steps || !expectedOutcome) {
      return res.status(400).json({
        error: 'Missing required fields',
        message: 'description, steps, and expectedOutcome are all required',
        provided: { 
          description: !!description, 
          steps: !!steps, 
          expectedOutcome: !!expectedOutcome 
        }
      });
    }

    logger.info(`Updating test case: ${testCaseId}`);

    // Update test case in vector storage
    const updateResult = await vectorStorage.updateTestCase(testCaseId, {
      description,
      steps: Array.isArray(steps) ? steps : [steps],
      expectedOutcome
    });

    if (!updateResult.success) {
      return res.status(404).json({
        error: 'Test case not found',
        message: `Test case ${testCaseId} not found in vector storage`,
        testCaseId
      });
    }

    logger.info(`✅ Test case ${testCaseId} updated successfully`);

    res.json({
      status: 'success',
      message: 'Test case updated successfully',
      testCaseId,
      updatedFields: { description, steps, expectedOutcome },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error(`Error updating test case ${req.params.testCaseId}: ${error.message}`);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message,
      testCaseId: req.params.testCaseId,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * GET /health - Health check endpoint
 */
router.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    service: 'story-api-modular',
    timestamp: new Date().toISOString(),
    version: '2.0.0-modular'
  });
});

module.exports = router;
