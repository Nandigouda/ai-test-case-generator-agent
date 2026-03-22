![Node.js](https://img.shields.io/badge/Node.js-Backend-green)
![AI](https://img.shields.io/badge/AI-GPT--4-blue)
![Jira](https://img.shields.io/badge/Jira-Integration-orange)

# 🤖 AI Test Case Generator Agent

🚀 AI-powered platform that automatically generates test cases from Jira user stories using GPT-4, with vector-based duplicate detection and real-time Jira integration.

## 🔥 Highlights
- 🤖 GPT-4 powered intelligent test case generation  
- 🔍 Vector-based duplicate detection (cosine similarity)  
- 🔗 Real-time Jira integration via webhooks  
- 📊 Monitoring dashboard with live analytics  
- ⚡ Microservices-based scalable architecture  
## 🎯 Overview

This platform revolutionizes test case creation by:
- **Automatically generating test cases** from user stories using Azure OpenAI GPT-4 Turbo
- **Detecting duplicates** with 5-step validation and vector similarity matching
- **Creating real test cases in Jira** with proper tracking IDs and issue management
- **Providing real-time monitoring** through an intuitive web dashboard
- **Supporting public webhooks** via ngrok for seamless Jira integration

## 🔄 **Current Status (October 2025)**
- ✅ **All servers operational** (API: 3000, Webhook: 3005, Dashboard: 3006)
- ✅ **Azure OpenAI GPT-4 Turbo integration** with intelligent story analysis
- ✅ **Real-time Jira webhook processing** with ngrok public access
- ✅ **Advanced duplicate detection** using vector embeddings
- ✅ **Comprehensive monitoring dashboard** with live statistics
- ✅ **Robust error handling** with simulation mode for development
- 🔧 **Active Development:** Continuous improvements to AI intelligence and Jira integration

## ✨ Key Features

### 🧠 **Intelligent AI Generation**
- **Azure OpenAI GPT-4 Turbo** powered test case creation
- **Jira Cloud Agent-like intelligence** with context-aware analysis
- **Story complexity detection** (Simple/Medium/Complex) with adaptive test case count
- **Content-driven generation** - only tests functionality explicitly described
- **Smart fallback system** with rule-based backup generation

### 🔍 **Advanced Duplicate Detection**
- **5-step validation process** (ID, exact match, high similarity, moderate similarity, low similarity)
- **Vector embedding similarity search** with configurable thresholds
- **Content-based duplicate prevention** with detailed explanations
- **Smart UPDATE vs REUSE decision making** based on content changes
- **Real-time vector storage** with automatic synchronization

### 🔗 **Seamless Jira Integration**
- **Direct test case creation** in Jira with real issue IDs (e.g., DEC-25, DEC-22)
- **Real-time webhook processing** for automatic story updates
- **Project-specific management** with proper authentication
- **Comprehensive error handling** and failed test case cleanup
- **Simulation mode** for development and testing

### 📊 **Comprehensive Monitoring**
- **Real-time dashboard** with live statistics and activity monitoring
- **Multi-tab interface** (Dashboard, Stories, Test Cases, Review)
- **Vector database insights** with similarity distributions
- **Performance metrics** and system health monitoring
- **Activity logging** with configurable verbosity levels

### 🌐 **Public Webhook Support**
- **Ngrok integration** for public webhook exposure
- **Secure webhook endpoints** with query parameter support
- **Real-time Jira webhook processing** for instant test case generation
- **Multi-environment support** (development, staging, production)

## 🏗️ Architecture

### **Microservices Design**
```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   API Server    │    │  Webhook Server  │    │ Dashboard Server│
│   Port 3000     │    │   Port 3005      │    │   Port 3006     │
│                 │    │                  │    │                 │
│ • Test Gen API  │    │ • Jira Webhooks  │    │ • UI Interface  │
│ • Auto Creation │    │ • Story Updates  │    │ • Monitoring    │
│ • Duplicate Det │    │ • Real-time Sync │    │ • Statistics    │
└─────────────────┘    └──────────────────┘    └─────────────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 │
                    ┌─────────────────────┐
                    │   Shared Services   │
                    │                     │
                    │ • Vector Storage    │
                    │ • LLM Service       │
                    │ • Decision Engine   │
                    │ • Jira Service      │
                    │ • Embedding Service │
                    └─────────────────────┘
```
## 🧠 How It Works

1. Jira story is created/updated  
2. Webhook triggers the system  
3. AI (GPT-4) analyzes story and generates test cases  
4. Vector embeddings are created for each test case  
5. Duplicate detection engine compares with existing cases  
6. Final test cases are pushed to Jira  
7. Dashboard updates in real-time  

## 🚀 Quick Start

### **Prerequisites**
- **Node.js** (v14 or higher)
- **Azure OpenAI** account with GPT-4 Turbo deployment
- **Jira Cloud** account with API access and admin permissions
- **Ngrok** account (optional, for public webhook access)
- **Windows** environment (PowerShell scripts optimized for Windows)

### **Installation**

1. **Clone and Install**
   ```bash
   git clone <repository-url>
   cd hackathon-selfproject
   npm install
   ```

2. **Environment Setup**
   ```bash
   # Copy and configure environment file
   cp config/.env.example config/.env
   ```

3. **Configure Environment Variables**
   ```env
   # Azure OpenAI Configuration
   AZURE_OPENAI_API_KEY=your_azure_openai_api_key
   AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com
   AZURE_OPENAI_DEPLOYMENT=gpt4-turbo
   AZURE_OPENAI_EMBEDDINGS_DEPLOYMENT=embedding-ada
   
   # Jira Configuration
   JIRA_BASE_URL=https://your-domain.atlassian.net/
   JIRA_EMAIL=your-email@domain.com
   JIRA_API_TOKEN=your_jira_api_token
   JIRA_PROJECT_KEY=DEC
   
   # Server Ports
   WEBHOOK_PORT=3005
   
   # Ngrok Configuration (for public webhook access)
   NGROK_AUTHTOKEN=your_ngrok_authtoken
   ```

### **Running the Platform**

#### **Option 1: Start All Services (Recommended)**
```bash
npm start
```

#### **Option 2: Start Individual Services**
```bash
# API Server
node src/servers/server.js

# Webhook Server  
node src/services/webhookReceiver.js

# Dashboard Server
node dashboard/server.js
```

#### **Option 3: Using PowerShell Scripts (Windows)**
```bash
# Start all servers using concurrently
npm start

# Or use PowerShell script
.\start-servers.ps1
```

### **Access Points**
- **Dashboard:** http://localhost:3006
- **API Server:** http://localhost:3000
- **Webhook Server:** http://localhost:3005

### **Public Webhook Access**
- **Ngrok Tunnel:** Use ngrok to expose webhook server publicly
- **Setup:** `ngrok http 3005`
- **Jira Webhook URL:** `https://your-ngrok-url.ngrok-free.app/jira-webhook`

## 📋 API Reference

### **Main Test Generation Endpoint**
```http
POST /auto-testcase
Content-Type: application/json

{
  "summary": "User Login Authentication",
  "description": "As a user, I want to login with credentials...",
  "story_id": "PROJ-123",
  "project_id": "PROJ",
  "version": "1.0"
}
```

### **Response Format**
```json
{
  "status": "success",
  "action": "NEW|UPDATE|REUSE",
  "storyId": "PROJ-123",
  "testCasesGenerated": 3,
  "jiraTestCases": [
    {
      "jiraId": "DEC-25",
      "summary": "Valid Login Test",
      "priority": "High"
    }
  ],
  "duplicateDetails": {
    "type": "NONE|EXACT|HIGH|MODERATE|LOW",
    "confidence": 0.95,
    "explanation": "Detailed reasoning..."
  }
}
```

### **Webhook Endpoints**
```http
# Jira Webhook with Query Parameters
POST /jira-webhook?issueKey={issue.key}&projectKey={project.key}&user={user.accountId}
Content-Type: application/json

# Standard Jira Webhook Format
POST /jira-webhook
Content-Type: application/json
```

### **Additional Endpoints**
- `GET /health` - Health check for all services
- `GET /vector-stats` - Vector database statistics and insights
- `GET /test-case/:id` - Get specific test case details
- `POST /clear-vectors` - Clear vector database (development only)
- `GET /jira-webhook/health` - Webhook service health check
- `POST /jira-webhook/test` - Test webhook endpoint for validation

## 🔧 Configuration

### **Duplicate Detection Thresholds**
```javascript
// Configurable in decisionEngine.js
EXACT_MATCH_THRESHOLD: 0.98
HIGH_SIMILARITY_THRESHOLD: 0.85  
MODERATE_SIMILARITY_THRESHOLD: 0.70
LOW_SIMILARITY_THRESHOLD: 0.50
```

### **Vector Storage Settings**
- **Embedding Model:** Azure OpenAI text-embedding-ada-002
- **Vector Dimensions:** 1536
- **Storage:** Local JSON file (`data/vector_table.json`) with real-time sync
- **Search Algorithm:** Cosine similarity with configurable thresholds
- **Backup:** Automatic synchronization between test case arrays and vector storage

## 📊 Monitoring & Analytics

### **Dashboard Features**
- **Real-time Statistics:** Generated test cases, duplicate prevention stats
- **Activity Logs:** Recent generations and system events
- **Vector Insights:** Database size, similarity distributions
- **System Health:** Service status and performance metrics

### **Logging Levels**
- `ESSENTIAL` - Critical system events
- `INFO` - General operational information
- `DEBUG` - Detailed debugging information
- `ERROR` - Error conditions and failures

## 🧪 Testing

### **Postman Collection**
Import the collection from `tests/postman/AI_Test_Generation_Updated_Collection.json` for comprehensive API testing.

### **Test Scenarios Included**
- New story processing
- Duplicate detection validation
- Webhook simulation
- Error handling verification

## 📁 Project Structure

```
hackathon-selfproject/
├── 📁 config/                 # Configuration files
│   ├── .env                   # Environment variables
│   └── logger.js              # Logging configuration
├── 📁 src/
│   ├── 📁 api/                # API route handlers
│   │   ├── storyRoutes.js     # Main test generation endpoints
│   │   └── webhookRoutes.js   # Webhook processing routes
│   ├── 📁 servers/            # Server entry points
│   │   └── server.js          # Main API server
│   ├── 📁 services/           # Core business logic
│   │   ├── decisionEngine.js  # Duplicate detection logic
│   │   ├── embeddingService.js# Text embedding generation
│   │   ├── jiraService.js     # Jira API integration
│   │   ├── llmService.js      # AI test case generation
│   │   ├── vectorStorage.js   # Vector database management
│   │   ├── vectorSearch.js    # Similarity search algorithms
│   │   ├── webhookReceiver.js # Webhook processing service
│   │   └── zephyrService.js   # Zephyr integration (optional)
│   └── 📁 utils/              # Utility functions
│       └── stringUtils.js     # String processing utilities
├── 📁 dashboard/              # Web dashboard
│   ├── server.js              # Dashboard server
│   └── 📁 public/             # Static web assets
├── 📁 data/                   # Data storage
│   └── vector_table.json      # Vector database
├── 📁 tests/                  # Testing resources
│   └── 📁 postman/            # API test collections
├── package.json               # Project dependencies
├── start-all-servers.bat      # Windows startup script
└── start-servers.ps1          # PowerShell startup script
```

## 🤝 Contributing

### **Development Workflow**
1. Start development servers: `npm start`
2. Make changes to source code
3. Test using Postman collection
4. Verify in dashboard UI

### **Code Style**
- Use ES6+ JavaScript features
- Follow modular architecture patterns
- Include comprehensive error handling
- Add logging for debugging

## 📝 License

This project is for hackathon/educational purposes.

## 🆘 Support

### **Common Issues**

**Server won't start:**
- Check if ports 3000, 3005, 3006 are available using `netstat -ano | findstr ":PORT"`
- Verify environment variables are set correctly in `config/.env`
- Ensure Azure OpenAI and Jira credentials are valid

**502 Bad Gateway (Ngrok):**
- Ensure webhook server is running on port 3005
- Restart webhook server: `node src/services/webhookReceiver.js`
- Check ngrok tunnel status at `http://127.0.0.1:4040`

**No test cases generated:**
- Verify Azure OpenAI API key is valid and deployment exists
- Check Azure OpenAI endpoint URL format
- Review server logs for specific error messages
- Test with minimal story content first

**Jira 401 Authentication Errors:**
- Generate new Jira API token at https://id.atlassian.com/manage-profile/security/api-tokens
- Validate JIRA_PROJECT_KEY matches your project (e.g., "DEC", not "10036")
- Ensure Jira base URL ends with trailing slash
- Check if user has "Create Issues" permission in target project

**Webhook not receiving data:**
- Verify ngrok tunnel is active and public URL is correct
- Check Jira webhook configuration uses correct URL format
- Ensure webhook server is running on port 3005
- Test webhook with `/jira-webhook/test` endpoint

### **Logs Location**
- **API Server:** Console output from `node src/servers/server.js`
- **Webhook Server:** Console output from `node src/services/webhookReceiver.js`  
- **Dashboard:** Console output from `node dashboard/server.js`
- **Ngrok Logs:** Available at `http://127.0.0.1:4040` web interface

### **Debugging Commands**
```bash
# Check server status
netstat -ano | findstr ":3000 :3005 :3006"

# Test Jira connection
curl -u "email:api_token" https://your-domain.atlassian.net/rest/api/3/myself

# Test webhook endpoint
curl -X POST http://localhost:3005/jira-webhook/test

# View ngrok tunnels
curl http://127.0.0.1:4040/api/tunnels
```

---

**Built with AI for intelligent test automation**
