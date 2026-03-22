// logger.js
// Simple logging utility with configurable levels

const LOG_LEVELS = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3
};

class Logger {
  constructor() {
    // Read log level from environment variable, default to INFO
    const envLevel = process.env.LOG_LEVEL || 'INFO';
    this.level = LOG_LEVELS[envLevel.toUpperCase()] || LOG_LEVELS.INFO;
  }

  error(message, ...args) {
    if (this.level >= LOG_LEVELS.ERROR) {
      console.error(`❌ ${message}`, ...args);
    }
  }

  warn(message, ...args) {
    if (this.level >= LOG_LEVELS.WARN) {
      console.log(`⚠️ ${message}`, ...args);
    }
  }

  info(message, ...args) {
    if (this.level >= LOG_LEVELS.INFO) {
      console.log(`ℹ️ ${message}`, ...args);
    }
  }

  debug(message, ...args) {
    if (this.level >= LOG_LEVELS.DEBUG) {
      console.log(`🐛 ${message}`, ...args);
    }
  }

  // Essential logs that should always show (like server start, major operations)
  essential(message, ...args) {
    console.log(`✅ ${message}`, ...args);
  }
}

module.exports = new Logger();
