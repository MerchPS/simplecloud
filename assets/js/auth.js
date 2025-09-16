import { showToast, getDeviceFingerprint } from './utils.js';

// Initialize Lucide icons
document.addEventListener('DOMContentLoaded', () => {
    lucide.createIcons();
    
    // Initialize theme
    initTheme();
    
    // Hide loading screen after everything is loaded
    setTimeout(() => {
        document.getElementById('loading-screen').classList.add('opacity-0');
        document.getElementById('main-container').classList.remove('opacity-0', 'scale-95');
        setTimeout(() => {
            document.getElementById('loading-screen').classList.add('hidden');
        }, 500);
    }, 1000);
});

// Theme functionality
function initTheme() {
    const themeToggle = document.getElementById('theme-toggle');
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
document.getElementById('create-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    await handleCreateStorage();
});

document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    await handleLogin();
});

async function handleCreateStorage() {
    const storageId = document.getElementById('create-id').value;
    const password = document.getElementById('create-password').value;
    
    if (!storageId || !password) {
        showToast('Please fill all fields', 'error');
        return;
    }
    
    try {
        const deviceFingerprint = getDeviceFingerprint();
        
        const response = await fetch('/api/auth', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Protection': 'create'
            },
            body: JSON.stringify({
                action: 'create',
                storageId,
                password,
                deviceFingerprint
            })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            showToast('Storage created successfully!', 'success');
            // Auto login after creation
            setTimeout(() => handleLoginAfterCreate(storageId, password), 1500);
        } else {
            showToast(data.error || 'Failed to create storage', 'error');
        }
    } catch (error) {
        console.error('Create storage error:', error);
        showToast('Network error. Please try again.', 'error');
    }
}

async function handleLogin() {
    const storageId = document.getElementById('login-id').value;
    const password = document.getElementById('login-password').value;
    
    if (!storageId || !password) {
        showToast('Please fill all fields', 'error');
        return;
    }
    
    await handleLoginAfterCreate(storageId, password);
}

async function handleLoginAfterCreate(storageId, password) {
    try {
        const deviceFingerprint = getDeviceFingerprint();
        
        const response = await fetch('/api/auth', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Protection': 'login'
            },
            body: JSON.stringify({
                action: 'login',
                storageId,
                password,
                deviceFingerprint
            })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            showToast('Login successful!', 'success');
            // Redirect to dashboard after a brief delay
            setTimeout(() => {
                window.location.href = '/dashboard.html';
            }, 1000);
        } else {
            showToast(data.error || 'Login failed', 'error');
        }
    } catch (error) {
        console.error('Login error:', error);
        showToast('Network error. Please try again.', 'error');
    }
}