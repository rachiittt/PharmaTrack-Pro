const { supabaseAdmin } = require('../db/supabase');

// ============================================
// Simple in-memory token cache (60s TTL)
// Reduces DB calls from 2 to 0 for repeat requests within the TTL window.
// ============================================
const tokenCache = new Map();
const TOKEN_TTL_MS = 60 * 1000; // 60 seconds

function getCachedProfile(token) {
  const entry = tokenCache.get(token);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    tokenCache.delete(token);
    return null;
  }
  return entry.data;
}

function setCachedProfile(token, data) {
  // Evict old entries if cache grows too large (simple cap at 500)
  if (tokenCache.size >= 500) {
    const firstKey = tokenCache.keys().next().value;
    tokenCache.delete(firstKey);
  }
  tokenCache.set(token, { data, expiresAt: Date.now() + TOKEN_TTL_MS });
}

async function requireAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing or invalid authorization header', code: 'AUTH_MISSING' });
    }

    const token = authHeader.split(' ')[1];

    // Check cache first
    const cached = getCachedProfile(token);
    if (cached) {
      req.user = { ...cached.user, profile: cached.profile, accessToken: token };
      return next();
    }

    // Support demo tokens for development/offline evaluation
    if (token.startsWith('demo_token') || token.startsWith('demo-')) {
      const demoProfile = {
        id: 'demo-admin-001',
        email: 'admin@pharmacy.com',
        full_name: 'Rajesh Kumar',
        role: 'admin',
        pharmacy_name: 'Kumar Medical Store',
        phone: '+91 98765 43210',
        plan: 'pro'
      };
      req.user = { id: demoProfile.id, email: demoProfile.email, profile: demoProfile, accessToken: token };
      return next();
    }

    // Validate token with Supabase
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !user) {
      return res.status(401).json({ error: 'Invalid or expired token', code: 'AUTH_INVALID' });
    }

    // Fetch user profile from users table
    const { data: profile } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('id', user.id)
      .single();

    // Cache the result
    setCachedProfile(token, { user, profile });

    req.user = { ...user, profile, accessToken: token };
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Authentication failed', code: 'AUTH_ERROR' });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user?.profile?.role || !roles.includes(req.user.profile.role)) {
      return res.status(403).json({ error: 'Insufficient permissions', code: 'FORBIDDEN' });
    }
    next();
  };
}

// Expose cache invalidation (useful for logout / profile update scenarios)
function invalidateTokenCache(token) {
  tokenCache.delete(token);
}

module.exports = { requireAuth, requireRole, invalidateTokenCache };
