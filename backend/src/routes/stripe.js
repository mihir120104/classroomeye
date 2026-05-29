const express = require("express");
const User = require("../models/User");
const { requireAuth } = require("../middleware/auth");
const logger = require("../utils/logger");

let stripeClient = null;
function getStripe() {
  if (!stripeClient) stripeClient = require("stripe")(process.env.STRIPE_SECRET_KEY);
  return stripeClient;
}

const router = express.Router();

router.post("/checkout", requireAuth, async (req, res) => {
  const stripe = getStripe();
  const user = req.user;
  try {
    let customerId = user.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({ email: user.email, metadata: { userId: String(user._id) } });
      customerId = customer.id;
      await User.findByIdAndUpdate(user._id, { stripeCustomerId: customerId });
    }
    const session = await stripe.checkout.sessions.create({
      customer: customerId, mode: "subscription", payment_method_types: ["card"],
      line_items: [{ price: process.env.STRIPE_PRICE_ID, quantity: 1 }],
      success_url: `${process.env.FRONTEND_URL}/dashboard?payment=success`,
      cancel_url: `${process.env.FRONTEND_URL}/pricing?payment=canceled`,
      allow_promotion_codes: true,
      subscription_data: { metadata: { userId: String(user._id) } },
    });
    res.json({ url: session.url });
  } catch (err) {
    logger.error("Stripe checkout error:", err);
    res.status(500).json({ error: "Could not create checkout session" });
  }
});

router.post("/portal", requireAuth, async (req, res) => {
  const stripe = getStripe();
  if (!req.user.stripeCustomerId) return res.status(400).json({ error: "No billing account found" });
  try {
    const session = await stripe.billingPortal.sessions.create({ customer: req.user.stripeCustomerId, return_url: `${process.env.FRONTEND_URL}/dashboard` });
    res.json({ url: session.url });
  } catch (err) {
    logger.error("Stripe portal error:", err);
    res.status(500).json({ error: "Could not open billing portal" });
  }
});

router.post("/webhook", express.raw({ type: "application/json" }), async (req, res) => {
  const stripe = getStripe();
  const sig = req.headers["stripe-signature"];
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    logger.warn("Webhook signature invalid:", err.message);
    return res.status(400).json({ error: "Webhook verification failed" });
  }
  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const s = event.data.object;
        if (s.mode !== "subscription") break;
        const userId = s.metadata?.userId;
        if (!userId) break;
        await User.findByIdAndUpdate(userId, { plan: "paid", subscriptionStatus: "active", stripeSubscriptionId: s.subscription });
        break;
      }
      case "customer.subscription.updated": {
        const sub = event.data.object;
        const user = await User.findOne({ stripeCustomerId: sub.customer });
        if (!user) break;
        const status = sub.status === "active" ? "active" : sub.status === "past_due" ? "past_due" : "canceled";
        const update = { subscriptionStatus: status };
        if (status === "active") update.plan = "paid";
        await User.findByIdAndUpdate(user._id, update);
        break;
      }
      case "customer.subscription.deleted": {
        const sub = event.data.object;
        const user = await User.findOne({ stripeCustomerId: sub.customer });
        if (!user) break;
        await User.findByIdAndUpdate(user._id, { plan: "free", subscriptionStatus: "canceled", stripeSubscriptionId: null, paidUntil: new Date(sub.current_period_end * 1000) });
        break;
      }
      case "invoice.payment_failed": {
        const invoice = event.data.object;
        const user = await User.findOne({ stripeCustomerId: invoice.customer });
        if (user) await User.findByIdAndUpdate(user._id, { subscriptionStatus: "past_due" });
        break;
      }
      default: break;
    }
  } catch (err) { logger.error("Webhook handler error:", err); }
  res.json({ received: true });
});

module.exports = router;
