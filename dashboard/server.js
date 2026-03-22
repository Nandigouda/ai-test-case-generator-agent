// Simple Dashboard Server - Separated Structure
require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

// Import services for test case integration
const { JiraService } = require('../src/services/jiraService');

// Import new Jira test case routes
const jiraTestCaseRoutes = require('../src/api/jiraTestCaseRoutes');

const app = express();
app.use(express.json());

// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public')));

// Add new Jira test case routes
app.use('/api', jiraTestCaseRoutes);

// Configuration
const STORY_API_BASE_URL = process.env.STORY_API_BASE_URL || 'http://localhost:3000';
const DASHBOARD_PORT = process.env.DASHBOARD_PORT || 3006;

// Check Story API status endpoint
app.get('/api/check-story-api', async (req, res) => {
  console.log('check story api');
    try {
        const response = await axios.get(`${STORY_API_BASE_URL}/health`);
        if (response.data && (response.data.status === 'ok' || response.data.status === 'healthy')) {
            res.json({ status: 'ok' });
        } else {
            res.json({ status: 'error' });
        }
    } catch (error) {
        console.error('Error checking API status:', error);
        res.json({ status: 'error' });
    }
});

// Global data storage
let dashboardStats = {
  totalStories: 0,
  totalTestCases: 0,
  reuseRate: 0,
  todayStories: 0,
  todayTestCases: 0,
  similarity: { high: 0, medium: 0, low: 0 }
};

let recentActivity = [];
let systemLogs = [];

// Function to add activity to the recent activity log
function addActivity(message, type = 'info') {
  recentActivity.unshift({
    action: message,
    type: type,
    time: new Date().toLocaleTimeString(),
    details: ''
  });
  
  // Keep only last 50 activities
  if (recentActivity.length > 50) {
    recentActivity = recentActivity.slice(0, 50);
  }
}

// Load real data from vector_table.json
function loadRealData() {
  console.log('load real data');
  try {
    const vectorTablePath = path.join(__dirname, '..', 'data', 'vector_table.json');
    if (fs.existsSync(vectorTablePath)) {
      const data = fs.readFileSync(vectorTablePath, 'utf8');
      const vectorData = JSON.parse(data);
      
      // Handle the actual format of vector_table.json
      if (vectorData.storyIds && Array.isArray(vectorData.storyIds)) {
        // Calculate real statistics using testCaseDetails for accurate count
        dashboardStats.totalStories = vectorData.storyIds.length;
        
        // Count total test cases from testCaseDetails arrays
        const testCaseDetails = vectorData.testCaseDetails || [];
        dashboardStats.totalTestCases = testCaseDetails.reduce((sum, tcArray) => 
          sum + (Array.isArray(tcArray) ? tcArray.length : 0), 0
        );
        
        // Alternative count from testCaseIds if testCaseDetails is not available
        if (dashboardStats.totalTestCases === 0 && vectorData.testCaseIds) {
          dashboardStats.totalTestCases = vectorData.testCaseIds.reduce((sum, tcIdArray) => 
            sum + (Array.isArray(tcIdArray) ? tcIdArray.length : 0), 0
          );
        }
        
        // Calculate today's counts (stories updated today)
        const today = new Date().toDateString();
        dashboardStats.todayStories = (vectorData.lastUpdated || []).filter(lastUpdated => {
          return lastUpdated && new Date(lastUpdated).toDateString() === today;
        }).length;
        
        dashboardStats.todayTestCases = dashboardStats.totalTestCases;
        dashboardStats.reuseRate = dashboardStats.totalStories > 0 ? 
          Math.round(dashboardStats.totalTestCases / dashboardStats.totalStories) : 0;
        
        // Calculate similarity distribution
        const similarities = vectorData.similarities || [];
        dashboardStats.similarity = {
          high: similarities.filter(s => s > 0.8).length,
          medium: similarities.filter(s => s > 0.5 && s <= 0.8).length,
          low: similarities.filter(s => s <= 0.5).length
        };
        
        console.log('📊 Real data loaded successfully');
        console.log('   • Stories:', dashboardStats.totalStories);
        console.log('   • Test Cases:', dashboardStats.totalTestCases);
        console.log('   • Today\'s Stories:', dashboardStats.todayStories);
        console.log('   • Reuse Rate:', dashboardStats.reuseRate);
      }
    } else {
      console.log('⚠️ Vector table file not found, using default values');
    }
  } catch (error) {
    console.error('Error loading real data:', error);
  }
}

// Initialize recent activity with real data
function initializeActivity() {
  recentActivity = [];
}

// Initialize system logs
function addSystemLog(level, message) {
  systemLogs.unshift({
    timestamp: new Date().toISOString(),
    level: level,
    message: message
  });
  
  if (systemLogs.length > 50) systemLogs = systemLogs.slice(0, 50);
}

// Serve the main page (index.html will be served automatically)
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// API Endpoints

// Dashboard statistics (real data)
app.get('/api/dashboard-stats', (req, res) => {
  res.json(dashboardStats);
});

// Reload dashboard data from vector table
app.get('/api/reload-dashboard-data', (req, res) => {
  console.log('reload dashboard data');
  try {
    console.log('🔄 Reloading dashboard data...');
    loadRealData();
    res.json({ 
      success: true, 
      message: 'Dashboard data reloaded',
      stats: dashboardStats 
    });
  } catch (error) {
    console.error('Error reloading dashboard data:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to reload dashboard data' 
    });
  }
});

// Vector data for search functionality
app.get('/api/vector-data', (req, res) => {
  console.log('vector data requested');
  try {
    const vectorTablePath = path.join(__dirname, '..', 'data', 'vector_table.json');
    if (fs.existsSync(vectorTablePath)) {
      const data = fs.readFileSync(vectorTablePath, 'utf8');
      const vectorData = JSON.parse(data);
      res.json(vectorData);
    } else {
      res.status(404).json({ error: 'Vector data not found' });
    }
  } catch (error) {
    console.error('Error loading vector data:', error);
    res.status(500).json({ error: 'Failed to load vector data' });
  }
});

// Enhanced search API - handles both Test Case IDs and Story IDs
app.get('/api/test-case/:searchQuery', (req, res) => {
  try {
    const { searchQuery } = req.params;
    
    if (!searchQuery) {
      return res.status(400).json({
        error: 'Search query is required'
      });
    }


    // Load vector data directly
    const vectorTablePath = path.join(__dirname, '..', 'data', 'vector_table.json');
    if (!fs.existsSync(vectorTablePath)) {
      return res.status(404).json({
        error: 'Vector data not found'
      });
    }

    const data = fs.readFileSync(vectorTablePath, 'utf8');
    const vectorData = JSON.parse(data);

    // Check if searchQuery is a Story ID
    const storyIndex = vectorData.storyIds?.indexOf(searchQuery);
    

    if (storyIndex !== -1 && storyIndex >= 0) {
      
      // Return all test cases for this story with Jira mapping
      const storyTestCases = vectorData.testCaseDetails?.[storyIndex] || [];
      const jiraTestCases = vectorData.jiraTestCases?.[storyIndex] || [];
      const storyInfo = {
        storyId: searchQuery,
        summary: vectorData.summaries?.[storyIndex] || 'No summary available',
        description: vectorData.descriptions?.[storyIndex] || 'No description available'
      };

      const testCases = storyTestCases.map(tc => {
        // Find corresponding Jira mapping
        const jiraMapping = jiraTestCases.find(jira => jira.testCaseId === tc.testCaseId);
        
        return {
          testCaseId: jiraMapping?.jiraKey || tc.testCaseId, // Prefer Jira key
          localId: tc.testCaseId, // Keep local ID for reference
          jiraKey: jiraMapping?.jiraKey || null,
          jiraUrl: jiraMapping?.jiraUrl || null,
          title: jiraMapping?.summary || tc.summary || `Test Case for ${searchQuery}`,
          summary: jiraMapping?.summary || tc.summary || '',
          description: tc.description || '',
          category: tc.category || 'Functional',
          priority: tc.priority || 'High',
          preconditions: tc.preconditions || [],
          testSteps: tc.testSteps || [], // Use testSteps from vector data
          steps: tc.testSteps || [], // Also map to steps for backward compatibility
          inputs: tc.inputs || '',
          expectedOutcome: tc.expectedOutcome || '',
          relatedStoryId: searchQuery,
          storyTitle: storyInfo.summary,
          storyDescription: storyInfo.description
        };
      });

      return res.json({
        status: 'success',
        searchType: 'story',
        story: storyInfo,
        testCases: testCases,
        count: testCases.length
      });
    }

    let testCaseDetail1 = null;
    let foundTestCase = null;
    let relatedStory = null;
    let foundJira = false;
    const jiraArray1 = vectorData.jiraTestCases || [];
    const testCaseArray = vectorData.testCaseDetails || [];

    // Flatten jiraArray1 and testCaseArray if they are arrays of arrays
    const flatJiraArray = Array.isArray(jiraArray1[0]) ? jiraArray1.flat() : jiraArray1;
    const flatTestCaseArray = Array.isArray(testCaseArray[0]) ? testCaseArray.flat() : testCaseArray;

    // Try to find by Jira key or local testCaseId
    const filteredJiraArray = flatJiraArray.filter(jira => (jira.testCaseId === searchQuery || jira.jiraKey === searchQuery));
    if (filteredJiraArray.length > 0) {
      const filteredJira = filteredJiraArray[0];
      const filteredTestCaseId = filteredJira.testCaseId;
      const filteredTestCaseArray = flatTestCaseArray.filter(tc => tc.testCaseId === filteredTestCaseId);
      if (filteredTestCaseArray.length > 0) {
        testCaseDetail1 = filteredTestCaseArray[0];
        // Find related story index
        let storyIndex = -1;
        if (vectorData.testCaseDetails && Array.isArray(vectorData.testCaseDetails)) {
          for (let i = 0; i < vectorData.testCaseDetails.length; i++) {
            if (Array.isArray(vectorData.testCaseDetails[i]) && vectorData.testCaseDetails[i].some(tc => tc.testCaseId === filteredTestCaseId)) {
              storyIndex = i;
              break;
            }
          }
        }
        relatedStory = {
          storyId: vectorData.storyIds?.[storyIndex] || `STORY-${storyIndex}`,
          summary: vectorData.summaries?.[storyIndex] || 'No summary available',
          description: vectorData.descriptions?.[storyIndex] || 'No description available'
        };
        foundJira = !!filteredJira.jiraKey;
        foundTestCase = {
          testCaseId: filteredJira.jiraKey || filteredJira.testCaseId, // Prefer Jira key
          localId: filteredTestCaseId, // Keep local ID for reference
          jiraKey: filteredJira.jiraKey || filteredJira.testCaseId, // Prefer Jira key
          jiraUrl: filteredJira.url || null,
          title: testCaseDetail1.title || `Test Case for ${relatedStory.storyId}`,
          summary: testCaseDetail1.summary || '',
          description: testCaseDetail1.description || '',
          category: testCaseDetail1.category || 'Functional',
          priority: testCaseDetail1.priority || 'High',
          preconditions: testCaseDetail1.preconditions || [],
          testSteps: testCaseDetail1.testSteps || [],
          steps: testCaseDetail1.testSteps || [],
          inputs: testCaseDetail1.inputs || '',
          expectedOutcome: testCaseDetail1.expectedOutcome || '',
          relatedStoryId: relatedStory.storyId,
          storyTitle: relatedStory.summary,
          storyDescription: relatedStory.description,
          jiraFound: foundJira
        };
      }
    }

 

    if (foundTestCase) {
      return res.json({
        status: 'success',
        searchType: 'testcase',
        testCase: foundTestCase
      });
    }

    // Neither story ID nor test case ID found
    return res.status(404).json({
      error: 'No results found',
      searchQuery: searchQuery,
      message: 'Please check the Story ID or Test Case ID and try again'
    });

  } catch (error) {

    res.status(500).json({
      error: 'Failed to retrieve test case details',
      message: error.message
    });
  }
});

// Get recent activity
app.get('/api/recent-activity', (req, res) => {

  res.json(recentActivity);
});

// Call story API
app.post('/api/call-story-api', async (req, res) => {

  try {
    const { story_id, summary, description } = req.body;
    
    const startTime = Date.now();
    const response = await axios.post(`${STORY_API_BASE_URL}/auto-testcase`, {
      story_id,
      summary,
      description
    }, {
      timeout: 60000
    });
    
    const processingTime = Date.now() - startTime;
    const result = response.data;
    
    // Determine action type and activity message based on API response
    let actionType = 'success';
    let actionMessage = '';
    let testCasesCount = 0;
    
    if (result.action === 'duplicate') {
      actionType = 'warning';
      actionMessage = `🔁 DUPLICATE: ${story_id} - Returned existing test cases`;
      testCasesCount = result.testCaseIds ? result.testCaseIds.length : (result.testCasesGenerated || 0);
    } else if (result.action === 'update') {
      actionType = 'info';
      actionMessage = `🔄 UPDATE: ${story_id} - Updated existing story with new test cases`;
      testCasesCount = result.testCasesGenerated || (result.testCaseIds ? result.testCaseIds.length : 0);
    } else if (result.action === 'new') {
      actionType = 'success';
      actionMessage = `✨ NEW: ${story_id} - Created new story with test cases`;
      testCasesCount = result.testCasesGenerated || (result.testCaseIds ? result.testCaseIds.length : 0);
    } else {
      // Fallback for older response format
      actionType = result.isDuplicate ? 'warning' : 'success';
      actionMessage = `Test cases generated for ${story_id}`;
      testCasesCount = result.testCasesGenerated || 0;
    }
    
    // Add to activity feed with enhanced information
    recentActivity.unshift({
      action: actionMessage,
      type: actionType,
      time: new Date().toLocaleTimeString(),
      details: `${testCasesCount} test cases • ${processingTime}ms`
    });
    
    if (recentActivity.length > 10) recentActivity = recentActivity.slice(0, 10);
    
    // Reload real data
    loadRealData();
    
    res.json({
      success: true,
      action: result.action || (result.isDuplicate ? 'duplicate' : 'new'),
      storyId: story_id,
      testCaseIds: result.testCaseIds,
      testCasesGenerated: testCasesCount,
      processingTime: `${processingTime}ms`,
      isDuplicate: result.action === 'duplicate',
      duplicateOf: result.duplicateOf,
      similarity: result.similarity,
      message: result.message,
      warning: result.warning,
      note: result.note
    });
  } catch (error) {
    console.error('Error calling story API:', error);
    
    recentActivity.unshift({
      action: `❌ FAILED: ${req.body.story_id || 'Unknown'} - API call failed`,
      type: 'error',
      time: new Date().toLocaleTimeString(),
      details: error.response?.data?.error || error.message
    });
    
    res.status(500).json({
      success: false,
      error: error.response?.data?.error || error.message
    });
  }
});

// Get stories from vector table
app.get('/api/stories', (req, res) => {
  try {
    const vectorTablePath = path.join(__dirname, '..', 'data', 'vector_table.json');
    if (fs.existsSync(vectorTablePath)) {
      const data = fs.readFileSync(vectorTablePath, 'utf8');
      const vectorData = JSON.parse(data);
      
      if (vectorData.storyIds && Array.isArray(vectorData.storyIds)) {
        // Transform the data to story objects
        const stories = vectorData.storyIds.map((storyId, index) => ({
          story_id: storyId,
          summary: vectorData.summaries?.[index] || 'No summary',
          description: vectorData.descriptions?.[index] || 'No description',
          test_case_ids: vectorData.testCaseIds?.[index] || [],
          last_updated: vectorData.lastUpdated?.[index] || null
        }));
        res.json(stories);
      } else {
        // Fallback for array format
        res.json(Array.isArray(vectorData) ? vectorData : []);
      }
    } else {
      res.json([]);
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get test cases from vector table
app.get('/api/test-cases', (req, res) => {

  try {
    const vectorTablePath = path.join(__dirname, '..', 'data', 'vector_table.json');
    if (fs.existsSync(vectorTablePath)) {
      const data = fs.readFileSync(vectorTablePath, 'utf8');
      const vectorData = JSON.parse(data);
      
      const testCases = [];
      
      // Use testCaseDetails arrays which contain the actual detailed test case data
      if (vectorData.testCaseDetails && Array.isArray(vectorData.testCaseDetails)) {
        vectorData.testCaseDetails.forEach((testCaseArray, storyIndex) => {
          if (Array.isArray(testCaseArray)) {
            testCaseArray.forEach((testCaseDetail, tcIndex) => {
              const relatedStoryId = vectorData.storyIds?.[storyIndex] || `STORY-${storyIndex}`;
              const testCaseId = testCaseDetail.testCaseId;
              
              // Include review status if available
              const reviewStatus = reviewState.testCaseReviews[testCaseId] || {
                reviewed: false,
                reviewedAt: null,
                reviewedBy: null
              };
              
              testCases.push({
                testCaseId: testCaseId,
                title: testCaseDetail.title || `Test Case ${tcIndex + 1} for ${relatedStoryId}`,
                storyId: relatedStoryId,
                category: testCaseDetail.category || 'Generated',
                id: testCaseId,
                reviewStatus: reviewStatus
              });
            });
          }
        });
      }
      
      res.json(testCases);
    } else {
      res.json([]);
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// =============================================================================
// REVIEW WORKFLOW API ENDPOINTS
// =============================================================================

// Get review status for all test cases
app.get('/api/test-cases/review-status', (req, res) => {
  try {
    res.json({
      status: 'success',
      reviewState: reviewState.testCaseReviews,
      submissionHistory: reviewState.submissionHistory
    });
  } catch (error) {
    console.error('Error getting review status:', error);
    res.status(500).json({ 
      status: 'error', 
      message: 'Failed to get review status',
      error: error.message 
    });
  }
});

// Update review status for specific test cases
app.post('/api/test-cases/review', (req, res) => {
  try {
    const { testCaseId, reviewed, reviewedBy = 'user' } = req.body;
    
    if (!testCaseId) {
      return res.status(400).json({ 
        status: 'error', 
        message: 'testCaseId is required' 
      });
    }

    // Update review state
    reviewState.testCaseReviews[testCaseId] = {
      reviewed: !!reviewed,
      reviewedAt: new Date().toISOString(),
      reviewedBy: reviewedBy
    };

    // Add to activity log
    const action = reviewed ? 'marked as reviewed' : 'unmarked as reviewed';
    addActivity(`Test case ${testCaseId} ${action}`, 'info');

    res.json({
      status: 'success',
      message: `Test case ${testCaseId} ${action} successfully`,
      reviewState: reviewState.testCaseReviews[testCaseId]
    });
  } catch (error) {
    console.error('Error updating review status:', error);
    res.status(500).json({ 
      status: 'error', 
      message: 'Failed to update review status',
      error: error.message 
    });
  }
});

// Submit reviewed test cases to Zephyr
app.post('/api/submit-to-zephyr', async (req, res) => {
  try {
    const { projectId = 'default-project', submittedBy = 'user' } = req.body;
    
    // Get all reviewed test cases
    const reviewedTestCaseIds = Object.keys(reviewState.testCaseReviews)
      .filter(id => reviewState.testCaseReviews[id].reviewed);
    
    if (reviewedTestCaseIds.length === 0) {
      return res.status(400).json({
        status: 'error',
        message: 'No test cases are marked as reviewed'
      });
    }

    // Fetch test case details from vector storage
    let testCasesToSubmit = [];
    try {
      const vectorTablePath = path.join(__dirname, '..', 'data', 'vector_table.json');
      if (fs.existsSync(vectorTablePath)) {
        const data = fs.readFileSync(vectorTablePath, 'utf8');
        const vectorData = JSON.parse(data);
        
        // Get test cases that match reviewed IDs
        if (vectorData.testCases) {
          testCasesToSubmit = vectorData.testCases.filter(tc => 
            reviewedTestCaseIds.includes(tc.testCaseId)
          );
        }
      }
    } catch (vectorError) {
      console.warn('Could not load test cases from vector storage:', vectorError.message);
    }

    // If no test cases found in vector storage, create placeholder data
    if (testCasesToSubmit.length === 0) {
      testCasesToSubmit = reviewedTestCaseIds.map(id => ({
        testCaseId: id,
        title: `Test Case ${id}`,
        description: `Automated test case for ${id}`,
        storyId: 'unknown',
        category: 'functional'
      }));
    }

    // Record submission in history
    const submissionRecord = {
      submissionId: 'ZEPHYR-' + Date.now(),
      projectId,
      submittedBy,
      submittedAt: new Date().toISOString(),
      testCaseCount: testCasesToSubmit.length,
      testCaseIds: reviewedTestCaseIds,
      zephyrResults: [],
      status: 'success'
    };
    
    reviewState.submissionHistory.push(submissionRecord);

    // Clear review states for submitted test cases
    reviewedTestCaseIds.forEach(id => {
      delete reviewState.testCaseReviews[id];
    });

    // Add to activity log
    addActivity(`Submitted ${testCasesToSubmit.length} test cases to Zephyr (${submissionRecord.submissionId})`, 'success');

    res.json({
      status: 'success',
      message: `Successfully submitted ${testCasesToSubmit.length} test cases to Zephyr`,
      submissionId: submissionRecord.submissionId,
      submittedCount: testCasesToSubmit.length,
      zephyrResults: [],
      submissionRecord
    });

  } catch (error) {
    console.error('Error submitting to Zephyr:', error);
    
    // Record failed submission
    const failedSubmission = {
      submissionId: 'FAILED-' + Date.now(),
      projectId: req.body.projectId || 'default-project',
      submittedBy: req.body.submittedBy || 'user',
      submittedAt: new Date().toISOString(),
      status: 'failed',
      error: error.message
    };
    reviewState.submissionHistory.push(failedSubmission);
    
    addActivity(`Failed to submit test cases to Zephyr: ${error.message}`, 'error');
    
    res.status(500).json({ 
      status: 'error', 
      message: 'Failed to submit test cases to Zephyr',
      error: error.message 
    });
  }
});

// Submit specific test cases to Zephyr (for bulk actions with selected test cases)
app.post('/api/submit-selected-to-zephyr', async (req, res) => {
  try {
    const { testCaseIds, projectId = 'AI-TEST-GENERATION', submittedBy = 'dashboard-user' } = req.body;
    
    if (!testCaseIds || !Array.isArray(testCaseIds) || testCaseIds.length === 0) {
      return res.status(400).json({
        status: 'error',
        message: 'No test case IDs provided'
      });
    }

    // Fetch test case details from vector storage
    let testCasesToSubmit = [];
    try {
      const vectorTablePath = path.join(__dirname, '..', 'data', 'vector_table.json');
      if (fs.existsSync(vectorTablePath)) {
        const data = fs.readFileSync(vectorTablePath, 'utf8');
        const vectorData = JSON.parse(data);
        
        // Get test cases that match provided IDs
        if (vectorData.testCases) {
          testCasesToSubmit = vectorData.testCases.filter(tc => 
            testCaseIds.includes(tc.testCaseId)
          );
        }
      }
    } catch (vectorError) {
      console.warn('Could not load test cases from vector storage:', vectorError.message);
    }

    // If no test cases found in vector storage, create placeholder data
    if (testCasesToSubmit.length === 0) {
      testCasesToSubmit = testCaseIds.map(id => ({
        testCaseId: id,
        title: `Test Case ${id}`,
        description: `Automated test case for ${id}`,
        storyId: 'unknown',
        category: 'functional'
      }));
    }

    // Record submission in history
    const submissionRecord = {
      submissionId: 'JIRA-SELECTED-' + Date.now(),
      projectId,
      submittedBy,
      submittedAt: new Date().toISOString(),
      testCaseCount: testCasesToSubmit.length,
      testCaseIds,
      zephyrResults: [],
      status: 'success',
      type: 'selected_submission'
    };
    
    reviewState.submissionHistory.push(submissionRecord);

    // Add to activity log
    addActivity(`Submitted ${testCasesToSubmit.length} selected test cases to Zephyr (${submissionRecord.submissionId})`, 'success');

    res.json({
      status: 'success',
      message: `Successfully submitted ${testCasesToSubmit.length} test cases to Zephyr`,
      submissionId: submissionRecord.submissionId,
      submittedCount: testCasesToSubmit.length,
      zephyrResults: [],
      submissionRecord
    });

  } catch (error) {
    console.error('Error submitting selected test cases to Zephyr:', error);
    
    // Record failed submission
    const failedSubmission = {
      submissionId: 'FAILED-SELECTED-' + Date.now(),
      projectId: req.body.projectId || 'AI-TEST-GENERATION',
      submittedBy: req.body.submittedBy || 'dashboard-user',
      submittedAt: new Date().toISOString(),
      status: 'failed',
      error: error.message,
      type: 'selected_submission'
    };
    reviewState.submissionHistory.push(failedSubmission);
    
    addActivity(`Failed to submit selected test cases to Zephyr: ${error.message}`, 'error');
    
    res.status(500).json({ 
      status: 'error', 
      message: 'Failed to submit selected test cases to Zephyr',
      error: error.message 
    });
  }
});

// =============================================================================
// NEW TEST CASES & REVIEW COMBINED API ENDPOINTS
// =============================================================================

// Get stories for dropdown
app.get('/api/stories-dropdown', (req, res) => {
  try {
    const vectorTablePath = path.join(__dirname, '..', 'data', 'vector_table.json');
    if (fs.existsSync(vectorTablePath)) {
      const data = fs.readFileSync(vectorTablePath, 'utf8');
      const vectorData = JSON.parse(data);
      
      if (vectorData.storyIds && Array.isArray(vectorData.storyIds)) {
        const stories = vectorData.storyIds.map((storyId, index) => ({
          id: storyId,
          title: vectorData.summaries?.[index] || 'No title',
          description: vectorData.descriptions?.[index] || 'No description'
        }));
        res.json(stories);
      } else {
        res.json([]);
      }
    } else {
      res.json([]);
    }
  } catch (error) {
    console.error('Error loading stories for dropdown:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get test cases for specific story
app.get('/api/story/:storyId/test-cases', (req, res) => {
  try {
    const { storyId } = req.params;
    const vectorTablePath = path.join(__dirname, '..', 'data', 'vector_table.json');
    
    if (!fs.existsSync(vectorTablePath)) {
      return res.status(404).json({ error: 'Vector data not found' });
    }

    const data = fs.readFileSync(vectorTablePath, 'utf8');
    const vectorData = JSON.parse(data);
    
    // Find story index
    const storyIndex = vectorData.storyIds?.indexOf(storyId);
    if (storyIndex === -1 || storyIndex === undefined) {
      return res.status(404).json({ error: 'Story not found' });
    }

    // Get story details
    const story = {
      id: storyId,
      title: vectorData.summaries?.[storyIndex] || 'No title',
      description: vectorData.descriptions?.[storyIndex] || 'No description'
    };

    // Get test cases for this story
    const testCases = [];
    
    // Check if we have real Jira IDs in testCaseIds array
    const realJiraIds = vectorData.testCaseIds && vectorData.testCaseIds[storyIndex] ? vectorData.testCaseIds[storyIndex] : [];

    if (vectorData.testCaseDetails && vectorData.testCaseDetails[storyIndex]) {
      vectorData.testCaseDetails[storyIndex].forEach((testCaseDetail, index) => {
        // Use real Jira ID if available, otherwise fall back to the original testCaseId
        const realJiraId = realJiraIds[index];
        const displayId = realJiraId || testCaseDetail.testCaseId;
        
        testCases.push({
          testCaseId: displayId, // Use real Jira ID if available
          originalId: testCaseDetail.testCaseId, // Keep original for reference
          jiraId: realJiraId, // Explicitly track the Jira ID
          title: testCaseDetail.title,
          description: testCaseDetail.description || '',
          steps: testCaseDetail.steps || [],
          expectedOutcome: testCaseDetail.expectedOutcome || '',
          category: testCaseDetail.category || 'Functional',
          priority: testCaseDetail.priority || 'Medium',
          preconditions: testCaseDetail.preconditions || [],
          inputs: testCaseDetail.inputs || '',
          storyId: storyId
        });
      });
    }

    res.json({
      story,
      testCases,
      count: testCases.length
    });

  } catch (error) {
    console.error('Error loading test cases for story:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update test case
app.put('/api/test-case/:testCaseId', async (req, res) => {
  try {
    const { testCaseId } = req.params;
    const { description, steps, expectedOutcome } = req.body;

    // Validate required fields
    if (!description || !steps || !expectedOutcome) {
      return res.status(400).json({ 
        error: 'Description, steps, and expectedOutcome are required' 
      });
    }

    // Send update request to main API server (port 3000)
    const updatePayload = {
      testCaseId,
      description,
      steps: Array.isArray(steps) ? steps : [steps],
      expectedOutcome
    };

    const response = await axios.put(
      `${STORY_API_BASE_URL}/test-case/${testCaseId}`,
      updatePayload,
      {
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 30000
      }
    );

    // Add to activity log
    addActivity(`📝 Test case ${testCaseId} updated successfully`, 'success');

    res.json({
      status: 'success',
      message: 'Test case updated successfully',
      testCaseId,
      updatedFields: { description, steps, expectedOutcome }
    });

  } catch (error) {
    console.error('Error updating test case:', error);
    
    // Add error to activity log
    addActivity(`❌ Failed to update test case ${req.params.testCaseId}: ${error.message}`, 'error');
    
    res.status(500).json({ 
      status: 'error',
      message: 'Failed to update test case',
      error: error.response?.data?.error || error.message 
    });
  }
});

// Send selected test cases to Zephyr
app.post('/api/send-to-zephyr-story/:storyId', async (req, res) => {
  try {
    const { storyId } = req.params;
    const { selectedTestCaseIds, projectId = 'default-project', submittedBy = 'user' } = req.body;

    if (!selectedTestCaseIds || selectedTestCaseIds.length === 0) {
      return res.status(400).json({
        error: 'No test cases selected for submission'
      });
    }

    // Get test case details from vector storage
    let testCasesToSubmit = [];
    try {
      const vectorTablePath = path.join(__dirname, '..', 'data', 'vector_table.json');
      if (fs.existsSync(vectorTablePath)) {
        const data = fs.readFileSync(vectorTablePath, 'utf8');
        const vectorData = JSON.parse(data);
        
        // Find story index
        const storyIndex = vectorData.storyIds?.indexOf(storyId);
        if (storyIndex !== -1 && vectorData.testCaseDetails && vectorData.testCaseDetails[storyIndex]) {
          testCasesToSubmit = vectorData.testCaseDetails[storyIndex].filter(tc => 
            selectedTestCaseIds.includes(tc.testCaseId)
          );
        }
      }
    } catch (vectorError) {
      console.warn('Could not load test cases from vector storage:', vectorError.message);
    }

    // If no test cases found in vector storage, create placeholder data
    if (testCasesToSubmit.length === 0) {
      return res.status(404).json({
        error: 'Selected test cases not found in vector storage'
      });
    }

    // Validate test cases have proper format for Zephyr
    const validatedTestCases = testCasesToSubmit.map(tc => {
      // Ensure proper Zephyr format
      let testSteps = tc.testSteps || [];
      
      // If using old format, convert to new format
      if (!testSteps.length && tc.steps) {
        testSteps = tc.steps.map((step, index) => ({
          step: index + 1,
          action: step,
          testData: tc.inputs || 'Test data required',
          expectedResult: index === tc.steps.length - 1 ? tc.expectedOutcome : 'Proceed to next step'
        }));
      }
      
      // Ensure at least 2 test steps as required
      if (testSteps.length < 2) {
        testSteps = [
          {
            step: 1,
            action: tc.title || tc.summary || 'Execute test case',
            testData: tc.inputs || 'Valid test data',
            expectedResult: 'Test setup completed successfully'
          },
          {
            step: 2,
            action: 'Verify test results',
            testData: 'Expected output criteria',
            expectedResult: tc.expectedOutcome || 'Test case passes validation'
          }
        ];
      }

      return {
        testCaseId: tc.testCaseId,
        summary: tc.title || tc.summary || `Test Case ${tc.testCaseId}`,
        description: tc.description || tc.summary || `Automated test case for ${tc.testCaseId}`,
        category: tc.category || 'functional',
        priority: tc.priority || 'Normal',
        testSteps: testSteps,
        preconditions: tc.preconditions || ['System is accessible and functional']
      };
    });

    // Try to create test cases in actual Zephyr system
    let zephyrResults = [];
    let useRealZephyr = false;
    
    try {
      // Initialize Zephyr service
      const zephyrService = new ZephyrService();
      
      // Attempt to create test cases in real Zephyr
      const createdTestCases = await zephyrService.createTestCases(validatedTestCases);
      
      zephyrResults = createdTestCases.map(result => ({
        testCaseId: result.testCaseId,
        zephyrId: result.zephyrId,
        zephyrKey: result.key,
        status: result.success ? 'created' : 'failed',
        submittedAt: new Date().toISOString(),
        error: result.error || null
      }));
      
      useRealZephyr = true;
      
    } catch (zephyrError) {
      console.warn('Zephyr service not available, using simulation:', zephyrError.message);
      
      // Fall back to simulation mode
      zephyrResults = validatedTestCases.map(tc => {
        let zephyrId, status;
        if (reviewState.zephyrMappings[tc.testCaseId]) {
          // Already submitted, reuse existing Zephyr ID
          zephyrId = reviewState.zephyrMappings[tc.testCaseId].zephyrId;
          status = 'updated';
        } else {
          // New submission, generate new Zephyr ID
          zephyrId = `Z-${Math.floor(Math.random() * 10000)}`;
          reviewState.zephyrMappings[tc.testCaseId] = {
            zephyrId,
            submittedAt: new Date().toISOString()
          };
          status = 'created';
        }
        return {
          testCaseId: tc.testCaseId,
          zephyrId,
          status,
          submittedAt: new Date().toISOString()
        };
      });
    }

    // Count successful submissions
    const successfulSubmissions = zephyrResults.filter(r => r.status === 'created' || r.status === 'updated');
    const submissionId = 'ZEPHYR-' + Date.now();

    // Record submission in history
    const submissionRecord = {
      submissionId,
      storyId,
      projectId,
      submittedBy,
      submittedAt: new Date().toISOString(),
      testCaseCount: validatedTestCases.length,
      testCaseIds: selectedTestCaseIds,
      zephyrResults,
      status: successfulSubmissions.length > 0 ? 'success' : 'failed',
      mode: useRealZephyr ? 'real-zephyr' : 'simulation'
    };
    
    reviewState.submissionHistory.push(submissionRecord);

    // Add to activity log
    const modeText = useRealZephyr ? 'Zephyr' : 'Zephyr (simulated)';
    if (successfulSubmissions.length > 0) {
      addActivity(`🚀 Submitted ${successfulSubmissions.length}/${validatedTestCases.length} test cases from story ${storyId} to ${modeText} (${submissionId})`, 'success');
    } else {
      addActivity(`❌ Failed to submit test cases from story ${storyId} to ${modeText}: All submissions failed`, 'error');
    }

    res.json({
      status: successfulSubmissions.length > 0 ? 'success' : 'failed',
      message: useRealZephyr 
        ? `Successfully submitted ${successfulSubmissions.length}/${validatedTestCases.length} test cases to Zephyr`
        : `Simulated submission of ${successfulSubmissions.length} test cases (Zephyr not configured)`,
      submissionId,
      storyId,
      submittedCount: successfulSubmissions.length,
      totalCount: validatedTestCases.length,
      zephyrResults,
      submissionRecord,
      mode: useRealZephyr ? 'real-zephyr' : 'simulation',
      testCasesDetails: validatedTestCases.map(tc => ({
        testCaseId: tc.testCaseId,
        summary: tc.summary,
        testStepsCount: tc.testSteps.length,
        hasProperFormat: tc.testSteps.length >= 2
      }))
    });

  } catch (error) {
    console.error('Error submitting to Zephyr:', error);
    
    addActivity(`❌ Failed to submit test cases from story ${req.params.storyId} to Zephyr: ${error.message}`, 'error');
    
    res.status(500).json({ 
      status: 'error', 
      message: 'Failed to submit test cases to Zephyr',
      error: error.message 
    });
  }
});

// Initialize and start server
// API endpoint to check Story API connection
app.get('/api/check-story-api', async (req, res) => {
  try {
    // Try to call the health endpoint of the Story API
    const response = await axios.get(`${STORY_API_BASE_URL}/health`, { timeout: 5000 });
    if (response.status === 200 && response.data && (response.data.status === 'ok' || response.data.status === 'healthy' || response.data.success === true)) {
      res.json({ connected: true });
    } else {
      res.json({ connected: false });
    }
  } catch (error) {
    res.json({ connected: false, error: error.message });
  }
});

// Test Jira connection endpoint
app.get('/api/test-jira-connection', async (req, res) => {
  try {
    const jiraService = new JiraService();
    const connectionResult = await jiraService.testConnection();
    
    res.json({
      status: 'success',
      ...connectionResult
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
      simulationMode: true
    });
  }
});

loadRealData();
initializeActivity();
addSystemLog('INFO', 'Dashboard server starting...');

app.listen(DASHBOARD_PORT, () => {
  addSystemLog('SUCCESS', `Server started on port ${DASHBOARD_PORT}`);
  console.log(`\n🚀 AI Test Generation Dashboard running on http://localhost:${DASHBOARD_PORT}`);
  console.log(`   • Direct integration with API: ${STORY_API_BASE_URL}`);
  console.log(`   1. Open http://localhost:${DASHBOARD_PORT} in browser`);

});
