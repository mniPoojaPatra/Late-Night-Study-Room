import "dotenv/config";
import express from "express";
import http from "node:http";
import cors from "cors";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { Server } from "socket.io";

const app = express();
const server = http.createServer(app);
const PORT = process.env.SERVER_PORT || 4000;
const JWT_SECRET = process.env.JWT_SECRET || "dev-late-night-study-secret";
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || "http://localhost:5173";
const allowedOrigins = new Set([
  CLIENT_ORIGIN,
  "http://localhost:5173",
  "http://127.0.0.1:5173"
]);

const users = new Map();
const rooms = [
  { id: "rainy-desk", name: "Rainy Desk", theme: "Rain on window", live: 34 },
  { id: "lofi-cafe", name: "Lo-fi Cafe", theme: "Warm lamps", live: 46 },
  { id: "midnight-library", name: "Midnight Library", theme: "Quiet stacks", live: 58 }
];

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.has(origin)) return callback(null, true);
    return callback(new Error(`Origin ${origin} is not allowed by CORS.`));
  },
  credentials: true
}));
app.use(express.json());

const createToken = (user) =>
  jwt.sign({ id: user.id, email: user.email, name: user.name }, JWT_SECRET, { expiresIn: "7d" });

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, app: "Late Night Study Room" });
});

app.get("/api/rooms", (_req, res) => {
  res.json({ rooms });
});

app.post("/api/auth/signup", async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ message: "Name, email, and password are required." });
  }
  if (users.has(email)) {
    return res.status(409).json({ message: "An account already exists for this email." });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = { id: crypto.randomUUID(), name, email, passwordHash, streak: 0, bio: "", focusSessions: 0, tasksCreated: 0 };
  users.set(email, user);
  res.status(201).json({
    token: createToken(user),
    user: { id: user.id, name, email, streak: user.streak, bio: user.bio, focusSessions: user.focusSessions, tasksCreated: user.tasksCreated }
  });
});

app.post("/api/auth/login", async (req, res) => {
  const { email, password } = req.body;
  const user = users.get(email);
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return res.status(401).json({ message: "Invalid email or password." });
  }
  res.json({
    token: createToken(user),
    user: {
      id: user.id,
      name: user.name,
      email,
      streak: user.streak || 0,
      bio: user.bio || "",
      focusSessions: user.focusSessions || 0,
      tasksCreated: user.tasksCreated || 0
    }
  });
});

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

const io = new Server(server, {
  cors: {
    origin: CLIENT_ORIGIN,
    methods: ["GET", "POST"]
  }
});

io.on("connection", (socket) => {
  socket.on("room:join", ({ roomId, user }) => {
    socket.join(roomId);
    socket.data.roomId = roomId;
    socket.data.user = user || { name: "Night Scholar" };
    
    io.to(roomId).emit("presence:update", {
      message: `${socket.data.user.name} settled into the room.`,
      count: io.sockets.adapter.rooms.get(roomId)?.size || 1
    });

    const state = getOrCreateRoomState(roomId);
    socket.emit("timer:update", getCleanTimer(state.timer));
  });

  socket.on("chat:message", (payload) => {
    const roomId = socket.data.roomId || payload.roomId || "rainy-desk";
    io.to(roomId).emit("chat:message", {
      id: crypto.randomUUID(),
      user: socket.data.user?.name || "Night Scholar",
      text: payload.text,
      createdAt: new Date().toISOString()
    });
  });

  socket.on("typing", ({ roomId, user }) => {
    socket.to(roomId).emit("typing", { user });
  });

  socket.on("timer:start", ({ roomId, duration }) => {
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
    }
  });

  socket.on("timer:pause", ({ roomId }) => {
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
  });

  socket.on("timer:reset", ({ roomId, duration }) => {
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
  });

  socket.on("disconnect", () => {
    const roomId = socket.data.roomId;
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
  });
});

server.listen(PORT, () => {
  console.log(`Late Night Study Room API listening on ${PORT}`);
});

