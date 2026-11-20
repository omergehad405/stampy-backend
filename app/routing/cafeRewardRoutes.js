const express = require("express");
const router = express.Router();
const { protect, authorize } = require("../middlewares/authMiddleware");
const {
  getRewards,
  createReward,
  updateReward,
  toggleRewardStatus,
  deleteReward,
} = require("../controllers/cafeRewardController");

// All routes require authentication
router.use(protect);

// GET /api/dashboard/rewards — readable by all cafe roles
router.get(
  "/",
  authorize("cafeOwner", "cafeManager", "cafeBarista", "admin"),
  getRewards
);

// POST /api/dashboard/rewards — owner + manager only
router.post(
  "/",
  authorize("cafeOwner", "cafeManager", "admin"),
  createReward
);

// PUT /api/dashboard/rewards/:id — owner + manager only
router.put(
  "/:id",
  authorize("cafeOwner", "cafeManager", "admin"),
  updateReward
);

// PATCH /api/dashboard/rewards/:id/status — owner + manager only
router.patch(
  "/:id/status",
  authorize("cafeOwner", "cafeManager", "admin"),
  toggleRewardStatus
);

// DELETE /api/dashboard/rewards/:id — owner + manager only
router.delete(
  "/:id",
  authorize("cafeOwner", "cafeManager", "admin"),
  deleteReward
);

module.exports = router;
