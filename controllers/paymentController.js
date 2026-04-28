const pool = require("../config/db");

exports.makePayment = async (req, res) => {
  const { booking_id, purchase_id, amount, method } = req.body;

  try {
    await pool.query(
      `INSERT INTO Payments
      (booking_id, purchase_id, payment_type, amount, method, isPaid)
      VALUES (?, ?, ?, ?, ?, TRUE)`,
      [
        booking_id,
        purchase_id,
        booking_id ? "Booking" : "Purchase",
        amount,
        method
      ]
    );

    res.json({ message: "Payment successful" });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};