// jiraTestCaseRoutes.js
// API routes for Jira test case mappings and retrieval
const express = require('express');
const router = express.Router();
const { VectorStorage } = require('../services/vectorStorage');
const { VectorSearch } = require('../services/vectorSearch');
const logger = require('../../config/logger');

// Initialize services
const vectorStorage = new VectorStorage();
const vectorSearch = new VectorSearch();

// Initialize vector storage when module loads
vectorStorage.initialize().then(() => {
  logger.info('✅ VectorStorage initialized in Jira test case routes');
}).catch(error => {
  logger.error(`❌ Failed to initialize VectorStorage in Jira test case routes: ${error.message}`);
});

/**
 * GET /api/story/:storyId/test-cases - Get all test cases for a specific story
 */
router.get('/story/:storyId/test-cases', async (req, res) => {
  try {
    const { storyId } = req.params;
    
    if (!storyId) {
      return res.status(400).json({
        status: 'error',
        message: 'Story ID is required'
      });
    }

    logger.info(`🔍 Fetching test cases for story: ${storyId}`);
    
    const vectorTable = vectorStorage.getTable();
    const record = vectorSearch.findByStoryId(storyId, vectorTable);
    
    if (!record) {
      return res.status(404).json({
        status: 'error',
        message: `No test cases found for story: ${storyId}`
      });
    }

    const testCases = [];
    const jiraTestCases = record.jiraTestCases || [];
    const testCaseDetails = record.testCaseDetails || [];
    const creationMethod = vectorTable.creationMethods?.[record.index] || 'unknown';

    // Combine local test case details with Jira mappings
    testCaseDetails.forEach((testCase, index) => {
      const jiraMapping = jiraTestCases[index] || {};
      
      testCases.push({
        localId: testCase.testCaseId,
        jiraKey: jiraMapping.jiraKey || null,
        jiraId: jiraMapping.jiraId || null,
        summary: testCase.summary || testCase.description,
        description: testCase.description || '',
        createdVia: jiraMapping.createdVia || creationMethod,
        jiraUrl: jiraMapping.jiraUrl || null,
        status: jiraMapping.status || 'unknown',
        category: testCase.category || 'functional',
        priority: testCase.priority || 'Medium',
        testSteps: testCase.testSteps || [],
        hasJiraMapping: !!jiraMapping.jiraKey
      });
    });

    const response = {
      status: 'success',
      storyId: storyId,
      totalTestCases: testCases.length,
      createdVia: creationMethod,
      testCases: testCases,
      jiraTestCases: testCases.filter(tc => tc.hasJiraMapping).map(tc => ({
        jiraKey: tc.jiraKey,
        jiraId: tc.jiraId,
        summary: tc.summary,
        jiraUrl: tc.jiraUrl
      })),
      metadata: {
        storyIndex: record.index,
        lastUpdated: record.metadata?.lastUpdated,
        version: record.metadata?.version
      }
    };

    logger.info(`✅ Found ${testCases.length} test cases for story ${storyId} (${testCases.filter(tc => tc.hasJiraMapping).length} with Jira mappings)`);
    res.json(response);

  } catch (error) {
    logger.error(`Error fetching test cases for story ${req.params.storyId}: ${error.message}`);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch test cases',
      error: error.message
    });
  }
});

/**
 * GET /api/test-cases/all - Get all test cases with Jira mappings
 */
router.get('/test-cases/all', async (req, res) => {
  try {
    logger.info(`🔍 Fetching all test cases with Jira mappings`);
    
    const vectorTable = vectorStorage.getTable();
    const allTestCases = [];
    
    // Iterate through all stories
    for (let i = 0; i < vectorTable.storyIds.length; i++) {
      const storyId = vectorTable.storyIds[i];
      const testCaseDetails = vectorTable.testCaseDetails[i] || [];
      const jiraTestCases = vectorTable.jiraTestCases?.[i] || [];
      const creationMethod = vectorTable.creationMethods?.[i] || 'unknown';
      
      testCaseDetails.forEach((testCase, testIndex) => {
        const jiraMapping = jiraTestCases[testIndex] || {};
        
        allTestCases.push({
          storyId: storyId,
          storyIndex: i,
          localId: testCase.testCaseId,
          jiraKey: jiraMapping.jiraKey || null,
          jiraId: jiraMapping.jiraId || null,
          summary: testCase.summary || testCase.description,
          description: testCase.description || '',
          createdVia: jiraMapping.createdVia || creationMethod,
          jiraUrl: jiraMapping.jiraUrl || null,
          status: jiraMapping.status || 'unknown',
          category: testCase.category || 'functional',
          priority: testCase.priority || 'Medium',
          hasJiraMapping: !!jiraMapping.jiraKey
        });
      });
    }

    const response = {
      status: 'success',
      totalTestCases: allTestCases.length,
      totalStories: vectorTable.storyIds.length,
      jiraTestCases: allTestCases.filter(tc => tc.hasJiraMapping),
      testCases: allTestCases,
      summary: {
        withJiraMapping: allTestCases.filter(tc => tc.hasJiraMapping).length,
        withoutJiraMapping: allTestCases.filter(tc => !tc.hasJiraMapping).length,
        createdViaManual: allTestCases.filter(tc => tc.createdVia === 'manual').length,
        createdViaWebhook: allTestCases.filter(tc => tc.createdVia === 'webhook').length
      }
    };

    logger.info(`✅ Found ${allTestCases.length} total test cases (${response.summary.withJiraMapping} with Jira mappings)`);
    res.json(response);

  } catch (error) {
    logger.error(`Error fetching all test cases: ${error.message}`);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch all test cases',
      error: error.message
    });
  }
});

/**
 * GET /api/test-cases/stats - Get test case statistics
 */
router.get('/test-cases/stats', async (req, res) => {
  try {
    logger.info(`📊 Fetching test case statistics`);
    
    const vectorTable = vectorStorage.getTable();
    const tableStats = vectorStorage.getTableStats();
    
    let totalTestCases = 0;
    let withJiraMapping = 0;
    let createdViaManual = 0;
    let createdViaWebhook = 0;
    
    for (let i = 0; i < vectorTable.storyIds.length; i++) {
      const testCaseDetails = vectorTable.testCaseDetails[i] || [];
      const jiraTestCases = vectorTable.jiraTestCases?.[i] || [];
      const creationMethod = vectorTable.creationMethods?.[i] || 'unknown';
      
      totalTestCases += testCaseDetails.length;
      withJiraMapping += jiraTestCases.filter(tc => tc.jiraKey).length;
      
      if (creationMethod === 'manual') {
        createdViaManual += testCaseDetails.length;
      } else if (creationMethod === 'webhook') {
        createdViaWebhook += testCaseDetails.length;
      }
    }

    const response = {
      status: 'success',
      stats: {
        totalStories: vectorTable.storyIds.length,
        totalTestCases: totalTestCases,
        withJiraMapping: withJiraMapping,
        withoutJiraMapping: totalTestCases - withJiraMapping,
        createdViaManual: createdViaManual,
        createdViaWebhook: createdViaWebhook,
        averageTestCasesPerStory: vectorTable.storyIds.length > 0 ? 
          Math.round(totalTestCases / vectorTable.storyIds.length * 100) / 100 : 0
      },
      vectorStorageStats: tableStats,
      timestamp: new Date().toISOString()
    };

    logger.info(`✅ Statistics: ${totalTestCases} test cases, ${withJiraMapping} with Jira mappings`);
    res.json(response);

  } catch (error) {
    logger.error(`Error fetching test case statistics: ${error.message}`);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch statistics',
      error: error.message
    });
  }
});

module.exports = router;
