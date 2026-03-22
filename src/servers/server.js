// server.js
// Main API server using the new modular architecture
require('dotenv').config({ path: './config/.env' });
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');

// Import route modules
const storyRoutes = require('../api/storyRoutes');
const webhookRoutes = require('../api/webhookRoutes');
const logger = require('../../config/logger');

// Initialize services to ensure they're ready
const { VectorStorage } = require('../services/vectorStorage');
const { EmbeddingService } = require('../services/embeddingService');

const app = express();
const PORT = process.env.STORY_API_PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true }));

// Request logging middleware
app.use((req, res, next) => {
  logger.debug(`${req.method} ${req.path} - ${req.ip}`);
  next();
});

// Mount routes
app.use('/', storyRoutes);
app.use('/', webhookRoutes);

// Global error handler
app.use((error, req, res, next) => {
  logger.error(`Global error handler: ${error.message}`);
  res.status(500).json({
    error: 'Internal server error',
    message: error.message,
    timestamp: new Date().toISOString()
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Endpoint not found',
    message: `${req.method} ${req.originalUrl} is not a valid endpoint`,
    availableEndpoints: [
      'POST /auto-testcase - Generate test cases',
      'POST /webhook - Process Jira webhooks',
      'POST /simulate-webhook - Simulate webhook for testing',
      'GET /health - Health check',
      'GET /vector-stats - Vector database statistics',
      'GET /test-case/:id - Get test case details',
      'POST /clear-vectors - Clear vector database'
    ],
    timestamp: new Date().toISOString()
  });
});

// Initialize and start server
async function startServer() {
  try {
    // Initialize vector storage
    const vectorStorage = new VectorStorage();
    await vectorStorage.initialize();
    logger.essential('✅ Vector storage initialized');

    // Test embedding service
    const embeddingService = new EmbeddingService();
    const embeddingHealthy = await embeddingService.healthCheck();
    if (embeddingHealthy) {
      logger.essential('✅ Embedding service ready');
    } else {
      logger.essential('⚠️ Embedding service has issues but server will continue');
    }

    // Start server
    app.listen(PORT, () => {
      logger.essential(`🚀 Modular API Server running on http://localhost:${PORT}`);
      logger.essential('📋 Available endpoints:');
      logger.essential('   • POST /auto-testcase - Manual test case generation');
      logger.essential('   • POST /webhook - Jira webhook processing');
      logger.essential('   • POST /simulate-webhook - Webhook simulation for testing');
      logger.essential('   • GET /health - Health check');
      logger.essential('   • GET /vector-stats - Vector database statistics');
      logger.essential('   • GET /test-case/:id - Get test case details');
      logger.essential('   • POST /clear-vectors - Clear vector database');
      logger.essential('');
      logger.essential('🎯 Ready for:');
      logger.essential('   • Manual API calls (Postman, Dashboard)');
      logger.essential('   • Jira webhook integration');
      logger.essential('   • AI-powered test case generation');
      logger.essential('   • Vector similarity search');
      logger.essential('');
      logger.essential('📊 Dashboard available at: http://localhost:3006');
      logger.essential('🔗 Webhook server will start on: http://localhost:3001');
    });

  } catch (error) {
    logger.error('Failed to start server:', error.message);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGINT', () => {
  logger.essential('📴 Shutting down server gracefully...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.essential('📴 Server terminated');
  process.exit(0);
});

// Start the server
startServer();

module.exports = app;
