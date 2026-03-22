// jiraService.js
// Jira REST API service for webhook simulation, story fetching, and test case creation
const axios = require('axios');
const logger = require('../../config/logger');

class JiraService {
  /**
   * Update a single test case in Jira using REST API
   * @param {Object} testCase - Test case data (must include jiraKey)
   * @returns {Promise<Object>} Update result
   */
  async updateTestCaseInJira(testCase) {
    if (this.simulationMode) {
      return { success: true, jiraKey: testCase.jiraKey, testCaseId: testCase.testCaseId, simulation: true };
    }
    if (!testCase.jiraKey) {
      return { success: false, error: 'Missing jiraKey for update', testCaseId: testCase.testCaseId };
    }
    try {
      // Prepare Jira payload (only updating summary/description for simplicity)
      const jiraPayload = {
        fields: {
          summary: testCase.description || testCase.title || testCase.summary || 'Updated Test Case',
          description: this.formatDescriptionForJira(testCase)
        }
      };
      logger.info(`Updating Jira issue for test case: ${testCase.testCaseId} (${testCase.jiraKey})`);
      const response = await this.axiosInstance.put(`/rest/api/3/issue/${testCase.jiraKey}`, jiraPayload);
      logger.info(`✅ Successfully updated Jira issue: ${testCase.jiraKey}`);
      return { success: true, jiraKey: testCase.jiraKey, testCaseId: testCase.testCaseId };
    } catch (error) {
      logger.error(`Failed to update Jira issue for ${testCase.testCaseId}:`, error.message);
      let errorMessage = error.message;
      if (error.response && error.response.data) {
        if (error.response.data.errorMessages) {
          errorMessage = error.response.data.errorMessages.join(', ');
        } else if (error.response.data.errors) {
          errorMessage = Object.values(error.response.data.errors).join(', ');
        }
      }
      return { success: false, error: errorMessage, testCaseId: testCase.testCaseId };
    }
  }

  /**
   * Batch update multiple test cases in Jira
   * @param {Array} testCases - Array of test case objects (must include jiraKey)
   * @returns {Promise<Array>} Array of update results
   */
  async updateMultipleTestCases(testCases) {
    if (!Array.isArray(testCases)) {
      throw new Error('testCases must be an array');
    }
    logger.info(`Updating ${testCases.length} test cases in Jira (Simulation: ${this.simulationMode})`);
    const results = [];
    for (const testCase of testCases) {
      try {
        const result = await this.updateTestCaseInJira(testCase);
        results.push(result);
        // 10 second delay between updates
        await new Promise(resolve => setTimeout(resolve, 10000));
      } catch (error) {
        logger.error(`Error updating test case ${testCase.testCaseId}:`, error.message);
        results.push({ success: false, error: error.message, testCaseId: testCase.testCaseId });
      }
    }
    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);
    logger.info(`\n  Jira Test Case Update Summary:\n  ✅ Successfully updated: ${successful.length}\n  ❌ Failed: ${failed.length}\n  Simulation Mode: ${this.simulationMode}\n  ${failed.length > 0 ? '\nFailed test cases:\n' + failed.map(f => `- ${f.testCaseId}: ${f.error}`).join('\n') : ''}\n`);
    return results;
  }
  constructor() {
    // Primary Jira configuration (for stories and general API)
    this.jiraUrl = process.env.JIRA_URL || process.env.JIRA_BASE_URL || process.env.ZEPHYR_URL || "https://nikhilnandigoud.atlassian.net";
    this.authToken = process.env.JIRA_API_TOKEN || process.env.JIRA_TOKEN || "dummy-token";
    
    // Jira REST API configuration (for test case creation)
    this.jiraBaseUrl = process.env.JIRA_BASE_URL || process.env.ZEPHYR_URL || "https://nikhilnandigoud.atlassian.net";
    this.jiraEmail = process.env.JIRA_EMAIL || process.env.JIRA_USERNAME;
    this.jiraApiToken = process.env.JIRA_API_TOKEN || process.env.ZEPHYR_TOKEN;
    this.projectKey = process.env.JIRA_PROJECT_KEY || process.env.ZEPHYR_PROJECT_KEY;
    
    // Determine simulation mode
    this.simulationMode = !this.jiraEmail || !this.jiraApiToken || this.jiraApiToken === "dummy-token";
    
    if (this.simulationMode) {
      logger.info('JiraService running in simulation mode');
    }

    // Create axios instance for test case creation with proper authentication
    if (!this.simulationMode) {
      this.axiosInstance = axios.create({
        baseURL: this.jiraBaseUrl,
        timeout: 30000,
        auth: {
          username: this.jiraEmail,
          password: this.jiraApiToken
        },
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        }
      });
    }
  }

  /**
   * Fetch story details from Jira by story ID
   * @param {string} storyId - Jira issue key
   * @returns {Promise<object>} Story details
   */
  async fetchStoryDetails(storyId) {
    try {
      if (this.simulationMode) {
        return this._simulateStoryFetch(storyId);
      }

      // Real Jira API call
      const response = await axios.get(
        `${this.jiraUrl}/rest/api/2/issue/${storyId}`,
        {
          headers: {
            'Authorization': `Bearer ${this.authToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

      return this._formatJiraResponse(response.data);

    } catch (error) {
      logger.warn(`Jira fetch failed for ${storyId}: ${error.message}`);
      return this._simulateStoryFetch(storyId);
    }
  }

  /**
   * Search Jira for existing stories with similar content
   * @param {string} summary - Story summary to search for
   * @param {string} projectKey - Jira project key
   * @returns {Promise<Array>} Array of similar stories
   */
  async searchSimilarStories(summary, projectKey = 'PROJ') {
    try {
      if (this.simulationMode) {
        return this._simulateSearchResults(summary, projectKey);
      }

      // Real Jira JQL search
      const jql = `project = ${projectKey} AND summary ~ "${summary.split(' ').slice(0, 3).join(' ')}"`;
      const response = await axios.get(
        `${this.jiraUrl}/rest/api/2/search`,
        {
          params: { jql, maxResults: 10 },
          headers: {
            'Authorization': `Bearer ${this.authToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

      return response.data.issues.map(issue => this._formatJiraResponse(issue));

    } catch (error) {
      logger.warn(`Jira search failed: ${error.message}`);
      return [];
    }
  }

  /**
   * Search for duplicate issues in Jira by story ID and content
   * @param {string} storyId - Story ID to check for duplicates
   * @param {string} summary - Story summary
   * @param {string} description - Story description
   * @param {string} projectKey - Jira project key (default: DEC)
   * @returns {Promise<Object>} Duplicate check result
   */
  async searchForDuplicateIssues(storyId, summary, description, projectKey = 'DEC') {
    try {
      if (this.simulationMode) {
        return this._simulateDuplicateSearch(storyId, summary, description, projectKey);
      }

      logger.info(`🔍 Searching Jira for duplicates of story: ${storyId}`);
      
      const duplicateChecks = [];

      // 1. Check for exact story ID match
      if (storyId) {
        try {
          const exactMatch = await this._searchByStoryId(storyId, projectKey);
          if (exactMatch) {
            duplicateChecks.push({
              type: 'EXACT_STORY_ID',
              confidence: 100,
              reason: `Story ID "${storyId}" already exists in Jira`,
              existingIssue: exactMatch,
              matchField: 'storyId'
            });
          }
        } catch (error) {
          logger.debug(`Story ID search failed: ${error.message}`);
        }
      }

      // 2. Check for exact summary match
      if (summary) {
        const summaryMatches = await this._searchBySummary(summary, projectKey);
        if (summaryMatches.length > 0) {
          duplicateChecks.push({
            type: 'EXACT_SUMMARY',
            confidence: 95,
            reason: `Summary "${summary}" matches existing Jira issue`,
            existingIssue: summaryMatches[0],
            matchField: 'summary',
            allMatches: summaryMatches
          });
        }
      }

      // 3. Check for similar description content
      if (description && description.length > 50) {
        const descriptionMatches = await this._searchByDescription(description, projectKey);
        if (descriptionMatches.length > 0) {
          duplicateChecks.push({
            type: 'SIMILAR_DESCRIPTION',
            confidence: 85,
            reason: `Description content similar to existing Jira issue`,
            existingIssue: descriptionMatches[0],
            matchField: 'description',
            allMatches: descriptionMatches
          });
        }
      }

      // Return the highest confidence duplicate
      if (duplicateChecks.length > 0) {
        const topDuplicate = duplicateChecks.sort((a, b) => b.confidence - a.confidence)[0];
        
        return {
          isDuplicate: true,
          duplicateType: topDuplicate.type,
          confidence: topDuplicate.confidence,
          reason: topDuplicate.reason,
          existingIssue: topDuplicate.existingIssue,
          matchField: topDuplicate.matchField,
          allDuplicateChecks: duplicateChecks,
          searchedIn: 'JIRA',
          projectKey: projectKey
        };
      }

      logger.info(`✅ No duplicates found in Jira for story: ${storyId}`);
      return {
        isDuplicate: false,
        reason: 'No duplicates found in Jira',
        searchedIn: 'JIRA',
        projectKey: projectKey,
        checksPerformed: ['storyId', 'summary', 'description']
      };

    } catch (error) {
      logger.error(`Jira duplicate search failed: ${error.message}`);
      return {
        isDuplicate: false,
        error: error.message,
        reason: 'Jira search failed - proceeding with local checks only',
        searchedIn: 'JIRA_FAILED'
      };
    }
  }

  /**
   * Validate webhook payload (simulate Jira webhook signature validation)
   * @param {object} payload - Webhook payload
   * @param {string} signature - Webhook signature (optional)
   * @returns {boolean} Validation result
   */
  validateWebhookPayload(payload, signature = null) {
    // Simulate webhook validation
      const fieldsIssueId = payload.issue.fields.issuetype.id;
      if(fieldsIssueId !== "10020"){
        logger.warn(`Invalid issue type ID: ${fieldsIssueId}`);
        return false;
      }

    if (!payload || !payload.webhookEvent || !payload.issue) {
      logger.warn('Invalid webhook payload: missing required fields');
      return false;
    }

    // Simulate signature validation (would be real HMAC validation in production)
    if (signature && this.simulationMode) {
      logger.debug('Simulated webhook signature validation passed');
    }

    logger.debug(`Webhook validation passed for event: ${payload.webhookEvent}`);
    return true;
  }

  /**
   * Extract story data from webhook payload
   * @param {object} webhookPayload - Jira webhook payload
   * @returns {object} Extracted story data
   */
  extractStoryFromWebhook(webhookPayload) {
    try {
      const issue = webhookPayload.issue;
      const fields = issue.fields;
      const fieldsIssueId = fields.issuetype.id;
      logger.info('fieldsIssueId: ' + JSON.stringify(fieldsIssueId));  
     if(fieldsIssueId === "10020"){
       return {
        storyId: issue.key,
        summary: fields.summary || '',
        description: fields.description || '',
        status: fields.status?.name || 'Unknown',
        assignee: fields.assignee?.displayName || 'Unassigned',
        reporter: fields.reporter?.displayName || 'Unknown',
        created: fields.created || new Date().toISOString(),
        updated: fields.updated || new Date().toISOString(),
        project: {
          key: fields.project?.key || 'PROJ',
          name: fields.project?.name || 'Project'
        },
        webhookEvent: webhookPayload.webhookEvent,
        eventType: this._determineEventType(webhookPayload.webhookEvent)
      };
     }

    } catch (error) {
      logger.error(`Failed to extract story from webhook: ${error.message}`);
      throw new Error(`Invalid webhook payload: ${error.message}`);
    }
  }

  /**
   * Create test Jira webhook payload for simulation
   * @param {string} eventType - Type of event (created/updated)
   * @param {object} storyData - Story data
   * @returns {object} Simulated webhook payload
   */
  createSimulatedWebhookPayload(eventType, storyData) {
    const webhookEvent = eventType === 'created' ? 'jira:issue_created' : 'jira:issue_updated';
    
    return {
      timestamp: Date.now(),
      webhookEvent: webhookEvent,
      user: {
        self: `${this.jiraUrl}/rest/api/2/user?username=automation`,
        name: "automation-system",
        displayName: "Test Automation System"
      },
      issue: {
        id: `${Math.floor(Math.random() * 10000)}`,
        key: storyData.storyId,
        self: `${this.jiraUrl}/rest/api/2/issue/${storyData.storyId}`,
        fields: {
          summary: storyData.summary,
          description: storyData.description,
          status: {
            self: `${this.jiraUrl}/rest/api/2/status/1`,
            name: "To Do",
            id: "1"
          },
          priority: {
            self: `${this.jiraUrl}/rest/api/2/priority/3`,
            name: "Medium",
            id: "3"
          },
          project: {
            self: `${this.jiraUrl}/rest/api/2/project/PROJ`,
            key: "PROJ",
            name: "Test Automation Project"
          },
          issuetype: {
            self: `${this.jiraUrl}/rest/api/2/issuetype/10001`,
            name: "Story",
            id: "10001"
          },
          reporter: {
            self: `${this.jiraUrl}/rest/api/2/user?username=automation`,
            name: "automation-system",
            displayName: "Test Automation System"
          },
          assignee: {
            self: `${this.jiraUrl}/rest/api/2/user?username=dev-team`,
            name: "dev-team",
            displayName: "Development Team"
          },
          created: new Date().toISOString(),
          updated: new Date().toISOString()
        }
      },
      changelog: eventType === 'updated' ? {
        id: "12345",
        items: [
          {
            field: "summary",
            fieldtype: "jira",
            from: null,
            fromString: "Old summary",
            to: null,
            toString: storyData.summary
          }
        ]
      } : undefined
    };
  }

  /**
   * Simulate story fetch for demo/testing
   * @private
   */
  _simulateStoryFetch(storyId) {
    logger.debug(`🎭 Simulating Jira story fetch for: ${storyId}`);
    
    const simulatedStories = {
      'PROJ-123': {
        summary: 'As a user, I want to login to the system',
        description: 'User should be able to login with email and password. System should validate credentials and show appropriate error messages for invalid inputs.'
      },
      'PROJ-124': {
        summary: 'As a user, I want to reset my password',
        description: 'User should be able to request password reset via email. System should send reset link and allow password change with proper validation.'
      },
      'PROJ-125': {
        summary: 'As an admin, I want to manage user accounts',
        description: 'Admin should be able to create, update, and delete user accounts. System should enforce proper permissions and audit trail.'
      }
    };

    const storyData = simulatedStories[storyId] || {
      summary: `Simulated story for ${storyId}`,
      description: 'This is a simulated story description for testing purposes. The system should handle this gracefully.'
    };

    return {
      key: storyId,
      fields: {
        summary: storyData.summary,
        description: storyData.description,
        status: { name: "In Progress" },
        assignee: { displayName: "Test User" },
        reporter: { displayName: "Product Owner" },
        created: new Date(Date.now() - 86400000).toISOString(),
        updated: new Date().toISOString(),
        project: {
          key: "PROJ",
          name: "Test Automation Project"
        }
      }
    };
  }

  /**
   * Simulate search results
   * @private
   */
  _simulateSearchResults(summary, projectKey) {
    logger.debug(`🔍 Simulating Jira search for: ${summary}`);
    
    // Return empty array for simulation
    return [];
  }

  /**
   * Search for issue by exact story ID
   * @private
   */
  async _searchByStoryId(storyId, projectKey) {
    try {
      // Try to get the issue directly by key
      const response = await this.axiosInstance.get(`/rest/api/3/issue/${storyId}`);
      return this._formatJiraResponse(response.data);
    } catch (error) {
      if (error.response && error.response.status === 404) {
        // Issue not found - not a duplicate
        return null;
      }
      throw error;
    }
  }

  /**
   * Search for issues with exact summary match
   * @private
   */
  async _searchBySummary(summary, projectKey) {
    try {
      // Escape quotes in summary for JQL
      const escapedSummary = summary.replace(/"/g, '\\"');
      const jql = `project = "${projectKey}" AND summary ~ "${escapedSummary}"`;
      
      const response = await this.axiosInstance.get('/rest/api/3/search', {
        params: { 
          jql: jql,
          maxResults: 5,
          fields: 'summary,description,status,assignee,reporter,created,updated,project'
        }
      });

      return response.data.issues.map(issue => this._formatJiraResponse(issue));
    } catch (error) {
      logger.warn(`Summary search failed: ${error.message}`);
      return [];
    }
  }

  /**
   * Search for issues with similar description content
   * @private
   */
  async _searchByDescription(description, projectKey) {
    try {
      // Extract key words from description for search
      const keywords = description
        .toLowerCase()
        .replace(/[^\w\s]/g, ' ')
        .split(/\s+/)
        .filter(word => word.length > 3)
        .slice(0, 3)
        .join(' AND ');

      if (!keywords) return [];

      const jql = `project = "${projectKey}" AND description ~ "${keywords}"`;
      
      const response = await this.axiosInstance.get('/rest/api/3/search', {
        params: { 
          jql: jql,
          maxResults: 5,
          fields: 'summary,description,status,assignee,reporter,created,updated,project'
        }
      });

      return response.data.issues.map(issue => this._formatJiraResponse(issue));
    } catch (error) {
      logger.warn(`Description search failed: ${error.message}`);
      return [];
    }
  }

  /**
   * Simulate duplicate search for testing
   * @private
   */
  _simulateDuplicateSearch(storyId, summary, description, projectKey) {
    logger.debug(`🎭 Simulating Jira duplicate search for: ${storyId}`);
    
    // For simulation, randomly return some duplicates for testing
    const shouldSimulateDuplicate = Math.random() < 0.2; // 20% chance of simulated duplicate
    
    if (shouldSimulateDuplicate) {
      return {
        isDuplicate: true,
        duplicateType: 'SIMULATED_DUPLICATE',
        confidence: 85,
        reason: `[SIMULATION] Story "${storyId}" appears to be a duplicate`,
        existingIssue: {
          storyId: `${projectKey}-${Math.floor(Math.random() * 100) + 1}`,
          summary: summary,
          description: 'This is a simulated existing issue for testing',
          status: 'In Progress',
          url: `https://nikhilnandigoud.atlassian.net/browse/${projectKey}-${Math.floor(Math.random() * 100) + 1}`
        },
        matchField: 'summary',
        searchedIn: 'JIRA_SIMULATION'
      };
    }

    return {
      isDuplicate: false,
      reason: '[SIMULATION] No duplicates found',
      searchedIn: 'JIRA_SIMULATION',
      projectKey: projectKey
    };
  }

  /**
   * Format Jira API response to standard format
   * @private
   */
  _formatJiraResponse(jiraIssue) {
    return {
      storyId: jiraIssue.key,
      summary: jiraIssue.fields.summary || '',
      description: jiraIssue.fields.description || '',
      status: jiraIssue.fields.status?.name || 'Unknown',
      assignee: jiraIssue.fields.assignee?.displayName || 'Unassigned',
      reporter: jiraIssue.fields.reporter?.displayName || 'Unknown',
      created: jiraIssue.fields.created,
      updated: jiraIssue.fields.updated,
      project: {
        key: jiraIssue.fields.project?.key || 'PROJ',
        name: jiraIssue.fields.project?.name || 'Project'
      }
    };
  }

  /**
   * Determine event type from webhook event name
   * @private
   */
  _determineEventType(webhookEvent) {
    switch (webhookEvent) {
      case 'jira:issue_created':
        return 'CREATED';
      case 'jira:issue_updated':
        return 'UPDATED';
      case 'jira:issue_deleted':
        return 'DELETED';
      default:
        return 'UNKNOWN';
    }
  }

  // ===================================================================
  // TEST CASE CREATION METHODS (New Jira REST API Integration)
  // ===================================================================

  /**
   * Validate test case data before sending to Jira
   * @param {Object} testCase - Test case object
   * @returns {Array} Array of validation errors
   */
  validateTestCase(testCase) {
    const errors = [];
    
    if (!testCase.description && !testCase.title && !testCase.summary) {
      errors.push('Test case must have a description, title, or summary');
    }
    
    if (testCase.priority && !['Highest', 'High', 'Medium', 'Low', 'Lowest'].includes(testCase.priority)) {
      errors.push('Priority must be one of: Highest, High, Medium, Low, Lowest');
    }
    
    return errors;
  }

  /**
   * Create test case in Jira using REST API
   * @param {Object} testCase - Test case data
   * @returns {Promise<Object>} Created issue response
   */
  async createTestCaseInJira(testCase) {
    if (this.simulationMode) {
      return this.simulateJiraCreation(testCase);
    }

    try {
      // Validate test case
      const validationErrors = this.validateTestCase(testCase);
      if (validationErrors.length > 0) {
        throw new Error(`Validation failed: ${validationErrors.join(', ')}`);
      }
      console.log("testcase " + JSON.stringify(testCase));
      // Prepare Jira payload using the simplified format (no labels required)
      const jiraPayload = {
        fields: {
          summary: testCase.description || testCase.title || testCase.summary || 'New Test Case',
          issuetype: {
            id: "10023"  // Tests issue type ID
          },
          project: {
            id: "10036"  // DEC project ID
          },
          description: this.formatDescriptionForJira(testCase)
        }
      };

      logger.info(`Creating Jira issue for test case: ${testCase.testCaseId}`);
      
      // Create issue in Jira
      
      const response = await this.axiosInstance.post('/rest/api/3/issue', jiraPayload);
      
      const issueKey = response.data.key;
      const issueId = response.data.id;
      
      logger.info(`✅ Successfully created Jira issue: ${issueKey} (ID: ${issueId})`);
      
      return {
        success: true,
        jiraKey: issueKey,
        jiraId: issueId,
        testCaseId: testCase.testCaseId,
        url: `${this.jiraBaseUrl}/browse/${issueKey}`
      };

    } catch (error) {
      logger.error(`Failed to create Jira issue for ${testCase.testCaseId}:`, error.message);
      
      // Extract meaningful error message
      let errorMessage = error.message;
      if (error.response && error.response.data) {
        if (error.response.data.errorMessages) {
          errorMessage = error.response.data.errorMessages.join(', ');
        } else if (error.response.data.errors) {
          errorMessage = Object.values(error.response.data.errors).join(', ');
        }
      }
      
      return {
        success: false,
        error: errorMessage,
        testCaseId: testCase.testCaseId
      };
    }
  }

  /**
   * Format test case description for Jira
   * @param {Object} testCase - Test case data
   * @returns {String} Formatted description
   */
  formatDescription(testCase) {
    let description = testCase.description || '';
    
    // Add test case ID and category
    if (testCase.testCaseId) {
      description += `\n\n*Test Case ID:* ${testCase.testCaseId}`;
    }
    
    if (testCase.category) {
      description += `\n*Category:* ${testCase.category}`;
    }
    
    // Add test steps if available
    if (testCase.steps && testCase.steps.length > 0) {
      description += '\n\n*Test Steps:*\n';
      testCase.steps.forEach((step, index) => {
        description += `${index + 1}. *Action:* ${step.action || step.step || ''}\n`;
        if (step.testData || step.data) {
          description += `   *Test Data:* ${step.testData || step.data}\n`;
        }
        description += `   *Expected Result:* ${step.expectedResult || step.result || ''}\n\n`;
      });
    }
    
    return description;
  }

  /**
   * Format test case description for Jira using Atlassian Document Format (ADF)
   * @param {Object} testCase - Test case data
   * @returns {Object} ADF formatted description object
   */
  formatDescriptionForJira(testCase) {
    const content = [];
    
    // Main description paragraph
    if (testCase.description) {
      content.push({
        type: "paragraph",
        content: [{
          type: "text",
          text: testCase.description
        }]
      });
    }
    
    // Add test case metadata
    if (testCase.testCaseId || testCase.category) {
      content.push({
        type: "paragraph",
        content: []
      });
      
      if (testCase.testCaseId) {
        content.push({
          type: "paragraph",
          content: [
            { type: "text", text: "Test Case ID: ", marks: [{ type: "strong" }] },
            { type: "text", text: testCase.testCaseId }
          ]
        });
      }
      
      if (testCase.category) {
        content.push({
          type: "paragraph",
          content: [
            { type: "text", text: "Category: ", marks: [{ type: "strong" }] },
            { type: "text", text: testCase.category }
          ]
        });
      }
    }
    
    // Add test steps if available
    if (testCase.testSteps && testCase.testSteps.length > 0) {
      content.push({
        type: "paragraph",
        content: [{ type: "text", text: "Test Steps:", marks: [{ type: "strong" }] }]
      });
      
      testCase.testSteps.forEach((step, index) => {
        content.push({
          type: "paragraph",
          content: [
            { type: "text", text: `${index + 1}. `, marks: [{ type: "strong" }] },
            { type: "text", text: `Action: ${step.action || step.step || ''}` }
          ]
        });
        
        if (step.testData || step.data) {
          content.push({
            type: "paragraph",
            content: [
              { type: "text", text: "   Test Data: ", marks: [{ type: "em" }] },
              { type: "text", text: step.testData || step.data }
            ]
          });
        }
        
        content.push({
          type: "paragraph",
          content: [
            { type: "text", text: "   Expected Result: ", marks: [{ type: "em" }] },
            { type: "text", text: step.expectedResult || step.result || '' }
          ]
        });
      });
    }
    
    return {
      type: "doc",
      version: 1,
      content: content
    };
  }

  /**
   * Create labels for Jira issue
   * @param {Object} testCase - Test case data
   * @returns {Array} Array of labels
   */
  createLabels(testCase) {
    const labels = ['automated-test'];
    
    if (testCase.category) {
      labels.push(testCase.category.toLowerCase().replace(/\s+/g, '-'));
    }
    
    if (testCase.testCaseId) {
      labels.push(testCase.testCaseId);
    }
    
    if (testCase.priority) {
      labels.push(`priority-${testCase.priority.toLowerCase()}`);
    }
    
    return labels;
  }

  /**
   * Simulate Jira creation for development/testing
   * @param {Object} testCase - Test case data
   * @returns {Object} Simulated response
   */
  simulateJiraCreation(testCase) {
    const simulatedKey = `${this.projectKey || 'TEST'}-${Math.floor(Math.random() * 10000)}`;
    const simulatedId = Math.floor(Math.random() * 100000);
    
    logger.info(`🔧 SIMULATION: Created Jira issue ${simulatedKey} for test case ${testCase.testCaseId}`);
    
    return {
      success: true,
      jiraKey: simulatedKey,
      jiraId: simulatedId,
      testCaseId: testCase.testCaseId,
      url: `${this.jiraBaseUrl || 'https://nikhilnandigoud.atlassian.net'}/browse/${simulatedKey}`,
      note: 'Simulated creation - not real Jira issue'
    };
  }

  /**
   * Batch create multiple test cases
   * @param {Array} testCases - Array of test case objects
   * @returns {Promise<Array>} Array of creation results
   */
  async createMultipleTestCases(testCases) {
    if (!Array.isArray(testCases)) {
      throw new Error('testCases must be an array');
    }

    logger.info(`Creating ${testCases.length} test cases in Jira (Simulation: ${this.simulationMode})`);
    
    const results = [];
    
    // Process test cases sequentially to avoid rate limiting
    for (const testCase of testCases) {
      try {
        const result = await this.createTestCaseInJira(testCase);
        results.push(result);
        // 10 second delay between creations
        await new Promise(resolve => setTimeout(resolve, 10000));
      } catch (error) {
        logger.error(`Error creating test case ${testCase.testCaseId}:`, error.message);
        results.push({
          success: false,
          error: error.message,
          testCaseId: testCase.testCaseId
        });
      }
    }
    
    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);
    
    logger.info(`
      Jira Test Case Creation Summary:
      ✅ Successfully created: ${successful.length}
      ❌ Failed: ${failed.length}
      Simulation Mode: ${this.simulationMode}
      ${failed.length > 0 ? '\nFailed test cases:\n' + failed.map(f => `- ${f.testCaseId}: ${f.error}`).join('\n') : ''}
    `);
    
    return results;
  }

  /**
   * Test Jira connection
   * @returns {Promise<Object>} Connection test result
   */
  async testConnection() {
    if (this.simulationMode) {
      return {
        success: true,
        message: 'Running in simulation mode - no real connection',
        simulationMode: true
      };
    }

    try {
      // Test connection by getting current user info
      const response = await this.axiosInstance.get('/rest/api/3/myself');
      
      return {
        success: true,
        message: `Connected to Jira as ${response.data.displayName} (${response.data.emailAddress})`,
        user: response.data,
        simulationMode: false
      };
      
    } catch (error) {
      return {
        success: false,
        message: `Jira connection failed: ${error.message}`,
        simulationMode: false
      };
    }
  }
}

module.exports = { JiraService };
