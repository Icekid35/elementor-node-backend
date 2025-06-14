import express from "express";
import cors from "cors";
import { PrismaClient } from "@prisma/client";

const app = express();
const prisma = new PrismaClient();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// === Helper: Check email in both models ===
async function checkEmailExistsInAnyModel(email) {
  const [company, selfEmployed] = await Promise.all([
    prisma.company.findUnique({ where: { business_email: email } }),
    prisma.selfEmployed.findUnique({ where: { business_email: email } }),
  ]);
  return company || selfEmployed;
}

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
      redirect: "/dashboard",
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
      redirect: "/dashboard",
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
        redirect: "/login",
      });
    }

    const selfEmployed = await prisma.selfEmployed.findUnique({ where: { business_email } });
    if (selfEmployed && selfEmployed.password === password) {
      return res.json({
        success: true,
        message: "Self-employed login successful",
        user: selfEmployed,
        type: "self-employed",
        redirect: "/login",
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
        redirect: "/profile",
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
        redirect: "/profile",
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

// === Start Server ===
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
