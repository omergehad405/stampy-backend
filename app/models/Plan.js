const mongoose = require("mongoose");

const AVAILABLE_FEATURES = [
  "digital_menu",
  "activity_history",
  "multi_staff",
  "promotional_campaigns",
  "unlimited_customers",
  "unlimited_rewards",
  // Human-readable labels
  "Digital Menu",
  "Activity History Page",
  "Multi-staff Accounts",
  "Promotional Campaigns",
  "Unlimited Customers",
  "Unlimited Rewards",
];

const planSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Plan name is required"],
      unique: true,
      trim: true,
      maxlength: [60, "Plan name cannot exceed 60 characters"],
    },
    description: {
      type: String,
      required: [true, "Plan description is required"],
      trim: true,
      maxlength: [300, "Description cannot exceed 300 characters"],
    },
    price: {
      type: Number,
      required: [true, "Price is required"],
      min: [0, "Price cannot be negative"],
      default: 0,
    },
    billingPeriod: {
      type: String,
      enum: ["week", "month", "year"],
      default: "month",
    },
    features: {
      type: [String],
      default: [],
    },
    maxCustomers: {
      type: Number,
      default: 50,
      min: [1, "Max customers must be at least 1 if set"],
    },
    maxRewards: {
      type: Number,
      default: 3,
      min: [1, "Max rewards must be at least 1 if set"],
    },
    maxStaff: {
      type: Number,
      default: 1,
      min: [1, "Max staff must be at least 1"],
    },
    isUnlimitedCustomers: {
      type: Boolean,
      default: false,
    },
    isUnlimitedRewards: {
      type: Boolean,
      default: false,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    isPopular: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

// Virtual for ID serialization consistency
planSchema.set("toJSON", {
  virtuals: true,
  transform: (doc, ret) => {
    ret.id = ret._id.toString();
    return ret;
  },
});

const Plan = mongoose.model("Plan", planSchema);

module.exports = {
  Plan,
  AVAILABLE_FEATURES,
};
