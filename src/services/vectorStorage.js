// vectorStorage.js
// Vector storage operations extracted from table_vector_db.js
const fs = require('fs').promises;
const path = require('path');
const logger = require('../../config/logger');
const { EmbeddingService } = require('./embeddingService');
const { SearchIndexClient, SearchClient, AzureKeyCredential } = require('@azure/search-documents');

class VectorStorage {
  constructor() {
    this.dbPath = path.join(__dirname, '..', '..', 'data', 'vector_table.json');
    this.embeddingService = new EmbeddingService();
    this.isInitialized = false;
    this.table = this._initializeEmptyTable();
    
    // Azure AI Search configuration
    this.azureSearchEnabled = process.env.AZURE_SEARCH_ENDPOINT && 
                              process.env.AZURE_SEARCH_KEY &&
                              process.env.AZURE_SEARCH_INDEX;
    
    if (this.azureSearchEnabled) {
      try {
        this.searchClient = new SearchClient(
          process.env.AZURE_SEARCH_ENDPOINT,
          process.env.AZURE_SEARCH_INDEX,
          new AzureKeyCredential(process.env.AZURE_SEARCH_KEY)
        );
        
        this.indexClient = new SearchIndexClient(
          process.env.AZURE_SEARCH_ENDPOINT,
          new AzureKeyCredential(process.env.AZURE_SEARCH_KEY)
        );
        
        logger.info('🔍 Azure AI Search initialized successfully');
      } catch (error) {
        logger.warn('⚠️ Failed to initialize Azure AI Search, falling back to local storage:', error.message);
        this.azureSearchEnabled = false;
      }
    } else {
      logger.info('📁 Azure AI Search not configured, using local vector storage');
    }
  }

  /**
   * Initialize Azure AI Search index
   */
  async initializeAzureIndex() {
    if (!this.azureSearchEnabled) return;
    
    try {
      const indexName = process.env.AZURE_SEARCH_INDEX_NAME;
      
      // Check if index exists
      try {
        await this.indexClient.getIndex(indexName);
        logger.info(`🔍 Azure Search index '${indexName}' already exists`);
        return;
      } catch (error) {
        if (error.statusCode !== 404) throw error;
      }

      // Create index schema
      const indexDefinition = {
        name: indexName,
        fields: [
          {
            name: "id",
            type: "Edm.String",
            key: true,
            searchable: false,
            filterable: true,
            retrievable: true
          },
          {
            name: "storyId",
            type: "Edm.String",
            searchable: true,
            filterable: true,
            retrievable: true
          },
          {
            name: "summary",
            type: "Edm.String",
            searchable: true,
            retrievable: true
          },
          {
            name: "description",
            type: "Edm.String",
            searchable: true,
            retrievable: true
          },
          {
            name: "fullText",
            type: "Edm.String",
            searchable: true,
            retrievable: true
          },
          {
            name: "vector",
            type: "Collection(Edm.Single)",
            searchable: true,
            retrievable: true,
            dimensions: 1536,
            vectorSearchProfile: "default-vector-profile"
          },
          {
            name: "timestamp",
            type: "Edm.DateTimeOffset",
            filterable: true,
            sortable: true,
            retrievable: true
          }
        ],
        vectorSearch: {
          profiles: [
            {
              name: "default-vector-profile",
              algorithm: "default-vector-algorithm"
            }
          ],
          algorithms: [
            {
              name: "default-vector-algorithm",
              kind: "hnsw",
              hnswParameters: {
                metric: "cosine",
                m: 4,
                efConstruction: 400,
                efSearch: 500
              }
            }
          ]
        }
      };

      await this.indexClient.createIndex(indexDefinition);
      logger.info(`✅ Created Azure Search index '${indexName}' successfully`);
    } catch (error) {
      logger.error(`Failed to initialize Azure Search index: ${error.message}`);
      this.azureSearchEnabled = false;
    }
  }

  /**
   * Initialize vector storage
   */
  async initialize() {
    try {
      // Initialize Azure AI Search if enabled
      if (this.azureSearchEnabled) {
        await this._initializeAzureIndex();
      }
      
      try {
        const data = await fs.readFile(this.dbPath, 'utf8');
        this.table = JSON.parse(data);
        logger.debug(`📊 Loaded table with ${this.table.storyIds.length} records`);
        
        // Ensure table structure
        this._ensureTableStructure();
      } catch (error) {
        // Create new empty table
        this.table = this._initializeEmptyTable();
        await this._saveToFile();
        logger.debug('📊 Created new vector table database');
      }
      
      this._rebuildSearchIndexes();
      this.isInitialized = true;
      return true;
    } catch (error) {
      logger.error(`Failed to initialize vector storage: ${error.message}`);
      return false;
    }
  }

  /**
   * Add new record to vector storage
   */
  async addRecord(storyId, summary, description, options = {}) {
    try {
      // Validate required fields
      if (!storyId || !summary || !description) {
        throw new Error('Missing required fields: storyId, summary, and description are mandatory');
      }

      logger.info(`💾 Adding record to vector storage: ${storyId}`);

      // Generate embedding
      const fullText = `${summary}\n${description}`;
      const embedding = await this.embeddingService.generateEmbedding(fullText);
      
      // Add to all arrays
      this.table.storyIds.push(storyId);
      this.table.summaries.push(summary);
      this.table.descriptions.push(description);
      this.table.embeddings.push(embedding);
      
      // Add metadata
      this.table.timestamps.push(new Date().toISOString());
      this.table.textLengths.push(fullText.length);
      this.table.versions.push(options.version || '1.0');
      this.table.projectIds.push(options.projectId || 'default-project');
      this.table.lastUpdated.push(new Date().toISOString());
      
      // Add Jira/Zephyr data
      this.table.jiraIssueKeys.push(options.jiraIssueKey || null);
      this.table.jiraProjectKeys.push(options.jiraProjectKey || 'PROJ');
      this.table.zephyrTestIds.push(options.zephyrTestIds || []);
      this.table.jiraSearchResults.push(options.jiraSearchResults || []);
      
      // Add test case data
      this.table.testCaseIds.push(options.testCaseIds || []);
      this.table.testCaseStatuses.push(options.testCaseStatuses || []);
      this.table.testCaseDetails.push(options.testCaseDetails || []);
      
      // NEW: Add Jira test case mappings
      this.table.jiraTestCases.push(options.jiraTestCases || []);
      this.table.creationMethods.push(options.createdVia || 'unknown');
      
      // Update search indexes
      const index = this.table.storyIds.length - 1;
      this.table.searchIndex[storyId] = index;
      this.table.summaryIndex[summary.toLowerCase().trim()] = index;
      
      // Save to local file
      await this._saveToFile();
      
      // Store in Azure AI Search if enabled
      if (this.azureSearchEnabled) {
        await this._storeInAzureSearch(
          storyId,
          summary,
          description,
          options.testCaseDetails || [],
          embedding
        );
      }
      
      logger.info(`✅ Record added successfully: ${storyId}`);
      return true;
      
    } catch (error) {
      logger.error(`Failed to add record: ${error.message}`);
      throw error;
    }
  }

  /**
   * Update existing record
   */
  async updateRecord(storyId, summary, description, options = {}) {
    try {
      const index = this.table.searchIndex[storyId];
      if (index === undefined) {
        throw new Error(`Record not found for story ID: ${storyId}`);
      }

      logger.info(`🔄 Updating record: ${storyId}`);

      // Generate new embedding if content changed
      const fullText = `${summary}\n${description}`;
      const newEmbedding = await this.embeddingService.generateEmbedding(fullText);
      
      // Update arrays
      this.table.summaries[index] = summary;
      this.table.descriptions[index] = description;
      this.table.embeddings[index] = newEmbedding;
      this.table.textLengths[index] = fullText.length;
      this.table.lastUpdated[index] = new Date().toISOString();
      
      // Update optional fields
      if (options.version) this.table.versions[index] = options.version;
      if (options.projectId) this.table.projectIds[index] = options.projectId;
      if (options.testCaseIds) this.table.testCaseIds[index] = options.testCaseIds;
      if (options.testCaseDetails) this.table.testCaseDetails[index] = options.testCaseDetails;
      
      // NEW: Update Jira test case mappings
      if (options.jiraTestCases) this.table.jiraTestCases[index] = options.jiraTestCases;
      if (options.createdVia) this.table.creationMethods[index] = options.createdVia;
      
      // Update summary index
      this.table.summaryIndex[summary.toLowerCase().trim()] = index;
      
      // Save to file
      await this._saveToFile();
      
      // Update in Azure AI Search if enabled
      if (this.azureSearchEnabled) {
        await this._updateInAzureSearch(
          storyId,
          summary,
          description,
          options.testCaseDetails || [],
          newEmbedding
        );
      }
      
      logger.info(`✅ Record updated successfully: ${storyId}`);
      return true;
      
    } catch (error) {
      logger.error(`Failed to update record: ${error.message}`);
      throw error;
    }
  }

  /**
   * Delete record
   */
  async deleteRecord(storyId) {
    try {
      const index = this.table.searchIndex[storyId];
      if (index === undefined) {
        throw new Error(`Record not found for story ID: ${storyId}`);
      }

      logger.info(`🗑️ Deleting record: ${storyId}`);

      // Remove from all arrays
      Object.keys(this.table).forEach(key => {
        if (Array.isArray(this.table[key]) && key !== 'searchIndex' && key !== 'summaryIndex') {
          this.table[key].splice(index, 1);
        }
      });
      
      // Rebuild indexes
      this._rebuildSearchIndexes();
      
      // Save to file
      await this._saveToFile();
      
      // Delete from Azure AI Search if enabled
      if (this.azureSearchEnabled) {
        await this._deleteFromAzureSearch(storyId);
      }
      
      logger.info(`✅ Record deleted successfully: ${storyId}`);
      return true;
      
    } catch (error) {
      logger.error(`Failed to delete record: ${error.message}`);
      throw error;
    }
  }

  /**
   * Clear all records
   */
  async clearAllRecords() {
    try {
      logger.info('🗑️ Clearing all vector storage records...');
      
      this.table = this._initializeEmptyTable();
      await this._saveToFile();
      
      logger.info('✅ All records cleared successfully');
      return true;
      
    } catch (error) {
      logger.error(`Failed to clear records: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get current table data
   */
  getTable() {
    return this.table;
  }

  /**
   * Get table statistics
   */
  getTableStats() {
    return {
      totalRecords: this.table.storyIds.length,
      totalTestCases: this._countTotalTestCases(),
      averageTextLength: this.table.textLengths.length > 0 ? 
        Math.round(this.table.textLengths.reduce((sum, len) => sum + len, 0) / this.table.textLengths.length) : 0,
      lastUpdated: this.table.lastUpdated.length > 0 ? 
        Math.max(...this.table.lastUpdated.map(d => new Date(d).getTime())) : null,
      embeddingDimensions: this.table.embeddings.length > 0 && this.table.embeddings[0] ? 
        this.table.embeddings[0].length : 0
    };
  }

  /**
   * Initialize empty table structure
   * @private
   */
  _initializeEmptyTable() {
    return {
      storyIds: [], summaries: [], descriptions: [], embeddings: [],
      jiraIssueKeys: [], jiraProjectKeys: [], zephyrTestIds: [], jiraSearchResults: [],
      timestamps: [], textLengths: [], versions: [], projectIds: [], lastUpdated: [],
      testCaseIds: [], testCaseStatuses: [], testCaseDetails: [],
      // NEW: Store real Jira test case mappings
      jiraTestCases: [], // Array of arrays containing Jira test case mappings
      creationMethods: [], // Array tracking how test cases were created (manual/webhook)
      searchIndex: {}, summaryIndex: {},
      // Global test case counter for unique IDs across all stories
      globalTestCaseCounter: 0,
      metadata: {
        lastTestCaseId: 0,
        totalTestCasesCreated: 0,
        createdAt: new Date().toISOString(),
        lastUpdated: new Date().toISOString()
      }
    };
  }

  /**
   * Ensure table has all required arrays and initialize counter
   * @private
   */
  _ensureTableStructure() {
    const requiredArrays = [
      'storyIds', 'summaries', 'descriptions', 'embeddings',
      'jiraIssueKeys', 'jiraProjectKeys', 'zephyrTestIds', 'jiraSearchResults',
      'timestamps', 'textLengths', 'versions', 'projectIds', 'lastUpdated',
      'testCaseIds', 'testCaseStatuses', 'testCaseDetails',
      'jiraTestCases', 'creationMethods' // NEW: Added Jira mapping fields
    ];
    
    requiredArrays.forEach(arrayName => {
      if (!this.table[arrayName]) {
        this.table[arrayName] = [];
      }
    });
    
    // Initialize global counter and metadata if missing
    if (typeof this.table.globalTestCaseCounter === 'undefined') {
      this.table.globalTestCaseCounter = this._calculateCurrentMaxTestCaseId();
      logger.info(`🔢 Initialized global test case counter: ${this.table.globalTestCaseCounter}`);
    }
    
    if (!this.table.metadata) {
      this.table.metadata = {
        lastTestCaseId: this.table.globalTestCaseCounter,
        totalTestCasesCreated: this._countTotalTestCases(),
        createdAt: new Date().toISOString(),
        lastUpdated: new Date().toISOString()
      };
    }
    
    // Ensure all arrays have the same length
    const maxLength = Math.max(
      this.table.storyIds.length,
      this.table.summaries.length,
      this.table.descriptions.length
    );
    
    requiredArrays.forEach(arrayName => {
      while (this.table[arrayName].length < maxLength) {
        if (arrayName === 'testCaseDetails' || arrayName === 'jiraTestCases') {
          this.table[arrayName].push([]); // Array of arrays for test case collections
        } else if (arrayName === 'creationMethods') {
          this.table[arrayName].push('unknown'); // Default creation method
        } else {
          this.table[arrayName].push(null);
        }
      }
    });
    
    if (!this.table.searchIndex) this.table.searchIndex = {};
    if (!this.table.summaryIndex) this.table.summaryIndex = {};
  }

  /**
   * Rebuild search indexes
   * @private
   */
  _rebuildSearchIndexes() {
    this.table.searchIndex = {};
    this.table.summaryIndex = {};
    
    this.table.storyIds.forEach((storyId, index) => {
      this.table.searchIndex[storyId] = index;
      
      const summary = this.table.summaries[index];
      if (summary) {
        const normalizedSummary = summary.toLowerCase().trim();
        this.table.summaryIndex[normalizedSummary] = index;
      }
    });
  }

  /**
   * Store document in Azure AI Search
   * @private
   */
  async _storeInAzureSearch(document) {
    if (!this.azureSearchEnabled) return;
    
    try {
      await this.searchClient.uploadDocuments([document]);
      logger.debug(`📤 Stored document in Azure Search: ${document.storyId}`);
    } catch (error) {
      logger.warn(`Failed to store in Azure Search: ${error.message}`);
      // Don't throw error - local storage already saved
    }
  }

  /**
   * Search similar vectors using Azure AI Search
   * @private
   */
  async _searchAzureVectors(queryEmbedding, limit = 5) {
    if (!this.azureSearchEnabled) return null;
    
    try {
      const searchResults = await this.searchClient.search('*', {
        vectorSearchQueries: [
          {
            kind: 'vector',
            vector: queryEmbedding,
            kNearestNeighborsCount: limit,
            fields: 'vector'
          }
        ],
        select: ['storyId', 'summary', 'description', 'fullText'],
        top: limit
      });

      const results = [];
      for await (const result of searchResults.results) {
        results.push({
          storyId: result.document.storyId,
          summary: result.document.summary,
          description: result.document.description,
          fullText: result.document.fullText,
          score: result.score || 0,
          source: 'azure'
        });
      }

      logger.debug(`🔍 Azure Search returned ${results.length} results`);
      return results;
    } catch (error) {
      logger.warn(`Azure Search query failed: ${error.message}`);
      return null;
    }
  }

  /**
   * Find similar stories using vector embeddings
   */
  async findSimilarStories(queryEmbedding, threshold = 0.7, maxResults = 10) {
    try {
      // Try Azure AI Search first
      if (this.azureSearchEnabled) {
        const azureResults = await this._searchSimilarInAzureSearch(queryEmbedding, threshold, maxResults);
        if (azureResults.length > 0) {
          return azureResults;
        }
      }

      // Fallback to local search
      return await this._searchLocalVectors(queryEmbedding, maxResults, threshold);
    } catch (error) {
      logger.error(`Find similar stories failed: ${error.message}`);
      return [];
    }
  }

  /**
   * Search for similar vectors (hybrid: Azure + local fallback)
   */
  async searchSimilar(query, limit = 5, threshold = 0.7) {
    try {
      // Generate embedding for query
      const queryEmbedding = await this.embeddingService.generateEmbedding(query);
      
      // Try Azure AI Search first
      if (this.azureSearchEnabled) {
        const azureResults = await this._searchAzureVectors(queryEmbedding, limit);
        if (azureResults && azureResults.length > 0) {
          logger.info(`✅ Found ${azureResults.length} similar records via Azure AI Search`);
          return azureResults;
        }
      }
      
      // Fallback to local similarity search
      logger.info('🔄 Falling back to local vector search');
      return await this._searchLocalVectors(queryEmbedding, limit, threshold);
      
    } catch (error) {
      logger.error(`Similarity search failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Local vector similarity search (fallback)
   * @private
   */
  async _searchLocalVectors(queryEmbedding, limit = 5, threshold = 0.7) {
    if (!this.isInitialized || this.table.embeddings.length === 0) {
      return [];
    }

    const similarities = [];
    
    for (let i = 0; i < this.table.embeddings.length; i++) {
      const embedding = this.table.embeddings[i];
      if (!embedding || embedding.length === 0) continue;
      
      const similarity = this._cosineSimilarity(queryEmbedding, embedding);
      
      if (similarity >= threshold) {
        similarities.push({
          storyId: this.table.storyIds[i],
          summary: this.table.summaries[i],
          description: this.table.descriptions[i],
          fullText: `${this.table.summaries[i]}\n${this.table.descriptions[i]}`,
          score: similarity,
          source: 'local'
        });
      }
    }

    // Sort by similarity score (descending) and limit results
    similarities.sort((a, b) => b.score - a.score);
    const results = similarities.slice(0, limit);
    
    logger.info(`✅ Found ${results.length} similar records via local search`);
    return results;
  }

  /**
   * Calculate cosine similarity between two vectors
   * @private
   */
  _cosineSimilarity(vectorA, vectorB) {
    if (vectorA.length !== vectorB.length) {
      throw new Error('Vectors must have the same length');
    }

    let dotProduct = 0;
    let magnitudeA = 0;
    let magnitudeB = 0;

    for (let i = 0; i < vectorA.length; i++) {
      dotProduct += vectorA[i] * vectorB[i];
      magnitudeA += vectorA[i] * vectorA[i];
      magnitudeB += vectorB[i] * vectorB[i];
    }

    magnitudeA = Math.sqrt(magnitudeA);
    magnitudeB = Math.sqrt(magnitudeB);

    if (magnitudeA === 0 || magnitudeB === 0) return 0;
    return dotProduct / (magnitudeA * magnitudeB);
  }

  // ===== Azure AI Search Vector Storage Methods =====

  /**
   * Initialize Azure AI Search index with vector configuration
   * @private
   */
  async _initializeAzureIndex() {
    if (!this.azureSearchEnabled) return false;

    try {
      const indexName = process.env.AZURE_SEARCH_INDEX;
      
      // Define index schema with vector field
      const indexDefinition = {
        name: indexName,
        fields: [
          { name: 'storyId', type: 'Edm.String', key: true, searchable: false, filterable: true },
          { name: 'summary', type: 'Edm.String', searchable: true, filterable: false },
          { name: 'description', type: 'Edm.String', searchable: true, filterable: false },
          { name: 'testCases', type: 'Collection(Edm.ComplexType)', searchable: false, filterable: false,
            fields: [
              { name: 'id', type: 'Edm.String' },
              { name: 'title', type: 'Edm.String' },
              { name: 'steps', type: 'Edm.String' },
              { name: 'expected', type: 'Edm.String' },
              { name: 'lastUpdated', type: 'Edm.String' }
            ]
          },
          { name: 'embedding', type: 'Collection(Edm.Single)', searchable: true, 
            vectorSearchDimensions: 1536, vectorSearchProfileName: 'embedding-profile' },
          { name: 'lastUpdated', type: 'Edm.DateTimeOffset', filterable: true, sortable: true },
          { name: 'createdAt', type: 'Edm.DateTimeOffset', filterable: true, sortable: true }
        ],
        vectorSearch: {
          profiles: [
            {
              name: 'embedding-profile',
              algorithm: 'hnsw-algorithm'
            }
          ],
          algorithms: [
            {
              name: 'hnsw-algorithm',
              kind: 'hnsw',
              hnswParameters: {
                metric: 'cosine',
                m: 4,
                efConstruction: 400,
                efSearch: 500
              }
            }
          ]
        }
      };

      // Check if index exists
      try {
        await this.indexClient.getIndex(indexName);
        logger.info(`🔍 Azure AI Search index '${indexName}' already exists`);
        return true;
      } catch (error) {
        if (error.statusCode === 404) {
          // Create new index
          await this.indexClient.createIndex(indexDefinition);
          logger.info(`🔍 Created Azure AI Search index '${indexName}' with vector support`);
          return true;
        } else {
          throw error;
        }
      }
    } catch (error) {
      logger.error(`Failed to initialize Azure AI Search index: ${error.message}`);
      this.azureSearchEnabled = false;
      return false;
    }
  }

  /**
   * Store story embedding in Azure AI Search
   * @private
   */
  async _storeInAzureSearch(storyId, summary, description, testCases, embedding) {
    if (!this.azureSearchEnabled) return false;

    try {
      const document = {
        storyId: storyId,
        summary: summary,
        description: description,
        testCases: testCases.map(tc => ({
          id: tc.id,
          title: tc.title,
          steps: Array.isArray(tc.steps) ? tc.steps.join('\n') : tc.steps || '',
          expected: tc.expected || '',
          lastUpdated: tc.lastUpdated || new Date().toISOString()
        })),
        embedding: embedding,
        lastUpdated: new Date().toISOString(),
        createdAt: new Date().toISOString()
      };

      await this.searchClient.uploadDocuments([document]);
      logger.info(`🔍 Stored story ${storyId} in Azure AI Search`);
      return true;
    } catch (error) {
      logger.error(`Failed to store in Azure AI Search: ${error.message}`);
      return false;
    }
  }

  /**
   * Update story embedding in Azure AI Search
   * @private
   */
  async _updateInAzureSearch(storyId, summary, description, testCases, embedding) {
    if (!this.azureSearchEnabled) return false;

    try {
      const document = {
        storyId: storyId,
        summary: summary,
        description: description,
        testCases: testCases.map(tc => ({
          id: tc.id,
          title: tc.title,
          steps: Array.isArray(tc.steps) ? tc.steps.join('\n') : tc.steps || '',
          expected: tc.expected || '',
          lastUpdated: tc.lastUpdated || new Date().toISOString()
        })),
        embedding: embedding,
        lastUpdated: new Date().toISOString()
      };

      await this.searchClient.mergeOrUploadDocuments([document]);
      logger.info(`🔍 Updated story ${storyId} in Azure AI Search`);
      return true;
    } catch (error) {
      logger.error(`Failed to update in Azure AI Search: ${error.message}`);
      return false;
    }
  }

  /**
   * Search similar stories using Azure AI Search vector search
   * @private
   */
  async _searchSimilarInAzureSearch(embedding, threshold = 0.7, maxResults = 10) {
    if (!this.azureSearchEnabled) return [];

    try {
      const searchOptions = {
        vectorSearchOptions: {
          queries: [
            {
              kind: 'vector',
              vector: embedding,
              fields: ['embedding'],
              kNearestNeighborsCount: maxResults
            }
          ]
        },
        select: ['storyId', 'summary', 'description', 'testCases', 'lastUpdated'],
        top: maxResults
      };

      const searchResults = await this.searchClient.search('*', searchOptions);
      const results = [];

      for await (const result of searchResults.results) {
        if (result.score >= threshold) {
          results.push({
            storyId: result.document.storyId,
            summary: result.document.summary,
            description: result.document.description,
            testCases: result.document.testCases || [],
            similarity: result.score,
            lastUpdated: result.document.lastUpdated
          });
        }
      }

      logger.info(`🔍 Found ${results.length} similar stories in Azure AI Search`);
      return results;
    } catch (error) {
      logger.error(`Failed to search in Azure AI Search: ${error.message}`);
      return [];
    }
  }

  /**
   * Get story from Azure AI Search by ID
   * @private
   */
  async _getFromAzureSearch(storyId) {
    if (!this.azureSearchEnabled) return null;

    try {
      const result = await this.searchClient.getDocument(storyId);
      return {
        storyId: result.storyId,
        summary: result.summary,
        description: result.description,
        testCases: result.testCases || [],
        embedding: result.embedding,
        lastUpdated: result.lastUpdated
      };
    } catch (error) {
      if (error.statusCode !== 404) {
        logger.error(`Failed to get story from Azure AI Search: ${error.message}`);
      }
      return null;
    }
  }

  /**
   * Delete story from Azure AI Search
   * @private
   */
  async _deleteFromAzureSearch(storyId) {
    if (!this.azureSearchEnabled) return false;

    try {
      await this.searchClient.deleteDocuments([{ storyId: storyId }]);
      logger.info(`🔍 Deleted story ${storyId} from Azure AI Search`);
      return true;
    } catch (error) {
      logger.error(`Failed to delete from Azure AI Search: ${error.message}`);
      return false;
    }
  }

  /**
   * Perform semantic search across stories
   */
  async semanticSearch(query, maxResults = 10) {
    try {
      // Generate embedding for the search query
      const queryEmbedding = await this.embeddingService.generateEmbedding(query);
      
      let results = [];

      // Try Azure AI Search first
      if (this.azureSearchEnabled) {
        results = await this._searchSimilarInAzureSearch(queryEmbedding, 0.6, maxResults);
        
        if (results.length > 0) {
          logger.info(`🔍 Semantic search found ${results.length} results in Azure AI Search`);
          return results;
        }
      }

      // Fallback to local search
      results = await this.findSimilarStories(queryEmbedding, 0.6, maxResults);
      logger.info(`📁 Semantic search found ${results.length} results in local storage`);
      
      return results;
    } catch (error) {
      logger.error(`Semantic search failed: ${error.message}`);
      return [];
    }
  }

  /**
   * Update specific test case fields
   */
  async updateTestCase(testCaseId, updates) {
    try {
      let found = false;
      let updatedStoryId = null;
      
      // Update metadata timestamps
      if (this.table.metadata) {
        this.table.metadata.lastUpdated = new Date().toISOString();
      }

      // Search through all stories' test case details
      for (let storyIndex = 0; storyIndex < this.table.storyIds.length; storyIndex++) {
        const testCaseDetails = this.table.testCaseDetails[storyIndex];
        
        if (testCaseDetails && Array.isArray(testCaseDetails)) {
          for (let tcIndex = 0; tcIndex < testCaseDetails.length; tcIndex++) {
            if (testCaseDetails[tcIndex].testCaseId === testCaseId) {
              // Update the test case fields
              if (updates.description !== undefined) {
                testCaseDetails[tcIndex].description = updates.description;
              }
              if (updates.steps !== undefined) {
                testCaseDetails[tcIndex].steps = updates.steps;
              }
              if (updates.expectedOutcome !== undefined) {
                testCaseDetails[tcIndex].expectedOutcome = updates.expectedOutcome;
              }
              
              // Update timestamp
              testCaseDetails[tcIndex].lastUpdated = new Date().toISOString();
              
              found = true;
              updatedStoryId = this.table.storyIds[storyIndex];
              break;
            }
          }
        }
        
        if (found) break;
      }

      if (found) {
        // Save updated data to file
        await this._saveToFile();
        
        logger.info(`✅ Test case ${testCaseId} updated successfully`);
        return {
          success: true,
          testCaseId,
          storyId: updatedStoryId,
          updatedFields: updates
        };
      } else {
        logger.warn(`Test case ${testCaseId} not found for update`);
        return {
          success: false,
          message: `Test case ${testCaseId} not found`
        };
      }

    } catch (error) {
      logger.error(`Error updating test case ${testCaseId}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Save table to file
   * @private
   */
  async _saveToFile() {
    try {
      // Sync testCaseIds with testCaseDetails before saving
      this._syncTestCaseArrays();
      
      await fs.writeFile(this.dbPath, JSON.stringify(this.table, null, 2), 'utf8');
    } catch (error) {
      logger.error(`Failed to save vector table: ${error.message}`);
      throw error;
    }
  }

  /**
   * Synchronize testCaseIds array with actual testCaseDetails
   * @private
   */
  _syncTestCaseArrays() {
    if (!this.table.testCaseIds) this.table.testCaseIds = [];
    if (!this.table.testCaseDetails) this.table.testCaseDetails = [];
    
    // Reset and rebuild testCaseIds based on actual testCaseDetails
    this.table.testCaseIds = this.table.testCaseDetails.map(detailsArray => {
      if (Array.isArray(detailsArray)) {
        return detailsArray.map(tc => tc.testCaseId);
      }
      return [];
    });
    
    logger.info('🔄 Synchronized test case arrays');
  }

  /**
   * Calculate the current maximum test case ID from existing data
   * @private
   */
  _calculateCurrentMaxTestCaseId() {
    let maxId = 0;
    
    if (this.table.testCaseDetails && Array.isArray(this.table.testCaseDetails)) {
      this.table.testCaseDetails.forEach(tcArray => {
        if (tcArray && Array.isArray(tcArray)) {
          tcArray.forEach(tc => {
            if (tc.testCaseId && typeof tc.testCaseId === 'string') {
              // Extract number from TC_XXX format
              const match = tc.testCaseId.match(/TC_(\d+)/);
              if (match) {
                const idNumber = parseInt(match[1], 10);
                if (idNumber > maxId) {
                  maxId = idNumber;
                }
              }
            }
          });
        }
      });
    }
    
    return maxId;
  }

  /**
   * Count total test cases in the system
   * @private
   */
  _countTotalTestCases() {
    let total = 0;
    
    if (this.table.testCaseDetails && Array.isArray(this.table.testCaseDetails)) {
      this.table.testCaseDetails.forEach(tcArray => {
        if (tcArray && Array.isArray(tcArray)) {
          total += tcArray.length;
        }
      });
    }
    
    return total;
  }

  /**
   * Generate next unique test case ID
   * @returns {string} Unique test case ID in format TC_XXX
   */
  getNextTestCaseId() {
    this.table.globalTestCaseCounter += 1;
    const testCaseId = `TC_${String(this.table.globalTestCaseCounter).padStart(3, '0')}`;
    
    // Update metadata
    if (this.table.metadata) {
      this.table.metadata.lastTestCaseId = this.table.globalTestCaseCounter;
      this.table.metadata.totalTestCasesCreated += 1;
      this.table.metadata.lastUpdated = new Date().toISOString();
    }
    
    logger.info(`🆔 Generated unique test case ID: ${testCaseId}`);
    return testCaseId;
  }

  /**
   * Generate multiple unique test case IDs
   * @param {number} count - Number of IDs to generate
   * @returns {Array<string>} Array of unique test case IDs
   */
  generateTestCaseIds(count) {
    const ids = [];
    for (let i = 0; i < count; i++) {
      ids.push(this.getNextTestCaseId());
    }
    return ids;
  }
}

module.exports = { VectorStorage };
