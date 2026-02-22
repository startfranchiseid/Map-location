import { writable } from 'svelte/store';
import { browser } from '$app/environment';

const ADMIN_EMAIL = 'startfranchise.id@gmail.com';
const ADMIN_PASSWORD = 'Admin.startfranchise@123';
const AUTH_KEY = 'brandmap-admin-auth';

interface AdminUser {
    email: string;
    name: string;
    role: string;
}

function createAuthStore() {
    // Load from localStorage
    let initial = false;
    let initialUser: AdminUser | null = null;

    if (browser) {
        try {
            const saved = localStorage.getItem(AUTH_KEY);
            if (saved) {
                const parsed = JSON.parse(saved);
                initial = parsed.isAuthenticated || false;
                initialUser = parsed.user || null;
            }
        } catch { }
    }

    const isAuthenticated = writable<boolean>(initial);
    const adminUser = writable<AdminUser | null>(initialUser);

    function persist(auth: boolean, user: AdminUser | null) {
        if (browser) {
            localStorage.setItem(AUTH_KEY, JSON.stringify({ isAuthenticated: auth, user }));
        }
    }

    function login(email: string, password: string): { success: boolean; error?: string } {
        if (email === ADMIN_EMAIL && password === ADMIN_PASSWORD) {
            const user: AdminUser = {
                email: ADMIN_EMAIL,
                name: 'Admin',
                role: 'Super Admin'
            };
            isAuthenticated.set(true);
            adminUser.set(user);
            persist(true, user);
            return { success: true };
        }
        return { success: false, error: 'Email atau password salah' };
    }

    function logout() {
        isAuthenticated.set(false);
        adminUser.set(null);
        persist(false, null);
    }

    return {
        isAuthenticated,
        adminUser,
        login,
        logout
    };
}

export const auth = createAuthStore();
