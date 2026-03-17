const { createClient } = require('@supabase/supabase-js');

let _client;
const getClient = () => {
  if (!_client) {
    let url = (process.env.SUPABASE_URL || '').trim();
    const key = (process.env.SUPABASE_ANON_KEY || '').trim();
    // Auto-correct if only project ref ID was entered instead of full URL
    if (url && !url.startsWith('http')) {
      url = `https://${url}.supabase.co`;
    }
    _client = createClient(url, key);
  }
  return _client;
};

const supabase = new Proxy({}, {
  get(_, prop) {
    const val = getClient()[prop];
    return typeof val === 'function' ? val.bind(getClient()) : val;
  }
});

module.exports = supabase;
