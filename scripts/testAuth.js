require("dotenv").config();
const http = require("http");
const express = require("express");
const cookieParser = require("cookie-parser");
const mongoose = require("mongoose");
const connectDB = require("../config/db");
const User = require("../app/models/User");
const authRoutes = require("../app/routing/authRoutes");

let server;
let baseUrl;

async function request(method, path, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const reqHeaders = {
      "Content-Type": "application/json",
      ...headers,
    };

    const req = http.request(
      url,
      {
        method,
        headers: reqHeaders,
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          let parsed;
          try {
            parsed = JSON.parse(data);
          } catch {
            parsed = data;
          }
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: parsed,
          });
        });
      }
    );

    req.on("error", reject);
    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function runTests() {
  console.log("=== STARTING STAMPY AUTHENTICATION TEST SUITE ===\n");
  let passed = 0;
  let failed = 0;

  function assert(condition, testName) {
    if (condition) {
      console.log(`[PASS] ${testName}`);
      passed++;
    } else {
      console.error(`[FAIL] ${testName}`);
      failed++;
    }
  }

  try {
    await connectDB();

    // Clean up test users from previous test runs (preserve seeded admin)
    await User.deleteMany({ email: { $regex: /@testauth\.com$/ } });

    // Set up test express server
    const app = express();
    app.use(express.json());
    app.use(cookieParser());
    app.use("/api/auth", authRoutes);

    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, resolve));
    const port = server.address().port;
    baseUrl = `http://localhost:${port}`;
    console.log(`Test server running on ${baseUrl}\n`);

    // 1. Customer Registration
    const custEmail = `cust_${Date.now()}@testauth.com`;
    const custRes = await request("POST", "/api/auth/register", {
      name: "Test Customer",
      email: custEmail,
      password: "Password123#",
      registrationType: "customer",
    });

    assert(custRes.status === 201, "1.1 Customer registration returns 201");
    assert(custRes.body.success === true, "1.2 Customer registration success is true");
    assert(custRes.body.data.user.role === "user", "1.3 Customer registered with 'user' role");
    assert(typeof custRes.body.data.user.qrCode === "string" && custRes.body.data.user.qrCode.length > 20, "1.4 Customer receives permanent QR identifier");
    assert(custRes.body.data.user.password === undefined, "1.5 Customer password is not returned in response");
    assert(!!custRes.body.data.token, "1.6 Token is returned on registration");
    assert(custRes.body.data.user.totalStamps === 0, "1.7 Newly registered customer has totalStamps === 0");
    assert(custRes.body.data.user.availableRewards === 0, "1.8 Newly registered customer has availableRewards === 0");
    assert(custRes.body.data.user.joinedCafes === 0, "1.9 Newly registered customer has joinedCafes === 0");
    assert(custRes.body.data.user.redeemedRewards === 0, "1.10 Newly registered customer has redeemedRewards === 0");

    const customerToken = custRes.body.data.token;
    const initialQrCode = custRes.body.data.user.qrCode;

    // 2. Cafe Owner Registration
    const ownerEmail = `owner_${Date.now()}@testauth.com`;
    const ownerRes = await request("POST", "/api/auth/register", {
      name: "Test Cafe Owner",
      email: ownerEmail,
      password: "Password123#",
      registrationType: "cafeOwner",
    });

    assert(ownerRes.status === 201, "2.1 Cafe Owner registration returns 201");
    assert(ownerRes.body.data.user.role === "cafeOwner", "2.2 Cafe Owner registered with 'cafeOwner' role");
    assert(ownerRes.body.data.user.qrCode === undefined, "2.3 Cafe Owner does NOT receive customer QR identifier");

    const ownerToken = ownerRes.body.data.token;

    // 3. Prevent Admin Registration via Public Endpoint
    const adminAttemptRes = await request("POST", "/api/auth/register", {
      name: "Fake Admin",
      email: `fakeadmin_${Date.now()}@testauth.com`,
      password: "Password123#",
      role: "admin",
    });
    assert(adminAttemptRes.status === 403, "3.1 Attempt to register as admin is blocked with 403");

    // 4. Prevent Manager & Barista Public Registration
    const managerAttempt = await request("POST", "/api/auth/register", {
      name: "Fake Manager",
      email: `fakemgr_${Date.now()}@testauth.com`,
      password: "Password123#",
      role: "cafeManager",
    });
    assert(managerAttempt.status === 403, "4.1 Attempt to register as cafeManager is blocked with 403");

    const baristaAttempt = await request("POST", "/api/auth/register", {
      name: "Fake Barista",
      email: `fakebarista_${Date.now()}@testauth.com`,
      password: "Password123#",
      role: "cafeBarista",
    });
    assert(baristaAttempt.status === 403, "4.2 Attempt to register as cafeBarista is blocked with 403");

    // 5. Duplicate Email Rejection
    const dupRes = await request("POST", "/api/auth/register", {
      name: "Duplicate Customer",
      email: custEmail,
      password: "Password123#",
    });
    assert(dupRes.status === 400, "5.1 Duplicate email registration returns 400");

    // 6. Invalid Email Format
    const badEmailRes = await request("POST", "/api/auth/register", {
      name: "Bad Email",
      email: "invalid-email-string",
      password: "Password123#",
    });
    assert(badEmailRes.status === 400, "6.1 Invalid email format rejected with 400");

    // 7. Weak Password (< 8 chars)
    const weakPassRes = await request("POST", "/api/auth/register", {
      name: "Weak Pass",
      email: `weak_${Date.now()}@testauth.com`,
      password: "short",
    });
    assert(weakPassRes.status === 400, "7.1 Password under 8 characters rejected with 400");

    // 8. Missing Fields
    const missingFieldsRes = await request("POST", "/api/auth/register", {
      email: `missing_${Date.now()}@testauth.com`,
    });
    assert(missingFieldsRes.status === 400, "8.1 Missing required fields rejected with 400");

    // 9. Successful Login
    const loginRes = await request("POST", "/api/auth/login", {
      email: custEmail,
      password: "Password123#",
    });
    assert(loginRes.status === 200, "9.1 Valid login returns 200");
    assert(loginRes.body.data.user.email === custEmail, "9.2 Login returns correct user");
    assert(loginRes.body.data.user.qrCode === initialQrCode, "9.3 Login returns permanent QR identifier");
    assert(loginRes.body.data.user.password === undefined, "9.4 Password hash excluded from login response");

    // 10. Incorrect Password (Generic error message)
    const wrongPassRes = await request("POST", "/api/auth/login", {
      email: custEmail,
      password: "WrongPassword999#",
    });
    assert(wrongPassRes.status === 401, "10.1 Wrong password returns 401");
    assert(wrongPassRes.body.message === "Invalid email or password.", "10.2 Error message is generic for security");

    // 11. Nonexistent Email
    const noUserRes = await request("POST", "/api/auth/login", {
      email: "nonexistent_email_12345@testauth.com",
      password: "Password123#",
    });
    assert(noUserRes.status === 401, "11.1 Non-existent user login returns 401");
    assert(noUserRes.body.message === "Invalid email or password.", "11.2 Error message is generic for non-existent user");

    // 12. Inactive Account Login Rejection
    const inactiveEmail = `inactive_${Date.now()}@testauth.com`;
    const inactiveUser = await User.create({
      name: "Inactive User",
      email: inactiveEmail,
      password: "Password123#",
      role: "user",
      isActive: false,
    });
    const inactiveLoginRes = await request("POST", "/api/auth/login", {
      email: inactiveEmail,
      password: "Password123#",
    });
    assert(inactiveLoginRes.status === 403, "12.1 Inactive account login rejected with 403");

    // 13. Get Current User (GET /api/auth/me) with Bearer Token
    const meRes = await request("GET", "/api/auth/me", null, {
      Authorization: `Bearer ${customerToken}`,
    });
    assert(meRes.status === 200, "13.1 GET /api/auth/me with valid token returns 200");
    assert(meRes.body.data.user.email === custEmail, "13.2 GET /api/auth/me returns current user email");
    assert(meRes.body.data.user.qrCode === initialQrCode, "13.3 GET /api/auth/me returns customer's QR code");
    assert(meRes.body.data.user.totalStamps === 0, "13.4 GET /api/auth/me returns totalStamps: 0");
    assert(meRes.body.data.user.availableRewards === 0, "13.5 GET /api/auth/me returns availableRewards: 0");
    assert(meRes.body.data.user.joinedCafes === 0, "13.6 GET /api/auth/me returns joinedCafes: 0");
    assert(meRes.body.data.user.redeemedRewards === 0, "13.7 GET /api/auth/me returns redeemedRewards: 0");

    // 14. GET /api/auth/me without Token
    const unauthMe = await request("GET", "/api/auth/me");
    assert(unauthMe.status === 401, "14.1 Missing token rejected with 401");

    // 15. GET /api/auth/me with Tampered/Invalid Token
    const tamperedMe = await request("GET", "/api/auth/me", null, {
      Authorization: "Bearer invalid.jwt.token",
    });
    assert(tamperedMe.status === 401, "15.1 Invalid token rejected with 401");

    // 16. Customer QR Code Endpoint (GET /api/auth/qr-code)
    const qrRes = await request("GET", "/api/auth/qr-code", null, {
      Authorization: `Bearer ${customerToken}`,
    });
    assert(qrRes.status === 200, "16.1 GET /api/auth/qr-code returns 200 for customer");
    assert(qrRes.body.data.qrCode === initialQrCode, "16.2 Customer QR code matches initial permanent identifier");

    // 17. Cafe Owner Forbidden from Customer QR Code Endpoint
    const ownerQrRes = await request("GET", "/api/auth/qr-code", null, {
      Authorization: `Bearer ${ownerToken}`,
    });
    assert(ownerQrRes.status === 403, "17.1 Non-customer (cafeOwner) rejected from /qr-code with 403");

    // 18. Customer QR Code Uniqueness across multiple customers
    const cust2Email = `cust2_${Date.now()}@testauth.com`;
    const cust2Res = await request("POST", "/api/auth/register", {
      name: "Second Customer",
      email: cust2Email,
      password: "Password123#",
    });
    assert(cust2Res.status === 201, "18.1 Second customer registered");
    assert(cust2Res.body.data.user.qrCode !== initialQrCode, "18.2 Different customers receive different unique QR codes");

    // 19. Admin Seed Verification & Login
    const adminLoginRes = await request("POST", "/api/auth/login", {
      email: "stampy2026@gmail.com",
      password: "Stampy2026#",
    });
    assert(adminLoginRes.status === 200, "19.1 Admin account can log in");
    assert(adminLoginRes.body.data.user.role === "admin", "19.2 Admin user has 'admin' role");
    assert(adminLoginRes.body.data.user.isActive === true, "19.3 Admin account is active");

    // 20. Update Profile Endpoint (PUT /api/auth/profile)
    const newAvatarUrl = "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80";
    const updateProfileRes = await request("PUT", "/api/auth/profile", {
      name: "Updated Customer Name",
      phone: "+44 7999 123456",
      avatar: newAvatarUrl,
      notificationsEnabled: false,
    }, {
      Authorization: `Bearer ${customerToken}`,
    });
    assert(updateProfileRes.status === 200, "20.1 PUT /api/auth/profile returns 200");
    assert(updateProfileRes.body.data.user.name === "Updated Customer Name", "20.2 Profile name updated");
    assert(updateProfileRes.body.data.user.avatar === newAvatarUrl, "20.3 Profile avatar updated");
    assert(updateProfileRes.body.data.user.phone === "+44 7999 123456", "20.4 Profile phone updated");

    // 21. Verify Profile Update Persisted on Subsequent GET /api/auth/me (Simulating Page Refresh)
    const refreshedMe = await request("GET", "/api/auth/me", null, {
      Authorization: `Bearer ${customerToken}`,
    });
    assert(refreshedMe.status === 200, "21.1 GET /api/auth/me returns 200 after update");
    assert(refreshedMe.body.data.user.name === "Updated Customer Name", "21.2 GET /api/auth/me returns updated name");
    assert(refreshedMe.body.data.user.avatar === newAvatarUrl, "21.3 GET /api/auth/me returns updated avatar");
    assert(refreshedMe.body.data.user.phone === "+44 7999 123456", "21.4 GET /api/auth/me returns updated phone");

    // 22. Logout Endpoint
    const logoutRes = await request("POST", "/api/auth/logout", null, {
      Authorization: `Bearer ${customerToken}`,
    });
    assert(logoutRes.status === 200, "22.1 Logout returns 200");
    assert(logoutRes.body.success === true, "22.2 Logout success is true");

    console.log(`\n=== TEST RESULTS: ${passed} PASSED, ${failed} FAILED ===`);
  } catch (err) {
    console.error("Test execution error:", err);
  } finally {
    if (server) {
      server.close();
    }
    await mongoose.connection.close();
    process.exit(failed > 0 ? 1 : 0);
  }
}

runTests();
