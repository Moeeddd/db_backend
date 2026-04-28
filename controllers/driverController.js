const pool = require("../config/db");

/* =========================
   VIEW MY BOOKINGS
========================= */
exports.myBookings = async (req, res) => {
  const driverEmail = req.user.email;

  const [driver] = await pool.query(
    "SELECT driver_id FROM Driver WHERE email=?",
    [driverEmail]
  );

  if (driver.length === 0)
    return res.status(400).json({ message: "Driver not found" });

  const driver_id = driver[0].driver_id;

  const [bookings] = await pool.query(
    "SELECT * FROM Rental_Booking WHERE driver_id=?",
    [driver_id]
  );

  res.json(bookings);
};

/* =========================
   UPDATE BOOKING STATUS
========================= */
exports.updateBookingStatus = async (req, res) => {
  const { booking_id, status } = req.body;

  await pool.query(
    "UPDATE Rental_Booking SET booking_status=? WHERE booking_id=?",
    [status, booking_id]
  );

  res.json({ message: "Status updated" });
};