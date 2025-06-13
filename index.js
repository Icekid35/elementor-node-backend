import express from "express";
import cors from "cors";

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors()); // allow cross-origin requests
app.use(express.json()); // parse JSON bodies

// Health check
app.get("/", (req, res) => {
  res.send("Elementor Node backend is running ✅");
});

// Example route for self-employed signup
app.post("/api/self-employed/signup", (req, res) => {
  console.log("Self-Employed Signup Data:", req.body);
  return res.json({
    success: true,
    message: "Received self-employed signup data",
    received: req.body,
    redirect: "/dashboard"
  });
});

// Example route for company signup
app.post("/api/company/signup", (req, res) => {
  console.log("Company Signup Data:", req.body);
  return res.json({
    success: true,
    message: "Received company signup data",
    received: req.body,
    redirect: "/dashboard"
  });
});

// Example route for login
app.post("/api/login", (req, res) => {
  console.log("Login Data:", req.body);
  return res.json({
    success: true,
    message: "Login request received",
    received: req.body,
    redirect: "/dashboard"
  });
});

// Example route for profile update
app.post("/api/user/update", (req, res) => {
  console.log("Update Profile Data:", req.body);
  return res.json({
    success: true,
    message: "Profile update data received",
    received: req.body,
    redirect: "/profile"
  });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
