const express = require("express");
const {
  getMyCafeProfile,
  updateMyCafeProfile,
} = require("../controllers/cafeController");
const { protect, authorize } = require("../middlewares/authMiddleware");

const router = express.Router();

// All routes here require authentication and staff/admin role
router.use(protect, authorize("cafeOwner", "cafeManager", "admin"));

router.get("/", getMyCafeProfile);
router.put("/", updateMyCafeProfile);

module.exports = router;
