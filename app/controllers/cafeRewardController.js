const Reward = require("../models/Reward");
const Cafe = require("../models/Cafe");
const { Plan } = require("../models/Plan");
const mongoose = require("mongoose");

/**
 * Normalize category string to match schema enum
 */
const normalizeCategory = (cat) => {
  if (!cat) return "cafee & drinks";
  const lower = cat.toLowerCase().trim();
  if (lower.includes("bakery") || lower.includes("sweet")) {
    return "bakery & sweets";
  }
  if (lower.includes("discount")) {
    return "special discount only";
  }
  return "cafee & drinks";
};

/**
 * Resolve the authenticated user's cafeId.
 * Admins pass an explicit ?cafeId query param or body field, or falls back to first cafe.
 * Cafe owners / managers / baristas use the cafeId on their user record or owner query.
 */
const resolveCafeId = async (req) => {
  if (req.user.role === "admin") {
    const id = req.params.cafeId || req.query.cafeId || req.body.cafeId;
    if (id) return id;
    const anyCafe = await Cafe.findOne({ isActive: true });
    if (anyCafe) return anyCafe._id.toString();
    throw new Error("No cafe found.");
  }

  if (req.user.cafeId) {
    return req.user.cafeId.toString();
  }

  // Fallback: check if user owns a cafe
  const cafe = await Cafe.findOne({
    $or: [
      { "owner.userId": req.user._id },
      { "owner.email": req.user.email?.toLowerCase() },
    ],
  });

  if (cafe) {
    req.user.cafeId = cafe._id;
    try {
      await req.user.save();
    } catch {
      // non-blocking save
    }
    return cafe._id.toString();
  }

  throw new Error("Your account is not linked to a cafe.");
};

/**
 * @desc    Get all rewards for the authenticated cafe
 * @route   GET /api/dashboard/rewards
 * @access  Protected (cafeOwner, cafeManager, cafeBarista, admin)
 */
const getRewards = async (req, res) => {
  try {
    const cafeId = await resolveCafeId(req);

    const { status } = req.query;
    const filter = { cafeId };
    if (status === "active" || status === "inactive") {
      filter.status = status;
    }

    const rewards = await Reward.find(filter).sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      count: rewards.length,
      data: {
        rewards: rewards.map((r) => r.toJSON()),
      },
    });
  } catch (error) {
    console.error("[Rewards] getRewards error:", error);
    return res.status(error.message.includes("cafe") ? 400 : 500).json({
      success: false,
      message: error.message || "Server error fetching rewards.",
    });
  }
};

/**
 * @desc    Create a new reward
 * @route   POST /api/dashboard/rewards
 * @access  Protected (cafeOwner, cafeManager, admin)
 */
const createReward = async (req, res) => {
  try {
    const cafeId = await resolveCafeId(req);

    const title = req.body.title || req.body.name;
    const rawStamps = req.body.requiredStamps ?? req.body.stampsRequired;
    const categoryTag = req.body.categoryTag ?? req.body.tag ?? "";
    const description = req.body.description;
    const category = normalizeCategory(req.body.category);
    let status = req.body.status;
    if (!status && typeof req.body.isActive === "boolean") {
      status = req.body.isActive ? "active" : "inactive";
    }

    if (!title || !title.trim()) {
      return res.status(400).json({
        success: false,
        message: "Reward title is required.",
      });
    }

    if (rawStamps === undefined || rawStamps === null || rawStamps === "" || isNaN(Number(rawStamps))) {
      return res.status(400).json({
        success: false,
        message: "Required stamps count is required and must be a number.",
      });
    }

    const requiredStamps = Number(rawStamps);
    if (requiredStamps < 1) {
      return res.status(400).json({
        success: false,
        message: "Required stamps must be at least 1.",
      });
    }

    if (!description || !description.trim()) {
      return res.status(400).json({
        success: false,
        message: "Reward description is required.",
      });
    }

    // Enforce cafe plan maxRewards limit
    const cafe = await Cafe.findById(cafeId);
    if (cafe && cafe.subscriptionPlanId) {
      let plan = null;
      if (mongoose.isValidObjectId(cafe.subscriptionPlanId)) {
        plan = await Plan.findById(cafe.subscriptionPlanId);
      }
      if (!plan) {
        const planName = cafe.subscriptionPlanId.replace(/^plan-/, "");
        plan = await Plan.findOne({
          name: { $regex: new RegExp(`^${planName}$`, "i") },
        });
      }
      if (plan) {
        const isUnlimited =
          Boolean(plan.isUnlimitedRewards) ||
          plan.features?.includes("unlimited_rewards") ||
          plan.features?.includes("Unlimited Rewards");

        if (!isUnlimited && plan.maxRewards) {
          const currentCount = await Reward.countDocuments({
            cafeId,
            status: "active",
          });
          if (currentCount >= plan.maxRewards) {
            return res.status(403).json({
              success: false,
              message: `You have reached the maximum allowed limit of ${plan.maxRewards} active reward(s) on your '${plan.name}' plan. Please upgrade your subscription to add more rewards.`,
            });
          }
        }
      }
    }

    const reward = await Reward.create({
      cafeId,
      title: title.trim(),
      requiredStamps,
      categoryTag: categoryTag ? categoryTag.trim() : "",
      description: description.trim(),
      category,
      status: status === "inactive" ? "inactive" : "active",
    });

    return res.status(201).json({
      success: true,
      message: "Reward created successfully.",
      data: {
        reward: reward.toJSON(),
      },
    });
  } catch (error) {
    console.error("[Rewards] createReward error:", error);
    if (error.name === "ValidationError") {
      const message = Object.values(error.errors)
        .map((e) => e.message)
        .join(", ");
      return res.status(400).json({ success: false, message });
    }
    return res.status(error.message.includes("cafe") ? 400 : 500).json({
      success: false,
      message: error.message || "Server error creating reward.",
    });
  }
};

/**
 * @desc    Update a reward
 * @route   PUT /api/dashboard/rewards/:id
 * @access  Protected (cafeOwner, cafeManager, admin)
 */
const updateReward = async (req, res) => {
  try {
    const cafeId = await resolveCafeId(req);
    const { id } = req.params;

    const reward = await Reward.findOne({ _id: id, cafeId });
    if (!reward) {
      return res.status(404).json({
        success: false,
        message: "Reward not found or does not belong to your cafe.",
      });
    }

    const title = req.body.title || req.body.name;
    if (title !== undefined) {
      if (!title.trim()) {
        return res.status(400).json({ success: false, message: "Reward title cannot be empty." });
      }
      reward.title = title.trim();
    }

    const rawStamps = req.body.requiredStamps ?? req.body.stampsRequired;
    if (rawStamps !== undefined) {
      const num = Number(rawStamps);
      if (isNaN(num) || num < 1) {
        return res.status(400).json({ success: false, message: "Required stamps must be at least 1." });
      }
      reward.requiredStamps = num;
    }

    const categoryTag = req.body.categoryTag ?? req.body.tag;
    if (categoryTag !== undefined) {
      reward.categoryTag = categoryTag ? categoryTag.trim() : "";
    }

    if (req.body.description !== undefined) {
      if (!req.body.description.trim()) {
        return res.status(400).json({ success: false, message: "Reward description cannot be empty." });
      }
      reward.description = req.body.description.trim();
    }

    if (req.body.category !== undefined) {
      reward.category = normalizeCategory(req.body.category);
    }

    if (req.body.status !== undefined) {
      reward.status = req.body.status === "inactive" ? "inactive" : "active";
    } else if (typeof req.body.isActive === "boolean") {
      reward.status = req.body.isActive ? "active" : "inactive";
    }

    await reward.save();

    return res.status(200).json({
      success: true,
      message: "Reward updated successfully.",
      data: { reward: reward.toJSON() },
    });
  } catch (error) {
    console.error("[Rewards] updateReward error:", error);
    if (error.name === "ValidationError") {
      const message = Object.values(error.errors)
        .map((e) => e.message)
        .join(", ");
      return res.status(400).json({ success: false, message });
    }
    return res.status(500).json({
      success: false,
      message: error.message || "Server error updating reward.",
    });
  }
};

/**
 * @desc    Toggle reward status (active <-> inactive)
 * @route   PATCH /api/dashboard/rewards/:id/status
 * @access  Protected (cafeOwner, cafeManager, admin)
 */
const toggleRewardStatus = async (req, res) => {
  try {
    const cafeId = await resolveCafeId(req);
    const { id } = req.params;

    const reward = await Reward.findOne({ _id: id, cafeId });
    if (!reward) {
      return res.status(404).json({
        success: false,
        message: "Reward not found or does not belong to your cafe.",
      });
    }

    reward.status = reward.status === "active" ? "inactive" : "active";
    await reward.save();

    return res.status(200).json({
      success: true,
      message: `Reward status changed to '${reward.status}'.`,
      data: { reward: reward.toJSON() },
    });
  } catch (error) {
    console.error("[Rewards] toggleRewardStatus error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Server error toggling reward status.",
    });
  }
};

/**
 * @desc    Delete a reward
 * @route   DELETE /api/dashboard/rewards/:id
 * @access  Protected (cafeOwner, cafeManager, admin)
 */
const deleteReward = async (req, res) => {
  try {
    const cafeId = await resolveCafeId(req);
    const { id } = req.params;

    const reward = await Reward.findOne({ _id: id, cafeId });
    if (!reward) {
      return res.status(404).json({
        success: false,
        message: "Reward not found or does not belong to your cafe.",
      });
    }

    await reward.deleteOne();

    return res.status(200).json({
      success: true,
      message: `Reward "${reward.title}" deleted successfully.`,
    });
  } catch (error) {
    console.error("[Rewards] deleteReward error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Server error deleting reward.",
    });
  }
};

module.exports = {
  getRewards,
  createReward,
  updateReward,
  toggleRewardStatus,
  deleteReward,
};
