// webhookReceiver.js
// Dedicated webhook server on port 3001 - simulates Jira webhook integration
require('dotenv').config({ path: './config/.env' });
const express = require('express');
const bodyParser = require('body-parser');
const logger = require('../../config/logger');

// Import all services
const { JiraService } = require('./jiraService');
const { DecisionEngine } = require('./decisionEngine');
const { LLMService } = require('./llmService');
const { VectorStorage } = require('./vectorStorage');
// const { ZephyrService } = require('./zephyrService'); // Not using Zephyr - direct Jira integration

class WebhookReceiver {
  constructor() {
    this.app = express();
    this.port = process.env.WEBHOOK_PORT || 3005;
    
    // Initialize services (Direct Jira integration - NO Zephyr)
    this.jiraService = new JiraService();
    this.decisionEngine = new DecisionEngine();
    this.llmService = new LLMService();
    this.vectorStorage = new VectorStorage();
    // this.zephyrService = new ZephyrService(); // Removed - using direct Jira
    
    this._setupMiddleware();
    this._setupRoutes();
  }

  /**
   * Initialize webhook receiver
   */
  async initialize() {
    try {
      // Initialize vector storage
      await this.vectorStorage.initialize();
      
      // Inject vectorStorage into LLMService for unique ID generation
      this.llmService.setVectorStorage(this.vectorStorage);
      
      logger.essential('🔗 Webhook receiver initialized');
      logger.info('✅ VectorStorage injected into LLMService');
      return true;
    } catch (error) {
      logger.error(`Webhook receiver initialization failed: ${error.message}`);
      return false;
    }
  }

  /**
   * Start webhook server
   */
  async start() {
    try {
      await this.initialize();
      
      this.app.listen(this.port, () => {
        logger.essential(`🚀 Webhook Receiver running on http://localhost:${this.port}`);
        logger.essential(`📥 Ready to receive Jira webhooks at /jira-webhook`);
        logger.essential(`🧪 Test endpoints available at /test/*`);
      });
    } catch (error) {
      logger.error(`Failed to start webhook receiver: ${error.message}`);
    }
  }

  /**
   * Setup Express middleware
   * @private
   */
  _setupMiddleware() {
    // Enhanced body parsing for Jira webhooks
    this.app.use(express.json({ 
      limit: '50mb',
      verify: (req, res, buf) => {
        req.rawBody = buf;
      }
    }));
    this.app.use(express.urlencoded({ 
      extended: true, 
      limit: '50mb' 
    }));
    
    // Add raw body parser for webhook verification
    this.app.use('/jira-webhook', (req, res, next) => {
      if (req.method === 'POST') {
        logger.info('req body parser '+JSON.stringify(req));
        logger.info('res body parser '+JSON.stringify(res));
        logger.info(`📥 Receiving Jira webhook: ${req.headers['content-type'] || 'unknown content-type'}`);
        logger.debug(`Headers: ${JSON.stringify(req.headers, null, 2)}`);
        logger.debug(`Body size: ${req.rawBody ? req.rawBody.length : 'unknown'} bytes`);
      }
      next();
    });
    
    // Enhanced request logging
    this.app.use((req, res, next) => {
      logger.debug(`${req.method} ${req.path} - ${req.ip}`);
      next();
    });
    
    // Error handling for malformed requests
    this.app.use((error, req, res, next) => {
      if (error instanceof SyntaxError && error.status === 400 && 'body' in error) {
        logger.error('Bad JSON payload received');
        return res.status(400).json({ 
          error: 'Invalid JSON payload',
          message: 'Request body contains malformed JSON'
        });
      }
      next();
    });
  }

  /**
   * Setup API routes
   * @private
   */
  _setupRoutes() {
    // Jira webhook endpoint with query parameters (for ngrok URL format)
    logger.info("this is req from web "+ JSON.stringify(this.req) || "no req");
     logger.info("this is res from web "+ JSON.stringify(this.res));
      logger.info("this is from web "+ JSON.stringify(this.app));
    this.app.post('/jira-webhook', this._handleJiraWebhookWithParams.bind(this));
    
    // GET handler for jira-webhook endpoint (for validation/testing)
   

    this.app.get('/jira-webhook', (req, res) => {
      // Log request data (safe serializable parts)
      logger.info('GET /jira-webhook request: ' + JSON.stringify({
        method: req.method,
        url: req.originalUrl,
        headers: req.headers,
        query: req.query,
        ip: req.ip
      }, null, 2));

      const responseBody = {
        status: 'ready',
        message: 'Jira webhook endpoint is ready to receive POST requests',
        timestamp: new Date().toISOString(),
        queryParams: req.query,
        note: 'This endpoint accepts POST requests with Jira webhook payloads'
      };

      // Log response data
      logger.info('GET /jira-webhook response: ' + JSON.stringify(responseBody, null, 2));
      res.json(responseBody);
    });

    
    // Simple POST test endpoint for Jira webhook testing
    this.app.post('/jira-webhook/test', (req, res) => {
      logger.info('🧪 Test POST received at /jira-webhook/test');
      res.json({
        status: 'test-success',
        message: 'POST request received successfully',
        timestamp: new Date().toISOString(),
        bodyReceived: !!req.body,
        bodySize: JSON.stringify(req.body).length,
        headers: req.headers
      });
    });
    
    // Health check for jira-webhook endpoint
    this.app.get('/jira-webhook/health', (req, res) => {
      res.json({ 
        status: 'healthy', 
        timestamp: new Date().toISOString(),
        service: 'AI Test Generation Webhook (Jira Format)',
        version: '2.0.0',
        supportedParams: ['issueKey', 'projectKey', 'user']
      });
    });
    
    // Health check for jira-webhook endpoint
    this.app.get('/jira-webhook/health', (req, res) => {
      res.json({ 
        status: 'healthy', 
        timestamp: new Date().toISOString(),
        service: 'AI Test Generation Webhook (Jira Format)',
        version: '2.0.0',
        supportedParams: ['issueKey', 'projectKey', 'user']
      });
    });
    
    // Utility endpoints
    this.app.get('/health', this._handleHealth.bind(this));
    this.app.get('/stats', this._handleStats.bind(this));
    
    // Error handling
    this.app.use(this._handleErrors.bind(this));
  }

  /**
   * Jira webhook handler with query parameters - processes webhooks with URL params
   * Format: /jira-webhook?issueKey={issue.key}&projectKey={project.key}&user={modifiedUser.accountId}
   */
  async _handleJiraWebhookWithParams(req, res) {
    const startTime = Date.now();
    
    try {
      // Enhanced logging for production debugging
      logger.info('📥 Received Jira webhook with query parameters');
      logger.info(`Request Content-Length: ${req.headers['content-length'] || 'unknown'}`);
      logger.debug(`Query Parameters: ${JSON.stringify(req.query, null, 2)}`);
      logger.debug(`Webhook Headers: ${JSON.stringify(req.headers, null, 2)}`);
      
      // Check if request body exists and is complete
      if (!req.body || Object.keys(req.body).length === 0) {
        logger.warn('❌ Empty or incomplete request body received');
        return res.status(400).json({
          error: 'Empty request body',
          message: 'Webhook payload is empty or incomplete. Check Jira webhook configuration.',
          contentLength: req.headers['content-length'],
          timestamp: new Date().toISOString()
        });
      }
      
      logger.debug(`Webhook Payload: ${JSON.stringify(req.body, null, 2)}`);
      
      // Extract query parameters
      const { issueKey, projectKey, user } = req.query;
      
      if (!issueKey) {
        logger.warn('❌ Missing required issueKey parameter');
        return res.status(400).json({
          error: 'Missing required parameter',
          message: 'issueKey parameter is required in URL query string',
          timestamp: new Date().toISOString()
        });
      }
      
      // Enhanced webhook payload validation
      if (!this.jiraService.validateWebhookPayload(req.body)) {
        logger.warn('❌ Webhook validation failed');
        return res.status(400).json({
          error: 'Invalid webhook payload',
          message: 'Webhook validation failed',
          timestamp: new Date().toISOString()
        });
      }
      
      // Extract story data from webhook (same extraction as main webhook)
      const storyData = this.jiraService.extractStoryFromWebhook(req.body);
      
      // Enhance story data with query parameters
      storyData.queryParams = {
        issueKey,
        projectKey,
        user
      };
      logger.info('storyData body parser '+JSON.stringify(storyData));
      
      logger.info(`📋 Processing story: ${storyData.storyId} - ${storyData.summary}`);
      logger.info(`🎯 Event Type: ${storyData.eventType} (${storyData.webhookEvent})`);
      logger.info(`🔗 Query Params: issueKey=${issueKey}, projectKey=${projectKey}, user=${user}`);
      
      // Process the story through the complete pipeline (same as main webhook)
      const result = await this._processStoryPipeline(storyData);
      
      const processingTime = Date.now() - startTime;
      result.processingTime = `${processingTime}ms`;
      result.timestamp = new Date().toISOString();
      result.queryParams = storyData.queryParams;
      
      logger.essential(`✅ Jira webhook with params processed successfully in ${processingTime}ms`);
      res.json(result);
      
    } catch (error) {
      logger.error(`Jira webhook with params processing failed: ${error.message}`);
      res.status(500).json({
        error: 'Webhook processing failed',
        message: error.message,
        processingTime: `${Date.now() - startTime}ms`,
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Core story processing pipeline
   * @private
   */
  async _processStoryPipeline(storyData) {
    const { storyId, summary, description } = storyData;
    
    // Step 1: Decision Engine - NEW/UPDATE/DUPLICATE
    logger.info('🤔 Running decision engine...');
    const decision = await this.decisionEngine.makeDecision(
      storyId, 
      summary, 
      description, 
      this.vectorStorage.getTable()
    );
    
    logger.info(`📊 Decision: ${this.decisionEngine.getDecisionSummary(decision)}`);
    
    // Step 2: Process based on decision
    switch (decision.action) {
      case 'NEW':
        return await this._processNewStory(storyData, decision);
        
      case 'UPDATE':
        return await this._processUpdateStory(storyData, decision);
        
      case 'DUPLICATE':
        return await this._processDuplicateStory(storyData, decision);
        
      default:
        throw new Error(`Unknown decision action: ${decision.action}`);
    }
  }

  /**
   * Process new story
   * @private
   */
  async _processNewStory(storyData, decision) {
    const { storyId, summary, description } = storyData;
    
    // Generate test cases using AI
    let testCases = [];
    try {
      testCases = await this.llmService.generateTestCases(`${summary}\n${description}`, {
        vectorSimilarities: decision.similarStories || [],
        storyId: storyId,
        projectId: storyData.project?.key
      });
      logger.info(`🤖 Generated ${testCases.length} AI test cases`);
    } catch (error) {
      logger.warn(`AI generation failed, using fallback: ${error.message}`);
      testCases = await this.llmService.generateFallbackTestCases(summary, description, storyId, storyData.project?.key);
    }
    
    // Create test cases directly in Jira (NO Zephyr)
    logger.info(`📝 Creating ${testCases.length} test cases directly in Jira...`);
    let jiraTestCases = [];
    let testCaseIds = [];
    
    try {
  jiraTestCases = await this.jiraService.createMultipleTestCases(testCases);
  testCaseIds = jiraTestCases.map(tc => tc.jiraKey || tc.localId); // Use Jira keys as primary IDs
  logger.info(`✅ Successfully created ${jiraTestCases.length} test cases in Jira`);
    } catch (error) {
      logger.warn(`Jira test case creation failed, using local-only storage: ${error.message}`);
      // Fallback to local test case IDs only
      testCaseIds = testCases.map(tc => tc.testCaseId);
      jiraTestCases = testCases.map((testCase, index) => ({
        localId: testCase.testCaseId,
        jiraKey: `${storyId}-TC-${index + 1}`, // Simulated format
        jiraId: null,
        summary: testCase.summary || testCase.description,
        createdVia: 'webhook-fallback',
        jiraUrl: `https://nikhilnandigoud.atlassian.net/browse/${storyId}-TC-${index + 1}`,
        status: 'local-only',
        note: 'Created locally - Jira creation failed'
      }));
    }
    
    // Store in vector database
    await this.vectorStorage.addRecord(storyId, summary, description, {
      testCaseIds: testCaseIds,
      testCaseDetails: testCases,
      jiraTestCases: jiraTestCases, // NEW: Store Jira mappings
      createdVia: 'webhook', // NEW: Track creation method
      version: '1.0',
      projectId: storyData.project?.key || 'PROJ',
      jiraIssueKey: storyId,
      jiraProjectKey: storyData.project?.key || 'PROJ'
    });
    
    return {
      status: 'success',
      action: 'NEW',
      storyId: storyId,
      testCaseIds: testCaseIds,
      testCasesGenerated: testCases.length,
      message: `New story processed successfully - ${testCases.length} test cases generated`,
      details: {
        aiGenerated: testCases.length > 0,
        similarStoriesFound: decision.similarStories?.length || 0,
        zephyrIntegration: 'simulated'
      }
    };
  }

  /**
   * Process story update
   * @private
   */
  async _processUpdateStory(storyData, decision) {
    const { storyId, summary, description } = storyData;
    const existingRecord = decision.existingRecord;
    
    // Update test cases using AI (regenerate based on new description)
    let testCases = [];
    try {
      logger.info(`🔄 Updating test cases based on new description...`);
      testCases = await this.llmService.updateTestCases(
        `${summary}\n${description}`, 
        existingRecord.testCaseDetails || []
      );
      logger.info(`🔄 Updated ${testCases.length} AI test cases`);
    } catch (error) {
      logger.warn(`AI update failed, regenerating: ${error.message}`);
      testCases = await this.llmService.generateTestCases(`${summary}\n${description}`, {
        storyId: storyId,
        projectId: storyData.project?.key
      });
    }
    
    // Update test cases directly in Jira (NO Zephyr)
    logger.info(`📝 Updating test cases directly in Jira...`);
    let updatedJiraTestCases = [];
    let testCaseIds = [];
    
    try {
  logger.info(`📝 Updating ${testCases.length} test cases in Jira...`);
  updatedJiraTestCases = await this.jiraService.updateMultipleTestCases(testCases);
  testCaseIds = updatedJiraTestCases.map(tc => tc.jiraKey || tc.localId); // Use Jira keys as primary IDs
  logger.info(`✅ Successfully updated ${updatedJiraTestCases.length} test cases in Jira`);
    } catch (error) {
      logger.warn(`Jira test case update failed: ${error.message}`);
      // Keep existing mappings if update fails
      updatedJiraTestCases = existingRecord.jiraTestCases || [];
      testCaseIds = existingRecord.testCaseIds || [];
    }
    
    // Update vector database with new test cases and Jira mappings
    await this.vectorStorage.updateRecord(storyId, summary, description, {
      testCaseIds: testCaseIds,
      testCaseDetails: testCases,
      jiraTestCases: updatedJiraTestCases, // Updated Jira mappings
      lastUpdated: new Date().toISOString(),
      version: (parseFloat(existingRecord.metadata?.version || '1.0') + 0.1).toFixed(1)
    });
    
    return {
      status: 'success',
      action: 'UPDATE',
      storyId: storyId,
      testCaseIds: testCaseIds,
      testCasesGenerated: testCases.length,
      message: `Story updated successfully - ${testCases.length} test cases updated`,
      changes: decision.changes,
      details: {
        previousVersion: existingRecord.metadata?.version || '1.0',
        aiGenerated: testCases.length > 0,
        zephyrIntegration: 'simulated'
      }
    };
  }

  /**
   * Process duplicate story
   * @private
   */
  async _processDuplicateStory(storyData, decision) {
    const existingRecord = decision.existingRecord;
    
    return {
      status: 'success',
      action: 'DUPLICATE',
      storyId: storyData.storyId,
      duplicateOf: decision.duplicateOf,
      duplicateType: decision.duplicateType,
      testCaseIds: existingRecord.testCaseIds || [],
      testCasesGenerated: 0,
      message: decision.reason,
      similarity: decision.similarity,
      details: {
        duplicatePrevention: true,
        existingTestCases: existingRecord.testCaseIds?.length || 0,
        originalStory: decision.duplicateOf
      }
    };
  }

  /**
   * Health check endpoint
   */
  _handleHealth(req, res) {
    res.json({
      status: 'healthy',
      service: 'webhook-receiver',
      port: this.port,
      timestamp: new Date().toISOString(),
      vectorStorage: this.vectorStorage.isInitialized
    });
  }

  /**
   * Statistics endpoint
   */
  _handleStats(req, res) {
    const stats = this.vectorStorage.getTableStats();
    res.json({
      status: 'success',
      stats: stats,
      services: {
        jira: this.jiraService.simulationMode ? 'simulation' : 'connected',
        zephyr: this.zephyrService.simulationMode ? 'simulation' : 'connected',
        vectorStorage: this.vectorStorage.isInitialized ? 'initialized' : 'not_initialized'
      }
    });
  }

  /**
   * Simulate webhook endpoint (alternative to test endpoints)
   */
  async _handleSimulateWebhook(req, res) {
    try {
      const { eventType = 'created', storyData } = req.body;
      
      if (!storyData || !storyData.storyId) {
        return res.status(400).json({
          error: 'Missing storyData with storyId'
        });
      }
      
      const webhookPayload = this.jiraService.createSimulatedWebhookPayload(eventType, storyData);
      
      req.body = webhookPayload;
      return this._handleWebhook(req, res);
      
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * Error handling middleware
   */
  _handleErrors(err, req, res, next) {
    logger.error(`Webhook server error: ${err.message}`);
    res.status(500).json({
      error: 'Internal server error',
      message: err.message
    });
  }
}

// Export for direct usage
module.exports = { WebhookReceiver };

// Start server if this file is run directly
if (require.main === module) {
  const webhookReceiver = new WebhookReceiver();
  webhookReceiver.start();
}
