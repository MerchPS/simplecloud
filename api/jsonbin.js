import jwt from 'jsonwebtoken';

// In-memory store untuk rate limiting
const rateLimitMap = new Map();

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-CSRF-Token');
  res.setHeader('Access-Control-Allow-Credentials', 'true');

  // Handle preflight request
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Verify JWT token from cookie
    const token = req.cookies.token;
    if (!token) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret-for-development');
    } catch (error) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    // Verify CSRF protection header
    const csrfHeader = req.headers['x-csrf-token'];
    if (!csrfHeader || !['read', 'write', 'delete'].includes(csrfHeader)) {
      return res.status(401).json({ error: 'Invalid CSRF token' });
    }

    const { action, data, fileId, folderId, newName, itemType } = req.body;
    const { storageId } = decoded;

    // Apply rate limiting based on IP
    const clientIP = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    if (isRateLimited(clientIP)) {
      return res.status(429).json({ error: 'Too many requests. Please try again later.' });
    }

    // Get user storage from JSONBin
    const userStorage = await getStorageFromJSONBin(storageId);
    if (!userStorage) {
      return res.status(404).json({ error: 'Storage not found' });
    }

    if (action === 'getStorage') {
      // Get user's storage data
      return res.status(200).json(userStorage);
    }

    if (action === 'updateStorage') {
      // Update user's storage data
      if (!data) {
        return res.status(400).json({ error: 'Data is required' });
      }

      const saveSuccess = await saveStorageToJSONBin(storageId, data);
      if (!saveSuccess) {
        return res.status(500).json({ error: 'Failed to update storage' });
      }

      return res.status(200).json({ message: 'Storage updated successfully' });
    }

    if (action === 'addFile') {
      // Add a new file to storage
      if (!data) {
        return res.status(400).json({ error: 'File data is required' });
      }

      userStorage.files.push({
        id: Date.now().toString(),
        name: data.name,
        size: data.size,
        type: data.type,
        content: data.content, // Base64 encoded content
        folderId: folderId || 'root',
        modified: new Date().toISOString(),
        created: new Date().toISOString()
      });

      const saveSuccess = await saveStorageToJSONBin(storageId, userStorage);
      if (!saveSuccess) {
        return res.status(500).json({ error: 'Failed to add file' });
      }

      return res.status(200).json({ message: 'File added successfully' });
    }

    if (action === 'addFolder') {
      // Add a new folder to storage
      if (!data || !data.name) {
        return res.status(400).json({ error: 'Folder name is required' });
      }

      const newFolder = {
        id: Date.now().toString(),
        name: data.name,
        path: data.path || '/',
        parentId: folderId || 'root',
        children: [],
        modified: new Date().toISOString(),
        created: new Date().toISOString()
      };

      userStorage.folders.push(newFolder);
      const saveSuccess = await saveStorageToJSONBin(storageId, userStorage);
      if (!saveSuccess) {
        return res.status(500).json({ error: 'Failed to add folder' });
      }

      return res.status(200).json({ message: 'Folder added successfully', folder: newFolder });
    }

    if (action === 'renameItem') {
      // Rename a file or folder
      if (!itemType || !fileId || !newName) {
        return res.status(400).json({ error: 'Item type, ID and new name are required' });
      }

      if (itemType === 'file') {
        const fileIndex = userStorage.files.findIndex(f => f.id === fileId);
        if (fileIndex === -1) {
          return res.status(404).json({ error: 'File not found' });
        }
        userStorage.files[fileIndex].name = newName;
        userStorage.files[fileIndex].modified = new Date().toISOString();
      } else if (itemType === 'folder') {
        const folderIndex = userStorage.folders.findIndex(f => f.id === fileId);
        if (folderIndex === -1) {
          return res.status(404).json({ error: 'Folder not found' });
        }
        userStorage.folders[folderIndex].name = newName;
        userStorage.folders[folderIndex].modified = new Date().toISOString();
      } else {
        return res.status(400).json({ error: 'Invalid item type' });
      }

      const saveSuccess = await saveStorageToJSONBin(storageId, userStorage);
      if (!saveSuccess) {
        return res.status(500).json({ error: 'Failed to rename item' });
      }

      return res.status(200).json({ message: 'Item renamed successfully' });
    }

    if (action === 'deleteItem') {
      // Delete a file or folder
      if (!itemType || !fileId) {
        return res.status(400).json({ error: 'Item type and ID are required' });
      }

      if (itemType === 'file') {
        userStorage.files = userStorage.files.filter(f => f.id !== fileId);
      } else if (itemType === 'folder') {
        // Also remove all files in this folder
        userStorage.files = userStorage.files.filter(f => f.folderId !== fileId);
        userStorage.folders = userStorage.folders.filter(f => f.id !== fileId);
      } else {
        return res.status(400).json({ error: 'Invalid item type' });
      }

      const saveSuccess = await saveStorageToJSONBin(storageId, userStorage);
      if (!saveSuccess) {
        return res.status(500).json({ error: 'Failed to delete item' });
      }

      return res.status(200).json({ message: 'Item deleted successfully' });
    }

    return res.status(400).json({ error: 'Invalid action' });
  } catch (error) {
    console.error('JSONBin API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

// Function to get storage data from JSONBin
async function getStorageFromJSONBin(storageId) {
  try {
    const response = await fetch(`https://api.jsonbin.io/v3/b/${storageId}`, {
      method: 'GET',
      headers: {
        'X-Master-Key': process.env.JSONBIN_KEY,
        'X-Bin-Meta': false
      }
    });

    if (response.status === 404) {
      return null; // Storage not found
    }

    if (!response.ok) {
      throw new Error(`JSONBin error: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error getting storage from JSONBin:', error);
    return null;
  }
}

// Function to save storage data to JSONBin
async function saveStorageToJSONBin(storageId, data) {
  try {
    const response = await fetch(`https://api.jsonbin.io/v3/b/${storageId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'X-Master-Key': process.env.JSONBIN_KEY
      },
      body: JSON.stringify(data)
    });

    return response.ok;
  } catch (error) {
    console.error('Error saving storage to JSONBin:', error);
    return false;
  }
}

// Simple rate limiting implementation
function isRateLimited(ip) {
  const now = Date.now();
  const windowStart = now - 3600000; // 1 hour window

  // Clean up old entries
  for (const [ip, timestamps] of rateLimitMap.entries()) {
    const recent = timestamps.filter(timestamp => timestamp > windowStart);
    if (recent.length === 0) {
      rateLimitMap.delete(ip);
    } else {
      rateLimitMap.set(ip, recent);
    }
  }

  // Get or create entry for this IP
  let timestamps = rateLimitMap.get(ip) || [];
  timestamps = timestamps.filter(timestamp => timestamp > windowStart);
  
  // Check if over limit (120 requests per hour)
  if (timestamps.length >= 120) {
    return true;
  }

  // Add current timestamp
  timestamps.push(now);
  rateLimitMap.set(ip, timestamps);
  
  return false;
}
