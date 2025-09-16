import jwt from 'jsonwebtoken';

// In a real implementation, you would integrate with JSONBin.io
// For demo purposes, we'll use a simple in-memory store
const storageData = new Map();

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-CSRF-Protection');
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
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (error) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    // Verify CSRF protection header
    const csrfHeader = req.headers['x-csrf-protection'];
    if (!csrfHeader || !['read', 'write', 'delete'].includes(csrfHeader)) {
      return res.status(401).json({ error: 'Invalid request' });
    }

    const { action, data } = req.body;
    const { storageId } = decoded;

    // Apply rate limiting based on IP
    const clientIP = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    if (await isRateLimited(clientIP)) {
      return res.status(429).json({ error: 'Too many requests. Please try again later.' });
    }

    if (action === 'getStorage') {
      // Get user's storage data
      const userStorage = storageData.get(storageId) || { files: [], folders: [] };
      return res.status(200).json(userStorage);
    }

    if (action === 'updateStorage') {
      // Update user's storage data
      if (!data) {
        return res.status(400).json({ error: 'Data is required' });
      }

      storageData.set(storageId, data);
      return res.status(200).json({ message: 'Storage updated successfully' });
    }

    return res.status(400).json({ error: 'Invalid action' });
  } catch (error) {
    console.error('JSONBin API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

// Simple rate limiting implementation
const rateLimitMap = new Map();
async function isRateLimited(ip) {
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