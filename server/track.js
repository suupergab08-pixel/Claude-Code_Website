const supabase = require('./supabase');

async function trackInteraction(email, eventType, details = {}, source = 'system') {
  try {
    await supabase.from('interactions').insert({
      email: email.toLowerCase(),
      event_type: eventType,
      details,
      source,
    });
  } catch (err) {
    console.error(`Track error [${eventType}]:`, err.message);
  }
}

module.exports = { trackInteraction };
