const crypto = require("crypto");
const User = require("../models/User");
const Cafe = require("../models/Cafe");
const { sendTokenResponse, getCookieOptions } = require("../../utils/generateToken");

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Format cafe object for API responses
 */
const formatCafeResponse = (cafe) => {
  if (!cafe) return null;
  const raw = typeof cafe.toJSON === "function" ? cafe.toJSON() : cafe;
  return {
    ...raw,
    id: cafe._id ? cafe._id.toString() : cafe.id,
    name: cafe.name,
    slug: cafe.slug,
    tagline: cafe.tagline || "",
    category: cafe.category || "Coffee & Bakery",
    establishedYear: cafe.establishedYear || 2021,
    status: cafe.status || "active",
    isActive: cafe.isActive !== false,
    isVerified: cafe.isVerified || false,
    stampTarget: cafe.stampTarget || 10,
    customerCount: cafe.customerCount || 0,
    totalStampsIssued: cafe.totalStampsIssued || 0,
    totalRewardsRedeemed: cafe.totalRewardsRedeemed || 0,
    subscriptionPlanId: cafe.subscriptionPlanId || "plan-free",
    subscriptionStatus: cafe.subscriptionStatus || "active",
    coverImage: cafe.coverImage || "",
    coverImageAlt: cafe.coverImageAlt || "",
    logoImage: cafe.logoImage || "",
    logoAlt: cafe.logoAlt || "",
    accentColor: cafe.accentColor || "#3B2418",
    about: cafe.about || { shortDescription: "", fullDescription: "", highlights: [] },
    location: cafe.location || {},
    openingHours: cafe.openingHours || { timezone: "Europe/London", holidayNotice: "", schedule: [] },
    contact: cafe.contact || {},
    website: cafe.website || { url: "", displayUrl: "" },
    socialMedia: cafe.socialMedia || {},
    menuPreview: cafe.menuPreview || { isAvailable: true, note: "", categories: [] },
  };
};

/**
 * Helper to fetch associated cafe for staff/owners/admin
 */
const getAssociatedCafe = async (user) => {
  if (!user) return null;
  try {
    if (user.cafeId) {
      const cafe = await Cafe.findById(user.cafeId);
      if (cafe) return cafe;
    }

    if (["cafeOwner", "cafeManager", "cafeBarista"].includes(user.role)) {
      const cafe = await Cafe.findOne({
        $or: [
          { "owner.userId": user._id },
          { "owner.email": user.email.toLowerCase() },
        ],
      });
      if (cafe) {
        if (!user.cafeId && user.save) {
          user.cafeId = cafe._id;
          await user.save();
        }
        return cafe;
      }
    }

    if (user.role === "admin") {
      return await Cafe.findOne({ isActive: true }).sort({ createdAt: -1 });
    }
  } catch (err) {
    console.warn("[Auth] Error finding associated cafe:", err.message);
  }
  return null;
};

/**
 * Generate a cryptographically secure, globally unique customer QR identifier
 */
const generateCustomerQrCode = async (UserModel) => {
  let isUnique = false;
  let qrCode = "";
  let attempts = 0;

  while (!isUnique && attempts < 10) {
    qrCode = crypto.randomBytes(24).toString("hex");
    const existing = await UserModel.findOne({ qrCode });
    if (!existing) {
      isUnique = true;
    }
    attempts++;
  }

  if (!isUnique) {
    throw new Error("Failed to generate a unique customer QR identifier");
  }

  return qrCode;
};

/**
 * @desc    Register a new user (Customer or Cafe Owner only)
 * @route   POST /api/auth/register
 * @access  Public
 */
const register = async (req, res) => {
  try {
    const { name, email, password, role, registrationType, phone } = req.body;

    // Validate required fields
    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "Please provide name, email, and password.",
      });
    }

    const trimmedName = name.trim();
    const normalizedEmail = email.trim().toLowerCase();

    // Validate email format
    if (!emailRegex.test(normalizedEmail)) {
      return res.status(400).json({
        success: false,
        message: "Please provide a valid email address.",
      });
    }

    // Validate password length
    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 8 characters long.",
      });
    }

    // Role assignment and privilege escalation defense
    const requestedRole = registrationType || role || "user";

    // Strictly forbid public self-registration for administrative/staff roles
    if (["admin", "cafeManager", "cafeBarista"].includes(requestedRole)) {
      return res.status(403).json({
        success: false,
        message: "Public registration is not permitted for this role.",
      });
    }

    // Map public registration types
    let assignedRole = "user";
    if (requestedRole === "cafeOwner") {
      assignedRole = "cafeOwner";
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: "An account with this email already exists.",
      });
    }

    // Customer accounts receive a permanent QR identifier
    let qrCode;
    if (assignedRole === "user") {
      qrCode = await generateCustomerQrCode(User);
    }

    // Create user with default 0 loyalty statistics
    const user = await User.create({
      name: trimmedName,
      email: normalizedEmail,
      password,
      role: assignedRole,
      phone: phone?.trim() || "",
      totalStamps: 0,
      availableRewards: 0,
      joinedCafes: 0,
      redeemedRewards: 0,
      ...(qrCode ? { qrCode } : {}),
      isActive: true,
    });

    return sendTokenResponse(user, 201, res, "Registration successful");
  } catch (error) {
    console.error("[Auth] Register error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error during registration. Please try again.",
    });
  }
};

/**
 * @desc    Authenticate user & get token
 * @route   POST /api/auth/login
 * @access  Public
 */
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validate inputs
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Please provide both email and password.",
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Check user exists (select password explicitly since schema sets select: false)
    const user = await User.findOne({ email: normalizedEmail }).select("+password");

    // Generic error for non-existent account or wrong password
    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password.",
      });
    }

    // Compare password
    const isMatch = await user.matchPassword(password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password.",
      });
    }

    // Check if account is active
    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: "Your account has been deactivated. Please contact support.",
      });
    }

    let associatedCafe = null;
    if (["cafeOwner", "cafeManager", "cafeBarista", "admin"].includes(user.role)) {
      associatedCafe = await getAssociatedCafe(user);
    }

    return sendTokenResponse(
      user,
      200,
      res,
      "Login successful",
      associatedCafe ? { cafe: formatCafeResponse(associatedCafe) } : null
    );
  } catch (error) {
    console.error("[Auth] Login error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error during login. Please try again.",
    });
  }
};

/**
 * @desc    Get current authenticated user profile
 * @route   GET /api/auth/me
 * @access  Protected
 */
const getMe = async (req, res) => {
  try {
    const user = req.user;

    // Ensure customer accounts always have their permanent loyalty QR identifier
    if (user.role === "user" && !user.qrCode) {
      user.qrCode = await generateCustomerQrCode(User);
      await user.save();
    }

    let associatedCafe = null;
    if (["cafeOwner", "cafeManager", "cafeBarista", "admin"].includes(user.role)) {
      associatedCafe = await getAssociatedCafe(user);
    }

    return res.status(200).json({
      success: true,
      data: {
        user: {
          id: user._id.toString(),
          name: user.name,
          email: user.email,
          role: user.role,
          cafeId: user.cafeId ? user.cafeId.toString() : (associatedCafe ? associatedCafe._id.toString() : null),
          isActive: user.isActive,
          phone: user.phone || "",
          avatar: user.avatar || "",
          totalStamps: user.totalStamps ?? 0,
          availableRewards: user.availableRewards ?? 0,
          joinedCafes: user.joinedCafes ?? 0,
          joinedCafesCount: user.joinedCafes ?? 0,
          redeemedRewards: user.redeemedRewards ?? 0,
          notificationsEnabled: user.notificationsEnabled ?? true,
          biometricsEnabled: user.biometricsEnabled ?? true,
          ...(user.role === "user" && user.qrCode ? { qrCode: user.qrCode } : {}),
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
        },
        ...(associatedCafe ? { cafe: formatCafeResponse(associatedCafe) } : {}),
      },
    });
  } catch (error) {
    console.error("[Auth] GetMe error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error fetching user profile.",
    });
  }
};

/**
 * @desc    Log out user / clear cookie
 * @route   POST /api/auth/logout
 * @access  Protected
 */
const logout = async (req, res) => {
  try {
    const cookieOptions = getCookieOptions();

    res.clearCookie("token", {
      httpOnly: cookieOptions.httpOnly,
      secure: cookieOptions.secure,
      sameSite: cookieOptions.sameSite,
      path: "/",
    });

    return res.status(200).json({
      success: true,
      message: "Logged out successfully.",
    });
  } catch (error) {
    console.error("[Auth] Logout error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error during logout.",
    });
  }
};

/**
 * @desc    Get permanent customer QR code
 * @route   GET /api/auth/qr-code
 * @access  Protected (Customer only)
 */
const getCustomerQrCode = async (req, res) => {
  try {
    const user = req.user;

    // Enforce role check: only customers possess permanent loyalty QR codes
    if (user.role !== "user") {
      return res.status(403).json({
        success: false,
        message: "Only customer accounts possess a loyalty QR identifier.",
      });
    }

    // Safely backfill if customer has no QR code stored
    let qrCode = user.qrCode;
    if (!qrCode) {
      qrCode = await generateCustomerQrCode(User);
      user.qrCode = qrCode;
      await user.save();
    }

    return res.status(200).json({
      success: true,
      data: {
        qrCode,
      },
    });
  } catch (error) {
    console.error("[Auth] QR Code error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error retrieving QR identifier.",
    });
  }
};

/**
 * @desc    Update authenticated user profile
 * @route   PUT /api/auth/profile
 * @access  Protected
 */
const updateProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    const { name, phone, avatar, notificationsEnabled, biometricsEnabled, email } = req.body;

    if (name && name.trim()) {
      user.name = name.trim();
    }

    if (phone !== undefined) {
      user.phone = phone.trim();
    }

    if (avatar !== undefined) {
      user.avatar = avatar.trim();
    }

    if (notificationsEnabled !== undefined) {
      user.notificationsEnabled = Boolean(notificationsEnabled);
    }

    if (biometricsEnabled !== undefined) {
      user.biometricsEnabled = Boolean(biometricsEnabled);
    }

    // If email is provided and different, check uniqueness
    if (email && email.trim().toLowerCase() !== user.email) {
      const normalizedEmail = email.trim().toLowerCase();
      if (!emailRegex.test(normalizedEmail)) {
        return res.status(400).json({
          success: false,
          message: "Please provide a valid email address.",
        });
      }
      const existing = await User.findOne({ email: normalizedEmail });
      if (existing && existing._id.toString() !== user._id.toString()) {
        return res.status(400).json({
          success: false,
          message: "This email address is already in use.",
        });
      }
      user.email = normalizedEmail;
    }

    await user.save();

    return res.status(200).json({
      success: true,
      message: "Profile updated successfully.",
      data: {
        user: {
          id: user._id.toString(),
          name: user.name,
          email: user.email,
          role: user.role,
          phone: user.phone || "",
          avatar: user.avatar || "",
          totalStamps: user.totalStamps ?? 0,
          availableRewards: user.availableRewards ?? 0,
          joinedCafes: user.joinedCafes ?? 0,
          joinedCafesCount: user.joinedCafes ?? 0,
          redeemedRewards: user.redeemedRewards ?? 0,
          notificationsEnabled: user.notificationsEnabled ?? true,
          biometricsEnabled: user.biometricsEnabled ?? true,
          isActive: user.isActive,
          ...(user.role === "user" && user.qrCode ? { qrCode: user.qrCode } : {}),
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
        },
      },
    });
  } catch (error) {
    console.error("[Auth] Update profile error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error updating profile.",
    });
  }
};

module.exports = {
  register,
  login,
  getMe,
  logout,
  updateProfile,
  getCustomerQrCode,
  generateCustomerQrCode,
};
