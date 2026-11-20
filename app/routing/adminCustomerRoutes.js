const express = require("express");
const {
  getAllCustomers,
  getCustomerById,
  updateCustomerStatus,
} = require("../controllers/adminCustomerController");
const { protect, authorize } = require("../middlewares/authMiddleware");

const router = express.Router();

// Require active authentication and 'admin' role
router.use(protect, authorize("admin"));

router.get("/", getAllCustomers);
router.get("/:id", getCustomerById);
router.patch("/:id/status", updateCustomerStatus);

module.exports = router;
