const express = require("express");
const {
  getAllCafes,
  createCafe,
  updateCafeStatus,
  updateCafe,
} = require("../controllers/adminCafeController");
const { protect, authorize } = require("../middlewares/authMiddleware");

const router = express.Router();

// All routes here require active authentication and the 'admin' global role
router.use(protect, authorize("admin"));

router.get("/", getAllCafes);
router.post("/", createCafe);
router.patch("/:id/status", updateCafeStatus);
router.put("/:id", updateCafe);

module.exports = router;
