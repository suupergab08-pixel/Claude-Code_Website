const { createClient } = require('@supabase/supabase-js');

let _client;
const supabase = new Proxy({}, {
  get(_, prop) {
    if (!_client) {
      _client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
    }
    return _client[prop];
  }
});

module.exports = supabase;
