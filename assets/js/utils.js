// Utility functions

// Show toast notification
export function showToast(message, type = 'info') {
    const toastContainer = document.getElementById('toast-container');
    if (!toastContainer) {
        // Create toast container if it doesn't exist
        const container = document.createElement('div');
        container.id = 'toast-container';
        container.className = 'fixed top-4 right-4 z-50 space-y-2';
        document.body.appendChild(container);
        return showToast(message, type); // Retry
    }
    
    const toast = document.createElement('div');
    toast.className = `toast ${type} px-4 py-3 rounded-lg shadow-lg flex items-center justify-between max-w-md`;
    
    toast.innerHTML = `
        <div class="flex items-center">
            <i data-lucide="${getToastIcon(type)}" class="w-5 h-5 mr-2"></i>
            <span>${message}</span>
        </div>
        <button class="ml-4 text-white opacity-70 hover:opacity-100">
            <i data-lucide="x" class="w-4 h-4"></i>
        </button>
    `;
    
    toastContainer.appendChild(toast);
    
    // Initialize icons if Lucide is available
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
    
    // Auto remove after 5 seconds
    setTimeout(() => {
        toast.remove();
    }, 5000);
    
    // Allow manual dismiss
    const button = toast.querySelector('button');
    if (button) {
        button.addEventListener('click', () => {
            toast.remove();
        });
    }
}

function getToastIcon(type) {
    switch (type) {
        case 'success': return 'check-circle';
        case 'error': return 'alert-circle';
        case 'warning': return 'alert-triangle';
        default: return 'info';
    }
}

// Get device fingerprint
export function getDeviceFingerprint() {
    // Check if screen object is available (for SSR compatibility)
    const screenInfo = typeof screen !== 'undefined' ? `${screen.width}x${screen.height}` : 'unknown';
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const language = navigator.language;
    const platform = navigator.platform;
    
    return {
        userAgent: navigator.userAgent,
        screen: screenInfo,
        timezone,
        language,
        platform,
        // Add more properties as needed
    };
}

// Format file size
export function formatFileSize(bytes) {
    if (!bytes || bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Format date
export function formatDate(dateString) {
    if (!dateString) return 'Unknown';
    
    try {
        const date = new Date(dateString);
        return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch (e) {
        return 'Invalid date';
    }
}

// Generate a simple CSRF token
export function generateCSRFToken() {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

// Check if user is logged in (demo version)
export async function checkAuth() {
    // For demo purposes, check localStorage
    const currentUser = localStorage.getItem('cloudstorage_current_user');
    if (currentUser) {
        return true;
    }
    
    // Try to check with real API
    try {
        const response = await fetch('/api/auth', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Token': 'verify'
            },
            body: JSON.stringify({
                action: 'verify'
            })
        });
        
        // Check if response is JSON
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
            const data = await response.json();
            return response.ok;
        } else {
            // If not JSON, it's likely an error
            return false;
        }
    } catch (error) {
        console.error('Auth check error:', error);
        return false;
    }
}

// Handle API errors
export function handleApiError(error, defaultMessage = 'An error occurred') {
    console.error('API Error:', error);
    
    if (error instanceof TypeError && error.message === 'Failed to fetch') {
        showToast('Network error. Please check your connection.', 'error');
    } else if (error.response && error.response.status === 401) {
        showToast('Session expired. Please login again.', 'error');
        // Redirect to login after a delay
        setTimeout(() => {
            window.location.href = '/';
        }, 2000);
    } else if (error.message && error.message.includes('404')) {
        showToast('Server temporarily unavailable. Using demo mode.', 'warning');
    } else {
        showToast(defaultMessage, 'error');
    }
}

// Improved fetch with better error handling
export async function apiFetch(url, options = {}) {
    try {
        const response = await fetch(url, {
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Token': options.csrfToken || 'default',
                ...options.headers
            },
            ...options
        });
        
        // Check if response is JSON
        const contentType = response.headers.get('content-type');
        let data;
        
        if (contentType && contentType.includes('application/json')) {
            data = await response.json();
        } else {
            // If not JSON, get the text response
            const text = await response.text();
            throw new Error(`Server returned non-JSON response: ${response.status} ${response.statusText}`);
        }
        
        if (!response.ok) {
            throw new Error(data.error || `Server error: ${response.status}`);
        }
        
        return { success: true, data };
    } catch (error) {
        console.error('API fetch error:', error);
        return { success: false, error: error.message };
    }
}

// Demo mode data functions
export function getDemoStorage() {
    const currentUser = localStorage.getItem('cloudstorage_current_user');
    if (!currentUser) return null;
    
    const users = JSON.parse(localStorage.getItem('cloudstorage_users') || '{}');
    return users[currentUser] ? users[currentUser].storage : {
        files: [],
        folders: [
            {
                id: 'root',
                name: 'Home',
                path: '/',
                children: []
            }
        ]
    };
}

export function saveDemoStorage(storageData) {
    const currentUser = localStorage.getItem('cloudstorage_current_user');
    if (!currentUser) return false;
    
    const users = JSON.parse(localStorage.getItem('cloudstorage_users') || '{}');
    if (users[currentUser]) {
        users[currentUser].storage = storageData;
        localStorage.setItem('cloudstorage_users', JSON.stringify(users));
        return true;
    }
    
    return false;
}
