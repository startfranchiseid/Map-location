// Chat API endpoint — orchestrates cache, routing, RAG, and providers
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { routeMessage } from '$lib/server/ai/router';
import {
    getCacheKey,
    getCachedResponse,
    getSemanticCachedResponse,
    setCachedResponse,
    setSemanticCachedResponse,
    getCacheStats,
} from '$lib/server/ai/cache';
import { getRelevantContext, getSuggestedActions, type AiAction } from '$lib/server/ai/rag';
import { generateWithFallback, getConfiguredProviders } from '$lib/server/ai/providers';
import { SYSTEM_PROMPT, SIMPLE_SYSTEM_PROMPT, buildContextPrompt } from '$lib/server/ai/prompts';
import type { ModelMessage } from 'ai';
import PocketBase from 'pocketbase';
import { env } from '$env/dynamic/private';

export const POST: RequestHandler = async ({ request }) => {
    try {
        const { messages, userLocation, providerOverride } = await request.json();

        const normalizedLocation =
            userLocation &&
            typeof userLocation.lat === 'number' &&
            typeof userLocation.lng === 'number'
                ? { lat: userLocation.lat, lng: userLocation.lng }
                : null;

        if (!messages || !Array.isArray(messages) || messages.length === 0) {
            return json({ error: 'Messages array is required' }, { status: 400 });
        }

        // Check configured providers
        const providers = getConfiguredProviders();
        if (providers.length === 0) {
            return json({
                error: 'No AI providers configured. Please add at least one API key to .env',
                reply: 'Maaf, AI belum dikonfigurasi. Silakan tambahkan API key di file .env (GOOGLE_AI_API_KEY, OPENROUTER_API_KEY, atau GROQ_API_KEY).',
            }, { status: 503 });
        }

        // 1. Compute data version (latest update timestamp) to invalidate cache on DB changes
        let dataVersion: string | null = null;
        try {
            const pbUrl = env.PUBLIC_POCKETBASE_URL || 'https://pocketbase.startfranchise.id';
            const pb = new PocketBase(pbUrl);
            const latestBrand = await pb.collection('brands').getList(1, 1, { sort: '-updated', fields: 'updated' });
            const latestOutlet = await pb.collection('outlets').getList(1, 1, { sort: '-updated', fields: 'updated' });
            const tsBrand = latestBrand.items[0]?.updated ? Date.parse(latestBrand.items[0].updated) : 0;
            const tsOutlet = latestOutlet.items[0]?.updated ? Date.parse(latestOutlet.items[0].updated) : 0;
            const ts = Math.max(tsBrand || 0, tsOutlet || 0);
            dataVersion = ts ? String(ts) : null;
        } catch {
            dataVersion = null;
        }

        const lastMessage = messages[messages.length - 1];

        // 2. Cache check
        const cacheKey = getCacheKey(messages, normalizedLocation, dataVersion);
        const cached = await getCachedResponse(cacheKey);
        if (cached) {
            let actions: AiAction[] = [];
            try {
                actions = await getSuggestedActions(
                    lastMessage.content,
                    normalizedLocation,
                );
            } catch {
                actions = [];
            }
            return json({
                reply: cached,
                cached: true,
                actions,
                stats: getCacheStats(),
            });
        }

        const semanticCached = await getSemanticCachedResponse(
            lastMessage.content,
            normalizedLocation,
            dataVersion,
        );
        if (semanticCached) {
            let actions: AiAction[] = [];
            try {
                actions = await getSuggestedActions(
                    lastMessage.content,
                    normalizedLocation,
                );
            } catch {
                actions = [];
            }
            return json({
                reply: semanticCached,
                cached: true,
                cacheType: 'semantic',
                actions,
                stats: getCacheStats(),
            });
        }

        // 3. Route the message
        const route = routeMessage(lastMessage.content);

        // Short-circuit: deterministic reply for "list all brands" requests (purely DB-based)
        const lowerMsg = lastMessage.content.toLowerCase();
        const wantsAllBrands =
            /\b(semua|seluruh|daftar|list)\b.*\bbrand\b/.test(lowerMsg) ||
            /\bbrand\b.*\bapa\s*saja\b/.test(lowerMsg) ||
            /\bsebutkan\b.*\bbrand\b/.test(lowerMsg) ||
            /\bfranchise\b.*\bapa\s*saja\b/.test(lowerMsg);
        if (wantsAllBrands) {
            try {
                const pbUrl = env.PUBLIC_POCKETBASE_URL || 'https://pocketbase.startfranchise.id';
                const pb = new PocketBase(pbUrl);
                const brandsRes = await pb.collection('brands').getFullList({
                    sort: 'category,name',
                    fields: 'id,name,category',
                    expand: 'category',
                });
                const byCat = new Map<string, string[]>();
                for (const b of brandsRes) {
                    const cat = ((b.expand as any)?.category?.name || 'Umum').trim();
                    if (!byCat.has(cat)) byCat.set(cat, []);
                    byCat.get(cat)!.push(b.name);
                }
                const total = brandsRes.length;
                const lines: string[] = [];
                lines.push(`Kami memiliki ${total} brand franchise di database kami:`);
                for (const [cat, names] of byCat.entries()) {
                    lines.push(`* ${cat}:`);
                    for (const n of names) {
                        lines.push(`  + ${n}`);
                    }
                }
                const replyText = lines.join('\n');
                // Cache and return
                const key = getCacheKey(messages, normalizedLocation, dataVersion);
                await setCachedResponse(key, replyText);
                await setSemanticCachedResponse(
                    lastMessage.content,
                    replyText,
                    normalizedLocation,
                    dataVersion,
                );
                return json({
                    reply: replyText,
                    cached: false,
                    provider: 'db',
                    model: 'direct',
                    actions: [],
                    stats: getCacheStats(),
                });
            } catch (e) {
                // If DB fails, continue with normal flow
            }
        }

        // 4. Build system prompt with RAG context (if needed)
        let systemPrompt = route.complexity === 'simple' ? SIMPLE_SYSTEM_PROMPT : SYSTEM_PROMPT;

        if (route.needsRag) {
            try {
                const context = await getRelevantContext(
                    lastMessage.content,
                    normalizedLocation,
                );
                if (context.text) {
                    systemPrompt += buildContextPrompt(context.text);
                }
            } catch (e) {
                console.warn('[Chat API] RAG failed, continuing without context:', e);
            }
        }

        // 5. Build ModelMessage array (without system — that's passed separately)
        const aiMessages: ModelMessage[] = messages.map((m: { role: string; content: string }) => ({
            role: m.role as 'user' | 'assistant',
            content: m.content,
        }));

        // 6. Call AI with fallback
        const allowedProviders = new Set(['google', 'openrouter', 'groq', 'local']);
        const overrideName =
            providerOverride &&
            typeof providerOverride === 'object' &&
            typeof providerOverride.name === 'string'
                ? providerOverride.name
                : null;
        const override =
            overrideName && allowedProviders.has(overrideName)
                ? {
                    name: overrideName as 'google' | 'openrouter' | 'groq' | 'local',
                    apiKey:
                        typeof providerOverride.apiKey === 'string'
                            ? providerOverride.apiKey
                            : undefined,
                }
                : undefined;
        const result = await generateWithFallback(
            systemPrompt,
            aiMessages,
            route.modelTier,
            override,
        );
        let actions: AiAction[] = [];
        try {
            actions = await getSuggestedActions(
                lastMessage.content,
                normalizedLocation,
            );
        } catch {
            actions = [];
        }

        // 7. Cache the response
        await setCachedResponse(cacheKey, result.text);
        await setSemanticCachedResponse(
            lastMessage.content,
            result.text,
            normalizedLocation,
            dataVersion,
        );

        return json({
            reply: result.text,
            cached: false,
            provider: result.provider,
            model: result.model,
            complexity: route.complexity,
            actions,
            stats: getCacheStats(),
        });

    } catch (error: any) {
        console.error('[Chat API] Error:', error);
        return json({
            error: error.message || 'Internal server error',
            reply: 'Maaf, terjadi kesalahan saat memproses permintaan Anda. Silakan coba lagi.',
        }, { status: 500 });
    }
};

// Health check / stats endpoint
export const GET: RequestHandler = async () => {
    return json({
        status: 'ok',
        providers: getConfiguredProviders(),
        cache: getCacheStats(),
    });
};
