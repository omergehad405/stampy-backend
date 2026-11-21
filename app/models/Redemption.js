const mongoose = require("mongoose");

const redemptionSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },
    cafeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Cafe",
      required: true,
      index: true,
    },
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    customerName: {
      type: String,
      default: "Customer",
    },
    rewardId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Reward",
      required: true,
    },
    rewardName: {
      type: String,
      required: true,
    },
    stampsSpent: {
      type: Number,
      required: true,
      min: 1,
    },
    status: {
      type: String,
      enum: ["pending", "used", "expired", "cancelled"],
      default: "pending",
      index: true,
    },
    branch: {
      type: String,
      default: "Main Counter",
    },
    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
    },
    usedAt: {
      type: Date,
      default: null,
    },
    verifiedBy: {
      userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      name: String,
      role: String,
    },
  },
  {
    timestamps: true,
  }
);

redemptionSchema.set("toJSON", {
  virtuals: true,
  transform: (doc, ret) => {
    ret.id = ret._id.toString();
    ret.formattedDate = ret.createdAt
      ? new Date(ret.createdAt).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        })
      : "Recently";
    delete ret.__v;
    return ret;
  },
});

const Redemption =
  mongoose.models.Redemption || mongoose.model("Redemption", redemptionSchema);

module.exports = Redemption;
