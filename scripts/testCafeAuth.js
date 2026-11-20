require("dotenv").config();
const http = require("http");
const express = require("express");
const cookieParser = require("cookie-parser");
const connectDB = require("../config/db");
const User = require("../app/models/User");
const Cafe = require("../app/models/Cafe");
const authRoutes = require("../app/routing/authRoutes");

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

async function runCafeAuthTests() {
  console.log("=== STARTING CAFE DASHBOARD AUTH TESTS ===");
  await connectDB();

  // 1. Ensure Demo Cafe Owner & Cafe exist
  const demoEmail = "elena@coffeehouse.london";
  let owner = await User.findOne({ email: demoEmail });
  if (!owner) {
    owner = await User.create({
      name: "Elena Rostova",
      email: demoEmail,
      password: "Password123#",
      role: "cafeOwner",
      phone: "+44 7700 900111",
      isActive: true,
    });
  }

  let cafe = await Cafe.findOne({ "owner.userId": owner._id });
  if (!cafe) {
    cafe = await Cafe.findOne({ slug: "the-roasted-bean" });
  }
  if (!cafe) {
    cafe = await Cafe.create({
      name: "The Roasted Bean Roastery",
      slug: "the-roasted-bean",
      tagline: "Artisan Coffee & Specialty Treats",
      category: "Specialty Coffee Roaster",
      status: "active",
      isActive: true,
      isVerified: true,
      stampTarget: 10,
      customerCount: 128,
      totalStampsIssued: 842,
      totalRewardsRedeemed: 64,
      owner: {
        userId: owner._id,
        name: owner.name,
        email: owner.email,
        phone: owner.phone,
      },
      contact: {
        email: "hello@roastedbean.coffee",
        phone: "+44 20 7946 0912",
        displayPhone: "+44 20 7946 0912",
      },
      location: {
        address: "14 Soho Square",
        district: "Soho",
        city: "London",
      },
    });
  }

  if (!owner.cafeId) {
    owner.cafeId = cafe._id;
    await owner.save();
  }

  // Create isolated express test server
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use("/api/auth", authRoutes);

  const server = app.listen(0);
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}`;

  try {
    // Test 1: Wrong password fails with 401
    const wrongPassRes = await makeRequest(baseUrl, "/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: {
        email: demoEmail,
        password: "WrongPassword999#",
      },
    });
    assert(wrongPassRes.status === 401, "1.1 Invalid cafe staff password rejected with 401");
    assert(wrongPassRes.body.success === false, "1.2 Success is false on invalid password");

    // Test 2: Valid cafe owner login returns 200, user, token and associated cafe data
    const ownerLoginRes = await makeRequest(baseUrl, "/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: {
        email: demoEmail,
        password: "Password123#",
      },
    });
    assert(ownerLoginRes.status === 200, "2.1 Cafe Owner login returns 200");
    assert(ownerLoginRes.body.success === true, "2.2 Login success is true");
    assert(ownerLoginRes.body.data.user.role === "cafeOwner", "2.3 User role is cafeOwner");
    assert(ownerLoginRes.body.data.cafe !== undefined, "2.4 Cafe data returned on staff login");
    assert(ownerLoginRes.body.data.cafe.name === "The Roasted Bean Roastery", "2.5 Cafe name matches DB");
    assert(ownerLoginRes.body.data.cafe.stampTarget === 10, "2.6 Cafe stampTarget matches DB");

    const ownerToken = ownerLoginRes.body.data.token;

    // Test 3: GET /api/auth/me with cookie returns user and associated cafe
    const meRes = await makeRequest(baseUrl, "/api/auth/me", {
      headers: { Cookie: `token=${ownerToken}` },
    });
    assert(meRes.status === 200, "3.1 GET /api/auth/me returns 200 for cafe staff");
    assert(meRes.body.data.user.email === demoEmail, "3.2 GET /api/auth/me returns correct staff email");
    assert(meRes.body.data.cafe !== undefined, "3.3 GET /api/auth/me returns associated cafe data");
    assert(meRes.body.data.cafe.slug === "the-roasted-bean", "3.4 Cafe slug is the-roasted-bean");

    // Test 4: Admin login returns 200, user and can access cafe data
    const adminLoginRes = await makeRequest(baseUrl, "/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: {
        email: "stampy2026@gmail.com",
        password: "Stampy2026#",
      },
    });
    assert(adminLoginRes.status === 200, "4.1 Admin login returns 200");
    assert(adminLoginRes.body.data.user.role === "admin", "4.2 User role is admin");
    assert(adminLoginRes.body.data.cafe !== undefined, "4.3 Admin receives active cafe context");

    console.log(`\n=== RESULTS: ${passed} PASSED, ${failed} FAILED ===\n`);
  } finally {
    server.close();
    process.exit(failed > 0 ? 1 : 0);
  }
}

runCafeAuthTests().catch((err) => {
  console.error("Test error:", err);
  process.exit(1);
});
