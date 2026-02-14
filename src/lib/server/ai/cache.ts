// In-memory response cache for AI chatbot
// Implements exact-match caching with TTL and size limits

import { createHash } from 'crypto';

interface CacheEntry {
    response: string;
    timestamp: number;
    hitCount: number;
}

const cache = new Map<string, CacheEntry>();
const MAX_CACHE_SIZE = 500;
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

let totalHits = 0;
let totalMisses = 0;

/**
 * Generate a cache key from the last N messages.
 * We hash the last 2 messages (user + assistant context) to create a fingerprint.
 */
export function getCacheKey(messages: Array<{ role: string; content: string }>): string {
    // Use last 2 messages for context-aware caching
    const relevant = messages.slice(-2).map(m => `${m.role}:${m.content.trim().toLowerCase()}`).join('|');
    return createHash('md5').update(relevant).digest('hex');
}

/**
 * Look up a cached response.
 */
export function getCachedResponse(key: string): string | null {
    const entry = cache.get(key);
    if (!entry) {
        totalMisses++;
        return null;
    }

    // Check TTL
    if (Date.now() - entry.timestamp > CACHE_TTL) {
        cache.delete(key);
        totalMisses++;
        return null;
    }

    entry.hitCount++;
    totalHits++;
    console.log(`[AI Cache] HIT — key: ${key.slice(0, 8)}... (hits: ${entry.hitCount})`);
    return entry.response;
}

/**
 * Store a response in cache.
 */
export function setCachedResponse(key: string, response: string): void {
    // Evict oldest entries if cache is full
    if (cache.size >= MAX_CACHE_SIZE) {
        let oldestKey = '';
        let oldestTime = Infinity;
        for (const [k, v] of cache.entries()) {
            if (v.timestamp < oldestTime) {
                oldestTime = v.timestamp;
                oldestKey = k;
            }
        }
        if (oldestKey) cache.delete(oldestKey);
    }

    cache.set(key, {
        response,
        timestamp: Date.now(),
        hitCount: 0,
    });

    console.log(`[AI Cache] STORED — key: ${key.slice(0, 8)}... (total entries: ${cache.size})`);
}

/**
 * Get cache statistics.
 */
export function getCacheStats() {
    const total = totalHits + totalMisses;
    return {
        size: cache.size,
        maxSize: MAX_CACHE_SIZE,
        hits: totalHits,
        misses: totalMisses,
        hitRate: total > 0 ? ((totalHits / total) * 100).toFixed(1) + '%' : '0%',
    };
}
