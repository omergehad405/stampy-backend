require("dotenv").config();
const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const connectDB = require("./config/db");
const authRoutes = require("./app/routing/authRoutes");
const adminCafeRoutes = require("./app/routing/adminCafeRoutes");
const adminCustomerRoutes = require("./app/routing/adminCustomerRoutes");
const adminPlanRoutes = require("./app/routing/adminPlanRoutes");
const adminAnnouncementRoutes = require("./app/routing/adminAnnouncementRoutes");
const announcementRoutes = require("./app/routing/announcementRoutes");
const cafeRewardRoutes = require("./app/routing/cafeRewardRoutes");
const cafeRoutes = require("./app/routing/cafeRoutes");
const dashboardCafeRoutes = require("./app/routing/dashboardCafeRoutes");

const PORT = parseInt(process.env.PORT, 10) || 5000;

async function startServer() {
  try {
    await connectDB();

    const app = express();

    // ── Chrome DevTools Probe ─────────────────────────────────────────────────
    // Silently acknowledge Chrome DevTools probing to prevent CSP / 404 console warnings
    app.get("/.well-known/appspecific/com.chrome.devtools.json", (req, res) => {
      res.status(204).end();
    });

    // ── CORS ──────────────────────────────────────────────────────────────────
    const customAllowedOrigins = (process.env.ALLOWED_ORIGINS || "")
      .split(",")
      .map((o) => o.trim())
      .filter(Boolean);

    const isOriginAllowed = (origin) => {
      if (!origin) return true; // Server-to-server, curl, Postman
      // Localhost or 127.0.0.1 on any port (e.g. :3000, :5000, :5173)
      if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return true;
      // Vercel deployment preview / production domains
      if (/^https:\/\/.*\.vercel\.app$/.test(origin)) return true;
      // Any custom origins from .env
      if (customAllowedOrigins.includes(origin)) return true;
      return false;
    };

    app.use(
      cors({
        origin(origin, callback) {
          if (isOriginAllowed(origin)) {
            callback(null, true);
          } else {
            callback(null, false);
          }
        },
        credentials: true, // Required for HttpOnly cookie auth
        methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "Accept"],
        optionsSuccessStatus: 200,
      })
    );

    app.use(express.json({ limit: "1mb" }));
    app.use(express.urlencoded({ extended: true, limit: "1mb" }));
    app.use(cookieParser());

    // ── Health check ─────────────────────────────────────────────────────────
    app.get("/api/health", (req, res) => {
      res.status(200).json({
        success: true,
        message: "Stampy API is healthy",
        timestamp: new Date().toISOString(),
        port: PORT,
      });
    });

    // ── Root info endpoint ───────────────────────────────────────────────────
    app.get("/", (req, res) => {
      res.status(200).json({
        success: true,
        name: "Stampy Backend API Server",
        status: "online",
        port: PORT,
        frontendUrl: "http://localhost:3000",
        endpoints: {
          health: "/api/health",
          auth: "/api/auth",
          cafes: "/api/cafes",
          dashboard: "/api/dashboard/cafe",
          admin: "/api/admin/cafes",
        },
      });
    });

    // ── API Routes ────────────────────────────────────────────────────────────
    app.use("/api/auth", authRoutes);
    app.use("/api/announcements", announcementRoutes);
    app.use("/api/admin/cafes", adminCafeRoutes);
    app.use("/api/admin/customers", adminCustomerRoutes);
    app.use("/api/admin/plans", adminPlanRoutes);
    app.use("/api/admin/announcements", adminAnnouncementRoutes);
    app.use("/api/dashboard/rewards", cafeRewardRoutes);
    app.use("/api/rewards", cafeRewardRoutes);
    app.use("/api/cafes", cafeRoutes);
    app.use("/api/dashboard/cafe", dashboardCafeRoutes);
    app.use("/api/dashboard/profile", dashboardCafeRoutes);

    // ── 404 for unmatched routes ──────────────────────────────────────────────
    app.use((req, res) => {
      res.status(404).json({
        success: false,
        message: `API endpoint '${req.originalUrl}' not found on backend port ${PORT}.`,
      });
    });

    // ── Global error handler ──────────────────────────────────────────────────
    app.use((err, req, res, next) => {
      console.error("[Server Error]", err);
      res.status(err.status || 500).json({
        success: false,
        message:
          process.env.NODE_ENV === "production"
            ? "Internal server error"
            : err.message || "Internal server error",
      });
    });

    app.listen(PORT, () => {
      console.log(`[Stampy] Backend API Server running on http://localhost:${PORT}`);
      console.log(`[Stampy] Frontend client expected at http://localhost:3000`);
    });
  } catch (error) {
    console.error("[Stampy Fatal Error]:", error);
    process.exit(1);
  }
}

startServer();
