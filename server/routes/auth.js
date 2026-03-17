const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const supabase = require('../supabase');
const { sendWelcomeEmail } = require('../email');
const { trackInteraction } = require('../track');

function generateToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
}

// POST /api/auth/signup — Create account
router.post('/signup', async (req, res) => {
  try {
    const { name, email, password, newsletter_subscribed } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const { data, error } = await supabase
      .from('users')
      .insert({
        name,
        email: email.toLowerCase(),
        password: hashedPassword,
        newsletter_subscribed: newsletter_subscribed || false,
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return res.status(409).json({ error: 'Email already registered' });
      }
      console.error('Signup error:', error.message);
      return res.status(500).json({ error: 'Server error' });
    }

    const token = generateToken(data);

    // Track signup
    await trackInteraction(data.email, 'signup', { user_id: data.id, name });

    // Send welcome email and store email ID
    const emailId = await sendWelcomeEmail({ name, email: data.email });
    if (emailId) {
      await supabase.from('users').update({ email_id: emailId }).eq('id', data.id);
      await trackInteraction(data.email, 'email_sent', { email_id: emailId, type: 'welcome' });
    }

    // If user opted into newsletter, add to newsletter table
    if (newsletter_subscribed) {
      await supabase
        .from('newsletter')
        .upsert({ email: data.email }, { onConflict: 'email' });
      await trackInteraction(data.email, 'newsletter_subscribed', { source: 'signup' });
    }

    res.status(201).json({
      status: 'success',
      token,
      user: { id: data.id, name: data.name, email: data.email }
    });
  } catch (err) {
    console.error('Signup error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/auth/login — Sign in
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', email.toLowerCase())
      .single();

    if (error || !user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = generateToken(user);

    await trackInteraction(user.email, 'login', { user_id: user.id });

    res.json({
      status: 'success',
      token,
      user: { id: user.id, name: user.name, email: user.email }
    });
  } catch (err) {
    console.error('Login error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/auth/me — Get current user (requires token)
router.get('/me', require('../middleware/auth'), async (req, res) => {
  try {
    const { data: user, error } = await supabase
      .from('users')
      .select('id, name, email, created_at')
      .eq('id', req.userId)
      .single();

    if (error || !user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
