// Model Router — analyzes message complexity and routes to appropriate model tier

export type ComplexityLevel = 'simple' | 'medium' | 'complex';

export interface RouteResult {
    complexity: ComplexityLevel;
    needsRag: boolean;
    modelTier: 'flash' | 'pro';
}

// Keywords indicating analytical/complex reasoning
const COMPLEX_KEYWORDS = [
    'analisis', 'bandingkan', 'compare', 'evaluasi', 'strategi',
    'mengapa', 'why', 'bagaimana cara', 'how to',
    'pros and cons', 'kelebihan dan kekurangan', 'potensi',
    'investasi', 'modal', 'roi', 'break even',
    'jelaskan secara detail', 'explain in detail',
];

// Keywords indicating RAG is needed (brand/outlet data lookup)
const RAG_KEYWORDS = [
    'outlet', 'cabang', 'lokasi', 'alamat', 'dimana',
    'where', 'berapa', 'how many', 'jumlah',
    'kota', 'wilayah', 'daerah', 'region',
    'terdekat', 'nearest', 'closest', 'sekitar',
    'brand', 'franchise', 'merk', 'merek',
    'kumon', 'luuca', 'barber', 'laundry', // known brand names
    'kategori', 'category', 'jenis',
    'rating', 'review', 'bintang', 'score',
];

// Simple greetings/short messages
const SIMPLE_PATTERNS = [
    /^(hai|halo|hi|hello|hey|selamat|assalamu|good\s*(morning|afternoon|evening))[\s!.]*$/i,
    /^(terima\s*kasih|thanks?|makasih|thx|ok|oke|siap|baik)[\s!.]*$/i,
    /^(ya|tidak|iya|ngga|nggak|bukan|betul|benar)[\s!.]*$/i,
    /^.{0,15}$/,  // Very short messages (< 15 chars)
];

/**
 * Analyze a user message and determine routing.
 */
export function routeMessage(message: string): RouteResult {
    const lowerMsg = message.toLowerCase().trim();

    // 1. Check simple patterns first
    if (SIMPLE_PATTERNS.some(p => p.test(lowerMsg))) {
        return {
            complexity: 'simple',
            needsRag: false,
            modelTier: 'flash',
        };
    }

    // 2. Score complexity
    let complexityScore = 0;

    // Message length contributes to complexity
    if (lowerMsg.length > 100) complexityScore += 1;
    if (lowerMsg.length > 250) complexityScore += 1;

    // Multiple sentences suggest complexity
    const sentenceCount = lowerMsg.split(/[.!?。]+/).filter(s => s.trim()).length;
    if (sentenceCount > 2) complexityScore += 1;

    // Complex keywords
    const complexMatches = COMPLEX_KEYWORDS.filter(k => lowerMsg.includes(k));
    complexityScore += complexMatches.length;

    // 3. Determine if RAG is needed
    const ragMatches = RAG_KEYWORDS.filter(k => lowerMsg.includes(k));
    const needsRag = ragMatches.length >= 1;

    // If RAG is needed, bump complexity to at least medium
    if (needsRag && complexityScore < 1) {
        complexityScore = 1;
    }

    // 4. Determine complexity level
    let complexity: ComplexityLevel;
    let modelTier: 'flash' | 'pro';

    if (complexityScore >= 3) {
        complexity = 'complex';
        modelTier = 'pro';
    } else if (complexityScore >= 1) {
        complexity = 'medium';
        modelTier = 'flash'; // Still use flash for medium — it's good enough
    } else {
        complexity = 'simple';
        modelTier = 'flash';
    }

    console.log(`[AI Router] Message: "${lowerMsg.slice(0, 50)}..." → ${complexity} (score: ${complexityScore}, RAG: ${needsRag}, model: ${modelTier})`);

    return { complexity, needsRag, modelTier };
}
