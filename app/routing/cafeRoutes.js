const express = require("express");
const {
  getPublicCafes,
  getCafeBySlug,
  joinCafe,
  leaveCafe,
  getMyMemberships,
} = require("../controllers/cafeController");
const { protect } = require("../middlewares/authMiddleware");

const router = express.Router();

// Public routes for cafes discovery and details
router.get("/", getPublicCafes);

// User's joined memberships
router.get("/my/memberships", protect, getMyMemberships);

// Public single cafe details
router.get("/:slugOrId", getCafeBySlug);

// Customer join/leave cafe endpoints
router.post("/:cafeId/join", protect, joinCafe);
router.post("/:cafeId/leave", protect, leaveCafe);

module.exports = router;
