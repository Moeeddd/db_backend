const pool = require("../config/db");

/* ── ADD VEHICLE ─────────────────────────────────────────── */
exports.addVehicle = async (req, res) => {
  const { type, registration_year, make, model, transmission, mileage, rent_per_day, photo } = req.body;
  if (!rent_per_day || rent_per_day <= 0)
    return res.status(400).json({ error: "rent_per_day is required and must be > 0" });
  try {
    await pool.query(
      `INSERT INTO Vehicle (type, registration_year, make, model, transmission, mileage, rent_per_day, photo)
       VALUES (?,?,?,?,?,?,?,?)`,
      [type, registration_year, make, model, transmission, mileage, rent_per_day, photo || null]
    );
    res.json({ message: "Vehicle added successfully" });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

/* ── REMOVE VEHICLE ──────────────────────────────────────── */
exports.removeVehicle = async (req, res) => {
  const { vehicle_id } = req.params;
  try {
    // Block if active/confirmed bookings exist
    const [activeBookings] = await pool.query(
      `SELECT booking_id FROM Rental_Booking
       WHERE vehicle_id = ? AND booking_status IN ('Pending','Confirmed')`,
      [vehicle_id]
    );
    if (activeBookings.length > 0)
      return res.status(400).json({ error: "Cannot remove vehicle — it has active bookings." });

    
    const [activePurchases] = await pool.query(
      `SELECT purchase_id FROM Purchases
       WHERE vehicle_id = ? AND status IN ('Pending','Confirmed')`,
      [vehicle_id]
    );
    if (activePurchases.length > 0)
      return res.status(400).json({ error: "Cannot remove vehicle — it has a pending purchase request. Cancel the purchase first." });

    // Check if vehicle is already sold (completed purchase exists)
    const [soldCheck] = await pool.query(
      `SELECT purchase_id FROM Purchases WHERE vehicle_id = ? AND status = 'Completed'`,
      [vehicle_id]
    );
    if (soldCheck.length > 0)
      return res.status(400).json({ error: "Cannot remove a sold vehicle — it exists in purchase history records." });

    await pool.query("DELETE FROM Vehicle WHERE id = ?", [vehicle_id]);
    res.json({ message: "Vehicle removed successfully" });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

/* ── ADD DRIVER ──────────────────────────────────────────── */
exports.addDriver = async (req, res) => {
  const { name, email, phone_number, address, license_number, password } = req.body;
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.query(
      `INSERT INTO Driver (name, email, phone_number, address, license_number) VALUES (?,?,?,?,?)`,
      [name, email, phone_number, address, license_number]
    );
    await connection.query(
      `INSERT INTO Users (name, role, email, password, hire_date) VALUES (?, 'Driver', ?, ?, CURDATE())`,
      [name, email, password]
    );
    await connection.commit();
    res.json({ message: "Driver added successfully" });
  } catch (err) {
    await connection.rollback();
    res.status(500).json({ error: err.message });
  } finally { connection.release(); }
};

/* ── REMOVE DRIVER ───────────────────────────────────────── */
exports.removeDriver = async (req, res) => {
  const { driver_id } = req.params;
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [active] = await connection.query(
      `SELECT booking_id FROM Rental_Booking WHERE driver_id = ? AND booking_status IN ('Pending','Confirmed')`,
      [driver_id]
    );
    if (active.length > 0) {
      await connection.rollback();
      return res.status(400).json({ error: "Cannot remove driver with active bookings." });
    }
    const [drv] = await connection.query("SELECT email FROM Driver WHERE driver_id = ?", [driver_id]);
    if (drv.length > 0)
      await connection.query("UPDATE Users SET isActive = FALSE WHERE email = ?", [drv[0].email]);
    await connection.query("DELETE FROM Driver WHERE driver_id = ?", [driver_id]);
    await connection.commit();
    res.json({ message: "Driver removed successfully" });
  } catch (err) {
    await connection.rollback();
    res.status(500).json({ error: err.message });
  } finally { connection.release(); }
};

/* ── CONFIRM BOOKING — requires payment first ────────────── */
exports.confirmBooking = async (req, res) => {
  const { booking_id } = req.body;
  try {
    const [payment] = await pool.query(
      "SELECT payment_id, isPaid FROM Payments WHERE booking_id = ?", [booking_id]
    );
    if (payment.length === 0 || !payment[0].isPaid)
      return res.status(400).json({ error: "Cannot confirm — customer has not completed payment yet." });
    await pool.query(
      "UPDATE Rental_Booking SET booking_status='Confirmed' WHERE booking_id=?", [booking_id]
    );
    res.json({ message: "Booking confirmed successfully" });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

/* ── SET PURCHASE PRICE ──────────────────────────────────── */
exports.setPurchasePrice = async (req, res) => {
  const { purchase_id, price } = req.body;
  if (!price || price <= 0)
    return res.status(400).json({ error: "A valid price is required." });
  try {
    await pool.query(
      "UPDATE Purchases SET price = ?, status = 'Confirmed' WHERE purchase_id = ?",
      [price, purchase_id]
    );
    res.json({ message: "Purchase price set. Customer can now proceed with payment." });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

/* ── COMPLETE PURCHASE — requires payment first ──────────── */
exports.completePurchase = async (req, res) => {
  const { purchase_id } = req.body;
  try {
    const [payment] = await pool.query(
      "SELECT payment_id, isPaid FROM Payments WHERE purchase_id = ? AND payment_type = 'Purchase'",
      [purchase_id]
    );
    if (payment.length === 0 || !payment[0].isPaid)
      return res.status(400).json({ error: "Cannot complete — customer has not completed payment yet." });
    await pool.query("UPDATE Purchases SET status='Completed' WHERE purchase_id=?", [purchase_id]);

    //mark vehicle as sold in case trigger didn't fire
    const [pur] = await pool.query("SELECT vehicle_id FROM Purchases WHERE purchase_id = ?", [purchase_id]);
    if (pur.length > 0) {
      await pool.query(
        "UPDATE Vehicle SET isAvailable = FALSE, isRented = FALSE WHERE id = ?",
        [pur[0].vehicle_id]
      );
    }
    res.json({ message: "Purchase completed. Vehicle marked as sold." });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

/* ── VIEW REPORTS ────────────────────────────────────────── */
exports.viewActiveBookings = async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT b.booking_id, b.booking_status, b.pickup_date, b.return_date, b.total_amount,
             c.customer_id, c.name AS customer_name, c.email AS customer_email, c.phone_number,
             v.id AS vehicle_id, CONCAT(v.make,' ',v.model) AS vehicle, v.rent_per_day, v.photo,
             d.name AS driver_name,
             p.isPaid, p.method AS payment_method, p.amount AS paid_amount
      FROM Rental_Booking b
      JOIN Customer c  ON b.customer_id = c.customer_id
      JOIN Vehicle  v  ON b.vehicle_id  = v.id
      LEFT JOIN Driver   d ON b.driver_id   = d.driver_id
      LEFT JOIN Payments p ON b.booking_id  = p.booking_id
      WHERE b.booking_status IN ('Pending','Confirmed')
      ORDER BY b.booking_id DESC
    `);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.viewInsuranceStatus = async (req, res) => {
  try { const [rows] = await pool.query("SELECT * FROM Vehicle_Insurance_Status"); res.json(rows); }
  catch (err) { res.status(500).json({ error: err.message }); }
};

exports.viewPaymentSummary = async (req, res) => {
  try { const [rows] = await pool.query("SELECT * FROM Customer_Payment_Summary"); res.json(rows); }
  catch (err) { res.status(500).json({ error: err.message }); }
};

exports.viewPaymentHistory = async (req, res) => {
  try { const [rows] = await pool.query("SELECT * FROM Payment_History"); res.json(rows); }
  catch (err) { res.status(500).json({ error: err.message }); }
};

exports.viewSoldVehicles = async (req, res) => {
  try { const [rows] = await pool.query("SELECT * FROM Sold_Vehicles"); res.json(rows); }
  catch (err) { res.status(500).json({ error: err.message }); }
};

exports.getAllCustomers = async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT c.customer_id, c.name, c.email, c.phone_number, c.address, c.license_number,
             COUNT(b.booking_id) AS total_bookings
      FROM Customer c
      LEFT JOIN Rental_Booking b ON c.customer_id = b.customer_id
      GROUP BY c.customer_id ORDER BY c.customer_id DESC
    `);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.getAllDrivers = async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT driver_id, name, email, phone_number, address, license_number, available FROM Driver ORDER BY driver_id DESC"
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.getAllVehicles = async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT * FROM Vehicle ORDER BY id DESC");
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.getPendingPurchases = async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT pur.purchase_id, pur.price, pur.date, pur.status,
             c.customer_id, c.name AS customer_name, c.email,
             CONCAT(v.make,' ',v.model) AS vehicle_name, v.id AS vehicle_id, v.photo,
             p.isPaid
      FROM Purchases pur
      JOIN Customer c ON pur.customer_id = c.customer_id
      JOIN Vehicle  v ON pur.vehicle_id  = v.id
      LEFT JOIN Payments p ON pur.purchase_id = p.purchase_id AND p.payment_type = 'Purchase'
      ORDER BY pur.purchase_id DESC
    `);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
};