import { writable, derived } from 'svelte/store';
import type { Brand, Outlet, Category } from './pocketbase';

// Theme store
export const theme = writable<'dark' | 'light'>('light');

// Data stores
export const brands = writable<Brand[]>([]);
export const outlets = writable<Outlet[]>([]);
export const selectedBrands = writable<Set<string>>(new Set());
export const selectedCategory = writable<string>('All');
export const searchQuery = writable<string>('');

// Loading states
export const isLoading = writable<boolean>(true);

// Map & Navigation stores
export type MapStyleType = 'default' | 'satellite' | 'terrain' | '3d';
export const mapStyle = writable<MapStyleType>('default');
export const userLocation = writable<{ lat: number; lng: number } | null>(null);
export const isNavigating = writable<boolean>(false);
export const navigationTarget = writable<Outlet | null>(null);
export const routeCoordinates = writable<[number, number][]>([]);
export const selectedOutlet = writable<Outlet | null>(null);
export type MapAction =
    | { type: 'fit_bounds'; outletIds?: string[] }
    | { type: 'focus_outlet'; outletId: string }
    | { type: 'open_outlet_detail'; outletId: string }
    | { type: 'navigate_to_outlet'; outletId: string }
    | { type: 'highlight_city'; city: string }
    | { type: 'reset_view' };
export const mapAction = writable<MapAction | null>(null);

// Categories from PocketBase collection (writable, populated on mount)
export const categoriesData = writable<Category[]>([]);

// Derived list of category names for dropdowns (includes 'All')
export const categories = derived(categoriesData, ($cats) => {
    const sorted = [...$cats].sort((a, b) => a.name.localeCompare(b.name));
    return [{ id: 'All', name: 'All' }, ...sorted.map((c) => ({
        id: c.id,
        name: c.name,
    }))];
});

// Derived store for filtered outlets
export const filteredOutlets = derived(
    [outlets, brands, categoriesData, selectedBrands, selectedCategory, searchQuery],
    ([
        $outlets,
        $brands,
        $categoriesData,
        $selectedBrands,
        $selectedCategory,
        $searchQuery,
    ]) => {
        let result = $outlets;
        const categoryById = new Map($categoriesData.map((c) => [c.id, c.name]));
        const categoryIdByName = new Map(
            $categoriesData.map((c) => [c.name, c.id]),
        );

        // 1. Apply Search or Category Filter
        if ($searchQuery.trim()) {
            // Search overrides Category filter
            const query = $searchQuery.toLowerCase();
            result = result.filter(outlet =>
                outlet.name.toLowerCase().includes(query) ||
                outlet.address.toLowerCase().includes(query) ||
                outlet.city.toLowerCase().includes(query) ||
                outlet.region?.toLowerCase().includes(query) ||
                // Also search by brand name
                ($brands.find(b => b.id === outlet.brand)?.name.toLowerCase().includes(query))
            );
        } else if ($selectedCategory !== 'All') {
            // Filter by Category (only if no search)
            const brandsInCategory = new Set(
                $brands
                    .filter((b) => {
                        const categoryId =
                            (b.expand as any)?.category?.id ||
                            (categoryById.has(b.category)
                                ? b.category
                                : categoryIdByName.get(b.category)) ||
                            '';
                        return categoryId === $selectedCategory;
                    })
                    .map((b) => b.id),
            );
            result = result.filter(outlet => brandsInCategory.has(outlet.brand));
        }

        // 2. Filter by Selected Brands (ALWAYS applies)
        // If selectedBrands is empty, we show nothing (as per typical behavior where unchecking all hides all)
        // However, we handle the "select all by default" in +page.svelte
        if ($selectedBrands.size > 0) {
            result = result.filter(outlet => $selectedBrands.has(outlet.brand));
        } else {
            // If nothing selected, return empty
            result = [];
        }

        return result;
    }
);

// Stats derived store
export const stats = derived(
    [outlets, brands],
    ([$outlets, $brands]) => {
        const cities = new Set($outlets.map(o => o.city));
        return {
            totalOutlets: $outlets.length,
            totalBrands: $brands.length,
            totalCities: cities.size
        };
    }
);

export const brandColors: Record<string, { dark: string; light: string }> = {
    'Luuca': { dark: '#f87171', light: '#ef4444' },
    'Barber Smart': { dark: '#34d399', light: '#10b981' },
    'UMC UCMAS Indonesia': { dark: '#fbbf24', light: '#f59e0b' },
    'Laundry Klin': { dark: '#60a5fa', light: '#3b82f6' }
};

export const brandIcons: Record<string, string> = {
    'Luuca': 'fa-mug-hot',
    'Barber Smart': 'fa-scissors',
    'UMC UCMAS Indonesia': 'fa-graduation-cap',
    'Laundry Klin': 'fa-shirt'
};
