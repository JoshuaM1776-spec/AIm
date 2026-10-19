// Aim Plus — Stripe's webhook (Supabase Edge Function "stripe-webhook", with JWT verification OFF:
// Stripe can't sign in; every request's Stripe signature is checked instead). Stripe tells this
// function about subscriptions, and the user's plan follows. Also serves the small pages Checkout
// and the customer portal return to. See billing.ts and supabase/README.md → Billing.

import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import { type BillingDb, handleStripeWebhook } from "../ai/billing.ts";

const env = (k: string) => Deno.env.get(k) ?? "";
const admin = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false, autoRefreshToken: false }
});

const billingDb: BillingDb = {
  async firstTime(eventId, type) {
    const { error } = await admin.from("billing_events").insert({ id: eventId, type });
    if (!error) return true;
    if (error.code === "23505") return false; // already applied
    throw new Error(error.message);
  },
  async linkCustomer(userId, customerId) {
    const { error } = await admin.from("profiles").update({ stripe_customer_id: customerId }).eq("id", userId);
    if (error) throw new Error(error.message);
  },
  async setPlanByCustomer(customerId, p) {
    const { data, error } = await admin.from("profiles").update({
      plan: p.plan, plan_status: p.status, plan_renews_at: p.renewsAt, plan_cancel_at_period_end: p.cancelAtPeriodEnd
    }).eq("stripe_customer_id", customerId).select("id");
    if (error) throw new Error(error.message);
    return (data || []).length > 0;
  }
};

Deno.serve(async req => {
  try {
    return await handleStripeWebhook(req, { webhookSecret: env("STRIPE_WEBHOOK_SECRET") }, billingDb);
  } catch (e) {
    console.error("stripe webhook failed", e);
    return new Response("Something went wrong.", { status: 500 }); // Stripe retries
  }
});
