require("dotenv").config();
const http = require("http");
const express = require("express");
const cookieParser = require("cookie-parser");
const mongoose = require("mongoose");
const connectDB = require("../config/db");
const User = require("../app/models/User");
const Cafe = require("../app/models/Cafe");
const authRoutes = require("../app/routing/authRoutes");
const adminCafeRoutes = require("../app/routing/adminCafeRoutes");

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

async function runTests() {
  console.log("=== STARTING ADMIN CAFE TESTS ===");
  await connectDB();

  // Create isolated express test app
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use("/api/auth", authRoutes);
  app.use("/api/admin/cafes", adminCafeRoutes);

  const server = app.listen(0);
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}`;

  try {
    // 1. Unauthenticated request to /api/admin/cafes rejected with 401
    const unauthRes = await makeRequest(baseUrl, "/api/admin/cafes");
    assert(unauthRes.status === 401, "1.1 Unauthenticated request rejected with 401");

    // 2. Customer user attempting to access /api/admin/cafes rejected with 403
    const testCustomerEmail = `customer_test_${Date.now()}@example.com`;
    const custRegRes = await makeRequest(baseUrl, "/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: {
        name: "Test Customer",
        email: testCustomerEmail,
        password: "CustomerPassword123#",
        registrationType: "customer",
      },
    });
    const customerToken = custRegRes.body?.data?.token;

    const custAccessRes = await makeRequest(baseUrl, "/api/admin/cafes", {
      headers: { Cookie: `token=${customerToken}` },
    });
    assert(custAccessRes.status === 403, "2.1 Non-admin (customer) blocked with 403");

    // 3. Admin login to get admin token
    const adminLoginRes = await makeRequest(baseUrl, "/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: {
        email: "stampy2026@gmail.com",
        password: "Stampy2026#",
      },
    });
    assert(adminLoginRes.status === 200, "3.1 Admin login successful");
    const adminToken = adminLoginRes.body?.data?.token;

    // 4. Admin can fetch cafes list (GET /api/admin/cafes)
    const listRes = await makeRequest(baseUrl, "/api/admin/cafes", {
      headers: { Cookie: `token=${adminToken}` },
    });
    assert(listRes.status === 200, "4.1 Admin can fetch cafes list");
    assert(listRes.body.success === true, "4.2 Get cafes returns success: true");
    assert(Array.isArray(listRes.body.data.cafes), "4.3 Cafes returned as array");

    // 5. Validation: Missing required fields
    const missingNameRes = await makeRequest(baseUrl, "/api/admin/cafes", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: `token=${adminToken}` },
      body: {
        name: "",
        email: "test@cafe.com",
        password: "Password123#",
        phone: "+44 7700 900111",
      },
    });
    assert(missingNameRes.status === 400, "5.1 Missing cafe name rejected with 400");

    const shortPassRes = await makeRequest(baseUrl, "/api/admin/cafes", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: `token=${adminToken}` },
      body: {
        name: "Test Cafe",
        email: "test_short@cafe.com",
        password: "123",
        phone: "+44 7700 900111",
      },
    });
    assert(shortPassRes.status === 400, "5.2 Password under 8 chars rejected with 400");

    // 6. Successful Cafe Creation
    const uniqueStaffEmail = `staff_${Date.now()}@artisan.london`;
    const createRes = await makeRequest(baseUrl, "/api/admin/cafes", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: `token=${adminToken}` },
      body: {
        name: "Artisan Roasters",
        ownerName: "Marco Rossi",
        email: uniqueStaffEmail,
        password: "StaffSecret2026#",
        phone: "+44 7700 900888",
        subscriptionPlanId: "plan-starter",
      },
    });

    assert(createRes.status === 201, "6.1 Cafe creation returns 201 Created");
    assert(createRes.body.success === true, "6.2 Cafe creation success is true");
    const createdCafe = createRes.body.data?.cafe;
    assert(createdCafe.name === "Artisan Roasters", "6.3 Cafe name matches input");
    assert(createdCafe.slug.startsWith("artisan-roasters"), "6.4 Cafe slug auto-generated");
    assert(createdCafe.owner?.email === uniqueStaffEmail, "6.5 Cafe owner email matches staff login");
    assert(createdCafe.subscriptionPlanId === "plan-starter", "6.6 Subscription plan set");
    assert(createdCafe.status === "active", "6.7 Cafe status is active");

    // 7. Verify staff user account created in MongoDB with cafeOwner role
    const staffUser = await User.findOne({ email: uniqueStaffEmail }).select("+password");
    assert(staffUser !== null, "7.1 Staff user created in MongoDB");
    assert(staffUser.role === "cafeOwner", "7.2 Staff user has role 'cafeOwner'");
    assert(staffUser.isActive === true, "7.3 Staff user is active");
    const passwordMatch = await staffUser.matchPassword("StaffSecret2026#");
    assert(passwordMatch === true, "7.4 Staff password securely hashed and matches");

    // 8. Staff account can log in via /api/auth/login
    const staffLoginRes = await makeRequest(baseUrl, "/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: {
        email: uniqueStaffEmail,
        password: "StaffSecret2026#",
      },
    });
    assert(staffLoginRes.status === 200, "8.1 Staff account can log in");
    assert(staffLoginRes.body.data.user.role === "cafeOwner", "8.2 Staff login returns role cafeOwner");

    // 9. Prevent duplicate staff email registration
    const duplicateRes = await makeRequest(baseUrl, "/api/admin/cafes", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: `token=${adminToken}` },
      body: {
        name: "Another Cafe",
        ownerName: "Someone",
        email: uniqueStaffEmail,
        password: "Password123#",
        phone: "+44 7700 900222",
      },
    });
    assert(duplicateRes.status === 400, "9.1 Duplicate staff email rejected with 400");

    // 10. Update Cafe Status (PATCH /api/admin/cafes/:id/status)
    const suspendRes = await makeRequest(baseUrl, `/api/admin/cafes/${createdCafe.id}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: `token=${adminToken}` },
      body: { status: "suspended" },
    });
    assert(suspendRes.status === 200, "10.1 Status update returns 200");
    assert(suspendRes.body.data.cafe.status === "suspended", "10.2 Cafe status is now suspended");

    // 11. Update Cafe Info (PUT /api/admin/cafes/:id)
    const updateRes = await makeRequest(baseUrl, `/api/admin/cafes/${createdCafe.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Cookie: `token=${adminToken}` },
      body: {
        name: "Artisan Roasters Flagship",
        category: "Specialty Espresso",
      },
    });
    assert(updateRes.status === 200, "11.1 Cafe update returns 200");
    assert(updateRes.body.data.cafe.name === "Artisan Roasters Flagship", "11.2 Cafe name updated");

    // Clean up test documents
    await Cafe.findByIdAndDelete(createdCafe.id);
    await User.findByIdAndDelete(staffUser._id);
    await User.findOneAndDelete({ email: testCustomerEmail });

    console.log(`\n=== ADMIN CAFE TEST RESULTS: ${passed} PASSED, ${failed} FAILED ===`);
  } catch (err) {
    console.error("Test execution error:", err);
  } finally {
    server.close();
    await mongoose.connection.close();
    process.exit(failed > 0 ? 1 : 0);
  }
}

runTests();
