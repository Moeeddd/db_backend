const express = require("express");
const cors = require("cors");
require("dotenv").config();
const listEndpoints = require("express-list-endpoints");

const app = express();

// Secure CORS Configuration
const corsOptions = {
  // Allow requests from your Vercel URL (production) or localhost (development)
  origin: process.env.FRONTEND_URL || "http://localhost:3000", 
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
  credentials: true, // Allow cookies or authorization headers if needed
};

app.use(cors(corsOptions));
app.use(express.json());

app.use("/api/auth", require("./routes/authRoutes"));
app.use("/api/admin", require("./routes/adminRoutes"));
app.use("/api/customer", require("./routes/customerRoutes"));
app.use("/api/driver", require("./routes/driverRoutes"));
app.use("/api/payment", require("./routes/paymentRoutes"));

const PORT = process.env.PORT || 5000;

console.log("Loaded PORT:", PORT);

app.listen(PORT, () => {
  console.log("Server running on port " + PORT);

  console.log("Available APIs:");
  console.table(listEndpoints(app));
});
