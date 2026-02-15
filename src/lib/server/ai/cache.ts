// AI chatbot cache with optional Redis backend
// Falls back to in-memory Map when Redis is unavailable

import { createHash } from 'crypto';
import { env } from '$env/dynamic/private';

interface CacheEntry {
    response: string;
    timestamp: number;
    hitCount: number;
}

interface SemanticCacheEntry {
    response: string;
    timestamp: number;
    hitCount: number;
    text: string;
    tokens: string[];
    locationKey: string;
    versionKey: string;
}

const cache = new Map<string, CacheEntry>();
const semanticCache = new Map<string, SemanticCacheEntry>();
const MAX_CACHE_SIZE = 500;
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes
const CACHE_TTL_SECONDS = Math.floor(CACHE_TTL / 1000);
const SEMANTIC_MIN_SIMILARITY = Number(env.AI_SEMANTIC_CACHE_MIN_SIMILARITY || 0.84);
const SEMANTIC_MIN_TOKENS = Number(env.AI_SEMANTIC_CACHE_MIN_TOKENS || 3);

let totalHits = 0;
let totalMisses = 0;
let semanticHits = 0;
let semanticMisses = 0;

// Optional Redis client (lazy init)
let redisClient: any = null;
let redisReady = false;

async function ensureRedis(): Promise<boolean> {
    if (redisReady && redisClient) return true;
    const host = env.REDIS_HOST || process.env.REDIS_HOST;
    const port = Number(env.REDIS_PORT || process.env.REDIS_PORT || 0);
    const password = env.REDIS_PASSWORD || process.env.REDIS_PASSWORD;
    if (!host || !port) return false;
    try {
        const mod = await import('redis').catch(() => null);
        if (!mod || !mod.createClient) return false;
        const url = `redis://${password ? `:${encodeURIComponent(password)}@` : ''}${host}:${port}`;
        redisClient = mod.createClient({ url });
        redisClient.on('error', () => {});
        await redisClient.connect();
        redisReady = true;
        console.log(`[AI Cache] Redis connected at ${host}:${port}`);
        return true;
    } catch {
        redisClient = null;
        redisReady = false;
        console.warn('[AI Cache] Redis connection failed, using memory cache');
        return false;
    }
}

/**
 * Generate a cache key from the last N messages.
 * We hash the last 2 messages (user + assistant context) to create a fingerprint.
 */
export function getCacheKey(
    messages: Array<{ role: string; content: string }>,
    userLocation?: { lat: number; lng: number } | null,
    dataVersion?: string | number | null,
): string {
    // Use last 2 messages for context-aware caching
    const relevant = messages.slice(-2).map(m => `${m.role}:${m.content.trim().toLowerCase()}`).join('|');
    const locationKey = userLocation
        ? `|loc:${userLocation.lat.toFixed(4)},${userLocation.lng.toFixed(4)}`
        : '';
    const versionKey = dataVersion ? `|v:${dataVersion}` : '';
    return createHash('md5').update(`${relevant}${locationKey}${versionKey}`).digest('hex');
}

function normalizeText(text: string): string {
    return text
        .toLowerCase()
        .replace(/[`~!@#$%^&*()_+=[\]{};:'"\\|,.<>/?-]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function tokenize(text: string): string[] {
    const parts = text.split(' ').filter(Boolean);
    const tokens = parts.filter((t) => t.length >= 3);
    return Array.from(new Set(tokens));
}

function jaccardSimilarity(a: string[], b: string[]): number {
    if (a.length === 0 || b.length === 0) return 0;
    const setA = new Set(a);
    let intersection = 0;
    for (const item of b) {
        if (setA.has(item)) intersection += 1;
    }
    const union = setA.size + new Set(b).size - intersection;
    return union === 0 ? 0 : intersection / union;
}

function getLocationKey(userLocation?: { lat: number; lng: number } | null): string {
    return userLocation
        ? `loc:${userLocation.lat.toFixed(3)},${userLocation.lng.toFixed(3)}`
        : 'loc:none';
}

function getVersionKey(dataVersion?: string | number | null): string {
    return dataVersion ? `v:${dataVersion}` : 'v:none';
}

/**
 * Look up a cached response.
 */
export async function getCachedResponse(key: string): Promise<string | null> {
    // Try Redis
    if (await ensureRedis()) {
        const val = await redisClient.get(`ai:cache:${key}`);
        if (val == null) {
            totalMisses++;
            console.log(`[AI Cache] MISS(redis) — key: ${key.slice(0, 8)}...`);
            return null;
        }
        totalHits++;
        console.log(`[AI Cache] HIT(redis) — key: ${key.slice(0, 8)}...`);
        return val;
    }
    // Fallback: in-memory
    const entry = cache.get(key);
    if (!entry) {
        totalMisses++;
        console.log(`[AI Cache] MISS(memory) — key: ${key.slice(0, 8)}...`);
        return null;
    }
    if (Date.now() - entry.timestamp > CACHE_TTL) {
        cache.delete(key);
        totalMisses++;
        console.log(`[AI Cache] EXPIRED(memory) — key: ${key.slice(0, 8)}...`);
        return null;
    }
    entry.hitCount++;
    totalHits++;
    console.log(`[AI Cache] HIT(memory) — key: ${key.slice(0, 8)}... (hits: ${entry.hitCount})`);
    return entry.response;
}

export async function getSemanticCachedResponse(
    message: string,
    userLocation?: { lat: number; lng: number } | null,
    dataVersion?: string | number | null,
): Promise<string | null> {
    const normalized = normalizeText(message);
    if (!normalized) return null;
    const tokens = tokenize(normalized);
    if (tokens.length < SEMANTIC_MIN_TOKENS) return null;

    const locationKey = getLocationKey(userLocation);
    const versionKey = getVersionKey(dataVersion);
    const now = Date.now();

    let bestKey: string | null = null;
    let bestScore = 0;

    for (const [key, entry] of semanticCache.entries()) {
        if (now - entry.timestamp > CACHE_TTL) {
            semanticCache.delete(key);
            continue;
        }
        if (entry.locationKey !== locationKey || entry.versionKey !== versionKey) continue;
        const score = jaccardSimilarity(tokens, entry.tokens);
        if (score > bestScore) {
            bestScore = score;
            bestKey = key;
        }
    }

    if (bestKey && bestScore >= SEMANTIC_MIN_SIMILARITY) {
        const entry = semanticCache.get(bestKey);
        if (entry) {
            entry.hitCount += 1;
            semanticHits += 1;
            return entry.response;
        }
    }

    semanticMisses += 1;
    return null;
}

/**
 * Store a response in cache.
 */
export async function setCachedResponse(key: string, response: string): Promise<void> {
    // Try Redis
    if (await ensureRedis()) {
        await redisClient.set(`ai:cache:${key}`, response, { EX: CACHE_TTL_SECONDS });
        console.log(`[AI Cache] STORED(redis) — key: ${key.slice(0, 8)}...`);
        return;
    }
    // Fallback: in-memory
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
    cache.set(key, { response, timestamp: Date.now(), hitCount: 0 });
    console.log(`[AI Cache] STORED(memory) — key: ${key.slice(0, 8)}... (total entries: ${cache.size})`);
}

export async function setSemanticCachedResponse(
    message: string,
    response: string,
    userLocation?: { lat: number; lng: number } | null,
    dataVersion?: string | number | null,
): Promise<void> {
    const normalized = normalizeText(message);
    if (!normalized) return;
    const tokens = tokenize(normalized);
    if (tokens.length < SEMANTIC_MIN_TOKENS) return;

    if (semanticCache.size >= MAX_CACHE_SIZE) {
        let oldestKey = '';
        let oldestTime = Infinity;
        for (const [k, v] of semanticCache.entries()) {
            if (v.timestamp < oldestTime) {
                oldestTime = v.timestamp;
                oldestKey = k;
            }
        }
        if (oldestKey) semanticCache.delete(oldestKey);
    }

    const locationKey = getLocationKey(userLocation);
    const versionKey = getVersionKey(dataVersion);
    const key = createHash('md5').update(`${normalized}|${locationKey}|${versionKey}`).digest('hex');

    semanticCache.set(key, {
        response,
        timestamp: Date.now(),
        hitCount: 0,
        text: normalized,
        tokens,
        locationKey,
        versionKey,
    });
}

/**
 * Get cache statistics.
 */
export function getCacheStats() {
    const total = totalHits + totalMisses;
    const semanticTotal = semanticHits + semanticMisses;
    return {
        backend: redisReady ? 'redis' : 'memory',
        size: redisReady ? undefined : cache.size,
        maxSize: MAX_CACHE_SIZE,
        hits: totalHits,
        misses: totalMisses,
        hitRate: total > 0 ? ((totalHits / total) * 100).toFixed(1) + '%' : '0%',
        semantic: {
            size: semanticCache.size,
            hits: semanticHits,
            misses: semanticMisses,
            hitRate: semanticTotal > 0 ? ((semanticHits / semanticTotal) * 100).toFixed(1) + '%' : '0%',
        },
    };
}
