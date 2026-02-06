const axios = require('axios');
const env = require('../config/env');
const PaymentIntent = require('../models/PaymentIntent');
const Invoice = require('../models/Invoice');
const WalletTransaction = require('../models/WalletTransaction');

const KHALTI_BASE_URL =
  env.khalti.env === 'production'
    ? 'https://khalti.com/api/v2'
    : 'https://dev.khalti.com/api/v2';

/**
 * Create Payment Intent
 */
async function createPaymentIntent({ userId, invoiceId, provider }) {
  const invoice = await Invoice.findOne({ _id: invoiceId, userId }).lean();
  if (!invoice) throw new Error('Invoice not found');

  const amountDue = Number(invoice.amountDue || 0);
  if (amountDue <= 0) throw new Error('Nothing to pay');

  // Khalti minimum = Rs 10 = 1000 paisa
  if (provider === 'KHALTI' && amountDue < 10) {
    throw new Error('Minimum Khalti payment is Rs. 10');
  }

  const intent = await PaymentIntent.create({
    userId,
    invoiceId,
    provider,
    amount: amountDue,
    status: 'CREATED'
  });

  if (provider === 'MOCK') {
    const paymentUrl = `${env.payment.mockBaseUrl}/mock/payments/${intent._id}`;
    await PaymentIntent.updateOne(
      { _id: intent._id },
      { $set: { status: 'INITIATED', paymentUrl } }
    );
    return await PaymentIntent.findById(intent._id).lean();
  }

  if (provider === 'KHALTI') {
    const payload = {
      return_url: `${process.env.BASE_URL}/api/payments/khalti/callback`,
      website_url: process.env.WEBSITE_URL,
      amount: Math.round(amountDue * 100), // paisa
      purchase_order_id: String(intent._id), // IMPORTANT: use PaymentIntent ID
      purchase_order_name: `Waste Bill ${invoice.month || ''}`,
      customer_info: {
        name: invoice.customerName || 'Customer',
        email: invoice.customerEmail || 'example@gmail.com',
        phone: invoice.customerPhone || '9800000001'
      }
    };

    // If Khalti not configured (dev mode)
    if (!env.khalti.secretKey) {
      await PaymentIntent.updateOne(
        { _id: intent._id },
        { $set: { status: 'INITIATED', providerPayload: payload } }
      );
      return await PaymentIntent.findById(intent._id).lean();
    }

    const { data } = await axios.post(
      `${KHALTI_BASE_URL}/epayment/initiate/`,
      payload,
      {
        headers: {
          Authorization: `Key ${env.khalti.secretKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      }
    );

    await PaymentIntent.updateOne(
      { _id: intent._id },
      {
        $set: {
          status: 'INITIATED',
          providerPayload: data,
          providerReference: data.pidx,
          paymentUrl: data.payment_url
        }
      }
    );

    return await PaymentIntent.findById(intent._id).lean();
  }

  throw new Error('Unsupported payment provider');
}

/**
 * Khalti Callback + Lookup Verification
 */
async function handleKhaltiCallback(pidx) {
  const intent = await PaymentIntent.findOne({ providerReference: pidx });
  if (!intent) throw new Error('PaymentIntent not found');

  const { data } = await axios.post(
    `${KHALTI_BASE_URL}/epayment/lookup/`,
    { pidx },
    {
      headers: {
        Authorization: `Key ${env.khalti.secretKey}`,
        'Content-Type': 'application/json'
      }
    }
  );

  // Only Completed = success
  if (data.status !== 'Completed') {
    await PaymentIntent.updateOne(
      { _id: intent._id },
      { $set: { status: data.status === 'User canceled' ? 'CANCELLED' : 'FAILED' } }
    );
    return { success: false, status: data.status };
  }

  // Mark intent PAID
  await PaymentIntent.updateOne(
    { _id: intent._id },
    {
      $set: {
        status: 'PAID',
        providerPayload: data
      }
    }
  );

  // Wallet debit
  await WalletTransaction.create({
    userId: intent.userId,
    type: 'DEBIT',
    amount: data.total_amount / 100,
    reason: 'INVOICE_PAYMENT',
    refType: 'PaymentIntent',
    refId: intent._id
  });

  // Mark invoice paid
  await Invoice.updateOne(
    { _id: intent.invoiceId },
    { $set: { status: 'PAID' } }
  );

  return { success: true, transactionId: data.transaction_id };
}

module.exports = {
  createPaymentIntent,
  handleKhaltiCallback
};
