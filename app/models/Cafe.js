const mongoose = require("mongoose");

const cafeSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Cafe name is required"],
      trim: true,
      maxlength: [100, "Cafe name cannot exceed 100 characters"],
    },
    slug: {
      type: String,
      required: [true, "Cafe slug is required"],
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    tagline: {
      type: String,
      default: "Specialty Coffee Roasters & Artisan Bakery",
      trim: true,
      maxlength: [200, "Tagline cannot exceed 200 characters"],
    },
    category: {
      type: String,
      default: "Coffee & Bakery",
      trim: true,
    },
    establishedYear: {
      type: Number,
      default: 2021,
    },
    status: {
      type: String,
      enum: ["active", "pending", "suspended"],
      default: "active",
      index: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    isVerified: {
      type: Boolean,
      default: true,
    },
    subscriptionPlanId: {
      type: String,
      default: "plan-free",
      trim: true,
    },
    subscriptionStatus: {
      type: String,
      enum: ["active", "trial", "cancelled", "past_due"],
      default: "active",
    },
    subscriptionStart: {
      type: Date,
      default: Date.now,
    },
    subscriptionExpiry: {
      type: Date,
      default: null,
    },
    stampTarget: {
      type: Number,
      default: 10,
      min: [1, "Stamp target must be at least 1"],
    },
    customerCount: {
      type: Number,
      default: 0,
    },
    // Customers enrolled in this cafe loyalty program (connected through User ID)
    customers: [
      {
        userId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          required: true,
        },
        joinedAt: {
          type: Date,
          default: Date.now,
        },
        stamps: {
          type: Number,
          default: 0,
          min: 0,
        },
        totalVisits: {
          type: Number,
          default: 0,
          min: 0,
        },
        lifetimeStamps: {
          type: Number,
          default: 0,
          min: 0,
        },
        rewardsRedeemedCount: {
          type: Number,
          default: 0,
          min: 0,
        },
        lastVisitDate: {
          type: Date,
          default: null,
        },
        status: {
          type: String,
          enum: ["active", "inactive"],
          default: "active",
        },
        favoriteItem: {
          type: String,
          default: "",
        },
        notes: {
          type: String,
          default: "",
        },
      },
    ],
    totalStampsIssued: {
      type: Number,
      default: 0,
    },
    totalRewardsRedeemed: {
      type: Number,
      default: 0,
    },
    coverImage: {
      type: String,
      default:
        "https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?auto=format&fit=crop&w=1600&q=80",
    },
    coverImageAlt: {
      type: String,
      default: "",
    },
    logoImage: {
      type: String,
      default:
        "https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?auto=format&fit=crop&w=400&q=80",
    },
    logoAlt: {
      type: String,
      default: "",
    },
    accentColor: {
      type: String,
      default: "#3B2418",
    },

    // About Section
    about: {
      shortDescription: {
        type: String,
        default: "",
        trim: true,
      },
      fullDescription: {
        type: String,
        default: "",
        trim: true,
      },
      highlights: {
        type: [String],
        default: [],
      },
    },

    // Location & Navigation
    location: {
      address: { type: String, default: "", trim: true },
      district: { type: String, default: "", trim: true },
      city: { type: String, default: "", trim: true },
      postcode: { type: String, default: "", trim: true },
      fullAddress: { type: String, default: "", trim: true },
      directionsHint: { type: String, default: "", trim: true },
      googleMapsUrl: { type: String, default: "", trim: true },
      coordinates: {
        lat: { type: Number, default: null },
        lng: { type: Number, default: null },
      },
    },

    // Operating Hours & Weekly Schedule
    openingHours: {
      timezone: {
        type: String,
        default: "Europe/London",
      },
      holidayNotice: {
        type: String,
        default: "",
      },
      schedule: [
        {
          day: { type: String, required: true },
          open: { type: String, default: "07:30" },
          close: { type: String, default: "19:00" },
          isClosed: { type: Boolean, default: false },
        },
      ],
    },

    // Contact Information
    contact: {
      email: {
        type: String,
        trim: true,
        lowercase: true,
        default: "",
      },
      phone: {
        type: String,
        trim: true,
        default: "",
      },
      displayPhone: {
        type: String,
        trim: true,
        default: "",
      },
    },

    // Digital Presence / Website
    website: {
      url: { type: String, default: "", trim: true },
      displayUrl: { type: String, default: "", trim: true },
    },

    // Social Media Accounts
    socialMedia: {
      instagram: {
        handle: { type: String, default: "", trim: true },
        url: { type: String, default: "", trim: true },
        followersCount: { type: String, default: "", trim: true },
      },
      facebook: {
        handle: { type: String, default: "", trim: true },
        url: { type: String, default: "", trim: true },
      },
      tiktok: {
        handle: { type: String, default: "", trim: true },
        url: { type: String, default: "", trim: true },
      },
      whatsapp: {
        handle: { type: String, default: "", trim: true },
        url: { type: String, default: "", trim: true },
      },
    },

    // Digital Menu Teaser / Categories
    menuPreview: {
      isAvailable: {
        type: Boolean,
        default: true,
      },
      note: {
        type: String,
        default: "",
      },
      categories: [
        {
          id: { type: String },
          title: { type: String, default: "" },
          name: { type: String, default: "" },
          description: { type: String, default: "" },
          price: { type: String, default: "" },
          count: { type: String, default: "" },
          icon: { type: String, default: "" },
          items: [
            {
              name: { type: String, default: "" },
              price: { type: String, default: "" },
              desc: { type: String, default: "" },
              tag: { type: String, default: "" },
            },
          ],
        },
      ],
    },

    // Cafe Owner Reference
    owner: {
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: [true, "Cafe must have an associated owner"],
      },
      name: {
        type: String,
        required: [true, "Owner name is required"],
        trim: true,
      },
      email: {
        type: String,
        required: [true, "Owner email is required"],
        trim: true,
        lowercase: true,
      },
      phone: {
        type: String,
        required: [true, "Owner phone number is required"],
        trim: true,
      },
    },
  },
  {
    timestamps: true,
  }
);

// Virtual for ID serialization consistency
cafeSchema.set("toJSON", {
  virtuals: true,
  transform: (doc, ret) => {
    ret.id = ret._id.toString();
    return ret;
  },
});

module.exports = mongoose.model("Cafe", cafeSchema);
