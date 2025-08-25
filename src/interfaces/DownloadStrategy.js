/**
 * Strategy Pattern Interface for Download Tools
 * Defines the contract for all download strategies (yt-dlp, gallery-dl, etc.)
 */
export class DownloadStrategy {
    /**
     * Execute the download strategy
     * @param {string} url - Instagram URL to download
     * @param {Object} options - Strategy-specific options
     * @returns {Promise<DownloadResult>} 
     */
    async execute(url, options = {}) {
        throw new Error('Strategy execute method must be implemented');
    }

    /**
     * Get strategy name for logging and identification
     * @returns {string}
     */
    getName() {
        throw new Error('Strategy getName method must be implemented');
    }

    /**
     * Get strategy priority (lower number = higher priority)
     * @returns {number}
     */
    getPriority() {
        throw new Error('Strategy getPriority method must be implemented');
    }

    /**
     * Check if strategy can handle this URL type
     * @param {string} url - URL to check
     * @returns {boolean}
     */
    canHandle(url) {
        throw new Error('Strategy canHandle method must be implemented');
    }

    /**
     * Get estimated execution time in milliseconds
     * @returns {number}
     */
    getEstimatedDuration() {
        return 30000; // Default 30s
    }
}

/**
 * Download Result Interface
 * @typedef {Object} DownloadResult
 * @property {boolean} success - Whether download was successful
 * @property {string} downloadUrl - Direct download URL
 * @property {string} tool - Tool used ('yt-dlp', 'gallery-dl')
 * @property {string} strategy - Specific strategy used
 * @property {number} duration - Execution time in ms
 * @property {Object} metadata - Additional metadata
 * @property {string} error - Error message if failed
 * @property {string} errorCategory - Error category for handling
 */
