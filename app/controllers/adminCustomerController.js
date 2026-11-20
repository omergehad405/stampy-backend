const User = require("../models/User");

/**
 * Helper to serialize MongoDB User document into Customer response format
 */
const formatCustomerUser = (user) => {
  const obj = user.toJSON ? user.toJSON() : user;
  const idStr = obj._id ? obj._id.toString() : obj.id;

  return {
    id: idStr,
    _id: idStr,
    name: obj.name,
    email: obj.email,
    phone: obj.phone || "",
    avatar: obj.avatar || "",
    code: obj.qrCode || `STAMPY-${idStr.slice(-4).toUpperCase()}`,
    qrCode: obj.qrCode || "",
    role: obj.role,
    status: obj.isActive ? "active" : "suspended",
    isActive: obj.isActive,
    registeredDate: obj.createdAt
      ? new Date(obj.createdAt).toISOString().split("T")[0]
      : new Date().toISOString().split("T")[0],
    createdAt: obj.createdAt,
    updatedAt: obj.updatedAt,
    totalStamps: obj.totalStamps ?? 0,
    totalLifetimeStamps: obj.totalStamps ?? 0,
    lifetimeStamps: obj.totalStamps ?? 0,
    stamps: obj.totalStamps ?? 0,
    availableRewards: obj.availableRewards ?? 0,
    redeemedRewards: obj.redeemedRewards ?? 0,
    joinedCafes: ["coffee-house"],
    joinedCafesCount: typeof obj.joinedCafes === "number" ? obj.joinedCafes : 0,
    totalVisits: obj.totalStamps ?? 0,
  };
};

/**
 * @desc    Get all registered customers (role === 'user') (Admin only)
 * @route   GET /api/admin/customers
 * @access  Protected (Admin)
 */
const getAllCustomers = async (req, res) => {
  try {
    const users = await User.find({ role: "user" })
      .select("-password")
      .sort({ createdAt: -1 });

    const formattedCustomers = users.map(formatCustomerUser);

    return res.status(200).json({
      success: true,
      count: formattedCustomers.length,
      data: {
        customers: formattedCustomers,
      },
    });
  } catch (error) {
    console.error("[Admin Customers] GetAllCustomers error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error fetching customers.",
    });
  }
};

/**
 * @desc    Get single customer by ID (Admin only)
 * @route   GET /api/admin/customers/:id
 * @access  Protected (Admin)
 */
const getCustomerById = async (req, res) => {
  try {
    const { id } = req.params;

    const user = await User.findOne({ _id: id, role: "user" }).select("-password");
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Customer not found.",
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        customer: formatCustomerUser(user),
      },
    });
  } catch (error) {
    console.error("[Admin Customers] GetCustomerById error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error fetching customer details.",
    });
  }
};

/**
 * @desc    Update customer status (active / suspended) (Admin only)
 * @route   PATCH /api/admin/customers/:id/status
 * @access  Protected (Admin)
 */
const updateCustomerStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const validStatuses = ["active", "suspended", "inactive"];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Invalid status '${status}'. Must be one of: ${validStatuses.join(", ")}`,
      });
    }

    const user = await User.findOne({ _id: id, role: "user" });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Customer not found.",
      });
    }

    user.isActive = status === "active";
    await user.save();

    return res.status(200).json({
      success: true,
      message: `Customer status updated to ${status}.`,
      data: {
        customer: formatCustomerUser(user),
      },
    });
  } catch (error) {
    console.error("[Admin Customers] UpdateCustomerStatus error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error updating customer status.",
    });
  }
};

module.exports = {
  getAllCustomers,
  getCustomerById,
  updateCustomerStatus,
};
