import { createHmac, timingSafeEqual } from "node:crypto";
import type { Env } from "../shared/env.js";
import { AppError } from "../shared/errors.js";

/**
 * Minimal Cashfree Payment Gateway client (API version 2023-08-01), the
 * same calls the Events site uses: create an order, read it back, and
 * verify webhook signatures.
 */
const API_VERSION = "2023-08-01";

export interface CashfreeConfig {
  appId: string;
  secretKey: string;
  mode: "sandbox" | "production";
  baseUrl: string;
}

export function cashfreeConfig(env: Env): CashfreeConfig | null {
  if (!env.CASHFREE_APP_ID || !env.CASHFREE_SECRET_KEY) return null;
  const baseUrl = env.CASHFREE_API_BASE ?? (env.CASHFREE_ENV === "production" ? "https://api.cashfree.com/pg" : "https://sandbox.cashfree.com/pg");
  return { appId: env.CASHFREE_APP_ID, secretKey: env.CASHFREE_SECRET_KEY, mode: env.CASHFREE_ENV, baseUrl };
}

async function call<T>(config: CashfreeConfig, method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${config.baseUrl}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "x-client-id": config.appId,
      "x-client-secret": config.secretKey,
      "x-api-version": API_VERSION,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as T & { message?: string };
  if (!res.ok) throw new AppError("PAYMENT_GATEWAY_ERROR", `Cashfree: ${json.message ?? `HTTP ${res.status}`}`, 502);
  return json;
}

export interface CashfreeOrder {
  order_id: string;
  order_status: "ACTIVE" | "PAID" | "EXPIRED" | "TERMINATED" | "TERMINATION_REQUESTED";
  order_amount: number;
  payment_session_id?: string;
  cf_order_id?: string;
}

export function createOrder(
  config: CashfreeConfig,
  input: {
    orderId: string;
    amount: number;
    customer: { id: string; name: string | null; email: string; phone: string };
    returnUrl: string;
    notifyUrl: string | null;
    note?: string;
  },
) {
  return call<CashfreeOrder>(config, "POST", "/orders", {
    order_id: input.orderId,
    order_amount: input.amount,
    order_currency: "INR",
    customer_details: {
      customer_id: input.customer.id,
      customer_name: input.customer.name ?? undefined,
      customer_email: input.customer.email,
      customer_phone: input.customer.phone,
    },
    order_meta: { return_url: input.returnUrl, ...(input.notifyUrl ? { notify_url: input.notifyUrl } : {}) },
    order_note: input.note,
  });
}

export function getOrder(config: CashfreeConfig, orderId: string) {
  return call<CashfreeOrder>(config, "GET", `/orders/${encodeURIComponent(orderId)}`);
}

/** Webhook signature: base64 HMAC-SHA256 of timestamp + raw body, keyed with the secret key. */
export function verifyWebhookSignature(config: CashfreeConfig, rawBody: string, timestamp: string | undefined, signature: string | undefined) {
  if (!timestamp || !signature) return false;
  const expected = createHmac("sha256", config.secretKey).update(timestamp + rawBody).digest("base64");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Cashfree wants 10 digits for Indian numbers. */
export function normalisePhone(phone: string | null | undefined) {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (digits.length >= 10) return digits.slice(-10);
  return null;
}
