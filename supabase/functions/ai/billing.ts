// Aim Plus billing, with Stripe. Two halves:
//   - In the "ai" function (handler.ts): billing-checkout and billing-portal, for a signed-in user.
//     They return a Stripe page to open: Checkout to subscribe, the customer portal to manage or
//     cancel. Card details only ever go to Stripe.
//   - The "stripe-webhook" function: Stripe tells Aim's server about subscriptions, and the user's
//     plan follows (handleStripeWebhook). Every event's signature is checked first, and each event is
//     applied once.
// Plain fetch and Web Crypto, no Stripe SDK, so this runs in Deno (Supabase) and in Node (tests).

export type Plan = "free" | "plus";

// Paying (or about to be): Plus. past_due keeps Plus while Stripe retries the card; Stripe ends
// the subscription (and this sets Free) if retries fail.
export function planForStatus(status: string): Plan {
  return ["active", "trialing", "past_due"].includes(status) ? "plus" : "free";
}

export interface BillingConfig {
  secretKey: string;          // STRIPE_SECRET_KEY (server only)
  webhookSecret: string;      // STRIPE_WEBHOOK_SECRET, from the webhook endpoint in Stripe
  pricePlus: string;          // STRIPE_PRICE_PLUS, the Plus price's id (price_…)
  publicUrl: string;          // this project's functions URL, for the pages Stripe returns to
}

// ---------- Stripe's API ----------
// Stripe takes form-encoded bodies with bracketed keys: line_items[0][price]=…
function form(obj: Record<string, unknown>, prefix = "", out = new URLSearchParams()): URLSearchParams {
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (typeof v === "object") form(v as Record<string, unknown>, key, out);
    else out.append(key, String(v));
  }
  return out;
}

export type StripeFetch = (path: string, body: Record<string, unknown>) => Promise<Record<string, unknown>>;
export function stripeApi(secretKey: string, fetcher: typeof fetch = fetch): StripeFetch {
  return async (path, body) => {
    const res = await fetcher(`https://api.stripe.com/v1/${path}`, {
      method: "POST", body: form(body),
      headers: { Authorization: `Bearer ${secretKey}`, "Content-Type": "application/x-www-form-urlencoded" }
    });
    const data = await res.json() as Record<string, unknown>;
    if (!res.ok) throw new Error(`stripe ${path}: ${(data.error as { message?: string })?.message || res.status}`);
    return data;
  };
}

// Checkout for Plus: a subscription to the Plus price, tied to this user, reusing their Stripe
// customer if they had one.
export async function checkoutUrl(stripe: StripeFetch, cfg: BillingConfig, user: { id: string; email?: string }, customerId: string | null) {
  const s = await stripe("checkout/sessions", {
    mode: "subscription",
    line_items: { 0: { price: cfg.pricePlus, quantity: 1 } },
    client_reference_id: user.id,
    ...(customerId ? { customer: customerId } : { customer_email: user.email }),
    subscription_data: { metadata: { aim_user: user.id } },
    allow_promotion_codes: "true",
    success_url: `${cfg.publicUrl}/stripe-webhook?page=done`,
    cancel_url: `${cfg.publicUrl}/stripe-webhook?page=cancel`
  });
  return String(s.url);
}

export async function portalUrl(stripe: StripeFetch, cfg: BillingConfig, customerId: string) {
  const s = await stripe("billing_portal/sessions", { customer: customerId, return_url: `${cfg.publicUrl}/stripe-webhook?page=back` });
  return String(s.url);
}

// ---------- the webhook ----------
const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
function sameString(a: string, b: string) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

// Stripe-Signature: "t=<unix seconds>,v1=<hex HMAC-SHA256 of `${t}.${payload}`>[,v1=…]". Old
// timestamps are refused, so a captured request can't be replayed later.
export async function verifyStripeSignature(payload: string, header: string, secret: string, nowMs: number, toleranceSec = 300): Promise<boolean> {
  const items = header.split(",").map(p => p.trim().split("="));
  const t = items.find(([k]) => k === "t")?.[1];
  const sigs = items.filter(([k]) => k === "v1").map(([, v]) => v);
  if (!t || !sigs.length || !secret) return false;
  if (Math.abs(nowMs / 1000 - Number(t)) > toleranceSec) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const expected = hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${t}.${payload}`)));
  return sigs.some(s => sameString(s, expected));
}

export interface BillingDb {
  firstTime(eventId: string, type: string): Promise<boolean>;            // records the event; false if seen before
  linkCustomer(userId: string, customerId: string): Promise<void>;
  setPlanByCustomer(customerId: string, p: { plan: Plan; status: string; renewsAt: string | null; cancelAtPeriodEnd: boolean }): Promise<boolean>;
}

// The end of the paid period: on the subscription (older API versions) or on its item (newer ones).
function periodEnd(sub: Record<string, unknown>): string | null {
  const items = (sub.items as { data?: Array<{ current_period_end?: number }> } | undefined)?.data;
  const end = (sub.current_period_end as number | undefined) ?? items?.[0]?.current_period_end;
  return end ? new Date(end * 1000).toISOString() : null;
}

export async function handleStripeEvent(event: Record<string, unknown>, db: BillingDb): Promise<string> {
  const type = String(event.type || ""), obj = ((event.data as { object?: Record<string, unknown> })?.object) || {};
  if (!(await db.firstTime(String(event.id || ""), type))) return "duplicate";
  if (type === "checkout.session.completed") {
    const userId = String(obj.client_reference_id || ""), customer = String(obj.customer || "");
    if (!userId || !customer) return "ignored";
    await db.linkCustomer(userId, customer);
    // Plus now; the subscription's own events keep it current from here.
    if (obj.mode === "subscription" && obj.payment_status !== "unpaid")
      await db.setPlanByCustomer(customer, { plan: "plus", status: "active", renewsAt: null, cancelAtPeriodEnd: false });
    return "linked";
  }
  if (type.startsWith("customer.subscription.")) {
    const customer = String(obj.customer || "");
    const status = type === "customer.subscription.deleted" ? "canceled" : String(obj.status || "");
    if (!customer || !status) return "ignored";
    const applied = await db.setPlanByCustomer(customer, { plan: planForStatus(status), status, renewsAt: periodEnd(obj), cancelAtPeriodEnd: obj.cancel_at_period_end === true });
    return applied ? `plan ${planForStatus(status)}` : "unknown customer";
  }
  return "ignored";
}

const PAGES: Record<string, [string, string]> = {
  done: ["You're on Aim Plus", "Thanks for subscribing. Go back to Aim: your Plus features are on now (reopen Settings if it still says Free)."],
  cancel: ["No changes made", "You didn't subscribe, and you haven't been charged. You can close this tab."],
  back: ["All set", "Your subscription changes are saved. You can close this tab and go back to Aim."]
};
function page(kind: string): Response {
  const [title, text] = PAGES[kind] || PAGES.back;
  return new Response(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>` +
    `<body style="font:16px/1.5 system-ui,sans-serif;background:#f7f3ec;color:#16231e;display:grid;place-items:center;min-height:90vh;margin:0">` +
    `<main style="max-width:460px;padding:24px;text-align:center"><h1 style="font-size:24px">${title}</h1><p>${text}</p></main></body>`,
    { headers: { "Content-Type": "text/html; charset=utf-8" } });
}

// The webhook function: GET serves the small pages Checkout and the portal return to; POST is a
// Stripe event, verified, then applied.
export async function handleStripeWebhook(req: Request, cfg: Pick<BillingConfig, "webhookSecret">, db: BillingDb, now = Date.now()): Promise<Response> {
  if (req.method === "GET") return page(new URL(req.url).searchParams.get("page") || "back");
  if (req.method !== "POST") return new Response("Use POST.", { status: 405 });
  const payload = await req.text();
  if (!(await verifyStripeSignature(payload, req.headers.get("Stripe-Signature") || "", cfg.webhookSecret, now)))
    return new Response("Bad signature.", { status: 400 });
  let event: Record<string, unknown>;
  try { event = JSON.parse(payload); } catch { return new Response("Bad JSON.", { status: 400 }); }
  const result = await handleStripeEvent(event, db);
  return new Response(JSON.stringify({ received: true, result }), { headers: { "Content-Type": "application/json" } });
}
