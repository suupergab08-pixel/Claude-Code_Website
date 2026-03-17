const { createClient } = require('@supabase/supabase-js');

let _client;
const getClient = () => {
  if (!_client) {
    _client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
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
