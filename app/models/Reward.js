const mongoose = require("mongoose");

const VALID_CATEGORIES = [
  "cafee & drinks",
  "bakery & sweets",
  "special discount only",
];

const rewardSchema = new mongoose.Schema(
  {
    cafeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Cafe",
      required: [true, "Reward must belong to a cafe"],
      index: true,
    },
    title: {
      type: String,
      required: [true, "Reward title is required"],
      trim: true,
      maxlength: [120, "Reward title cannot exceed 120 characters"],
    },
    requiredStamps: {
      type: Number,
      required: [true, "Required stamps count is required"],
      min: [1, "Required stamps must be at least 1"],
      max: [100, "Required stamps cannot exceed 100"],
    },
    categoryTag: {
      type: String,
      trim: true,
      default: "",
      maxlength: [50, "Category tag cannot exceed 50 characters"],
    },
    description: {
      type: String,
      required: [true, "Reward description is required"],
      trim: true,
      maxlength: [500, "Description cannot exceed 500 characters"],
    },
    category: {
      type: String,
      required: [true, "Category is required"],
      trim: true,
      lowercase: true,
      enum: {
        values: VALID_CATEGORIES,
        message:
          "Category must be one of: 'cafee & drinks', 'bakery & sweets', 'special discount only'",
      },
      default: "cafee & drinks",
    },
    status: {
      type: String,
      enum: {
        values: ["active", "inactive"],
        message: "Status must be either 'active' or 'inactive'",
      },
      default: "active",
      index: true,
    },
    redemptionsCount: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for querying rewards by cafe and status
rewardSchema.index({ cafeId: 1, status: 1 });

// Virtuals for seamless compatibility
rewardSchema.virtual("name").get(function () {
  return this.title;
});

rewardSchema.virtual("stampsRequired").get(function () {
  return this.requiredStamps;
});

rewardSchema.virtual("tag").get(function () {
  return this.categoryTag;
});

rewardSchema.virtual("isActive").get(function () {
  return this.status === "active";
});

rewardSchema.set("toJSON", {
  virtuals: true,
  transform: (doc, ret) => {
    ret.id = ret._id.toString();
    ret.name = ret.title;
    ret.stampsRequired = ret.requiredStamps;
    ret.tag = ret.categoryTag;
    ret.isActive = ret.status === "active";
    return ret;
  },
});

const Reward = mongoose.models.Reward || mongoose.model("Reward", rewardSchema);

module.exports = Reward;
