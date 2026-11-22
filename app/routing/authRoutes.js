const express = require("express");
const rateLimit = require("express-rate-limit");
const {
  register,
  login,
  getMe,
  logout,
  updateProfile,
  getCustomerQrCode,
  forgotPassword,
  resetPassword,
} = require("../controllers/authController");
const { protect, authorize } = require("../middlewares/authMiddleware");

const router = express.Router();

// Rate limiting for public authentication endpoints to protect against brute force
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per 15 minutes per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many authentication requests from this IP, please try again after 15 minutes.",
  },
});

// Public endpoints
router.post("/register", authLimiter, register);
router.post("/login", authLimiter, login);
router.post("/forgot-password", authLimiter, forgotPassword);
router.post("/reset-password", authLimiter, resetPassword);

// Protected endpoints
router.get("/me", protect, getMe);
router.put("/profile", protect, updateProfile);
router.patch("/profile", protect, updateProfile);
router.post("/logout", protect, logout);

// Customer-only QR Code endpoint
router.get("/qr-code", protect, authorize("user"), getCustomerQrCode);

module.exports = router;
