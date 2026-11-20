const { Plan, AVAILABLE_FEATURES } = require("../models/Plan");
const Cafe = require("../models/Cafe");

/**
 * Helper to normalize/validate features array against the enum
 */
const validateFeatures = (features) => {
  if (!Array.isArray(features)) {
    return { valid: false, message: "Features must be an array of strings." };
  }

  // Find match in AVAILABLE_FEATURES (case-insensitive mapping for developer ease)
  const normalizedFeatures = [];
  for (const feat of features) {
    if (typeof feat !== "string" || !feat.trim()) continue;
    const trimmed = feat.trim();
    const matched = AVAILABLE_FEATURES.find(
      (af) => af.toLowerCase() === trimmed.toLowerCase()
    );
    if (!matched) {
      return {
        valid: false,
        message: `Feature '${trimmed}' is not allowed. Valid features are: ${AVAILABLE_FEATURES.join(", ")}`,
      };
    }
    if (!normalizedFeatures.includes(matched)) {
      normalizedFeatures.push(matched);
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
        availableFeatures: AVAILABLE_FEATURES,
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
      features: AVAILABLE_FEATURES,
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

    // 4. Create plan
    const newPlan = await Plan.create({
      name: name.trim(),
      description: description.trim(),
      price: Number(price),
      billingPeriod: billingPeriod === "year" ? "year" : "month",
      features: featValidation.features,
      maxCustomers: maxCustomers ? Number(maxCustomers) : null,
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
      plan.billingPeriod = billingPeriod === "year" ? "year" : "month";
    }

    if (features !== undefined) {
      const featValidation = validateFeatures(features);
      if (!featValidation.valid) {
        return res.status(400).json({
          success: false,
          message: featValidation.message,
        });
      }
      plan.features = featValidation.features;
    }

    if (maxCustomers !== undefined) {
      plan.maxCustomers = maxCustomers ? Number(maxCustomers) : null;
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
    cafe.subscriptionPlanId = plan._id.toString();
    cafe.subscriptionStatus = "active";
    cafe.subscriptionStart = new Date();
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
