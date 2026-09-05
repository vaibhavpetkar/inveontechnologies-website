const PAYMENT_API_URL = import.meta.env.VITE_PAYMENT_API_URL as string | undefined;
const CASHFREE_MODE = (import.meta.env.VITE_CASHFREE_MODE as string) || 'sandbox';

declare global {
  interface Window {
    Cashfree?: (config: { mode: string }) => {
      checkout: (options: { paymentSessionId: string; redirectTarget?: string }) => Promise<void>;
    };
  }
}

export interface PaymentOrderRequest {
  amount: number;
  currency: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  roleId: string;
  candidateId: string;
}

export interface PaymentOrderResponse {
  orderId: string;
  paymentSessionId: string;
}

function loadCashfreeScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.Cashfree) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://sdk.cashfree.com/js/v3/cashfree.js';
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Cashfree SDK'));
    document.head.appendChild(script);
  });
}

export async function createPaymentOrder(data: PaymentOrderRequest): Promise<PaymentOrderResponse> {
  if (!PAYMENT_API_URL) {
    throw new Error(
      'Payment backend not configured. Set VITE_PAYMENT_API_URL in your .env file to your Cashfree order creation endpoint.',
    );
  }

  const res = await fetch(PAYMENT_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });

  if (!res.ok) {
    throw new Error(`Payment order creation failed (${res.status})`);
  }

  return res.json();
}

export async function initiateCashfreePayment(paymentSessionId: string): Promise<void> {
  await loadCashfreeScript();

  if (!window.Cashfree) {
    throw new Error('Cashfree SDK failed to initialize');
  }

  const cashfree = window.Cashfree({ mode: CASHFREE_MODE });
  await cashfree.checkout({
    paymentSessionId,
    redirectTarget: '_self',
  });
}

export function isPaymentConfigured(): boolean {
  return !!PAYMENT_API_URL;
}

export async function processInternshipPayment(data: PaymentOrderRequest): Promise<{ orderId: string }> {
  const order = await createPaymentOrder(data);
  await initiateCashfreePayment(order.paymentSessionId);
  return { orderId: order.orderId };
}
