/**
 * Moment Captured - Production Studio Web Server & Media API
 * Production Hardened: Security Headers, Rate Limiting, Secure Sessions, CDN Caching, Health Check
 */

const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const crypto = require('crypto');
const zlib = require('zlib');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const IS_PROD = process.env.NODE_ENV === 'production';
const DATA_FILE = path.join(__dirname, 'data', 'stories.json');

// Ensure data folder exists
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// -----------------------------------------------------------------------------
// Cloudinary SDK Configuration
// -----------------------------------------------------------------------------
let cloudinary = null;
try {
  cloudinary = require('cloudinary').v2;
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true
  });
} catch (e) {
  console.warn('[Cloudinary] SDK warning:', e.message);
}

// Multer memory storage for direct server uploads
let upload = null;
try {
  const multer = require('multer');
  upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 25 * 1024 * 1024 } // 25MB max
  });
} catch (e) {
  console.warn('[Multer] SDK warning:', e.message);
}

// -----------------------------------------------------------------------------
// Security Headers Middleware
// -----------------------------------------------------------------------------
app.use((req, res, next) => {
  // Prevent clickjacking
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  // Prevent MIME-sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');
  // Modern XSS protection
  res.setHeader('X-XSS-Protection', '1; mode=block');
  // Referrer Policy
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  // Permissions Policy
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

  // Content Security Policy (allows studio assets, Google Fonts, Unsplash, Cloudinary)
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline'; " +
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
    "font-src 'self' https://fonts.gstatic.com data:; " +
    "img-src 'self' data: blob: https://res.cloudinary.com https://images.unsplash.com https://*.cloudinary.com; " +
    "connect-src 'self' https://api.cloudinary.com https://res.cloudinary.com; " +
    "frame-ancestors 'self';"
  );

  // Strict Transport Security on production / HTTPS
  if (IS_PROD || req.secure || req.headers['x-forwarded-proto'] === 'https') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  }

  // Remove fingerprinting header
  res.removeHeader('X-Powered-By');
  next();
});

// -----------------------------------------------------------------------------
// In-Memory Rate Limiting (No extra dependencies needed)
// -----------------------------------------------------------------------------
const rateLimitMap = new Map();

function createRateLimiter(options) {
  const { windowMs, maxRequests, message } = options;
  return (req, res, next) => {
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown-ip';
    const key = `${req.baseUrl || req.path}:${ip}`;
    const now = Date.now();

    let entry = rateLimitMap.get(key);
    if (!entry || now - entry.startTime > windowMs) {
      entry = { startTime: now, count: 1 };
    } else {
      entry.count += 1;
    }

    rateLimitMap.set(key, entry);

    // Periodically prune stale keys
    if (rateLimitMap.size > 5000) {
      for (const [k, v] of rateLimitMap.entries()) {
        if (now - v.startTime > windowMs) {
          rateLimitMap.delete(k);
        }
      }
    }

    if (entry.count > maxRequests) {
      const retryAfter = Math.ceil((entry.startTime + windowMs - now) / 1000);
      res.setHeader('Retry-After', retryAfter);
      return res.status(429).json({
        success: false,
        message: message || `Too many requests. Please try again in ${retryAfter} seconds.`
      });
    }

    next();
  };
}

// Rate limiters:
const loginLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 10,
  message: 'Too many authentication attempts. Please wait 15 minutes before trying again.'
});

const uploadLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  maxRequests: 50,
  message: 'Hourly upload limit reached. Please wait before uploading more stories.'
});

const apiLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 240,
  message: 'Too many requests. Please slow down.'
});

// -----------------------------------------------------------------------------
// Built-in Lightweight Gzip / Deflate Response Compression
// -----------------------------------------------------------------------------
app.use((req, res, next) => {
  const acceptEncoding = req.headers['accept-encoding'] || '';
  const originalSend = res.send;

  res.send = function (body) {
    if (
      typeof body === 'string' &&
      body.length > 1024 &&
      !res.getHeader('Content-Encoding') &&
      /\b(gzip|deflate)\b/.test(acceptEncoding)
    ) {
      if (acceptEncoding.includes('gzip')) {
        res.setHeader('Content-Encoding', 'gzip');
        zlib.gzip(Buffer.from(body), (err, compressed) => {
          if (err) return originalSend.call(res, body);
          res.setHeader('Content-Length', compressed.length);
          return originalSend.call(res, compressed);
        });
        return res;
      }
    }
    return originalSend.call(res, body);
  };
  next();
});

// Basic Middlewares
app.use(cors({
  origin: true,
  methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '30mb' }));
app.use(express.urlencoded({ extended: true, limit: '30mb' }));

// -----------------------------------------------------------------------------
// Database & Session Management
// -----------------------------------------------------------------------------
function readStories() {
  try {
    if (!fs.existsSync(DATA_FILE)) return [];
    const content = fs.readFileSync(DATA_FILE, 'utf8');
    return JSON.parse(content || '[]');
  } catch (err) {
    console.error('Error reading stories:', err);
    return [];
  }
}

function saveStories(stories) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(stories, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error('Error saving stories:', err);
    return false;
  }
}

// In-Memory Cryptographic Session Store (24-hour expiration)
const activeSessions = new Map();
const SESSION_TTL = 24 * 60 * 60 * 1000;

function cleanupExpiredSessions() {
  const now = Date.now();
  for (const [token, data] of activeSessions.entries()) {
    if (now > data.expiresAt) {
      activeSessions.delete(token);
    }
  }
}
setInterval(cleanupExpiredSessions, 30 * 60 * 1000);

// Admin Auth Middleware
function requireAdminAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'Unauthorized: Admin authentication required' });
  }

  const token = authHeader.split(' ')[1];
  if (!token) {
    return res.status(401).json({ success: false, message: 'Missing session token' });
  }

  const session = activeSessions.get(token);
  if (!session || Date.now() > session.expiresAt) {
    activeSessions.delete(token);
    return res.status(401).json({ success: false, message: 'Session expired or invalid. Please re-authenticate.' });
  }

  // Refresh sliding window
  session.expiresAt = Date.now() + SESSION_TTL;
  next();
}

// -----------------------------------------------------------------------------
// API Endpoints
// -----------------------------------------------------------------------------

// 1. Healthcheck & System Metrics (Production Monitoring)
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV || 'production',
    nodeVersion: process.version,
    memoryUsage: process.memoryUsage()
  });
});

// 2. Public Environment & Cloudinary Config Status (Live ping verification)
app.get('/api/config', apiLimiter, async (req, res) => {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME || '';
  const apiKey = process.env.CLOUDINARY_API_KEY || '';
  const apiSecret = process.env.CLOUDINARY_API_SECRET || '';

  let isConnected = false;
  let connectionError = null;

  // Detect masked asterisks
  const isSecretMasked = apiSecret.includes('*');

  if (isSecretMasked) {
    connectionError = 'Masked characters (*****) detected in CLOUDINARY_API_SECRET. In Cloudinary Console, click the copy icon next to API Secret to copy the actual secret characters.';
  } else if (cloudinary && apiKey && apiSecret && apiSecret !== 'your_api_secret_here') {
    try {
      const pingRes = await cloudinary.api.ping();
      isConnected = pingRes && pingRes.status === 'ok';
    } catch (err) {
      connectionError = (err.error && err.error.message) || err.message || 'Authentication error';
    }
  } else {
    connectionError = 'Cloudinary API credentials missing or incomplete in .env';
  }

  res.json({
    success: true,
    cloudName: cloudName === 'your_cloud_name_here' ? '' : cloudName,
    uploadPreset: process.env.CLOUDINARY_UPLOAD_PRESET || '',
    isCloudinaryConfigured: Boolean(cloudName && apiKey && apiSecret && !isSecretMasked),
    isCloudinaryConnected: isConnected,
    connectionError
  });
});

// 3. Admin Authentication with Timing-Safe Verification
app.post('/api/admin/login', loginLimiter, (req, res) => {
  const { password } = req.body;
  const configuredPassword = process.env.ADMIN_PASSWORD;

  if (!configuredPassword) {
    return res.status(500).json({ success: false, message: 'ADMIN_PASSWORD is not configured in .env' });
  }

  if (typeof password !== 'string' || password.length === 0) {
    return res.status(400).json({ success: false, message: 'Password is required' });
  }

  // Constant-time comparison to prevent timing attacks
  const bufInput = Buffer.from(password);
  const bufConfig = Buffer.from(configuredPassword);

  let match = false;
  if (bufInput.length === bufConfig.length) {
    match = crypto.timingSafeEqual(bufInput, bufConfig);
  }

  if (match) {
    // Generate high-entropy 256-bit cryptographically secure token
    const token = 'mc_' + crypto.randomBytes(32).toString('hex');
    activeSessions.set(token, {
      createdAt: Date.now(),
      expiresAt: Date.now() + SESSION_TTL
    });

    return res.json({ success: true, token, expiresIn: SESSION_TTL / 1000 });
  }

  return res.status(401).json({ success: false, message: 'Invalid admin credentials' });
});

// 4. Get All Gallery Stories (Public read)
app.get('/api/stories', apiLimiter, (req, res) => {
  const stories = readStories();
  // Set cache header for stories list (short cache with revalidation)
  res.setHeader('Cache-Control', 'public, max-age=10, stale-while-revalidate=60');
  res.json({ success: true, stories });
});

// 5. Add a Story to Gallery (Protected)
app.post('/api/stories', requireAdminAuth, (req, res) => {
  const { imageUrl, webpUrl, orientation, alt, public_id } = req.body;

  if (!imageUrl) {
    return res.status(400).json({ success: false, message: 'Image URL is required' });
  }

  const stories = readStories();
  const newStory = {
    id: 'story-' + Date.now(),
    imageUrl,
    webpUrl: webpUrl || imageUrl,
    orientation: orientation === 'portrait' ? 'portrait' : 'landscape',
    alt: alt || 'Moment Captured Story',
    public_id: public_id || '',
    createdAt: Date.now()
  };

  // Prepend so newly uploaded stories appear first in the gallery
  stories.unshift(newStory);
  const saved = saveStories(stories);

  if (saved) {
    res.json({ success: true, story: newStory, total: stories.length });
  } else {
    res.status(500).json({ success: false, message: 'Failed to save story' });
  }
});

// 6. Delete a Story from Gallery (Protected)
app.delete('/api/stories/:id', requireAdminAuth, (req, res) => {
  const { id } = req.params;
  let stories = readStories();
  const storyIndex = stories.findIndex(s => s.id === id);

  if (storyIndex === -1) {
    return res.status(404).json({ success: false, message: 'Story not found' });
  }

  const [removedStory] = stories.splice(storyIndex, 1);
  saveStories(stories);

  // Clean up from Cloudinary CDN if public_id exists
  if (removedStory.public_id && cloudinary && process.env.CLOUDINARY_API_SECRET && !process.env.CLOUDINARY_API_SECRET.includes('*')) {
    cloudinary.uploader.destroy(removedStory.public_id, (err) => {
      if (err) console.warn('[Cloudinary] Delete warning:', err.message);
    });
  }

  res.json({ success: true, message: 'Story deleted successfully', id });
});

// 7. Cloudinary Direct Media Upload Stream (Protected)
const uploadMiddleware = upload ? upload.single('media') : (req, res, next) => next();

app.post('/api/upload', requireAdminAuth, uploadLimiter, uploadMiddleware, async (req, res) => {
  try {
    const apiSecret = process.env.CLOUDINARY_API_SECRET || '';
    if (!cloudinary || !apiSecret || apiSecret.includes('*') || process.env.CLOUDINARY_CLOUD_NAME === 'your_cloud_name_here') {
      return res.status(400).json({
        success: false,
        message: 'Cloudinary credentials are not properly configured or contain masked characters. Please check your .env file.'
      });
    }

    let fileBuffer = null;
    let base64Data = null;

    if (req.file) {
      fileBuffer = req.file.buffer;
    } else if (req.body.image) {
      base64Data = req.body.image;
    }

    if (!fileBuffer && !base64Data) {
      return res.status(400).json({ success: false, message: 'No image file or data provided' });
    }

    // High performance transformations for luxury fine art presentation
    const uploadOptions = {
      folder: 'moment-captured/gallery',
      resource_type: 'auto',
      transformation: [
        { quality: 'auto:best' },
        { fetch_format: 'auto' }
      ]
    };

    if (fileBuffer) {
      const uploadStream = cloudinary.uploader.upload_stream(uploadOptions, (error, result) => {
        if (error) {
          console.error('[Cloudinary Upload Error]', error);
          return res.status(500).json({ success: false, message: error.message || 'Upload failed' });
        }

        const orientation = result.width >= result.height ? 'landscape' : 'portrait';
        res.json({
          success: true,
          url: result.secure_url,
          public_id: result.public_id,
          width: result.width,
          height: result.height,
          format: result.format,
          orientation
        });
      });

      uploadStream.end(fileBuffer);
    } else {
      const result = await cloudinary.uploader.upload(base64Data, uploadOptions);
      const orientation = result.width >= result.height ? 'landscape' : 'portrait';

      res.json({
        success: true,
        url: result.secure_url,
        public_id: result.public_id,
        width: result.width,
        height: result.height,
        format: result.format,
        orientation
      });
    }
  } catch (err) {
    console.error('[Server Upload Exception]', err);
    res.status(500).json({ success: false, message: err.message || 'Upload processing error' });
  }
});

// -----------------------------------------------------------------------------
// Static Frontend & CDN Caching
// -----------------------------------------------------------------------------
// Assets caching (CSS, JS, Images, Videos, Fonts)
app.use(express.static(__dirname, {
  maxAge: IS_PROD ? '7d' : 0,
  setHeaders: (res, filePath) => {
    // HTML pages should never be cached so users always get fresh code
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    } else if (/\.(css|js|woff2?|ttf|eot|svg|png|jpe?g|webp|avif|mp4)$/i.test(filePath)) {
      res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
    }
  }
}));

app.get('/admin', (req, res) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.sendFile(path.join(__dirname, 'admin.html'));
});

// Catch-all single page routing
app.use((req, res) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Centralized error handler
app.use((err, req, res, next) => {
  console.error('[Unhandled Error]', err);
  res.status(500).json({
    success: false,
    message: IS_PROD ? 'Internal server error' : err.message
  });
});

// -----------------------------------------------------------------------------
// Graceful Server Startup & Termination
// -----------------------------------------------------------------------------
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`=======================================================`);
  console.log(` Moment Captured 2.0 - Production Server Running`);
  console.log(` Environment:     ${IS_PROD ? 'PRODUCTION' : 'DEVELOPMENT'}`);
  console.log(` Main Website:    http://localhost:${PORT}`);
  console.log(` Admin Portal:    http://localhost:${PORT}/admin`);
  console.log(` Health Check:    http://localhost:${PORT}/api/health`);
  console.log(`=======================================================`);
});

function gracefulShutdown(signal) {
  console.log(`[${signal}] Received. Shutting down gracefully...`);
  server.close(() => {
    console.log('[Server] Closed all pending connections.');
    process.exit(0);
  });
  // Force close after 10s if stuck
  setTimeout(() => {
    console.error('[Server] Forceful shutdown initiated.');
    process.exit(1);
  }, 10000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
