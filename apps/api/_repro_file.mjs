import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";
import request from "supertest";
import { fileURLToPath as f } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
function loadEnv(file) {
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
  }
}
loadEnv(path.join(__dirname, ".env"));

const { signAccessToken } = await import("./src/modules/auth/auth.service.js");
const { User } = await import("./src/modules/users/user.model.js");
const { createApp } = await import("./src/app.js");
const { isFileAllowed, DOCUMENT_TYPES } = await import("./src/middleware/upload.middleware.js");

const jpeg = Buffer.from("/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAGfAP/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAQUCf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQMBAT8Bf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQIBAT8Bf//Z", "base64");

console.log("allow jpeg", isFileAllowed(DOCUMENT_TYPES, { originalname: "product.jpg", mimetype: "image/jpeg" }));
console.log("allow png", isFileAllowed(DOCUMENT_TYPES, { originalname: "product.png", mimetype: "image/png" }));

await mongoose.connect(process.env.MONGO_URL);
const userId = "6ab6449e0df63061043c9310";
const tenantId = "6ab6449e0df63061043c930f";
const user = await User.findById(userId);
const assignment = await mongoose.connection.db.collection("roleassignments").findOne({
  userId: new mongoose.Types.ObjectId(userId),
  tenantId: new mongoose.Types.ObjectId(tenantId),
});
const token = signAccessToken(user, assignment);
const app = createApp();
const res = await request(app)
  .post("/api/v1/copilot/attachments?kind=file")
  .set("Authorization", "Bearer " + token)
  .attach("file", jpeg, { filename: "product.jpg", contentType: "image/jpeg" });
console.log("supertest file+jpg", res.status, res.body?.error || res.body);
await mongoose.disconnect();