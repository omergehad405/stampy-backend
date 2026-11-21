const mongoose = require("mongoose");
const crypto = require("crypto");
require("dotenv").config();

const uri = process.env.MONGO_URI || "mongodb://localhost:27017/stampy";

async function run() {
  await mongoose.connect(uri);
  const users = await mongoose.connection.collection("users").find({
    $or: [{ qrCode: { $exists: false } }, { qrCode: null }, { qrCode: "" }],
  }).toArray();

  console.log(`Found ${users.length} users needing qrCode`);
  for (const u of users) {
    const code = crypto.randomBytes(24).toString("hex");
    await mongoose.connection.collection("users").updateOne(
      { _id: u._id },
      { $set: { qrCode: code } }
    );
    console.log(`Updated user ${u.email} with qrCode: ${code}`);
  }
  process.exit(0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
