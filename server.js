require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const cron = require('node-cron');
const rateLimit = require('express-rate-limit');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
  pingTimeout: 30000,
  pingInterval: 10000
});

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'frontend/public')));

// Rate limiting for auth routes
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30, message: { message: 'Too many login attempts. Try again in 15 minutes.' } });
app.use('/api/auth', authLimiter);

// ── MongoDB ───────────────────────────────────────────────────────────────────
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ MongoDB Connected'))
  .catch(err => { console.error('❌ MongoDB Error:', err); process.exit(1); });

// ── Models (load once) ────────────────────────────────────────────────────────
const LiveLocation    = require('./backend/models/LiveLocation');
const TripHistory     = require('./backend/models/TripHistory');
const TripLocation    = require('./backend/models/TripLocation');
const { detectCurrentStop, invalidateStopCache } = require('./backend/services/stopDetector');
// Ensure StopMaster model is registered (used by geocoder)
require('./backend/models/StopMaster');

// ── API Routes ────────────────────────────────────────────────────────────────
app.use('/api/auth',       require('./backend/routes/auth'));
app.use('/api/buses',      require('./backend/routes/buses'));
app.use('/api/routes',     require('./backend/routes/routeRoutes'));
app.use('/api/timetables', require('./backend/routes/timetables'));
app.use('/api/live',       require('./backend/routes/live'));
app.use('/api/conductors', require('./backend/routes/conductors'));
app.use('/api/trips',      require('./backend/routes/trips'));
app.use('/api/variants',   require('./backend/routes/variants'));

// ── Frontend Pages ────────────────────────────────────────────────────────────
const pub = (f) => path.join(__dirname, 'frontend/public', f);
app.get('/',                    (_, res) => res.sendFile(pub('index.html')));
app.get('/track',               (_, res) => res.sendFile(pub('pages/track.html')));
app.get('/conductor',           (_, res) => res.sendFile(pub('pages/conductor-login.html')));
app.get('/conductor/dashboard', (_, res) => res.sendFile(pub('pages/conductor-dashboard.html')));
app.get('/admin',               (_, res) => res.sendFile(pub('pages/admin-login.html')));
app.get('/admin/dashboard',     (_, res) => res.sendFile(pub('pages/admin-dashboard.html')));
app.get('/timetable',           (_, res) => res.sendFile(pub('pages/timetable.html')));

// ── In-memory conductor socket map: conductorId → socketId ───────────────────
// Used to detect duplicate logins and send targeted messages
const conductorSockets = new Map(); // conductorId → socket.id
const socketTrips      = new Map(); // socket.id → { busNumber, tripId, conductorId }
const busStopIdx       = new Map(); // busNumber → currentStopIdx (monotonically increases)

// ── Socket.IO ─────────────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log(`🔌 Connected: ${socket.id}`);

  // ── CONDUCTOR: Start Trip ────────────────────────────────────────────────
  socket.on('startTrip', async (data) => {
    const { busNumber, routeId, variantId = null, conductorId, conductorName } = data;
    if (!busNumber || !routeId || !conductorId) {
      socket.emit('tripError', { message: 'Missing required fields: busNumber, routeId, conductorId' });
      return;
    }
    try {
      // Block duplicate: same conductor already has active trip
      if (conductorSockets.has(conductorId)) {
        const oldSocket = conductorSockets.get(conductorId);
        if (oldSocket !== socket.id) {
          // Different socket = same conductor opened 2 tabs/browsers
          socket.emit('tripError', { message: 'You already have an active trip in another session.' });
          return;
        }
      }

      // Block duplicate: same bus already active with different conductor
      const existingBus = await LiveLocation.findOne({ busNumber: busNumber.toUpperCase() });
      if (existingBus && existingBus.conductorId?.toString() !== conductorId) {
        socket.emit('tripError', { message: `Bus ${busNumber} is already active with another conductor.` });
        return;
      }

      // Create TripHistory record
      const trip = await TripHistory.create({
        busNumber: busNumber.toUpperCase(),
        routeId,
        conductorId,
        conductorName,
        startedAt: new Date()
      });

      // Upsert LiveLocation
      await LiveLocation.findOneAndUpdate(
        { busNumber: busNumber.toUpperCase() },
        {
          busNumber: busNumber.toUpperCase(),
          routeId,
          variantId: variantId || null,
          conductorId,
          conductorName,
          latitude: 0, longitude: 0,
          currentStopIdx: 0,
          status: 'active',
          tripId: trip._id,
          startedAt: new Date(),
          updatedAt: new Date()
        },
        { upsert: true, new: true }
      );

      conductorSockets.set(conductorId, socket.id);
      socketTrips.set(socket.id, { busNumber: busNumber.toUpperCase(), tripId: trip._id, conductorId });

      socket.join(`bus-${busNumber.toUpperCase()}`);
      io.emit('busActive', { busNumber: busNumber.toUpperCase(), routeId, conductorName, tripId: trip._id });
      socket.emit('tripStarted', { tripId: trip._id, busNumber: busNumber.toUpperCase() });
      console.log(`🚌 Trip started: ${busNumber} by ${conductorName}`);
    } catch (err) {
      console.error('startTrip error:', err);
      socket.emit('tripError', { message: 'Failed to start trip: ' + err.message });
    }
  });

  // ── CONDUCTOR: Location Update (heartbeat) ───────────────────────────────
  socket.on('locationUpdate', async (data) => {
    const { busNumber, routeId, variantId, latitude, longitude, speed = 0, heading = 0, accuracy = 0, tripId } = data;
    if (!busNumber || !latitude || !longitude) return;

    const busKey = busNumber.toUpperCase();

    try {
      const now = new Date();

      // ── Nearest stop detection ────────────────────────────────────────────
      let currentStopIdx = busStopIdx.get(busKey) || 0;
      let nearestStopName = null;
      let nearestDistanceM = null;
      let reachedNewStop = false;

      if (variantId) {
        try {
          const result = await detectCurrentStop(variantId, latitude, longitude, currentStopIdx);
          nearestStopName  = result.nearestStopName;
          nearestDistanceM = result.nearestDistanceM;
          reachedNewStop   = result.reachedNewStop;

          // Stop index can only increase (monotonic forward progression)
          if (result.currentStopIdx > currentStopIdx) {
            currentStopIdx = result.currentStopIdx;
            busStopIdx.set(busKey, currentStopIdx);

            // Emit arrival notification when bus reaches a new stop
            if (reachedNewStop && nearestStopName) {
              const nextStop = result.stops[currentStopIdx + 1]?.name || null;
              io.to(`bus-${busKey}`).emit('reachedStop', {
                busNumber: busKey,
                stopName:  nearestStopName,
                stopIdx:   currentStopIdx,
                nextStop,
                distanceM: nearestDistanceM
              });
              console.log(`🚏 ${busKey} reached: ${nearestStopName} → next: ${nextStop || 'destination'}`);
            }
          }
        } catch (stopErr) {
          console.error('Stop detection error:', stopErr.message);
        }
      }

      // ── Update LiveLocation ───────────────────────────────────────────────
      await LiveLocation.findOneAndUpdate(
        { busNumber: busKey },
        {
          latitude, longitude, speed, heading, accuracy,
          currentStopIdx,
          ...(variantId && { variantId }),
          status: 'active',
          updatedAt: now
        },
        { new: true }
      );

      // ── GPS history ───────────────────────────────────────────────────────
      if (tripId) {
        await TripLocation.create({
          tripId, busNumber: busKey,
          latitude, longitude, speed, accuracy,
          timestamp: now
        });
        await TripHistory.findByIdAndUpdate(tripId, { $inc: { totalUpdates: 1 } });
      }

      // ── Broadcast to passengers ───────────────────────────────────────────
      const payload = {
        busNumber: busKey, latitude, longitude, speed, heading, accuracy,
        currentStopIdx, nearestStopName, nearestDistanceM,
        updatedAt: now, status: 'active'
      };
      io.to(`bus-${busKey}`).emit('locationUpdate', payload);
      io.emit('globalLocationUpdate', payload);

    } catch (err) {
      console.error('locationUpdate error:', err);
    }
  });

  // ── PASSENGER: Subscribe to bus ─────────────────────────────────────────
  socket.on('trackBus', async (busNumber) => {
    const room = `bus-${busNumber.toUpperCase()}`;
    socket.join(room);
    // Send current location immediately on subscribe
    try {
      const loc = await LiveLocation.findOne({ busNumber: busNumber.toUpperCase() }).populate('routeId');
      if (loc) socket.emit('locationUpdate', loc);
    } catch(e) {}
  });

  // ── CONDUCTOR: Stop Trip ─────────────────────────────────────────────────
  socket.on('stopTrip', async (data) => {
    const { busNumber, tripId } = data;
    await endTrip(busNumber, tripId, 'manual', socket);
  });

  // ── Handle disconnect (browser closed / network lost) ────────────────────
  socket.on('disconnect', async () => {
    console.log(`🔌 Disconnected: ${socket.id}`);
    const trip = socketTrips.get(socket.id);
    if (trip) {
      const { busNumber, conductorId } = trip;
      // Mark as offline immediately — heartbeat will escalate to 'disconnected'
      await LiveLocation.findOneAndUpdate(
        { busNumber },
        { status: 'offline', updatedAt: new Date() }
      );
      io.emit('busStatus', { busNumber, status: 'offline' });
      conductorSockets.delete(conductorId);
      socketTrips.delete(socket.id);
      console.log(`⚠️  Bus ${busNumber} went offline (disconnect)`);
    }
  });

  // ── Conductor reconnects and restores trip ────────────────────────────────
  socket.on('restoreTrip', async (data) => {
    const { busNumber, tripId, conductorId, conductorName } = data;
    try {
      const live = await LiveLocation.findOne({ busNumber: busNumber.toUpperCase() });
      if (!live) {
        socket.emit('tripError', { message: 'Trip not found. Please start a new trip.' });
        return;
      }
      // Re-associate socket
      conductorSockets.set(conductorId, socket.id);
      socketTrips.set(socket.id, { busNumber: busNumber.toUpperCase(), tripId, conductorId });
      socket.join(`bus-${busNumber.toUpperCase()}`);
      await LiveLocation.findOneAndUpdate({ busNumber: busNumber.toUpperCase() }, { status: 'active', updatedAt: new Date() });
      socket.emit('tripRestored', { busNumber: busNumber.toUpperCase(), tripId });
      io.emit('busStatus', { busNumber: busNumber.toUpperCase(), status: 'active' });
      console.log(`♻️  Trip restored: ${busNumber}`);
    } catch (err) {
      socket.emit('tripError', { message: 'Restore failed: ' + err.message });
    }
  });
});

// ── Helper: end a trip cleanly ────────────────────────────────────────────────
async function endTrip(busNumber, tripId, reason, socket) {
  try {
    const now = new Date();
    if (tripId) {
      const trip = await TripHistory.findById(tripId);
      if (trip) {
        const durationMs = now - trip.startedAt;
        await TripHistory.findByIdAndUpdate(tripId, {
          endedAt: now,
          durationMinutes: Math.round(durationMs / 60000),
          endReason: reason
        });
      }
    }
    busStopIdx.delete(busNumber?.toUpperCase());
    await LiveLocation.deleteOne({ busNumber: busNumber?.toUpperCase() });
    io.emit('busInactive', { busNumber: busNumber?.toUpperCase(), status: 'ended' });
    if (socket) socket.emit('tripEnded', { busNumber });
    console.log(`🛑 Trip ended: ${busNumber} (${reason})`);
  } catch (err) {
    console.error('endTrip error:', err);
  }
}

// ── Heartbeat Monitor: runs every 10 seconds ──────────────────────────────────
// Marks buses offline after 60s, disconnected after 5min
setInterval(async () => {
  try {
    const now = Date.now();
    const offlineCutoff      = new Date(now - 60  * 1000);  // 60 seconds
    const disconnectedCutoff = new Date(now - 300 * 1000);  // 5 minutes

    // Active → Offline
    const wentOffline = await LiveLocation.updateMany(
      { status: 'active', updatedAt: { $lt: offlineCutoff } },
      { status: 'offline' }
    );
    if (wentOffline.modifiedCount > 0) {
      const offlineBuses = await LiveLocation.find({ status: 'offline', updatedAt: { $lt: offlineCutoff } });
      offlineBuses.forEach(b => io.emit('busStatus', { busNumber: b.busNumber, status: 'offline' }));
    }

    // Offline → Disconnected
    const wentDisconnected = await LiveLocation.updateMany(
      { status: 'offline', updatedAt: { $lt: disconnectedCutoff } },
      { status: 'disconnected' }
    );
    if (wentDisconnected.modifiedCount > 0) {
      const discoBuses = await LiveLocation.find({ status: 'disconnected', updatedAt: { $lt: disconnectedCutoff } });
      discoBuses.forEach(b => io.emit('busStatus', { busNumber: b.busNumber, status: 'disconnected' }));
      console.log(`⚡ ${wentDisconnected.modifiedCount} bus(es) marked disconnected`);
    }
  } catch (err) {
    console.error('Heartbeat error:', err);
  }
}, 10000);

// ── Cleanup Cron: runs daily at 2 AM ──────────────────────────────────────────
cron.schedule('0 2 * * *', async () => {
  try {
    const cutoff24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

    // End disconnected trips that are >24h old (auto)
    const staleTrips = await LiveLocation.find({
      status: 'disconnected',
      updatedAt: { $lt: cutoff24h }
    });

    for (const loc of staleTrips) {
      await endTrip(loc.busNumber, loc.tripId, 'auto', null);
    }

    // Archive completed trips older than 24h
    await TripHistory.updateMany(
      { endedAt: { $lt: cutoff24h }, archivedAt: null },
      { archivedAt: new Date() }
    );

    console.log(`🧹 Cleanup: ended ${staleTrips.length} stale trips, archived old records`);
  } catch (err) {
    console.error('Cleanup cron error:', err);
  }
});

app.set('io', io);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 KSRTC Tracker v2 running on http://localhost:${PORT}`);
});
