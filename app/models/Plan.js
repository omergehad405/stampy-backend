const mongoose = require("mongoose");

const AVAILABLE_FEATURES = [
  "QR Stamp Card",
  "Basic Analytics",
  "Full Analytics",
  "Advanced Analytics",
  "1 Reward Tier",
  "3 Reward Tiers",
  "5 Reward Tiers",
  "Unlimited Reward Tiers",
  "Up to 50 Customers",
  "Up to 250 Customers",
  "Up to 500 Customers",
  "Unlimited Customers",
  "Email Support",
  "Priority Support",
  "24/7 Dedicated Support",
  "Custom Branding",
  "Multi-staff Accounts",
  "API Access",
  "Custom Integrations",
  "Push Notifications",
  "Promotional Campaigns",
  "Automated Retention",
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
      enum: ["month", "year"],
      default: "month",
    },
    features: {
      type: [
        {
          type: String,
          enum: {
            values: AVAILABLE_FEATURES,
            message: "{VALUE} is not a valid feature",
          },
        },
      ],
      default: [],
    },
    maxCustomers: {
      type: Number,
      default: null,
      min: [1, "Max customers must be at least 1 if set"],
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
