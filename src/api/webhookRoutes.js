// webhookRoutes.js
// Clean webhook routes for Jira integration (refactored from jira_webhook_handler.js)
const express = require('express');
const router = express.Router();

const { JiraService } = require('../services/jiraService');
const { DecisionEngine } = require('../services/decisionEngine');
const { LLMService } = require('../services/llmService');
const { VectorStorage } = require('../services/vectorStorage');
const logger = require('../../config/logger');

// Initialize services
const jiraService = new JiraService();
const decisionEngine = new DecisionEngine();
const llmService = new LLMService();
const vectorStorage = new VectorStorage();

// Initialize vector storage when module loads
vectorStorage.initialize().then(() => {
  logger.info('✅ VectorStorage initialized in webhook routes');
  
  // Inject vectorStorage into LLMService for unique ID generation
  llmService.setVectorStorage(vectorStorage);
  logger.info('✅ VectorStorage injected into LLMService');
  
}).catch(error => {
  logger.error(`❌ Failed to initialize VectorStorage in webhook routes: ${error.message}`);
});

// JIRA Webhook Event Types
const JIRA_EVENTS = {
  ISSUE_CREATED: 'jira:issue_created',
  ISSUE_UPDATED: 'jira:issue_updated'
};

// /**
//  * POST /webhook - Main JIRA Webhook Endpoint
//  * Receives automatic triggers from JIRA or Postman simulation
//  */
// router.post('/webhook', async (req, res) => {
//   try {
//     const startTime = Date.now();
//     logger.info(`🔗 Webhook received: ${req.body.webhookEvent}`);
//     
//     // Step 1: Validate webhook payload
//     if (!jiraService.validateWebhookPayload(req.body)) {
//       return res.status(400).json({
//         error: 'Invalid webhook payload',
//         message: 'Webhook validation failed'
//       });
//     }
//
//     // Step 2: Extract story data from webhook
//     const storyData = jiraService.extractStoryFromWebhook(req.body);
//     logger.info(`📖 Processing story: ${storyData.storyId} - ${storyData.summary}`);
//
//     // Step 3: Handle different webhook events
//     let result;
//     switch (req.body.webhookEvent) {
//       case JIRA_EVENTS.ISSUE_CREATED:
//         result = await handleNewIssue(storyData);
//         break;
//         
//       case JIRA_EVENTS.ISSUE_UPDATED:
//         result = await handleIssueUpdate(storyData);
//         break;
//         
//       default:
//         logger.warn(`Unhandled webhook event: ${req.body.webhookEvent}`);
//         return res.json({
//           status: "ignored",
//           message: `Event ${req.body.webhookEvent} not processed by this system`,
//           supportedEvents: Object.values(JIRA_EVENTS),
//           timestamp: new Date().toISOString()
//         });
//     }
//
//     const processingTime = Date.now() - startTime;
//     
//     return res.json({
//       ...result,
//       processingTime: `${processingTime}ms`,
//       timestamp: new Date().toISOString()
//     });
//     
//   } catch (error) {
//     logger.error('Webhook processing error:', error.message);
//     res.status(500).json({
//       error: 'Webhook processing failed',
//       message: error.message,
//       timestamp: new Date().toISOString()
//     });
//   }
// });

/**
 * Handle new JIRA issue creation (issue_created event)
 */
async function handleNewIssue(storyData) {
  logger.info(`🆕 Processing new issue: ${storyData.storyId}`);
  
  // Get vector table data for decision making
  const vectorTable = vectorStorage.getTable();
  
  // Use decision engine to determine action
  const decision = await decisionEngine.makeDecision(
    storyData.storyId, 
    storyData.summary, 
    storyData.description,
    vectorTable
  );
  
  return await processStoryDecision(storyData, decision, 'new');
}

/**
 * Handle JIRA issue update (issue_updated event)
 */
async function handleIssueUpdate(storyData) {
  logger.info(`🔄 Processing issue update: ${storyData.storyId}`);
  
  // Get vector table data for decision making
  const vectorTable = vectorStorage.getTable();
  
  // Use decision engine to determine action
  const decision = await decisionEngine.makeDecision(
    storyData.storyId, 
    storyData.summary, 
    storyData.description,
    vectorTable
  );
  
  return await processStoryDecision(storyData, decision, 'update');
}

/**
 * Process story based on decision engine result
 */
async function processStoryDecision(storyData, decision, triggerType) {
  let testCases = [];
  let testCaseIds = [];
  
  // Log the detailed decision for debugging
  logger.info(`📊 Decision Engine Result: ${JSON.stringify(decision, null, 2)}`);
  
  // Get detailed explanation for user-friendly feedback
  const explanation = decisionEngine.getDetailedExplanation(decision);
  logger.info(`📝 Detailed Explanation: ${JSON.stringify(explanation, null, 2)}`);
  
  switch (decision.action) {
    case 'DUPLICATE':
      logger.info(`📋 Duplicate detected for ${storyData.storyId}: ${decision.reason}`);
      
      // Enhanced duplicate response with detailed information
      return {
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
        storyId: storyData.storyId,
        duplicateOf: decision.duplicateOf || decision.existingRecord?.storyId,
        similarity: decision.similarity,
        triggerType: triggerType,
        userExplanation: explanation,
        note: `Webhook: ${explanation.userMessage} - ${explanation.recommendation}`
      };

    case 'UPDATE':
      logger.info(`🔄 Updating test cases for ${storyData.storyId}`);
      
      // Generate updated test cases
      testCases = await llmService.generateTestCases(
        `${storyData.summary}\n${storyData.description}`, 
        { existingTestCases: decision.existingRecord?.testCaseDetails }
      );
      
      // Update in Jira (future: implement Jira update logic here)
      // Placeholder: just use testCaseIds from generated test cases
      testCaseIds = testCases.map(tc => tc.testCaseId);
      // Update vector storage
      await vectorStorage.updateRecord(storyData.storyId, storyData.summary, storyData.description, {
        testCaseIds: testCaseIds,
        testCaseDetails: testCases,
        version: '2.0',
        projectId: storyData.project.key,
        webhookTrigger: true,
        lastWebhookEvent: storyData.webhookEvent,
        updateReason: decision.detailedReason || decision.reason
      });
      return {
        status: "success",
        message: "Test cases updated successfully via webhook",
        action: "updated",
        updateDetails: {
          reason: decision.detailedReason || decision.reason,
          changes: decision.changes,
          source: decision.duplicateSource
        },
        testCaseIds: testCaseIds,
        testCasesGenerated: testCases.length,
        storyId: storyData.storyId,
        triggerType: triggerType,
        note: "Webhook: Story content changed - test cases updated"
      };

    case 'NEW':
    default:
      logger.info(`🆕 Creating new test cases for ${storyData.storyId}`);
      // Generate new test cases
      testCases = await llmService.generateTestCases(
        `${storyData.summary}\n${storyData.description}`,
        { similarStories: decision.similarStories }
      );
      // Sequentially create in Jira and store locally after each success
      let createdTestCases = [];
      let failedTestCases = [];
      for (let i = 0; i < testCases.length; i++) {
        const testCase = testCases[i];
        try {
          const jiraResult = await jiraService.createTestCaseInJira(testCase);
          if (jiraResult.success) {
            // Store in local after each successful creation
            await vectorStorage.addRecord(
              storyData.storyId,
              storyData.summary,
              storyData.description,
              {
                testCaseIds: [jiraResult.jiraKey || jiraResult.testCaseId],
                testCaseDetails: [testCase],
                version: '1.0',
                projectId: storyData.project.key,
                webhookTrigger: true,
                jiraData: {
                  status: storyData.status,
                  assignee: storyData.assignee,
                  reporter: storyData.reporter,
                  created: storyData.created,
                  updated: storyData.updated
                },
                lastWebhookEvent: storyData.webhookEvent,
                duplicateChecks: decision.duplicateChecks
              }
            );
            createdTestCases.push(jiraResult);
          } else {
            logger.warn(`Jira creation failed for testCaseId ${testCase.testCaseId}: ${jiraResult.error}`);
            failedTestCases.push({ testCase, error: jiraResult.error });
          }
        } catch (err) {
          logger.error(`Exception during Jira creation for testCaseId ${testCase.testCaseId}: ${err.message}`);
          failedTestCases.push({ testCase, error: err.message });
        }
      }
      return {
        status: "success",
        message: "Test cases processed via webhook (Jira + local)",
        action: "created",
        testCasesGenerated: testCases.length,
        testCasesCreated: createdTestCases.length,
        testCasesFailed: failedTestCases.length,
        createdTestCases,
        failedTestCases,
        storyId: storyData.storyId,
        triggerType: triggerType,
        duplicateChecks: decision.duplicateChecks,
        note: "Webhook: New story processed - test cases generated and created in Jira sequentially"
      };
  }
}

// /**
//  * POST /simulate-webhook - Create simulated webhook for testing
//  * Useful for Postman testing without real Jira setup
//  */
// router.post('/simulate-webhook', async (req, res) => {
//   try {
//     const { eventType, storyData } = req.body;
//     
//     if (!eventType || !storyData) {
//       return res.status(400).json({
//         error: 'Missing required fields',
//         message: 'eventType and storyData are required',
//         example: {
//           eventType: 'created', // or 'updated'
//           storyData: {
//             storyId: 'PROJ-123',
//             summary: 'Test story',
//             description: 'Test description'
//           }
//         }
//       });
//     }
//
//     // Create simulated webhook payload
//     const webhookPayload = jiraService.createSimulatedWebhookPayload(eventType, storyData);
//     
//     // Process the simulated webhook
//     const mockReq = { body: webhookPayload };
//     const result = await new Promise((resolve, reject) => {
//       const mockRes = {
//         json: (data) => resolve(data),
//         status: (code) => ({ json: (data) => resolve({ statusCode: code, ...data }) })
//       };
//       
//       // Call the main webhook handler
//       router.handle(mockReq, mockRes, reject);
//     });
//
//     res.json({
//       status: 'simulation_success',
//       message: 'Simulated webhook processed successfully',
//       simulatedPayload: webhookPayload,
//       result: result,
//       timestamp: new Date().toISOString()
//     });
//
//   } catch (error) {
//     logger.error('Webhook simulation failed:', error.message);
//     res.status(500).json({
//       error: 'Webhook simulation failed',
//       message: error.message
//     });
//   }
// });

/**
 * GET /webhook-health - Webhook health check
 */
router.get('/webhook-health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'webhook-receiver',
    supportedEvents: Object.values(JIRA_EVENTS),
    simulationMode: jiraService.simulationMode,
    timestamp: new Date().toISOString()
  });
});

module.exports = router;
