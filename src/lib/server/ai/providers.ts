// Multi-provider AI orchestration with automatic fallback
// Supports: Google AI (Gemini), OpenRouter, Groq

import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import { generateText, streamText, type ModelMessage } from 'ai';
import { env } from '$env/dynamic/private';

export type ProviderName = 'google' | 'openrouter' | 'groq';

interface ProviderConfig {
    name: ProviderName;
    available: boolean;
    models: {
        flash: string;
        pro: string;
    };
}

/**
 * Get available providers based on configured API keys.
 */
function getProviders(): ProviderConfig[] {
    const providers: ProviderConfig[] = [];

    // Google AI (primary — free tier)
    if (env.GOOGLE_AI_API_KEY) {
        providers.push({
            name: 'google',
            available: true,
            models: {
                flash: 'gemini-2.0-flash',
                pro: 'gemini-2.5-pro-preview-05-06',
            },
        });
    }

    // OpenRouter (secondary — aggregator)
    if (env.OPENROUTER_API_KEY) {
        providers.push({
            name: 'openrouter',
            available: true,
            models: {
                flash: 'google/gemini-2.0-flash-exp:free',
                pro: 'google/gemini-2.5-pro-exp-03-25:free',
            },
        });
    }

    // Groq (tertiary — ultra-fast)
    if (env.GROQ_API_KEY) {
        providers.push({
            name: 'groq',
            available: true,
            models: {
                flash: 'llama-3.3-70b-versatile',
                pro: 'llama-3.3-70b-versatile',
            },
        });
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
                apiKey: env.GOOGLE_AI_API_KEY,
            });
            return google(modelId);
        }
        case 'openrouter': {
            const openrouter = createOpenAI({
                apiKey: env.OPENROUTER_API_KEY,
                baseURL: 'https://openrouter.ai/api/v1',
            });
            return openrouter(modelId);
        }
        case 'groq': {
            const groq = createOpenAI({
                apiKey: env.GROQ_API_KEY,
                baseURL: 'https://api.groq.com/openai/v1',
            });
            return groq(modelId);
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
    tier: 'flash' | 'pro' = 'flash'
): Promise<{ text: string; provider: ProviderName; model: string }> {
    const providers = getProviders();

    if (providers.length === 0) {
        throw new Error('No AI providers configured. Please set at least one API key in .env (GOOGLE_AI_API_KEY, OPENROUTER_API_KEY, or GROQ_API_KEY)');
    }

    for (const provider of providers) {
        try {
            console.log(`[AI Provider] Trying ${provider.name} (${provider.models[tier]})...`);

            const model = createModel(provider, tier);
            const result = await generateText({
                model,
                system: systemPrompt,
                messages,
                maxOutputTokens: 1024,
                temperature: 0.7,
            });

            console.log(`[AI Provider] ✓ ${provider.name} responded (${result.text.length} chars)`);

            return {
                text: result.text,
                provider: provider.name,
                model: provider.models[tier],
            };
        } catch (error: any) {
            console.warn(`[AI Provider] ✗ ${provider.name} failed:`, error.message || error);
            // Continue to next provider
        }
    }

    throw new Error('All AI providers failed. Please check your API keys and quotas.');
}

/**
 * Stream a text response with automatic fallback across providers.
 */
export async function streamWithFallback(
    systemPrompt: string,
    messages: ModelMessage[],
    tier: 'flash' | 'pro' = 'flash'
) {
    const providers = getProviders();

    if (providers.length === 0) {
        throw new Error('No AI providers configured. Please set at least one API key in .env');
    }

    for (const provider of providers) {
        try {
            console.log(`[AI Provider] Streaming via ${provider.name} (${provider.models[tier]})...`);

            const model = createModel(provider, tier);
            const result = streamText({
                model,
                system: systemPrompt,
                messages,
                maxOutputTokens: 1024,
                temperature: 0.7,
            });

            return { stream: result, provider: provider.name, model: provider.models[tier] };
        } catch (error: any) {
            console.warn(`[AI Provider] ✗ ${provider.name} streaming failed:`, error.message || error);
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
