const crypto = require('crypto');
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

function verifySignature(orderId, paymentId, signature) {
  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!secret) throw new Error('Missing Razorpay secret');
  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');
  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(String(signature || ''));
  return expectedBuffer.length === receivedBuffer.length && crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    const body = readBody(req);
    const orderId = String(body.razorpay_order_id || '');
    const paymentId = String(body.razorpay_payment_id || '');
    const signature = String(body.razorpay_signature || '');

    if (!orderId || !paymentId || !signature || !verifySignature(orderId, paymentId, signature)) {
      return res.status(400).json({ ok: false, error: 'Invalid payment signature' });
    }

    const supabase = supabaseAdmin();
    const payment = {
      lead_id: body.leadId && body.leadId !== 'local-preview' ? body.leadId : null,
      razorpay_order_id: orderId,
      razorpay_payment_id: paymentId,
      razorpay_signature: signature,
      status: 'paid',
      paid_at: new Date().toISOString()
    };

    const { error: paymentError } = await supabase.from('payments').insert(payment);
    if (paymentError) throw paymentError;

    await supabase
      .from('checkout_orders')
      .update({ status: 'paid' })
      .eq('razorpay_order_id', orderId);

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('Payment verification failed:', error);
    return res.status(500).json({ ok: false, error: 'Could not verify payment' });
  }
};
