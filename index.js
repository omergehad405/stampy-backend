require("dotenv").config();
const express = require("express");
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

    app.use(express.json({ limit: "1mb" }));
    app.use(express.urlencoded({ extended: true, limit: "1mb" }));
    app.use(cookieParser());

    // ── Routes ──────────────────────────────────────────────────────────────
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

    // ── Health check ─────────────────────────────────────────────────────────
    app.get("/api/health", (req, res) => {
      res.status(200).json({
        success: true,
        message: "Stampy API is healthy",
        timestamp: new Date().toISOString(),
      });
    });

    // ── 404 for unmatched /api routes ────────────────────────────────────────
    app.use("/api", (req, res) => {
      res.status(404).json({
        success: false,
        message: `API endpoint '${req.originalUrl}' not found`,
      });
    });

    // ── Global error handler ─────────────────────────────────────────────────
    // Must have 4 arguments to be recognised as error middleware by Express
    // eslint-disable-next-line no-unused-vars
    app.use((err, req, res, next) => {
      console.error("[Server Error]", err);
      return res.status(err.status || 500).json({
        success: false,
        message:
          process.env.NODE_ENV === "production"
            ? "Internal server error"
            : err.message || "Internal server error",
      });
    });

    app.listen(PORT, () => {
      console.log(`[Stampy] Server running on http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("[Stampy Fatal Error]:", error);
    process.exit(1);
  }
}

startServer();
