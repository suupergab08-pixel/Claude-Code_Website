const { Resend } = require('resend');
require('dotenv').config();

const resend = new Resend(process.env.RESEND_API_KEY);

async function sendWelcomeEmail(user) {
  try {
    const { data } = await resend.emails.send({
      from: 'Tester.io <onboarding@resend.dev>',
      to: user.email,
      subject: `Welcome to Tester.io, ${user.name.split(' ')[0]}! 🎉`,
      html: `
        <div style="font-family:'Helvetica Neue',Arial,sans-serif;max-width:560px;margin:0 auto;background:#121419;color:#E8E8ED;padding:40px;border-radius:12px;">
          <div style="text-align:center;margin-bottom:32px;">
            <div style="font-size:28px;font-weight:800;color:#E6B979;">Tester.io</div>
          </div>
          <h1 style="font-size:24px;font-weight:800;margin-bottom:16px;color:#ffffff;">
            Welcome aboard, ${user.name.split(' ')[0]}!
          </h1>
          <p style="font-size:15px;line-height:1.7;color:#a0a0a8;margin-bottom:20px;">
            Thanks for signing up for Tester.io — you just took the first step toward shipping bug-free software. We're excited to have you.
          </p>
          <p style="font-size:15px;line-height:1.7;color:#a0a0a8;margin-bottom:20px;">
            Here's what you can do next:
          </p>
          <ul style="font-size:14px;line-height:2;color:#a0a0a8;padding-left:20px;margin-bottom:24px;">
            <li>Explore our <strong style="color:#E6B979;">manual + automated testing</strong> workflows</li>
            <li>Connect your repos (GitHub, GitLab, Bitbucket)</li>
            <li>Set up your first test plan in minutes</li>
          </ul>
          <div style="text-align:center;margin:32px 0;">
            <a href="https://tester.io" style="display:inline-block;background:linear-gradient(135deg,#C6A559,#E6B979);color:#0A0A0F;font-weight:700;font-size:14px;letter-spacing:0.08em;text-transform:uppercase;text-decoration:none;padding:14px 36px;border-radius:8px;">
              GET STARTED
            </a>
          </div>
          <div style="background:#1a1d24;border:1px solid rgba(198,165,89,0.15);border-radius:8px;padding:20px;margin-bottom:24px;">
            <p style="font-size:14px;line-height:1.7;color:#a0a0a8;margin:0;">
              <strong style="color:#E6B979;">Have questions?</strong> Just hit reply — this email goes straight to our team. We'd love to hear about your QA challenges and how we can help.
            </p>
          </div>
          <p style="font-size:14px;line-height:1.7;color:#a0a0a8;margin-bottom:8px;">
            Talk soon,
          </p>
          <p style="font-size:14px;font-weight:700;color:#ffffff;margin-bottom:0;">
            The Tester.io Team
          </p>
          <hr style="border:none;border-top:1px solid rgba(198,165,89,0.1);margin:32px 0 16px;" />
          <p style="font-size:11px;color:#555;text-align:center;">
            Tester.io — Human and Automated QA in One Place
          </p>
        </div>
      `,
    });
    console.log(`Welcome email sent to ${user.email} (id: ${data?.id})`);
    return data?.id || null;
  } catch (err) {
    console.error('Email send error:', err.message);
    return null;
  }
}

async function sendContactConfirmation(contact) {
  try {
    const { data } = await resend.emails.send({
      from: 'Tester.io <onboarding@resend.dev>',
      to: contact.email,
      subject: `We got your message, ${contact.name.split(' ')[0]}!`,
      html: `
        <div style="font-family:'Helvetica Neue',Arial,sans-serif;max-width:560px;margin:0 auto;background:#121419;color:#E8E8ED;padding:40px;border-radius:12px;">
          <div style="text-align:center;margin-bottom:32px;">
            <div style="font-size:28px;font-weight:800;color:#E6B979;">Tester.io</div>
          </div>
          <h1 style="font-size:24px;font-weight:800;margin-bottom:16px;color:#ffffff;">
            Thanks for reaching out!
          </h1>
          <p style="font-size:15px;line-height:1.7;color:#a0a0a8;margin-bottom:20px;">
            Hi ${contact.name.split(' ')[0]}, we received your message and our team is on it. You can expect a response within <strong style="color:#E6B979;">24 hours</strong>.
          </p>
          <div style="background:#1a1d24;border:1px solid rgba(198,165,89,0.15);border-radius:8px;padding:20px;margin-bottom:24px;">
            <p style="font-size:13px;color:#666;margin:0 0 8px;text-transform:uppercase;letter-spacing:0.08em;font-weight:700;">Your message:</p>
            <p style="font-size:14px;line-height:1.7;color:#a0a0a8;margin:0;font-style:italic;">"${contact.message}"</p>
          </div>
          <p style="font-size:14px;line-height:1.7;color:#a0a0a8;margin-bottom:20px;">
            In the meantime, feel free to <strong style="color:#E6B979;">reply to this email</strong> if you have anything to add — we're always happy to chat.
          </p>
          <p style="font-size:14px;line-height:1.7;color:#a0a0a8;margin-bottom:8px;">
            Best,
          </p>
          <p style="font-size:14px;font-weight:700;color:#ffffff;margin-bottom:0;">
            The Tester.io Team
          </p>
          <hr style="border:none;border-top:1px solid rgba(198,165,89,0.1);margin:32px 0 16px;" />
          <p style="font-size:11px;color:#555;text-align:center;">
            Tester.io — Human and Automated QA in One Place
          </p>
        </div>
      `,
    });
    console.log(`Contact confirmation email sent to ${contact.email} (id: ${data?.id})`);
    return data?.id || null;
  } catch (err) {
    console.error('Email send error:', err.message);
    return null;
  }
}

module.exports = { sendWelcomeEmail, sendContactConfirmation };
