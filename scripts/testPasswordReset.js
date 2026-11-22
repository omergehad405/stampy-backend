/**
 * Test script for Forgot & Reset Password Flow
 * Run with: node backend/scripts/testPasswordReset.js
 */

require("dotenv").config();
const mongoose = require("mongoose");
const connectDB = require("../config/db");
const User = require("../app/models/User");
const { forgotPassword, resetPassword } = require("../app/controllers/authController");

// Mock Express req & res
function mockReqRes(body = {}, params = {}, headers = {}) {
  const req = {
    body,
    params,
    query: {},
    headers: { origin: "http://localhost:3000", ...headers },
  };

  const res = {
    statusCode: 200,
    data: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.data = payload;
      return this;
    },
  };

  return { req, res };
}

async function runTests() {
  console.log("=== Testing Stampy Forgot & Reset Password Flow ===");

  await connectDB();

  const testEmail = `test_reset_${Date.now()}@stampy.app`;
  const initialPassword = "InitialPassword123!";
  const newPassword = "NewSecretPassword2026!";

  try {
    // 1. Create a test user
    console.log(`\n1. Creating test user with email: ${testEmail}`);
    const user = await User.create({
      name: "Password Reset Tester",
      email: testEmail,
      password: initialPassword,
      role: "user",
    });
    console.log(" User created successfully with ID:", user._id);

    // 2. Test forgotPassword with invalid email
    console.log("\n2. Testing forgotPassword with invalid email format...");
    {
      const { req, res } = mockReqRes({ email: "invalid-email" });
      await forgotPassword(req, res);
      console.assert(res.statusCode === 400, `Expected 400, got ${res.statusCode}`);
      console.log(" Correctly rejected invalid email format (400):", res.data.message);
    }

    // 3. Test forgotPassword with non-existent email
    console.log("\n3. Testing forgotPassword with non-existent email...");
    {
      const { req, res } = mockReqRes({ email: "nonexistent_stampy_user@nowhere.com" });
      await forgotPassword(req, res);
      console.assert(res.statusCode === 404, `Expected 404, got ${res.statusCode}`);
      console.log(" Correctly returned 404 for non-existent user:", res.data.message);
    }

    // 4. Test forgotPassword with valid existing email
    console.log("\n4. Testing forgotPassword with existing test email...");
    {
      const { req, res } = mockReqRes({ email: testEmail });
      await forgotPassword(req, res);
      console.assert(res.statusCode === 200, `Expected 200, got ${res.statusCode}`);
      console.assert(res.data.success === true, "Expected success to be true");
      console.assert(res.data.expiresInMinutes === 15, "Expected 15 minutes expiration");
      console.log(" Forgot password succeeded (200):", res.data.message);
    }

    // 5. Verify token and 15-minute expiry in DB
    console.log("\n5. Verifying DB token and 15-minute expiration...");
    const updatedUser = await User.findOne({ email: testEmail }).select("+resetPasswordToken +resetPasswordExpire");
    console.assert(!!updatedUser.resetPasswordToken, "Expected resetPasswordToken in DB");
    console.assert(!!updatedUser.resetPasswordExpire, "Expected resetPasswordExpire in DB");

    const timeDiffMinutes = (updatedUser.resetPasswordExpire - Date.now()) / (1000 * 60);
    console.log(` Token expiration set to ~${Math.round(timeDiffMinutes)} minutes from now (Target: 15 min).`);
    console.assert(timeDiffMinutes > 14 && timeDiffMinutes <= 15.1, "Expiration should be approx 15 minutes");

    // 6. Test resetPassword with invalid token
    console.log("\n6. Testing resetPassword with invalid token...");
    {
      const { req, res } = mockReqRes({
        token: "fake_token_that_does_not_exist",
        password: newPassword,
        confirmPassword: newPassword,
      });
      await resetPassword(req, res);
      console.assert(res.statusCode === 400, `Expected 400, got ${res.statusCode}`);
      console.log(" Correctly rejected invalid token (400):", res.data.message);
    }

    // 7. Test resetPassword with mismatched passwords
    console.log("\n7. Testing resetPassword with mismatched passwords...");
    {
      // Retrieve the plain token: simulate generating one directly
      const plainToken = updatedUser.getResetPasswordToken();
      await updatedUser.save({ validateBeforeSave: false });

      const { req, res } = mockReqRes({
        token: plainToken,
        password: newPassword,
        confirmPassword: "MismatchPassword123!",
      });
      await resetPassword(req, res);
      console.assert(res.statusCode === 400, `Expected 400, got ${res.statusCode}`);
      console.log(" Correctly rejected password mismatch (400):", res.data.message);
    }

    // 8. Test resetPassword with expired token simulation
    console.log("\n8. Testing resetPassword with expired token simulation...");
    {
      const plainToken = updatedUser.getResetPasswordToken();
      // Set expiry to 1 minute in the past
      updatedUser.resetPasswordExpire = Date.now() - 60 * 1000;
      await updatedUser.save({ validateBeforeSave: false });

      const { req, res } = mockReqRes({
        token: plainToken,
        password: newPassword,
        confirmPassword: newPassword,
      });
      await resetPassword(req, res);
      console.assert(res.statusCode === 400, `Expected 400, got ${res.statusCode}`);
      console.assert(res.data.message.includes("expired"), "Expected message to mention expired");
      console.log(" Correctly rejected expired token (400):", res.data.message);
    }

    // 9. Test successful resetPassword
    console.log("\n9. Testing successful resetPassword with fresh 15-minute token...");
    let validToken;
    {
      // Fresh token
      validToken = updatedUser.getResetPasswordToken();
      await updatedUser.save({ validateBeforeSave: false });

      const { req, res } = mockReqRes({
        token: validToken,
        password: newPassword,
        confirmPassword: newPassword,
      });
      await resetPassword(req, res);
      console.assert(res.statusCode === 200, `Expected 200, got ${res.statusCode}`);
      console.assert(res.data.success === true, "Expected success: true");
      console.log(" Password reset succeeded (200):", res.data.message);
    }

    // 10. Verify new password works and old password fails
    console.log("\n10. Verifying user can authenticate with new password and old password fails...");
    const userAfterReset = await User.findOne({ email: testEmail }).select("+password +resetPasswordToken +resetPasswordExpire");
    console.assert(!userAfterReset.resetPasswordToken, "resetPasswordToken should be cleared");
    console.assert(!userAfterReset.resetPasswordExpire, "resetPasswordExpire should be cleared");

    const oldPasswordMatches = await userAfterReset.matchPassword(initialPassword);
    const newPasswordMatches = await userAfterReset.matchPassword(newPassword);
    console.assert(!oldPasswordMatches, "Old password should not match anymore");
    console.assert(newPasswordMatches, "New password should match!");
    console.log(" Old password invalid, new password confirmed successfully!");

    // 11. Verify token cannot be reused
    console.log("\n11. Verifying used token cannot be reused...");
    {
      const { req, res } = mockReqRes({
        token: validToken,
        password: "YetAnotherPassword123!",
        confirmPassword: "YetAnotherPassword123!",
      });
      await resetPassword(req, res);
      console.assert(res.statusCode === 400, `Expected 400, got ${res.statusCode}`);
      console.log(" Replay protection confirmed! Token cannot be reused (400):", res.data.message);
    }

    // Clean up
    console.log("\n12. Cleaning up test user...");
    await User.deleteOne({ email: testEmail });
    console.log(" Test user deleted.");

    console.log("\n ALL TESTS PASSED SUCCESSFULLY! \n");
  } catch (error) {
    console.error("\n❌ Test failed with error:", error);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

runTests();
