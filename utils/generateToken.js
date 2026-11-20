const jwt = require("jsonwebtoken");

/**
 * Generate signed JWT token
 * @param {Object} user - Mongoose User document or plain object with _id and role
 * @returns {string} Signed JWT
 */
const generateToken = (user) => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET environment variable is not defined");
  }

  const expiresIn = process.env.JWT_EXPIRES_IN || "7d";

  return jwt.sign(
    {
      id: user._id ? user._id.toString() : user.id,
      role: user.role,
    },
    secret,
    {
      expiresIn,
      algorithm: "HS256",
    }
  );
};

/**
 * Safe cookie options for JWT transmission
 */
const getCookieOptions = () => {
  const isProduction = process.env.NODE_ENV === "production";
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? "none" : "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    path: "/",
  };
};

/**
 * Send standard token response with HttpOnly cookie and sanitized user payload
 */
const sendTokenResponse = (user, statusCode, res, message = "Success", extraData = null) => {
  const token = generateToken(user);
  const cookieOptions = getCookieOptions();

  res.cookie("token", token, cookieOptions);

  const payload = {
    user: {
      id: user._id ? user._id.toString() : user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      cafeId: user.cafeId ? user.cafeId.toString() : undefined,
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
    },
    token,
  };

  if (extraData) {
    if (extraData.cafe !== undefined) {
      Object.assign(payload, extraData);
    } else {
      payload.cafe = extraData;
    }
  }

  return res.status(statusCode).json({
    success: true,
    message,
    data: payload,
  });
};

module.exports = {
  generateToken,
  getCookieOptions,
  sendTokenResponse,
};
