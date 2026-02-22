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

type UserLocation = { lat: number; lng: number };

type BrandRecord = {
    id: string;
    name: string;
    category?: string;
    website?: string;
    total_outlets?: number;
    expand?: {
        category?: {
            id: string;
            name: string;
        };
    };
};

type OutletRecord = {
    id: string;
    name: string;
    address?: string;
    city?: string;
    region?: string;
    latitude?: number;
    longitude?: number;
    brand?: string;
    totalScore?: number;
    expand?: { brand?: { name?: string } };
};

export interface AiAction {
    type:
        | 'set_search'
        | 'set_category'
        | 'set_brand'
        | 'clear_filters'
        | 'focus_outlet'
        | 'open_outlet_detail'
        | 'navigate_to_outlet'
        | 'highlight_city'
        | 'fit_bounds'
        | 'reset_view';
    label: string;
    value?: string;
    brandId?: string;
    outletId?: string;
    city?: string;
}

/**
 * Extract search intent from user message.
 */
function extractIntent(message: string): {
    brandQuery: string | null;
    cityQuery: string | null;
    categoryQuery: string | null;
    wantsStats: boolean;
    wantsNearest: boolean;
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

    const wantsNearest = /terdekat|dekat|sekitar|nearest|closest|nearby/i.test(lower);

    return { brandQuery, cityQuery, categoryQuery, wantsStats, wantsNearest };
}

function detectBrandQuery(message: string, brands: BrandRecord[]): string | null {
    const lower = message.toLowerCase();
    const sorted = [...brands].sort(
        (a, b) => (b.name?.length || 0) - (a.name?.length || 0),
    );
    const match = sorted.find((b) => lower.includes(b.name.toLowerCase()));
    return match ? match.name : null;
}

function toTitleCase(value: string): string {
    return value
        .split(' ')
        .map(part => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
}

function toRadians(value: number): number {
    return (value * Math.PI) / 180;
}

function haversineKm(a: UserLocation, b: UserLocation): number {
    const r = 6371;
    const dLat = toRadians(b.lat - a.lat);
    const dLng = toRadians(b.lng - a.lng);
    const lat1 = toRadians(a.lat);
    const lat2 = toRadians(b.lat);
    const h =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.sin(dLng / 2) *
            Math.sin(dLng / 2) *
            Math.cos(lat1) *
            Math.cos(lat2);
    return 2 * r * Math.asin(Math.sqrt(h));
}

function buildFilter(
    intent: ReturnType<typeof extractIntent>,
    brands: BrandRecord[],
): string | undefined {
    const parts: string[] = [];

    if (intent.brandQuery) {
        const matchedBrand = brands.find(b =>
            b.name.toLowerCase().includes(intent.brandQuery!.toLowerCase()),
        );
        if (matchedBrand) {
            parts.push(`brand = "${matchedBrand.id}"`);
        }
    }

    if (intent.categoryQuery) {
        const matchedBrandIds = brands
            .filter((b) =>
                b.expand?.category?.name
                    ?.toLowerCase()
                    .includes(intent.categoryQuery!),
            )
            .map(b => b.id);
        if (matchedBrandIds.length > 0) {
            parts.push(
                `(${matchedBrandIds.map(id => `brand = "${id}"`).join(' || ')})`,
            );
        }
    }

    if (intent.cityQuery) {
        parts.push(`city ~ "${intent.cityQuery}"`);
    }

    return parts.length > 0 ? parts.join(' && ') : undefined;
}

async function getNearestOutlets(
    pb: PocketBase,
    intent: ReturnType<typeof extractIntent>,
    brands: BrandRecord[],
    userLocation: UserLocation,
) {
    const filter = buildFilter(intent, brands);
    const options: Record<string, any> = {
        fields:
            'id,name,address,city,region,latitude,longitude,brand,totalScore',
        expand: 'brand',
    };
    if (filter) {
        options.filter = filter;
    }
    const outlets = await pb
        .collection('outlets')
        .getFullList<OutletRecord>(options);

    return outlets
        .filter(o => typeof o.latitude === 'number' && typeof o.longitude === 'number')
        .map(o => ({
            outlet: o,
            distanceKm: haversineKm(userLocation, {
                lat: o.latitude!,
                lng: o.longitude!,
            }),
        }))
        .sort((a, b) => a.distanceKm - b.distanceKm);
}

export async function getSuggestedActions(
    message: string,
    userLocation?: UserLocation | null,
): Promise<AiAction[]> {
    const intent = extractIntent(message);
    const actions: AiAction[] = [];
    const pb = new PocketBase(PB_URL);

    let brands: BrandRecord[] = [];
    try {
        brands = await pb.collection('brands').getFullList<BrandRecord>({
            sort: 'name',
            fields: 'id,name,category',
            expand: 'category',
        });
    } catch {
        brands = [];
    }

    if (intent.cityQuery) {
        const cityName = toTitleCase(intent.cityQuery);
        actions.push({
            type: 'set_search',
            value: intent.cityQuery,
            label: `Tampilkan outlet di ${cityName}`,
        });
        actions.push({
            type: 'highlight_city',
            city: intent.cityQuery,
            label: `Sorot area ${cityName}`,
        });

        try {
            const cityOutlets = await pb.collection('outlets').getList(1, 3, {
                filter: `city ~ "${intent.cityQuery}"`,
                fields: 'id,name,city,totalScore',
                sort: '-totalScore',
            });
            if (cityOutlets.items.length > 0) {
                const top = cityOutlets.items[0];
                actions.push({
                    type: 'focus_outlet',
                    outletId: top.id,
                    label: `Fokus ke ${top.name}`,
                });
                actions.push({
                    type: 'open_outlet_detail',
                    outletId: top.id,
                    label: `Buka detail ${top.name}`,
                });
                actions.push({
                    type: 'navigate_to_outlet',
                    outletId: top.id,
                    label: `Navigasi ke ${top.name}`,
                });
            }
        } catch {
            // ignore
        }
    }

    let brandQuery = intent.brandQuery;
    if (!brandQuery && brands.length > 0) {
        brandQuery = detectBrandQuery(message, brands);
    }

    if (brandQuery && brands.length > 0) {
        const matchedBrand = brands.find(b =>
            b.name.toLowerCase().includes(brandQuery!.toLowerCase())
        );
        if (matchedBrand) {
            actions.push({
                type: 'set_brand',
                brandId: matchedBrand.id,
                label: `Filter brand ${matchedBrand.name}`,
            });
            try {
                const brandOutlets = await pb.collection('outlets').getList(1, 3, {
                    filter: `brand = "${matchedBrand.id}"`,
                    fields: 'id,name,city,totalScore',
                    sort: '-totalScore',
                });
                if (brandOutlets.items.length > 0) {
                    const top = brandOutlets.items[0];
                    actions.push({
                        type: 'open_outlet_detail',
                        outletId: top.id,
                        label: `Detail outlet ${top.name}`,
                    });
                }
            } catch {
                // ignore
            }
        }
    }

    if (intent.categoryQuery && brands.length > 0) {
        const categoryNameToId = new Map(
            brands
                .map((b) => {
                    const name = b.expand?.category?.name;
                    const id = b.expand?.category?.id;
                    return name && id ? [name, id] : null;
                })
                .filter(Boolean) as [string, string][],
        );
        const categories = Array.from(categoryNameToId.keys());
        const matchedCategory = categories.find((c) =>
            c.toLowerCase().includes(intent.categoryQuery!),
        );
        if (matchedCategory) {
            actions.push({
                type: 'set_category',
                value: categoryNameToId.get(matchedCategory),
                label: `Filter kategori ${matchedCategory}`,
            });
        }
    }

    if (intent.wantsNearest && userLocation) {
        try {
            const intentWithBrand = brandQuery
                ? { ...intent, brandQuery }
                : intent;
            const nearest = await getNearestOutlets(
                pb,
                intentWithBrand,
                brands,
                userLocation,
            );
            const top = nearest[0]?.outlet;
            if (top?.id) {
                actions.push({
                    type: 'focus_outlet',
                    outletId: top.id,
                    label: `Fokus ke ${top.name}`,
                });
                actions.push({
                    type: 'open_outlet_detail',
                    outletId: top.id,
                    label: `Buka detail ${top.name}`,
                });
                actions.push({
                    type: 'navigate_to_outlet',
                    outletId: top.id,
                    label: `Navigasi ke ${top.name}`,
                });
            }
        } catch {}
    }

    if (actions.length > 0) {
        actions.push({
            type: 'fit_bounds',
            label: 'Sesuaikan peta ke hasil',
        });
        actions.push({
            type: 'reset_view',
            label: 'Reset tampilan peta',
        });
        actions.push({
            type: 'clear_filters',
            label: 'Reset filter',
        });
    }

    return actions;
}

/**
 * Query PocketBase for relevant data based on intent.
 */
export async function getRelevantContext(
    message: string,
    userLocation?: UserLocation | null,
): Promise<RagContext> {
    const intent = extractIntent(message);
    const pb = new PocketBase(PB_URL);
    const chunks: string[] = [];
    const sources: string[] = [];

    try {
        // 1. Fetch brand data (always useful for context)
        const brands = await pb.collection('brands').getFullList<BrandRecord>({
            sort: 'name',
            fields: 'id,name,category,website,total_outlets',
            expand: 'category',
        });

        let brandQuery = intent.brandQuery;
        if (!brandQuery) {
            brandQuery = detectBrandQuery(message, brands);
        }

        // 2. If specific brand is mentioned, find it
        if (brandQuery) {
            const matchedBrand = brands.find(b =>
                b.name.toLowerCase().includes(brandQuery!.toLowerCase())
            );

            if (matchedBrand) {
                // Fetch outlets for this brand
                const outlets = await pb.collection('outlets').getList(1, 10, {
                    filter: `brand = "${matchedBrand.id}"`,
                    fields: 'id,name,address,city,region,totalScore,reviewsCount',
                    sort: '-totalScore',
                });

                const categoryName =
                    matchedBrand.expand?.category?.name || 'Umum';
                chunks.push(`**Brand: ${matchedBrand.name}**`);
                chunks.push(`- Kategori: ${categoryName}`);
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
            const catBrands = brands.filter((b) =>
                b.expand?.category?.name
                    ?.toLowerCase()
                    .includes(intent.categoryQuery!),
            );
            if (catBrands.length > 0) {
                chunks.push(`\n**Brand kategori "${intent.categoryQuery}":**`);
                for (const b of catBrands) {
                    const categoryName = b.expand?.category?.name || 'Umum';
                    chunks.push(
                        `  - ${b.name} (${categoryName}, ${b.total_outlets || '?'} outlet)`,
                    );
                }
                sources.push(`Category: ${intent.categoryQuery}`);
            }
        }

        if (intent.wantsNearest && userLocation) {
            try {
                const intentWithBrand = brandQuery
                    ? { ...intent, brandQuery }
                    : intent;
                const nearest = await getNearestOutlets(
                    pb,
                    intentWithBrand,
                    brands,
                    userLocation,
                );
                if (nearest.length > 0) {
                    chunks.push(`\n**Outlet terdekat dari lokasi Anda:**`);
                    for (const item of nearest.slice(0, 5)) {
                        const o = item.outlet;
                        const brandName =
                            o.expand?.brand?.name || 'Unknown';
                        const place =
                            `${o.city || ''}${o.region ? ', ' + o.region : ''}`.trim();
                        const address =
                            o.address || place || 'Lokasi tidak tersedia';
                        chunks.push(
                            `  - ${o.name} (${brandName}), ${address} — ${item.distanceKm.toFixed(1)} km`,
                        );
                    }
                    sources.push('Nearest outlets');
                }
            } catch (error) {
                console.error('[RAG] Nearest lookup failed:', error);
            }
        }

        // 5. General stats if requested or if no specific query
        if (intent.wantsStats || chunks.length === 0) {
            const totalOutlets = await pb.collection('outlets').getList(1, 1, {
                fields: 'id',
            });

            chunks.push(`\n**Statistik Map Start Franchise Indonesia:**`);
            chunks.push(`- Total brand: ${brands.length}`);
            chunks.push(`- Total outlet di database: ${totalOutlets.totalItems}`);

            // List all brands
            chunks.push(`\nDaftar brand:`);
            for (const b of brands) {
                const categoryName = b.expand?.category?.name || 'Umum';
                chunks.push(
                    `  - ${b.name} (${categoryName}, ${b.total_outlets || '?'} outlet)`,
                );
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
