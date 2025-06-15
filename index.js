import express from "express";
import cors from "cors";
import { PrismaClient } from "@prisma/client";
import Stripe from "stripe";
import dotenv from "dotenv";
dotenv.config();

const app = express();
const prisma = new PrismaClient();
const PORT = process.env.PORT || 5000;

app.use(cors());
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

async function checkEmailExistsInAnyModel(email) {
  const normalizedEmail = email.toLowerCase();
  const [company, selfEmployed] = await Promise.all([
    prisma.company.findUnique({ where: { business_email: normalizedEmail } }),
    prisma.selfEmployed.findUnique({ where: { business_email: normalizedEmail } }),
  ]);
  return company || selfEmployed;
}

async function activateUserByEmail(email) {
  const normalizedEmail = email.toLowerCase();
  try {
    const [company, selfEmployed] = await Promise.all([
      prisma.company.findUnique({ where: { business_email: normalizedEmail } }),
      prisma.selfEmployed.findUnique({ where: { business_email: normalizedEmail } }),
    ]);

    if (company) {
      await prisma.company.update({
        where: { business_email: normalizedEmail },
        data: { active: true },
      });
      console.log("✅ Company activated:", normalizedEmail);
    } else if (selfEmployed) {
      await prisma.selfEmployed.update({
        where: { business_email: normalizedEmail },
        data: { active: true },
      });
      console.log("✅ Self-employed activated:", normalizedEmail);
    } else {
      console.warn("❗No user found with email:", normalizedEmail);
    }
  } catch (error) {
    console.error("❌ Failed to activate user:", error);
  }
}

app.post("/webhook", express.raw({ type: 'application/json' }), (req, res) => {
  const sig = req.headers["stripe-signature"];
  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body.toString(),
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error(`❌ Webhook signature verification failed:`, err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  switch (event.type) {
    case "checkout.session.completed":
      const session = event.data.object;
      const email = session?.customer_details?.email;
      console.log("✅ Payment successful for:", email);
      activateUserByEmail(email);
      break;
    default:
      console.log(`Unhandled event type: ${event.type}`);
  }

  res.status(200).send("Webhook received");
});

app.use(express.json());

app.get("/", (req, res) => {
  res.send("Elementor Node backend is running ✅");
});

app.post("/api/company/signup", async (req, res) => {
  const data = req.body;
  data.business_email = data.business_email.toLowerCase();
  try {
    const exists = await checkEmailExistsInAnyModel(data.business_email);
    if (exists) {
      return res.status(409).json({
        success: false,
        message: "Email already exists. Please log in instead.",
      });
    }
    const company = await prisma.company.create({ data });
    return res.json({
      success: true,
      message: "Received company signup data",
      received: data,
      redirect: "/login",
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

app.post("/api/self-employed/signup", async (req, res) => {
  const data = req.body;
  data.business_email = data.business_email.toLowerCase();
  try {
    const exists = await checkEmailExistsInAnyModel(data.business_email);
    if (exists) {
      return res.status(409).json({
        success: false,
        message: "Email already exists. Please log in instead.",
      });
    }
    const user = await prisma.selfEmployed.create({ data });
    return res.json({
      success: true,
      message: "Received self-employed signup data",
      received: data,
      redirect: "/login",
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

app.post("/api/login", async (req, res) => {
  const business_email = req.body.business_email.toLowerCase();
  const { password } = req.body;

  try {
    const company = await prisma.company.findUnique({ where: { business_email } });
    if (company && company.password === password) {
      return res.json({
        success: true,
        message: "Company login successful",
        user: company,
        type: "company",
        redirect: "/profile",
      });
    }

    const selfEmployed = await prisma.selfEmployed.findUnique({ where: { business_email } });
    if (selfEmployed && selfEmployed.password === password) {
      return res.json({
        success: true,
        message: "Self-employed login successful",
        user: selfEmployed,
        type: "self-employed",
        redirect: "/profile",
      });
    }

    return res.status(401).json({
      success: false,
      message: "Invalid email or password",
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

app.post("/api/user/update", async (req, res) => {
  const business_email = req.body.business_email.toLowerCase();
  const { type, updates } = req.body;

  try {
    if (type === "company") {
      const updated = await prisma.company.update({
        where: { business_email },
        data: updates,
      });
      return res.json({ success: true, message: "Company profile updated", updated });
    }

    if (type === "self-employed") {
      const updated = await prisma.selfEmployed.update({
        where: { business_email },
        data: updates,
      });
      return res.json({ success: true, message: "Self-employed profile updated", updated });
    }

    return res.status(400).json({ success: false, message: "Invalid user type" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

app.get("/api/users", async (req, res) => {
  try {
    const companies = await prisma.company.findMany();
    const selfEmployed = await prisma.selfEmployed.findMany();
    return res.json({ success: true, message: "Fetched all users", companies, selfEmployed });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

app.get("/api/user/profile", async (req, res) => {
  const type = req.query.type;
  const business_email = String(req.query.business_email).toLowerCase();

  if (!type || !business_email) {
    return res.status(400).json({ success: false, message: "Missing required query parameters: type and business_email" });
  }

  try {
    if (type === "company") {
      const company = await prisma.company.findUnique({ where: { business_email } });
      if (!company) return res.status(404).json({ success: false, message: "Company not found" });
      return res.json({ success: true, type: "company", profile: company });
    }

    if (type === "self-employed") {
      const user = await prisma.selfEmployed.findUnique({ where: { business_email } });
      if (!user) return res.status(404).json({ success: false, message: "Self-employed user not found" });
      return res.json({ success: true, type: "self-employed", profile: user });
    }

    return res.status(400).json({ success: false, message: "Invalid type. Must be 'company' or 'self-employed'" });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: "Server error while fetching profile" });
  }
});

app.delete("/api/user/delete", async (req, res) => {
  const business_email = req.body.business_email.toLowerCase();
  const { type } = req.body;

  if (!business_email || !type) {
    return res.status(400).json({ success: false, message: "Missing required fields: business_email and type" });
  }

  try {
    if (type === "company") {
      const existing = await prisma.company.findUnique({ where: { business_email } });
      if (!existing) return res.status(404).json({ success: false, message: "Company not found" });
      await prisma.company.delete({ where: { business_email } });
      return res.json({ success: true, message: "Company account deleted successfully" });
    }

    if (type === "self-employed") {
      const existing = await prisma.selfEmployed.findUnique({ where: { business_email } });
      if (!existing) return res.status(404).json({ success: false, message: "Self-employed user not found" });
      await prisma.selfEmployed.delete({ where: { business_email } });
      return res.json({ success: true, message: "Self-employed account deleted successfully" });
    }

    return res.status(400).json({ success: false, message: "Invalid type. Must be 'company' or 'self-employed'" });
  } catch (error) {
    console.error("Delete error:", error);
    return res.status(500).json({ success: false, message: "Server error while deleting account" });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
