import dotenv from "dotenv";
dotenv.config();

import { emailQueue } from "../src/queues/email.queue.js";
import { emailWorker } from "../src/workers/email.worker.js";
import { dispatchOtpEmail } from "../src/services/email/email.service.js";

async function testQueue() {
  console.log("🚀 Testing Redis BullMQ OTP Dispatch...");
  const testEmail = "prakharkul123@gmail.com";
  const testOtp = "987654";

  console.log(`Sending test OTP to ${testEmail}...`);
  await dispatchOtpEmail(testEmail, testOtp, "verification_otp");

  console.log("Waiting 4 seconds for worker to process queued job...");
  await new Promise((resolve) => setTimeout(resolve, 4000));

  console.log("Closing worker and queue...");
  await emailWorker.close();
  await emailQueue.close();
  console.log("✅ Email queue test completed successfully.");
  process.exit(0);
}

testQueue().catch((err) => {
  console.error("❌ Test failed:", err);
  process.exit(1);
});

