const express = require("express");
const { getPublicCafes, getCafeBySlug } = require("../controllers/cafeController");

const router = express.Router();

// Public routes for cafes discovery and details
router.get("/", getPublicCafes);
router.get("/:slugOrId", getCafeBySlug);

module.exports = router;
