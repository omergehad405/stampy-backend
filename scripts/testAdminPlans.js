const http = require("http");

function request(options, postData) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode, headers: res.headers, body: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, headers: res.headers, raw: data });
        }
      });
    });
    req.on("error", reject);
    if (postData) {
      req.write(typeof postData === "string" ? postData : JSON.stringify(postData));
    }
    req.end();
  });
}

async function runTests() {
  console.log("=== Testing Admin Subscriptions & Plans API ===");

  // 1. Admin Login
  const loginRes = await request(
    {
      hostname: "localhost",
      port: 5000,
      path: "/api/auth/login",
      method: "POST",
      headers: { "Content-Type": "application/json" },
    },
    { email: "stampy2026@gmail.com", password: "Stampy2026#" }
  );

  console.log("1. Admin Login:", loginRes.status === 200 ? "PASS" : "FAIL", loginRes.status);
  const cookie = loginRes.headers["set-cookie"]?.[0]?.split(";")[0];
  if (!cookie) {
    console.error("No cookie returned! Cannot proceed.");
    process.exit(1);
  }

  // 2. Fetch Available Features
  const featRes = await request({
    hostname: "localhost",
    port: 5000,
    path: "/api/admin/plans/features",
    method: "GET",
    headers: { Cookie: cookie },
  });
  console.log(
    "2. Fetch Available Features:",
    featRes.status === 200 && featRes.body?.data?.features?.length > 0 ? "PASS" : "FAIL",
    `(${featRes.body?.data?.features?.length} features)`
  );

  // 3. Fetch Plans List
  const plansRes = await request({
    hostname: "localhost",
    port: 5000,
    path: "/api/admin/plans",
    method: "GET",
    headers: { Cookie: cookie },
  });
  console.log(
    "3. Fetch Plans List:",
    plansRes.status === 200 ? "PASS" : "FAIL",
    `(${plansRes.body?.count} plans found)`
  );

  // 4. Test Invalid Feature Rejection (Enum Validation)
  const invalidRes = await request(
    {
      hostname: "localhost",
      port: 5000,
      path: "/api/admin/plans",
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
    },
    {
      name: `Test Plan ${Date.now()}`,
      description: "Testing invalid features",
      price: 15,
      features: ["NonExistentFeatureXYZ"],
    }
  );
  console.log(
    "4. Reject Invalid Feature Enum:",
    invalidRes.status === 400 ? "PASS" : "FAIL",
    `(${invalidRes.body?.message})`
  );

  // 5. Create Plan with Valid Features
  const testPlanName = `Growth Tier ${Date.now().toString().slice(-4)}`;
  const createRes = await request(
    {
      hostname: "localhost",
      port: 5000,
      path: "/api/admin/plans",
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
    },
    {
      name: testPlanName,
      description: "Fast growing loyalty program for busy cafes",
      price: 49,
      billingPeriod: "month",
      maxCustomers: 1000,
      maxRewards: 5,
      maxStaff: 4,
      features: ["digital_menu", "activity_history", "multi_staff"],
    }
  );
  console.log(
    "5. Create Plan with Valid Enums:",
    createRes.status === 201 ? "PASS" : "FAIL",
    createRes.body?.data?.plan?.id
  );
  const createdPlanId = createRes.body?.data?.plan?.id;

  if (createdPlanId) {
    // 6. Update Plan
    const updateRes = await request(
      {
        hostname: "localhost",
        port: 5000,
        path: `/api/admin/plans/${createdPlanId}`,
        method: "PUT",
        headers: { "Content-Type": "application/json", Cookie: cookie },
      },
      {
        price: 55,
        maxStaff: 5,
        features: ["digital_menu", "activity_history", "multi_staff", "promotional_campaigns"],
      }
    );
    console.log(
      "6. Update Plan:",
      updateRes.status === 200 && updateRes.body?.data?.plan?.price === 55 ? "PASS" : "FAIL"
    );

    // 7. Toggle Plan Status
    const toggleRes = await request(
      {
        hostname: "localhost",
        port: 5000,
        path: `/api/admin/plans/${createdPlanId}/status`,
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: cookie },
      },
      { isActive: false }
    );
    console.log(
      "7. Toggle Plan Status:",
      toggleRes.status === 200 && toggleRes.body?.data?.plan?.isActive === false ? "PASS" : "FAIL"
    );

    // 8. Delete Plan
    const deleteRes = await request({
      hostname: "localhost",
      port: 5000,
      path: `/api/admin/plans/${createdPlanId}`,
      method: "DELETE",
      headers: { Cookie: cookie },
    });
    console.log(
      "8. Delete Plan:",
      deleteRes.status === 200 ? "PASS" : "FAIL",
      deleteRes.body?.message
    );
  }

  // 9. Assign Plan to Cafe (if any cafe exists)
  const cafesRes = await request({
    hostname: "localhost",
    port: 5000,
    path: "/api/admin/cafes",
    method: "GET",
    headers: { Cookie: cookie },
  });
  if (cafesRes.body?.data?.cafes?.length > 0 && plansRes.body?.data?.plans?.length > 0) {
    const cafe = cafesRes.body.data.cafes[0];
    const plan = plansRes.body.data.plans[0];
    const assignRes = await request(
      {
        hostname: "localhost",
        port: 5000,
        path: "/api/admin/plans/assign",
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: cookie },
      },
      { cafeId: cafe.id, planId: plan.id }
    );
    console.log(
      "9. Assign Plan to Cafe:",
      assignRes.status === 200 ? "PASS" : "FAIL",
      assignRes.body?.message
    );
  }

  console.log("=== All Tests Completed ===");
}

runTests().catch(console.error);
