const User = require("../models/User");
const Cafe = require("../models/Cafe");

/**
 * Generate a URL-friendly, unique slug from cafe name
 */
const generateUniqueSlug = async (name) => {
  let baseSlug = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (!baseSlug) baseSlug = "cafe";

  let slug = baseSlug;
  let counter = 1;

  while (await Cafe.findOne({ slug })) {
    slug = `${baseSlug}-${counter}`;
    counter++;
  }

  return slug;
};

/**
 * Helper to validate email format
 */
const isValidEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

/**
 * @desc    Get all cafes (Admin only)
 * @route   GET /api/admin/cafes
 * @access  Protected (Admin)
 */
const getAllCafes = async (req, res) => {
  try {
    const cafes = await Cafe.find().sort({ createdAt: -1 });

    const formattedCafes = cafes.map((c) => {
      const obj = c.toJSON();
      return {
        ...obj,
        id: obj._id.toString(),
        registrationDate: obj.createdAt
          ? new Date(obj.createdAt).toISOString().split("T")[0]
          : new Date().toISOString().split("T")[0],
      };
    });

    return res.status(200).json({
      success: true,
      count: formattedCafes.length,
      data: {
        cafes: formattedCafes,
      },
    });
  } catch (error) {
    console.error("[Admin Cafe] GetAllCafes error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error fetching cafes.",
    });
  }
};

/**
 * @desc    Create a new cafe and owner staff account (Admin only)
 * @route   POST /api/admin/cafes
 * @access  Protected (Admin)
 */
const createCafe = async (req, res) => {
  try {
    const { name, ownerName, email, password, phone, subscriptionPlanId } = req.body;

    // 1. Validate required fields
    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: "Cafe name is required.",
      });
    }

    if (!email || !email.trim()) {
      return res.status(400).json({
        success: false,
        message: "Staff login email is required.",
      });
    }

    const normalizedEmail = email.trim().toLowerCase();
    if (!isValidEmail(normalizedEmail)) {
      return res.status(400).json({
        success: false,
        message: "Please provide a valid email address.",
      });
    }

    if (!password) {
      return res.status(400).json({
        success: false,
        message: "Initial password is required.",
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        message: "Initial password must be at least 8 characters long.",
      });
    }

    if (!phone || !phone.trim()) {
      return res.status(400).json({
        success: false,
        message: "Phone number is required.",
      });
    }

    // 2. Check if user already exists
    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: `An account with email '${normalizedEmail}' already exists. Please use a unique staff login email.`,
      });
    }

    // 3. Create Cafe Owner account
    const resolvedOwnerName = ownerName && ownerName.trim() ? ownerName.trim() : `${name.trim()} Owner`;
    const newOwner = await User.create({
      name: resolvedOwnerName,
      email: normalizedEmail,
      password: password, // Pre-save hook hashes with bcryptjs
      role: "cafeOwner",
      phone: phone.trim(),
      isActive: true,
    });

    // 4. Generate unique slug and create Cafe
    const slug = await generateUniqueSlug(name);
    const chosenPlanId = subscriptionPlanId && subscriptionPlanId.trim() ? subscriptionPlanId.trim() : "plan-free";

    let planObj = null;
    if (mongoose.isValidObjectId(chosenPlanId)) {
      planObj = await Plan.findById(chosenPlanId);
    }
    if (!planObj) {
      const clean = chosenPlanId.replace(/^plan-/, "");
      planObj = await Plan.findOne({ name: { $regex: new RegExp(`^${clean}$`, "i") } });
    }

    const now = new Date();
    const expiry = new Date(now);
    const period = planObj?.billingPeriod || "month";
    if (period === "week") {
      expiry.setDate(expiry.getDate() + 7);
    } else if (period === "year") {
      expiry.setFullYear(expiry.getFullYear() + 1);
    } else {
      expiry.setMonth(expiry.getMonth() + 1);
    }

    const newCafe = await Cafe.create({
      name: name.trim(),
      slug,
      subscriptionPlanId: chosenPlanId,
      subscriptionStart: now,
      subscriptionExpiry: expiry,
      status: "active",
      isActive: true,
      owner: {
        userId: newOwner._id,
        name: newOwner.name,
        email: newOwner.email,
        phone: newOwner.phone,
      },
      contact: {
        email: newOwner.email,
        phone: newOwner.phone,
        displayPhone: newOwner.phone,
      },
    });

    // Link owner to created cafe
    newOwner.cafeId = newCafe._id;
    await newOwner.save();

    const responseCafe = newCafe.toJSON();
    responseCafe.id = newCafe._id.toString();
    responseCafe.registrationDate = new Date(newCafe.createdAt).toISOString().split("T")[0];

    return res.status(201).json({
      success: true,
      message: `Cafe '${newCafe.name}' and staff account successfully created.`,
      data: {
        cafe: responseCafe,
        staff: {
          id: newOwner._id.toString(),
          name: newOwner.name,
          email: newOwner.email,
          role: newOwner.role,
        },
      },
    });
  } catch (error) {
    console.error("[Admin Cafe] CreateCafe error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Server error creating cafe.",
    });
  }
};

/**
 * @desc    Update cafe status (Admin only)
 * @route   PATCH /api/admin/cafes/:id/status
 * @access  Protected (Admin)
 */
const updateCafeStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const validStatuses = ["active", "pending", "suspended"];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Invalid status '${status}'. Must be one of: ${validStatuses.join(", ")}`,
      });
    }

    const cafe = await Cafe.findById(id);
    if (!cafe) {
      return res.status(404).json({
        success: false,
        message: "Cafe not found.",
      });
    }

    cafe.status = status;
    cafe.isActive = status === "active";
    await cafe.save();

    return res.status(200).json({
      success: true,
      message: `Cafe status updated to ${status}.`,
      data: {
        cafe: {
          id: cafe._id.toString(),
          name: cafe.name,
          status: cafe.status,
          isActive: cafe.isActive,
        },
      },
    });
  } catch (error) {
    console.error("[Admin Cafe] UpdateCafeStatus error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error updating cafe status.",
    });
  }
};

/**
 * @desc    Update cafe information (Admin only)
 * @route   PUT /api/admin/cafes/:id
 * @access  Protected (Admin)
 */
const updateCafe = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, tagline, category, subscriptionPlanId, ownerName, email, phone } = req.body;

    const cafe = await Cafe.findById(id);
    if (!cafe) {
      return res.status(404).json({
        success: false,
        message: "Cafe not found.",
      });
    }

    if (name && name.trim()) cafe.name = name.trim();
    if (tagline !== undefined) cafe.tagline = tagline.trim();
    if (category !== undefined) cafe.category = category.trim();
    if (subscriptionPlanId !== undefined) {
      const trimmedPlan = subscriptionPlanId.trim();
      if (trimmedPlan !== cafe.subscriptionPlanId) {
        cafe.subscriptionPlanId = trimmedPlan;
        let pObj = null;
        if (mongoose.isValidObjectId(trimmedPlan)) {
          pObj = await Plan.findById(trimmedPlan);
        }
        if (!pObj) {
          const clean = trimmedPlan.replace(/^plan-/, "");
          pObj = await Plan.findOne({ name: { $regex: new RegExp(`^${clean}$`, "i") } });
        }
        const now = new Date();
        cafe.subscriptionStart = now;
        const expiry = new Date(now);
        const period = pObj?.billingPeriod || "month";
        if (period === "week") {
          expiry.setDate(expiry.getDate() + 7);
        } else if (period === "year") {
          expiry.setFullYear(expiry.getFullYear() + 1);
        } else {
          expiry.setMonth(expiry.getMonth() + 1);
        }
        cafe.subscriptionExpiry = expiry;
      }
    }

    if (ownerName && ownerName.trim()) {
      cafe.owner.name = ownerName.trim();
    }
    if (email && email.trim()) {
      cafe.owner.email = email.trim().toLowerCase();
      cafe.contact.email = email.trim().toLowerCase();
    }
    if (phone && phone.trim()) {
      cafe.owner.phone = phone.trim();
      cafe.contact.phone = phone.trim();
      cafe.contact.displayPhone = phone.trim();
    }

    await cafe.save();

    const responseCafe = cafe.toJSON();
    responseCafe.id = cafe._id.toString();

    return res.status(200).json({
      success: true,
      message: "Cafe updated successfully.",
      data: {
        cafe: responseCafe,
      },
    });
  } catch (error) {
    console.error("[Admin Cafe] UpdateCafe error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error updating cafe.",
    });
  }
};

module.exports = {
  getAllCafes,
  createCafe,
  updateCafeStatus,
  updateCafe,
};
