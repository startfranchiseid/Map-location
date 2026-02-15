// Multi-provider AI orchestration with automatic fallback
// Supports: Google AI (Gemini), OpenRouter, Groq

import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import { generateText, streamText, type ModelMessage } from 'ai';
import OpenAI from 'openai';
import { env } from '$env/dynamic/private';

export type ProviderName = 'google' | 'openrouter' | 'groq' | 'local';

interface ProviderConfig {
    name: ProviderName;
    available: boolean;
    apiKey?: string;
    baseURL?: string;
    models: {
        flash: string;
        pro: string;
    };
}

type ProviderTier = 'flash' | 'pro';
type NormalizedMessage = { role: 'system' | 'user' | 'assistant'; content: string };
type ProviderOverride = { name: ProviderName; apiKey?: string };

const providerNames: ProviderName[] = ['google', 'openrouter', 'groq', 'local'];

function isProviderName(name: string): name is ProviderName {
    return providerNames.includes(name as ProviderName);
}

type ErrorCategory =
    | 'rate_limit'
    | 'auth'
    | 'model'
    | 'network'
    | 'timeout'
    | 'server'
    | 'unknown';

interface ErrorInfo {
    provider: ProviderName;
    tier: ProviderTier;
    message: string;
    status?: number;
    code?: string;
    category: ErrorCategory;
    retryable: boolean;
}

let providerCursor = 0;

function rotateProviders(providers: ProviderConfig[]): ProviderConfig[] {
    if (providers.length <= 1) return providers;
    const start = providerCursor % providers.length;
    providerCursor += 1;
    return [...providers.slice(start), ...providers.slice(0, start)];
}

function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeContent(content: ModelMessage['content']): string {
    if (typeof content === 'string') return content;
    if (!content) return '';
    if (Array.isArray(content)) {
        return content
            .map((part: any) => (part?.type === 'text' ? part.text : ''))
            .filter(Boolean)
            .join('\n');
    }
    return String(content);
}

function normalizeMessages(messages: ModelMessage[]): NormalizedMessage[] {
    return messages
        .filter((m) => m.role !== 'tool')
        .map((m) => ({
            role: (m.role === 'system' ? 'system' : m.role === 'assistant' ? 'assistant' : 'user'),
            content: normalizeContent(m.content),
        }));
}

function buildChatMessages(systemPrompt: string, messages: ModelMessage[]) {
    const normalized = normalizeMessages(messages);
    const chatMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
        { role: 'system', content: systemPrompt },
        ...normalized.map((m) => ({
            role: m.role as 'system' | 'user' | 'assistant',
            content: normalizeContent(m.content),
        })),
    ];
    return chatMessages;
}

function createOpenAIClient(provider: ProviderConfig) {
    if (provider.name === 'openrouter') {
        return new OpenAI({
            apiKey: provider.apiKey || env.OPENROUTER_API_KEY,
            baseURL: provider.baseURL || 'https://openrouter.ai/api/v1',
        });
    }
    if (provider.name === 'groq') {
        return new OpenAI({
            apiKey: provider.apiKey || env.GROQ_API_KEY,
            baseURL: provider.baseURL || 'https://api.groq.com/openai/v1',
        });
    }
    if (provider.name === 'local') {
        const baseURL = provider.baseURL || env.LOCAL_AI_BASE_URL;
        if (!baseURL) return null;
        return new OpenAI({
            apiKey: provider.apiKey || env.LOCAL_AI_API_KEY || 'local',
            baseURL,
        });
    }
    return null;
}

function extractStatus(error: any): number | undefined {
    return (
        error?.status ??
        error?.statusCode ??
        error?.response?.status ??
        error?.cause?.status ??
        error?.cause?.response?.status
    );
}

function classifyError(
    provider: ProviderName,
    tier: ProviderTier,
    error: any,
): ErrorInfo {
    const status = extractStatus(error);
    const code = error?.code ?? error?.cause?.code;
    const message = String(error?.message || error || 'Unknown error');
    const lower = message.toLowerCase();

    const isAuth =
        status === 401 ||
        status === 403 ||
        lower.includes('unauthorized') ||
        lower.includes('invalid api key') ||
        lower.includes('api key') && lower.includes('invalid');
    const isRateLimit =
        status === 429 ||
        lower.includes('rate limit') ||
        lower.includes('quota') ||
        lower.includes('exceeded') && lower.includes('limit');
    const isModel =
        status === 404 ||
        lower.includes('model') && lower.includes('not found') ||
        lower.includes('unknown model') ||
        lower.includes('not supported');
    const isTimeout =
        lower.includes('timeout') ||
        code === 'ETIMEDOUT' ||
        code === 'ESOCKETTIMEDOUT';
    const isNetwork =
        code === 'ECONNRESET' ||
        code === 'ENOTFOUND' ||
        code === 'ECONNREFUSED' ||
        lower.includes('network');
    const isServer = status !== undefined && status >= 500;

    let category: ErrorCategory = 'unknown';
    if (isAuth) category = 'auth';
    else if (isRateLimit) category = 'rate_limit';
    else if (isModel) category = 'model';
    else if (isTimeout) category = 'timeout';
    else if (isNetwork) category = 'network';
    else if (isServer) category = 'server';

    const retryable =
        category === 'server' ||
        category === 'network' ||
        category === 'timeout';

    return {
        provider,
        tier,
        message,
        status,
        code,
        category,
        retryable,
    };
}

async function tryGenerate(
    provider: ProviderConfig,
    tier: ProviderTier,
    systemPrompt: string,
    messages: ModelMessage[],
): Promise<{ text: string; provider: ProviderName; model: string }> {
    if (provider.name === 'google') {
        const model = createModel(provider, tier);
        const result = await generateText({
            model,
            system: systemPrompt,
            messages: normalizeMessages(messages) as ModelMessage[],
            maxOutputTokens: 1024,
            temperature: 0.7,
        });

        if (!result.text || !result.text.trim()) {
            throw new Error('Empty response');
        }

        return {
            text: result.text,
            provider: provider.name,
            model: provider.models[tier],
        };
    }

    const client = createOpenAIClient(provider);
    if (!client) {
        throw new Error(`Unsupported provider: ${provider.name}`);
    }

    const chatMessages = buildChatMessages(systemPrompt, messages);
    const completion = await client.chat.completions.create({
        model: provider.models[tier],
        messages: chatMessages,
        max_tokens: 1024,
        temperature: 0.7,
    });

    const text = completion.choices?.[0]?.message?.content ?? '';
    if (!text || !text.trim()) {
        throw new Error('Empty response');
    }

    return {
        text,
        provider: provider.name,
        model: provider.models[tier],
    };
}

/**
 * Get available providers based on configured API keys.
 */
function getProviders(override?: ProviderOverride): ProviderConfig[] {
    const providers: ProviderConfig[] = [];
    const overrideName = override?.name;
    const overrideKey = override?.apiKey;

    const googleKey =
        overrideName === 'google' && overrideKey
            ? overrideKey
            : env.GOOGLE_AI_API_KEY;
    if (googleKey) {
        providers.push({
            name: 'google',
            available: true,
            apiKey: googleKey,
            models: {
                flash: 'gemini-2.0-flash',
                pro: 'gemini-2.5-pro-preview-05-06',
            },
        });
    }

    const openrouterKey =
        overrideName === 'openrouter' && overrideKey
            ? overrideKey
            : env.OPENROUTER_API_KEY;
    if (openrouterKey) {
        providers.push({
            name: 'openrouter',
            available: true,
            apiKey: openrouterKey,
            baseURL: 'https://openrouter.ai/api/v1',
            models: {
                flash: env.OPENROUTER_MODEL_FLASH || 'google/gemini-2.0-flash-exp:free',
                pro: env.OPENROUTER_MODEL_PRO || 'google/gemini-2.5-pro-exp-03-25:free',
            },
        });
    }

    const groqKey =
        overrideName === 'groq' && overrideKey
            ? overrideKey
            : env.GROQ_API_KEY;
    if (groqKey) {
        providers.push({
            name: 'groq',
            available: true,
            apiKey: groqKey,
            baseURL: 'https://api.groq.com/openai/v1',
            models: {
                flash: 'llama-3.3-70b-versatile',
                pro: 'llama-3.3-70b-versatile',
            },
        });
    }

    const localBaseURL = env.LOCAL_AI_BASE_URL;
    const localFlash =
        env.LOCAL_AI_MODEL_FLASH || env.LOCAL_AI_MODEL || env.LOCAL_AI_MODEL_PRO;
    const localPro =
        env.LOCAL_AI_MODEL_PRO || env.LOCAL_AI_MODEL || env.LOCAL_AI_MODEL_FLASH;
    if (localBaseURL && localFlash && localPro) {
        providers.push({
            name: 'local',
            available: true,
            apiKey:
                overrideName === 'local' && overrideKey
                    ? overrideKey
                    : env.LOCAL_AI_API_KEY,
            baseURL: localBaseURL,
            models: {
                flash: localFlash,
                pro: localPro,
            },
        });
    }

    if (overrideName) {
        const idx = providers.findIndex((p) => p.name === overrideName);
        if (idx > 0) {
            providers.unshift(providers.splice(idx, 1)[0]);
        }
    }

    return providers;
}

/**
 * Create an AI model instance for the given provider and tier.
 */
function createModel(provider: ProviderConfig, tier: 'flash' | 'pro') {
    const modelId = provider.models[tier];

    switch (provider.name) {
        case 'google': {
            const google = createGoogleGenerativeAI({
                apiKey: provider.apiKey || env.GOOGLE_AI_API_KEY,
            });
            return google(modelId);
        }
        case 'openrouter': {
            const openrouter = createOpenAI({
                apiKey: provider.apiKey || env.OPENROUTER_API_KEY,
                baseURL: provider.baseURL || 'https://openrouter.ai/api/v1',
            });
            return openrouter(modelId);
        }
        case 'groq': {
            const groq = createOpenAI({
                apiKey: provider.apiKey || env.GROQ_API_KEY,
                baseURL: provider.baseURL || 'https://api.groq.com/openai/v1',
            });
            return groq(modelId);
        }
        case 'local': {
            const baseURL = provider.baseURL || env.LOCAL_AI_BASE_URL;
            if (!baseURL) {
                throw new Error('Local provider baseURL is not configured');
            }
            const local = createOpenAI({
                apiKey: provider.apiKey || env.LOCAL_AI_API_KEY || 'local',
                baseURL,
            });
            return local(modelId);
        }
        default:
            throw new Error(`Unknown provider: ${provider.name}`);
    }
}

/**
 * Generate a text response with automatic fallback across providers.
 */
export async function generateWithFallback(
    systemPrompt: string,
    messages: ModelMessage[],
    tier: 'flash' | 'pro' = 'flash',
    override?: ProviderOverride
): Promise<{ text: string; provider: ProviderName; model: string }> {
    const safeOverride =
        override && isProviderName(override.name) ? override : undefined;
    const providers = rotateProviders(getProviders(safeOverride));

    if (providers.length === 0) {
        throw new Error('No AI providers configured. Please set at least one API key in .env (GOOGLE_AI_API_KEY, OPENROUTER_API_KEY, or GROQ_API_KEY)');
    }

    const errors: ErrorInfo[] = [];
    const retryDelays = [300, 800];

    for (const provider of providers) {
        const tiersToTry: ProviderTier[] =
            tier === 'pro' ? ['pro', 'flash'] : ['flash'];

        for (const tierToTry of tiersToTry) {
            console.log(`[AI Provider] Trying ${provider.name} (${provider.models[tierToTry]})...`);
            let attempt = 0;
            while (attempt <= retryDelays.length) {
                try {
                    const result = await tryGenerate(
                        provider,
                        tierToTry,
                        systemPrompt,
                        messages,
                    );
                    console.log(
                        `[AI Provider] ✓ ${provider.name} responded (${result.text.length} chars)`,
                    );
                    return result;
                } catch (error: any) {
                    const info = classifyError(provider.name, tierToTry, error);
                    errors.push(info);
                    console.warn(
                        `[AI Provider] ✗ ${provider.name} failed (${info.category}${info.status ? ` ${info.status}` : ''}):`,
                        info.message,
                    );
                    if (info.category === 'model' && tierToTry === 'pro') {
                        break;
                    }
                    if (!info.retryable || attempt === retryDelays.length) {
                        break;
                    }
                    const delay = retryDelays[attempt];
                    attempt += 1;
                    await sleep(delay);
                }
            }
        }
    }

    const summary = errors
        .map(
            (e) =>
                `${e.provider}:${e.tier}:${e.category}${e.status ? `:${e.status}` : ''}`,
        )
        .join(', ');
    throw new Error(
        `All AI providers failed. Please check your API keys and quotas. ${summary}`,
    );
}

/**
 * Stream a text response with automatic fallback across providers.
 */
export async function streamWithFallback(
    systemPrompt: string,
    messages: ModelMessage[],
    tier: 'flash' | 'pro' = 'flash',
    override?: ProviderOverride
) {
    const safeOverride =
        override && isProviderName(override.name) ? override : undefined;
    const providers = rotateProviders(getProviders(safeOverride));

    if (providers.length === 0) {
        throw new Error('No AI providers configured. Please set at least one API key in .env');
    }

    const retryDelays = [300, 800];

    for (const provider of providers) {
        const tiersToTry: ProviderTier[] =
            tier === 'pro' ? ['pro', 'flash'] : ['flash'];

        for (const tierToTry of tiersToTry) {
            console.log(`[AI Provider] Streaming via ${provider.name} (${provider.models[tierToTry]})...`);
            let attempt = 0;
            while (attempt <= retryDelays.length) {
                try {
                    const model = createModel(provider, tierToTry);
                    const result = streamText({
                        model,
                        system: systemPrompt,
                        messages,
                        maxOutputTokens: 1024,
                        temperature: 0.7,
                    });
                    return {
                        stream: result,
                        provider: provider.name,
                        model: provider.models[tierToTry],
                    };
                } catch (error: any) {
                    const info = classifyError(provider.name, tierToTry, error);
                    console.warn(
                        `[AI Provider] ✗ ${provider.name} streaming failed (${info.category}${info.status ? ` ${info.status}` : ''}):`,
                        info.message,
                    );
                    if (info.category === 'model' && tierToTry === 'pro') {
                        break;
                    }
                    if (!info.retryable || attempt === retryDelays.length) {
                        break;
                    }
                    const delay = retryDelays[attempt];
                    attempt += 1;
                    await sleep(delay);
                }
            }
        }
    }

    throw new Error('All AI providers failed for streaming.');
}

/**
 * Get list of configured providers for diagnostics.
 */
export function getConfiguredProviders(): string[] {
    return getProviders().map(p => p.name);
}
