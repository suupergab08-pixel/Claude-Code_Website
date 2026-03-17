const { Resend } = require('resend');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const resend = new Resend(process.env.RESEND_API_KEY);
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
const { trackInteraction } = require('./track');

// ===== Follow-up Email Templates =====
const templates = [
  {
    day: 5,
    subject: (name) => `${name}, here's what Tester.io can do for your team`,
    html: (name) => `
      <div style="font-family:'Helvetica Neue',Arial,sans-serif;max-width:560px;margin:0 auto;background:#121419;color:#E8E8ED;padding:40px;border-radius:12px;">
        <div style="text-align:center;margin-bottom:32px;">
          <div style="font-size:28px;font-weight:800;color:#E6B979;">Tester.io</div>
        </div>
        <h1 style="font-size:22px;font-weight:800;margin-bottom:16px;color:#ffffff;">
          Hey ${name}, quick question
        </h1>
        <p style="font-size:15px;line-height:1.7;color:#a0a0a8;margin-bottom:20px;">
          We noticed you signed up recently but haven't started a test yet. No worries — we wanted to share what teams like yours are doing with Tester.io:
        </p>
        <div style="background:#1a1d24;border:1px solid rgba(198,165,89,0.15);border-radius:8px;padding:20px;margin-bottom:16px;">
          <p style="font-size:14px;line-height:1.7;color:#a0a0a8;margin:0;">
            <strong style="color:#E6B979;">Catch bugs 3x faster</strong> — Combine automated regression tests with human exploratory testing in one workflow.
          </p>
        </div>
        <div style="background:#1a1d24;border:1px solid rgba(198,165,89,0.15);border-radius:8px;padding:20px;margin-bottom:16px;">
          <p style="font-size:14px;line-height:1.7;color:#a0a0a8;margin:0;">
            <strong style="color:#E6B979;">Ship every sprint confidently</strong> — Run tests on every PR with CI/CD integration. No more "works on my machine."
          </p>
        </div>
        <div style="background:#1a1d24;border:1px solid rgba(198,165,89,0.15);border-radius:8px;padding:20px;margin-bottom:24px;">
          <p style="font-size:14px;line-height:1.7;color:#a0a0a8;margin:0;">
            <strong style="color:#E6B979;">One dashboard for everything</strong> — Bug reports, test runs, coverage metrics, and team activity in a single view.
          </p>
        </div>
        <div style="text-align:center;margin:32px 0;">
          <a href="https://tester.io" style="display:inline-block;background:linear-gradient(135deg,#C6A559,#E6B979);color:#0A0A0F;font-weight:700;font-size:14px;letter-spacing:0.08em;text-transform:uppercase;text-decoration:none;padding:14px 36px;border-radius:8px;">
            START YOUR FIRST TEST
          </a>
        </div>
        <p style="font-size:14px;line-height:1.7;color:#a0a0a8;">
          Have questions? <strong style="color:#E6B979;">Just reply to this email</strong> — I read every response personally.
        </p>
        <p style="font-size:14px;line-height:1.7;color:#a0a0a8;margin-top:16px;">Cheers,<br/><strong style="color:#fff;">The Tester.io Team</strong></p>
        <hr style="border:none;border-top:1px solid rgba(198,165,89,0.1);margin:32px 0 16px;" />
        <p style="font-size:11px;color:#555;text-align:center;">Tester.io — Human and Automated QA in One Place</p>
      </div>
    `,
  },
  {
    day: 10,
    subject: (name) => `${name}, see how other teams use Tester.io`,
    html: (name) => `
      <div style="font-family:'Helvetica Neue',Arial,sans-serif;max-width:560px;margin:0 auto;background:#121419;color:#E8E8ED;padding:40px;border-radius:12px;">
        <div style="text-align:center;margin-bottom:32px;">
          <div style="font-size:28px;font-weight:800;color:#E6B979;">Tester.io</div>
        </div>
        <h1 style="font-size:22px;font-weight:800;margin-bottom:16px;color:#ffffff;">
          Real teams, real results
        </h1>
        <p style="font-size:15px;line-height:1.7;color:#a0a0a8;margin-bottom:24px;">
          Hey ${name}, here's what teams are saying after switching to Tester.io:
        </p>
        <div style="background:#1a1d24;border-left:3px solid #C6A559;padding:20px;margin-bottom:16px;border-radius:0 8px 8px 0;">
          <p style="font-size:14px;line-height:1.7;color:#a0a0a8;margin:0 0 8px;font-style:italic;">
            "Tester.io helped us catch critical issues before launch without slowing down our sprint cycle."
          </p>
          <p style="font-size:12px;color:#666;margin:0;font-weight:700;">— Head of Product, B2B SaaS Startup</p>
        </div>
        <div style="background:#1a1d24;border-left:3px solid #C6A559;padding:20px;margin-bottom:16px;border-radius:0 8px 8px 0;">
          <p style="font-size:14px;line-height:1.7;color:#a0a0a8;margin:0 0 8px;font-style:italic;">
            "We reduced release anxiety dramatically. Automated tests covered the basics, and human testers surfaced edge cases our scripts never would have found."
          </p>
          <p style="font-size:12px;color:#666;margin:0;font-weight:700;">— VP of Engineering, Fintech Company</p>
        </div>
        <div style="background:#1a1d24;border-left:3px solid #C6A559;padding:20px;margin-bottom:24px;border-radius:0 8px 8px 0;">
          <p style="font-size:14px;line-height:1.7;color:#a0a0a8;margin:0 0 8px;font-style:italic;">
            "Tester.io gave our lean team enterprise-style QA without needing to hire a full in-house testing department."
          </p>
          <p style="font-size:12px;color:#666;margin:0;font-weight:700;">— Founder, Early-stage Startup</p>
        </div>
        <div style="text-align:center;margin:32px 0;">
          <a href="https://tester.io" style="display:inline-block;background:linear-gradient(135deg,#C6A559,#E6B979);color:#0A0A0F;font-weight:700;font-size:14px;letter-spacing:0.08em;text-transform:uppercase;text-decoration:none;padding:14px 36px;border-radius:8px;">
            TRY IT FREE
          </a>
        </div>
        <p style="font-size:14px;line-height:1.7;color:#a0a0a8;">
          Want to see if Tester.io is right for your team? <strong style="color:#E6B979;">Reply with your biggest QA pain point</strong> and I'll show you exactly how we solve it.
        </p>
        <p style="font-size:14px;line-height:1.7;color:#a0a0a8;margin-top:16px;">Best,<br/><strong style="color:#fff;">The Tester.io Team</strong></p>
        <hr style="border:none;border-top:1px solid rgba(198,165,89,0.1);margin:32px 0 16px;" />
        <p style="font-size:11px;color:#555;text-align:center;">Tester.io — Human and Automated QA in One Place</p>
      </div>
    `,
  },
  {
    day: 15,
    subject: (name) => `${name}, new features you'll love`,
    html: (name) => `
      <div style="font-family:'Helvetica Neue',Arial,sans-serif;max-width:560px;margin:0 auto;background:#121419;color:#E8E8ED;padding:40px;border-radius:12px;">
        <div style="text-align:center;margin-bottom:32px;">
          <div style="font-size:28px;font-weight:800;color:#E6B979;">Tester.io</div>
        </div>
        <h1 style="font-size:22px;font-weight:800;margin-bottom:16px;color:#ffffff;">
          What's new at Tester.io
        </h1>
        <p style="font-size:15px;line-height:1.7;color:#a0a0a8;margin-bottom:24px;">
          Hey ${name}, we've been shipping fast. Here are the latest updates you might have missed:
        </p>
        <div style="margin-bottom:20px;">
          <p style="font-size:14px;margin:0 0 4px;"><strong style="color:#E6B979;">🔄 CI/CD Pipeline Integration</strong></p>
          <p style="font-size:13px;line-height:1.7;color:#a0a0a8;margin:0;">Run automated tests on every pull request. Works with GitHub Actions, GitLab CI, and Jenkins.</p>
        </div>
        <div style="margin-bottom:20px;">
          <p style="font-size:14px;margin:0 0 4px;"><strong style="color:#E6B979;">📱 Cross-Device Testing</strong></p>
          <p style="font-size:13px;line-height:1.7;color:#a0a0a8;margin:0;">Test across 50+ real devices and browsers. No more emulator surprises.</p>
        </div>
        <div style="margin-bottom:20px;">
          <p style="font-size:14px;margin:0 0 4px;"><strong style="color:#E6B979;">📊 Release Readiness Reports</strong></p>
          <p style="font-size:13px;line-height:1.7;color:#a0a0a8;margin:0;">One-click reports showing test coverage, open bugs, and risk assessment before every release.</p>
        </div>
        <div style="margin-bottom:24px;">
          <p style="font-size:14px;margin:0 0 4px;"><strong style="color:#E6B979;">🤝 Jira & Slack Integration</strong></p>
          <p style="font-size:13px;line-height:1.7;color:#a0a0a8;margin:0;">Bugs flow straight into Jira. Get notified in Slack when tests pass or fail.</p>
        </div>
        <div style="text-align:center;margin:32px 0;">
          <a href="https://tester.io" style="display:inline-block;background:linear-gradient(135deg,#C6A559,#E6B979);color:#0A0A0F;font-weight:700;font-size:14px;letter-spacing:0.08em;text-transform:uppercase;text-decoration:none;padding:14px 36px;border-radius:8px;">
            EXPLORE NEW FEATURES
          </a>
        </div>
        <p style="font-size:14px;line-height:1.7;color:#a0a0a8;">
          <strong style="color:#E6B979;">What feature matters most to you?</strong> Reply and let us know — we prioritize based on real feedback.
        </p>
        <p style="font-size:14px;line-height:1.7;color:#a0a0a8;margin-top:16px;">Cheers,<br/><strong style="color:#fff;">The Tester.io Team</strong></p>
        <hr style="border:none;border-top:1px solid rgba(198,165,89,0.1);margin:32px 0 16px;" />
        <p style="font-size:11px;color:#555;text-align:center;">Tester.io — Human and Automated QA in One Place</p>
      </div>
    `,
  },
];

// ===== Main Follow-up Logic =====
async function runFollowups() {
  console.log(`[${new Date().toISOString()}] Running follow-up check...`);

  // Get all contacts that haven't replied and aren't ignored
  const { data: contacts, error } = await supabase
    .from('contacts')
    .select('*')
    .eq('reply_status', 'pending')
    .order('submitted_at', { ascending: true });

  if (error) {
    console.error('Error fetching contacts:', error.message);
    return;
  }

  console.log(`Found ${contacts.length} pending contacts`);

  for (const contact of contacts) {
    const daysSinceSubmission = Math.floor(
      (Date.now() - new Date(contact.submitted_at).getTime()) / (1000 * 60 * 60 * 24)
    );

    // Find the right template based on days elapsed
    const template = templates.find(t => {
      const targetDay = t.day;
      // Send if we're on the target day (within a 1-day window)
      return daysSinceSubmission >= targetDay && daysSinceSubmission < targetDay + 1;
    });

    if (!template) continue;

    // Check if this follow-up was already sent
    const { data: existing } = await supabase
      .from('followup_log')
      .select('id')
      .eq('contact_id', contact.id)
      .eq('followup_day', template.day)
      .single();

    if (existing) continue;

    // Send the follow-up email
    const firstName = contact.name.split(' ')[0];
    try {
      const { data: emailData } = await resend.emails.send({
        from: 'Tester.io <onboarding@resend.dev>',
        to: contact.email,
        subject: template.subject(firstName),
        html: template.html(firstName),
      });

      // Log the follow-up in Supabase
      await supabase.from('followup_log').insert({
        contact_id: contact.id,
        email: contact.email,
        followup_day: template.day,
        email_id: emailData?.id || null,
        template_name: `day_${template.day}`,
      });

      await trackInteraction(contact.email, 'followup_sent', {
        contact_id: contact.id, day: template.day, email_id: emailData?.id,
      });

      console.log(`✓ Sent day-${template.day} follow-up to ${contact.email}`);
    } catch (err) {
      console.error(`✗ Failed to send follow-up to ${contact.email}:`, err.message);

      // Log the failure
      await supabase.from('followup_log').insert({
        contact_id: contact.id,
        email: contact.email,
        followup_day: template.day,
        template_name: `day_${template.day}`,
        status: 'failed',
        error_message: err.message,
      });
    }
  }

  // Also follow up with users who signed up but haven't engaged
  const { data: users, error: userError } = await supabase
    .from('users')
    .select('*')
    .eq('welcome_email_opened', false)
    .order('created_at', { ascending: true });

  if (!userError && users) {
    for (const user of users) {
      const daysSinceSignup = Math.floor(
        (Date.now() - new Date(user.created_at).getTime()) / (1000 * 60 * 60 * 24)
      );

      const template = templates.find(t =>
        daysSinceSignup >= t.day && daysSinceSignup < t.day + 1
      );

      if (!template) continue;

      const { data: existing } = await supabase
        .from('followup_log')
        .select('id')
        .eq('email', user.email)
        .eq('followup_day', template.day)
        .single();

      if (existing) continue;

      const firstName = user.name.split(' ')[0];
      try {
        const { data: emailData } = await resend.emails.send({
          from: 'Tester.io <onboarding@resend.dev>',
          to: user.email,
          subject: template.subject(firstName),
          html: template.html(firstName),
        });

        await supabase.from('followup_log').insert({
          email: user.email,
          followup_day: template.day,
          email_id: emailData?.id || null,
          template_name: `day_${template.day}_user`,
        });

        await trackInteraction(user.email, 'followup_sent', {
          day: template.day, email_id: emailData?.id, type: 'user',
        });

        console.log(`✓ Sent day-${template.day} user follow-up to ${user.email}`);
      } catch (err) {
        console.error(`✗ Failed user follow-up to ${user.email}:`, err.message);
      }
    }
  }

  console.log(`[${new Date().toISOString()}] Follow-up check complete.\n`);
}

// ===== Run Mode =====
// If run directly: execute once
// If imported: export for scheduling
if (require.main === module) {
  runFollowups().then(() => process.exit(0));
} else {
  module.exports = { runFollowups };
}
