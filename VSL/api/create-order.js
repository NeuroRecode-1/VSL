const { createClient } = require('@supabase/supabase-js');
const Razorpay = require('razorpay');

const AMOUNT = 14900;
const CURRENCY = 'INR';

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

function razorpayClient() {
  const key_id = process.env.RAZORPAY_KEY_ID;
  const key_secret = process.env.RAZORPAY_KEY_SECRET;
  if (!key_id || !key_secret) throw new Error('Missing Razorpay environment variables');
  return new Razorpay({ key_id, key_secret });
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    const body = readBody(req);
    const name = String(body.name || '').trim();
    const email = String(body.email || '').trim().toLowerCase();
    const phone = String(body.phone || '').trim();
    const city = String(body.city || '').trim();
    let leadId = body.leadId && body.leadId !== 'local-preview' ? body.leadId : null;

    if (name.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || phone.length < 10 || city.length < 2) {
      return res.status(400).json({ ok: false, error: 'Invalid checkout details' });
    }

    const supabase = supabaseAdmin();
    if (!leadId) {
      const { data: lead, error: leadError } = await supabase
        .from('leads')
        .insert({ name, mobile: phone.replace(/\D/g, '').slice(-10), email, source: 'Checkout Page' })
        .select('id')
        .single();
      if (leadError) throw leadError;
      leadId = lead.id;
    }

    const razorpay = razorpayClient();
    const order = await razorpay.orders.create({
      amount: AMOUNT,
      currency: CURRENCY,
      receipt: `nr_${Date.now()}`,
      notes: { lead_id: String(leadId), name, email, phone, city }
    });

    const { error: orderError } = await supabase
      .from('checkout_orders')
      .insert({
        lead_id: leadId,
        razorpay_order_id: order.id,
        amount: AMOUNT,
        currency: CURRENCY,
        status: 'created'
      });
    if (orderError) throw orderError;

    return res.status(200).json({
      ok: true,
      keyId: process.env.RAZORPAY_KEY_ID,
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      leadId
    });
  } catch (error) {
    console.error('Create order failed:', error);
    return res.status(500).json({ ok: false, error: 'Could not create order' });
  }
};
