// RAG Pipeline — retrieve relevant brand/outlet data from PocketBase
// Builds compact context chunks to inject into AI prompts

import { env } from '$env/dynamic/private';
import PocketBase from 'pocketbase';

const PB_URL = env.PUBLIC_POCKETBASE_URL || 'https://pocketbase.startfranchise.id';

// Simple intent extraction patterns
const CITY_PATTERNS = [
    'jakarta', 'surabaya', 'bandung', 'medan', 'semarang', 'makassar',
    'palembang', 'tangerang', 'depok', 'bekasi', 'bogor', 'malang',
    'yogyakarta', 'jogja', 'solo', 'denpasar', 'bali', 'batam',
    'pekanbaru', 'lampung', 'pontianak', 'banjarmasin', 'manado',
    'padang', 'cirebon', 'surakarta', 'balikpapan', 'samarinda',
];

interface RagContext {
    text: string;
    sources: string[];
}

/**
 * Extract search intent from user message.
 */
function extractIntent(message: string): {
    brandQuery: string | null;
    cityQuery: string | null;
    categoryQuery: string | null;
    wantsStats: boolean;
} {
    const lower = message.toLowerCase();

    // Extract city mentions
    const cityQuery = CITY_PATTERNS.find(city => lower.includes(city)) || null;

    // Extract brand mentions (will be matched against DB)
    // Look for quoted names or capitalized words
    const brandMatch = message.match(/[""]([^""]+)[""]/) ||
        message.match(/brand\s+(\w+)/i) ||
        message.match(/franchise\s+(\w+)/i);
    const brandQuery = brandMatch ? brandMatch[1] : null;

    // Category detection
    const categories = ['pendidikan', 'education', 'makanan', 'food', 'minuman', 'beverage',
        'laundry', 'salon', 'barber', 'kecantikan', 'beauty', 'kesehatan', 'health'];
    const categoryQuery = categories.find(cat => lower.includes(cat)) || null;

    // Stats detection
    const wantsStats = /berapa|jumlah|total|how many|count|statistik|data/i.test(lower);

    return { brandQuery, cityQuery, categoryQuery, wantsStats };
}

/**
 * Query PocketBase for relevant data based on intent.
 */
export async function getRelevantContext(message: string): Promise<RagContext> {
    const intent = extractIntent(message);
    const pb = new PocketBase(PB_URL);
    const chunks: string[] = [];
    const sources: string[] = [];

    try {
        // 1. Fetch brand data (always useful for context)
        const brands = await pb.collection('brands').getFullList({
            sort: 'name',
            fields: 'id,name,category,website,total_outlets',
        });

        // 2. If specific brand is mentioned, find it
        if (intent.brandQuery) {
            const matchedBrand = brands.find(b =>
                b.name.toLowerCase().includes(intent.brandQuery!.toLowerCase())
            );

            if (matchedBrand) {
                // Fetch outlets for this brand
                const outlets = await pb.collection('outlets').getList(1, 10, {
                    filter: `brand = "${matchedBrand.id}"`,
                    fields: 'id,name,address,city,region,totalScore,reviewsCount',
                    sort: '-totalScore',
                });

                chunks.push(`**Brand: ${matchedBrand.name}**`);
                chunks.push(`- Kategori: ${matchedBrand.category || 'Umum'}`);
                chunks.push(`- Website: ${matchedBrand.website || '-'}`);
                chunks.push(`- Total outlet: ${matchedBrand.total_outlets || outlets.totalItems}`);
                chunks.push(`- Outlet terdaftar di database: ${outlets.totalItems}`);

                if (outlets.items.length > 0) {
                    chunks.push(`\nBeberapa outlet ${matchedBrand.name}:`);
                    for (const o of outlets.items) {
                        const score = o.totalScore ? ` (Rating: ${o.totalScore}/5)` : '';
                        chunks.push(`  - ${o.name}, ${o.city || ''}${o.region ? ', ' + o.region : ''}${score}`);
                    }
                }

                sources.push(`Brand: ${matchedBrand.name}`);
            }
        }

        // 3. If city is mentioned, find outlets there
        if (intent.cityQuery) {
            const cityOutlets = await pb.collection('outlets').getList(1, 10, {
                filter: `city ~ "${intent.cityQuery}"`,
                fields: 'id,name,brand,address,city,totalScore',
                sort: '-totalScore',
                expand: 'brand',
            });

            if (cityOutlets.items.length > 0) {
                chunks.push(`\n**Outlet di ${intent.cityQuery.charAt(0).toUpperCase() + intent.cityQuery.slice(1)}:**`);
                for (const o of cityOutlets.items) {
                    const brandName = (o.expand as any)?.brand?.name || 'Unknown';
                    const score = o.totalScore ? ` (Rating: ${o.totalScore}/5)` : '';
                    chunks.push(`  - ${o.name} (${brandName}), ${o.address || o.city}${score}`);
                }
                chunks.push(`Total outlet di kota ini: ${cityOutlets.totalItems}`);
                sources.push(`City: ${intent.cityQuery}`);
            }
        }

        // 4. If category mentioned, filter brands
        if (intent.categoryQuery) {
            const catBrands = brands.filter(b =>
                b.category?.toLowerCase().includes(intent.categoryQuery!)
            );
            if (catBrands.length > 0) {
                chunks.push(`\n**Brand kategori "${intent.categoryQuery}":**`);
                for (const b of catBrands) {
                    chunks.push(`  - ${b.name} (${b.total_outlets || '?'} outlet)`);
                }
                sources.push(`Category: ${intent.categoryQuery}`);
            }
        }

        // 5. General stats if requested or if no specific query
        if (intent.wantsStats || chunks.length === 0) {
            const totalOutlets = await pb.collection('outlets').getList(1, 1, {
                fields: 'id',
            });

            chunks.push(`\n**Statistik Brand Map Indonesia:**`);
            chunks.push(`- Total brand: ${brands.length}`);
            chunks.push(`- Total outlet di database: ${totalOutlets.totalItems}`);

            // List all brands
            chunks.push(`\nDaftar brand:`);
            for (const b of brands) {
                chunks.push(`  - ${b.name} (${b.category || 'Umum'}, ${b.total_outlets || '?'} outlet)`);
            }
            sources.push('General stats');
        }

    } catch (error) {
        console.error('[RAG] Error fetching data from PocketBase:', error);
        chunks.push('(Data dari database tidak tersedia saat ini)');
    }

    return {
        text: chunks.join('\n'),
        sources,
    };
}
