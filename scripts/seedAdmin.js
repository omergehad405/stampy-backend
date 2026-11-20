require("dotenv").config();
const mongoose = require("mongoose");
const connectDB = require("../config/db");
const User = require("../app/models/User");

/**
 * Direct Admin Seeder
 * Injects the platform super admin account directly into MongoDB
 */
const seedAdmin = async () => {
  const adminName = process.env.ADMIN_NAME || "Stampy Admin";
  const adminEmail = (process.env.ADMIN_EMAIL || "stampy2026@gmail.com").trim().toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD || "Stampy2026#";

  try {
    await connectDB();

    const existingUser = await User.findOne({ email: adminEmail }).select("+password");

    if (existingUser) {
      if (existingUser.role === "admin") {
        // Ensure account is active and verify password
        let needsSave = false;
        if (!existingUser.isActive) {
          existingUser.isActive = true;
          needsSave = true;
        }
        const isMatch = await existingUser.matchPassword(adminPassword);
        if (!isMatch) {
          existingUser.password = adminPassword; // Pre-save hook will hash it
          needsSave = true;
        }
        if (needsSave) {
          await existingUser.save();
          console.log(`[Seed Admin] Admin account (${adminEmail}) updated and verified active in DB.`);
        } else {
          console.log(
            `[Seed Admin] Admin account (${adminEmail}) already exists and is active (ID: ${existingUser._id}).`
          );
        }
        await mongoose.connection.close();
        process.exit(0);
      } else {
        console.error(
          `[Seed Admin Conflict] An account with email ${adminEmail} already exists with role '${existingUser.role}'.`
        );
        await mongoose.connection.close();
        process.exit(1);
      }
    }

    // Create the admin user directly in MongoDB
    const newAdmin = await User.create({
      name: adminName,
      email: adminEmail,
      password: adminPassword,
      role: "admin",
      isActive: true,
    });

    console.log(
      `[Seed Admin] Admin created directly in MongoDB. Email: ${newAdmin.email}, Role: ${newAdmin.role}, ID: ${newAdmin._id}`
    );

    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error("[Seed Admin Error]", error.message);
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.close();
    }
    process.exit(1);
  }
};

seedAdmin();
