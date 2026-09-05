/**
 * Example Cashfree order creation endpoint (Node.js/Express).
 * Deploy this as a serverless function or API route — NEVER expose Cashfree
 * secret keys in the frontend Vite bundle.
 *
 * Required env vars on the server:
 *   CASHFREE_APP_ID=your_app_id
 *   CASHFREE_SECRET_KEY=your_secret_key
 *   CASHFREE_ENV=sandbox  (or "production")
 */

/*
import express from 'express';

const app = express();
app.use(express.json());

app.post('/api/payments/create-order', async (req, res) => {
  const { amount, currency, customerName, customerEmail, customerPhone, roleId, candidateId } = req.body;

  const orderId = `inv_${candidateId}_${Date.now()}`;
  const baseUrl = process.env.CASHFREE_ENV === 'production'
    ? 'https://api.cashfree.com/pg'
    : 'https://sandbox.cashfree.com/pg';

  try {
    const response = await fetch(`${baseUrl}/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-client-id': process.env.CASHFREE_APP_ID!,
        'x-client-secret': process.env.CASHFREE_SECRET_KEY!,
        'x-api-version': '2023-08-01',
      },
      body: JSON.stringify({
        order_id: orderId,
        order_amount: amount,
        order_currency: currency || 'INR',
        customer_details: {
          customer_id: candidateId,
          customer_name: customerName,
          customer_email: customerEmail,
          customer_phone: customerPhone,
        },
        order_meta: {
          return_url: `${process.env.SITE_URL}/careers/payment/${roleId}?order_id={order_id}`,
        },
        order_note: `Inveon Internship - ${roleId}`,
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      return res.status(response.status).json({ error: data.message || 'Order creation failed' });
    }

    res.json({
      orderId: data.order_id,
      paymentSessionId: data.payment_session_id,
    });
  } catch (err) {
    res.status(500).json({ error: 'Payment service unavailable' });
  }
});

app.listen(3001, () => console.log('Payment API on :3001'));
*/

export {};
