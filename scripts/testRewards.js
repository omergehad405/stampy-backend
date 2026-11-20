require("dotenv").config();
const http = require("http");
const express = require("express");
const cookieParser = require("cookie-parser");
const connectDB = require("../config/db");
const User = require("../app/models/User");
const Cafe = require("../app/models/Cafe");
const Reward = require("../app/models/Reward");
const authRoutes = require("../app/routing/authRoutes");
const cafeRewardRoutes = require("../app/routing/cafeRewardRoutes");

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

function makeRequest(serverUrl, path, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, serverUrl);
    const reqOptions = {
      method: options.method || "GET",
      headers: options.headers || {},
    };

    const req = http.request(url, reqOptions, (res) => {
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => {
        let parsed = null;
        try {
          parsed = JSON.parse(body);
        } catch {
          parsed = body;
        }
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: parsed,
        });
      });
    });

    req.on("error", reject);
    if (options.body) {
      req.write(typeof options.body === "string" ? options.body : JSON.stringify(options.body));
    }
    req.end();
  });
}

function extractCookie(headers) {
  const setCookie = headers["set-cookie"];
  if (!setCookie) return null;
  const cookieStr = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  return cookieStr.split(";")[0];
}

async function runTests() {
  console.log("\n==============================================");
  console.log("   STAMPY CAFE REWARDS AUTOMATION TEST SUITE");
  console.log("==============================================\n");

  await connectDB();

  // Setup test Express server
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use("/api/auth", authRoutes);
  app.use("/api/dashboard/rewards", cafeRewardRoutes);

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const serverUrl = `http://127.0.0.1:${port}`;
  console.log(`Test server running at ${serverUrl}\n`);

  try {
    // 1. Ensure test owner exists
    const testEmail = "test_reward_owner@stampy.io";
    let owner = await User.findOne({ email: testEmail });
    if (!owner) {
      owner = await User.create({
        name: "Test Reward Owner",
        email: testEmail,
        password: "Password123#",
        role: "cafeOwner",
        phone: "+44 7700 900555",
        isActive: true,
      });
    }

    // 2. Ensure cafe exists for this owner
    let cafe = await Cafe.findOne({ "owner.userId": owner._id });
    if (!cafe) {
      cafe = await Cafe.create({
        name: "Reward Test Coffee House",
        slug: "reward-test-coffee-house",
        tagline: "Quality tests and coffee",
        owner: {
          userId: owner._id,
          name: owner.name,
          email: owner.email,
          phone: owner.phone,
        },
      });
    }

    owner.cafeId = cafe._id;
    await owner.save();

    // 3. Login as cafe owner
    const loginRes = await makeRequest(serverUrl, "/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: { email: testEmail, password: "Password123#" },
    });

    assert(loginRes.status === 200, "Cafe owner logs in successfully");
    const authCookie = extractCookie(loginRes.headers);
    assert(!!authCookie, "Received auth cookie");

    const authHeaders = {
      Cookie: authCookie,
      "Content-Type": "application/json",
    };

    // 4. Test missing fields validation
    const missingTitleRes = await makeRequest(serverUrl, "/api/dashboard/rewards", {
      method: "POST",
      headers: authHeaders,
      body: {
        title: "",
        requiredStamps: 5,
        description: "Test description",
        category: "cafee & drinks",
      },
    });
    assert(missingTitleRes.status === 400, "Validation: Rejects missing title (400)");

    // 5. Test valid creation conforming to user schema
    const createRes = await makeRequest(serverUrl, "/api/dashboard/rewards", {
      method: "POST",
      headers: authHeaders,
      body: {
        title: "Free Flat White",
        requiredStamps: 6,
        categoryTag: "Popular Pick",
        description: "A velvety double-shot flat white crafted with oat or whole milk.",
        category: "cafee & drinks",
        status: "active",
      },
    });

    assert(createRes.status === 201, "Creates reward successfully (201)");
    assert(createRes.body.data?.reward?.title === "Free Flat White", "Reward title matches");
    assert(createRes.body.data?.reward?.requiredStamps === 6, "Required stamps matches (6)");
    assert(createRes.body.data?.reward?.category === "cafee & drinks", "Category matches 'cafee & drinks'");
    assert(createRes.body.data?.reward?.categoryTag === "Popular Pick", "Category tag matches");
    assert(createRes.body.data?.reward?.status === "active", "Status matches 'active'");

    const createdId = createRes.body.data?.reward?._id || createRes.body.data?.reward?.id;

    // 6. Test second reward with category "bakery & sweets"
    const createSweetRes = await makeRequest(serverUrl, "/api/dashboard/rewards", {
      method: "POST",
      headers: authHeaders,
      body: {
        title: "Artisan Cinnamon Roll",
        requiredStamps: 8,
        categoryTag: "Sweet Treat",
        description: "Freshly baked warm cinnamon roll topped with cream cheese frosting.",
        category: "bakery & sweets",
        status: "active",
      },
    });
    assert(createSweetRes.status === 201, "Creates bakery & sweets reward successfully");
    assert(createSweetRes.body.data?.reward?.category === "bakery & sweets", "Category is bakery & sweets");

    // 7. Test third reward with category "special discount only"
    const createDiscountRes = await makeRequest(serverUrl, "/api/dashboard/rewards", {
      method: "POST",
      headers: authHeaders,
      body: {
        title: "25% Off Retail Beans",
        requiredStamps: 10,
        categoryTag: "VIP Special",
        description: "25% discount on any 250g or 1kg retail specialty coffee bean bag.",
        category: "special discount only",
        status: "active",
      },
    });
    assert(createDiscountRes.status === 201, "Creates special discount only reward successfully");
    assert(createDiscountRes.body.data?.reward?.category === "special discount only", "Category is special discount only");

    // 8. Fetch rewards list
    const getRes = await makeRequest(serverUrl, "/api/dashboard/rewards", {
      method: "GET",
      headers: authHeaders,
    });
    assert(getRes.status === 200, "Fetches rewards list successfully (200)");
    assert(getRes.body.count >= 3, `Returns rewards count >= 3 (got ${getRes.body.count})`);

    // 9. Update reward
    const updateRes = await makeRequest(serverUrl, `/api/dashboard/rewards/${createdId}`, {
      method: "PUT",
      headers: authHeaders,
      body: {
        title: "Free Deluxe Flat White",
        requiredStamps: 7,
        categoryTag: "Top Rated",
      },
    });
    assert(updateRes.status === 200, "Updates reward successfully (200)");
    assert(updateRes.body.data?.reward?.title === "Free Deluxe Flat White", "Updated title matches");
    assert(updateRes.body.data?.reward?.requiredStamps === 7, "Updated requiredStamps matches (7)");

    // 10. Toggle status (active -> inactive)
    const toggleRes = await makeRequest(serverUrl, `/api/dashboard/rewards/${createdId}/status`, {
      method: "PATCH",
      headers: authHeaders,
    });
    assert(toggleRes.status === 200, "Toggles reward status successfully (200)");
    assert(toggleRes.body.data?.reward?.status === "inactive", "Status toggled to inactive");

    // 11. Delete reward
    const deleteRes = await makeRequest(serverUrl, `/api/dashboard/rewards/${createdId}`, {
      method: "DELETE",
      headers: authHeaders,
    });
    assert(deleteRes.status === 200, "Deletes reward successfully (200)");

    // Clean up created test rewards
    await Reward.deleteMany({ cafeId: cafe._id });
    await Cafe.deleteOne({ _id: cafe._id });
    await User.deleteOne({ _id: owner._id });
  } finally {
    server.close();
  }

  console.log(`\nResults: ${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exit(1);
}

runTests().catch((err) => {
  console.error("Test failed with exception:", err);
  process.exit(1);
});
