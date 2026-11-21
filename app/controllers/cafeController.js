const mongoose = require("mongoose");
const crypto = require("crypto");
const Cafe = require("../models/Cafe");
const Reward = require("../models/Reward");
const User = require("../models/User");
const Redemption = require("../models/Redemption");
const Activity = require("../models/Activity");

/**
 * Helper to resolve cafe for current authenticated user
 */
const resolveUserCafe = async (user, queryCafeId) => {
  if (user.role === "admin" && queryCafeId && mongoose.isValidObjectId(queryCafeId)) {
    const found = await Cafe.findById(queryCafeId);
    if (found) return found;
  }

  if (user.cafeId) {
    const found = await Cafe.findById(user.cafeId);
    if (found) return found;
  }

  // Fallback for owner by owner.userId or owner.email
  if (["cafeOwner", "cafeManager", "cafeBarista"].includes(user.role)) {
    const found = await Cafe.findOne({
      $or: [
        { "owner.userId": user._id },
        { "owner.email": user.email.toLowerCase() },
      ],
    });
    if (found) {
      if (!user.cafeId && user.save) {
        user.cafeId = found._id;
        await user.save();
      }
      return found;
    }
  }

  // Admin fallback to first cafe
  if (user.role === "admin") {
    return await Cafe.findOne().sort({ createdAt: 1 });
  }

  return null;
};

/**
 * @desc    Get all public active cafes
 * @route   GET /api/cafes
 * @access  Public
 */
const getPublicCafes = async (req, res) => {
  try {
    const cafes = await Cafe.find({ isActive: true, status: "active" }).sort({ createdAt: -1 });

    // Fetch rewards for all cafes to attach reward counts & preview
    const cafeIds = cafes.map((c) => c._id);
    const allRewards = await Reward.find({
      cafeId: { $in: cafeIds },
      status: "active",
    }).sort({ requiredStamps: 1 });

    const rewardsByCafe = {};
    allRewards.forEach((r) => {
      const cid = r.cafeId.toString();
      if (!rewardsByCafe[cid]) rewardsByCafe[cid] = [];
      rewardsByCafe[cid].push({
        id: r._id.toString(),
        name: r.title,
        category: r.category,
        description: r.description,
        stampsRequired: r.requiredStamps,
        tag: r.categoryTag || "",
        iconType: "coffee",
      });
    });

    const formattedCafes = cafes.map((c) => {
      const obj = c.toJSON();
      const rewards = rewardsByCafe[c._id.toString()] || [];
      return {
        ...obj,
        id: obj._id ? obj._id.toString() : obj.id,
        rewards,
        rewardsCount: rewards.length,
      };
    });

    return res.status(200).json({
      success: true,
      count: formattedCafes.length,
      data: {
        cafes: formattedCafes,
      },
    });
  } catch (error) {
    console.error("[Cafe Controller] getPublicCafes error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error fetching cafes.",
    });
  }
};

/**
 * @desc    Get single cafe details by slug or ID
 * @route   GET /api/cafes/:slugOrId
 * @access  Public
 */
const getCafeBySlug = async (req, res) => {
  try {
    const { slugOrId } = req.params;

    const query = mongoose.isValidObjectId(slugOrId)
      ? { $or: [{ slug: slugOrId.toLowerCase() }, { _id: slugOrId }] }
      : { slug: slugOrId.toLowerCase() };

    const cafe = await Cafe.findOne(query);

    if (!cafe) {
      return res.status(404).json({
        success: false,
        message: `Cafe '${slugOrId}' not found.`,
      });
    }

    // Attach active rewards
    const cafeRewards = await Reward.find({
      cafeId: cafe._id,
      status: "active",
    }).sort({ requiredStamps: 1 });

    const formattedRewards = cafeRewards.map((r) => ({
      id: r._id.toString(),
      name: r.title,
      category: r.category,
      description: r.description,
      stampsRequired: r.requiredStamps,
      tag: r.categoryTag || "",
      iconType: "coffee",
    }));

    const cafeObj = cafe.toJSON();
    cafeObj.rewards = formattedRewards;

    return res.status(200).json({
      success: true,
      type: "customer",
      data: {
        cafe: cafeObj,
      },
    });
  } catch (error) {
    console.error("[Cafe Controller] getCafeBySlug error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error fetching cafe profile.",
    });
  }
};

/**
 * @desc    Get current cafe profile for dashboard
 * @route   GET /api/dashboard/cafe
 * @access  Protected (cafeOwner, cafeManager, admin)
 */
const getMyCafeProfile = async (req, res) => {
  try {
    const cafe = await resolveUserCafe(req.user, req.query.cafeId);

    if (!cafe) {
      return res.status(404).json({
        success: false,
        message: "No cafe associated with your account.",
      });
    }

    return res.status(200).json({
      success: true,
      type: "customer",
      data: {
        cafe: cafe.toJSON(),
      },
    });
  } catch (error) {
    console.error("[Cafe Controller] getMyCafeProfile error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error fetching cafe profile.",
    });
  }
};

/**
 * @desc    Update cafe profile from dashboard
 * @route   PUT /api/dashboard/cafe
 * @access  Protected (cafeOwner, cafeManager, admin)
 */
const updateMyCafeProfile = async (req, res) => {
  try {
    const cafe = await resolveUserCafe(req.user, req.query.cafeId);

    if (!cafe) {
      return res.status(404).json({
        success: false,
        message: "No cafe found to update.",
      });
    }

    const {
      name,
      tagline,
      category,
      establishedYear,
      coverImage,
      coverImageAlt,
      logoImage,
      logoAlt,
      accentColor,
      isVerified,
      stampTarget,
      about,
      location,
      openingHours,
      contact,
      website,
      socialMedia,
      menuPreview,
    } = req.body;

    if (name && name.trim()) cafe.name = name.trim();
    if (tagline !== undefined) cafe.tagline = tagline.trim();
    if (category !== undefined) cafe.category = category.trim();
    if (establishedYear !== undefined && !isNaN(Number(establishedYear))) {
      cafe.establishedYear = Number(establishedYear);
    }
    if (coverImage !== undefined) cafe.coverImage = coverImage;
    if (coverImageAlt !== undefined) cafe.coverImageAlt = coverImageAlt;
    if (logoImage !== undefined) cafe.logoImage = logoImage;
    if (logoAlt !== undefined) cafe.logoAlt = logoAlt;
    if (accentColor !== undefined) cafe.accentColor = accentColor;
    if (isVerified !== undefined) cafe.isVerified = Boolean(isVerified);
    if (stampTarget !== undefined && Number(stampTarget) > 0) {
      cafe.stampTarget = Number(stampTarget);
    }

    // About
    if (about && typeof about === "object") {
      cafe.about = {
        shortDescription:
          about.shortDescription !== undefined
            ? about.shortDescription
            : cafe.about?.shortDescription || "",
        fullDescription:
          about.fullDescription !== undefined
            ? about.fullDescription
            : cafe.about?.fullDescription || "",
        highlights: Array.isArray(about.highlights)
          ? about.highlights
          : cafe.about?.highlights || [],
      };
    }

    // Location
    if (location && typeof location === "object") {
      cafe.location = {
        address: location.address !== undefined ? location.address : cafe.location?.address || "",
        district: location.district !== undefined ? location.district : cafe.location?.district || "",
        city: location.city !== undefined ? location.city : cafe.location?.city || "",
        postcode: location.postcode !== undefined ? location.postcode : cafe.location?.postcode || "",
        fullAddress:
          location.fullAddress !== undefined ? location.fullAddress : cafe.location?.fullAddress || "",
        directionsHint:
          location.directionsHint !== undefined
            ? location.directionsHint
            : cafe.location?.directionsHint || "",
        googleMapsUrl:
          location.googleMapsUrl !== undefined
            ? location.googleMapsUrl
            : cafe.location?.googleMapsUrl || "",
        coordinates: location.coordinates || cafe.location?.coordinates || { lat: null, lng: null },
      };
    }

    // Opening Hours
    if (openingHours && typeof openingHours === "object") {
      cafe.openingHours = {
        timezone: openingHours.timezone || cafe.openingHours?.timezone || "Europe/London",
        holidayNotice:
          openingHours.holidayNotice !== undefined
            ? openingHours.holidayNotice
            : cafe.openingHours?.holidayNotice || "",
        schedule: Array.isArray(openingHours.schedule)
          ? openingHours.schedule
          : cafe.openingHours?.schedule || [],
      };
    }

    // Contact
    if (contact && typeof contact === "object") {
      cafe.contact = {
        email: contact.email !== undefined ? contact.email : cafe.contact?.email || "",
        phone: contact.phone !== undefined ? contact.phone : cafe.contact?.phone || "",
        displayPhone:
          contact.displayPhone !== undefined ? contact.displayPhone : cafe.contact?.displayPhone || "",
      };
    }

    // Website
    if (website && typeof website === "object") {
      cafe.website = {
        url: website.url !== undefined ? website.url : cafe.website?.url || "",
        displayUrl:
          website.displayUrl !== undefined ? website.displayUrl : cafe.website?.displayUrl || "",
      };
    }

    // Social Media
    if (socialMedia && typeof socialMedia === "object") {
      cafe.socialMedia = {
        instagram: {
          handle:
            socialMedia.instagram?.handle !== undefined
              ? socialMedia.instagram.handle
              : cafe.socialMedia?.instagram?.handle || "",
          url:
            socialMedia.instagram?.url !== undefined
              ? socialMedia.instagram.url
              : cafe.socialMedia?.instagram?.url || "",
          followersCount:
            socialMedia.instagram?.followersCount !== undefined
              ? socialMedia.instagram.followersCount
              : cafe.socialMedia?.instagram?.followersCount || "",
        },
        facebook: {
          handle:
            socialMedia.facebook?.handle !== undefined
              ? socialMedia.facebook.handle
              : cafe.socialMedia?.facebook?.handle || "",
          url:
            socialMedia.facebook?.url !== undefined
              ? socialMedia.facebook.url
              : cafe.socialMedia?.facebook?.url || "",
        },
        tiktok: {
          handle:
            socialMedia.tiktok?.handle !== undefined
              ? socialMedia.tiktok.handle
              : cafe.socialMedia?.tiktok?.handle || "",
          url:
            socialMedia.tiktok?.url !== undefined
              ? socialMedia.tiktok.url
              : cafe.socialMedia?.tiktok?.url || "",
        },
        whatsapp: {
          handle:
            socialMedia.whatsapp?.handle !== undefined
              ? socialMedia.whatsapp.handle
              : cafe.socialMedia?.whatsapp?.handle || "",
          url:
            socialMedia.whatsapp?.url !== undefined
              ? socialMedia.whatsapp.url
              : cafe.socialMedia?.whatsapp?.url || "",
        },
      };
    }

    // Menu Preview
    if (menuPreview && typeof menuPreview === "object") {
      cafe.menuPreview = {
        isAvailable:
          menuPreview.isAvailable !== undefined
            ? Boolean(menuPreview.isAvailable)
            : cafe.menuPreview?.isAvailable ?? true,
        note: menuPreview.note !== undefined ? menuPreview.note : cafe.menuPreview?.note || "",
        categories: Array.isArray(menuPreview.categories)
          ? menuPreview.categories
          : cafe.menuPreview?.categories || [],
      };
    }

    await cafe.save();

    return res.status(200).json({
      success: true,
      message: "Cafe profile updated successfully.",
      data: {
        cafe: cafe.toJSON(),
      },
    });
  } catch (error) {
    console.error("[Cafe Controller] updateMyCafeProfile error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Server error updating cafe profile.",
    });
  }
};

/**
 * @desc    Join a cafe loyalty program
 * @route   POST /api/cafes/:cafeId/join
 * @access  Protected
 */
const joinCafe = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found." });
    }

    const { cafeId } = req.params;

    // Support lookup by ObjectId or slug
    const query = mongoose.isValidObjectId(cafeId)
      ? { $or: [{ _id: cafeId }, { slug: cafeId.toLowerCase() }] }
      : { slug: cafeId.toLowerCase() };

    const cafe = await Cafe.findOne(query);
    if (!cafe) {
      return res.status(404).json({
        success: false,
        message: `Cafe '${cafeId}' not found.`,
      });
    }

    if (!Array.isArray(user.cafes)) user.cafes = [];
    if (!Array.isArray(cafe.customers)) cafe.customers = [];

    // Check if user already joined this cafe
    const existingUserIndex = user.cafes.findIndex(
      (c) => c.cafeId && c.cafeId.toString() === cafe._id.toString()
    );

    const existingCafeCustomerIndex = cafe.customers.findIndex(
      (c) => c.userId && c.userId.toString() === user._id.toString()
    );

    let userMembership;

    if (existingUserIndex >= 0) {
      userMembership = user.cafes[existingUserIndex];
    } else {
      userMembership = {
        cafeId: cafe._id,
        joinedAt: new Date(),
        stamps: 1,
        totalVisits: 1,
        lifetimeStamps: 1,
        rewardsRedeemedCount: 0,
        lastVisitDate: new Date(),
      };
      user.cafes.push(userMembership);
      user.joinedCafes = user.cafes.length;
      user.totalStamps = (user.totalStamps || 0) + 1;
      await user.save();
    }

    // Add to cafe's customers array if not already present
    if (existingCafeCustomerIndex < 0) {
      cafe.customers.push({
        userId: user._id,
        joinedAt: new Date(),
        stamps: userMembership.stamps || 1,
        totalVisits: 1,
        lifetimeStamps: 1,
        rewardsRedeemedCount: 0,
        lastVisitDate: new Date(),
        status: "active",
      });
      cafe.customerCount = cafe.customers.length;
      cafe.totalStampsIssued = (cafe.totalStampsIssued || 0) + 1;
      await cafe.save();
    }

    try {
      await Activity.create({
        cafeId: cafe._id,
        type: "join",
        title: "New Member Enrolled",
        customerName: user.name,
        customerId: user._id,
        stampsDelta: 0,
        staffName: "System",
        note: "Customer enrolled in cafe loyalty program",
      });
    } catch (actErr) {
      console.warn("[joinCafe] Could not record activity:", actErr.message);
    }

    return res.status(200).json({
      success: true,
      message: `Successfully joined ${cafe.name} loyalty program!`,
      data: {
        cafeId: cafe._id.toString(),
        cafeSlug: cafe.slug,
        cafeName: cafe.name,
        membership: {
          cafeId: cafe._id.toString(),
          cafeSlug: cafe.slug,
          cafeName: cafe.name,
          joinedAt: userMembership.joinedAt,
          stamps: userMembership.stamps || 0,
          totalStamps: cafe.stampTarget || 10,
          totalVisits: userMembership.totalVisits || 0,
          lifetimeStamps: userMembership.lifetimeStamps || 0,
          lastVisitDate: userMembership.lastVisitDate,
        },
      },
    });
  } catch (error) {
    console.error("[Cafe Controller] joinCafe error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Server error joining cafe.",
    });
  }
};

/**
 * @desc    Leave a cafe loyalty program
 * @route   POST /api/cafes/:cafeId/leave
 * @access  Protected
 */
const leaveCafe = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found." });
    }

    const { cafeId } = req.params;

    const query = mongoose.isValidObjectId(cafeId)
      ? { $or: [{ _id: cafeId }, { slug: cafeId.toLowerCase() }] }
      : { slug: cafeId.toLowerCase() };

    const cafe = await Cafe.findOne(query);
    if (!cafe) {
      return res.status(404).json({
        success: false,
        message: `Cafe '${cafeId}' not found.`,
      });
    }

    // Remove from user's cafes array
    if (Array.isArray(user.cafes)) {
      user.cafes = user.cafes.filter(
        (c) => c.cafeId && c.cafeId.toString() !== cafe._id.toString()
      );
      user.joinedCafes = user.cafes.length;
      await user.save();
    }

    // Remove from cafe's customers array
    if (Array.isArray(cafe.customers)) {
      cafe.customers = cafe.customers.filter(
        (c) => c.userId && c.userId.toString() !== user._id.toString()
      );
      cafe.customerCount = cafe.customers.length;
      await cafe.save();
    }

    return res.status(200).json({
      success: true,
      message: `Successfully left ${cafe.name} loyalty program.`,
      data: {
        cafeId: cafe._id.toString(),
        cafeSlug: cafe.slug,
      },
    });
  } catch (error) {
    console.error("[Cafe Controller] leaveCafe error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Server error leaving cafe.",
    });
  }
};

/**
 * @desc    Get user's joined cafe memberships
 * @route   GET /api/cafes/my/memberships
 * @access  Protected
 */
const getMyMemberships = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).populate({
      path: "cafes.cafeId",
      select: "name slug tagline logoImage coverImage stampTarget status isActive category location rewards",
    });

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const memberships = (user.cafes || [])
      .filter((c) => c.cafeId) // Filter out deleted cafes
      .map((c) => ({
        cafeId: c.cafeId._id.toString(),
        cafeSlug: c.cafeId.slug,
        cafeName: c.cafeId.name,
        cafeLogo: c.cafeId.logoImage,
        cafeCover: c.cafeId.coverImage,
        category: c.cafeId.category,
        totalStamps: c.cafeId.stampTarget || 10,
        stamps: c.stamps || 0,
        totalVisits: c.totalVisits || 0,
        lifetimeStamps: c.lifetimeStamps || 0,
        rewardsRedeemedCount: c.rewardsRedeemedCount || 0,
        joinedAt: c.joinedAt,
        lastVisitDate: c.lastVisitDate,
      }));

    return res.status(200).json({
      success: true,
      count: memberships.length,
      data: {
        memberships,
      },
    });
  } catch (error) {
    console.error("[Cafe Controller] getMyMemberships error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error fetching memberships.",
    });
  }
};

/**
 * @desc    Get real customers joined to this cafe for staff/owner dashboard
 * @route   GET /api/dashboard/cafe/customers
 * @access  Protected (cafeOwner, cafeManager, cafeBarista, admin)
 */
const getCafeCustomers = async (req, res) => {
  try {
    const cafe = await resolveUserCafe(req.user, req.query.cafeId);

    if (!cafe) {
      return res.status(404).json({
        success: false,
        message: "No cafe found associated with your account.",
      });
    }

    // Fetch cafe with populated customers.userId
    const populatedCafe = await Cafe.findById(cafe._id).populate({
      path: "customers.userId",
      select: "name email phone avatar qrCode createdAt isActive",
    });

    const customers = (populatedCafe.customers || [])
      .filter((c) => c.userId) // filter out deleted users
      .map((c) => {
        const u = c.userId;
        const memberCode = u.qrCode
          ? (u.qrCode.length > 12 ? `STAMPY-${u.qrCode.slice(0, 8).toUpperCase()}` : u.qrCode)
          : `STAMPY-${u._id.toString().slice(-4).toUpperCase()}`;

        return {
          id: u._id.toString(),
          userId: u._id.toString(),
          code: memberCode,
          name: u.name,
          email: u.email,
          phone: u.phone || "No phone provided",
          avatar:
            u.avatar ||
            "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=200&q=80",
          stamps: c.stamps || 0,
          totalStamps: cafe.stampTarget || 10,
          lifetimeStamps: c.lifetimeStamps || c.stamps || 0,
          totalVisits: c.totalVisits || 0,
          rewardsRedeemedCount: c.rewardsRedeemedCount || 0,
          status: c.status || (u.isActive ? "active" : "inactive"),
          registeredDate: c.joinedAt
            ? new Date(c.joinedAt).toISOString().split("T")[0]
            : new Date(u.createdAt).toISOString().split("T")[0],
          lastVisitDate: c.lastVisitDate
            ? new Date(c.lastVisitDate).toISOString().split("T")[0]
            : null,
          favoriteItem: c.favoriteItem || "Loyalty Member",
          notes: c.notes || "",
        };
      });

    return res.status(200).json({
      success: true,
      count: customers.length,
      data: {
        customers,
      },
    });
  } catch (error) {
    console.error("[Cafe Controller] getCafeCustomers error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error fetching cafe customers.",
    });
  }
};

/**
 * @desc    Manually adjust customer stamps from cafe dashboard
 * @route   PATCH /api/dashboard/cafe/customers/:customerId/stamps
 * @access  Protected (cafeOwner, cafeManager, admin)
 */
const updateCafeCustomerStamps = async (req, res) => {
  try {
    const cafe = await resolveUserCafe(req.user, req.query.cafeId);
    if (!cafe) {
      return res.status(404).json({ success: false, message: "Cafe not found." });
    }

    const { customerId } = req.params;
    const { stamps, lifetimeStamps, reason } = req.body;

    // Update in cafe.customers
    const customerEntry = (cafe.customers || []).find(
      (c) => c.userId && c.userId.toString() === customerId
    );

    if (!customerEntry) {
      return res.status(404).json({
        success: false,
        message: "Customer is not enrolled in this cafe.",
      });
    }

    if (stamps !== undefined) customerEntry.stamps = Math.max(0, Number(stamps));
    if (lifetimeStamps !== undefined) {
      customerEntry.lifetimeStamps = Math.max(0, Number(lifetimeStamps));
    }
    if (reason) {
      customerEntry.notes = `${customerEntry.notes ? customerEntry.notes + " | " : ""}${reason}`;
    }

    await cafe.save();

    // Also update in user.cafes
    const user = await User.findById(customerId);
    if (user && Array.isArray(user.cafes)) {
      const userCafeEntry = user.cafes.find(
        (c) => c.cafeId && c.cafeId.toString() === cafe._id.toString()
      );
      if (userCafeEntry) {
        if (stamps !== undefined) userCafeEntry.stamps = Math.max(0, Number(stamps));
        if (lifetimeStamps !== undefined) {
          userCafeEntry.lifetimeStamps = Math.max(0, Number(lifetimeStamps));
        }
        await user.save();
      }
    }

    return res.status(200).json({
      success: true,
      message: "Customer stamps updated.",
      data: {
        customerId,
        stamps: customerEntry.stamps,
        lifetimeStamps: customerEntry.lifetimeStamps,
      },
    });
  } catch (error) {
    console.error("[Cafe Controller] updateCafeCustomerStamps error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error updating customer stamps.",
    });
  }
};

/**
 * @desc    Verify and identify scanned customer QR code for the current cafe
 * @route   POST /api/dashboard/cafe/scan
 * @access  Protected (cafeOwner, cafeManager, cafeBarista, admin)
 */
const scanCustomer = async (req, res) => {
  try {
    const { code } = req.body;
    if (!code || typeof code !== "string" || !code.trim()) {
      return res.status(400).json({
        success: false,
        message: "Please provide a customer QR code or identifier.",
      });
    }

    const trimmedCode = code.trim();

    // 1. Resolve staff's cafe
    const staffCafe = await resolveUserCafe(req.user, req.query.cafeId);
    if (!staffCafe) {
      return res.status(404).json({
        success: false,
        message: "No cafe associated with your staff account.",
      });
    }

    // 2. Check if scanned code is a Reward Redemption QR Code
    const redemption = await Redemption.findOne({
      code: trimmedCode,
      cafeId: staffCafe._id,
    }).populate("customerId", "name email avatar phone createdAt");

    if (redemption) {
      const customer = redemption.customerId;
      const isUsed = redemption.status === "used";
      const isExpired =
        redemption.expiresAt && new Date(redemption.expiresAt) < new Date();
      const isValid = !isUsed && !isExpired && redemption.status === "pending";

      return res.status(200).json({
        success: true,
        type: "reward",
        data: {
          redemption: {
            id: redemption._id.toString(),
            code: redemption.code,
            rewardName: redemption.rewardName,
            stampsSpent: redemption.stampsSpent,
            status: redemption.status,
            branch: redemption.branch,
            createdAt: redemption.createdAt,
            formattedDate: new Date(redemption.createdAt).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            }),
            expiresAt: redemption.expiresAt
              ? new Date(redemption.expiresAt).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })
              : null,
            usedAt: redemption.usedAt
              ? new Date(redemption.usedAt).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : null,
            verifiedBy: redemption.verifiedBy,
            isValid,
            isUsed,
            isExpired,
          },
          customer: customer
            ? {
                id: customer._id.toString(),
                name: customer.name,
                email: customer.email,
                avatar: customer.avatar || "",
                phone: customer.phone || "",
              }
            : {
                name: redemption.customerName || "Customer",
              },
          cafe: {
            id: staffCafe._id.toString(),
            name: staffCafe.name,
          },
        },
      });
    }

    // 3. Lookup customer in User model
    const searchConditions = [{ qrCode: trimmedCode }];
    if (mongoose.isValidObjectId(trimmedCode)) {
      searchConditions.push({ _id: trimmedCode });
    }
    if (trimmedCode.includes("@")) {
      searchConditions.push({ email: trimmedCode.toLowerCase() });
    }
    searchConditions.push({ phone: trimmedCode });

    let customer = await User.findOne({ $or: searchConditions });

    // Fallback: check if code matches any customer in staffCafe.customers
    if (!customer) {
      const cafeCust = (staffCafe.customers || []).find(
        (c) => c.userId && c.userId.toString() === trimmedCode
      );
      if (cafeCust) {
        customer = await User.findById(cafeCust.userId);
      }
    }

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: `No customer account found matching "${trimmedCode}".`,
      });
    }

    // 3. Check if customer is joined to THIS cafe
    const staffCafeIdStr = staffCafe._id.toString();
    const userMembership = (customer.cafes || []).find(
      (c) => c.cafeId && c.cafeId.toString() === staffCafeIdStr
    );

    const isJoined = Boolean(userMembership);

    // Check today's visit
    const todayStr = new Date().toISOString().split("T")[0];
    const lastVisitStr = userMembership?.lastVisitDate
      ? new Date(userMembership.lastVisitDate).toISOString().split("T")[0]
      : null;
    const alreadyVisitedToday = lastVisitStr === todayStr;

    const formattedJoinedDate = userMembership?.joinedAt
      ? new Date(userMembership.joinedAt).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        })
      : customer.createdAt
      ? new Date(customer.createdAt).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        })
      : "Recently";

    return res.status(200).json({
      success: true,
      type: "customer",
      data: {
        customer: {
          id: customer._id.toString(),
          name: customer.name,
          email: customer.email,
          phone: customer.phone || "",
          avatar: customer.avatar || "",
          qrCode: customer.qrCode || "",
          joinedDate: formattedJoinedDate,
          rawJoinedAt: userMembership?.joinedAt || customer.createdAt,
        },
        cafe: {
          id: staffCafe._id.toString(),
          name: staffCafe.name,
          slug: staffCafe.slug,
          stampTarget: staffCafe.stampTarget || 10,
        },
        isJoined,
        stamps: userMembership ? userMembership.stamps || 0 : 0,
        totalStamps: staffCafe.stampTarget || 10,
        totalVisits: userMembership ? userMembership.totalVisits || 0 : 0,
        lifetimeStamps: userMembership ? userMembership.lifetimeStamps || 0 : 0,
        lastVisitDate: userMembership?.lastVisitDate || null,
        alreadyVisitedToday,
      },
    });
  } catch (error) {
    console.error("[Cafe Controller] scanCustomer error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Server error validating QR scan.",
    });
  }
};

/**
 * @desc    Award stamp(s) to a customer for current cafe after successful scan
 * @route   POST /api/dashboard/cafe/award-stamp
 * @access  Protected (cafeOwner, cafeManager, cafeBarista, admin)
 */
const awardStamp = async (req, res) => {
  try {
    const { customerId, stampsCount = 1, note = "" } = req.body;
    if (!customerId) {
      return res.status(400).json({
        success: false,
        message: "Customer ID is required to award stamps.",
      });
    }

    const count = Math.max(1, Number(stampsCount) || 1);

    // 1. Resolve staff's cafe
    const staffCafe = await resolveUserCafe(req.user, req.query.cafeId);
    if (!staffCafe) {
      return res.status(404).json({
        success: false,
        message: "No cafe associated with your staff account.",
      });
    }

    // 2. Find customer
    const customer = await User.findById(customerId);
    if (!customer) {
      return res.status(404).json({
        success: false,
        message: "Customer not found.",
      });
    }

    const staffCafeIdStr = staffCafe._id.toString();
    const stampTarget = staffCafe.stampTarget || 10;

    if (!Array.isArray(customer.cafes)) customer.cafes = [];
    if (!Array.isArray(staffCafe.customers)) staffCafe.customers = [];

    // Find customer's membership in user.cafes
    let userMemIndex = customer.cafes.findIndex(
      (c) => c.cafeId && c.cafeId.toString() === staffCafeIdStr
    );

    let userMembership;
    const now = new Date();

    if (userMemIndex >= 0) {
      userMembership = customer.cafes[userMemIndex];
      userMembership.stamps = (userMembership.stamps || 0) + count;
      userMembership.lifetimeStamps = (userMembership.lifetimeStamps || 0) + count;
      userMembership.totalVisits = (userMembership.totalVisits || 0) + 1;
      userMembership.lastVisitDate = now;
    } else {
      // Auto-enroll if barista chooses to award stamp
      userMembership = {
        cafeId: staffCafe._id,
        joinedAt: now,
        stamps: count,
        lifetimeStamps: count,
        totalVisits: 1,
        rewardsRedeemedCount: 0,
        lastVisitDate: now,
      };
      customer.cafes.push(userMembership);
      customer.joinedCafes = customer.cafes.length;
    }

    customer.totalStamps = (customer.totalStamps || 0) + count;
    await customer.save();

    // Update cafe.customers array
    let cafeCustIndex = staffCafe.customers.findIndex(
      (c) => c.userId && c.userId.toString() === customer._id.toString()
    );

    if (cafeCustIndex >= 0) {
      const cafeCust = staffCafe.customers[cafeCustIndex];
      cafeCust.stamps = userMembership.stamps;
      cafeCust.lifetimeStamps = userMembership.lifetimeStamps;
      cafeCust.totalVisits = userMembership.totalVisits;
      cafeCust.lastVisitDate = now;
      cafeCust.status = "active";
    } else {
      staffCafe.customers.push({
        userId: customer._id,
        joinedAt: now,
        stamps: userMembership.stamps,
        lifetimeStamps: userMembership.lifetimeStamps,
        totalVisits: 1,
        rewardsRedeemedCount: 0,
        lastVisitDate: now,
        status: "active",
      });
      staffCafe.customerCount = staffCafe.customers.length;
    }

    staffCafe.totalStampsIssued = (staffCafe.totalStampsIssued || 0) + count;
    await staffCafe.save();

    const unlockedReward = userMembership.stamps >= stampTarget;

    try {
      await Activity.create({
        cafeId: staffCafe._id,
        type: "stamp",
        title: "Stamp Issued (+1)",
        customerName: customer.name,
        customerId: customer._id,
        stampsDelta: count,
        staffName: req.user?.name || "Barista",
        note: note || "Visit verified via Barista QR Scan",
      });
    } catch (actErr) {
      console.warn("[awardStamp] Could not record activity:", actErr.message);
    }

    return res.status(200).json({
      success: true,
      message: `Successfully awarded +${count} stamp(s) to ${customer.name}!`,
      data: {
        customerId: customer._id.toString(),
        customerName: customer.name,
        cafeId: staffCafe._id.toString(),
        cafeName: staffCafe.name,
        newStamps: userMembership.stamps,
        stampTarget,
        totalVisits: userMembership.totalVisits,
        lifetimeStamps: userMembership.lifetimeStamps,
        unlockedReward,
        note,
      },
    });
  } catch (error) {
    console.error("[Cafe Controller] awardStamp error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Server error awarding stamp.",
    });
  }
};

/**
 * @desc    Customer redeems a reward for stamps
 * @route   POST /api/cafes/:cafeId/redeem
 * @access  Protected (Customer)
 */
const redeemReward = async (req, res) => {
  try {
    const { rewardId, cafeSlug, cafeId } = req.body;
    const cafeIdentifier = cafeId || cafeSlug || req.params.cafeId;

    if (!cafeIdentifier) {
      return res.status(400).json({ success: false, message: "Cafe identifier is required." });
    }
    if (!rewardId) {
      return res.status(400).json({ success: false, message: "Reward ID is required." });
    }

    // 1. Resolve cafe
    const isObjectId = mongoose.Types.ObjectId.isValid(cafeIdentifier);
    const cafe = await Cafe.findOne({
      $or: [
        ...(isObjectId ? [{ _id: cafeIdentifier }] : []),
        { slug: cafeIdentifier.toLowerCase() },
      ],
      isActive: true,
    });

    if (!cafe) {
      return res.status(404).json({ success: false, message: "Cafe not found." });
    }

    // 2. Resolve customer
    const customer = await User.findById(req.user._id);
    if (!customer) {
      return res.status(404).json({ success: false, message: "Customer account not found." });
    }

    const cafeIdStr = cafe._id.toString();
    const userMembership = (customer.cafes || []).find(
      (c) => c.cafeId && c.cafeId.toString() === cafeIdStr
    );

    if (!userMembership) {
      return res.status(403).json({
        success: false,
        message: "You must join this cafe's loyalty program before redeeming rewards.",
      });
    }

    // 3. Look up reward in DB or cafe rewards
    const isRewardObjectId = mongoose.Types.ObjectId.isValid(rewardId);
    let reward = await Reward.findOne({
      $or: [
        ...(isRewardObjectId ? [{ _id: rewardId }] : []),
        { title: rewardId },
      ],
      cafeId: cafe._id,
      status: "active",
    });

    let requiredStamps = reward?.requiredStamps || reward?.stampsRequired;
    let rewardTitle = reward?.title || reward?.name;

    if (!reward) {
      // Check cafe's embedded rewards if any
      const embeddedReward = (cafe.rewards || []).find(
        (r) => r.id === rewardId || r._id?.toString() === rewardId
      );
      if (embeddedReward) {
        requiredStamps = embeddedReward.stampsRequired || embeddedReward.requiredStamps || 10;
        rewardTitle = embeddedReward.name || embeddedReward.title || "Loyalty Reward";
      }
    }

    if (!requiredStamps || !rewardTitle) {
      return res.status(404).json({
        success: false,
        message: "Reward not found or is currently unavailable.",
      });
    }

    if ((userMembership.stamps || 0) < requiredStamps) {
      return res.status(400).json({
        success: false,
        message: `Insufficient stamps. You have ${userMembership.stamps || 0} stamps, but this reward requires ${requiredStamps}.`,
      });
    }

    // 4. Generate unique single-use redemption code
    const randomHex = crypto.randomBytes(3).toString("hex").toUpperCase();
    const code = `STAMPY-RDM-${randomHex}`;

    // 5. Deduct stamps
    userMembership.stamps = userMembership.stamps - requiredStamps;
    customer.totalStamps = Math.max(0, (customer.totalStamps || 0) - requiredStamps);
    customer.redeemedRewards = (customer.redeemedRewards || 0) + 1;
    await customer.save();

    // 6. Create Redemption record
    const redemption = await Redemption.create({
      code,
      cafeId: cafe._id,
      customerId: customer._id,
      customerName: customer.name,
      rewardId: reward?._id || new mongoose.Types.ObjectId(),
      rewardName: rewardTitle,
      stampsSpent: requiredStamps,
      status: "pending",
      branch: `${cafe.name} • Main Counter`,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    });

    if (reward && reward.save) {
      reward.redemptionsCount = (reward.redemptionsCount || 0) + 1;
      await reward.save();
    }

    return res.status(201).json({
      success: true,
      message: `🎉 Successfully redeemed ${rewardTitle}! Show the QR code at the counter.`,
      data: {
        redemption: {
          id: redemption._id.toString(),
          code: redemption.code,
          rewardId: reward?._id ? reward._id.toString() : rewardId,
          rewardName: rewardTitle,
          stampsSpent: requiredStamps,
          status: redemption.status,
          branch: redemption.branch,
          expiresAt: new Date(redemption.expiresAt).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          }),
          createdAt: redemption.createdAt,
          formattedDate: new Date(redemption.createdAt).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          }),
        },
        remainingStamps: userMembership.stamps,
      },
    });
  } catch (error) {
    console.error("[Cafe Controller] redeemReward error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to redeem reward.",
    });
  }
};

/**
 * @desc    Get customer's redemptions for a cafe
 * @route   GET /api/cafes/my/redemptions
 * @access  Protected (Customer)
 */
const getMyRedemptions = async (req, res) => {
  try {
    const { cafeSlug, cafeId } = req.query;
    const cafeIdentifier = cafeId || cafeSlug || req.params.cafeId;

    let filter = { customerId: req.user._id };
    if (cafeIdentifier) {
      const isObjectId = mongoose.Types.ObjectId.isValid(cafeIdentifier);
      const cafe = await Cafe.findOne({
        $or: [
          ...(isObjectId ? [{ _id: cafeIdentifier }] : []),
          { slug: cafeIdentifier.toLowerCase() },
        ],
      });
      if (cafe) {
        filter.cafeId = cafe._id;
      }
    }

    const redemptions = await Redemption.find(filter).sort({ createdAt: -1 });

    const formatted = redemptions.map((r) => ({
      id: r._id.toString(),
      code: r.code,
      rewardId: r.rewardId?.toString(),
      rewardName: r.rewardName,
      stampsSpent: r.stampsSpent,
      status: r.status,
      branch: r.branch,
      expiresAt: r.expiresAt
        ? new Date(r.expiresAt).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          })
        : null,
      createdAt: r.createdAt,
      formattedDate: new Date(r.createdAt).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      }),
      usedAt: r.usedAt
        ? new Date(r.usedAt).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })
        : null,
      verifiedBy: r.verifiedBy,
    }));

    return res.status(200).json({
      success: true,
      data: {
        redemptions: formatted,
      },
    });
  } catch (error) {
    console.error("[Cafe Controller] getMyRedemptions error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Error fetching redemptions.",
    });
  }
};

/**
 * @desc    Barista fulfills/confirms reward redemption
 * @route   POST /api/dashboard/cafe/fulfill-redemption
 * @access  Protected (Staff)
 */
const fulfillRewardRedemption = async (req, res) => {
  try {
    const { code } = req.body;
    if (!code) {
      return res.status(400).json({
        success: false,
        message: "Redemption code is required.",
      });
    }

    const staffCafe = await resolveUserCafe(req.user, req.query.cafeId);
    if (!staffCafe) {
      return res.status(404).json({
        success: false,
        message: "No cafe associated with your staff account.",
      });
    }

    const redemption = await Redemption.findOne({
      code: code.trim(),
      cafeId: staffCafe._id,
    }).populate("customerId", "name email");

    if (!redemption) {
      return res.status(404).json({
        success: false,
        message: "Redemption record not found for this cafe.",
      });
    }

    if (redemption.status === "used") {
      return res.status(400).json({
        success: false,
        message: `This reward voucher was already fulfilled on ${
          redemption.usedAt ? new Date(redemption.usedAt).toLocaleDateString() : "previously"
        }.`,
      });
    }

    const now = new Date();
    redemption.status = "used";
    redemption.usedAt = now;
    redemption.verifiedBy = {
      userId: req.user._id,
      name: req.user.name,
      role: req.user.role,
    };
    await redemption.save();

    // Increment cafe totalRewardsRedeemed
    staffCafe.totalRewardsRedeemed = (staffCafe.totalRewardsRedeemed || 0) + 1;
    await staffCafe.save();

    // Increment customer cafe membership rewardsRedeemedCount if user exists
    if (redemption.customerId) {
      const customer = await User.findById(redemption.customerId._id);
      if (customer && Array.isArray(customer.cafes)) {
        const mem = customer.cafes.find(
          (c) => c.cafeId && c.cafeId.toString() === staffCafe._id.toString()
        );
        if (mem) {
          mem.rewardsRedeemedCount = (mem.rewardsRedeemedCount || 0) + 1;
          await customer.save();
        }
      }
    }

    // Log Activity to real collection
    await Activity.create({
      cafeId: staffCafe._id,
      type: "redemption",
      title: `Redeemed ${redemption.rewardName}`,
      customerName: redemption.customerId?.name || redemption.customerName || "Customer",
      customerId: redemption.customerId?._id,
      stampsDelta: -redemption.stampsSpent,
      staffName: req.user.name || "Barista",
      note: `Verified reward code ${redemption.code}`,
      metadata: {
        redemptionId: redemption._id,
        code: redemption.code,
        rewardName: redemption.rewardName,
      },
    });

    return res.status(200).json({
      success: true,
      message: `🎉 Reward fulfilled! Verified ${redemption.rewardName} for ${
        redemption.customerId?.name || "Customer"
      }.`,
      data: {
        redemption,
      },
    });
  } catch (error) {
    console.error("[Cafe Controller] fulfillRewardRedemption error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to fulfill reward redemption.",
    });
  }
};

/**
 * @desc    Get real audit activity log for staff cafe
 * @route   GET /api/dashboard/cafe/activities
 * @access  Protected (Staff)
 */
const getCafeActivities = async (req, res) => {
  try {
    const staffCafe = await resolveUserCafe(req.user, req.query.cafeId);
    if (!staffCafe) {
      return res.status(404).json({
        success: false,
        message: "No cafe associated with staff account.",
      });
    }

    const activities = await Activity.find({ cafeId: staffCafe._id })
      .sort({ createdAt: -1 })
      .limit(100);

    return res.status(200).json({
      success: true,
      data: {
        activities: activities.map((a) => a.toJSON()),
      },
    });
  } catch (error) {
    console.error("[Cafe Controller] getCafeActivities error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Error fetching cafe activities.",
    });
  }
};

module.exports = {
  getPublicCafes,
  getCafeBySlug,
  getMyCafeProfile,
  updateMyCafeProfile,
  joinCafe,
  leaveCafe,
  getMyMemberships,
  getCafeCustomers,
  updateCafeCustomerStamps,
  scanCustomer,
  awardStamp,
  redeemReward,
  getMyRedemptions,
  fulfillRewardRedemption,
  getCafeActivities,
};
