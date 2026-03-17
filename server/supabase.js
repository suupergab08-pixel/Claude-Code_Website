const { createClient } = require('@supabase/supabase-js');

let _client;
const getClient = () => {
  if (!_client) {
    const url = (process.env.SUPABASE_URL || '').trim();
    const key = (process.env.SUPABASE_ANON_KEY || '').trim();
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
