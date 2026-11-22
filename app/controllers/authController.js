const crypto = require("crypto");
const User = require("../models/User");
const Cafe = require("../models/Cafe");
const Activity = require("../models/Activity");
const Redemption = require("../models/Redemption");
const { sendTokenResponse, getCookieOptions } = require("../../utils/generateToken");
const { sendPasswordResetEmail } = require("../../utils/sendEmail");

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

    // All accounts receive a permanent unique QR identifier
    const qrCode = await generateCustomerQrCode(User);

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
      qrCode,
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

    // Ensure account has its permanent QR identifier
    if (!user.qrCode) {
      user.qrCode = await generateCustomerQrCode(User);
      await user.save();
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

    // Ensure every account always has a permanent unique QR identifier (backfill if missing)
    if (!user.qrCode) {
      user.qrCode = await generateCustomerQrCode(User);
      await user.save();
    }

    let associatedCafe = null;
    if (["cafeOwner", "cafeManager", "cafeBarista", "admin"].includes(user.role)) {
      associatedCafe = await getAssociatedCafe(user);
    }

    // Populate user's joined cafes with cafe details
    const populatedUser = await User.findById(user._id).populate({
      path: "cafes.cafeId",
      select: "name slug tagline logoImage coverImage stampTarget status isActive category location rewards",
    });

    // Fetch customer's real activities and redemptions to attach full history to joined cafes
    const [userActivities, userRedemptions] = await Promise.all([
      Activity.find({ customerId: user._id }).sort({ createdAt: -1 }),
      Redemption.find({ customerId: user._id }).sort({ createdAt: -1 }),
    ]);

    const activitiesByCafe = {};
    (userActivities || []).forEach((a) => {
      const cid = a.cafeId ? a.cafeId.toString() : "";
      if (!cid) return;
      if (!activitiesByCafe[cid]) activitiesByCafe[cid] = [];
      activitiesByCafe[cid].push({
        id: a._id.toString(),
        type: a.type || "stamp",
        title: a.title,
        description: a.note || (a.type === "stamp" ? "Visit recorded via Barista QR Scan" : "Loyalty activity"),
        stampsDelta: a.stampsDelta || 0,
        staffName: a.staffName || "Staff",
        date: a.createdAt
          ? new Date(a.createdAt).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })
          : "Recently",
        createdAt: a.createdAt,
      });
    });

    (userRedemptions || []).forEach((r) => {
      const cid = r.cafeId ? r.cafeId.toString() : "";
      if (!cid) return;
      if (!activitiesByCafe[cid]) activitiesByCafe[cid] = [];
      const alreadyLogged = activitiesByCafe[cid].some(
        (act) => act.type === "redemption" && (act.id === r._id.toString() || (act.title && act.title.includes(r.rewardName)))
      );
      if (!alreadyLogged) {
        activitiesByCafe[cid].push({
          id: `rdm-${r._id.toString()}`,
          type: "redemption",
          title: `Redeemed ${r.rewardName}`,
          description: `Reward Code: ${r.code} • Status: ${r.status}`,
          stampsDelta: -r.stampsSpent,
          staffName: "Self",
          date: r.createdAt
            ? new Date(r.createdAt).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })
            : "Recently",
          createdAt: r.createdAt,
        });
      }
    });

    const joinedCafesList = (populatedUser?.cafes || [])
      .filter((c) => c.cafeId)
      .map((c) => {
        const cafeCid = c.cafeId._id.toString();
        const cafeHistory = [...(activitiesByCafe[cafeCid] || [])];
        if (c.joinedAt && !cafeHistory.some((act) => act.type === "join")) {
          cafeHistory.push({
            id: `act-joined-${cafeCid}`,
            type: "join",
            title: "Joined Loyalty Program",
            description: `Welcome to ${c.cafeId.name}! Digital card activated.`,
            stampsDelta: 0,
            staffName: "System",
            date: new Date(c.joinedAt).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            }),
            createdAt: c.joinedAt,
          });
        }
        cafeHistory.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        return {
          cafeId: cafeCid,
          slug: c.cafeId.slug,
          name: c.cafeId.name,
          logoImage: c.cafeId.logoImage,
          coverImage: c.cafeId.coverImage,
          category: c.cafeId.category,
          totalStamps: c.cafeId.stampTarget || 10,
          stamps: c.stamps || 0,
          totalVisits: c.totalVisits || 0,
          lifetimeStamps: c.lifetimeStamps || 0,
          rewardsRedeemedCount: c.rewardsRedeemedCount || 0,
          joinedAt: c.joinedAt,
          lastVisitDate: c.lastVisitDate,
          history: cafeHistory,
        };
      });

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
          joinedCafes: joinedCafesList.length,
          joinedCafesCount: joinedCafesList.length,
          cafes: joinedCafesList,
          redeemedRewards: user.redeemedRewards ?? 0,
          notificationsEnabled: user.notificationsEnabled ?? true,
          biometricsEnabled: user.biometricsEnabled ?? true,
          qrCode: user.qrCode || "",
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
          qrCode: user.qrCode || "",
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

/**
 * @desc   Request password reset token and send email
 * @route  POST /api/auth/forgot-password
 * @access Public
 */
const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email || !emailRegex.test(email.trim())) {
      return res.status(400).json({
        success: false,
        message: "Please provide a valid email address.",
      });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const user = await User.findOne({ email: normalizedEmail });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "No account found with this email address.",
      });
    }

    // Generate reset token (valid for 15 minutes)
    const resetToken = user.getResetPasswordToken();
    await user.save({ validateBeforeSave: false });

    // Determine client frontend URL
    const clientOrigin =
      req.headers.origin || process.env.FRONTEND_URL || "http://localhost:3000";
    const resetUrl = `${clientOrigin}/reset-password?token=${resetToken}`;

    try {
      await sendPasswordResetEmail({
        email: user.email,
        name: user.name,
        resetUrl,
      });

      return res.status(200).json({
        success: true,
        message: "A password reset link has been sent to your email. The link is valid for 15 minutes.",
        expiresInMinutes: 15,
      });
    } catch (mailError) {
      console.error("[Auth] Email delivery failure:", mailError);
      user.resetPasswordToken = undefined;
      user.resetPasswordExpire = undefined;
      await user.save({ validateBeforeSave: false });

      return res.status(500).json({
        success: false,
        message: "Email could not be sent. Please check mail settings and try again.",
      });
    }
  } catch (error) {
    console.error("[Auth] Forgot password error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error processing forgot password request.",
    });
  }
};

/**
 * @desc   Reset user password using token
 * @route  POST /api/auth/reset-password
 * @access Public
 */
const resetPassword = async (req, res) => {
  try {
    const token = req.body.token || req.params.token || req.query.token;
    const { password, confirmPassword } = req.body;

    if (!token) {
      return res.status(400).json({
        success: false,
        message: "Reset token is missing or invalid.",
      });
    }

    if (!password || password.length < 8) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 8 characters long.",
      });
    }

    if (confirmPassword !== undefined && password !== confirmPassword) {
      return res.status(400).json({
        success: false,
        message: "Password and password confirmation do not match.",
      });
    }

    // Hash the plain token to match against the DB record
    const resetPasswordToken = crypto
      .createHash("sha256")
      .update(token)
      .digest("hex");

    const user = await User.findOne({
      resetPasswordToken,
      resetPasswordExpire: { $gt: Date.now() },
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: "Password reset link is invalid or has expired (exceeded 15 minutes). Please request a new link.",
      });
    }

    // Set new password
    user.password = password;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;
    await user.save();

    return res.status(200).json({
      success: true,
      message: "Your password has been successfully reset. You can now sign in with your new password.",
    });
  } catch (error) {
    console.error("[Auth] Reset password error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error resetting password.",
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
  forgotPassword,
  resetPassword,
};
