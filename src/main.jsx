import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { motion, AnimatePresence } from "framer-motion";
import {
  Bell,
  Check,
  CloudRain,
  Coffee,
  Flame,
  Headphones,
  Keyboard,
  Leaf,
  LogIn,
  LogOut,
  Moon,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Send,
  Sparkles,
  Timer,
  Trophy,
  User,
  Users,
  Volume2,
  Waves,
  X,
  Zap
} from "lucide-react";
import { io } from "socket.io-client";
import { create } from "zustand";
import { Howl } from "howler";
import "./styles.css";

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || "http://127.0.0.1:4000";
const API_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:4000";

const rooms = [
  { id: "rainy-desk", name: "Rainy Desk #1", live: 34, theme: "Rain on glass", tone: "Deep focus" },
  { id: "lofi-cafe", name: "Lo-fi Cafe #2", live: 46, theme: "Warm lamps", tone: "Quiet sprints" },
  { id: "midnight-library", name: "Library #3", live: 58, theme: "Soft pages", tone: "Reading room" }
];

const testimonials = [
  { name: "Mina", role: "Design student", quote: "It feels like joining a study stream, but calmer and more personal." },
  { name: "Theo", role: "Frontend dev", quote: "The room stayed open while I wrote my thesis notes. Oddly comforting." },
  { name: "Nara", role: "Exam prep", quote: "The timer, rain, and soft chat made late work feel less lonely." }
];

const profileAvatars = [
  { id: "crescent", label: "Crescent Notes", colors: ["#e2d2b7", "#4d3726"], mark: "moon" },
  { id: "rain", label: "Rain Desk", colors: ["#bad4d1", "#1d2a2d"], mark: "rain" },
  { id: "lamp", label: "Lamp Glow", colors: ["#e2d2b7", "#8c6d4f"], mark: "spark" },
  { id: "library", label: "Quiet Library", colors: ["#dfe3e8", "#2a211a"], mark: "book" },
  { id: "matcha", label: "Matcha Break", colors: ["#bad4d1", "#56634e"], mark: "leaf" },
  { id: "coffee", label: "Coffee Focus", colors: ["#8c6d4f", "#3b281c"], mark: "cup" },
  { id: "starlight", label: "Starlight", colors: ["#dfe3e8", "#141c21"], mark: "star" },
  { id: "fireplace", label: "Fireplace", colors: ["#e2d2b7", "#5a2f1f"], mark: "fire" }
];

const initialTasks = [
  { id: 1, label: "Review algorithms notes", done: true },
  { id: 2, label: "Finish UI polish pass", done: true },
  { id: 3, label: "Read two research pages", done: false },
  { id: 4, label: "Plan tomorrow's study block", done: false }
];

const useStudyStore = create((set) => ({
  activeRoom: rooms[0],
  currentRoomView: null,
  mood: "Rainy Cafe",
  focusMode: false,
  appPage: "dashboard",
  user: JSON.parse(localStorage.getItem("lnsr-user") || "null"),
  avatar: localStorage.getItem("lnsr-avatar") || "crescent",
  toast: "",
  tasks: initialTasks,
  customRooms: [],
  roomAccess: {},
  setRoom: (room) => set({ activeRoom: room }),
  enterRoom: (room) => set({ currentRoomView: room, activeRoom: room }),
  exitRoom: () => set({ currentRoomView: null }),
  setMood: (mood) => set({ mood }),
  setPage: (appPage) => set({ appPage, currentRoomView: null }),
  toggleFocus: () => set((state) => ({ focusMode: !state.focusMode })),
  setToast: (toast) => set({ toast }),
  setAvatar: (avatar) => {
    localStorage.setItem("lnsr-avatar", avatar);
    set({ avatar });
  },
  setUser: (user) => {
    const normalized = user ? { streak: 0, bio: "", focusSessions: 0, tasksCreated: 0, ...user } : null;
    if (normalized) localStorage.setItem("lnsr-user", JSON.stringify(normalized));
    else {
      localStorage.removeItem("lnsr-user");
      localStorage.removeItem("lnsr-token");
    }
    set({ user: normalized });
  },
  updateProfile: (updates) =>
    set((state) => ({
      user: (() => {
        const next = { ...state.user, ...updates };
        localStorage.setItem("lnsr-user", JSON.stringify(next));
        return next;
      })()
    })),
  touchStreak: (reason) =>
    set((state) => {
      const user = state.user;
      if (!user) return {};
      const next = {
        ...user,
        streak: Math.max(1, user.streak || 0),
        focusSessions: reason === "focus" ? (user.focusSessions || 0) + 1 : user.focusSessions || 0,
        tasksCreated: reason === "task" ? (user.tasksCreated || 0) + 1 : user.tasksCreated || 0
      };
      localStorage.setItem("lnsr-user", JSON.stringify(next));
      return { user: next };
    }),
  addRoom: (name, code) =>
    set((state) => ({
      customRooms: [...state.customRooms, { id: `custom-${Date.now()}`, name, code, live: 1, theme: "Access code room", tone: "Private room" }]
    })),
  addTask: (label) =>
    set((state) => ({ tasks: [...state.tasks, { id: Date.now(), label, done: false }] })),
  updateTask: (id, label) =>
    set((state) => ({ tasks: state.tasks.map((task) => (task.id === id ? { ...task, label } : task)) })),
  deleteTask: (id) =>
    set((state) => ({ tasks: state.tasks.filter((task) => task.id !== id) })),
  unlockRoom: (roomId) =>
    set((state) => ({ roomAccess: { ...state.roomAccess, [roomId]: true } })),
  toggleTask: (id) =>
    set((state) => ({
      tasks: state.tasks.map((task) => (task.id === id ? { ...task, done: !task.done } : task))
    }))
}));

function App() {
  const { mood, focusMode, toast, setToast, user } = useStudyStore();
  const [authOpen, setAuthOpen] = useState(false);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(""), 2600);
    return () => window.clearTimeout(timer);
  }, [toast, setToast]);

  return (
    <main className={`app-shell mood-${mood.toLowerCase().replaceAll(" ", "-")}`}>
      <AmbientBackdrop mood={mood} />
      <Nav onLogin={() => setAuthOpen(true)} />
      <AnimatePresence mode="wait">
        {focusMode && user ? <FocusMode key="focus" /> : user ? <StudyApp key="app" /> : <Landing key="landing" onLogin={() => setAuthOpen(true)} />}
      </AnimatePresence>
      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} />
      <AnimatePresence>
        {toast ? (
          <motion.div className="toast glass-panel" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 14 }}>
            {toast}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </main>
  );
}

function AmbientBackdrop({ mood }) {
  return (
    <div className="ambient-backdrop" aria-hidden="true">
      <div className="lamp-glow" />
      <div className="cool-fog" />
      <div className="moon-shine" />
      <div className="rain-field">
        {Array.from({ length: 42 }).map((_, index) => (
          <i key={index} style={{ "--x": `${(index * 37) % 100}%`, "--delay": `${(index % 9) * -0.7}s`, "--h": `${28 + (index % 5) * 12}px` }} />
        ))}
      </div>
      <div className="particle-field">
        {Array.from({ length: 18 }).map((_, index) => (
          <span key={index} style={{ "--x": `${(index * 53) % 100}%`, "--delay": `${index * -0.4}s` }} />
        ))}
      </div>
      <div className="mood-label">{mood}</div>
    </div>
  );
}

function Nav({ onLogin }) {
  const { user, setUser, setPage, toggleFocus, setToast } = useStudyStore();
  const [notificationsOpen, setNotificationsOpen] = useState(false);

  return (
    <header className="nav glass-panel">
      <button className="brand brand-button" onClick={() => (user ? setPage("dashboard") : window.scrollTo({ top: 0, behavior: "smooth" }))}>
        <Moon size={18} />
        <span>Late Night Study Room</span>
      </button>
      <nav>
        {user ? (
          <>
            <button className="nav-link" onClick={() => setPage("rooms")}>Rooms</button>
            <button className="nav-link" onClick={() => setPage("tasks")}>Tasks</button>
            <button className="nav-link" onClick={toggleFocus}>Focus</button>
            <button className="nav-link" onClick={() => setPage("profile")}>Profile</button>
          </>
        ) : (
          <>
            <a href="#features">Features</a>
            <a href="#reviews">Reviews</a>
            <button className="nav-link" onClick={onLogin}>Join</button>
          </>
        )}
      </nav>
      <div className="nav-actions">
        {user ? (
          <>
            <button className="icon-button" title="Focus mode" onClick={toggleFocus}>
              <Timer size={18} />
            </button>
            <button className="icon-button" title="Notifications" onClick={() => setNotificationsOpen((value) => !value)}>
              <Bell size={18} />
            </button>
            <button className="soft-button compact" onClick={() => setPage("profile")}>
              <Avatar size="tiny" />
              {user.name}
            </button>
            <button className="icon-button" title="Logout" onClick={() => setUser(null)}>
              <LogOut size={18} />
            </button>
          </>
        ) : (
          <button className="soft-button compact" onClick={onLogin}>
            <LogIn size={16} />
            Login
          </button>
        )}
      </div>
      <AnimatePresence>
        {notificationsOpen ? (
          <motion.div className="notification-popover glass-panel" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
            <strong>Quiet reminders</strong>
            <button onClick={() => setToast("Break reminder set for the next focus cycle.")}>Next break in 25 minutes</button>
            <button onClick={() => setToast("Room notifications muted for this session.")}>Mute room pings</button>
            <button onClick={() => setToast("Daily goal saved to your study dashboard.")}>Save daily goal</button>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </header>
  );
}

function Landing({ onLogin }) {
  return (
    <motion.div className="landing-stack" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -14 }}>
      <Hero onLogin={onLogin} />
      <FeatureShowcase />
    </motion.div>
  );
}

function Hero({ onLogin }) {
  const [shine, setShine] = useState({ x: 68, y: 34 });

  return (
    <section
      id="hero"
      className="hero glass-panel"
      onPointerMove={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        setShine({ x: ((event.clientX - rect.left) / rect.width) * 100, y: ((event.clientY - rect.top) / rect.height) * 100 });
      }}
      style={{ "--shine-x": `${shine.x}%`, "--shine-y": `${shine.y}%` }}
    >
      <div className="hero-copy">
        <p className="eyebrow">Cozy midnight study cafe</p>
        <h1>Late Night Study Room</h1>
        <p className="hero-text">
          A calm digital place for students, developers, and night thinkers to focus together with soft rooms, quiet chat, ambient sound, and gentle streaks.
        </p>
        <div className="button-row">
          <button className="primary-button" onClick={onLogin}>
            <Users size={18} />
            Join a Study Room
          </button>
          <button className="soft-button" onClick={onLogin}>
            <Sparkles size={18} />
            Start Focusing
          </button>
          <button className="ghost-button" onClick={onLogin}>Create account</button>
        </div>
      </div>
      <StudyScene />
    </section>
  );
}

function StudyScene() {
  const [lampOn, setLampOn] = useState(true);
  const [ambienceOn, setAmbienceOn] = useState(false);

  return (
    <div className={`study-scene ${lampOn ? "lamp-on" : "lamp-off"} ${ambienceOn ? "ambience-on" : ""}`} aria-label="Animated late-night desk scene">
      <div className="window">
        <span />
        <span />
        {ambienceOn && (
          <div className="window-rain">
            {Array.from({ length: 25 }).map((_, index) => (
              <i
                key={index}
                style={{
                  "--x": `${(index * 13) % 100}%`,
                  "--delay": `${(index % 7) * -0.3}s`,
                  "--h": `${15 + (index % 3) * 8}px`
                }}
              />
            ))}
          </div>
        )}
      </div>
      <div className="lamp"><i /></div>
      <div className="desk">
        <div className="laptop"><span /><span /><span /></div>
        <div className="mug" />
        <div className="plant"><i /><i /><i /></div>
      </div>
      <div className="scene-status">
        <button className="scene-chip" onClick={() => setLampOn((value) => !value)}>
          <Sparkles size={14} />
          Lamp {lampOn ? "on" : "off"}
        </button>
        <button className="scene-chip" onClick={() => setAmbienceOn((value) => !value)}>
          <Volume2 size={14} />
          Ambience {ambienceOn ? "on" : "off"}
        </button>
      </div>
    </div>
  );
}

function FeatureShowcase() {
  const features = [
    { icon: <Timer size={18} />, title: "Synced pomodoro", text: "Run focus and break cycles from your private dashboard after login." },
    { icon: <Headphones size={18} />, title: "Ambient mixer", text: "Blend rain, cafe, keys, thunder, and fireplace in a dedicated sound page." },
    { icon: <Leaf size={18} />, title: "Mood themes", text: "Choose wallpapers, glows, and profile avatars that match your study mood." }
  ];

  return (
    <section id="features" className="feature-band landing-features">
      {features.map((feature) => (
        <article className="glass-panel feature-card" key={feature.title}>
          {feature.icon}
          <h3>{feature.title}</h3>
          <p>{feature.text}</p>
        </article>
      ))}
      <div id="reviews" className="testimonial-strip glass-panel">
        <div className="review-heading">
          <span>Study notes from the room</span>
          <strong>Soft proof that the space feels alive.</strong>
        </div>
        {testimonials.map((item, index) => (
          <article className="review-card" key={item.name}>
            <div className="review-avatar">{item.name[0]}</div>
            <p>{item.quote}</p>
            <footer>
              <strong>{item.name}</strong>
              <span>{item.role}</span>
            </footer>
            <i style={{ "--delay": `${index * 0.4}s` }} />
          </article>
        ))}
      </div>
    </section>
  );
}

function StudyApp() {
  const { appPage, currentRoomView } = useStudyStore();

  if (currentRoomView) {
    return (
      <motion.div className="app-workspace full-room" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
        <ActiveRoomPage room={currentRoomView} />
      </motion.div>
    );
  }

  const pages = {
    dashboard: <DashboardPage />,
    rooms: <RoomsPage />,
    tasks: <TasksPage />,
    ambient: <AmbientPage />,
    themes: <ThemesPage />,
    streaks: <StreaksPage />,
    profile: <ProfilePage />
  };

  return (
    <motion.div className="app-workspace" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -14 }}>
      <AppSidebar />
      <section className="workspace-panel">
        <AnimatePresence mode="wait">
          <motion.div key={appPage} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
            {pages[appPage]}
          </motion.div>
        </AnimatePresence>
      </section>
    </motion.div>
  );
}

function AppSidebar() {
  const { appPage, setPage } = useStudyStore();
  const items = [
    ["dashboard", Coffee, "Dashboard"],
    ["rooms", Users, "Rooms"],
    ["tasks", Check, "Tasks"],
    ["ambient", Waves, "Ambient"],
    ["themes", Sparkles, "Themes"],
    ["streaks", Trophy, "Streaks"],
    ["profile", User, "Profile"]
  ];

  return (
    <aside className="app-sidebar glass-panel">
      {items.map(([id, Icon, label]) => (
        <button className={appPage === id ? "active" : ""} key={id} onClick={() => setPage(id)}>
          <Icon size={17} />
          {label}
        </button>
      ))}
    </aside>
  );
}

function DashboardPage() {
  const { user, setPage } = useStudyStore();

  return (
    <PageFrame eyebrow="Dashboard" title={`Good evening, ${user?.name || "Scholar"}`}>
      <div className="stat-grid">
        <StatCard label="Focus streak" value={`${user?.streak || 0} nights`} />
        <StatCard label="Study hours" value="84.5" />
        <StatCard label="Daily goal" value="72%" />
        <StatCard label="Room rank" value="#18" />
      </div>
      <div className="dashboard-split">
        <div className="glass-panel section-panel">
          <SectionTitle icon={<Coffee size={16} />} title="Weekly rhythm" />
          <div className="analytics">
            {[42, 64, 51, 78, 88, 61, 92].map((value, index) => (
              <span key={index} style={{ height: `${value}%` }} />
            ))}
          </div>
        </div>
        <div className="glass-panel section-panel quick-actions">
          <SectionTitle icon={<Sparkles size={16} />} title="Tonight" />
          <button className="primary-button" onClick={() => setPage("rooms")}>Join room</button>
          <button className="soft-button" onClick={() => setPage("tasks")}>Plan tasks</button>
          <button className="ghost-button" onClick={() => setPage("ambient")}>Tune ambience</button>
        </div>
      </div>
    </PageFrame>
  );
}

function RoomsPage() {
  const { enterRoom, setToast, customRooms, addRoom, roomAccess, unlockRoom } = useStudyStore();
  const [roomName, setRoomName] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [joinCodes, setJoinCodes] = useState({});
  const [searchQuery, setSearchQuery] = useState("");
  const allRooms = [...rooms, ...customRooms];

  const filteredRooms = allRooms.filter((room) =>
    room.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    room.theme.toLowerCase().includes(searchQuery.toLowerCase()) ||
    room.tone.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const joinRoom = (room) => {
    if (room.code && !roomAccess[room.id]) {
      if (joinCodes[room.id] !== room.code) {
        setToast("Enter the room code to unlock this study room.");
        return;
      }
      unlockRoom(room.id);
    }
    enterRoom(room);
    setToast(`Entered ${room.name}.`);
  };

  return (
    <PageFrame eyebrow="Study rooms" title="Choose or create a room">
      <div className="rooms-controls">
        <form
          className="create-room glass-panel"
          onSubmit={(event) => {
            event.preventDefault();
            if (!roomName.trim() || !roomCode.trim()) {
              setToast("Room name and access code are required.");
              return;
            }
            addRoom(roomName.trim(), roomCode.trim());
            setToast(`${roomName.trim()} created.`);
            setRoomName("");
            setRoomCode("");
          }}
        >
          <input value={roomName} onChange={(event) => setRoomName(event.target.value)} placeholder="Create a cozy room name..." />
          <input value={roomCode} onChange={(event) => setRoomCode(event.target.value)} placeholder="Access code..." />
          <button className="primary-button"><Plus size={17} /> Create room</button>
        </form>
        <div className="search-bar glass-panel">
          <input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search rooms by name, theme, or tone..."
          />
        </div>
      </div>
      <div className="room-page-grid single-col">
        <div className="room-list">
          {filteredRooms.length > 0 ? (
            filteredRooms.map((room) => (
              <button
                className="room-row"
                key={room.id}
                onClick={() => joinRoom(room)}
              >
                <span>
                  <strong>{room.name}</strong>
                  <small>{room.theme} - {room.tone}{room.code ? " - protected" : ""}</small>
                  {room.code && !roomAccess[room.id] ? (
                    <input
                      className="room-code-input"
                      value={joinCodes[room.id] || ""}
                      onClick={(event) => event.stopPropagation()}
                      onChange={(event) => setJoinCodes({ ...joinCodes, [room.id]: event.target.value })}
                      placeholder="Enter code"
                    />
                  ) : null}
                </span>
                <em>{room.live} live</em>
              </button>
            ))
          ) : (
            <div className="no-rooms glass-panel">No rooms match your search query.</div>
          )}
        </div>
      </div>
    </PageFrame>
  );
}

function TasksPage() {
  return (
    <PageFrame eyebrow="Daily goals" title="Task list">
      <TaskPanel />
    </PageFrame>
  );
}

function AmbientPage() {
  return (
    <PageFrame eyebrow="Soundscape" title="Ambient mixer">
      <AmbientMixer />
    </PageFrame>
  );
}

function ThemesPage() {
  return (
    <PageFrame eyebrow="Personalization" title="Themes and mood shine">
      <ThemePanel />
      <div className="theme-preview glass-panel">
        <StudyScene />
      </div>
    </PageFrame>
  );
}

function StreaksPage() {
  const { user } = useStudyStore();

  return (
    <PageFrame eyebrow="Streaks" title="Focus streaks">
      <div className="streak-grid">
        <FocusStats />
        <StatCard label="Current streak" value={`${user?.streak || 0} nights`} />
        <StatCard label="Focus sessions" value={`${user?.focusSessions || 0}`} />
        <StatCard label="Tasks created" value={`${user?.tasksCreated || 0}`} />
      </div>
    </PageFrame>
  );
}

function ProfilePage() {
  const { user, avatar, setAvatar, setToast, updateProfile } = useStudyStore();
  const [profileForm, setProfileForm] = useState({ name: user?.name || "", bio: user?.bio || "" });
  const saveProfile = (event) => {
    event.preventDefault();
    updateProfile({ name: profileForm.name.trim() || "Study Guest", bio: profileForm.bio.trim() });
    setToast("Profile updated.");
  };

  return (
    <PageFrame eyebrow="Profile" title="Your study identity">
      <div className="profile-layout">
        <section className="glass-panel profile-card">
          <Avatar size="large" />
          <h3>{user?.name || "Study Guest"}</h3>
          <p>{user?.email || "guest@latenight.study"}</p>
          <p>{user?.bio || "No bio yet. Add a quiet line about how you study."}</p>
          <span>Current avatar: {profileAvatars.find((item) => item.id === avatar)?.label}</span>
        </section>
        <section className="glass-panel avatar-picker">
          <SectionTitle icon={<User size={16} />} title="Profile details" />
          <form className="profile-form" onSubmit={saveProfile}>
            <input value={profileForm.name} onChange={(event) => setProfileForm({ ...profileForm, name: event.target.value })} placeholder="Your display name" />
            <textarea value={profileForm.bio} onChange={(event) => setProfileForm({ ...profileForm, bio: event.target.value })} placeholder="Short study bio..." />
            <button className="primary-button">Save profile</button>
          </form>
          <SectionTitle icon={<Moon size={16} />} title="Moon study avatars" />
          <div className="avatar-grid">
            {profileAvatars.map((item) => (
              <button
                className={avatar === item.id ? "active" : ""}
                key={item.id}
                onClick={() => {
                  setAvatar(item.id);
                  setToast(`${item.label} selected.`);
                }}
              >
                <Avatar avatarId={item.id} size="medium" />
                <span>{item.label}</span>
              </button>
            ))}
          </div>
        </section>
      </div>
    </PageFrame>
  );
}

function PageFrame({ eyebrow, title, children }) {
  return (
    <div className="page-frame">
      <p className="eyebrow">{eyebrow}</p>
      <h1>{title}</h1>
      {children}
    </div>
  );
}

function TaskPanel() {
  const { tasks, addTask, toggleTask, updateTask, deleteTask, touchStreak, setToast } = useStudyStore();
  const [value, setValue] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editingValue, setEditingValue] = useState("");
  const complete = Math.round((tasks.filter((task) => task.done).length / tasks.length) * 100);

  return (
    <section className="glass-panel side-card">
      <SectionTitle icon={<Check size={16} />} title="Today goals" />
      <form
        className="task-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (!value.trim()) return;
          addTask(value.trim());
          touchStreak("task");
          setToast("Task created. Your focus streak has started.");
          setValue("");
        }}
      >
        <input value={value} onChange={(event) => setValue(event.target.value)} placeholder="Add new study task..." />
        <button className="icon-button" title="Add task"><Plus size={16} /></button>
      </form>
      <div className="progress-track"><span style={{ width: `${complete}%` }} /></div>
      <div className="task-list">
        {tasks.map((task) => (
          <div className={`task-row ${task.done ? "done" : ""}`} key={task.id}>
            <button className="task-check" onClick={() => toggleTask(task.id)}>{task.done ? <Check size={14} /> : null}</button>
            {editingId === task.id ? (
              <input value={editingValue} onChange={(event) => setEditingValue(event.target.value)} />
            ) : (
              <span>{task.label}</span>
            )}
            <button
              className="task-mini"
              onClick={() => {
                if (editingId === task.id) {
                  updateTask(task.id, editingValue.trim() || task.label);
                  setEditingId(null);
                } else {
                  setEditingId(task.id);
                  setEditingValue(task.label);
                }
              }}
            >
              {editingId === task.id ? "Save" : "Edit"}
            </button>
            <button className="task-mini danger" onClick={() => deleteTask(task.id)}>Delete</button>
          </div>
        ))}
      </div>
    </section>
  );
}

function AmbientMixer() {
  const sounds = [
    ["Rain", CloudRain, 64],
    ["Cafe", Coffee, 46],
    ["Keys", Keyboard, 52],
    ["Thunder", Zap, 38],
    ["Fireplace", Flame, 58]
  ];

  return (
    <section className="glass-panel side-card">
      <SectionTitle icon={<Waves size={16} />} title="Ambient mixer" />
      {sounds.map(([label, Icon, value]) => (
        <label className="mixer-row" key={label}>
          <span><Icon size={15} /> {label}</span>
          <input type="range" min="0" max="100" defaultValue={value} />
        </label>
      ))}
    </section>
  );
}

function ThemePanel() {
  const { mood, setMood } = useStudyStore();
  const themes = ["Rainy Cafe", "Midnight Desk", "Warm Lamp", "Forest Calm"];

  return (
    <section className="glass-panel side-card">
      <SectionTitle icon={<Sparkles size={16} />} title="Mood shine" />
      <div className="theme-grid">
        {themes.map((theme) => (
          <button className={mood === theme ? "active" : ""} key={theme} onClick={() => setMood(theme)}>
            {theme}
          </button>
        ))}
      </div>
    </section>
  );
}

function LiveChat() {
  const { activeRoom } = useStudyStore();
  const [message, setMessage] = useState("");
  const [typing, setTyping] = useState("");
  const [connected, setConnected] = useState(false);
  const socketRef = useRef(null);
  const [messages, setMessages] = useState([
    { id: 1, user: "Mina", text: "Starting a 25 minute sprint. Good luck tonight.", createdAt: new Date().toISOString() },
    { id: 2, user: "Theo", text: "Rain mix at 60% is perfect.", createdAt: new Date().toISOString() }
  ]);

  useEffect(() => {
    const socket = io(SOCKET_URL, { transports: ["websocket"], autoConnect: true });
    socketRef.current = socket;
    socket.on("connect", () => {
      setConnected(true);
      socket.emit("room:join", { roomId: activeRoom.id, user: { name: "Guest" } });
    });
    socket.on("connect_error", () => setConnected(false));
    socket.on("chat:message", (payload) => setMessages((current) => [...current, payload].slice(-8)));
    socket.on("typing", ({ user }) => {
      setTyping(`${user || "Someone"} is typing...`);
      window.setTimeout(() => setTyping(""), 1600);
    });
    return () => socket.disconnect();
  }, []);

  useEffect(() => {
    socketRef.current?.emit("room:join", { roomId: activeRoom.id, user: { name: "Guest" } });
  }, [activeRoom.id]);

  const sendMessage = (event) => {
    event.preventDefault();
    if (!message.trim()) return;
    if (connected) {
      socketRef.current.emit("chat:message", { roomId: activeRoom.id, text: message.trim() });
    } else {
      setMessages((current) => [...current, { id: Date.now(), user: "You", text: message.trim(), createdAt: new Date().toISOString() }].slice(-8));
    }
    setMessage("");
  };

  return (
    <section className="glass-panel side-card chat-card">
      <SectionTitle icon={<Moon size={16} />} title="Soft chat" />
      <p className="connection">{connected ? "Live room connected" : "Local preview mode"} - {activeRoom.name}</p>
      <div className="messages">
        {messages.map((item) => (
          <div className="message" key={item.id}>
            <strong>{item.user}</strong>
            <span>{item.text}</span>
          </div>
        ))}
      </div>
      <p className="typing">{typing}</p>
      <form className="chat-form" onSubmit={sendMessage}>
        <input
          value={message}
          onChange={(event) => {
            setMessage(event.target.value);
            socketRef.current?.emit("typing", { roomId: activeRoom.id, user: "Guest" });
          }}
          placeholder="Send a quiet note..."
        />
        <button className="icon-button" title="Send message"><Send size={16} /></button>
      </form>
    </section>
  );
}

function FocusStats() {
  const { user } = useStudyStore();

  return (
    <section className="glass-panel focus-card">
      <SectionTitle icon={<Flame size={16} />} title="Focus streak" />
      <strong>{user?.streak || 0} nights</strong>
      <p>Create a task or start a focus timer to begin your streak.</p>
    </section>
  );
}

function FocusMode() {
  const { toggleFocus, activeRoom, touchStreak, setToast } = useStudyStore();
  const [seconds, setSeconds] = useState(25 * 60);
  const [running, setRunning] = useState(false);
  const [credited, setCredited] = useState(false);

  const toggleTimer = () => {
    setRunning((value) => !value);
    if (!credited) {
      touchStreak("focus");
      setToast("Focus timer started. Your streak is active.");
      setCredited(true);
    }
  };

  useEffect(() => {
    if (!running) return undefined;
    const timer = window.setInterval(() => setSeconds((value) => (value > 0 ? value - 1 : 5 * 60)), 1000);
    return () => window.clearInterval(timer);
  }, [running]);

  const minutes = String(Math.floor(seconds / 60)).padStart(2, "0");
  const rest = String(seconds % 60).padStart(2, "0");
  const progress = 1 - seconds / (25 * 60);

  return (
    <motion.section id="focus" className="focus-mode glass-panel" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.98 }}>
      <p className="eyebrow">Distractions off - {activeRoom.name}</p>
      <h2>Focus session</h2>
      <div className="timer-ring" style={{ "--progress": `${progress * 360}deg` }}>
        <span>{minutes}:{rest}</span>
      </div>
      <div className="button-row centered">
        <button className="primary-button" onClick={toggleTimer}>
          {running ? <Pause size={18} /> : <Play size={18} />}
          {running ? "Pause" : "Resume"}
        </button>
        <button className="soft-button" onClick={() => setSeconds(25 * 60)}><RotateCcw size={18} /> Reset</button>
        <button className="ghost-button" onClick={toggleFocus}><X size={18} /> Exit</button>
      </div>
    </motion.section>
  );
}

function AuthModal({ open, onClose }) {
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [status, setStatus] = useState("");
  const { setUser, setToast, setPage } = useStudyStore();

  const submit = async (event) => {
    event.preventDefault();
    setStatus("Checking your room key...");
    try {
      const response = await fetch(`${API_URL}/api/auth/${mode === "login" ? "login" : "signup"}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form)
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Authentication failed.");
      localStorage.setItem("lnsr-token", data.token);
      setUser(data.user);
      setPage("dashboard");
      setToast(`${mode === "login" ? "Welcome back" : "Account created"}, ${data.user.name}.`);
      setStatus("");
      onClose();
    } catch (error) {
      setStatus(error.message);
    }
  };

  const demoGoogle = () => {
    const user = { id: "google-preview", name: "Google Guest", email: "guest@latenight.study", streak: 0, bio: "" };
    setUser(user);
    setPage("dashboard");
    setToast("Google preview session started.");
    onClose();
  };

  return (
    <AnimatePresence>
      {open ? (
        <motion.div className="modal-layer" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <motion.section className="auth-modal glass-panel" initial={{ y: 24, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 24, opacity: 0 }}>
            <button className="icon-button close" title="Close" onClick={onClose}><X size={18} /></button>
            <p className="eyebrow">Persistent sessions ready</p>
            <h2>{mode === "login" ? "Welcome back" : "Create your room key"}</h2>
            <div className="tabs">
              <button type="button" className={mode === "login" ? "active" : ""} onClick={() => setMode("login")}>Login</button>
              <button type="button" className={mode === "signup" ? "active" : ""} onClick={() => setMode("signup")}>Sign up</button>
            </div>
            <form className="auth-form" onSubmit={submit}>
              {mode === "signup" ? <input placeholder="Display name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /> : null}
              <input placeholder="Email" type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
              <input placeholder="Password" type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} />
              {status ? <p className="form-status">{status}</p> : null}
              <button className="primary-button" type="submit"><Moon size={18} /> {mode === "login" ? "Enter dashboard" : "Create account"}</button>
              <button className="soft-button" type="button" onClick={demoGoogle}><Sparkles size={18} /> Continue with Google preview</button>
            </form>
          </motion.section>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

function Avatar({ avatarId, size = "medium" }) {
  const selected = useStudyStore((state) => state.avatar);
  const item = profileAvatars.find((entry) => entry.id === (avatarId || selected)) || profileAvatars[0];

  return (
    <span className={`moon-avatar ${size}`} style={{ "--a": item.colors[0], "--b": item.colors[1] }}>
      <span className={`avatar-mark ${item.mark}`} />
    </span>
  );
}

function SectionTitle({ icon, title }) {
  return (
    <div className="section-title">
      {icon}
      <h2>{title}</h2>
    </div>
  );
}

function StatCard({ label, value }) {
  return (
    <article className="stat-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function ActiveRoomPage({ room }) {
  const { exitRoom, user } = useStudyStore();
  const socketRef = useRef(null);
  const [connected, setConnected] = useState(false);
  const [presence, setPresence] = useState({ message: "", count: 1 });

  useEffect(() => {
    const socket = io(SOCKET_URL, { transports: ["websocket"], autoConnect: true });
    socketRef.current = socket;

    socket.on("connect", () => {
      setConnected(true);
      socket.emit("room:join", { roomId: room.id, user });
    });

    socket.on("connect_error", () => {
      setConnected(false);
    });

    socket.on("presence:update", (update) => {
      setPresence(update);
    });

    return () => {
      socket.disconnect();
    };
  }, [room.id, user]);

  return (
    <div className="active-room-layout">
      <header className="active-room-header glass-panel">
        <div className="room-meta">
          <button className="back-btn" onClick={exitRoom} title="Exit Room">
            <X size={18} />
            <span>Leave Room</span>
          </button>
          <div className="meta-details">
            <h1>{room.name}</h1>
            <p className="eyebrow">{room.theme} • {room.tone}</p>
          </div>
        </div>
        <div className="live-status">
          <span className={`status-dot ${connected ? "live" : "offline"}`} />
          <Users size={16} />
          <strong>{presence.count} focusing</strong>
        </div>
      </header>

      <div className="room-grid">
        <div className="chat-container-col">
          {socketRef.current && (
            <RoomChat room={room} socket={socketRef.current} connected={connected} />
          )}
        </div>
        <div className="controls-container-col">
          {socketRef.current && (
            <SharedTimer room={room} socket={socketRef.current} />
          )}
          <RoomAmbientMixer />
        </div>
      </div>
    </div>
  );
}

function RoomChat({ room, socket, connected }) {
  const { user } = useStudyStore();
  const [message, setMessage] = useState("");
  const [typing, setTyping] = useState("");
  const [messages, setMessages] = useState([]);
  const [chatTheme, setChatTheme] = useState("default");
  const messagesEndRef = useRef(null);

  useEffect(() => {
    setMessages([
      { id: "wel-1", user: "Mina", text: "Starting a 25 minute sprint. Good luck tonight. Feel free to share your links!", createdAt: new Date().toISOString() },
      { id: "wel-2", user: "Theo", text: "Rain mix at 60% is perfect. Check out this guide: https://conceptually.org/concepts/pomodoro-technique", createdAt: new Date().toISOString() }
    ]);

    socket.on("chat:message", (payload) => {
      setMessages((current) => [...current, payload].slice(-50));
    });

    socket.on("typing", ({ user }) => {
      setTyping(`${user || "Someone"} is typing...`);
      const timer = setTimeout(() => setTyping(""), 1600);
      return () => clearTimeout(timer);
    });

    return () => {
      socket.off("chat:message");
      socket.off("typing");
    };
  }, [socket]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, typing]);

  const sendMessage = (event) => {
    event.preventDefault();
    if (!message.trim()) return;
    if (connected) {
      socket.emit("chat:message", { roomId: room.id, text: message.trim() });
    } else {
      setMessages((current) => [
        ...current,
        { id: String(Date.now()), user: user?.name || "You", text: message.trim(), createdAt: new Date().toISOString() }
      ].slice(-50));
    }
    setMessage("");
  };

  const renderMessageText = (text) => {
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const parts = text.split(urlRegex);
    return parts.map((part, index) => {
      if (part.match(urlRegex)) {
        return (
          <a key={index} href={part} target="_blank" rel="noopener noreferrer" className="chat-link">
            {part}
          </a>
        );
      }
      return part;
    });
  };

  const themes = [
    { id: "default", name: "Midnight Indigo", class: "chat-theme-default" },
    { id: "amber", name: "Cozy Amber", class: "chat-theme-amber" },
    { id: "cyber", name: "Cyber Sunset", class: "chat-theme-cyber" },
    { id: "forest", name: "Forest Mist", class: "chat-theme-forest" },
    { id: "ocean", name: "Ocean Deep", class: "chat-theme-ocean" }
  ];

  return (
    <section className={`glass-panel active-chat-card ${themes.find(t => t.id === chatTheme)?.class || "chat-theme-default"}`}>
      <div className="chat-header">
        <SectionTitle icon={<Moon size={16} />} title="Cozy Chat" />
        <div className="chat-theme-selector">
          <select value={chatTheme} onChange={(e) => setChatTheme(e.target.value)} title="Change Chat Theme">
            {themes.map(theme => (
              <option key={theme.id} value={theme.id}>{theme.name}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="messages-area">
        {messages.map((item) => (
          <div className={`message-bubble ${item.user === user?.name ? "message-mine" : "message-theirs"}`} key={item.id}>
            <div className="message-meta">
              <strong>{item.user}</strong>
              <small>{new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</small>
            </div>
            <p className="message-content">{renderMessageText(item.text)}</p>
          </div>
        ))}
        {typing ? <p className="chat-typing-status">{typing}</p> : null}
        <div ref={messagesEndRef} />
      </div>

      <form className="chat-input-form" onSubmit={sendMessage}>
        <input
          value={message}
          onChange={(event) => {
            setMessage(event.target.value);
            socket.emit("typing", { roomId: room.id, user: user?.name || "Guest" });
          }}
          placeholder="Send a quiet note or share a link..."
        />
        <button className="primary-button compact" title="Send message">
          <Send size={16} />
        </button>
      </form>
    </section>
  );
}

function SharedTimer({ room, socket }) {
  const { touchStreak, setToast } = useStudyStore();
  const [timeLeft, setTimeLeft] = useState(25 * 60);
  const [running, setRunning] = useState(false);
  const [duration, setDuration] = useState(25 * 60);
  const [customDurationInput, setCustomDurationInput] = useState("25");

  useEffect(() => {
    socket.on("timer:update", (timer) => {
      setTimeLeft(timer.timeLeft);
      setRunning(timer.running);
      setDuration(timer.duration);
    });

    socket.on("timer:sync", (timer) => {
      setTimeLeft(timer.timeLeft);
      setRunning(timer.running);
    });

    socket.on("timer:complete", ({ message }) => {
      touchStreak("focus");
      setToast(message || "Focus session completed!");
    });

    return () => {
      socket.off("timer:update");
      socket.off("timer:sync");
      socket.off("timer:complete");
    };
  }, [socket, touchStreak, setToast]);

  // Local tick down to maintain responsiveness
  useEffect(() => {
    if (!running) return;
    const interval = setInterval(() => {
      setTimeLeft((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [running]);

  const toggleTimer = () => {
    if (running) {
      socket.emit("timer:pause", { roomId: room.id });
    } else {
      socket.emit("timer:start", { roomId: room.id, duration });
    }
  };

  const resetTimer = (newDuration = duration) => {
    socket.emit("timer:reset", { roomId: room.id, duration: newDuration });
  };

  const handlePresetSelect = (mins) => {
    const secs = mins * 60;
    setDuration(secs);
    resetTimer(secs);
  };

  const handleCustomDurationSubmit = (e) => {
    e.preventDefault();
    const mins = parseInt(customDurationInput, 10);
    if (isNaN(mins) || mins <= 0 || mins > 180) {
      setToast("Please enter a duration between 1 and 180 minutes.");
      return;
    }
    const secs = mins * 60;
    setDuration(secs);
    resetTimer(secs);
  };

  const minutes = String(Math.floor(timeLeft / 60)).padStart(2, "0");
  const rest = String(timeLeft % 60).padStart(2, "0");
  const progress = 1 - (duration > 0 ? timeLeft / duration : 0);

  return (
    <section className="glass-panel room-timer-card">
      <SectionTitle icon={<Timer size={16} />} title="Synchronized Focus Timer" />
      <div className="timer-display-row">
        <div className="timer-ring-large" style={{ "--progress": `${progress * 360}deg` }}>
          <div className="timer-time-text">{minutes}:{rest}</div>
          <div className="timer-status-text">{running ? "Focusing..." : "Paused"}</div>
        </div>

        <div className="timer-settings">
          <div className="presets-label">Select Focus Block</div>
          <div className="presets-grid">
            <button className={duration === 15 * 60 ? "active" : ""} onClick={() => handlePresetSelect(15)}>15m</button>
            <button className={duration === 25 * 60 ? "active" : ""} onClick={() => handlePresetSelect(25)}>25m</button>
            <button className={duration === 45 * 60 ? "active" : ""} onClick={() => handlePresetSelect(45)}>45m</button>
            <button className={duration === 60 * 60 ? "active" : ""} onClick={() => handlePresetSelect(60)}>60m</button>
          </div>

          <form className="custom-duration-form" onSubmit={handleCustomDurationSubmit}>
            <input
              type="number"
              min="1"
              max="180"
              value={customDurationInput}
              onChange={(e) => setCustomDurationInput(e.target.value)}
              placeholder="Min"
            />
            <button type="submit" className="soft-button compact">Set Mins</button>
          </form>
        </div>
      </div>

      <div className="button-row centered timer-controls">
        <button className="primary-button" onClick={toggleTimer}>
          {running ? <Pause size={18} /> : <Play size={18} />}
          {running ? "Pause Session" : "Start Session"}
        </button>
        <button className="soft-button" onClick={() => resetTimer()}>
          <RotateCcw size={18} />
          Reset
        </button>
      </div>
    </section>
  );
}

function RoomAmbientMixer() {
  const playersRef = useRef({});
  const [playingState, setPlayingState] = useState({
    rain: false,
    ocean: false,
    lofi1: false,
    lofi2: false,
    space: false,
    ambient: false
  });
  const [volumes, setVolumes] = useState({
    rain: 50,
    ocean: 50,
    lofi1: 50,
    lofi2: 50,
    space: 50,
    ambient: 50
  });

  useEffect(() => {
    const tracks = {
      rain: "/sounds/rain.mp3",
      ocean: "/sounds/waves.mp3",
      lofi1: "/sounds/cafe.mp3",
      lofi2: "/sounds/lofi1.mp3",
      space: "/sounds/space.mp3",
      ambient: "/sounds/birds.mp3"
    };

    Object.entries(tracks).forEach(([key, url]) => {
      playersRef.current[key] = new Howl({
        src: [url],
        html5: true,
        loop: true,
        volume: 0.5
      });
    });

    return () => {
      Object.values(playersRef.current).forEach((player) => {
        player.stop();
        player.unload();
      });
    };
  }, []);

  const togglePlay = (key) => {
    const player = playersRef.current[key];
    if (!player) return;
    if (playingState[key]) {
      player.pause();
    } else {
      player.play();
    }
    setPlayingState((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleVolumeChange = (key, val) => {
    const player = playersRef.current[key];
    if (player) {
      player.volume(val / 100);
    }
    setVolumes((prev) => ({ ...prev, [key]: val }));
  };

  const sounds = [
    { id: "rain", label: "Cozy Rain", icon: <CloudRain size={16} /> },
    { id: "ocean", label: "Ocean Waves", icon: <Waves size={16} /> },
    { id: "lofi1:cafe", label: "Lofi Cafe", icon: <Coffee size={16} />, actualId: "lofi1" },
    { id: "lofi2:beats", label: "Lofi Beats", icon: <Headphones size={16} />, actualId: "lofi2" },
    { id: "space", label: "Deep Space", icon: <Moon size={16} /> },
    { id: "ambient", label: "Calm Focus", icon: <Sparkles size={16} /> }
  ];

  return (
    <section className="glass-panel room-mixer-card">
      <SectionTitle icon={<Waves size={16} />} title="Soft Ambience Sounds" />
      <div className="mixer-rows-container">
        {sounds.map((sound) => {
          const key = sound.actualId || sound.id;
          const isPlaying = playingState[key];
          const volume = volumes[key];

          return (
            <div className="mixer-item-row" key={sound.id}>
              <button
                className={`mixer-play-btn ${isPlaying ? "playing" : ""}`}
                onClick={() => togglePlay(key)}
                title={isPlaying ? "Pause" : "Play"}
              >
                {sound.icon}
                <span>{sound.label}</span>
              </button>
              <div className="mixer-slider-wrapper">
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={volume}
                  onChange={(e) => handleVolumeChange(key, parseInt(e.target.value, 10))}
                  disabled={!isPlaying}
                  title="Adjust Volume"
                />
                <span className="volume-percentage">{isPlaying ? `${volume}%` : "muted"}</span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

createRoot(document.getElementById("root")).render(<App />);
