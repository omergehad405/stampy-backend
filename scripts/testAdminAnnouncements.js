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
  console.log("=== Testing Admin Announcements & Cafe Broadcast API ===");

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

  console.log("1. Admin Login:", loginRes.status === 200 ? "PASS" : "FAIL");
  const cookie = loginRes.headers["set-cookie"]?.[0]?.split(";")[0];
  if (!cookie) {
    console.error("No cookie returned! Cannot proceed.");
    process.exit(1);
  }

  // 2. Fetch Admin Announcements List
  const adminListRes = await request({
    hostname: "localhost",
    port: 5000,
    path: "/api/admin/announcements",
    method: "GET",
    headers: { Cookie: cookie },
  });
  console.log(
    "2. Fetch Admin Announcements:",
    adminListRes.status === 200 ? "PASS" : "FAIL",
    `(${adminListRes.body?.count} announcements found)`
  );

  // 3. Fetch Active Announcements (Cafe view)
  const activeRes = await request({
    hostname: "localhost",
    port: 5000,
    path: "/api/announcements/active",
    method: "GET",
  });
  console.log(
    "3. Fetch Active Announcements for Cafe:",
    activeRes.status === 200 ? "PASS" : "FAIL",
    `(${activeRes.body?.count} active)`
  );

  // 4. Create Announcement (published)
  const testTitle = `Holiday Stamp Rush ${Date.now().toString().slice(-4)}`;
  const createRes = await request(
    {
      hostname: "localhost",
      port: 5000,
      path: "/api/admin/announcements",
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
    },
    {
      title: testTitle,
      message: "Double stamps event starting tomorrow across all cafes! Prepare rewards.",
      isPublished: true,
    }
  );
  console.log(
    "4. Create Announcement:",
    createRes.status === 201 ? "PASS" : "FAIL",
    createRes.body?.data?.announcement?.id
  );
  const createdId = createRes.body?.data?.announcement?.id;

  if (createdId) {
    // 5. Verify it appears in active announcements
    const activeCheck1 = await request({
      hostname: "localhost",
      port: 5000,
      path: "/api/announcements/active",
      method: "GET",
    });
    const foundInActive = activeCheck1.body?.data?.announcements?.some((a) => a.id === createdId);
    console.log("5. Appears in Cafe Active Announcements:", foundInActive ? "PASS" : "FAIL");

    // 6. Toggle Unpublish
    const unpublishRes = await request(
      {
        hostname: "localhost",
        port: 5000,
        path: `/api/admin/announcements/${createdId}/publish`,
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: cookie },
      },
      { isPublished: false }
    );
    console.log(
      "6. Unpublish Announcement:",
      unpublishRes.status === 200 && unpublishRes.body?.data?.announcement?.isPublished === false
        ? "PASS"
        : "FAIL"
    );

    // 7. Verify it disappeared from cafe active announcements
    const activeCheck2 = await request({
      hostname: "localhost",
      port: 5000,
      path: "/api/announcements/active",
      method: "GET",
    });
    const stillActive = activeCheck2.body?.data?.announcements?.some((a) => a.id === createdId);
    console.log("7. Disappeared from Cafe Active Announcements when unpublished:", !stillActive ? "PASS" : "FAIL");

    // 8. Update Announcement
    const updateRes = await request(
      {
        hostname: "localhost",
        port: 5000,
        path: `/api/admin/announcements/${createdId}`,
        method: "PUT",
        headers: { "Content-Type": "application/json", Cookie: cookie },
      },
      {
        title: `${testTitle} - Updated`,
        message: "Updated event details: Triple stamps weekend!",
        isPublished: true,
      }
    );
    console.log(
      "8. Update Announcement:",
      updateRes.status === 200 && updateRes.body?.data?.announcement?.title.includes("Updated")
        ? "PASS"
        : "FAIL"
    );

    // 9. Delete Announcement
    const deleteRes = await request({
      hostname: "localhost",
      port: 5000,
      path: `/api/admin/announcements/${createdId}`,
      method: "DELETE",
      headers: { Cookie: cookie },
    });
    console.log(
      "9. Delete Announcement:",
      deleteRes.status === 200 ? "PASS" : "FAIL",
      deleteRes.body?.message
    );
  }

  console.log("=== All Announcement Tests Completed ===");
}

runTests().catch(console.error);
