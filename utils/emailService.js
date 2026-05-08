const nodemailer = require('nodemailer');

/* ── Create Gmail transporter ── */
const createTransporter = () => nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD, // Gmail App Password (not regular password)
  },
});

/* ── Email Templates ── */

/**
 * Send verification email to new registrant
 */
exports.sendVerificationEmail = async ({ to, name, token }) => {
  const verifyUrl = `${process.env.CLIENT_URL}/verify?token=${token}`;
  const transporter = createTransporter();

  await transporter.sendMail({
    from: `"LogicLords Team" <${process.env.GMAIL_USER}>`,
    to,
    subject: '✅ Verify your LogicLords account',
    html: `
      <!DOCTYPE html>
      <html>
      <body style="background:#030b1a;font-family:'Segoe UI',sans-serif;color:#dde6f0;padding:0;margin:0;">
        <div style="max-width:560px;margin:40px auto;background:#0d1526;border:1px solid #1a2d4d;border-radius:16px;overflow:hidden;">
          <!-- Header -->
          <div style="background:linear-gradient(135deg,#00f5d4,#3b82f6);padding:32px;text-align:center;">
            <h1 style="color:#030b1a;font-size:28px;margin:0;font-weight:900;letter-spacing:-1px;">LogicLords</h1>
            <p style="color:#030b1a;margin:8px 0 0;font-size:13px;opacity:.8;">Where Logic Meets Innovation</p>
          </div>
          <!-- Body -->
          <div style="padding:36px 32px;">
            <h2 style="color:#dde6f0;font-size:20px;margin:0 0 12px;">Hi ${name}! 👋</h2>
            <p style="color:#6b87a8;line-height:1.7;margin:0 0 24px;">
              Thanks for registering with <strong style="color:#00f5d4;">LogicLords</strong>. 
              Please verify your email address to continue.
            </p>
            <div style="text-align:center;margin:32px 0;">
              <a href="${verifyUrl}" style="background:linear-gradient(135deg,#00f5d4,#3b82f6);color:#030b1a;text-decoration:none;padding:14px 36px;border-radius:8px;font-weight:700;font-size:14px;letter-spacing:1px;display:inline-block;">
                ✅ VERIFY EMAIL
              </a>
            </div>
            <p style="color:#4a6080;font-size:12px;line-height:1.6;">
              This link expires in <strong>24 hours</strong>. If you did not register, please ignore this email.
            </p>
            <div style="background:#060f24;border:1px solid #1a2d4d;border-radius:8px;padding:14px;margin-top:20px;">
              <p style="color:#4a6080;font-size:11px;margin:0;word-break:break-all;">
                Or copy this link: <span style="color:#00f5d4;">${verifyUrl}</span>
              </p>
            </div>
          </div>
          <!-- Footer -->
          <div style="padding:20px 32px;border-top:1px solid #1a2d4d;text-align:center;">
            <p style="color:#4a6080;font-size:11px;margin:0;">© 2025 LogicLords · Where Logic Meets Innovation</p>
          </div>
        </div>
      </body>
      </html>
    `,
  });
};

/**
 * Notify admin about new registration request
 */
exports.sendAdminApprovalRequest = async ({ adminEmail, adminName, applicant }) => {
  const approveUrl = `${process.env.CLIENT_URL}/admin?action=approve&id=${applicant._id}`;
  const rejectUrl  = `${process.env.CLIENT_URL}/admin?action=reject&id=${applicant._id}`;
  const transporter = createTransporter();

  await transporter.sendMail({
    from: `"LogicLords System" <${process.env.GMAIL_USER}>`,
    to: adminEmail,
    subject: `🔔 New Registration Request — ${applicant.name}`,
    html: `
      <!DOCTYPE html>
      <html>
      <body style="background:#030b1a;font-family:'Segoe UI',sans-serif;color:#dde6f0;padding:0;margin:0;">
        <div style="max-width:560px;margin:40px auto;background:#0d1526;border:1px solid #1a2d4d;border-radius:16px;overflow:hidden;">
          <div style="background:linear-gradient(135deg,#f59e0b,#ef4444);padding:28px 32px;">
            <h1 style="color:#fff;font-size:22px;margin:0;font-weight:900;">🔔 New Team Application</h1>
            <p style="color:rgba(255,255,255,.8);margin:6px 0 0;font-size:13px;">Action required from admin</p>
          </div>
          <div style="padding:32px;">
            <p style="color:#6b87a8;margin:0 0 20px;">Hi <strong style="color:#dde6f0;">${adminName}</strong>, a new member wants to join LogicLords:</p>
            
            <!-- Applicant Card -->
            <div style="background:#060f24;border:1px solid #1a2d4d;border-radius:10px;padding:20px;margin-bottom:28px;">
              <table style="width:100%;border-collapse:collapse;">
                <tr><td style="color:#4a6080;font-size:12px;padding:6px 0;width:100px;">Name</td><td style="color:#dde6f0;font-size:13px;font-weight:600;">${applicant.name}</td></tr>
                <tr><td style="color:#4a6080;font-size:12px;padding:6px 0;">Email</td><td style="color:#00f5d4;font-size:13px;">${applicant.email}</td></tr>
                <tr><td style="color:#4a6080;font-size:12px;padding:6px 0;">Role</td><td style="color:#818cf8;font-size:13px;font-weight:600;">${applicant.role}</td></tr>
                <tr><td style="color:#4a6080;font-size:12px;padding:6px 0;">Skills</td><td style="color:#6b87a8;font-size:12px;">${(applicant.skills||[]).join(', ')||'—'}</td></tr>
                <tr><td style="color:#4a6080;font-size:12px;padding:6px 0;">Applied</td><td style="color:#6b87a8;font-size:12px;">${new Date().toLocaleString('en-IN')}</td></tr>
              </table>
            </div>

            <!-- Action Buttons -->
            <div style="display:flex;gap:12px;text-align:center;">
              <a href="${approveUrl}" style="flex:1;background:#10b981;color:#fff;text-decoration:none;padding:13px 20px;border-radius:8px;font-weight:700;font-size:13px;display:inline-block;">
                ✅ Approve Member
              </a>
              <a href="${rejectUrl}" style="flex:1;background:#ef4444;color:#fff;text-decoration:none;padding:13px 20px;border-radius:8px;font-weight:700;font-size:13px;display:inline-block;margin-left:12px;">
                ❌ Reject
              </a>
            </div>
            <p style="color:#4a6080;font-size:11px;text-align:center;margin-top:16px;">
              Or login to LogicLords portal to manage members
            </p>
          </div>
          <div style="padding:16px 32px;border-top:1px solid #1a2d4d;text-align:center;">
            <p style="color:#4a6080;font-size:11px;margin:0;">© 2025 LogicLords</p>
          </div>
        </div>
      </body>
      </html>
    `,
  });
};

/**
 * Notify member that they have been approved
 */
exports.sendApprovalConfirmation = async ({ to, name }) => {
  const loginUrl = `${process.env.CLIENT_URL}`;
  const transporter = createTransporter();

  await transporter.sendMail({
    from: `"LogicLords Team" <${process.env.GMAIL_USER}>`,
    to,
    subject: '🎉 Welcome to LogicLords — You are approved!',
    html: `
      <!DOCTYPE html>
      <html>
      <body style="background:#030b1a;font-family:'Segoe UI',sans-serif;color:#dde6f0;padding:0;margin:0;">
        <div style="max-width:560px;margin:40px auto;background:#0d1526;border:1px solid #1a2d4d;border-radius:16px;overflow:hidden;">
          <div style="background:linear-gradient(135deg,#10b981,#3b82f6);padding:32px;text-align:center;">
            <div style="font-size:48px;margin-bottom:8px;">🎉</div>
            <h1 style="color:#fff;font-size:24px;margin:0;font-weight:900;">You're Approved!</h1>
          </div>
          <div style="padding:36px 32px;">
            <h2 style="color:#dde6f0;margin:0 0 12px;">Welcome to the team, ${name}!</h2>
            <p style="color:#6b87a8;line-height:1.7;margin:0 0 28px;">
              Your application has been <strong style="color:#10b981;">approved</strong> by the admin. 
              You are now an official member of <strong style="color:#00f5d4;">LogicLords</strong>!
            </p>
            <p style="color:#6b87a8;line-height:1.7;margin:0 0 28px;">
              You can now login to the portal, join projects, manage tasks, collaborate with the team, and access the GitHub integration.
            </p>
            <div style="text-align:center;margin:28px 0;">
              <a href="${loginUrl}" style="background:linear-gradient(135deg,#00f5d4,#3b82f6);color:#030b1a;text-decoration:none;padding:14px 36px;border-radius:8px;font-weight:700;font-size:14px;letter-spacing:1px;display:inline-block;">
                🚀 LOGIN NOW
              </a>
            </div>
          </div>
          <div style="padding:16px 32px;border-top:1px solid #1a2d4d;text-align:center;">
            <p style="color:#4a6080;font-size:11px;margin:0;">© 2025 LogicLords · Where Logic Meets Innovation</p>
          </div>
        </div>
      </body>
      </html>
    `,
  });
};

/**
 * Notify member that they have been rejected
 */
exports.sendRejectionEmail = async ({ to, name, reason }) => {
  const transporter = createTransporter();

  await transporter.sendMail({
    from: `"LogicLords Team" <${process.env.GMAIL_USER}>`,
    to,
    subject: 'LogicLords — Application Update',
    html: `
      <!DOCTYPE html>
      <html>
      <body style="background:#030b1a;font-family:'Segoe UI',sans-serif;color:#dde6f0;padding:0;margin:0;">
        <div style="max-width:560px;margin:40px auto;background:#0d1526;border:1px solid #1a2d4d;border-radius:16px;overflow:hidden;">
          <div style="background:#1a1a2e;padding:28px 32px;border-bottom:1px solid #1a2d4d;">
            <h1 style="color:#dde6f0;font-size:20px;margin:0;">LogicLords</h1>
          </div>
          <div style="padding:36px 32px;">
            <h2 style="color:#dde6f0;margin:0 0 12px;">Hi ${name},</h2>
            <p style="color:#6b87a8;line-height:1.7;margin:0 0 20px;">
              Thank you for your interest in joining <strong style="color:#00f5d4;">LogicLords</strong>.
              After review, we are unable to approve your application at this time.
            </p>
            ${reason ? `<div style="background:#060f24;border:1px solid #1a2d4d;border-radius:8px;padding:16px;margin-bottom:20px;"><p style="color:#f87171;font-size:13px;margin:0;"><strong>Reason:</strong> ${reason}</p></div>` : ''}
            <p style="color:#6b87a8;line-height:1.7;">
              You are welcome to apply again in the future. If you have questions, please reach out to the team.
            </p>
          </div>
          <div style="padding:16px 32px;border-top:1px solid #1a2d4d;text-align:center;">
            <p style="color:#4a6080;font-size:11px;margin:0;">© 2025 LogicLords · Where Logic Meets Innovation</p>
          </div>
        </div>
      </body>
      </html>
    `,
  });
};
