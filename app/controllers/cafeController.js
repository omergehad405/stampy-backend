const mongoose = require("mongoose");
const Cafe = require("../models/Cafe");
const Reward = require("../models/Reward");

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

module.exports = {
  getPublicCafes,
  getCafeBySlug,
  getMyCafeProfile,
  updateMyCafeProfile,
};
