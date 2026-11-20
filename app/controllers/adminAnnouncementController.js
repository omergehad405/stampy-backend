const Announcement = require("../models/Announcement");

/**
 * @desc    Get all announcements (Admin only)
 * @route   GET /api/admin/announcements
 * @access  Protected (Admin)
 */
const getAllAnnouncements = async (req, res) => {
  try {
    const announcements = await Announcement.find().sort({ createdAt: -1 });

    const formatted = announcements.map((a) => {
      const obj = a.toJSON();
      return {
        ...obj,
        id: obj._id.toString(),
      };
    });

    return res.status(200).json({
      success: true,
      count: formatted.length,
      data: {
        announcements: formatted,
      },
    });
  } catch (error) {
    console.error("[Admin Announcement] GetAllAnnouncements error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error fetching announcements.",
    });
  }
};

/**
 * @desc    Get published announcements for Cafe Dashboard
 * @route   GET /api/announcements/active
 * @access  Public / Cafe Staff
 */
const getActiveAnnouncements = async (req, res) => {
  try {
    const announcements = await Announcement.find({ isPublished: true }).sort({
      createdAt: -1,
    });

    const formatted = announcements.map((a) => {
      const obj = a.toJSON();
      return {
        ...obj,
        id: obj._id.toString(),
      };
    });

    return res.status(200).json({
      success: true,
      count: formatted.length,
      data: {
        announcements: formatted,
      },
    });
  } catch (error) {
    console.error("[Announcement] GetActiveAnnouncements error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error fetching active announcements.",
    });
  }
};

/**
 * @desc    Get single announcement by ID
 * @route   GET /api/admin/announcements/:id
 * @access  Protected (Admin)
 */
const getAnnouncementById = async (req, res) => {
  try {
    const { id } = req.params;
    const announcement = await Announcement.findById(id);

    if (!announcement) {
      return res.status(404).json({
        success: false,
        message: "Announcement not found.",
      });
    }

    const obj = announcement.toJSON();
    return res.status(200).json({
      success: true,
      data: {
        announcement: {
          ...obj,
          id: obj._id.toString(),
        },
      },
    });
  } catch (error) {
    console.error("[Admin Announcement] GetAnnouncementById error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error fetching announcement.",
    });
  }
};

/**
 * @desc    Create new announcement (Admin only)
 * @route   POST /api/admin/announcements
 * @access  Protected (Admin)
 */
const createAnnouncement = async (req, res) => {
  try {
    const { title, message, body, description, isPublished = true } = req.body;
    const messageContent = message || body || description;

    if (!title || !title.trim()) {
      return res.status(400).json({
        success: false,
        message: "Announcement title is required.",
      });
    }

    if (!messageContent || !messageContent.trim()) {
      return res.status(400).json({
        success: false,
        message: "Announcement message body is required.",
      });
    }

    const newAnnouncement = await Announcement.create({
      title: title.trim(),
      message: messageContent.trim(),
      isPublished: Boolean(isPublished),
    });

    const obj = newAnnouncement.toJSON();
    return res.status(201).json({
      success: true,
      message: "Announcement created successfully.",
      data: {
        announcement: {
          ...obj,
          id: obj._id.toString(),
        },
      },
    });
  } catch (error) {
    console.error("[Admin Announcement] CreateAnnouncement error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Server error creating announcement.",
    });
  }
};

/**
 * @desc    Update announcement (Admin only)
 * @route   PUT /api/admin/announcements/:id
 * @access  Protected (Admin)
 */
const updateAnnouncement = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, message, body, description, isPublished } = req.body;
    const messageContent = message !== undefined ? message : body !== undefined ? body : description;

    const announcement = await Announcement.findById(id);
    if (!announcement) {
      return res.status(404).json({
        success: false,
        message: "Announcement not found.",
      });
    }

    if (title !== undefined) {
      if (!title.trim()) {
        return res.status(400).json({
          success: false,
          message: "Title cannot be empty.",
        });
      }
      announcement.title = title.trim();
    }

    if (messageContent !== undefined) {
      if (!messageContent.trim()) {
        return res.status(400).json({
          success: false,
          message: "Message body cannot be empty.",
        });
      }
      announcement.message = messageContent.trim();
    }

    if (isPublished !== undefined) {
      announcement.isPublished = Boolean(isPublished);
    }

    await announcement.save();

    const obj = announcement.toJSON();
    return res.status(200).json({
      success: true,
      message: "Announcement updated successfully.",
      data: {
        announcement: {
          ...obj,
          id: obj._id.toString(),
        },
      },
    });
  } catch (error) {
    console.error("[Admin Announcement] UpdateAnnouncement error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Server error updating announcement.",
    });
  }
};

/**
 * @desc    Toggle announcement publish status (Admin only)
 * @route   PATCH /api/admin/announcements/:id/publish
 * @access  Protected (Admin)
 */
const toggleAnnouncementPublish = async (req, res) => {
  try {
    const { id } = req.params;
    const { isPublished } = req.body;

    const announcement = await Announcement.findById(id);
    if (!announcement) {
      return res.status(404).json({
        success: false,
        message: "Announcement not found.",
      });
    }

    announcement.isPublished =
      typeof isPublished === "boolean" ? isPublished : !announcement.isPublished;

    await announcement.save();

    const obj = announcement.toJSON();
    return res.status(200).json({
      success: true,
      message: `Announcement ${announcement.isPublished ? "published" : "unpublished"} successfully.`,
      data: {
        announcement: {
          ...obj,
          id: obj._id.toString(),
        },
      },
    });
  } catch (error) {
    console.error("[Admin Announcement] TogglePublish error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error toggling announcement publish status.",
    });
  }
};

/**
 * @desc    Delete announcement (Admin only)
 * @route   DELETE /api/admin/announcements/:id
 * @access  Protected (Admin)
 */
const deleteAnnouncement = async (req, res) => {
  try {
    const { id } = req.params;

    const announcement = await Announcement.findById(id);
    if (!announcement) {
      return res.status(404).json({
        success: false,
        message: "Announcement not found.",
      });
    }

    await Announcement.findByIdAndDelete(id);

    return res.status(200).json({
      success: true,
      message: `Announcement '${announcement.title}' deleted successfully.`,
      data: {
        id,
      },
    });
  } catch (error) {
    console.error("[Admin Announcement] DeleteAnnouncement error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Server error deleting announcement.",
    });
  }
};

module.exports = {
  getAllAnnouncements,
  getActiveAnnouncements,
  getAnnouncementById,
  createAnnouncement,
  updateAnnouncement,
  toggleAnnouncementPublish,
  deleteAnnouncement,
};
