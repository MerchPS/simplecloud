// Utility functions

// Show toast notification
export function showToast(message, type = 'info') {
    const toastContainer = document.getElementById('toast-container');
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
    lucide.createIcons();
    
    // Auto remove after 5 seconds
    setTimeout(() => {
        toast.remove();
    }, 5000);
    
    // Allow manual dismiss
    toast.querySelector('button').addEventListener('click', () => {
        toast.remove();
    });
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
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Format date
export function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// Generate a simple CSRF token
export function generateCSRFToken() {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

// Check if user is logged in
export async function checkAuth() {
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
        
        return response.ok;
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
    } else {
        showToast(defaultMessage, 'error');
    }
}
