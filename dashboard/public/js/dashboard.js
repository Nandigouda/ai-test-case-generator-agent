// AI Test Case Automation Platform - Dashboard JavaScript

let recentSubmissions = new Map();

// Tab switching functionality
function showTab(tabName, event) {
    if (event) {
        event.preventDefault();
    }
    
    // Hide all tab contents
    const tabContents = document.querySelectorAll('.tab-content');
    tabContents.forEach(tab => {
        tab.style.display = 'none';
        tab.classList.remove('active');
    });
    
    // Remove active class from all nav items
    const allTabs = document.querySelectorAll('.nav-tab');
    allTabs.forEach(tab => {
        tab.classList.remove('active');
    });
    
    // Show selected tab content
    const selectedTab = document.getElementById(tabName);
    if (selectedTab) {
        selectedTab.style.display = 'block';
        selectedTab.classList.add('active');
    }
    
    // Add active class to clicked nav item
    const clickedTab = document.querySelector(`.nav-tab[onclick*="'${tabName}'"]`);
    if (clickedTab) {
        clickedTab.classList.add('active');
    }
    
    // Load content based on tab
    switch(tabName) {
        case 'stories':
            loadStoriesTab();
            break;
        case 'testcases':
            loadTestCasesTab();
            break;
        case 'monitoring':
            loadMonitoringTab();
            break;
        case 'dashboard':
        default:
            loadDashboardData();
            break;
    }
}

// Initialize dashboard on page load
document.addEventListener('DOMContentLoaded', function() {
    // Force proper tab initialization
    initializeTabs();
    
    loadRecentActivity();
    checkAPIStatus();
    
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                performSearch();
            }
        });
    }
    
    setInterval(() => {
        checkAPIStatus();
    }, 30000);
    
    setInterval(cleanupOldSubmissions, 60000);
});

// Force proper tab initialization
function initializeTabs() {
    // Hide all tabs first
    const allTabs = ['dashboard', 'stories', 'testcases', 'monitoring'];
    allTabs.forEach(tabId => {
        const tab = document.getElementById(tabId);
        if (tab) {
            tab.style.display = 'none';
            tab.classList.remove('active');
        }
    });
    
    // Remove active from all nav tabs
    document.querySelectorAll('.nav-tab').forEach(tab => {
        tab.classList.remove('active');
    });
    
    // Show only dashboard and make it active
    const dashboardTab = document.getElementById('dashboard');
    const dashboardNav = document.querySelector('.nav-tab[onclick*="dashboard"]');
    
    if (dashboardTab) {
        dashboardTab.style.display = 'block';
        dashboardTab.classList.add('active');
    }
    
    if (dashboardNav) {
        dashboardNav.classList.add('active');
    }
}

// Check API connection status
async function checkAPIStatus() {
    const statusElement = document.getElementById('api-status');
    try {
        const response = await fetch('/api/check-story-api');
        const result = await response.json();
        
        if (result.status === 'ok' || result.status === 'healthy') {
            statusElement.textContent = 'Connected';
            statusElement.style.color = '#28a745';
        } else {
            statusElement.textContent = 'Disconnected';
            statusElement.style.color = '#dc3545';
        }
    } catch (error) {
        statusElement.textContent = 'Disconnected';
        statusElement.style.color = '#dc3545';
        console.error('Error checking API status:', error);
    }
}

// Load recent activity feed
async function loadRecentActivity() {
    try {
        const response = await fetch('/api/recent-activity');
        const activities = await response.json();
        
        let html = '';
        activities.forEach(activity => {
            // Enhanced activity display with action type icons
            let typeIcon = '';
            let typeColor = '';
            
            switch(activity.type) {
                case 'success':
                    typeIcon = '✅';
                    typeColor = '#c6f6d5; color: #22543d';
                    break;
                case 'warning':
                    typeIcon = '⚠️';
                    typeColor = '#fef5e7; color: #744210';
                    break;
                case 'info':
                    typeIcon = 'ℹ️';
                    typeColor = '#e6f3ff; color: #2c5aa0';
                    break;
                case 'error':
                    typeIcon = '❌';
                    typeColor = '#fed7d7; color: #742a2a';
                    break;
                default:
                    typeIcon = '📋';
                    typeColor = '#f0f0f0; color: #4a4a4a';
            }
            
            html += '<div style="display: flex; justify-content: space-between; align-items: center; padding: 12px 0; border-bottom: 1px solid #e2e8f0;">' +
                '<div style="flex: 1;">' +
                    '<div style="font-weight: 500; color: #2d3748; margin-bottom: 2px;">' + activity.action + '</div>' +
                    '<div style="font-size: 12px; color: #718096; display: flex; align-items: center; gap: 8px;">' + 
                        '<span>' + activity.time + '</span>' +
                        (activity.details ? '<span style="background: #f7fafc; padding: 2px 6px; border-radius: 4px;">' + activity.details + '</span>' : '') +
                    '</div>' +
                '</div>' +
                '<div style="padding: 4px 8px; border-radius: 12px; font-size: 10px; font-weight: 500; text-transform: uppercase; background: ' + typeColor + '; display: flex; align-items: center; gap: 4px;">' + 
                    typeIcon + ' ' + activity.type + 
                '</div>' +
            '</div>';
        });
        
        document.getElementById('activity-feed').innerHTML = html || '<div class="loading">No recent activity</div>';
    } catch (error) {
        document.getElementById('activity-feed').innerHTML = '<div class="alert alert-error">Error loading activity</div>';
    }
}

// Call existing API with form data
async function callExistingAPI() {
    const storyId = document.getElementById('api-story-id').value.trim();
    const summary = document.getElementById('api-summary').value.trim();
    const description = document.getElementById('api-description').value.trim();
    
    if (!storyId || !summary || !description) {
        showAlert('Please fill in all required fields', 'error');
        return;
    }
    
    const submissionKey = storyId + '-' + summary + '-' + description;
    const now = Date.now();
    const lastSubmission = recentSubmissions.get(submissionKey);
    
    if (lastSubmission && (now - lastSubmission) < 10000) {
        const remainingTime = Math.ceil((10000 - (now - lastSubmission)) / 1000);
        showAlert('Please wait ' + remainingTime + ' seconds before submitting the same story again', 'warning');
        return;
    }
    
    const button = event.target;
    if (button.disabled) {
        showAlert('API call already in progress. Please wait...', 'warning');
        return;
    }
    
    recentSubmissions.set(submissionKey, now);
    
    const originalText = button.innerHTML;
    button.innerHTML = '<div class="spinner"></div> Calling API...';
    button.disabled = true;
    
    try {
        const response = await fetch('/api/call-story-api', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                story_id: storyId, 
                summary: summary, 
                description: description 
            })
        });
        
        const result = await response.json();
        
        if (result.success) {
            showApiResult(result, 'success');
            loadDashboardData();
            loadRecentActivity();
            
            document.getElementById('api-story-id').value = '';
            document.getElementById('api-summary').value = '';
            document.getElementById('api-description').value = '';
        } else {
            showApiResult(result, 'error');
            recentSubmissions.delete(submissionKey);
        }
    } catch (error) {
        showApiResult({ error: error.message }, 'error');
        recentSubmissions.delete(submissionKey);
    } finally {
        button.innerHTML = originalText;
        button.disabled = false;
    }
}

// Display API call results
function showApiResult(result, type) {
    const container = document.getElementById('api-result');
    let alertClass, icon;
    
    // Enhanced action detection based on API response
    if (result.action === 'duplicate') {
        alertClass = 'alert-warning';
        icon = '🔁';
        type = 'duplicate';
    } else if (result.action === 'update') {
        alertClass = 'alert-info';
        icon = '🔄';
        type = 'update';
    } else if (result.action === 'new') {
        alertClass = 'alert-success';
        icon = '✨';
        type = 'new';
    } else if (result.isDuplicate) {
        alertClass = 'alert-warning';
        icon = '🔁';
        type = 'duplicate';
    } else {
        alertClass = type === 'success' ? 'alert-success' : 'alert-error';
        icon = type === 'success' ? '✅' : '❌';
    }
    
    let content = '';
    if (type === 'success' || type === 'new') {
        const testCaseCount = result.testCasesGenerated || (result.testCaseIds ? result.testCaseIds.length : 0);
        content = 
            '<strong>🎉 NEW STORY CREATED!</strong><br>' +
            'Story ID: <strong>' + (result.storyId || 'N/A') + '</strong><br>' +
            'Test Cases Generated: <strong>' + testCaseCount + '</strong><br>' +
            'Processing Time: ' + (result.processingTime || 'N/A') + '<br>' +
            '<small style="color: #22543d;">✨ Fresh test cases created with AI assistance</small>';
    } else if (type === 'update') {
        const testCaseCount = result.testCasesGenerated || (result.testCaseIds ? result.testCaseIds.length : 0);
        content = 
            '<strong>🔄 STORY UPDATED!</strong><br>' +
            'Story ID: <strong>' + (result.storyId || 'N/A') + '</strong><br>' +
            'Test Cases Updated: <strong>' + testCaseCount + '</strong><br>' +
            'Processing Time: ' + (result.processingTime || 'N/A') + '<br>' +
            '<small style="color: #2c5aa0;">🔄 Existing story enhanced with updated content</small>';
    } else if (type === 'duplicate') {
        let duplicateInfo = '';
        if (result.duplicateOf) {
            duplicateInfo = 'Matches existing story: <strong>' + result.duplicateOf + '</strong><br>';
            if (result.similarity) {
                duplicateInfo += 'Content similarity: <strong>' + result.similarity + '%</strong><br>';
            }
        }
        
        const testCaseCount = result.testCasesGenerated || (result.testCaseIds ? result.testCaseIds.length : 0);
        content = 
            '<strong>🔁 DUPLICATE CONTENT DETECTED!</strong><br>' +
            duplicateInfo +
            'Story ID: <strong>' + (result.storyId || 'N/A') + '</strong><br>' +
            'Test Cases Returned: <strong>' + testCaseCount + '</strong><br>' +
            'Processing Time: ' + (result.processingTime || 'N/A') + '<br>' +
            '<div style="margin-top: 10px; padding: 8px; background: rgba(0,0,0,0.05); border-radius: 4px; font-size: 12px;">' +
            '<strong>ℹ️ Smart Duplicate Prevention:</strong> ' + (result.message || 'Identical content detected') + '<br>' +
            (result.note || 'Existing test cases returned to avoid redundancy.') +
            '</div>';
    } else {
        content = 
            '<strong>❌ API Call Failed</strong><br>' +
            'Error: ' + (result.error || 'Unknown error') + '<br>' +
            '<small>Please check your API server and try again</small>';
    }
    
    container.innerHTML = 
        '<div class="alert ' + alertClass + '">' +
            '<span>' + icon + '</span>' +
            '<div>' + content + '</div>' +
        '</div>';
    container.style.display = 'block';
    
    const hideDelay = type === 'duplicate' ? 15000 : 10000;
    setTimeout(() => {
        container.style.display = 'none';
    }, hideDelay);
}

// Refresh dashboard data
function refreshDashboard() {
    showAlert('Refreshing dashboard data...', 'info');
    loadDashboardData();
    loadRecentActivity();
}

// Show alert messages
function showAlert(message, type) {
    const alertClass = 'alert-' + type;
    let icon;
    switch(type) {
        case 'success': icon = '✅'; break;
        case 'error': icon = '❌'; break;
        case 'warning': icon = '⚠️'; break;
        default: icon = 'ℹ️';
    }
    
    const alertHtml = 
        '<div class="alert ' + alertClass + '" style="margin: 20px 0;">' +
            '<span>' + icon + '</span>' +
            '<div>' + message + '</div>' +
        '</div>';
    
    const mainContent = document.querySelector('.main-content');
    if (mainContent) {
        mainContent.insertAdjacentHTML('afterbegin', alertHtml);
        
        setTimeout(() => {
            const alert = mainContent.querySelector('.alert');
            if (alert) alert.remove();
        }, 5000);
    }
}

// Clean up old submissions to prevent memory leaks
function cleanupOldSubmissions() {
    const now = Date.now();
    const cutoff = 60000;
    
    for (const [key, timestamp] of recentSubmissions.entries()) {
        if (now - timestamp > cutoff) {
            recentSubmissions.delete(key);
        }
    }
}

// Enhanced search functionality - handles both Test Case IDs and Story IDs
async function performSearch(testCaseId) {
    let query;
    
    if (testCaseId) {
        // Called with a specific test case ID (from test case cards)
        query = testCaseId;
    } else {
        // Called from search input
        const searchInput = document.getElementById('searchInput');
        query = searchInput.value.trim();
        
        if (!query) {
            showAlert('Please enter a Story ID or Test Case ID', 'warning');
            return;
        }
    }

    try {
        const response = await fetch('/api/test-case/' + encodeURIComponent(query));
        
        const result = await response.json();
        console.log("Response received for search query result :", JSON.stringify(result));
        if (result.status === 'success') {
            if (result.searchType === 'story') {
                // Show story test cases dialog
                showStoryTestCasesDialog(result.story, result.testCases);
            } else if (result.searchType === 'testcase') {
                // Show single test case dialog
                showTestCaseDialog(result.testCase);
            }
        } else {
            showDialog('Search Results', '<div style="text-align: center; color: #718096; padding: 40px; font-style: italic;">No results found for "' + query + '". Please check the Story ID or Test Case ID and try again.</div>');
        }
    } catch (error) {
        showAlert('Search failed: ' + error.message, 'error');
    }
}

// Show test case details in dialog
function showTestCaseDialog(testCase) {
    console.log('Displaying test case details for:', testCase);
    const tcId = testCase.testCaseId || testCase.id || 'Unknown';
    const storyId = testCase.relatedStoryId || testCase.storyId || 'Unknown';
    
    let content = '<div class="info-grid">' +
        '<div class="info-item">' +
            '<div class="info-label">TC-ID</div>' +
            '<div class="info-value" style="font-weight: bold; color: #2d3748; font-size: 18px;">' + tcId + '</div>' +
        '</div>' +
        '<div class="info-item">' +
            '<div class="info-label">Story-ID</div>' +
            '<div class="info-value" style="font-weight: bold; color: #2d3748; font-size: 18px;">' + storyId + '</div>' +
        '</div>' +
    '</div>' +
    
    '<div class="info-item">' +
        '<div class="info-label">Test Case Title</div>' +
        '<div class="info-value" style="font-weight: 600; color: #1a202c; font-size: 16px;">' + (testCase.title || 'Test Case ' + tcId) + '</div>' +
    '</div>' +
    
    '<div class="info-grid" style="margin-top: 15px;">' +
        '<div class="info-item">' +
            '<div class="info-label">Category</div>' +
            '<div class="info-value">' + (testCase.category || 'General') + '</div>' +
        '</div>' +
        '<div class="info-item">' +
            '<div class="info-label">Priority</div>' +
            '<div class="info-value">' + (testCase.priority || 'Medium') + '</div>' +
        '</div>' +
    '</div>';

    if (testCase.preconditions && testCase.preconditions.length > 0) {
        content += '<div class="preconditions">' +
            '<div class="info-label">Preconditions</div>' +
            '<ul>';
        testCase.preconditions.forEach(pc => {
            content += '<li>' + pc + '</li>';
        });
        content += '</ul></div>';
    }

    if (testCase.steps && testCase.steps.length > 0) {
        content += '<div class="test-steps">' +
            '<div class="info-label">Test Steps</div>' +
            '<ol>';
        testCase.steps.forEach(step => {
            content += '<li>' + step + '</li>';
        });
        content += '</ol></div>';
    }

    if (testCase.inputs) {
        content += '<div class="test-inputs">' +
            '<div class="info-label">Test Inputs</div>' +
            '<div>' + testCase.inputs + '</div>' +
        '</div>';
    }

    if (testCase.expectedOutcome) {
        content += '<div class="test-outcome">' +
            '<div class="info-label">Expected Outcome</div>' +
            '<div>' + testCase.expectedOutcome + '</div>' +
        '</div>';
    }
        
    content += '<div class="info-item" style="margin-top: 20px; border-top: 1px solid #e2e8f0; padding-top: 15px;">' +
        '<div class="info-label">Related Story</div>' +
        '<div class="info-value">' +
            '<div style="font-weight: 600; margin-bottom: 5px;">' + (testCase.storyTitle || 'No title available') + '</div>' +
            '<div style="color: #4a5568; font-size: 14px;">' + (testCase.storyDescription || 'No description available') + '</div>' +
        '</div>' +
    '</div>';
    
    showDialog('Test Case Details', content);
}

// Show story test cases dialog
function showStoryTestCasesDialog(story, testCases) {
    let content = '<div class="story-header" style="margin-bottom: 25px; padding: 20px; background: #f7fafc; border-radius: 8px; border-left: 4px solid #3182ce;">' +
        '<div class="info-item">' +
            '<div class="info-label">Story ID</div>' +
            '<div class="info-value" style="font-weight: bold; color: #2d3748; font-size: 18px;">' + story.storyId + '</div>' +
        '</div>' +
        '<div class="info-item" style="margin-top: 10px;">' +
            '<div class="info-label">Story Title</div>' +
            '<div class="info-value" style="font-weight: 600; color: #1a202c; font-size: 16px;">' + story.summary + '</div>' +
        '</div>' +
        '<div class="info-item" style="margin-top: 10px;">' +
            '<div class="info-label">Description</div>' +
            '<div class="info-value" style="color: #4a5568; font-size: 14px; line-height: 1.5;">' + (story.description.length > 200 ? story.description.substring(0, 200) + '...' : story.description) + '</div>' +
        '</div>' +
    '</div>';

    content += '<div class="test-cases-header" style="margin-bottom: 15px;">' +
        '<h3 style="color: #2d3748; margin: 0; font-size: 16px;">📋 Test Cases (' + testCases.length + ')</h3>' +
    '</div>';

    content += '<div class="test-cases-grid" style="display: grid; gap: 15px;">';
    
    testCases.forEach((testCase, index) => {
        const priorityColor = testCase.priority === 'High' ? '#e53e3e' : testCase.priority === 'Medium' ? '#d69e2e' : '#38a169';
        
        content += '<div class="test-case-card" style="border: 1px solid #e2e8f0; border-radius: 8px; padding: 15px; background: #fff; cursor: pointer; transition: all 0.2s;" onclick="performSearch(\'' + testCase.testCaseId + '\')" onmouseover="this.style.boxShadow=\'0 4px 8px rgba(0,0,0,0.1)\'; this.style.borderColor=\'#3182ce\'" onmouseout="this.style.boxShadow=\'none\'; this.style.borderColor=\'#e2e8f0\'">' +
            '<div class="test-case-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">' +
                '<div class="test-case-id" style="font-weight: bold; color: #3182ce; font-size: 14px;">' + testCase.testCaseId + '</div>' +
                '<div class="test-case-priority" style="background: ' + priorityColor + '; color: white; padding: 2px 8px; border-radius: 12px; font-size: 12px; font-weight: 500;">' + testCase.priority + '</div>' +
            '</div>' +
            '<div class="test-case-title" style="font-weight: 600; color: #1a202c; margin-bottom: 8px; font-size: 15px;">' + testCase.title + '</div>' +
            '<div class="test-case-category" style="color: #4a5568; font-size: 13px; margin-bottom: 5px;">Category: ' + testCase.category + '</div>' +
            '<div class="test-case-steps" style="color: #718096; font-size: 12px;">Steps: ' + (testCase.steps ? testCase.steps.length : 0) + ' | Expected: ' + (testCase.expectedOutcome ? 'Yes' : 'No') + '</div>' +
        '</div>';
    });
    
    content += '</div>';

    if (testCases.length === 0) {
        content += '<div style="text-align: center; color: #718096; padding: 40px; font-style: italic;">No test cases found for this story.</div>';
    }

    showDialog('Story Test Cases - ' + story.storyId, content);
}

// Show dialog modal
function showDialog(title, content) {
    const dialog = document.getElementById('searchDialog');
    const dialogTitle = document.getElementById('dialogTitle');
    const dialogContent = document.getElementById('dialogContent');
    
    dialogTitle.textContent = title;
    dialogContent.innerHTML = content;
    dialog.style.display = 'flex';
}

// Close dialog modal
function closeDialog() {
    const dialog = document.getElementById('searchDialog');
    dialog.style.display = 'none';
}

// Tab content loading functions
async function loadStoriesTab() {
    const storiesList = document.getElementById('stories-list');
    if (!storiesList) return;
    
    storiesList.innerHTML = '<div class="loading"><div class="spinner"></div>Loading stories...</div>';
    
    try {
        const response = await fetch('/api/stories');
        const stories = await response.json();
        
        if (stories.length === 0) {
            storiesList.innerHTML = '<div style="text-align: center; padding: 40px; color: #718096;">No stories found. Create your first story!</div>';
            return;
        }
        
        let html = '<div class="stories-grid">';
        stories.forEach(story => {
            html += '<div class="story-card">' +
                '<div class="story-header">' +
                    '<h3>' + story.story_id + '</h3>' +
                    '<span class="story-status">Active</span>' +
                '</div>' +
                '<div class="story-content">' +
                    '<p><strong>Summary:</strong> ' + story.summary + '</p>' +
                    '<p><strong>Description:</strong> ' + story.description + '</p>' +
                    '<p><strong>Test Cases:</strong> ' + (story.test_case_ids ? story.test_case_ids.length : 0) + '</p>' +
                '</div>' +
            '</div>';
        });
        html += '</div>';
        
        storiesList.innerHTML = html;
    } catch (error) {
        storiesList.innerHTML = '<div style="color: #e53e3e; text-align: center; padding: 20px;">Error loading stories: ' + error.message + '</div>';
    }
}

async function loadTestCasesTab() {
    const testcasesList = document.getElementById('testcases-list');
    if (!testcasesList) return;
    
    testcasesList.innerHTML = '<div class="loading"><div class="spinner"></div>Loading test cases...</div>';
    
    try {
        const response = await fetch('/api/test-cases');
        const testCases = await response.json();
        
        if (testCases.length === 0) {
            testcasesList.innerHTML = '<div style="text-align: center; padding: 40px; color: #718096;">No test cases found. Generate your first test cases!</div>';
            return;
        }
        
        let html = '<div class="testcases-grid">';
        testCases.forEach(tc => {
            html += '<div class="testcase-card" onclick="viewTestCaseDetails(\'' + tc.testCaseId + '\')">' +
                '<div class="testcase-header">' +
                    '<h3>' + tc.testCaseId + '</h3>' +
                    '<span class="testcase-category">' + tc.category + '</span>' +
                '</div>' +
                '<div class="testcase-content">' +
                    '<p><strong>Title:</strong> ' + tc.title + '</p>' +
                    '<p><strong>Story:</strong> ' + tc.storyId + '</p>' +
                    '<p class="testcase-click-hint">👁️ Click to view details</p>' +
                '</div>' +
            '</div>';
        });
        html += '</div>';
        
        testcasesList.innerHTML = html;
    } catch (error) {
        testcasesList.innerHTML = '<div style="color: #e53e3e; text-align: center; padding: 20px;">Error loading test cases: ' + error.message + '</div>';
    }
}

// Helper functions for tab buttons
function loadStories() {
    loadStoriesTab();
}

function createNewStory() {
    showAlert('Story creation feature coming soon!', 'info');
}

function loadTestCases() {
    loadTestCasesTab();
}

function generateTestCases() {
    showAlert('AI test case generation feature coming soon!', 'info');
}

// Function to view test case details (called from test case cards)
async function viewTestCaseDetails(testCaseId) {
    showAlert('Loading test case details...', 'info');
    console.log('Fetching details for test case ID:', testCaseId);
    try {
        const response = await fetch('/api/test-case/' + encodeURIComponent(testCaseId));
        console.log('testing i am in viewTestCaseDetails function');
        const result = await response.json();
        console.log('Response received for test case ID result :', result);
        if (result.status === 'success' && result.testCase) {
            showTestCaseDialog(result.testCase);
        } else {
            showAlert('Test case details not found for ID: ' + testCaseId, 'warning');
        }
    } catch (error) {
        console.error('Error loading test case details:', error);
        showAlert('Failed to load test case details: ' + error.message, 'error');
    }
}

// =============================================================================
// REVIEW WORKFLOW FUNCTIONALITY
// Store Zephyr mapping for the current session
let latestZephyrMapping = {};
// =============================================================================

let reviewState = {
    testCases: [],
    reviewedIds: new Set(),
    totalCount: 0
};

// Load Review Tab Content
async function loadReviewTab() {
    // Reset review state when entering the tab
    reviewState.reviewedIds.clear();
    hideReviewSummary();
    updateReviewProgress();
}

// Load test cases specifically for the review process
async function loadTestCasesForReview() {
    const storyId = document.getElementById('story-dropdown').value;
    if (!storyId) {
        showAlert('Please select a story first', 'warning');
        return;
    }

    try {
        // Fetch test cases for the selected story
        const response = await fetch(`/api/test-cases/${storyId}`);
        const data = await response.json();
        
        if (!data.success) {
            throw new Error(data.message || 'Failed to load test cases');
        }

        const testCasesContainer = document.getElementById('testcases-review-container');
        testCasesContainer.innerHTML = ''; // Clear existing content

        // Create selection controls
        const selectAllDiv = document.createElement('div');
        selectAllDiv.className = 'select-all-container';
        selectAllDiv.innerHTML = `
            <label>
                <input type="checkbox" id="select-all-testcases" />
                Select All Test Cases
            </label>
            <button id="submit-selected-testcases" class="primary-button" disabled>
                Submit Selected to Zephyr
            </button>
        `;
        testCasesContainer.appendChild(selectAllDiv);

        // Create test cases list
        const testCasesList = document.createElement('div');
        testCasesList.className = 'test-cases-list';
        
        data.testCases.forEach((testCase, index) => {
            const testCaseElement = createTestCaseReviewElement(testCase, index);
            testCasesList.appendChild(testCaseElement);
        });
        
        testCasesContainer.appendChild(testCasesList);

        // Setup event listeners
        setupTestCaseReviewListeners();
        
    } catch (error) {
        console.error('Error loading test cases:', error);
        showAlert(error.message, 'error');
    }
}

function createTestCaseReviewElement(testCase, index) {
    const element = document.createElement('div');
    element.className = 'test-case-review-item';
    element.innerHTML = `
        <div class="test-case-header">
            <label class="checkbox-container">
                <input type="checkbox" class="test-case-checkbox" data-test-case-id="${testCase.id}" />
                <span class="test-case-title">${testCase.id} - ${testCase.title || 'Test Case ' + (index + 1)}</span>
            </label>
            <button class="toggle-details-btn">View Details</button>
        </div>
        <div class="test-case-details" style="display: none;">
            <div class="test-case-description">
                <strong>Description:</strong>
                <p>${testCase.description}</p>
            </div>
            <div class="test-case-steps">
                <strong>Steps:</strong>
                <ol>
                    ${testCase.steps.map(step => `
                        <li>
                            <div><strong>Action:</strong> ${step.step}</div>
                            <div><strong>Data:</strong> ${step.data}</div>
                            <div><strong>Expected:</strong> ${step.result}</div>
                        </li>
                    `).join('')}
                </ol>
            </div>
        </div>
    `;
    return element;
}

function setupTestCaseReviewListeners() {
    // Select all checkbox
    const selectAllCheckbox = document.getElementById('select-all-testcases');
    const submitButton = document.getElementById('submit-selected-testcases');
    const checkboxes = document.querySelectorAll('.test-case-checkbox');
    
    selectAllCheckbox.addEventListener('change', () => {
        const isChecked = selectAllCheckbox.checked;
        checkboxes.forEach(checkbox => {
            checkbox.checked = isChecked;
        });
        updateSubmitButtonState();
    });

    // Individual checkboxes
    checkboxes.forEach(checkbox => {
        checkbox.addEventListener('change', () => {
            updateSubmitButtonState();
            updateSelectAllCheckbox();
        });
    });

    // Toggle details buttons
    document.querySelectorAll('.toggle-details-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const details = btn.closest('.test-case-review-item').querySelector('.test-case-details');
            const isHidden = details.style.display === 'none';
            details.style.display = isHidden ? 'block' : 'none';
            btn.textContent = isHidden ? 'Hide Details' : 'View Details';
        });
    });

    // Submit button
    submitButton.addEventListener('click', submitSelectedTestCases);
}

function updateSubmitButtonState() {
    const submitButton = document.getElementById('submit-selected-testcases');
    const hasSelection = Array.from(document.querySelectorAll('.test-case-checkbox')).some(cb => cb.checked);
    submitButton.disabled = !hasSelection;
}

function updateSelectAllCheckbox() {
    const selectAllCheckbox = document.getElementById('select-all-testcases');
    const checkboxes = Array.from(document.querySelectorAll('.test-case-checkbox'));
    const allChecked = checkboxes.every(cb => cb.checked);
    const someChecked = checkboxes.some(cb => cb.checked);
    
    selectAllCheckbox.checked = allChecked;
    selectAllCheckbox.indeterminate = someChecked && !allChecked;
}

async function submitSelectedTestCases() {
    const selectedTestCases = Array.from(document.querySelectorAll('.test-case-checkbox:checked'))
        .map(checkbox => checkbox.dataset.testCaseId);
    
    if (selectedTestCases.length === 0) {
        showAlert('Please select at least one test case', 'warning');
        return;
    }

    try {
        const response = await fetch('/api/send-to-zephyr', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ testCases: selectedTestCases })
        });

        const data = await response.json();
        
        if (!data.success) {
            throw new Error(data.message || 'Failed to submit test cases to Zephyr');
        }

        showAlert('Test cases successfully submitted to Zephyr', 'success');
        loadTestCasesForReview(); // Reload the list
        
    } catch (error) {
        console.error('Error submitting test cases:', error);
        showAlert(error.message, 'error');
    }
}
    const testcasesList = document.getElementById('review-testcases-list');
    if (!testcasesList) return;
    
    testcasesList.innerHTML = '<div class="loading"><div class="spinner"></div>Loading test cases for review...</div>';
    
    try {
        const response = await fetch('/api/test-cases');
        const testCases = await response.json();
        
        // Store test cases in review state
        reviewState.testCases = testCases;
        reviewState.totalCount = testCases.length;
        
        if (testCases.length === 0) {
            testcasesList.innerHTML = '<div style="text-align: center; padding: 40px; color: #718096;">No test cases found. Generate test cases first in the "Test Cases" tab.</div>';
            hideReviewSummary();
            return;
        }
        
        // Load existing review status
        await loadReviewStatus();
        
        // Show review summary section
        showReviewSummary();
        
        // Render test cases with checkboxes
        renderTestCasesForReview(testCases);
        
        // Update review progress
        updateReviewProgress();
        
    } catch (error) {
        testcasesList.innerHTML = '<div style="color: #e53e3e; text-align: center; padding: 20px;">Error loading test cases: ' + error.message + '</div>';
        hideReviewSummary();
    }


// Enhanced loadTestCasesTab for the original Test Cases tab (without review checkboxes)
async function loadTestCasesTab() {
    const testcasesList = document.getElementById('testcases-list');
    if (!testcasesList) return;
    
    testcasesList.innerHTML = '<div class="loading"><div class="spinner"></div>Loading test cases...</div>';
    
    try {
        const response = await fetch('/api/test-cases');
        const testCases = await response.json();
        
        if (testCases.length === 0) {
            testcasesList.innerHTML = '<div style="text-align: center; padding: 40px; color: #718096;">No test cases found. Generate your first test cases!</div>';
            return;
        }
        
        // Render test cases WITHOUT checkboxes (regular view)
        renderTestCasesRegular(testCases);
        
    } catch (error) {
        testcasesList.innerHTML = '<div style="color: #e53e3e; text-align: center; padding: 20px;">Error loading test cases: ' + error.message + '</div>';
    }
}

// Render test cases for regular view (Test Cases tab)
function renderTestCasesRegular(testCases) {
    const testcasesList = document.getElementById('testcases-list');
    
    let html = '<div class="testcases-grid">';
    testCases.forEach(tc => {
        html += `<div class="testcase-card" onclick="viewTestCaseDetails('${tc.testCaseId}')">
            <div class="testcase-header">
                <h3>${tc.testCaseId}</h3>
                <span class="testcase-category">${tc.category}</span>
            </div>
            <div class="testcase-content">
                <p><strong>Title:</strong> ${tc.title}</p>
                <p><strong>Story:</strong> ${tc.storyId}</p>
                <p class="testcase-click-hint">👁️ Click to view details</p>
            </div>
        </div>`;
    });
    html += '</div>';
    
    testcasesList.innerHTML = html;
}

// Load existing review status from backend
async function loadReviewStatus() {
    try {
        const response = await fetch('/api/test-cases/review-status');
        const result = await response.json();
        
        if (result.status === 'success' && result.reviewState) {
            // Update local review state
            reviewState.reviewedIds.clear();
            Object.keys(result.reviewState).forEach(testCaseId => {
                if (result.reviewState[testCaseId].reviewed) {
                    reviewState.reviewedIds.add(testCaseId);
                }
            });
        }
    } catch (error) {
        console.error('Error loading review status:', error);
    }
}

// Render test cases with review checkboxes (Review tab)
function renderTestCasesForReview(testCases) {
    const testcasesList = document.getElementById('review-testcases-list');
    
    let html = '<div class="testcases-grid">';
    testCases.forEach(tc => {
        const isReviewed = reviewState.reviewedIds.has(tc.testCaseId);
        const reviewedClass = isReviewed ? 'reviewed' : '';
        
        html += `<div class="testcase-card ${reviewedClass}">
            <div class="review-checkbox-container">
                <input type="checkbox" 
                       class="review-checkbox" 
                       id="review-${tc.testCaseId}" 
                       ${isReviewed ? 'checked' : ''}
                       onclick="toggleReview('${tc.testCaseId}')"
                       title="Mark as reviewed">
                <label for="review-${tc.testCaseId}" style="margin-left: 5px; font-size: 12px; color: #4a5568;">Reviewed</label>
            </div>
            <div class="testcase-header">
                <h3>${tc.testCaseId}</h3>
                <span class="testcase-category">${tc.category}</span>
            </div>
            <div class="testcase-content">
                <p><strong>Title:</strong> ${tc.title}</p>
                <p><strong>Story:</strong> ${tc.storyId}</p>
                <div style="margin-top: 10px;">
                    <button onclick="viewTestCaseDetails('${tc.testCaseId}')" class="btn btn-sm" style="padding: 5px 10px; font-size: 12px;">
                        👁️ View Details
                    </button>
                </div>
            </div>
        </div>`;
    });
    html += '</div>';
    
    testcasesList.innerHTML = html;
}

// Toggle review status for a test case
async function toggleReview(testCaseId) {
    try {
        const isCurrentlyReviewed = reviewState.reviewedIds.has(testCaseId);
        const newReviewedState = !isCurrentlyReviewed;
        
        // Update backend
        const response = await fetch('/api/test-cases/review', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                testCaseId: testCaseId,
                reviewed: newReviewedState,
                reviewedBy: 'user'
            })
        });
        
        const result = await response.json();
        
        if (result.status === 'success') {
            // Update local state
            if (newReviewedState) {
                reviewState.reviewedIds.add(testCaseId);
            } else {
                reviewState.reviewedIds.delete(testCaseId);
            }
            
            // Update UI
            const card = document.querySelector(`#review-${testCaseId}`).closest('.testcase-card');
            if (newReviewedState) {
                card.classList.add('reviewed');
            } else {
                card.classList.remove('reviewed');
            }
            
            updateReviewProgress();
            
        } else {
            showAlert('Failed to update review status: ' + result.message, 'error');
            // Revert checkbox state
            document.getElementById(`review-${testCaseId}`).checked = isCurrentlyReviewed;
        }
        
    } catch (error) {
        console.error('Error toggling review:', error);
        showAlert('Failed to update review status: ' + error.message, 'error');
        // Revert checkbox state
        const isCurrentlyReviewed = reviewState.reviewedIds.has(testCaseId);
        document.getElementById(`review-${testCaseId}`).checked = isCurrentlyReviewed;
    }
}

// Update review progress and submit button state
function updateReviewProgress() {
    const reviewedCount = reviewState.reviewedIds.size;
    const totalCount = reviewState.totalCount;
    
    // Update progress text
    const progressElement = document.getElementById('review-progress');
    if (progressElement) {
        if (totalCount === 0) {
            progressElement.textContent = 'Click "Load Test Cases" to start review process';
        } else {
            progressElement.textContent = `${reviewedCount} of ${totalCount} test cases reviewed`;
        }
    }
    
    // Update review summary
    const reviewedCountElement = document.getElementById('reviewed-count');
    const pendingCountElement = document.getElementById('pending-count');
    const progressFillElement = document.getElementById('review-progress-fill');
    
    if (reviewedCountElement) {
        reviewedCountElement.textContent = `${reviewedCount} Reviewed`;
    }
    if (pendingCountElement) {
        pendingCountElement.textContent = `${totalCount - reviewedCount} Pending`;
    }
    if (progressFillElement && totalCount > 0) {
        const percentage = (reviewedCount / totalCount) * 100;
        progressFillElement.style.width = `${percentage}%`;
    }
    
    // Update submit button
    const submitButton = document.getElementById('submit-to-zephyr-btn');
    if (submitButton) {
        const allReviewed = reviewedCount === totalCount && totalCount > 0;
        submitButton.disabled = !allReviewed;
        
        if (allReviewed) {
            submitButton.textContent = '🚀 Submit to Zephyr';
            submitButton.style.background = '#48bb78';
        } else {
            submitButton.textContent = `🚀 Submit to Zephyr (${reviewedCount}/${totalCount})`;
            submitButton.style.background = '#a0aec0';
        }
    }
}

// Submit reviewed test cases to Zephyr
async function submitToZephyr() {
    const reviewedCount = reviewState.reviewedIds.size;
    const totalCount = reviewState.totalCount;
    
    if (reviewedCount !== totalCount) {
        showAlert(`Please review all test cases before submitting. ${reviewedCount} of ${totalCount} reviewed.`, 'warning');
        return;
    }
    
    if (reviewedCount === 0) {
        showAlert('No test cases to submit.', 'warning');
        return;
    }
    
    // Show loading state
    const submitButton = document.getElementById('submit-to-zephyr-btn');
    const originalText = submitButton.textContent;
    submitButton.disabled = true;
    submitButton.textContent = '🔄 Submitting...';
    
    try {
        const response = await fetch('/api/submit-to-zephyr', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                projectId: 'default-project',
                submittedBy: 'user'
            })
        });
        
        const result = await response.json();
        
        if (result.status === 'success') {
            showAlert(`Successfully submitted ${result.submittedCount} test cases to Zephyr! Submission ID: ${result.submissionId}`, 'success');
            
            // Clear review state
            reviewState.reviewedIds.clear();
            
            // Reload test cases to reflect the cleared state
            loadTestCasesForReview();
            
            // Add success animation
            submitButton.classList.add('submit-success');
            setTimeout(() => submitButton.classList.remove('submit-success'), 500);
            
        } else {
            showAlert('Failed to submit to Zephyr: ' + result.message, 'error');
        }
        
    } catch (error) {
        console.error('Error submitting to Zephyr:', error);
        showAlert('Failed to submit to Zephyr: ' + error.message, 'error');
    } finally {
        // Restore button state
        submitButton.disabled = false;
        submitButton.textContent = originalText;
    }
}

// Show review summary section
function showReviewSummary() {
    const reviewSummary = document.getElementById('review-summary');
    if (reviewSummary) {
        reviewSummary.style.display = 'block';
    }
}

// Hide review summary section
function hideReviewSummary() {
    const reviewSummary = document.getElementById('review-summary');
    if (reviewSummary) {
        reviewSummary.style.display = 'none';
    }
}

// =============================================================================
// NEW TEST CASES & REVIEW COMBINED FUNCTIONALITY
// =============================================================================

// Global variables for the new combined workflow
let selectedStory = null;
let storyTestCases = [];
let selectedTestCaseIds = new Set();

// Initialize the new tab when it's first loaded
async function loadTestCasesReviewTab() {
    await loadStoriesDropdown();
    resetSelections();
}

// Load stories for the dropdown
async function loadStoriesDropdown() {
    try {
        const response = await fetch('/api/stories-dropdown');
        const stories = await response.json();
        
        const dropdown = document.getElementById('story-dropdown');
        const tooltip = document.getElementById('story-tooltip');
        
        dropdown.innerHTML = '<option value="">-- Select a Story --</option>';
        
        stories.forEach(story => {
            const option = document.createElement('option');
            option.value = story.id;
            
            // Create display text with truncation
            const fullText = `${story.id} - ${story.title}`;
            const truncatedText = truncateText(fullText, 50); // Limit to 50 characters
            
            option.textContent = truncatedText;
            option.setAttribute('data-full-text', fullText);
            option.setAttribute('data-description', story.description || 'No description available');
            option.setAttribute('data-story-id', story.id);
            option.setAttribute('data-story-title', story.title);
            
            dropdown.appendChild(option);
        });
        
        // Add event listeners for tooltip functionality
        setupDropdownTooltip(dropdown, tooltip, stories);
        
    } catch (error) {
        console.error('Error loading stories dropdown:', error);
        showAlert('Failed to load stories: ' + error.message, 'error');
    }
}

// Helper function to truncate text with ellipses
function truncateText(text, maxLength) {
    if (text.length <= maxLength) {
        return text;
    }
    return text.substring(0, maxLength - 3) + '...';
}

// Setup tooltip functionality for dropdown
function setupDropdownTooltip(dropdown, tooltip, stories) {
    const container = dropdown.parentElement;
    
    // Show tooltip on hover
    container.addEventListener('mouseenter', () => {
        const selectedValue = dropdown.value;
        if (selectedValue) {
            const selectedStory = stories.find(story => story.id === selectedValue);
            if (selectedStory) {
                updateTooltipContent(tooltip, selectedStory);
            }
        } else {
            // Show instruction tooltip when no selection
            tooltip.querySelector('.tooltip-title').textContent = 'Story Selection';
            tooltip.querySelector('.tooltip-description').textContent = 'Select a story from the dropdown to view its full details and associated test cases.';
        }
    });
    
    // Update tooltip when selection changes
    dropdown.addEventListener('change', () => {
        const selectedValue = dropdown.value;
        if (selectedValue) {
            const selectedStory = stories.find(story => story.id === selectedValue);
            if (selectedStory) {
                updateTooltipContent(tooltip, selectedStory);
            }
        }
    });
}

// Update tooltip content with story details
function updateTooltipContent(tooltip, story) {
    const titleEl = tooltip.querySelector('.tooltip-title');
    const descEl = tooltip.querySelector('.tooltip-description');
    
    titleEl.textContent = `${story.id} - ${story.title}`;
    
    // Truncate description for tooltip
    const description = story.description || 'No description available';
    const truncatedDesc = truncateText(description, 200);
    descEl.textContent = truncatedDesc;
}

// Load test cases for selected story
async function loadTestCasesForStory() {
    const dropdown = document.getElementById('story-dropdown');
    const storyId = dropdown.value;
    
    if (!storyId) {
        hideStoryInfo();
        hideTestCasesSection();
        return;
    }
    
    try {
        showLoadingForStory();
        
        const response = await fetch(`/api/story/${storyId}/test-cases`);
        const data = await response.json();
        
        selectedStory = data.story;
        storyTestCases = data.testCases;
        
        showStoryInfo(selectedStory);
        showTestCasesSection();
        renderTestCasesForStory(storyTestCases);
        updateSelectionSummary();
        
    } catch (error) {
        console.error('Error loading test cases for story:', error);
        showAlert('Failed to load test cases: ' + error.message, 'error');
        hideStoryInfo();
        hideTestCasesSection();
    }
}

// Show story information
function showStoryInfo(story) {
    const storyInfoCard = document.getElementById('selected-story-info');
    const storyTitle = document.getElementById('story-title');
    const storyDescription = document.getElementById('story-description');
    
    storyTitle.textContent = `${story.id} - ${story.title}`;
    storyDescription.textContent = story.description;
    storyInfoCard.style.display = 'block';
}

// Hide story information
function hideStoryInfo() {
    const storyInfoCard = document.getElementById('selected-story-info');
    storyInfoCard.style.display = 'none';
}

// Show test cases section
function showTestCasesSection() {
    const testCasesSection = document.getElementById('testcases-section');
    testCasesSection.style.display = 'block';
}

// Hide test cases section
function hideTestCasesSection() {
    const testCasesSection = document.getElementById('testcases-section');
    testCasesSection.style.display = 'none';
    resetSelections();
}

// Show loading state for story
function showLoadingForStory() {
    const testCasesList = document.getElementById('story-testcases-list');
    testCasesList.innerHTML = '<div class="loading"><div class="spinner"></div>Loading test cases for story...</div>';
}

// Render test cases for the selected story
function renderTestCasesForStory(testCases) {
    const testCasesList = document.getElementById('story-testcases-list');
    
    if (testCases.length === 0) {
        testCasesList.innerHTML = '<div style="text-align: center; padding: 40px; color: #718096;">No test cases found for this story. Generate test cases first!</div>';
        return;
    }
    
    let html = '';
    testCases.forEach(tc => {
        const isSelected = selectedTestCaseIds.has(tc.testCaseId);
        const selectedClass = isSelected ? 'selected' : '';
        
        html += `
            <div class="selectable-testcase-card ${selectedClass}">
                <div class="testcase-selection">
                    <input type="checkbox" 
                           class="testcase-checkbox" 
                           id="tc-${tc.testCaseId}"
                           ${isSelected ? 'checked' : ''}
                           onchange="toggleTestCaseSelection('${tc.testCaseId}')"
                           title="Select for Zephyr submission">
                    
                    <div class="testcase-details">
                        <div class="testcase-header">
                            <div class="testcase-id">${tc.testCaseId}</div>
                            <div class="testcase-actions">
                                <button onclick="editTestCase('${tc.testCaseId}')" class="btn btn-primary btn-sm">
                                    ✏️ Edit
                                </button>
                                <button onclick="viewTestCaseDetails('${tc.testCaseId}')" class="btn btn-secondary btn-sm">
                                    👁️ View
                                </button>
                            </div>
                        </div>
                        
                        <div class="testcase-title">${tc.title}</div>
                        
                        <div class="testcase-summary">
                            <strong>Category:</strong> ${tc.category} | 
                            <strong>Priority:</strong> ${tc.priority} | 
                            <strong>Steps:</strong> ${tc.steps ? tc.steps.length : 0}
                        </div>
                        
                        ${tc.description ? `<div class="testcase-summary" style="margin-top: 8px;"><strong>Description:</strong> ${tc.description.substring(0, 100)}${tc.description.length > 100 ? '...' : ''}</div>` : ''}
                    </div>
                </div>
            </div>
        `;
    });
    
    testCasesList.innerHTML = html;
}

// Toggle test case selection
function toggleTestCaseSelection(testCaseId) {
    const checkbox = document.getElementById(`tc-${testCaseId}`);
    const card = checkbox.closest('.selectable-testcase-card');
    
    if (checkbox.checked) {
        selectedTestCaseIds.add(testCaseId);
        card.classList.add('selected');
    } else {
        selectedTestCaseIds.delete(testCaseId);
        card.classList.remove('selected');
    }
    
    updateSelectionSummary();
    updateSendToZephyrButton();
}

// Toggle select all test cases
function toggleSelectAll() {
    const selectAllBtn = document.getElementById('select-all-btn');
    const allSelected = selectedTestCaseIds.size === storyTestCases.length;
    
    if (allSelected) {
        // Deselect all
        selectedTestCaseIds.clear();
        selectAllBtn.textContent = '✅ Select All';
        
        // Update all checkboxes and cards
        storyTestCases.forEach(tc => {
            const checkbox = document.getElementById(`tc-${tc.testCaseId}`);
            const card = checkbox.closest('.selectable-testcase-card');
            checkbox.checked = false;
            card.classList.remove('selected');
        });
    } else {
        // Select all
        storyTestCases.forEach(tc => {
            selectedTestCaseIds.add(tc.testCaseId);
            const checkbox = document.getElementById(`tc-${tc.testCaseId}`);
            const card = checkbox.closest('.selectable-testcase-card');
            checkbox.checked = true;
            card.classList.add('selected');
        });
        selectAllBtn.textContent = '❌ Deselect All';
    }
    
    updateSelectionSummary();
    updateSendToZephyrButton();
}

// Update selection summary
function updateSelectionSummary() {
    const selectionCount = document.getElementById('selection-count');
    const selectedCount = selectedTestCaseIds.size;
    const totalCount = storyTestCases.length;
    
    selectionCount.textContent = `${selectedCount} of ${totalCount} test cases selected`;
    
    // Update select all button text
    const selectAllBtn = document.getElementById('select-all-btn');
    if (selectedCount === totalCount && totalCount > 0) {
        selectAllBtn.textContent = '❌ Deselect All';
    } else {
        selectAllBtn.textContent = '✅ Select All';
    }
}

// Update send to Zephyr button state
function updateSendToZephyrButton() {
    const sendBtn = document.getElementById('send-to-zephyr-btn');
    sendBtn.disabled = selectedTestCaseIds.size === 0;
}

// Reset all selections
function resetSelections() {
    selectedTestCaseIds.clear();
    updateSelectionSummary();
    updateSendToZephyrButton();
}

// Edit test case
function editTestCase(testCaseId) {
    const testCase = storyTestCases.find(tc => tc.testCaseId === testCaseId);
    if (!testCase) {
        showAlert('Test case not found', 'error');
        return;
    }
    
    // Populate edit form
    document.getElementById('edit-test-case-id').value = testCase.testCaseId;
    document.getElementById('edit-test-case-display-id').value = testCase.testCaseId;
    document.getElementById('edit-test-case-title').value = testCase.title;
    document.getElementById('edit-test-case-description').value = testCase.description || '';
    document.getElementById('edit-expected-outcome').value = testCase.expectedOutcome || '';
    
    // Set dialog title
    document.getElementById('editDialogTitle').textContent = `Edit Test Case - ${testCase.testCaseId}`;
    
    // Populate test steps
    populateTestSteps(testCase.steps || []);
    
    // Show dialog
    document.getElementById('editTestCaseDialog').style.display = 'flex';
}

// Populate test steps in edit form
function populateTestSteps(steps) {
    const container = document.getElementById('edit-test-steps-container');
    container.innerHTML = '';
    
    if (steps.length === 0) {
        addTestStep('');
    } else {
        steps.forEach((step, index) => {
            addTestStep(step);
        });
    }
}

// Add test step input
function addTestStep(stepText = '') {
    const container = document.getElementById('edit-test-steps-container');
    const stepNumber = container.children.length + 1;
    
    const stepDiv = document.createElement('div');
    stepDiv.className = 'test-step-item';
    stepDiv.innerHTML = `
        <div class="step-number">${stepNumber}</div>
        <textarea class="step-input" placeholder="Enter test step..." rows="2">${stepText}</textarea>
        <button type="button" class="step-remove" onclick="removeTestStep(this)" title="Remove step">×</button>
    `;
    
    container.appendChild(stepDiv);
    updateStepNumbers();
}

// Remove test step
function removeTestStep(button) {
    const container = document.getElementById('edit-test-steps-container');
    if (container.children.length > 1) {
        button.closest('.test-step-item').remove();
        updateStepNumbers();
    } else {
        showAlert('At least one test step is required', 'warning');
    }
}

// Update step numbers
function updateStepNumbers() {
    const container = document.getElementById('edit-test-steps-container');
    Array.from(container.children).forEach((stepDiv, index) => {
        const stepNumber = stepDiv.querySelector('.step-number');
        stepNumber.textContent = index + 1;
    });
}

// Save test case changes
async function saveTestCase() {
    const testCaseId = document.getElementById('edit-test-case-id').value;
    const description = document.getElementById('edit-test-case-description').value.trim();
    const expectedOutcome = document.getElementById('edit-expected-outcome').value.trim();
    
    // Collect test steps
    const stepInputs = document.querySelectorAll('#edit-test-steps-container .step-input');
    const steps = Array.from(stepInputs)
        .map(input => input.value.trim())
        .filter(step => step.length > 0);
    
    // Validate required fields
    if (!description) {
        showAlert('Description is required', 'error');
        return;
    }
    
    if (steps.length === 0) {
        showAlert('At least one test step is required', 'error');
        return;
    }
    
    if (!expectedOutcome) {
        showAlert('Expected outcome is required', 'error');
        return;
    }
    
    // Show loading state
    const saveBtn = document.querySelector('#editTestCaseDialog .btn-primary');
    const originalText = saveBtn.textContent;
    saveBtn.disabled = true;
    saveBtn.textContent = '💾 Saving...';
    
    try {
        const response = await fetch(`/api/test-case/${testCaseId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                description,
                steps,
                expectedOutcome
            })
        });
        
        const result = await response.json();
        
        if (result.status === 'success') {
            showAlert('Test case updated successfully!', 'success');
            
            // Update local data
            const testCase = storyTestCases.find(tc => tc.testCaseId === testCaseId);
            if (testCase) {
                testCase.description = description;
                testCase.steps = steps;
                testCase.expectedOutcome = expectedOutcome;
            }
            
            // Re-render test cases
            renderTestCasesForStory(storyTestCases);
            
            // Close dialog
            closeEditDialog();
            
            // Add success animation
            saveBtn.classList.add('save-success');
            setTimeout(() => saveBtn.classList.remove('save-success'), 500);
            
        } else {
            showAlert('Failed to update test case: ' + result.message, 'error');
        }
        
    } catch (error) {
        console.error('Error saving test case:', error);
        showAlert('Failed to save test case: ' + error.message, 'error');
    } finally {
        // Restore button state
        saveBtn.disabled = false;
        saveBtn.textContent = originalText;
    }
}

// Close edit dialog
function closeEditDialog() {
    document.getElementById('editTestCaseDialog').style.display = 'none';
}

// Send selected test cases to Zephyr
async function sendSelectedToZephyr() {
    if (selectedTestCaseIds.size === 0) {
        showAlert('Please select at least one test case to send to Zephyr', 'warning');
        return;
    }
    
    if (!selectedStory) {
        showAlert('No story selected', 'error');
        return;
    }
    
    // Show loading state
    const sendBtn = document.getElementById('send-to-zephyr-btn');
    const originalText = sendBtn.textContent;
    sendBtn.disabled = true;
    sendBtn.textContent = '🔄 Sending to Zephyr...';
    
    try {
        const response = await fetch(`/api/send-to-zephyr-story/${selectedStory.id}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                selectedTestCaseIds: Array.from(selectedTestCaseIds),
                projectId: 'default-project',
                submittedBy: 'user'
            })
        });
        
        const result = await response.json();
        if (result.status === 'success' || (result.status === 'failed' && result.submittedCount > 0)) {
            // Store Zephyr mapping for this session
            if (result.zephyrResults) {
                latestZephyrMapping = {};
                result.zephyrResults.forEach(z => {
                    latestZephyrMapping[z.testCaseId] = { 
                        zephyrId: z.zephyrId, 
                        zephyrKey: z.zephyrKey,
                        status: z.status 
                    };
                });
            }
            
            // Create detailed success message with test case information
            let zephyrMsg = '';
            if (result.zephyrResults && result.zephyrResults.length > 0) {
                const successful = result.zephyrResults.filter(z => z.status === 'created' || z.status === 'updated');
                const failed = result.zephyrResults.filter(z => z.status === 'failed');
                
                if (successful.length > 0) {
                    zephyrMsg += '<div class="zephyr-results"><h5>✅ Successfully Submitted:</h5>';
                    successful.forEach(z => {
                        const testCaseDetails = result.testCasesDetails?.find(tc => tc.testCaseId === z.testCaseId);
                        const stepInfo = testCaseDetails ? ` (${testCaseDetails.testStepsCount} test steps)` : '';
                        zephyrMsg += `<div class="success-item">• ${z.testCaseId}: <strong>${z.zephyrKey || z.zephyrId}</strong> ${stepInfo}</div>`;
                    });
                    zephyrMsg += '</div>';
                }
                
                if (failed.length > 0) {
                    zephyrMsg += '<div class="zephyr-results"><h5>❌ Failed:</h5>';
                    failed.forEach(z => {
                        zephyrMsg += `<div class="error-item">• ${z.testCaseId}: ${z.error || 'Unknown error'}</div>`;
                    });
                    zephyrMsg += '</div>';
                }
            }
            
            // Show test case details information
            if (result.testCasesDetails && result.testCasesDetails.length > 0) {
                zephyrMsg += '<div class="zephyr-details"><h5>📋 Test Case Details:</h5>';
                result.testCasesDetails.forEach(tc => {
                    const formatStatus = tc.hasProperFormat ? '✅' : '⚠️';
                    zephyrMsg += `<div class="detail-item">${formatStatus} ${tc.testCaseId}: "${tc.summary}" (${tc.testStepsCount} steps)</div>`;
                });
                zephyrMsg += '</div>';
            }
            
            // Show mode information
            const modeInfo = result.mode === 'real-zephyr' 
                ? '<div class="mode-info">🔗 <em>Connected to real Zephyr system</em></div>'
                : '<div class="mode-info">🔧 <em>Simulation mode (Zephyr not configured)</em></div>';
            
            const alertMessage = `
                <div class="zephyr-submission-result">
                    <h4>${result.message}</h4>
                    ${modeInfo}
                    ${zephyrMsg}
                </div>
            `;
            
            showAlert(alertMessage, result.status === 'success' ? 'success' : 'warning');
            
            // Reset selections after successful submission
            resetSelections();
            renderTestCasesForReview(storyTestCases);
        } else {
            showAlert('Failed to submit to Zephyr: ' + result.message, 'error');
        }
        
    } catch (error) {
        console.error('Error sending to Zephyr:', error);
        showAlert('Failed to send to Zephyr: ' + error.message, 'error');
    } finally {
        // Restore button state
        sendBtn.disabled = selectedTestCaseIds.size === 0;
        sendBtn.textContent = originalText;
    }
}

// Monitoring Tab Functions
async function loadMonitoringTab() {
    console.log('Loading monitoring tab...');
    // Monitoring data is static in HTML, but we can add dynamic updates here
    updateSystemLogs();
}

function updateSystemLogs() {
    const logsContainer = document.getElementById('system-logs');
    if (logsContainer) {
        const now = new Date();
        const timeStr = now.toLocaleTimeString();
        
        // Add current status log
        const statusLog = document.createElement('div');
        statusLog.className = 'log-entry';
        statusLog.innerHTML = `
            <span class="log-time">${timeStr}</span>
            <span class="log-level info">INFO</span>
            <span class="log-message">System status check completed</span>
        `;
        logsContainer.insertBefore(statusLog, logsContainer.firstChild);
        
        // Keep only last 10 logs
        while (logsContainer.children.length > 10) {
            logsContainer.removeChild(logsContainer.lastChild);
        }
    }
}

// Generate AI Test Cases Function
async function generateAITestCases() {
    try {
        showAlert('Generating AI test cases...', 'info');
        
        // Call the existing API endpoint
        const response = await fetch('/api/generate-test-cases', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                storyId: 'AUTO-' + Date.now(),
                summary: 'AI Generated Test Cases',
                description: 'Automatically generated test cases using AI'
            })
        });
        
        if (response.ok) {
            const result = await response.json();
            showAlert('AI test cases generated successfully!', 'success');
            loadTestCasesTab(); // Refresh the test cases list
        } else {
            throw new Error('Failed to generate test cases');
        }
    } catch (error) {
        console.error('Error generating AI test cases:', error);
        showAlert('Failed to generate AI test cases: ' + error.message, 'error');
    }
}
