const { Plan, AVAILABLE_FEATURES } = require("../models/Plan");
const Cafe = require("../models/Cafe");

const CANONICAL_FEATURES = [
  "digital_menu",
  "activity_history",
  "multi_staff",
  "promotional_campaigns",
  "unlimited_customers",
  "unlimited_rewards",
];

/**
 * Feature mapping dictionary to normalize key or label
 */
const FEATURE_MAP = {
  digital_menu: "digital_menu",
  "digital menu": "digital_menu",
  activity_history: "activity_history",
  "activity history page": "activity_history",
  "activity history": "activity_history",
  multi_staff: "multi_staff",
  "multi-staff accounts": "multi_staff",
  "multi-staff": "multi_staff",
  "multistaff": "multi_staff",
  promotional_campaigns: "promotional_campaigns",
  "promotional campaigns": "promotional_campaigns",
  unlimited_customers: "unlimited_customers",
  "unlimited customers": "unlimited_customers",
  unlimited_rewards: "unlimited_rewards",
  "unlimited rewards": "unlimited_rewards",
  "unlimited reward tiers": "unlimited_rewards",
};

/**
 * Known legacy feature names that should be safely ignored if present in old plans
 */
const LEGACY_IGNORED_FEATURES = [
  "qr stamp card",
  "basic analytics",
  "full analytics",
  "advanced analytics",
  "1 reward tier",
  "3 reward tiers",
  "5 reward tiers",
  "up to 50 customers",
  "up to 250 customers",
  "up to 500 customers",
  "email support",
  "priority support",
  "24/7 dedicated support",
  "custom branding",
  "api access",
  "custom integrations",
  "push notifications",
  "automated retention",
];

/**
 * Helper to normalize/validate features array against the enum
 */
const validateFeatures = (features) => {
  if (!Array.isArray(features)) {
    return { valid: false, message: "Features must be an array of strings." };
  }

  const normalizedFeatures = [];
  for (const feat of features) {
    if (typeof feat !== "string" || !feat.trim()) continue;
    const trimmed = feat.trim().toLowerCase();
    const mapped = FEATURE_MAP[trimmed];
    if (mapped) {
      if (!normalizedFeatures.includes(mapped)) {
        normalizedFeatures.push(mapped);
      }
    } else if (LEGACY_IGNORED_FEATURES.includes(trimmed)) {
      // Safely ignore obsolete legacy features from older database records
      continue;
    } else {
      // Check if it matches any in AVAILABLE_FEATURES
      const matched = AVAILABLE_FEATURES.find(
        (af) => af.toLowerCase() === trimmed
      );
      if (matched) {
        const canonicalMatch = FEATURE_MAP[matched.toLowerCase()];
        if (canonicalMatch && !normalizedFeatures.includes(canonicalMatch)) {
          normalizedFeatures.push(canonicalMatch);
        } else if (!normalizedFeatures.includes(matched)) {
          normalizedFeatures.push(matched);
        }
      } else {
        return {
          valid: false,
          message: `Feature '${feat.trim()}' is not allowed. Valid features are: ${CANONICAL_FEATURES.join(", ")}`,
        };
      }
    }
  }

  return { valid: true, features: normalizedFeatures };
};

/**
 * @desc    Get all subscription plans (Admin only)
 * @route   GET /api/admin/plans
 * @access  Protected (Admin)
 */
const getAllPlans = async (req, res) => {
  try {
    const plans = await Plan.find().sort({ price: 1, createdAt: 1 });

    const formattedPlans = plans.map((p) => {
      const obj = p.toJSON();
      return {
        ...obj,
        id: obj._id.toString(),
      };
    });

    return res.status(200).json({
      success: true,
      count: formattedPlans.length,
      data: {
        plans: formattedPlans,
        availableFeatures: CANONICAL_FEATURES,
      },
    });
  } catch (error) {
    console.error("[Admin Plan] GetAllPlans error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error fetching subscription plans.",
    });
  }
};

/**
 * @desc    Get available features enum list
 * @route   GET /api/admin/plans/features
 * @access  Protected (Admin)
 */
const getAvailableFeatures = async (req, res) => {
  return res.status(200).json({
    success: true,
    data: {
      features: CANONICAL_FEATURES,
    },
  });
};

/**
 * @desc    Get single plan by ID
 * @route   GET /api/admin/plans/:id
 * @access  Protected (Admin)
 */
const getPlanById = async (req, res) => {
  try {
    const { id } = req.params;
    const plan = await Plan.findById(id);

    if (!plan) {
      return res.status(404).json({
        success: false,
        message: "Subscription plan not found.",
      });
    }

    const obj = plan.toJSON();
    return res.status(200).json({
      success: true,
      data: {
        plan: {
          ...obj,
          id: obj._id.toString(),
        },
      },
    });
  } catch (error) {
    console.error("[Admin Plan] GetPlanById error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error fetching plan details.",
    });
  }
};

/**
 * @desc    Create a new subscription plan (Admin only)
 * @route   POST /api/admin/plans
 * @access  Protected (Admin)
 */
const createPlan = async (req, res) => {
  try {
    const {
      name,
      description,
      price,
      billingPeriod = "month",
      features = [],
      maxCustomers,
      maxRewards,
      maxStaff,
      isUnlimitedCustomers,
      isUnlimitedRewards,
      isPopular = false,
      isActive = true,
    } = req.body;

    // 1. Basic validation
    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: "Plan name is required.",
      });
    }

    if (!description || !description.trim()) {
      return res.status(400).json({
        success: false,
        message: "Plan description is required.",
      });
    }

    if (price === undefined || price === null || isNaN(Number(price)) || Number(price) < 0) {
      return res.status(400).json({
        success: false,
        message: "Valid price (>= 0) is required.",
      });
    }

    // 2. Validate features against enum
    const featValidation = validateFeatures(features);
    if (!featValidation.valid) {
      return res.status(400).json({
        success: false,
        message: featValidation.message,
      });
    }

    // 3. Check for duplicate plan name
    const existingPlan = await Plan.findOne({
      name: { $regex: new RegExp(`^${name.trim()}$`, "i") },
    });
    if (existingPlan) {
      return res.status(400).json({
        success: false,
        message: `A plan with name '${name.trim()}' already exists.`,
      });
    }

    const hasUnlimitedCust =
      Boolean(isUnlimitedCustomers) ||
      featValidation.features.includes("unlimited_customers");
    const hasUnlimitedRew =
      Boolean(isUnlimitedRewards) ||
      featValidation.features.includes("unlimited_rewards");
    const hasMultiStaff = featValidation.features.includes("multi_staff");

    // 4. Create plan
    const newPlan = await Plan.create({
      name: name.trim(),
      description: description.trim(),
      price: Number(price),
      billingPeriod: ["week", "month", "year"].includes(billingPeriod) ? billingPeriod : "month",
      features: featValidation.features,
      isUnlimitedCustomers: hasUnlimitedCust,
      maxCustomers: hasUnlimitedCust
        ? null
        : maxCustomers
        ? Number(maxCustomers)
        : 50,
      isUnlimitedRewards: hasUnlimitedRew,
      maxRewards: hasUnlimitedRew ? null : maxRewards ? Number(maxRewards) : 3,
      maxStaff: hasMultiStaff ? (maxStaff ? Number(maxStaff) : 3) : 1,
      isPopular: Boolean(isPopular),
      isActive: Boolean(isActive),
    });

    const obj = newPlan.toJSON();

    return res.status(201).json({
      success: true,
      message: "Subscription plan created successfully.",
      data: {
        plan: {
          ...obj,
          id: obj._id.toString(),
        },
      },
    });
  } catch (error) {
    console.error("[Admin Plan] CreatePlan error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Server error creating subscription plan.",
    });
  }
};

/**
 * @desc    Update an existing subscription plan (Admin only)
 * @route   PUT /api/admin/plans/:id
 * @access  Protected (Admin)
 */
const updatePlan = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      description,
      price,
      billingPeriod,
      features,
      maxCustomers,
      maxRewards,
      maxStaff,
      isUnlimitedCustomers,
      isUnlimitedRewards,
      isPopular,
      isActive,
    } = req.body;

    const plan = await Plan.findById(id);
    if (!plan) {
      return res.status(404).json({
        success: false,
        message: "Subscription plan not found.",
      });
    }

    // Check name uniqueness if changed
    if (name && name.trim().toLowerCase() !== plan.name.toLowerCase()) {
      const existing = await Plan.findOne({
        _id: { $ne: id },
        name: { $regex: new RegExp(`^${name.trim()}$`, "i") },
      });
      if (existing) {
        return res.status(400).json({
          success: false,
          message: `A plan with name '${name.trim()}' already exists.`,
        });
      }
      plan.name = name.trim();
    }

    if (description !== undefined) {
      plan.description = description.trim();
    }

    if (price !== undefined && !isNaN(Number(price)) && Number(price) >= 0) {
      plan.price = Number(price);
    }

    if (billingPeriod !== undefined) {
      plan.billingPeriod = ["week", "month", "year"].includes(billingPeriod) ? billingPeriod : "month";
    }

    let validatedFeatures = plan.features;
    if (features !== undefined) {
      const featValidation = validateFeatures(features);
      if (!featValidation.valid) {
        return res.status(400).json({
          success: false,
          message: featValidation.message,
        });
      }
      validatedFeatures = featValidation.features;
      plan.features = validatedFeatures;
    }

    const hasUnlimitedCust =
      features !== undefined
        ? validatedFeatures.includes("unlimited_customers")
        : isUnlimitedCustomers !== undefined
        ? Boolean(isUnlimitedCustomers)
        : plan.features.includes("unlimited_customers");
    plan.isUnlimitedCustomers = hasUnlimitedCust;

    if (hasUnlimitedCust) {
      plan.maxCustomers = null;
    } else if (maxCustomers !== undefined && maxCustomers !== null && maxCustomers !== "") {
      const parsedCust = Number(maxCustomers);
      plan.maxCustomers = !isNaN(parsedCust) && parsedCust >= 1 ? parsedCust : (plan.maxCustomers || 50);
    }

    const hasUnlimitedRew =
      features !== undefined
        ? validatedFeatures.includes("unlimited_rewards")
        : isUnlimitedRewards !== undefined
        ? Boolean(isUnlimitedRewards)
        : plan.features.includes("unlimited_rewards");
    plan.isUnlimitedRewards = hasUnlimitedRew;

    if (hasUnlimitedRew) {
      plan.maxRewards = null;
    } else if (maxRewards !== undefined && maxRewards !== null && maxRewards !== "") {
      const parsedRew = Number(maxRewards);
      plan.maxRewards = !isNaN(parsedRew) && parsedRew >= 1 ? parsedRew : (plan.maxRewards || 3);
    }

    if (plan.features.includes("multi_staff")) {
      if (maxStaff !== undefined) {
        plan.maxStaff = maxStaff ? Number(maxStaff) : 3;
      }
    } else {
      plan.maxStaff = 1;
    }

    if (isPopular !== undefined) {
      plan.isPopular = Boolean(isPopular);
    }

    if (isActive !== undefined) {
      plan.isActive = Boolean(isActive);
    }

    await plan.save();

    const obj = plan.toJSON();
    return res.status(200).json({
      success: true,
      message: "Subscription plan updated successfully.",
      data: {
        plan: {
          ...obj,
          id: obj._id.toString(),
        },
      },
    });
  } catch (error) {
    console.error("[Admin Plan] UpdatePlan error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Server error updating subscription plan.",
    });
  }
};

/**
 * @desc    Toggle plan active status (Admin only)
 * @route   PATCH /api/admin/plans/:id/status
 * @access  Protected (Admin)
 */
const togglePlanStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { isActive } = req.body;

    const plan = await Plan.findById(id);
    if (!plan) {
      return res.status(404).json({
        success: false,
        message: "Subscription plan not found.",
      });
    }

    plan.isActive = typeof isActive === "boolean" ? isActive : !plan.isActive;
    await plan.save();

    const obj = plan.toJSON();
    return res.status(200).json({
      success: true,
      message: `Plan status changed to ${plan.isActive ? "active" : "inactive"}.`,
      data: {
        plan: {
          ...obj,
          id: obj._id.toString(),
        },
      },
    });
  } catch (error) {
    console.error("[Admin Plan] TogglePlanStatus error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error toggling plan status.",
    });
  }
};

/**
 * @desc    Assign a plan to a cafe (Admin only)
 * @route   POST /api/admin/plans/assign
 * @access  Protected (Admin)
 */
const assignPlanToCafe = async (req, res) => {
  try {
    const { cafeId, planId } = req.body;

    if (!cafeId || !planId) {
      return res.status(400).json({
        success: false,
        message: "Both cafeId and planId are required.",
      });
    }

    // Find Cafe
    const cafe = await Cafe.findById(cafeId);
    if (!cafe) {
      return res.status(404).json({
        success: false,
        message: "Cafe not found.",
      });
    }

    // Find Plan
    const plan = await Plan.findById(planId);
    if (!plan) {
      return res.status(404).json({
        success: false,
        message: "Subscription plan not found.",
      });
    }

    // Update Cafe subscription attributes
    const now = new Date();
    cafe.subscriptionPlanId = plan._id.toString();
    cafe.subscriptionStatus = "active";
    cafe.subscriptionStart = now;

    const expiry = new Date(now);
    if (plan.billingPeriod === "week") {
      expiry.setDate(expiry.getDate() + 7);
    } else if (plan.billingPeriod === "year") {
      expiry.setFullYear(expiry.getFullYear() + 1);
    } else {
      expiry.setMonth(expiry.getMonth() + 1);
    }
    cafe.subscriptionExpiry = expiry;
    await cafe.save();

    const cafeObj = cafe.toJSON();
    const planObj = plan.toJSON();

    return res.status(200).json({
      success: true,
      message: `Assigned plan '${plan.name}' to cafe '${cafe.name}'.`,
      data: {
        cafe: {
          ...cafeObj,
          id: cafeObj._id.toString(),
        },
        plan: {
          ...planObj,
          id: planObj._id.toString(),
        },
      },
    });
  } catch (error) {
    console.error("[Admin Plan] AssignPlanToCafe error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error assigning plan to cafe.",
    });
  }
};

/**
 * @desc    Delete a subscription plan (Admin only)
 * @route   DELETE /api/admin/plans/:id
 * @access  Protected (Admin)
 */
const deletePlan = async (req, res) => {
  try {
    const { id } = req.params;

    const plan = await Plan.findById(id);
    if (!plan) {
      return res.status(404).json({
        success: false,
        message: "Subscription plan not found.",
      });
    }

    // Clear cafe subscriptionPlanId if any was bound to this plan ID
    await Cafe.updateMany(
      { subscriptionPlanId: id },
      { $set: { subscriptionPlanId: null } }
    );

    await Plan.findByIdAndDelete(id);

    return res.status(200).json({
      success: true,
      message: `Subscription plan '${plan.name}' deleted successfully.`,
      data: {
        id,
      },
    });
  } catch (error) {
    console.error("[Admin Plan] DeletePlan error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Server error deleting subscription plan.",
    });
  }
};

module.exports = {
  getAllPlans,
  getAvailableFeatures,
  getPlanById,
  createPlan,
  updatePlan,
  togglePlanStatus,
  assignPlanToCafe,
  deletePlan,
};
