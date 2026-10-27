const postmark = require("postmark");

const client = new postmark.ServerClient(process.env.POSTMARK_SERVER_TOKEN);

async function sendOtpEmail(to, code, purpose = "VERIFY_EMAIL") {
  const subject =
    purpose === "VERIFY_EMAIL"
      ? "Your verification code"
      : "Your password reset code";

  const text =
    purpose === "VERIFY_EMAIL"
      ? `Your verification code is: ${code}\n\nThis code expires in 10 minutes.`
      : `Your password reset code is: ${code}\n\nThis code expires in 10 minutes.`;

  return client.sendEmail({
    From: process.env.EMAIL_FROM,
    To: to,
    Subject: subject,
    TextBody: text,
  });
}

module.exports = { sendOtpEmail };
