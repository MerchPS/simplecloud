import bcrypt from 'bcryptjs';
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
    const { action, storageId, password, deviceFingerprint } = req.body;

    // Verify CSRF protection header
    const csrfHeader = req.headers['x-csrf-token'];
    if (!csrfHeader || !['create', 'login', 'verify'].includes(csrfHeader)) {
      return res.status(401).json({ error: 'Invalid CSRF token' });
    }

    // Apply rate limiting based on IP and device fingerprint
    const clientIP = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    if (isRateLimited(clientIP, deviceFingerprint)) {
      return res.status(429).json({ error: 'Too many requests. Please try again later.' });
    }

    if (action === 'create') {
      // Validate input
      if (!storageId || !password) {
        return res.status(400).json({ error: 'Storage ID and password are required' });
      }

      // Check if storage already exists in JSONBin
      const existingUser = await getStorageFromJSONBin(storageId);
      if (existingUser) {
        return res.status(409).json({ error: 'Storage ID already exists' });
      }

      // Hash password
      const saltRounds = 10;
      const hashedPassword = await bcrypt.hash(password, saltRounds);

      // Create user storage data
      const userData = {
        password: hashedPassword,
        createdAt: new Date().toISOString(),
        storage: {
          files: [],
          folders: [
            {
              id: 'root',
              name: 'Home',
              path: '/',
              children: []
            }
          ]
        }
      };

      // Save to JSONBin
      const saveSuccess = await saveStorageToJSONBin(storageId, userData);
      if (!saveSuccess) {
        return res.status(500).json({ error: 'Failed to create storage' });
      }

      // Generate JWT token
      const token = jwt.sign(
        { 
          storageId,
          exp: Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60) // 7 days
        }, 
        process.env.JWT_SECRET || 'fallback-secret-for-development'
      );

      // Set token in HTTP-only cookie
      res.setHeader('Set-Cookie', `token=${token}; HttpOnly; Path=/; SameSite=Strict; Max-Age=604800${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`);

      return res.status(200).json({ message: 'Storage created successfully' });
    }

    if (action === 'login') {
      // Validate input
      if (!storageId || !password) {
        return res.status(400).json({ error: 'Storage ID and password are required' });
      }

      // Check if storage exists in JSONBin
      const userData = await getStorageFromJSONBin(storageId);
      if (!userData) {
        return res.status(401).json({ error: 'Invalid storage ID or password' });
      }

      // Verify password
      const passwordMatch = await bcrypt.compare(password, userData.password);
      if (!passwordMatch) {
        return res.status(401).json({ error: 'Invalid storage ID or password' });
      }

      // Generate JWT token
      const token = jwt.sign(
        { 
          storageId,
          exp: Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60) // 7 days
        }, 
        process.env.JWT_SECRET || 'fallback-secret-for-development'
      );

      // Set token in HTTP-only cookie
      res.setHeader('Set-Cookie', `token=${token}; HttpOnly; Path=/; SameSite=Strict; Max-Age=604800${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`);

      return res.status(200).json({ message: 'Login successful' });
    }

    if (action === 'verify') {
      // Verify JWT token from cookie
      const token = req.cookies.token;
      if (!token) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret-for-development');
        
        // Check if storage still exists in JSONBin
        const userData = await getStorageFromJSONBin(decoded.storageId);
        if (!userData) {
          return res.status(401).json({ error: 'Storage not found' });
        }

        return res.status(200).json({ message: 'Authenticated', storageId: decoded.storageId });
      } catch (error) {
        return res.status(401).json({ error: 'Invalid token' });
      }
    }

    return res.status(400).json({ error: 'Invalid action' });
  } catch (error) {
    console.error('Auth API error:', error);
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
    // First try to create a new bin
    const createResponse = await fetch('https://api.jsonbin.io/v3/b', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Master-Key': process.env.JSONBIN_KEY,
        'X-Bin-Name': storageId,
        'X-Bin-Private': true
      },
      body: JSON.stringify(data)
    });

    if (createResponse.ok) {
      return true;
    }

    // If create fails (maybe bin already exists), try to update
    const updateResponse = await fetch(`https://api.jsonbin.io/v3/b/${storageId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'X-Master-Key': process.env.JSONBIN_KEY
      },
      body: JSON.stringify(data)
    });

    return updateResponse.ok;
  } catch (error) {
    console.error('Error saving storage to JSONBin:', error);
    return false;
  }
}

// Simple rate limiting implementation
function isRateLimited(ip, deviceFingerprint) {
  const key = `${ip}:${JSON.stringify(deviceFingerprint)}`;
  const now = Date.now();
  const windowStart = now - 3600000; // 1 hour window

  // Clean up old entries
  for (const [key, timestamps] of rateLimitMap.entries()) {
    const recent = timestamps.filter(timestamp => timestamp > windowStart);
    if (recent.length === 0) {
      rateLimitMap.delete(key);
    } else {
      rateLimitMap.set(key, recent);
    }
  }

  // Get or create entry for this key
  let timestamps = rateLimitMap.get(key) || [];
  timestamps = timestamps.filter(timestamp => timestamp > windowStart);
  
  // Check if over limit (60 requests per hour)
  if (timestamps.length >= 60) {
    return true;
  }

  // Add current timestamp
  timestamps.push(now);
  rateLimitMap.set(key, timestamps);
  
  return false;
}
