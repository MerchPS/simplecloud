import { showToast, getDeviceFingerprint, formatFileSize, formatDate, checkAuth, handleApiError, apiFetch } from './utils.js';

// Global state
let currentPath = [];
let currentFiles = [];
let currentFolders = [];
let selectedItem = null;

// Initialize the application
document.addEventListener('DOMContentLoaded', async () => {
    // Initialize icons
    lucide.createIcons();
    
    // Initialize theme
    initTheme();
    
    // Check if user is authenticated
    if (!await checkAuth()) {
        window.location.href = '/';
        return;
    }
    
    // Set up event listeners
    setupEventListeners();
    
    // Load initial data
    await loadFileManagerData();
    
    // Hide loading screen
    setTimeout(() => {
        document.getElementById('loading-screen').classList.add('opacity-0');
        document.getElementById('app-container').classList.remove('opacity-0');
        setTimeout(() => {
            document.getElementById('loading-screen').classList.add('hidden');
        }, 500);
    }, 1000);
});

// Initialize theme (same as in auth.js)
function initTheme() {
    const themeToggle = document.getElementById('theme-toggle');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const savedTheme = localStorage.getItem('theme');
    
    if (savedTheme === 'dark' || (!savedTheme && prefersDark)) {
        document.documentElement.classList.add('dark');
    } else {
        document.documentElement.classList.remove('dark');
    }
    
    themeToggle.addEventListener('click', () => {
        if (document.documentElement.classList.contains('dark')) {
            document.documentElement.classList.remove('dark');
            localStorage.setItem('theme', 'light');
        } else {
            document.documentElement.classList.add('dark');
            localStorage.setItem('theme', 'dark');
        }
        lucide.createIcons();
    });
}

// Set up all event listeners
function setupEventListeners() {
    // Sidebar toggle for mobile
    document.getElementById('sidebar-toggle').addEventListener('click', () => {
        const sidebar = document.getElementById('sidebar');
        sidebar.classList.toggle('-translate-x-full');
    });
    
    // Logout button
    document.getElementById('logout-btn').addEventListener('click', () => {
        // Clear session and redirect
        document.cookie = 'token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
        window.location.href = '/';
    });
    
    // Upload button
    document.getElementById('upload-file-btn').addEventListener('click', () => {
        const uploadArea = document.getElementById('upload-area');
        uploadArea.classList.toggle('hidden');
    });
    
    // File input
    document.getElementById('file-input').addEventListener('change', handleFileUpload);
    
    // Drag and drop
    const uploadArea = document.getElementById('upload-area');
    if (uploadArea) {
        uploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadArea.classList.add('drag-over');
        });
        
        uploadArea.addEventListener('dragleave', () => {
            uploadArea.classList.remove('drag-over');
        });
        
        uploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadArea.classList.remove('drag-over');
            handleDroppedFiles(e.dataTransfer.files);
        });
    }
    
    // Create folder modal
    document.getElementById('create-folder-btn').addEventListener('click', () => {
        showModal('create-folder-modal');
    });
    
    document.getElementById('cancel-create-folder').addEventListener('click', () => {
        hideModal('create-folder-modal');
    });
    
    document.getElementById('confirm-create-folder').addEventListener('click', createNewFolder);
    
    // Rename modal
    document.getElementById('cancel-rename').addEventListener('click', () => {
        hideModal('rename-modal');
    });
    
    document.getElementById('confirm-rename').addEventListener('click', renameItem);
    
    // Delete modal
    document.getElementById('cancel-delete').addEventListener('click', () => {
        hideModal('delete-modal');
    });
    
    document.getElementById('confirm-delete').addEventListener('click', deleteItem);
}

// Load file manager data using the improved apiFetch
async function loadFileManagerData() {
    try {
        const deviceFingerprint = getDeviceFingerprint();
        
        const { success, data, error } = await apiFetch('/api/jsonbin', {
            method: 'POST',
            body: JSON.stringify({
                action: 'getStorage',
                deviceFingerprint
            }),
            csrfToken: 'read'
        });
        
        if (success) {
            currentFiles = data.files || [];
            currentFolders = data.folders || [];
            updateBreadcrumb();
            renderFileList();
            renderFolderTree();
        } else {
            showToast(error || 'Failed to load storage data', 'error');
        }
    } catch (error) {
        handleApiError(error, 'Failed to load data');
    }
}

// Render file list
function renderFileList() {
    const fileList = document.getElementById('file-list');
    const emptyState = document.getElementById('empty-state');
    
    if (!fileList || !emptyState) return;
    
    // Clear current list
    fileList.innerHTML = '';
    
    if (currentFiles.length === 0 && currentFolders.length === 0) {
        emptyState.classList.remove('hidden');
        return;
    }
    
    emptyState.classList.add('hidden');
    
    // Render folders first
    currentFolders.forEach(folder => {
        const row = document.createElement('tr');
        row.className = 'folder-item';
        row.innerHTML = `
            <td class="px-6 py-4 whitespace-nowrap">
                <div class="flex items-center">
                    <i data-lucide="folder" class="w-5 h-5 text-yellow-500 mr-2"></i>
                    <span class="text-sm font-medium text-gray-900 dark:text-gray-100">${folder.name}</span>
                </div>
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">—</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">${formatDate(folder.modified)}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm font-medium">
                <button class="text-indigo-600 hover:text-indigo-900 dark:text-indigo-400 dark:hover:text-indigo-300 mr-3 rename-btn" data-type="folder" data-id="${folder.id}">Rename</button>
                <button class="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300 delete-btn" data-type="folder" data-id="${folder.id}">Delete</button>
            </td>
        `;
        fileList.appendChild(row);
        
        // Add click event to navigate into folder
        const folderElement = row.querySelector('.flex.items-center');
        if (folderElement) {
            folderElement.addEventListener('click', () => {
                navigateToFolder(folder.id, folder.name);
            });
        }
    });
    
    // Then render files
    currentFiles.forEach(file => {
        const row = document.createElement('tr');
        row.className = 'file-item';
        
        // Get file icon based on type
        let fileIcon = 'file';
        if (file.type && file.type.includes('image')) fileIcon = 'image';
        else if (file.type && file.type.includes('pdf')) fileIcon = 'file-text';
        else if (file.type && file.type.includes('zip')) fileIcon = 'archive';
        else if (file.type && file.type.includes('text')) fileIcon = 'file-text';
        
        row.innerHTML = `
            <td class="px-6 py-4 whitespace-nowrap">
                <div class="flex items-center">
                    <i data-lucide="${fileIcon}" class="w-5 h-5 text-blue-500 mr-2"></i>
                    <span class="text-sm font-medium text-gray-900 dark:text-gray-100">${file.name}</span>
                </div>
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">${formatFileSize(file.size)}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">${formatDate(file.modified)}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm font-medium">
                <button class="text-indigo-600 hover:text-indigo-900 dark:text-indigo-400 dark:hover:text-indigo-300 mr-3 download-btn" data-id="${file.id}">Download</button>
                <button class="text-indigo-600 hover:text-indigo-900 dark:text-indigo-400 dark:hover:text-indigo-300 mr-3 rename-btn" data-type="file" data-id="${file.id}">Rename</button>
                <button class="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300 delete-btn" data-type="file" data-id="${file.id}">Delete</button>
            </td>
        `;
        fileList.appendChild(row);
        
        // Add download event
        const downloadBtn = row.querySelector('.download-btn');
        if (downloadBtn) {
            downloadBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                downloadFile(file.id);
            });
        }
    });
    
    // Add event listeners to action buttons
    document.querySelectorAll('.rename-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const type = btn.getAttribute('data-type');
            const id = btn.getAttribute('data-id');
            showRenameModal(type, id);
        });
    });
    
    document.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const type = btn.getAttribute('data-type');
            const id = btn.getAttribute('data-id');
            showDeleteModal(type, id);
        });
    });
    
    // Refresh icons
    setTimeout(() => lucide.createIcons(), 100);
}

// Render folder tree
function renderFolderTree() {
    const folderTree = document.getElementById('folder-tree');
    if (!folderTree) return;
    
    // This would be implemented to show the full folder hierarchy
    // For simplicity, we're just showing a basic implementation
    folderTree.innerHTML = `
        <div class="folder-item p-2 rounded cursor-pointer flex items-center" data-folder="root">
            <i data-lucide="folder" class="w-4 h-4 text-yellow-500 mr-2"></i>
            <span class="text-sm">Home</span>
        </div>
    `;
    
    // Add click event to navigate home
    const homeElement = folderTree.querySelector('.folder-item');
    if (homeElement) {
        homeElement.addEventListener('click', () => {
            navigateToFolder('root', 'Home');
        });
    }
}

// Update breadcrumb
function updateBreadcrumb() {
    const breadcrumb = document.getElementById('breadcrumb');
    if (!breadcrumb) return;
    
    breadcrumb.innerHTML = '';
    
    // Always show Home as the first item
    const homeItem = document.createElement('span');
    homeItem.className = 'breadcrumb-item cursor-pointer hover:text-indigo-600 dark:hover:text-indigo-300';
    homeItem.textContent = 'Home';
    homeItem.addEventListener('click', () => navigateToFolder('root', 'Home'));
    breadcrumb.appendChild(homeItem);
    
    // Add current path items
    if (currentPath.length > 0) {
        currentPath.forEach((item, index) => {
            const separator = document.createElement('span');
            separator.className = 'mx-2 text-gray-400';
            separator.textContent = '/';
            breadcrumb.appendChild(separator);
            
            const pathItem = document.createElement('span');
            pathItem.className = 'breadcrumb-item cursor-pointer hover:text-indigo-600 dark:hover:text-indigo-300';
            pathItem.textContent = item.name;
            
            // Navigate to this folder when clicked
            pathItem.addEventListener('click', () => {
                // This would navigate to the specific folder
                // Simplified implementation
            });
            
            breadcrumb.appendChild(pathItem);
        });
    }
    
    // Update current folder title
    const currentFolderElement = document.getElementById('current-folder');
    if (currentFolderElement) {
        currentFolderElement.textContent = 
            currentPath.length > 0 ? currentPath[currentPath.length - 1].name : 'Files';
    }
}

// Navigate to folder
function navigateToFolder(folderId, folderName) {
    // This would update currentPath and reload files for that folder
    // Simplified implementation for demo
    showToast(`Navigated to ${folderName}`, 'info');
}

// Handle file upload
function handleFileUpload(e) {
    const files = e.target.files;
    handleDroppedFiles(files);
}

function handleDroppedFiles(files) {
    if (!files || files.length === 0) return;
    
    const uploadProgress = document.getElementById('upload-progress');
    if (!uploadProgress) return;
    
    uploadProgress.classList.remove('hidden');
    uploadProgress.innerHTML = '';
    
    Array.from(files).forEach(file => {
        if (file.size > 5 * 1024 * 1024) { // 5MB limit for demo
            showToast(`File ${file.name} is too large (max 5MB)`, 'error');
            return;
        }
        
        const progressItem = document.createElement('div');
        progressItem.className = 'flex items-center';
        progressItem.innerHTML = `
            <div class="w-8 h-8 mr-3 bg-gray-200 dark:bg-gray-700 rounded flex items-center justify-center">
                <i data-lucide="file" class="w-4 h-4 text-gray-500"></i>
            </div>
            <div class="flex-1">
                <p class="text-sm font-medium text-gray-700 dark:text-gray-300 truncate">${file.name}</p>
                <div class="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 mt-1">
                    <div class="bg-indigo-600 h-2 rounded-full progress-bar" style="width: 0%"></div>
                </div>
            </div>
        `;
        uploadProgress.appendChild(progressItem);
        
        // Simulate upload progress
        simulateUploadProgress(file, progressItem);
    });
}

function simulateUploadProgress(file, progressItem) {
    let progress = 0;
    const progressBar = progressItem.querySelector('.progress-bar');
    const interval = setInterval(() => {
        progress += Math.random() * 10;
        if (progress >= 100) {
            progress = 100;
            clearInterval(interval);
            
            // Add file to list after upload
            setTimeout(() => {
                const newFile = {
                    id: Date.now().toString(),
                    name: file.name,
                    size: file.size,
                    type: file.type,
                    modified: new Date().toISOString()
                };
                
                currentFiles.push(newFile);
                renderFileList();
                showToast(`Uploaded ${file.name}`, 'success');
                
                // Remove progress item after a delay
                setTimeout(() => {
                    progressItem.remove();
                    if (document.getElementById('upload-progress').children.length === 0) {
                        document.getElementById('upload-progress').classList.add('hidden');
                    }
                }, 1000);
            }, 500);
        }
        
        if (progressBar) {
            progressBar.style.width = `${progress}%`;
        }
    }, 200);
}

// Create new folder
function createNewFolder() {
    const folderNameInput = document.getElementById('new-folder-name');
    if (!folderNameInput) return;
    
    const folderName = folderNameInput.value.trim();
    
    if (!folderName) {
        showToast('Please enter a folder name', 'error');
        return;
    }
    
    const newFolder = {
        id: Date.now().toString(),
        name: folderName,
        modified: new Date().toISOString()
    };
    
    currentFolders.push(newFolder);
    renderFileList();
    renderFolderTree();
    hideModal('create-folder-modal');
    folderNameInput.value = '';
    showToast(`Folder "${folderName}" created`, 'success');
}

// Show rename modal
function showRenameModal(type, id) {
    let currentName = '';
    
    if (type === 'file') {
        const file = currentFiles.find(f => f.id === id);
        if (file) currentName = file.name;
    } else {
        const folder = currentFolders.find(f => f.id === id);
        if (folder) currentName = folder.name;
    }
    
    if (!currentName) return;
    
    const renameInput = document.getElementById('rename-input');
    if (renameInput) {
        renameInput.value = currentName;
    }
    
    selectedItem = { type, id, name: currentName };
    showModal('rename-modal');
}

// Rename item
function renameItem() {
    const renameInput = document.getElementById('rename-input');
    if (!renameInput) return;
    
    const newName = renameInput.value.trim();
    
    if (!newName) {
        showToast('Please enter a name', 'error');
        return;
    }
    
    if (!selectedItem) return;
    
    if (selectedItem.type === 'file') {
        const fileIndex = currentFiles.findIndex(f => f.id === selectedItem.id);
        if (fileIndex !== -1) {
            currentFiles[fileIndex].name = newName;
            currentFiles[fileIndex].modified = new Date().toISOString();
        }
    } else {
        const folderIndex = currentFolders.findIndex(f => f.id === selectedItem.id);
        if (folderIndex !== -1) {
            currentFolders[folderIndex].name = newName;
            currentFolders[folderIndex].modified = new Date().toISOString();
        }
    }
    
    renderFileList();
    if (selectedItem.type === 'folder') renderFolderTree();
    hideModal('rename-modal');
    showToast(`Renamed to "${newName}"`, 'success');
    selectedItem = null;
}

// Show delete modal
function showDeleteModal(type, id) {
    let itemName = '';
    
    if (type === 'file') {
        const file = currentFiles.find(f => f.id === id);
        if (file) itemName = file.name;
    } else {
        const folder = currentFolders.find(f => f.id === id);
        if (folder) itemName = folder.name;
    }
    
    if (!itemName) return;
    
    const deleteItemName = document.getElementById('delete-item-name');
    if (deleteItemName) {
        deleteItemName.textContent = `"${itemName}"`;
    }
    
    selectedItem = { type, id, name: itemName };
    showModal('delete-modal');
}

// Delete item
function deleteItem() {
    if (!selectedItem) return;
    
    if (selectedItem.type === 'file') {
        currentFiles = currentFiles.filter(f => f.id !== selectedItem.id);
    } else {
        currentFolders = currentFolders.filter(f => f.id !== selectedItem.id);
    }
    
    renderFileList();
    if (selectedItem.type === 'folder') renderFolderTree();
    hideModal('delete-modal');
    showToast(`Deleted "${selectedItem.name}"`, 'success');
    selectedItem = null;
}

// Download file
function downloadFile(fileId) {
    const file = currentFiles.find(f => f.id === fileId);
    if (!file) return;
    
    // In a real implementation, this would fetch the actual file data
    showToast(`Downloading "${file.name}"`, 'info');
    
    // Simulate download
    setTimeout(() => {
        showToast(`Downloaded "${file.name}"`, 'success');
    }, 1500);
}

// Modal functions
function showModal(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    
    modal.classList.remove('hidden');
    setTimeout(() => {
        modal.classList.remove('opacity-0');
        const modalContent = modal.querySelector('div');
        if (modalContent) {
            modalContent.classList.remove('scale-95');
        }
    }, 10);
}

function hideModal(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    
    modal.classList.add('opacity-0');
    const modalContent = modal.querySelector('div');
    if (modalContent) {
        modalContent.classList.add('scale-95');
    }
    setTimeout(() => {
        modal.classList.add('hidden');
    }, 300);
}
