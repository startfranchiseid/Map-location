import PocketBase from 'pocketbase';

import { PUBLIC_POCKETBASE_URL } from '$env/static/public';

const PB_URL = PUBLIC_POCKETBASE_URL;
export const pb = new PocketBase(PB_URL);

// Types for our collections
// Types for our collections
export interface Brand {
    id: string;
    name: string;
    category: string;
    website: string;
    logo: string; // Filename of the logo
    color?: string; // Keeping optional for now
    icon?: string;  // Keeping optional for now
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
    created: string;
    updated: string;
    expand?: {
        brand?: Brand;
    };
}

// Helper functions
export async function getBrands(): Promise<Brand[]> {
    try {
        const records = await pb.collection('brands').getFullList<Brand>({
            sort: 'name',
        });
        return records;
    } catch (error) {
        console.error('Error fetching brands:', error);
        return [];
    }
}

export async function getOutlets(brandId?: string): Promise<Outlet[]> {
    try {
        const filter = brandId ? `brand_id = "${brandId}"` : '';
        const records = await pb.collection('outlets').getFullList<any>({
            sort: 'name',
            filter,
        });
        // Map brand_id to brand for frontend compatibility
        return records.map(r => ({
            ...r,
            brand: r.brand_id || r.brand // Support both field names
        }));
    } catch (error) {
        console.error('Error fetching outlets:', error);
        return [];
    }
}

export async function getAllOutletsWithBrands(): Promise<Outlet[]> {
    try {
        const records = await pb.collection('outlets').getFullList<any>({});
        // Map brand_id to brand for frontend compatibility
        return records.map(r => ({
            ...r,
            brand: r.brand_id || r.brand // Support both field names
        }));
    } catch (error) {
        console.error('Error fetching outlets:', error);
        return [];
    }
}

// Subscribe to realtime updates
export function subscribeToOutlets(callback: (data: Outlet) => void) {
    return pb.collection('outlets').subscribe('*', (e) => {
        callback(e.record as unknown as Outlet);
    });
}

export function unsubscribeFromOutlets() {
    pb.collection('outlets').unsubscribe('*');
}
