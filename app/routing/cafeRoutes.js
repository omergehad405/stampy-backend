const express = require("express");
const {
  getPublicCafes,
  getCafeBySlug,
  joinCafe,
  leaveCafe,
  getMyMemberships,
  redeemReward,
  getMyRedemptions,
} = require("../controllers/cafeController");
const { protect } = require("../middlewares/authMiddleware");

const router = express.Router();

// Public routes for cafes discovery and details
router.get("/", getPublicCafes);

// User's joined memberships & redemptions
router.get("/my/memberships", protect, getMyMemberships);
router.get("/my/redemptions", protect, getMyRedemptions);
router.post("/my/redeem", protect, redeemReward);

// Public single cafe details
router.get("/:slugOrId", getCafeBySlug);

// Customer join/leave cafe endpoints
router.post("/:cafeId/join", protect, joinCafe);
router.post("/:cafeId/leave", protect, leaveCafe);
router.post("/:cafeId/redeem", protect, redeemReward);

module.exports = router;
