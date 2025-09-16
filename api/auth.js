import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

// In a real implementation, you would use a database
// For demo purposes, we'll use a simple in-memory store
const users = new Map();

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
    const { action, storageId, password, deviceFingerprint } = req.body;

    // Verify CSRF protection header
    const csrfHeader = req.headers['x-csrf-protection'];
    if (!csrfHeader || !['create', 'login', 'verify'].includes(csrfHeader)) {
      return res.status(401).json({ error: 'Invalid request' });
    }

    // Apply rate limiting based on IP and device fingerprint
    const clientIP = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    if (await isRateLimited(clientIP, deviceFingerprint)) {
      return res.status(429).json({ error: 'Too many requests. Please try again later.' });
    }

    if (action === 'create') {
      // Validate input
      if (!storageId || !password) {
        return res.status(400).json({ error: 'Storage ID and password are required' });
      }

      // Check if storage already exists
      if (users.has(storageId)) {
        return res.status(409).json({ error: 'Storage ID already exists' });
      }

      // Hash password
      const saltRounds = 10;
      const hashedPassword = await bcrypt.hash(password, saltRounds);

      // Create user storage
      users.set(storageId, {
        password: hashedPassword,
        createdAt: new Date().toISOString(),
        storage: {
          files: [],
          folders: []
        }
      });

      // Generate JWT token
      const token = jwt.sign(
        { storageId }, 
        process.env.JWT_SECRET, 
        { expiresIn: '7d' }
      );

      // Set token in HTTP-only cookie
      res.setHeader('Set-Cookie', `token=${token}; HttpOnly; Path=/; SameSite=Strict; Max-Age=604800`);

      return res.status(200).json({ message: 'Storage created successfully' });
    }

    if (action === 'login') {
      // Validate input
      if (!storageId || !password) {
        return res.status(400).json({ error: 'Storage ID and password are required' });
      }

      // Check if storage exists
      const user = users.get(storageId);
      if (!user) {
        return res.status(401).json({ error: 'Invalid storage ID or password' });
      }

      // Verify password
      const passwordMatch = await bcrypt.compare(password, user.password);
      if (!passwordMatch) {
        return res.status(401).json({ error: 'Invalid storage ID or password' });
      }

      // Generate JWT token
      const token = jwt.sign(
        { storageId }, 
        process.env.JWT_SECRET, 
        { expiresIn: '7d' }
      );

      // Set token in HTTP-only cookie
      res.setHeader('Set-Cookie', `token=${token}; HttpOnly; Path=/; SameSite=Strict; Max-Age=604800`);

      return res.status(200).json({ message: 'Login successful' });
    }

    if (action === 'verify') {
      // Verify JWT token from cookie
      const token = req.cookies.token;
      if (!token) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        // Check if storage still exists
        if (!users.has(decoded.storageId)) {
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

// Simple rate limiting implementation
const rateLimitMap = new Map();
async function isRateLimited(ip, deviceFingerprint) {
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