require("dotenv").config();
const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const next = require("next");
const connectDB = require("./backend/config/db");
const authRoutes = require("./backend/app/routing/authRoutes");
const adminCafeRoutes = require("./backend/app/routing/adminCafeRoutes");
const adminCustomerRoutes = require("./backend/app/routing/adminCustomerRoutes");
const adminPlanRoutes = require("./backend/app/routing/adminPlanRoutes");
const adminAnnouncementRoutes = require("./backend/app/routing/adminAnnouncementRoutes");
const announcementRoutes = require("./backend/app/routing/announcementRoutes");
const cafeRewardRoutes = require("./backend/app/routing/cafeRewardRoutes");
const cafeRoutes = require("./backend/app/routing/cafeRoutes");
const dashboardCafeRoutes = require("./backend/app/routing/dashboardCafeRoutes");

const dev = process.env.NODE_ENV !== "production";
const app = next({ dev });
const handle = app.getRequestHandler();
const PORT = parseInt(process.env.PORT, 10) || 5000;

async function startServer() {
  try {
    await connectDB();
    await app.prepare();

    const server = express();

    // CORS — allow the Vercel frontend (and any ALLOWED_ORIGINS in env) to reach this API.
    // In production set ALLOWED_ORIGINS to a comma-separated list of your Vercel URLs.
    const allowedOrigins = (process.env.ALLOWED_ORIGINS || "")
      .split(",")
      .map((o) => o.trim())
      .filter(Boolean);

    server.use(
      cors({
        origin(origin, callback) {
          // Allow server-to-server requests (no origin header) and listed origins.
          if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
          } else {
            callback(new Error(`CORS: origin '${origin}' not allowed`));
          }
        },
        credentials: true, // Required for HttpOnly cookie auth
        methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allowedHeaders: ["Content-Type", "Authorization"],
      })
    );

    server.use(express.json({ limit: "1mb" }));
    server.use(express.urlencoded({ extended: true, limit: "1mb" }));
    server.use(cookieParser());

    server.use("/api/auth", authRoutes);
    server.use("/api/announcements", announcementRoutes);
    server.use("/api/admin/cafes", adminCafeRoutes);
    server.use("/api/admin/customers", adminCustomerRoutes);
    server.use("/api/admin/plans", adminPlanRoutes);
    server.use("/api/admin/announcements", adminAnnouncementRoutes);
    server.use("/api/dashboard/rewards", cafeRewardRoutes);
    server.use("/api/rewards", cafeRewardRoutes);
    server.use("/api/cafes", cafeRoutes);
    server.use("/api/dashboard/cafe", dashboardCafeRoutes);
    server.use("/api/dashboard/profile", dashboardCafeRoutes);

    server.get("/api/health", (req, res) => {
      res.status(200).json({
        success: true,
        message: "Stampy API is healthy",
        timestamp: new Date().toISOString(),
      });
    });

    server.use("/api", (req, res) => {
      res.status(404).json({
        success: false,
        message: `API endpoint '${req.originalUrl}' not found`,
      });
    });

    server.use((req, res) => handle(req, res));

    server.use((err, req, res, next) => {
      console.error("[Server Error]", err);
      if (req.originalUrl.startsWith("/api")) {
        return res.status(err.status || 500).json({
          success: false,
          message:
            process.env.NODE_ENV === "production"
              ? "Internal server error"
              : err.message || "Internal server error",
        });
      }
      return next(err);
    });

    server.listen(PORT, (err) => {
      if (err) throw err;
      console.log(`[Stampy] Server running on http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("[Stampy Fatal Error]:", error);
    process.exit(1);
  }
}

startServer();
