const express = require("express");
const { getActiveAnnouncements } = require("../controllers/adminAnnouncementController");

const router = express.Router();

// Active announcements for cafe dashboards
router.get("/active", getActiveAnnouncements);
router.get("/", getActiveAnnouncements);

module.exports = router;
