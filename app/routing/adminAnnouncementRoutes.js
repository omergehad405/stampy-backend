const express = require("express");
const {
  getAllAnnouncements,
  getAnnouncementById,
  createAnnouncement,
  updateAnnouncement,
  toggleAnnouncementPublish,
  deleteAnnouncement,
} = require("../controllers/adminAnnouncementController");
const { protect, authorize } = require("../middlewares/authMiddleware");

const router = express.Router();

// Admin routes
router.use(protect, authorize("admin"));

router.get("/", getAllAnnouncements);
router.post("/", createAnnouncement);
router.get("/:id", getAnnouncementById);
router.put("/:id", updateAnnouncement);
router.patch("/:id/publish", toggleAnnouncementPublish);
router.delete("/:id", deleteAnnouncement);

module.exports = router;
