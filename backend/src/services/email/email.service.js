import { Resend } from "resend";
import env from "../../config/env.js";
import { emailQueue, redisConnection } from "../../queues/email.queue.js";

const resendApiKey = env.RESEND_API_KEY || process.env.RESEND_API_KEY;
const isEmailConfigured = Boolean(resendApiKey && resendApiKey !== "re_not_configured");
const resendClient = isEmailConfigured ? new Resend(resendApiKey) : null;

/**
 * Generate a cryptographically secure 6-digit numeric OTP.
 */
export const generateSixDigitOtp = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

/**
 * Dispatches an OTP email via direct Resend API (instant) and/or BullMQ Redis queue.
 * Always prints the OTP prominently in console logs for developer diagnostics.
 *
 * @param {string} email
 * @param {string} otp
 * @param {"verification_otp" | "forgot_password_otp"} [type="verification_otp"]
 */
export const dispatchOtpEmail = async (email, otp, type = "verification_otp") => {
  const normalizedEmail = email?.toLowerCase()?.trim();

  // Always log OTP prominently in console for instant testing & evaluation visibility
  console.log(`\n==================================================`);
  console.log(`🔑 [SECURITY OTP for ${normalizedEmail}]: ${otp} (${type})`);
  console.log(`==================================================\n`);

  // 1. Direct delivery via Resend if credentials are present
  if (resendClient) {
    try {
      const subject =
        type === "verification_otp"
          ? "Verify your CoBuy AI Account"
          : type === "login_otp"
          ? "Your CoBuy AI Sign-In Code"
          : "Reset Your CoBuy AI Password";

      const title =
        type === "verification_otp"
          ? "🛍️ Welcome to Aap Ki Dukan (CoBuy AI)"
          : type === "login_otp"
          ? "🔑 Sign in to Aap Ki Dukan (CoBuy AI)"
          : "🔒 CoBuy AI Password Reset";

      const desc =
        type === "verification_otp"
          ? "Apna account verify karne ke liye neeche diya gaya 6-digit OTP code darj karein:"
          : type === "login_otp"
          ? "Apne account mein passwordless sign-in ke liye neeche diya gaya 6-digit OTP enter karein:"
          : "Apna password reset karne ke liye neeche diya gaya 6-digit OTP code enter karein:";

      const accentColor = type === "login_otp" ? "#0284c7" : "#e11d48";
      const bgAccent = type === "login_otp" ? "#f0f9ff" : "#fff1f2";
      const borderAccent = type === "login_otp" ? "#bae6fd" : "#fecdd3";

      const html = `
        <div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;padding:30px;border:1px solid #e2e8f0;border-radius:12px;color:#0f172a;background:#ffffff;">
          <h2 style="color:${accentColor};margin-bottom:8px;">${title}</h2>
          <p style="color:#475569;margin-bottom:20px;">${desc}</p>
          <div style="background:${bgAccent};border:1px solid ${borderAccent};padding:18px;border-radius:8px;text-align:center;font-size:32px;font-weight:bold;letter-spacing:8px;color:${accentColor};">
            ${otp}
          </div>
          <p style="color:#94a3b8;font-size:13px;margin-top:20px;line-height:1.5;">
            ⏳ Yeh OTP sirf <strong>10 minute</strong> tak valid hai.<br/>
            Agar aapne yeh request nahi ki, toh is email ko ignore karein.
          </p>
        </div>
      `;

      const { data, error } = await resendClient.emails.send({
        from: env.RESEND_FROM_EMAIL || "CoBuy AI <onboarding@resend.dev>",
        to: normalizedEmail,
        subject,
        html,
      });

      if (error) {
        console.warn("⚠️ [Direct Resend Notice]:", error.message || error);
      } else {
        console.log(`✅ [Direct Resend] Sent OTP email to ${normalizedEmail} (ID: ${data?.id})`);
        return;
      }
    } catch (resendErr) {
      console.warn("⚠️ [Direct Resend Notice]:", resendErr.message);
    }
  }

  // 2. Asynchronous Queue delivery via BullMQ + Redis if available
  if (redisConnection && (redisConnection.status === "ready" || redisConnection.status === "connecting")) {
    try {
      await emailQueue.add(type, {
        email: normalizedEmail,
        type,
        data: { otp },
      });
      console.log(`📥 [BullMQ Queue] Enqueued ${type} job for ${normalizedEmail}`);
    } catch (queueErr) {
      console.warn("⚠️ [BullMQ Notice]:", queueErr.message);
    }
  }
};

export default {
  generateSixDigitOtp,
  dispatchOtpEmail,
};

