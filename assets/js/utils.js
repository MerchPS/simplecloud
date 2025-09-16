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
    toast.className = `toast ${type} px-4 py-3 rounded-lg shadow-lg flex items-center justify-between max-w-md transition-all duration-300`;
    
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
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100%)';
        setTimeout(() => {
            toast.remove();
        }, 300);
    }, 5000);
    
    // Allow manual dismiss
    const button = toast.querySelector('button');
    if (button) {
        button.addEventListener('click', () => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(100%)';
            setTimeout(() => {
                toast.remove();
            }, 300);
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
        showToast('Server temporarily unavailable. Please try again later.', 'error');
    } else if (error.message && error.message.includes('500')) {
        showToast('Server error. Please try again later.', 'error');
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
            
            // If it's an HTML page (like a 404 error page), throw a specific error
            if (text.trim().startsWith('<!DOCTYPE') || text.trim().startsWith('<html')) {
                throw new Error(`Server returned HTML instead of JSON: ${response.status} ${response.statusText}`);
            }
            
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

// Debounce function for search inputs
export function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Format time ago
export function timeAgo(dateString) {
    if (!dateString) return 'Unknown';
    
    try {
        const date = new Date(dateString);
        const now = new Date();
        const seconds = Math.floor((now - date) / 1000);
        
        if (seconds < 60) return 'just now';
        
        const minutes = Math.floor(seconds / 60);
        if (minutes < 60) return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`;
        
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
        
        const days = Math.floor(hours / 24);
        if (days < 30) return `${days} day${days !== 1 ? 's' : ''} ago`;
        
        const months = Math.floor(days / 30);
        if (months < 12) return `${months} month${months !== 1 ? 's' : ''} ago`;
        
        const years = Math.floor(months / 12);
        return `${years} year${years !== 1 ? 's' : ''} ago`;
    } catch (e) {
        return 'Invalid date';
    }
}

// Validate file name
export function isValidFileName(name) {
    if (!name || name.length === 0) return false;
    
    // Check for invalid characters
    const invalidChars = /[<>:"/\\|?*\x00-\x1F]/;
    if (invalidChars.test(name)) return false;
    
    // Check for reserved names
    const reservedNames = ['CON', 'PRN', 'AUX', 'NUL', 'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9', 'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9'];
    if (reservedNames.includes(name.toUpperCase())) return false;
    
    // Check for trailing periods or spaces
    if (name.trim() !== name) return false;
    if (name.endsWith('.') || name.endsWith(' ')) return false;
    
    return true;
}

// Get file icon based on extension
export function getFileIcon(filename) {
    if (!filename) return 'file';
    
    const extension = filename.split('.').pop().toLowerCase();
    
    const iconMap = {
        // Images
        'jpg': 'image', 'jpeg': 'image', 'png': 'image', 'gif': 'image', 
        'bmp': 'image', 'svg': 'image', 'webp': 'image', 'ico': 'image',
        
        // Documents
        'pdf': 'file-text', 'doc': 'file-text', 'docx': 'file-text', 
        'txt': 'file-text', 'rtf': 'file-text', 'md': 'file-text',
        
        // Spreadsheets
        'xls': 'file-spreadsheet', 'xlsx': 'file-spreadsheet', 'csv': 'file-spreadsheet',
        
        // Presentations
        'ppt': 'presentation', 'pptx': 'presentation',
        
        // Archives
        'zip': 'archive', 'rar': 'archive', '7z': 'archive', 'tar': 'archive', 
        'gz': 'archive', 'bz2': 'archive',
        
        // Code
        'js': 'file-js', 'jsx': 'file-js', 'ts': 'file-js', 'tsx': 'file-js',
        'html': 'file-html', 'htm': 'file-html', 'css': 'file-css', 'scss': 'file-css',
        'php': 'file-php', 'py': 'file-py', 'java': 'file-code', 'c': 'file-code',
        'cpp': 'file-code', 'cs': 'file-code', 'go': 'file-code', 'rb': 'file-code',
        'json': 'file-json', 'xml': 'file-code',
        
        // Audio
        'mp3': 'music', 'wav': 'music', 'ogg': 'music', 'flac': 'music',
        
        // Video
        'mp4': 'video', 'avi': 'video', 'mov': 'video', 'wmv': 'video',
        'flv': 'video', 'webm': 'video', 'mkv': 'video',
        
        // Other
        'exe': 'cpu', 'msi': 'cpu', 'dll': 'settings'
    };
    
    return iconMap[extension] || 'file';
}
