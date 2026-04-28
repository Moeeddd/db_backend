const express = require("express");
const router = express.Router();
const paymentController = require("../controllers/paymentController");
const { verifyToken } = require("../middleware/authMiddleware");

router.post("/pay", verifyToken, paymentController.makePayment);

module.exports = router;