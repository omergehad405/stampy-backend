const nodemailer = require("nodemailer");

/**
 * Creates and returns a nodemailer transport.
 * If SMTP credentials are provided in environment variables, it uses them.
 * Otherwise, it falls back to an Ethereal test account or console logging in dev mode.
 */
let cachedTransporter = null;

async function getTransporter() {
  if (cachedTransporter) {
    return cachedTransporter;
  }

  const host = process.env.SMTP_HOST || process.env.EMAIL_HOST;
  const port = parseInt(process.env.SMTP_PORT || process.env.EMAIL_PORT, 10) || 587;
  const user = process.env.SMTP_USER || process.env.EMAIL_USER;
  const pass = process.env.SMTP_PASS || process.env.EMAIL_PASS;
  const secure =
    process.env.SMTP_SECURE === "true" ||
    process.env.EMAIL_SECURE === "true" ||
    port === 465;

  // If real SMTP credentials are provided, use them
  if (host && user && pass) {
    cachedTransporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: {
        user,
        pass,
      },
    });
    return cachedTransporter;
  }

  // Fallback for development if no SMTP credentials configured
  try {
    const testAccount = await nodemailer.createTestAccount();
    cachedTransporter = nodemailer.createTransport({
      host: "smtp.ethereal.email",
      port: 587,
      secure: false,
      auth: {
        user: testAccount.user,
        pass: testAccount.pass,
      },
    });
    console.log("[Nodemailer] Using Ethereal test account:", testAccount.user);
    return cachedTransporter;
  } catch (err) {
    console.warn("[Nodemailer] Could not create Ethereal account, using console stream:", err.message);
    cachedTransporter = nodemailer.createTransport({
      streamTransport: true,
      newline: "unix",
      buffer: true,
    });
    return cachedTransporter;
  }
}

/**
 * Generate responsive HTML email for Password Reset
 */
function generateResetPasswordHtml({ name, resetUrl, minutes = 15 }) {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reset Your Stampy Password</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      background-color: #F2EBDA;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      color: #3B2418;
    }
    .wrapper {
      width: 100%;
      background-color: #F2EBDA;
      padding: 40px 16px;
    }
    .container {
      max-width: 540px;
      margin: 0 auto;
      background-color: #FAF6EC;
      border: 1px solid #E8DFCA;
      border-radius: 20px;
      overflow: hidden;
      box-shadow: 0 4px 16px rgba(59, 36, 24, 0.06);
    }
    .header {
      background-color: #3B2418;
      color: #F2EBDA;
      padding: 32px 24px;
      text-align: center;
    }
    .header-logo {
      font-size: 24px;
      font-weight: 800;
      letter-spacing: 2px;
      text-transform: uppercase;
      margin: 0;
      color: #8EC5FF;
    }
    .header-tagline {
      font-size: 13px;
      color: #D3E0E8;
      margin-top: 6px;
      letter-spacing: 0.5px;
    }
    .content {
      padding: 36px 32px;
    }
    .greeting {
      font-size: 20px;
      font-weight: 700;
      color: #3B2418;
      margin-top: 0;
      margin-bottom: 16px;
    }
    .body-text {
      font-size: 15px;
      line-height: 1.6;
      color: #3B2418;
      margin-bottom: 24px;
    }
    .timer-badge {
      background-color: #FFF2D6;
      border: 1px solid #F3DA9E;
      border-radius: 12px;
      padding: 12px 16px;
      margin-bottom: 28px;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .timer-text {
      font-size: 14px;
      font-weight: 600;
      color: #8C530A;
      margin: 0;
    }
    .btn-container {
      text-align: center;
      margin: 32px 0;
    }
    .btn {
      display: inline-block;
      background-color: #8EC5FF;
      color: #3B2418;
      text-decoration: none;
      font-weight: 700;
      font-size: 15px;
      padding: 14px 32px;
      border-radius: 14px;
      box-shadow: 0 4px 12px rgba(142, 197, 255, 0.35);
      letter-spacing: 0.2px;
    }
    .link-fallback {
      background-color: #F2EBDA;
      border: 1px dashed #DCCFB7;
      border-radius: 10px;
      padding: 12px;
      word-break: break-all;
      font-size: 12px;
      color: #5C4538;
      margin-top: 24px;
    }
    .security-notice {
      font-size: 12px;
      line-height: 1.5;
      color: #7A6559;
      margin-top: 28px;
      border-top: 1px solid #E8DFCA;
      padding-top: 20px;
    }
    .footer {
      background-color: #F2EBDA;
      padding: 20px 24px;
      text-align: center;
      font-size: 12px;
      color: #7A6559;
      border-top: 1px solid #E8DFCA;
    }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="container">
      <div class="header">
        <div class="header-logo">☕ STAMPY</div>
        <div class="header-tagline">Digital Loyalty & Rewards</div>
      </div>
      
      <div class="content">
        <h2 class="greeting">Hello ${name ? name : "there"},</h2>
        
        <p class="body-text">
          We received a request to reset the password for your Stampy account. 
          Click the button below to choose a new password:
        </p>
        
        <div class="timer-badge">
          <p class="timer-text">
            ⏳ <strong>Notice:</strong> This password reset link is valid for <strong>${minutes} minutes</strong> only.
          </p>
        </div>

        <div class="btn-container">
          <a href="${resetUrl}" target="_blank" class="btn">
            Reset Password
          </a>
        </div>

        <p class="body-text" style="font-size: 13px; color: #5C4538;">
          If the button above does not work, copy and paste this link into your browser:
        </p>
        <div class="link-fallback">
          <a href="${resetUrl}" style="color: #3B2418;">${resetUrl}</a>
        </div>

        <div class="security-notice">
          <strong>Didn't request this?</strong><br>
          If you didn't request a password reset, you can safely ignore this email. Your account remains completely secure and no changes have been made.
        </div>
      </div>

      <div class="footer">
        &copy; ${new Date().getFullYear()} Stampy Loyalty System. All rights reserved.
      </div>
    </div>
  </div>
</body>
</html>
`;
}

/**
 * Send Password Reset Email
 * @param {Object} options
 * @param {string} options.email - Recipient email
 * @param {string} options.name - Recipient name
 * @param {string} options.resetUrl - Full reset link URL
 */
async function sendPasswordResetEmail({ email, name, resetUrl }) {
  const transporter = await getTransporter();

  const fromAddress =
    process.env.EMAIL_FROM ||
    process.env.SMTP_FROM ||
    '"Stampy Support" <no-reply@stampy.app>';

  const mailOptions = {
    from: fromAddress,
    to: email,
    subject: "Stampy - Password Reset Request (Valid for 15 minutes)",
    text: `Hello ${name || "there"},\n\nYou requested a password reset for your Stampy account.\n\nPlease reset your password using the link below:\n${resetUrl}\n\nIMPORTANT: This link will expire in 15 minutes.\n\nIf you did not request this, please ignore this email.\n\nStampy Team`,
    html: generateResetPasswordHtml({ name, resetUrl, minutes: 15 }),
  };

  const info = await transporter.sendMail(mailOptions);

  console.log(`[Stampy Mail] Password reset email dispatched to ${email}. MessageId: ${info.messageId || "stream"}`);
  
  // If using Ethereal, display preview URL in logs
  const previewUrl = nodemailer.getTestMessageUrl(info);
  if (previewUrl) {
    console.log(`[Stampy Mail Ethereal Preview URL]: ${previewUrl}`);
  }

  // Also log reset link in development for fast testing
  if (process.env.NODE_ENV !== "production") {
    console.log(`[Stampy Reset Link]: ${resetUrl}`);
  }

  return { info, previewUrl, resetUrl };
}

module.exports = {
  sendPasswordResetEmail,
  getTransporter,
};
