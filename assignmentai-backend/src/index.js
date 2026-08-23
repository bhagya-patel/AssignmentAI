require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const swaggerUi = require('swagger-ui-express');
const swaggerFile = require('./swagger-output.json');

const authRoutes = require('./routes/auth.routes');
const assignmentRoutes = require('./routes/assignment.routes');
const submissionRoutes = require('./routes/submission.routes');
const reportRoutes = require('./routes/report.routes');
const adminRoutes = require('./routes/admin.routes');
const usersRoutes = require('./routes/users.routes');
const storageRoutes = require('./routes/storage.routes');
const vivaRoutes = require('./routes/viva.routes');
const materialRoutes = require('./routes/material.routes');
const requestsRoutes = require('./routes/requests.routes');
const notificationRoutes = require('./routes/notification.routes');
const handwritingRoutes = require('./routes/handwriting.routes');

// Start background grading worker (BullMQ + Redis)
require('./workers/gradingWorker');

const app = express();

// Middleware
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
  : ['http://localhost:5173', 'http://localhost:3000'];

app.use(cors({
  origin: (origin, callback) => {
    // Dynamically allow the requesting origin (prevents CORS errors)
    return callback(null, true);
  },
  credentials: true,
}));
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/assignments', assignmentRoutes);
app.use('/api/submissions', submissionRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/storage', storageRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/admin/users', usersRoutes);  // must be before /api/admin
app.use('/api/admin', adminRoutes);
app.use('/api/viva', vivaRoutes);
app.use('/api/materials', materialRoutes);
app.use('/api/requests', requestsRoutes);
app.use('/api/handwriting', handwritingRoutes);

// Swagger Documentation Route
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerFile));

// Health check
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

const PORT = process.env.PORT || 5000;

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: (origin, callback) => callback(null, true),
    methods: ['GET', 'POST'],
    credentials: true
  }
});

// Initialize Socket Manager
const socketManager = require('./sockets/socketManager');
socketManager.init(io);

// Initialize Viva Scheduler (Auto start/end/notify)
const vivaScheduler = require('./services/vivaScheduler');
vivaScheduler.initScheduler();

// Global Socket Connection Handler for Rooms
io.on('connection', (socket) => {
  socket.on('join_room', (room) => {
    socket.join(room);
    console.log(`[Socket] Client joined room: ${room}`);
  });
});

// Pass io to our viva socket handler
require('./sockets/vivaSocket')(io);

// Make io accessible in routes via req.app.get('io') (Legacy)
app.set('io', io);

// ── Ensure Supabase Storage buckets exist ─────────────────────────────────────
async function ensureStorageBuckets() {
  const supabaseAdmin = require('./config/supabaseAdmin');
  const buckets = [
    { name: 'question-papers', public: true  },
    { name: 'answer-keys',     public: false },
    { name: 'submissions',     public: false },
    { name: 'study-materials', public: true  },
  ];

  for (const bucket of buckets) {
    const { error } = await supabaseAdmin.storage.createBucket(bucket.name, {
      public: bucket.public,
      fileSizeLimit: 52428800, // 50 MB
    });
    if (error && !error.message.includes('already exists')) {
      console.error(`[Storage] Failed to create bucket "${bucket.name}":`, error.message);
    } else if (!error) {
      console.log(`[Storage] Bucket created: ${bucket.name}`);
    }
  }
}

server.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);
  await ensureStorageBuckets();
});
