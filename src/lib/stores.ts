import { writable, derived } from 'svelte/store';
import type { Brand, Outlet } from './pocketbase';

// Theme store
export const theme = writable<'dark' | 'light'>('dark');

// Data stores
export const brands = writable<Brand[]>([]);
export const outlets = writable<Outlet[]>([]);
export const selectedBrands = writable<Set<string>>(new Set());
export const selectedCategory = writable<string>('All');
export const searchQuery = writable<string>('');

// Loading states
export const isLoading = writable<boolean>(true);

// Derived store for filtered outlets
export const filteredOutlets = derived(
    [outlets, brands, selectedBrands, selectedCategory, searchQuery],
    ([$outlets, $brands, $selectedBrands, $selectedCategory, $searchQuery]) => {
        let result = $outlets;

        // Filter by Category
        if ($selectedCategory !== 'All') {
            // Find brands that belong to the selected category
            const brandsInCategory = new Set($brands.filter(b => b.category === $selectedCategory).map(b => b.id));
            // Filter outlets that belong to those brands
            result = result.filter(outlet => brandsInCategory.has(outlet.brand));
        }

        // Filter by selected brands
        result = result.filter(outlet => $selectedBrands.has(outlet.brand));

        // Filter by search query
        if ($searchQuery.trim()) {
            const query = $searchQuery.toLowerCase();
            result = result.filter(outlet =>
                outlet.name.toLowerCase().includes(query) ||
                outlet.address.toLowerCase().includes(query) ||
                outlet.city.toLowerCase().includes(query) ||
                outlet.region?.toLowerCase().includes(query)
            );
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

// Brand configuration
export const categories = derived(brands, ($brands) => {
    const cats = new Set<string>();
    $brands.forEach(b => {
        if (b.category) cats.add(b.category);
    });
    return ['All', ...Array.from(cats).sort()];
});

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
