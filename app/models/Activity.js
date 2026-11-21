const mongoose = require("mongoose");

const activitySchema = new mongoose.Schema(
  {
    cafeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Cafe",
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: ["stamp", "redemption", "join"],
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
    },
    customerName: {
      type: String,
      required: true,
      trim: true,
    },
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      index: true,
    },
    stampsDelta: {
      type: Number,
      default: 0,
    },
    staffName: {
      type: String,
      default: "Barista",
      trim: true,
    },
    note: {
      type: String,
      default: "",
      trim: true,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

activitySchema.set("toJSON", {
  virtuals: true,
  transform: (doc, ret) => {
    ret.id = ret._id.toString();
    ret.formattedDate = ret.createdAt
      ? new Date(ret.createdAt).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })
      : "Just now";
    delete ret.__v;
    return ret;
  },
});

const Activity =
  mongoose.models.Activity || mongoose.model("Activity", activitySchema);

module.exports = Activity;
