const jwt = require("jsonwebtoken");
const User = require("../models/User");

/**
 * Protect middleware:
 * Verifies JWT token from HttpOnly cookie or Authorization header,
 * checks database status and active flag, and attaches req.user.
 */
const protect = async (req, res, next) => {
  let token;

  // 1. Try extracting token from cookies
  if (req.cookies && req.cookies.token) {
    token = req.cookies.token;
  }
  // 2. Try extracting token from Authorization header (Bearer <token>)
  else if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer ")
  ) {
    token = req.headers.authorization.split(" ")[1];
  }

  if (!token) {
    return res.status(401).json({
      success: false,
      message: "Not authorized to access this route. No token provided.",
    });
  }

  try {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      throw new Error("JWT_SECRET environment variable is not defined");
    }

    // Verify token
    const decoded = jwt.verify(token, secret);

    // Fetch user from DB to verify current state
    const user = await User.findById(decoded.id).select("-password");

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "The user belonging to this token no longer exists.",
      });
    }

    // Check if account is active
    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: "Account has been deactivated. Please contact support.",
      });
    }

    // Attach user to request
    req.user = user;
    next();
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      return res.status(401).json({
        success: false,
        message: "Session expired. Please log in again.",
      });
    }
    return res.status(401).json({
      success: false,
      message: "Invalid token. Not authorized.",
    });
  }
};

/**
 * Authorize middleware:
 * Restricts access to specified global roles.
 * @param  {...string} roles Allowed roles ('admin', 'user', 'cafeOwner', 'cafeManager', 'cafeBarista')
 */
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Not authenticated. Authentication required.",
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Role '${req.user.role}' is not authorized to access this route.`,
      });
    }

    next();
  };
};

/**
 * Architectural placeholder for future CafeMembership authorization.
 * In Phase 2, this will verify that req.user is an authorized member
 * of the requested cafe (e.g. req.params.cafeId or req.body.cafeId).
 */
const checkCafeAccess = (paramKey = "cafeId") => {
  return async (req, res, next) => {
    // Platform admin has global bypass
    if (req.user && req.user.role === "admin") {
      return next();
    }

    const cafeId = req.params[paramKey] || req.body[paramKey] || req.query[paramKey];
    if (!cafeId) {
      return res.status(400).json({
        success: false,
        message: "Cafe identifier is required for this operation.",
      });
    }

    // NOTE: CafeMembership model will be integrated in Phase 2.
    // For Phase 1 backend foundation, we prepare this hook cleanly.
    next();
  };
};

/**
 * Architectural placeholder for granular cafe permissions.
 * In Phase 2, this will check membership.permissions.includes(requiredPermission).
 */
const checkPermission = (requiredPermission) => {
  return async (req, res, next) => {
    // Platform admin has all permissions
    if (req.user && req.user.role === "admin") {
      return next();
    }

    // NOTE: Granular CafeMembership permission checks will be implemented in Phase 2.
    next();
  };
};

module.exports = {
  protect,
  authorize,
  checkCafeAccess,
  checkPermission,
};
