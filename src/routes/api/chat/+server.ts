// Chat API endpoint — orchestrates cache, routing, RAG, and providers
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { routeMessage } from '$lib/server/ai/router';
import { getCacheKey, getCachedResponse, setCachedResponse, getCacheStats } from '$lib/server/ai/cache';
import { getRelevantContext, getSuggestedActions, type AiAction } from '$lib/server/ai/rag';
import { generateWithFallback, getConfiguredProviders } from '$lib/server/ai/providers';
import { SYSTEM_PROMPT, SIMPLE_SYSTEM_PROMPT, buildContextPrompt } from '$lib/server/ai/prompts';
import type { ModelMessage } from 'ai';

export const POST: RequestHandler = async ({ request }) => {
    try {
        const { messages, userLocation } = await request.json();

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

        // 1. Cache check
        const cacheKey = getCacheKey(messages, normalizedLocation);
        const cached = getCachedResponse(cacheKey);
        if (cached) {
            let actions: AiAction[] = [];
            try {
                actions = await getSuggestedActions(
                    messages[messages.length - 1].content,
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

        // 2. Route the message
        const lastMessage = messages[messages.length - 1];
        const route = routeMessage(lastMessage.content);

        // 3. Build system prompt with RAG context (if needed)
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

        // 4. Build ModelMessage array (without system — that's passed separately)
        const aiMessages: ModelMessage[] = messages.map((m: { role: string; content: string }) => ({
            role: m.role as 'user' | 'assistant',
            content: m.content,
        }));

        // 5. Call AI with fallback
        const result = await generateWithFallback(systemPrompt, aiMessages, route.modelTier);
        let actions: AiAction[] = [];
        try {
            actions = await getSuggestedActions(
                lastMessage.content,
                normalizedLocation,
            );
        } catch {
            actions = [];
        }

        // 6. Cache the response
        setCachedResponse(cacheKey, result.text);

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
