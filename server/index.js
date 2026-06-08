import "dotenv/config";
import express from "express";
import http from "node:http";
import cors from "cors";
import cookieParser from "cookie-parser";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { Server } from "socket.io";

// ─── Env validation: fail fast if required vars are missing ───
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 32) {
  console.error(
    "[FATAL] JWT_SECRET is missing or too short (min 32 chars). " +
    "Set it in .env — generate with: node -e \"console.log(require('crypto').randomBytes(64).toString('hex'))\""
  );
  process.exit(1);
}

const PORT = process.env.SERVER_PORT || 4000;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || "http://localhost:5173";
const IS_PRODUCTION = process.env.NODE_ENV === "production";

const allowedOrigins = new Set([
  CLIENT_ORIGIN,
  "http://localhost:5173",
  "http://127.0.0.1:5173"
]);

// ─── Data stores (in-memory) ───
const users = new Map();
const loginAttempts = new Map(); // email → { count, lockedUntil }
const rooms = [
  { id: "rainy-desk", name: "Rainy Desk", theme: "Rain on window", live: 34 },
  { id: "lofi-cafe", name: "Lo-fi Cafe", theme: "Warm lamps", live: 46 },
  { id: "midnight-library", name: "Midnight Library", theme: "Quiet stacks", live: 58 }
];

// ─── Zod schemas ───
const signupSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(50, "Name too long"),
  email: z.string().email("Invalid email format").max(254, "Email too long"),
  password: z.string().min(8, "Password must be at least 8 characters").max(128, "Password too long")
});

const loginSchema = z.object({
  email: z.string().email("Invalid email format").max(254),
  password: z.string().min(1, "Password is required").max(128)
});

const chatMessageSchema = z.object({
  roomId: z.string().max(100).optional(),
  text: z.string().trim().min(1, "Message cannot be empty").max(1000, "Message too long")
});

const roomIdSchema = z.string().max(100);
const timerDurationSchema = z.number().int().min(60).max(10800); // 1 min to 3 hours

// ─── Express app ───
const app = express();
const server = http.createServer(app);

// Security headers via helmet
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "blob:"],
      connectSrc: ["'self'", CLIENT_ORIGIN, `ws://localhost:${PORT}`, `wss://localhost:${PORT}`],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"]
    }
  },
  crossOriginEmbedderPolicy: false, // Allow audio loading
  xFrameOptions: { action: "deny" },
  referrerPolicy: { policy: "strict-origin-when-cross-origin" }
}));

// Remove X-Powered-By (helmet does this by default, explicit for clarity)
app.disable("x-powered-by");

// CORS — restricted methods
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.has(origin)) return callback(null, true);
    return callback(new Error("Not allowed by CORS"));
  },
  methods: ["GET", "POST"],
  credentials: true
}));

// Cookie parser
app.use(cookieParser());

// Body parser with size limit
app.use(express.json({ limit: "10kb" }));

// ─── Rate limiters ───
const generalLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Please try again later." },
  handler: (_req, res, _next, options) => {
    serverLog("RATE_LIMIT", "General rate limit exceeded", { ip: _req.ip });
    res.status(429).json(options.message);
  }
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many authentication attempts. Please try again in 15 minutes." },
  handler: (_req, res, _next, options) => {
    serverLog("RATE_LIMIT", "Auth rate limit exceeded", { ip: _req.ip });
    res.status(429).json(options.message);
  }
});

app.use("/api", generalLimiter);
app.use("/api/auth", authLimiter);

// ─── Structured logging ───
function serverLog(level, message, context = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...context
  };
  if (level === "ERROR") {
    console.error(JSON.stringify(entry));
  } else {
    console.log(JSON.stringify(entry));
  }
}

// ─── Account lockout ───
const LOCKOUT_THRESHOLD = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes

function checkLockout(email) {
  const record = loginAttempts.get(email);
  if (!record) return false;
  if (record.lockedUntil && Date.now() < record.lockedUntil) return true;
  if (record.lockedUntil && Date.now() >= record.lockedUntil) {
    loginAttempts.delete(email);
    return false;
  }
  return false;
}

function recordFailedLogin(email) {
  const record = loginAttempts.get(email) || { count: 0, lockedUntil: null };
  record.count += 1;
  if (record.count >= LOCKOUT_THRESHOLD) {
    record.lockedUntil = Date.now() + LOCKOUT_DURATION_MS;
    serverLog("SECURITY", "Account locked due to repeated failed login attempts", { email });
  }
  loginAttempts.set(email, record);
}

function clearLoginAttempts(email) {
  loginAttempts.delete(email);
}

// ─── JWT helpers ───
const COOKIE_NAME = "lnsr_token";

function createToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, name: user.name },
    JWT_SECRET,
    { expiresIn: "1h" }
  );
}

function setTokenCookie(res, token) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: IS_PRODUCTION,
    sameSite: IS_PRODUCTION ? "strict" : "lax",
    maxAge: 60 * 60 * 1000, // 1 hour
    path: "/"
  });
}

function clearTokenCookie(res) {
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    secure: IS_PRODUCTION,
    sameSite: IS_PRODUCTION ? "strict" : "lax",
    path: "/"
  });
}

function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}


// ─── Sanitize user object for responses (never expose passwordHash) ───
function sanitizeUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    streak: user.streak || 0,
    bio: user.bio || "",
    focusSessions: user.focusSessions || 0,
    tasksCreated: user.tasksCreated || 0
  };
}

// ─── Routes ───
app.get("/api/health", (_req, res) => {
  res.json({ ok: true, app: "Late Night Study Room" });
});

app.get("/api/rooms", (_req, res) => {
  res.json({ rooms });
});

app.post("/api/auth/signup", async (req, res) => {
  try {
    const parsed = signupSchema.safeParse(req.body);
    if (!parsed.success) {
      const firstError = parsed.error.issues[0]?.message || "Invalid input.";
      return res.status(400).json({ error: firstError });
    }

    const { name, email, password } = parsed.data;

    if (users.has(email)) {
      return res.status(409).json({ error: "An account already exists for this email." });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = {
      id: crypto.randomUUID(),
      name,
      email,
      passwordHash,
      streak: 0,
      bio: "",
      focusSessions: 0,
      tasksCreated: 0
    };
    users.set(email, user);

    const token = createToken(user);
    setTokenCookie(res, token);

    serverLog("AUTH", "New user signed up", { userId: user.id, email });
    res.status(201).json({ user: sanitizeUser(user) });
  } catch (err) {
    serverLog("ERROR", "Signup failed", { error: err.message });
    res.status(500).json({ error: "Something went wrong." });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      const firstError = parsed.error.issues[0]?.message || "Invalid input.";
      return res.status(400).json({ error: firstError });
    }

    const { email, password } = parsed.data;

    // Account lockout check
    if (checkLockout(email)) {
      return res.status(429).json({
        error: "Account temporarily locked due to too many failed attempts. Try again in 15 minutes."
      });
    }

    const user = users.get(email);
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      recordFailedLogin(email);
      return res.status(401).json({ error: "Invalid email or password." });
    }

    clearLoginAttempts(email);

    const token = createToken(user);
    setTokenCookie(res, token);

    serverLog("AUTH", "User logged in", { userId: user.id, email });
    res.json({ user: sanitizeUser(user) });
  } catch (err) {
    serverLog("ERROR", "Login failed", { error: err.message });
    res.status(500).json({ error: "Something went wrong." });
  }
});

app.post("/api/auth/logout", (_req, res) => {
  clearTokenCookie(res);
  serverLog("AUTH", "User logged out");
  res.json({ ok: true });
});

app.get("/api/auth/me", (req, res) => {
  try {
    const token = req.cookies[COOKIE_NAME];
    if (!token) return res.status(401).json({ error: "Not authenticated." });

    const decoded = verifyToken(token);
    if (!decoded) return res.status(401).json({ error: "Session expired." });

    const user = users.get(decoded.email);
    if (!user) return res.status(401).json({ error: "User not found." });

    res.json({ user: sanitizeUser(user) });
  } catch (err) {
    serverLog("ERROR", "Session verification failed", { error: err.message });
    res.status(500).json({ error: "Something went wrong." });
  }
});

// ─── Room timer state ───
const roomStates = new Map();

function getOrCreateRoomState(roomId) {
  if (!roomStates.has(roomId)) {
    roomStates.set(roomId, {
      timer: {
        running: false,
        duration: 25 * 60,
        timeLeft: 25 * 60,
        endTime: null,
        intervalId: null
      }
    });
  }
  return roomStates.get(roomId);
}

function getCleanTimer(timer) {
  return {
    running: timer.running,
    duration: timer.duration,
    timeLeft: timer.timeLeft,
    endTime: timer.endTime
  };
}

// ─── Socket.io ───
const io = new Server(server, {
  cors: {
    origin(origin, callback) {
      if (!origin || allowedOrigins.has(origin)) return callback(null, true);
      return callback(new Error("Not allowed by CORS"));
    },
    methods: ["GET", "POST"],
    credentials: true
  }
});

// ─── Socket event throttling ───
const socketMessageTimestamps = new Map(); // socketId → [timestamps]
const SOCKET_THROTTLE_WINDOW_MS = 10000; // 10 seconds
const SOCKET_THROTTLE_MAX = 10; // max 10 messages per window

function isSocketThrottled(socketId) {
  const now = Date.now();
  let timestamps = socketMessageTimestamps.get(socketId) || [];
  // Remove timestamps outside the window
  timestamps = timestamps.filter((t) => now - t < SOCKET_THROTTLE_WINDOW_MS);
  if (timestamps.length >= SOCKET_THROTTLE_MAX) {
    socketMessageTimestamps.set(socketId, timestamps);
    return true;
  }
  timestamps.push(now);
  socketMessageTimestamps.set(socketId, timestamps);
  return false;
}

io.on("connection", (socket) => {
  serverLog("SOCKET", "Client connected", { socketId: socket.id });

  socket.on("room:join", (payload) => {
    try {
      const roomId = roomIdSchema.parse(payload?.roomId || "rainy-desk");
      const userName = typeof payload?.user?.name === "string"
        ? payload.user.name.slice(0, 50)
        : "Night Scholar";

      socket.join(roomId);
      socket.data.roomId = roomId;
      socket.data.user = { name: userName };

      io.to(roomId).emit("presence:update", {
        message: `${userName} settled into the room.`,
        count: io.sockets.adapter.rooms.get(roomId)?.size || 1
      });

      const state = getOrCreateRoomState(roomId);
      socket.emit("timer:update", getCleanTimer(state.timer));
    } catch (err) {
      serverLog("ERROR", "Invalid room:join payload", { socketId: socket.id, error: err.message });
    }
  });

  socket.on("chat:message", (payload) => {
    try {
      if (isSocketThrottled(socket.id)) {
        socket.emit("chat:error", { error: "You're sending messages too quickly. Slow down." });
        return;
      }

      const parsed = chatMessageSchema.safeParse(payload);
      if (!parsed.success) {
        socket.emit("chat:error", { error: parsed.error.issues[0]?.message || "Invalid message." });
        return;
      }

      const roomId = socket.data.roomId || parsed.data.roomId || "rainy-desk";
      io.to(roomId).emit("chat:message", {
        id: crypto.randomUUID(),
        user: socket.data.user?.name || "Night Scholar",
        text: parsed.data.text,
        createdAt: new Date().toISOString()
      });
    } catch (err) {
      serverLog("ERROR", "chat:message error", { socketId: socket.id, error: err.message });
    }
  });

  socket.on("typing", (payload) => {
    try {
      const roomId = socket.data.roomId;
      if (!roomId) return;
      const userName = typeof payload?.user === "string" ? payload.user.slice(0, 50) : "Someone";
      socket.to(roomId).emit("typing", { user: userName });
    } catch (err) {
      serverLog("ERROR", "typing error", { socketId: socket.id, error: err.message });
    }
  });

  socket.on("timer:start", (payload) => {
    try {
      const roomId = roomIdSchema.parse(payload?.roomId || socket.data.roomId);
      const duration = timerDurationSchema.parse(payload?.duration);
      const state = getOrCreateRoomState(roomId);

      if (!state.timer.running) {
        state.timer.running = true;
        state.timer.duration = duration;
        state.timer.timeLeft = duration;
        state.timer.endTime = Date.now() + duration * 1000;

        if (state.timer.intervalId) clearInterval(state.timer.intervalId);

        state.timer.intervalId = setInterval(() => {
          const remaining = Math.max(0, Math.round((state.timer.endTime - Date.now()) / 1000));
          state.timer.timeLeft = remaining;

          io.to(roomId).emit("timer:sync", getCleanTimer(state.timer));

          if (remaining <= 0) {
            state.timer.running = false;
            clearInterval(state.timer.intervalId);
            state.timer.intervalId = null;
            io.to(roomId).emit("timer:complete", { message: "Focus timer complete!" });
            io.to(roomId).emit("timer:update", getCleanTimer(state.timer));
          }
        }, 1000);

        io.to(roomId).emit("timer:update", getCleanTimer(state.timer));
        serverLog("TIMER", "Timer started", { roomId, duration });
      }
    } catch (err) {
      serverLog("ERROR", "timer:start error", { socketId: socket.id, error: err.message });
    }
  });

  socket.on("timer:pause", (payload) => {
    try {
      const roomId = roomIdSchema.parse(payload?.roomId || socket.data.roomId);
      const state = getOrCreateRoomState(roomId);

      if (state.timer.running) {
        state.timer.running = false;
        if (state.timer.intervalId) {
          clearInterval(state.timer.intervalId);
          state.timer.intervalId = null;
        }
        state.timer.timeLeft = Math.max(0, Math.round((state.timer.endTime - Date.now()) / 1000));
        state.timer.endTime = null;
        io.to(roomId).emit("timer:update", getCleanTimer(state.timer));
      }
    } catch (err) {
      serverLog("ERROR", "timer:pause error", { socketId: socket.id, error: err.message });
    }
  });

  socket.on("timer:reset", (payload) => {
    try {
      const roomId = roomIdSchema.parse(payload?.roomId || socket.data.roomId);
      const duration = timerDurationSchema.parse(payload?.duration);
      const state = getOrCreateRoomState(roomId);

      state.timer.running = false;
      if (state.timer.intervalId) {
        clearInterval(state.timer.intervalId);
        state.timer.intervalId = null;
      }
      state.timer.duration = duration;
      state.timer.timeLeft = duration;
      state.timer.endTime = null;
      io.to(roomId).emit("timer:update", getCleanTimer(state.timer));
    } catch (err) {
      serverLog("ERROR", "timer:reset error", { socketId: socket.id, error: err.message });
    }
  });

  socket.on("disconnect", () => {
    const roomId = socket.data.roomId;
    socketMessageTimestamps.delete(socket.id);

    if (!roomId) return;
    const roomSize = io.sockets.adapter.rooms.get(roomId)?.size || 0;

    io.to(roomId).emit("presence:update", {
      message: `${socket.data.user?.name || "Someone"} stepped away.`,
      count: roomSize
    });

    if (roomSize === 0) {
      const state = roomStates.get(roomId);
      if (state) {
        if (state.timer.intervalId) {
          clearInterval(state.timer.intervalId);
        }
        roomStates.delete(roomId);
      }
    }

    serverLog("SOCKET", "Client disconnected", { socketId: socket.id, roomId });
  });
});

// ─── Global error handler (never expose internals) ───
app.use((err, _req, res, _next) => {
  serverLog("ERROR", "Unhandled server error", { error: err.message, stack: err.stack });
  res.status(500).json({ error: "Something went wrong." });
});

// ─── Start ───
server.listen(PORT, () => {
  serverLog("INFO", `Late Night Study Room API listening on port ${PORT}`, {
    environment: IS_PRODUCTION ? "production" : "development"
  });
});
