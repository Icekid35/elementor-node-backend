import express from "express";
import cors from "cors";
import { PrismaClient } from "@prisma/client";
import Stripe from "stripe";
// Raw body parser for Stripe webhook
import dotenv from "dotenv";
dotenv.config();

const app = express();
const prisma = new PrismaClient();
const PORT = process.env.PORT || 5000;

app.use(cors());
// Stripe webhook route needs raw body

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2023-08-16",
});

// === Helper: Check email in both models ===
async function checkEmailExistsInAnyModel(email) {
  const [company, selfEmployed] = await Promise.all([
    prisma.company.findUnique({ where: { business_email: email } }),
    prisma.selfEmployed.findUnique({ where: { business_email: email } }),
  ]);
  return company || selfEmployed;
}

async function activateUserByEmail(email) {
  try {
    const [company, selfEmployed] = await Promise.all([
      prisma.company.findUnique({ where: { business_email: email } }),
      prisma.selfEmployed.findUnique({ where: { business_email: email } }),
    ]);

    if (company) {
      await prisma.company.update({
        where: { business_email: email },
        data: { active: true },
      });
      console.log("✅ Company activated:", email);
    } else if (selfEmployed) {
      await prisma.selfEmployed.update({
        where: { business_email: email },
        data: { active: true },
      });
      console.log("✅ Self-employed activated:", email);
    } else {
      console.warn("❗No user found with email:", email);
    }
  } catch (error) {
    console.error("❌ Failed to activate user:", error);
  }
}

//  Symbol(kHeaders): {
//     host: 'elementor-node-backend.onrender.com',
//     'user-agent': 'Stripe/1.0 (+https://stripe.com/docs/webhooks)',
//     'content-length': '3530',
//     accept: '*/*; q=0.5, application/json',
//     'accept-encoding': 'gzip, br',
//     'cache-control': 'no-cache',
//     'cdn-loop': 'cloudflare; loops=1',
//     'cf-connecting-ip': '3.130.192.231',
//     'cf-ipcountry': 'US',
//     'cf-ray': '9502b2a82e0dcf7b-PDX',
//     'cf-visitor': '{"scheme":"https"}',
//     'content-type': 'application/json; charset=utf-8',
//     'render-proxy-ttl': '4',
//     'rndr-id': 'a3a9643b-e8ed-4726',
//     'stripe-signature': 't=1749997118,v1=2b94bcac51c2a4cc995dfc63f1f343f1528832843d1d2f72836c8d9482f22c7a,v0=0ffd5521ba854d3c22fa25d12665e34da7ba83a6708f7eacdf286bc3f21be9f7',
//     'true-client-ip': '3.130.192.231',
//     'x-forwarded-for': '3.130.192.231, 104.23.160.39, 10.214.214.53',
//     'x-forwarded-proto': 'https',
//     'x-request-start': '1749997118813065'
//   },
//   Symbol(kHeadersCount): 38,
//   Symbol(kTrailers): null,
//   Symbol(kTrailersCount): 0
// }
app.post("/webhook", express.raw({type: 'application/json'}), (req, res) => {
 console.log(req.headers)
  const sig = req.headers["stripe-signature"];
  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error(`❌ Webhook signature verification failed:`, err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // ✅ Handle Stripe events
  switch (event.type) {
    case "checkout.session.completed":
      const session = event.data.object;

      // You can attach metadata to the session to identify users
      const email = session?.customer_details?.email;

      console.log("✅ Payment successful for:", email);

      // Example: Activate the user
      activateUserByEmail(email);
      break;

    default:
      console.log(`Unhandled event type: ${event.type}`);
  }

  res.status(200).send("Webhook received");
});
app.use(express.json()); // All other routes use JSON

// === Health Check ===
app.get("/", (req, res) => {
  res.send("Elementor Node backend is running ✅");
});

// === Company Signup ===
app.post("/api/company/signup", async (req, res) => {
  const data = req.body;
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

// === Self-Employed Signup ===
app.post("/api/self-employed/signup", async (req, res) => {
  const data = req.body;
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

// === Login ===
app.post("/api/login", async (req, res) => {
  const { business_email, password } = req.body;

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

// === Update Profile ===
app.post("/api/user/update", async (req, res) => {
  const { business_email, type, updates } = req.body;

  try {
    if (type === "company") {
      const updated = await prisma.company.update({
        where: { business_email },
        data: updates,
      });
      return res.json({
        success: true,
        message: "Company profile updated",
        updated,
      //   redirect: "/profile",
      });
    }

    if (type === "self-employed") {
      const updated = await prisma.selfEmployed.update({
        where: { business_email },
        data: updates,
      });
      return res.json({
        success: true,
        message: "Self-employed profile updated",
        updated,
      //   redirect: "/profile",
      });
    }

    return res.status(400).json({
      success: false,
      message: "Invalid user type",
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// === Get All Users Grouped ===
app.get("/api/users", async (req, res) => {
  try {
    const companies = await prisma.company.findMany();
    const selfEmployed = await prisma.selfEmployed.findMany();

    return res.json({
      success: true,
      message: "Fetched all users",
      companies,
      selfEmployed,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// === Get Profile by Type & Email ===
app.get("/api/user/profile", async (req, res) => {
  const { type, business_email } = req.query;

  if (!type || !business_email) {
    return res.status(400).json({
      success: false,
      message: "Missing required query parameters: type and business_email",
    });
  }

  try {
    if (type === "company") {
      const company = await prisma.company.findUnique({
        where: { business_email: String(business_email) },
      });

      if (!company) {
        return res.status(404).json({
          success: false,
          message: "Company not found",
        });
      }

      return res.json({
        success: true,
        type: "company",
        profile: company,
      });
    }

    if (type === "self-employed") {
      const user = await prisma.selfEmployed.findUnique({
        where: { business_email: String(business_email) },
      });

      if (!user) {
        return res.status(404).json({
          success: false,
          message: "Self-employed user not found",
        });
      }

      return res.json({
        success: true,
        type: "self-employed",
        profile: user,
      });
    }

    return res.status(400).json({
      success: false,
      message: "Invalid type. Must be 'company' or 'self-employed'",
    });

  } catch (error) {
    console.error(error);
    return res.status(500).json({
      success: false,
      message: "Server error while fetching profile",
    });
  }
});

// === Delete Account ===
app.delete("/api/user/delete", async (req, res) => {
  const { business_email, type } = req.body;

  if (!business_email || !type) {
    return res.status(400).json({
      success: false,
      message: "Missing required fields: business_email and type",
    });
  }

  try {
    if (type === "company") {
      const existing = await prisma.company.findUnique({ where: { business_email } });
      if (!existing) {
        return res.status(404).json({ success: false, message: "Company not found" });
      }

      await prisma.company.delete({ where: { business_email } });
      return res.json({
        success: true,
        message: "Company account deleted successfully",
      });
    }

    if (type === "self-employed") {
      const existing = await prisma.selfEmployed.findUnique({ where: { business_email } });
      if (!existing) {
        return res.status(404).json({ success: false, message: "Self-employed user not found" });
      }

      await prisma.selfEmployed.delete({ where: { business_email } });
      return res.json({
        success: true,
        message: "Self-employed account deleted successfully",
      });
    }

    return res.status(400).json({
      success: false,
      message: "Invalid type. Must be 'company' or 'self-employed'",
    });
  } catch (error) {
    console.error("Delete error:", error);
    return res.status(500).json({ success: false, message: "Server error while deleting account" });
  }
});
// === Start Server ===
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
