import { Worker } from "bullmq";
import { Resend } from "resend";
import { redisConnection } from "../queues/email.queue.js";
import env from "../config/env.js";

const resendApiKey = env.RESEND_API_KEY || process.env.RESEND_API_KEY;
const isEmailConfigured = Boolean(resendApiKey && resendApiKey !== "re_not_configured");
const resend = isEmailConfigured ? new Resend(resendApiKey) : null;

if (!isEmailConfigured) {
  console.log("ℹ️  [EmailWorker] RESEND_API_KEY not configured. OTPs will be delivered via stdout console logs.");
} else {
  console.log("📧 [EmailWorker] CoBuy AI Email Worker active via Resend.");
}

/**
 * Builds HTML template and subject for queued email jobs.
 */
export const buildEmailContent = (type, data = {}) => {
  // Verification OTP for account registration / 2FA
  if (type === "verification_otp") {
    return {
      subject: "Verify your CoBuy AI Account",
      html: `
        <div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;padding:30px;border:1px solid #e2e8f0;border-radius:12px;color:#0f172a;background:#ffffff;">
          <h2 style="color:#e11d48;margin-bottom:8px;">🛍️ Welcome to Aap Ki Dukan (CoBuy AI)</h2>
          <p style="color:#475569;margin-bottom:20px;">Apna account verify karne ke liye neeche diya gaya 6-digit verification code enter karein:</p>
          <div style="background:#fff1f2;border:1px solid #fecdd3;padding:18px;border-radius:8px;text-align:center;font-size:32px;font-weight:bold;letter-spacing:8px;color:#e11d48;">
            ${data.otp || "------"}
          </div>
          <p style="color:#94a3b8;font-size:13px;margin-top:20px;line-height:1.5;">
            ⏳ Yeh OTP sirf <strong>10 minute</strong> tak valid hai.<br/>
            Agar aapne yeh registration request nahi ki, toh is email ko ignore karein.
          </p>
          <hr style="border:none;border-top:1px solid #f1f5f9;margin:24px 0;" />
          <p style="color:#94a3b8;font-size:11px;text-align:center;">CoBuy AI Escrow & Collective Buying Protocol</p>
        </div>
      `,
    };
  }

  // Login OTP for passwordless sign-in
  if (type === "login_otp") {
    return {
      subject: "Your CoBuy AI Sign-In Code",
      html: `
        <div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;padding:30px;border:1px solid #e2e8f0;border-radius:12px;color:#0f172a;background:#ffffff;">
          <h2 style="color:#0284c7;margin-bottom:8px;">🔑 Sign in to Aap Ki Dukan</h2>
          <p style="color:#475569;margin-bottom:20px;">Apne account mein login karne ke liye neeche diya gaya 6-digit one-time passcode enter karein:</p>
          <div style="background:#f0f9ff;border:1px solid #bae6fd;padding:18px;border-radius:8px;text-align:center;font-size:32px;font-weight:bold;letter-spacing:8px;color:#0284c7;">
            ${data.otp || "------"}
          </div>
          <p style="color:#94a3b8;font-size:13px;margin-top:20px;line-height:1.5;">
            ⏳ Yeh OTP sirf <strong>10 minute</strong> tak valid hai.<br/>
            Agar aapne login request nahi ki, toh kisi ke sath yeh code share na karein.
          </p>
          <hr style="border:none;border-top:1px solid #f1f5f9;margin:24px 0;" />
          <p style="color:#94a3b8;font-size:11px;text-align:center;">CoBuy AI Passwordless Security</p>
        </div>
      `,
    };
  }

  // Password reset OTP
  if (type === "forgot_password_otp") {
    return {
      subject: "Reset Your CoBuy AI Password",
      html: `
        <div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;padding:30px;border:1px solid #e2e8f0;border-radius:12px;color:#0f172a;background:#ffffff;">
          <h2 style="color:#0f172a;margin-bottom:8px;">🔒 CoBuy AI Password Reset</h2>
          <p style="color:#475569;margin-bottom:20px;">Apna password reset karne ke liye neeche diya gaya 6-digit OTP enter karein:</p>
          <div style="background:#f8fafc;border:1px solid #cbd5e1;padding:18px;border-radius:8px;text-align:center;font-size:32px;font-weight:bold;letter-spacing:8px;color:#0f172a;">
            ${data.otp || "------"}
          </div>
          <p style="color:#94a3b8;font-size:13px;margin-top:20px;line-height:1.5;">
            ⏳ Yeh OTP sirf <strong>15 minute</strong> tak valid hai.<br/>
            Agar aapne password reset request nahi ki, toh turant support se contact karein.
          </p>
          <hr style="border:none;border-top:1px solid #f1f5f9;margin:24px 0;" />
          <p style="color:#94a3b8;font-size:11px;text-align:center;">CoBuy AI Security & Auth Guard</p>
        </div>
      `,
    };
  }

  return {
    subject: "CoBuy AI Notification",
    html: `<p>${data.message || "You have a new notification from Aap Ki Dukan."}</p>`,
  };
};

export const emailWorker = new Worker(
  "emailQueue",
  async (job) => {
    const { email, type, data } = job.data;

    if (!email) {
      console.warn("⚠️ [EmailWorker] Missing recipient email:", job.data);
      return;
    }

    const { subject, html } = buildEmailContent(type, data);

    if (resend) {
      try {
        const { data: resData, error } = await resend.emails.send({
          from: env.RESEND_FROM_EMAIL || "CoBuy AI <onboarding@resend.dev>",
          to: email,
          subject,
          html,
        });

        if (error) {
          console.warn(`⚠️ [EmailWorker] Resend delivery notice for ${email}:`, error.message);
        } else {
          console.log(`✅ [EmailWorker] Delivered ${type} to ${email} (ID: ${resData?.id})`);
        }
      } catch (err) {
        console.warn(`⚠️ [EmailWorker] Delivery error for ${email}:`, err.message);
      }
    } else {
      console.log(`📨 [EmailWorker] Handled background job ${type} for ${email} (OTP: ${data?.otp || "N/A"})`);
    }
  },
  {
    connection: redisConnection,
    concurrency: 5,
  }
);

emailWorker.on("failed", (job, err) => {
  console.warn(`⚠️ [EmailWorker] Job ${job?.id} failed:`, err.message);
});

export default emailWorker;

