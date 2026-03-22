// stringUtils.js
// Extracted string manipulation utilities from story_api.js

/**
 * Calculate string similarity using Levenshtein distance
 * @param {string} str1 - First string
 * @param {string} str2 - Second string
 * @returns {number} Similarity score between 0 and 1
 */
function calculateStringSimilarity(str1, str2) {
  const longer = str1.length > str2.length ? str1 : str2;
  const shorter = str1.length > str2.length ? str2 : str1;
  
  if (longer.length === 0) return 1.0;
  
  const distance = levenshteinDistance(longer, shorter);
  return (longer.length - distance) / longer.length;
}

/**
 * Calculate Levenshtein distance between two strings
 * @param {string} str1 - First string
 * @param {string} str2 - Second string
 * @returns {number} Edit distance
 */
function levenshteinDistance(str1, str2) {
  const matrix = [];
  
  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i];
  }
  
  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j;
  }
  
  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  
  return matrix[str2.length][str1.length];
}

/**
 * Check if two strings are nearly identical (95% similarity threshold)
 * @param {string} str1 - First string
 * @param {string} str2 - Second string
 * @returns {boolean} True if strings are very similar
 */
function areStringsSimilar(str1, str2, threshold = 0.95) {
  return calculateStringSimilarity(str1.trim(), str2.trim()) > threshold;
}

/**
 * Check if two strings are exactly identical (case-insensitive, trimmed)
 * @param {string} str1 - First string
 * @param {string} str2 - Second string
 * @returns {boolean} True if strings are identical
 */
function areStringsIdentical(str1, str2) {
  return str1.trim().toLowerCase() === str2.trim().toLowerCase();
}

module.exports = {
  calculateStringSimilarity,
  levenshteinDistance,
  areStringsSimilar,
  areStringsIdentical
};
