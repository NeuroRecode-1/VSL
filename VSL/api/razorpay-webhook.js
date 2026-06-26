const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function supabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase environment variables');
  return createClient(url, key, { auth: { persistSession: false } });
}

function verifyWebhook(rawBody, signature) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) throw new Error('Missing Razorpay webhook secret');
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
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
    const rawBody = await readRawBody(req);
    const signature = req.headers['x-razorpay-signature'];
    if (!verifyWebhook(rawBody, signature)) {
      return res.status(400).json({ ok: false, error: 'Invalid webhook signature' });
    }

    const event = JSON.parse(rawBody);
    const payment = event.payload && event.payload.payment && event.payload.payment.entity;
    const orderId = payment && payment.order_id;
    const paymentId = payment && payment.id;
    const status = event.event === 'payment.captured' ? 'paid' : event.event;

    if (orderId) {
      await supabaseAdmin()
        .from('checkout_orders')
        .update({ status })
        .eq('razorpay_order_id', orderId);
    }

    if (paymentId) {
      await supabaseAdmin()
        .from('payments')
        .update({ status })
        .eq('razorpay_payment_id', paymentId);
    }

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('Webhook handling failed:', error);
    return res.status(500).json({ ok: false, error: 'Webhook failed' });
  }
};
