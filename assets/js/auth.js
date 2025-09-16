import { showToast, getDeviceFingerprint, generateCSRFToken, handleApiError, apiFetch } from './utils.js';

// Initialize Lucide icons
document.addEventListener('DOMContentLoaded', () => {
    lucide.createIcons();
    
    // Initialize theme
    initTheme();
    
    // Hide loading screen after everything is loaded
    setTimeout(() => {
        const loadingScreen = document.getElementById('loading-screen');
        const mainContainer = document.getElementById('main-container');
        
        if (loadingScreen) loadingScreen.classList.add('opacity-0');
        if (mainContainer) mainContainer.classList.remove('opacity-0', 'scale-95');
        
        setTimeout(() => {
            if (loadingScreen) loadingScreen.classList.add('hidden');
        }, 500);
    }, 1000);
});

// Theme functionality
function initTheme() {
    const themeToggle = document.getElementById('theme-toggle');
    if (!themeToggle) return;
    
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const savedTheme = localStorage.getItem('theme');
    
    // Set initial theme
    if (savedTheme === 'dark' || (!savedTheme && prefersDark)) {
        document.documentElement.classList.add('dark');
    } else {
        document.documentElement.classList.remove('dark');
    }
    
    // Theme toggle event
    themeToggle.addEventListener('click', () => {
        if (document.documentElement.classList.contains('dark')) {
            document.documentElement.classList.remove('dark');
            localStorage.setItem('theme', 'light');
        } else {
            document.documentElement.classList.add('dark');
            localStorage.setItem('theme', 'dark');
        }
        lucide.createIcons(); // Refresh icons to show correct ones
    });
}

// Form handling
const createForm = document.getElementById('create-form');
const loginForm = document.getElementById('login-form');

if (createForm) {
    createForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        await handleCreateStorage();
    });
}

if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        await handleLogin();
    });
}

async function handleCreateStorage() {
    const storageIdInput = document.getElementById('create-id');
    const passwordInput = document.getElementById('create-password');
    
    if (!storageIdInput || !passwordInput) return;
    
    const storageId = storageIdInput.value;
    const password = passwordInput.value;
    
    if (!storageId || !password) {
        showToast('Please fill all fields', 'error');
        return;
    }
    
    try {
        const deviceFingerprint = getDeviceFingerprint();
        
        const { success, data, error } = await apiFetch('/api/auth', {
            method: 'POST',
            body: JSON.stringify({
                action: 'create',
                storageId,
                password,
                deviceFingerprint
            }),
            csrfToken: 'create'
        });
        
        if (success) {
            showToast('Storage created successfully!', 'success');
            // Auto login after creation
            setTimeout(() => handleLoginAfterCreate(storageId, password), 1500);
        } else {
            showToast(error || 'Failed to create storage', 'error');
        }
    } catch (error) {
        handleApiError(error, 'Failed to create storage');
    }
}

async function handleLogin() {
    const storageIdInput = document.getElementById('login-id');
    const passwordInput = document.getElementById('login-password');
    
    if (!storageIdInput || !passwordInput) return;
    
    const storageId = storageIdInput.value;
    const password = passwordInput.value;
    
    if (!storageId || !password) {
        showToast('Please fill all fields', 'error');
        return;
    }
    
    await handleLoginAfterCreate(storageId, password);
}

async function handleLoginAfterCreate(storageId, password) {
    try {
        const deviceFingerprint = getDeviceFingerprint();
        
        const { success, data, error } = await apiFetch('/api/auth', {
            method: 'POST',
            body: JSON.stringify({
                action: 'login',
                storageId,
                password,
                deviceFingerprint
            }),
            csrfToken: 'login'
        });
        
        if (success) {
            showToast('Login successful!', 'success');
            // Redirect to dashboard after a brief delay
            setTimeout(() => {
                window.location.href = '/dashboard.html';
            }, 1000);
        } else {
            showToast(error || 'Login failed', 'error');
        }
    } catch (error) {
        handleApiError(error, 'Login failed');
    }
}
