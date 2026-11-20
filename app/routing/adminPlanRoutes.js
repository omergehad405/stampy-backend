const express = require("express");
const {
  getAllPlans,
  getAvailableFeatures,
  getPlanById,
  createPlan,
  updatePlan,
  togglePlanStatus,
  assignPlanToCafe,
  deletePlan,
} = require("../controllers/adminPlanController");
const { protect, authorize } = require("../middlewares/authMiddleware");

const router = express.Router();

// All routes require active admin authentication
router.use(protect, authorize("admin"));

router.get("/", getAllPlans);
router.get("/features", getAvailableFeatures);
router.post("/", createPlan);
router.post("/assign", assignPlanToCafe);
router.get("/:id", getPlanById);
router.put("/:id", updatePlan);
router.patch("/:id/status", togglePlanStatus);
router.delete("/:id", deletePlan);

module.exports = router;
