const express = require("express");
const {
  getMyCafeProfile,
  updateMyCafeProfile,
  getCafeCustomers,
  updateCafeCustomerStamps,
  scanCustomer,
  awardStamp,
  fulfillRewardRedemption,
  getCafeActivities,
  getCafeStaff,
  createCafeStaff,
  updateCafeStaff,
  deleteCafeStaff,
} = require("../controllers/cafeController");
const { protect, authorize } = require("../middlewares/authMiddleware");

const router = express.Router();

// All routes here require authentication and staff/admin role
router.use(protect, authorize("cafeOwner", "cafeManager", "cafeBarista", "admin"));

router.get("/", getMyCafeProfile);
router.put("/", updateMyCafeProfile);
router.get("/customers", getCafeCustomers);
router.patch("/customers/:customerId/stamps", updateCafeCustomerStamps);
router.post("/scan", scanCustomer);
router.post("/award-stamp", awardStamp);
router.post("/fulfill-redemption", fulfillRewardRedemption);
router.get("/activities", getCafeActivities);

// Staff management routes (restricted to cafe owner and admin)
router.get("/staff", authorize("cafeOwner", "admin"), getCafeStaff);
router.post("/staff", authorize("cafeOwner", "admin"), createCafeStaff);
router.patch("/staff/:id", authorize("cafeOwner", "admin"), updateCafeStaff);
router.delete("/staff/:id", authorize("cafeOwner", "admin"), deleteCafeStaff);

module.exports = router;
