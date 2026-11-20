const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
      maxlength: [100, "Name cannot exceed 100 characters"],
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
      match: [emailRegex, "Please provide a valid email address"],
    },
    password: {
      type: String,
      required: [true, "Password is required"],
      minlength: [8, "Password must be at least 8 characters long"],
      select: false, // Never return password hash in regular queries
    },
    role: {
      type: String,
      enum: {
        values: [
          "admin",
          "user",
          "cafeOwner",
          "cafeManager",
          "cafeBarista",
        ],
        message: "{VALUE} is not a valid Stampy role",
      },
      default: "user",
      required: true,
    },
    cafeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Cafe",
      default: null,
      index: true,
    },
    qrCode: {
      type: String,
      unique: true,
      sparse: true, // Sparse allows multiple null/undefined values for non-customers
      index: true,
    },
    // Customer Loyalty Statistics (defaults to 0 on registration)
    totalStamps: {
      type: Number,
      default: 0,
      min: 0,
    },
    availableRewards: {
      type: Number,
      default: 0,
      min: 0,
    },
    joinedCafes: {
      type: Number,
      default: 0,
      min: 0,
    },
    redeemedRewards: {
      type: Number,
      default: 0,
      min: 0,
    },
    // Customer Profile & Settings
    phone: {
      type: String,
      trim: true,
      default: "",
    },
    avatar: {
      type: String,
      default: "",
    },
    notificationsEnabled: {
      type: Boolean,
      default: true,
    },
    biometricsEnabled: {
      type: Boolean,
      default: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform(doc, ret) {
        delete ret.password;
        delete ret.__v;
        return ret;
      },
    },
    toObject: {
      transform(doc, ret) {
        delete ret.password;
        delete ret.__v;
        return ret;
      },
    },
  }
);

// Hash password before saving if modified
userSchema.pre("save", async function () {
  if (!this.isModified("password")) {
    return;
  }
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

// Compare password method
userSchema.methods.matchPassword = async function (enteredPassword) {
  if (!this.password) {
    return false;
  }
  return await bcrypt.compare(enteredPassword, this.password);
};

const User = mongoose.models.User || mongoose.model("User", userSchema);

module.exports = User;
