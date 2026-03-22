// llmService.js
// AI test case generation service - refactored from rag_pipeline.js
const axios = require('axios');
const logger = require('../../config/logger');

class LLMService {
  constructor() {
    this.apiKey = process.env.AZURE_OPENAI_API_KEY;
    this.deployment = process.env.AZURE_OPENAI_DEPLOYMENT;
    this.endpoint = process.env.AZURE_OPENAI_ENDPOINT;
    this.apiVersion = '2023-05-15';
    this.vectorStorage = null; // Will be injected by the calling code
  }

  /**
   * Generate test cases using Azure OpenAI GPT with context
   * @param {string} storyText - Story summary and description
   * @param {object} context - Additional context data
   * @returns {Promise<Array>} Generated test cases
   */
  async generateTestCases(storyText, context = {}) {
    try {
      logger.info('🤖 Generating intelligent test cases using AI...');
      
      // Add story complexity analysis
      const storyComplexity = this._analyzeStoryComplexity(storyText);
      context.storyComplexity = storyComplexity;
      
      logger.info(`📊 Story complexity detected: ${storyComplexity.level} (Score: ${storyComplexity.score}/10)`);
      
      const prompt = this._buildPrompt(storyText, context);
      const response = await this._callAzureOpenAI(prompt);
      
      const testCases = await this._parseResponse(response);
      
      logger.info(`✅ Generated ${testCases.length} contextually relevant AI test cases`);
      logger.info(`🎯 Expected range for ${storyComplexity.level} complexity: ${storyComplexity.expectedTestCases} test cases`);
      
      return testCases;
      
    } catch (error) {
      logger.error(`AI test case generation failed: ${error.message}`);
      logger.info('🛠️ Falling back to rule-based test case generation...');
      
      // Extract summary and description from storyText
      const lines = storyText.split('\n');
      const summary = lines[0] || 'User Story';
      const description = lines.slice(1).join('\n') || storyText;
      
      // Use fallback with proper unique IDs
      return await this.generateFallbackTestCases(
        summary, 
        description, 
        context.storyId || 'STORY', 
        context.projectId || 'PROJ'
      );
    }
  }

  /**
   * Analyze story complexity to guide test case generation
   * @private
   */
  _analyzeStoryComplexity(storyText) {
    const text = storyText.toLowerCase();
    let score = 0;
    let level = 'Simple';
    let expectedTestCases = '2-3';
    
    // Content depth indicators
    const contentIndicators = {
      // Basic content indicators (1 point each)
      'functional_words': /\b(create|read|update|delete|add|remove|edit|save|load|search|filter|sort)\b/g,
      'ui_elements': /\b(button|form|field|input|dropdown|checkbox|radio|modal|dialog|page|screen)\b/g,
      'data_elements': /\b(database|table|record|data|information|file|document|report)\b/g,
      
      // Medium complexity indicators (2 points each)
      'business_logic': /\b(validate|calculation|rule|condition|requirement|policy|workflow|process)\b/g,
      'integration': /\b(api|service|integration|external|third.party|sync|import|export)\b/g,
      'user_roles': /\b(user|admin|role|permission|access|login|authenticate|authorize)\b/g,
      
      // High complexity indicators (3 points each)
      'advanced_features': /\b(notification|email|sms|report|dashboard|analytics|batch|bulk|schedule)\b/g,
      'error_handling': /\b(error|exception|validation|failure|retry|timeout|rollback)\b/g,
      'performance': /\b(performance|speed|load|response.time|scalability|concurrent)\b/g
    };
    
    // Calculate complexity score
    Object.entries(contentIndicators).forEach(([category, regex]) => {
      const matches = text.match(regex) || [];
      const categoryWeight = category.includes('advanced') || category.includes('error') || category.includes('performance') ? 3 :
                           category.includes('business') || category.includes('integration') || category.includes('user') ? 2 : 1;
      score += matches.length * categoryWeight;
    });
    
    // Text length and detail indicators
    const sentences = storyText.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const words = storyText.split(/\s+/).length;
    const hasAcceptanceCriteria = /\b(given|when|then|scenario|acceptance|criteria)\b/i.test(storyText);
    const hasDetailedDescription = sentences.length > 3 && words > 50;
    
    // Adjust score based on content depth
    if (hasAcceptanceCriteria) score += 3;
    if (hasDetailedDescription) score += 2;
    if (words < 20) score = Math.max(0, score - 2); // Penalty for very short stories
    
    // Determine complexity level and expected test case count
    if (score >= 15) {
      level = 'Complex';
      expectedTestCases = '9-15';
    } else if (score >= 7) {
      level = 'Medium';
      expectedTestCases = '5-8';
    } else {
      level = 'Simple';
      expectedTestCases = '2-4';
    }
    
    return {
      level,
      score,
      expectedTestCases,
      contentDepth: words > 50 ? 'Detailed' : words > 20 ? 'Moderate' : 'Minimal',
      hasAcceptanceCriteria,
      wordCount: words,
      sentenceCount: sentences.length
    };
  }

  /**
   * Update existing test cases based on story changes with intelligent analysis
   * @param {string} storyText - Updated story content
   * @param {Array} existingTestCases - Current test cases
   * @param {object} context - Additional context
   * @returns {Promise<Array>} Updated test cases
   */
  async updateTestCases(storyText, existingTestCases, context = {}) {
    try {
      logger.info('🔄 Intelligently updating test cases based on story changes...');
      
      // Analyze complexity of updated story
      const storyComplexity = this._analyzeStoryComplexity(storyText);
      context.storyComplexity = storyComplexity;
      context.isUpdate = true;
      
      logger.info(`📊 Updated story complexity: ${storyComplexity.level} (Score: ${storyComplexity.score}/10)`);
      logger.info(`📋 Existing test cases: ${existingTestCases.length}, Expected for new complexity: ${storyComplexity.expectedTestCases}`);
      
      const updatePrompt = this._buildUpdatePrompt(storyText, existingTestCases, context);
      const response = await this._callAzureOpenAI(updatePrompt);
      
      const updatedTestCases = await this._parseResponse(response);
      
      logger.info(`✅ Updated test suite: ${updatedTestCases.length} test cases`);
      return updatedTestCases;
      
    } catch (error) {
      logger.error(`AI test case update failed: ${error.message}`);
      logger.info('🛠️ Falling back to regenerating test cases...');
      
      // Fallback to generating new test cases
      return await this.generateTestCases(storyText, context);
    }
  }


  /**
   * Set the vector storage instance (dependency injection)
   * @param {Object} vectorStorage - Vector storage instance
   */
  setVectorStorage(vectorStorage) {
    this.vectorStorage = vectorStorage;
  }

  /**
   * Generate unique test case ID using global counter from vectorStorage
   * Format: TC_{unique_number} (JIRA standard)
   */
  async _generateUniqueTestCaseId() {
    if (!this.vectorStorage) {
      throw new Error('VectorStorage not injected. Call setVectorStorage() first.');
    }
    
    return await this.vectorStorage.getNextTestCaseId();
  }

  /**
   * Generate fallback test cases when AI fails
   * @param {string} summary - Story summary
   * @param {string} description - Story description
   * @param {string} storyId - Story ID for unique test case IDs
   * @param {string} projectId - Project ID for test case IDs
   * @returns {Array} Rule-based test cases
   */
  async generateFallbackTestCases(summary, description, storyId = 'STORY', projectId = 'PROJ') {
    logger.info('🛠️ Generating fallback test cases using rule-based approach...');
    
    const storyText = (summary + ' ' + description).toLowerCase();
    const testCases = [];
    const timestamp = Date.now();
    
    // Happy path test case (always included) - Zephyr format
    testCases.push({
      testCaseId: await this._generateUniqueTestCaseId(),
      summary: `Verify ${summary} - Happy Path`,
      description: `Test the main functionality of ${summary} with valid inputs and expected user workflow`,
      category: "Happy Path",
      testSteps: [
        {
          step: 1,
          action: "Open the application",
          testData: "Valid application URL",
          expectedResult: "Application loads successfully"
        },
        {
          step: 2,
          action: `Navigate to ${summary}`,
          testData: "Valid navigation path",
          expectedResult: "User reaches the target functionality"
        },
        {
          step: 3,
          action: "Execute main functionality",
          testData: "Valid input data",
          expectedResult: "Functionality executes without errors"
        },
        {
          step: 4,
          action: "Verify successful completion",
          testData: "N/A",
          expectedResult: "Functionality works as expected with valid inputs"
        }
      ],
      preconditions: ["System is accessible", "User has required permissions"],
      priority: "High"
    });
    
    // UI test case (if UI-related keywords found) - Zephyr format
    if (this._hasUIKeywords(storyText)) {
      testCases.push({
        testCaseId: await this._generateUniqueTestCaseId(),
        summary: `Verify ${summary} - UI Elements`,
        description: `Test the user interface elements and display components for ${summary}`,
        category: "UI",
        testSteps: [
          {
            step: 1,
            action: "Open the dialog/interface",
            testData: "Valid application access",
            expectedResult: "Interface opens without errors"
          },
          {
            step: 2,
            action: "Verify all UI elements are displayed",
            testData: "N/A",
            expectedResult: "All expected UI elements are visible and properly rendered"
          },
          {
            step: 3,
            action: "Check button states and field visibility",
            testData: "N/A",
            expectedResult: "All UI elements are properly displayed and functional"
          }
        ],
        preconditions: ["System is accessible"],
        priority: "High"
      });
    }
    
    // Validation test case (if validation keywords found) - Zephyr format
    if (this._hasValidationKeywords(storyText)) {
      testCases.push({
        testCaseId: await this._generateUniqueTestCaseId(),
        summary: `Verify ${summary} - Input Validation`,
        description: `Test input validation and error handling for ${summary}`,
        category: "Validation",
        testSteps: [
          {
            step: 1,
            action: "Enter invalid inputs",
            testData: "Invalid data (empty, wrong format, out of range)",
            expectedResult: "System accepts the input temporarily"
          },
          {
            step: 2,
            action: "Attempt to proceed",
            testData: "N/A",
            expectedResult: "System prevents proceeding with invalid data"
          },
          {
            step: 3,
            action: "Verify validation messages",
            testData: "N/A",
            expectedResult: "System properly validates inputs and shows appropriate error messages"
          }
        ],
        preconditions: ["System is accessible"],
        priority: "Medium"
      });
    }
    
    // Business logic test case (if business rule keywords found) - Zephyr format
    if (this._hasBusinessKeywords(storyText)) {
      testCases.push({
        testCaseId: await this._generateUniqueTestCaseId(),
        summary: `Verify ${summary} - Business Rules`,
        description: `Test business logic and rule enforcement for ${summary}`,
        category: "Business Logic",
        testSteps: [
          {
            step: 1,
            action: "Set up test scenario",
            testData: "Business rule test data",
            expectedResult: "Test scenario is properly configured"
          },
          {
            step: 2,
            action: "Execute business logic",
            testData: "Valid business scenario data",
            expectedResult: "Business logic executes without errors"
          },
          {
            step: 3,
            action: "Verify rule enforcement",
            testData: "N/A",
            expectedResult: "Business rules are properly enforced"
          }
        ],
        preconditions: ["System is accessible", "Test data is available"],
        priority: "High"
      });
    }
    
    // Error handling test case (always included) - Zephyr format
    testCases.push({
      testCaseId: await this._generateUniqueTestCaseId(),
      summary: `Verify ${summary} - Error Handling`,
      description: `Test error handling and recovery scenarios for ${summary}`,
      category: "Error Handling",
      testSteps: [
        {
          step: 1,
          action: "Create error condition",
          testData: "Invalid or corrupted data",
          expectedResult: "Error condition is established"
        },
        {
          step: 2,
          action: "Execute functionality",
          testData: "Error-inducing inputs",
          expectedResult: "System attempts to process the request"
        },
        {
          step: 3,
          action: "Verify error handling",
          testData: "N/A",
          expectedResult: "System handles errors gracefully with appropriate user feedback"
        }
      ],
      preconditions: ["System is accessible"],
      priority: "Medium"
    });
    
    logger.info(`✅ Generated ${testCases.length} fallback test cases`);
    return testCases;
  }

  /**
   * Build AI prompt for test case generation with Jira Cloud Agent intelligence
   * @private
   */
  _buildPrompt(storyText, context) {
    // Handle different context data formats
    let contextInfo = '';
    if (context.vectorSimilarities && Array.isArray(context.vectorSimilarities)) {
      contextInfo = context.vectorSimilarities.map(tc => 
        `- ${tc.summary || tc.name || 'Story'}: ${tc.description || tc.text || ''}`
      ).join('\n');
    } else if (context.existingTestCases && Array.isArray(context.existingTestCases)) {
      contextInfo = context.existingTestCases.map(tc => 
        `- ${tc.name || tc.summary || 'Test Case'}: ${tc.description || ''}`
      ).join('\n');
    }

    const systemPrompt = `You are an AI-powered Test Case Generation Agent, similar to Jira Cloud Agent. Your role is to intelligently analyze user stories and generate contextually relevant test cases based on actual story content.

# INTELLIGENCE FRAMEWORK

## 1. Story Analysis & Complexity Detection
- **Content Depth Analysis**: Examine the actual content and functional requirements described
- **Complexity Assessment**: 
  * Simple (basic functionality, minimal description): 2-4 test cases
  * Medium (moderate functionality, some business logic): 5-8 test cases  
  * Complex (multiple features, integrations, detailed requirements): 9-15 test cases
- **Feature Categorization**: Identify if it's CRUD, UI, API, Integration, Business Logic, etc.
- **Scope Assessment**: Determine breadth of functionality actually described

## 2. Content-Driven Intelligence
- Extract ONLY functionality explicitly mentioned in the description
- Identify ACTUAL business rules and constraints from the story text
- Generate test cases for SPECIFIC scenarios described, not generic ones
- If story content is minimal (like "1234" or very brief), generate minimal relevant test cases
- Don't add standard test cases unless they're specifically applicable to described functionality

## 3. Context-Aware Generation Modes

### NEW Test Case Generation:
- Focus strictly on story requirements and described functionality
- Generate based on actual content depth and complexity
- Avoid generic "standard" test cases unless directly relevant

### UPDATE Mode (when existing test cases provided):
- Compare new story content with existing test coverage
- Identify what changed in requirements vs existing tests
- Update/modify existing test cases where story requirements changed
- Add new test cases only for newly described functionality
- Mark obsolete test cases when functionality is removed/changed

## 4. Jira Cloud Agent Behavior

### Story Content Analysis:
1. **Parse Actual Requirements**: Extract only what's explicitly described
2. **Identify Real Acceptance Criteria**: Look for actual "Given/When/Then" or requirements
3. **Map Described User Actions**: Only workflows actually mentioned
4. **Extract Mentioned Data Elements**: Inputs/outputs specifically described
5. **Spot Described Integrations**: APIs, systems mentioned in the story

### Intelligent Test Categorization:
- **Primary Flow**: Main functionality described in the story
- **Alternative Paths**: Different approaches mentioned in requirements
- **Data Validation**: Only validation rules mentioned in the story
- **Error Scenarios**: Based on what could realistically go wrong with described functionality
- **Integration Testing**: Only if integrations are explicitly mentioned
- **Edge Cases**: Boundary conditions specific to the described functionality

Return ONLY test cases directly relevant to the story content as a JSON array:

[
  {
    "testCaseId": "TC_001",
    "summary": "Verify [SPECIFIC functionality from story] - [SPECIFIC scenario]",
    "description": "Test the exact behavior described in the story requirements",
    "category": "Primary Flow/Alternative Flow/Data Validation/Error Handling/Integration",
    "relevanceScore": 10,
    "testSteps": [
      {
        "step": 1,
        "action": "Specific action based on story description",
        "testData": "Data relevant to the story context",
        "expectedResult": "Expected outcome as described in story"
      }
    ],
    "preconditions": ["Specific to story context"],
    "priority": "High/Medium/Low",
    "complexity": "Simple/Medium/Complex",
    "storyRelevance": "Direct/Indirect"
  }
]

# CRITICAL RULES:
- If story is minimal (like "1234" or one sentence), generate ONLY 2-3 basic relevant test cases
- If story has detailed requirements, provide comprehensive coverage
- NEVER generate test cases for functionality NOT mentioned in the story
- Focus on QUALITY and RELEVANCE over quantity
- Each test case must have clear traceability to story content
- Adapt test case count based on actual story complexity, not fixed numbers

# RESPONSE FORMAT - CRITICAL:
You MUST respond with ONLY a valid JSON array. Do not include any explanatory text, markdown formatting, comments, or conversational responses. Your entire response must be a properly formatted JSON array that starts with '[' and ends with ']'.

CRITICAL: Your response must start with '[' (opening bracket) as the very first character and end with ']' (closing bracket) as the very last character. Nothing else.

Example for minimal story:
[
  {
    "testCaseId": "TC_001",
    "summary": "Verify basic functionality",
    "description": "Test basic behavior described in story",
    "category": "Primary Flow",
    "relevanceScore": 8,
    "testSteps": [
      {
        "step": 1,
        "action": "Perform action based on story content",
        "testData": "Basic test data",
        "expectedResult": "Expected outcome"
      }



      
    ],
    "preconditions": [],
    "priority": "Medium",
    "complexity": "Simple",
    "storyRelevance": "Direct"
  }
]`;

    const userPrompt = `Analyze this user story with Jira Cloud Agent intelligence and generate contextually relevant test cases:

**Story Content Analysis Required:**
${storyText}

**Intelligence Analysis Steps:**
1. **Content Depth Assessment**: How much functional detail is actually described?
2. **Complexity Classification**: Simple/Medium/Complex based on described functionality
3. **Scope Identification**: What exact features/behaviors are mentioned for testing?
4. **Relevance Focus**: Generate ONLY test cases directly related to described functionality

**Existing Context for Reference:**
${contextInfo || 'No existing test cases found for reference'}

**Generation Rules:**
- If story content is minimal (like "1234" or basic description): Generate 2-3 focused test cases
- If story has moderate detail: Generate 5-8 comprehensive test cases
- If story has extensive requirements: Generate 9-15 detailed test cases
- Each test case must be traceable to specific story content
- Avoid generic test cases unless specifically applicable to described functionality
- Focus on QUALITY and RELEVANCE over arbitrary quantity

**Critical Instructions:**
- Extract and test ONLY what is explicitly described in the story
- Don't assume functionality not mentioned in the requirements
- Generate test cases proportional to the actual complexity described
- Each test case should have clear relevance to the story content

Generate contextually intelligent test cases based on the actual story content now:`;

    return { systemPrompt, userPrompt };
  }

  /**
   * Build AI prompt for updating test cases with intelligent comparison
   * @private
   */
  _buildUpdatePrompt(storyText, existingTestCases, context) {
    const { systemPrompt } = this._buildPrompt(storyText, context);
    
    const updatePrompt = `UPDATE MODE - Intelligent Test Case Analysis and Modification:

**Updated User Story:**
${storyText}

**Existing Test Cases:**
${JSON.stringify(existingTestCases, null, 2)}

**Intelligent Update Analysis Required:**

1. **Requirements Change Detection**: 
   - Compare new story content with existing test case coverage
   - Identify what specific functionality has been added, modified, or removed

2. **Test Case Gap Analysis**:
   - Find missing test coverage for new functionality described in updated story
   - Identify obsolete test cases that no longer match story requirements
   - Detect test cases that need modification to match updated requirements

3. **Update Strategy**:
   - **MODIFY**: Update existing test cases where story requirements changed
   - **ADD**: Create new test cases only for newly described functionality  
   - **REMOVE**: Mark test cases obsolete if functionality is no longer described
   - **KEEP**: Preserve test cases that still match current story requirements

4. **Update Rules**:
   - Maintain test case IDs where possible for traceability
   - Only add test cases for functionality explicitly described in updated story
   - Update test steps, data, and expected results to match new requirements
   - Preserve existing test case structure where story requirements haven't changed

**Response Format**: Return complete updated test case array with:
- Modified existing test cases (same ID, updated content)
- New test cases for new functionality (new IDs)
- Exclude obsolete test cases (don't include in response)

Generate the intelligently updated test case suite now:`;

    return { systemPrompt, userPrompt: updatePrompt };
  }

  /**
   * Call Azure OpenAI API with enhanced JSON response handling
   * @private
   */
  async _callAzureOpenAI({ systemPrompt, userPrompt }) {
    const url = `${this.endpoint}/openai/deployments/${this.deployment}/chat/completions?api-version=${this.apiVersion}`;
    const headers = {
      'api-key': this.apiKey,
      'Content-Type': 'application/json'
    };

    const data = {
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.1, // Lower temperature for more consistent JSON formatting
      max_tokens: 4000
      // Note: Removed response_format as it expects JSON object but we need JSON array
    };

    try {
      const response = await axios.post(url, data, { headers });
      return response.data.choices[0].message.content;
    } catch (error) {
      logger.error(`❌ Azure OpenAI API call failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Parse AI response and clean JSON with better error handling
   * @private
   */
  async _parseResponse(response) {
    // Clean the AI response - remove markdown code blocks if present
    let cleanedResult = response.trim();
    
    // Remove markdown code blocks
    if (cleanedResult.startsWith('```json')) {
      cleanedResult = cleanedResult.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    } else if (cleanedResult.startsWith('```')) {
      cleanedResult = cleanedResult.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }

    // If response doesn't start with '[' or '{', try to extract JSON from text
    if (!cleanedResult.trim().startsWith('[') && !cleanedResult.trim().startsWith('{')) {
      logger.warn('🔍 AI response is not JSON, attempting to extract JSON from text...');
      
      // Try to find JSON array in the response
      const jsonMatch = cleanedResult.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        cleanedResult = jsonMatch[0];
        logger.info('✅ Extracted JSON array from AI response');
      } else {
        // Try to find JSON object
        const objMatch = cleanedResult.match(/\{[\s\S]*\}/);
        if (objMatch) {
          cleanedResult = objMatch[0];
          logger.info('✅ Extracted JSON object from AI response');
        } else {
          logger.error('❌ No valid JSON found in AI response');
          throw new Error('AI response does not contain valid JSON structure');
        }
      }
    }

    try {
      const testCases = JSON.parse(cleanedResult);
      
      // Ensure we have an array
      const testCaseArray = Array.isArray(testCases) ? testCases : [testCases];
      
      // Assign unique IDs to each test case
      for (const testCase of testCaseArray) {
        if (!testCase.testCaseId || testCase.testCaseId === 'TC_001' || testCase.testCaseId.startsWith('TC_')) {
          // Replace AI-generated placeholder ID with actual unique ID
          testCase.testCaseId = await this._generateUniqueTestCaseId();
        }
        
        // Ensure required fields exist
        if (!testCase.summary) testCase.summary = 'Generated Test Case';
        if (!testCase.description) testCase.description = 'Auto-generated test case';
        if (!testCase.testSteps || !Array.isArray(testCase.testSteps)) {
          testCase.testSteps = [
            {
              step: 1,
              action: "Execute test scenario",
              testData: "As required",
              expectedResult: "System behaves as expected"
            }
          ];
        }
      }
      
      return testCaseArray;
    } catch (error) {
      logger.error(`Failed to parse AI response: ${error.message}`);
      logger.error(`Raw AI response: ${response.substring(0, 200)}...`);
      throw new Error(`Invalid JSON response from AI: ${error.message}`);
    }
  }

  /**
   * Check for UI-related keywords
   * @private
   */
  _hasUIKeywords(text) {
    const uiKeywords = ['dialog', 'button', 'field', 'click', 'form', 'interface', 'menu', 'page'];
    return uiKeywords.some(keyword => text.includes(keyword));
  }

  /**
   * Check for validation-related keywords
   * @private
   */
  _hasValidationKeywords(text) {
    const validationKeywords = ['validation', 'required', 'disable', 'validate', 'error', 'invalid'];
    return validationKeywords.some(keyword => text.includes(keyword));
  }

  /**
   * Check for business logic keywords
   * @private
   */
  _hasBusinessKeywords(text) {
    const businessKeywords = ['rule', 'condition', 'behavior', 'policy', 'logic', 'workflow'];
    return businessKeywords.some(keyword => text.includes(keyword));
  }
}

module.exports = { LLMService };
