const { createClient } = require('@supabase/supabase-js');

function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') return JSON.parse(req.body || '{}');
  return {};
}

function supabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase environment variables');
  return createClient(url, key, { auth: { persistSession: false } });
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    const body = readBody(req);
    const name = String(body.name || '').trim();
    const mobile = String(body.mobile || '').replace(/\D/g, '').slice(0, 10);
    const email = String(body.email || '').trim().toLowerCase();
    const source = String(body.source || 'Index Page').trim();

    if (name.length < 2 || !/^\d{10}$/.test(mobile) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ ok: false, error: 'Invalid lead details' });
    }

    const { data, error } = await supabaseAdmin()
      .from('leads')
      .insert({ name, mobile, email, source })
      .select('id,name,mobile,email')
      .single();

    if (error) throw error;
    return res.status(200).json({ ok: true, lead: data });
  } catch (error) {
    console.error('Lead submit failed:', error);
    return res.status(500).json({ ok: false, error: 'Could not submit lead' });
  }
};
