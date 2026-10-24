require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { errorHandler } = require('./middleware/errorHandler');
const { supabaseAdmin } = require('./db/supabase');

const app = express();

// ============================================
// Security middleware
// ============================================
app.use(helmet());
app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:5173', credentials: true }));
app.use(express.json({ limit: '10mb' }));

// ============================================
// Compression (gzip) — reduces payload size ~60-70%
// ============================================
try {
  const compression = require('compression');
  app.use(compression());
} catch {
  // compression not installed — skip silently
}

// ============================================
// Rate limiting
// ============================================
const generalLimiter = rateLimit({ windowMs: 60 * 1000, max: 100, message: { error: 'Too many requests', code: 'RATE_LIMIT' } });
const authLimiter = rateLimit({ windowMs: 60 * 1000, max: 10, message: { error: 'Too many auth attempts', code: 'RATE_LIMIT' } });

app.use('/api/', generalLimiter);
app.use('/api/auth', authLimiter);

// ============================================
// Routes
// ============================================
app.use('/api/auth', require('./routes/auth'));
app.use('/api/medicines', require('./routes/medicines'));
app.use('/api/suppliers', require('./routes/suppliers'));
app.use('/api/customers', require('./routes/customers'));
app.use('/api/prescriptions', require('./routes/prescriptions'));
app.use('/api/sales', require('./routes/sales'));
app.use('/api/alerts', require('./routes/alerts'));
app.use('/api/analytics', require('./routes/analytics'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/reports', require('./routes/reports'));

// ============================================
// Health check
// ============================================
app.get('/api/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

// ============================================
// Global error handler (must be last)
// ============================================
app.use(errorHandler);

// ============================================
// Start server + verify DB connectivity
// ============================================
const PORT = process.env.PORT || 5001;

process.on('unhandledRejection', (reason) => {
  console.warn('⚠️  Unhandled Promise Rejection:', reason?.message || reason);
});

async function startServer() {
  const server = app.listen(PORT, () => {
    console.log(`🚀 PharmaTrack-Pro backend running on port ${PORT}`);
    console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`   Frontend URL: ${process.env.FRONTEND_URL || 'http://localhost:5173'}`);
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`❌ Port ${PORT} is already in use. Run 'kill -9 $(lsof -t -i:${PORT})' or change PORT in backend/.env`);
      process.exit(1);
    } else {
      console.error('❌ Server error:', err.message);
    }
  });

  // Verify Supabase connection on startup
  try {
    const { error } = await supabaseAdmin.from('users').select('id').limit(1);
    if (error) {
      console.warn('⚠️  DB connectivity check failed:', error.message);
      console.warn('   → Check SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your .env file');
    } else {
      console.log('✅ Database connection verified');
    }
  } catch (err) {
    console.warn('⚠️  Could not reach Supabase:', err.message);
    console.warn('   → The server will still run but DB operations will fail until credentials are set');
  }

  return server;
}

startServer();

module.exports = app;
