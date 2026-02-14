import PocketBase from 'pocketbase';

import { env } from '$env/dynamic/public';

const PB_URL = env.PUBLIC_POCKETBASE_URL || 'http://127.0.0.1:8090';
export const pb = new PocketBase(PB_URL);

// Cache for outlets data
let outletsCache: Outlet[] | null = null;
let outletsCacheTime: number = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// Types for our collections
export interface Brand {
    id: string;
    name: string;
    category: string;
    website: string;
    logo: string;
    color?: string;
    icon?: string;
    total_outlets?: number;
    created: string;
    updated: string;
}

export function getLogoUrl(collectionId: string, recordId: string, fileName: string): string {
    if (!fileName) return '';
    return `${pb.baseUrl}/api/files/${collectionId}/${recordId}/${fileName}`;
}

export interface Outlet {
    id: string;
    brand: string;
    name: string;
    address: string;
    city: string;
    region: string;
    latitude: number;
    longitude: number;
    phone?: string;
    phoneUnformatted?: string;
    totalScore?: number;
    total_score?: number;
    reviewsCount?: number;
    reviews_count?: number;
    imagesCount?: number;
    website?: string;
    imageUrl?: string;
    imageUrls?: string[];
    openingHours?: Array<{ day: string; hours: string }>;
    categories?: string[];
    additionalInfo?: Record<string, any>;
    reviewsDistribution?: Record<string, number>;
    reviewsTags?: Array<{ title: string; count: number }>;
    bookingLinks?: Array<{ name: string; url: string }>;
    peopleAlsoSearch?: Array<{ title: string; category?: string }>;
    popularTimesHistogram?: Record<string, any>;
    plusCode?: string;
    neighborhood?: string;
    subTitle?: string;
    street?: string;
    postalCode?: string;
    postal_code?: string;
    placeId?: string;
    place_id?: string;
    cid?: string;
    fid?: string;
    rank?: number;
    scrapedAt?: string;
    category_name?: string;
    googleMapsUrl?: string;
    created: string;
    updated: string;
    expand?: {
        brand?: Brand;
    };
}

// Optimized: Fetch only needed fields for brands
export async function getBrands(): Promise<Brand[]> {
    try {
        const records = await pb.collection('brands').getFullList<Brand>({
            sort: 'name',
            fields: 'id,name,category,website,logo,color,icon,total_outlets,created,updated'
        });
        return records;
    } catch (error) {
        console.error('Error fetching brands:', error);
        return [];
    }
}

// Optimized: Fetch only essential fields for map display
export async function getOutlets(brandId?: string): Promise<Outlet[]> {
    try {
        const filter = brandId ? `brand = "${brandId}"` : '';
        const records = await pb.collection('outlets').getFullList<any>({
            filter,
            fields: 'id,brand,name,address,city,region,latitude,longitude,phone,totalScore,reviewsCount',
            batch: 500, // Fetch in larger batches
        });
        return records.map(r => ({
            ...r,
            brand: r.brand_id || r.brand
        }));
    } catch (error) {
        console.error('Error fetching outlets:', error);
        return [];
    }
}

// Optimized: Cached fetch with minimal fields
export async function getAllOutletsWithBrands(): Promise<Outlet[]> {
    // Check cache
    const now = Date.now();
    if (outletsCache && (now - outletsCacheTime) < CACHE_DURATION) {
        console.log('Using cached outlets data');
        return outletsCache;
    }

    try {
        console.log('Fetching outlets from API...');
        const startTime = performance.now();

        // Fetch with only essential fields for map
        const records = await pb.collection('outlets').getFullList<any>({
            fields: 'id,brand,name,address,city,region,latitude,longitude,phone,totalScore,reviewsCount',
            batch: 500, // Larger batch for fewer requests
        });

        const outlets = records.map(r => ({
            ...r,
            brand: r.brand_id || r.brand
        }));

        // Update cache
        outletsCache = outlets;
        outletsCacheTime = now;

        console.log(`Fetched ${outlets.length} outlets in ${(performance.now() - startTime).toFixed(0)}ms`);
        return outlets;
    } catch (error) {
        console.error('Error fetching outlets:', error);
        // Return cached data if available on error
        if (outletsCache) return outletsCache;
        return [];
    }
}

// Get single outlet with full details (for detail view)
export async function getOutletDetails(outletId: string): Promise<Outlet | null> {
    try {
        const record = await pb.collection('outlets').getOne(outletId);

        // Helper to ensure full URL for images
        const getFullUrl = (filename: string) => {
            if (!filename) return '';
            if (filename.startsWith('http')) return filename;
            return `${pb.baseUrl}/api/files/outlets/${record.id}/${filename}`;
        };

        const imageUrl = record.imageUrl ? getFullUrl(record.imageUrl) : '';
        const imageUrls = Array.isArray(record.imageUrls)
            ? record.imageUrls
                .filter((url: string) => url && url.trim() !== '')
                .map((url: string) => getFullUrl(url))
            : [];

        return {
            ...record,
            imageUrl,
            imageUrls,
            brand: record.brand_id || record.brand,
            googleMapsUrl: record.placeId || record.place_id
                ? `https://www.google.com/maps/place/?q=place_id:${record.placeId || record.place_id}`
                : `https://www.google.com/maps/search/?api=1&query=${record.latitude},${record.longitude}`
        } as unknown as Outlet;
    } catch (error) {
        console.error('Error fetching outlet details:', error);
        return null;
    }
}

// Clear cache (useful after data updates)
export function clearOutletsCache() {
    outletsCache = null;
    outletsCacheTime = 0;
}

// Subscribe to realtime updates
export function subscribeToOutlets(callback: (data: Outlet) => void) {
    return pb.collection('outlets').subscribe('*', (e) => {
        // Clear cache on any change
        clearOutletsCache();
        callback(e.record as unknown as Outlet);
    });
}

export function unsubscribeFromOutlets() {
    pb.collection('outlets').unsubscribe('*');
}
