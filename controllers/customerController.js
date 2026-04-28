const pool = require("../config/db");

/* ── AVAILABLE VEHICLES ──────────────────────────────────── */
exports.getAvailableVehicles = async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, type, registration_year, make, model, transmission, mileage, rent_per_day, photo
       FROM Vehicle WHERE isAvailable = TRUE ORDER BY make, model`
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
};

/* ── AVAILABLE DRIVERS ───────────────────────────────────── */
exports.getAvailableDrivers = async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT driver_id, name, phone_number, address FROM Driver WHERE available = TRUE ORDER BY name`
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
};

/* ── CREATE BOOKING ──────────────────────────────────────── */
exports.createBooking = async (req, res) => {
  const customer_id = req.user.entityId;
  if (!customer_id)
    return res.status(400).json({ error: "Customer profile not linked to this account." });

  const { vehicle_id, driver_id, pickup_date, return_date } = req.body;

  if (new Date(return_date) <= new Date(pickup_date))
    return res.status(400).json({ error: "Return date must be after pickup date." });

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [veh] = await connection.query(
      "SELECT rent_per_day, isAvailable FROM Vehicle WHERE id = ?", [vehicle_id]
    );
    if (veh.length === 0) { await connection.rollback(); return res.status(404).json({ error: "Vehicle not found." }); }
    if (!veh[0].isAvailable) { await connection.rollback(); return res.status(400).json({ error: "Vehicle is no longer available." }); }

    const days = Math.ceil((new Date(return_date) - new Date(pickup_date)) / (1000 * 60 * 60 * 24));
    const total_amount = days * veh[0].rent_per_day;

    const [result] = await connection.query(
      `INSERT INTO Rental_Booking
       (customer_id, vehicle_id, driver_id, booking_status, pickup_date, return_date, total_amount)
       VALUES (?, ?, ?, 'Pending', ?, ?, ?)`,
      [customer_id, vehicle_id, driver_id || null, pickup_date, return_date, total_amount]
    );

    await connection.commit();
    res.json({ message: "Booking created successfully", booking_id: result.insertId, total_amount, days });
  } catch (err) {
    await connection.rollback();
    res.status(500).json({ error: err.message });
  } finally { connection.release(); }
};

/* ── PURCHASE VEHICLE ────────────────────────────────────── */
exports.purchaseVehicle = async (req, res) => {
  const customer_id = req.user.entityId;
  if (!customer_id)
    return res.status(400).json({ error: "Customer profile not linked to this account." });

  const { vehicle_id } = req.body;
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [veh] = await connection.query(
      "SELECT isAvailable FROM Vehicle WHERE id = ?", [vehicle_id]
    );
    if (veh.length === 0) { await connection.rollback(); return res.status(404).json({ error: "Vehicle not found." }); }
    if (!veh[0].isAvailable) { await connection.rollback(); return res.status(400).json({ error: "Vehicle is no longer available." }); }

    const [result] = await connection.query(
      `INSERT INTO Purchases (vehicle_id, customer_id, price, date, status) VALUES (?, ?, 0, CURDATE(), 'Pending')`,
      [vehicle_id, customer_id]
    );

    await connection.commit();
    res.json({ message: "Purchase request submitted successfully", purchase_id: result.insertId });
  } catch (err) {
    await connection.rollback();
    res.status(500).json({ error: err.message });
  } finally { connection.release(); }
};

/* ── PAY FOR A BOOKING (no manual ID — uses booking_id from DB) ── */
exports.payForBooking = async (req, res) => {
  const customer_id = req.user.entityId;
  const { booking_id, method } = req.body;

  if (!booking_id || !method)
    return res.status(400).json({ error: "booking_id and method are required." });

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // Verify this booking belongs to this customer
    const [bk] = await connection.query(
      `SELECT booking_id, total_amount, booking_status, customer_id
       FROM Rental_Booking WHERE booking_id = ?`,
      [booking_id]
    );
    if (bk.length === 0) { await connection.rollback(); return res.status(404).json({ error: "Booking not found." }); }
    if (bk[0].customer_id !== customer_id)
      { await connection.rollback(); return res.status(403).json({ error: "This booking does not belong to you." }); }
    if (bk[0].booking_status === "Cancelled")
      { await connection.rollback(); return res.status(400).json({ error: "Cannot pay for a cancelled booking." }); }

    // Check if already paid
    const [existing] = await connection.query(
      "SELECT payment_id FROM Payments WHERE booking_id = ? AND isPaid = TRUE", [booking_id]
    );
    if (existing.length > 0)
      { await connection.rollback(); return res.status(400).json({ error: "This booking is already paid." }); }

    // Insert or update payment
    const [ep] = await connection.query(
      "SELECT payment_id FROM Payments WHERE booking_id = ?", [booking_id]
    );
    if (ep.length > 0) {
      await connection.query(
        "UPDATE Payments SET amount = ?, method = ?, isPaid = TRUE WHERE payment_id = ?",
        [bk[0].total_amount, method, ep[0].payment_id]
      );
    } else {
      await connection.query(
        `INSERT INTO Payments (booking_id, payment_type, amount, method, isPaid)
         VALUES (?, 'Booking', ?, ?, TRUE)`,
        [booking_id, bk[0].total_amount, method]
      );
    }

    await connection.commit();
    res.json({ message: "Payment successful", amount: bk[0].total_amount });
  } catch (err) {
    await connection.rollback();
    res.status(500).json({ error: err.message });
  } finally { connection.release(); }
};

/* ── PAY FOR A PURCHASE (no manual ID) ──────────────────── */
exports.payForPurchase = async (req, res) => {
  const customer_id = req.user.entityId;
  const { purchase_id, method } = req.body;

  if (!purchase_id || !method)
    return res.status(400).json({ error: "purchase_id and method are required." });

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // Verify ownership and status
    const [pur] = await connection.query(
      "SELECT purchase_id, price, status, customer_id FROM Purchases WHERE purchase_id = ?",
      [purchase_id]
    );
    if (pur.length === 0) { await connection.rollback(); return res.status(404).json({ error: "Purchase not found." }); }
    if (pur[0].customer_id !== customer_id)
      { await connection.rollback(); return res.status(403).json({ error: "This purchase does not belong to you." }); }
    if (pur[0].status !== "Confirmed")
      { await connection.rollback(); return res.status(400).json({ error: "Purchase must be confirmed by admin before payment." }); }
    if (pur[0].price <= 0)
      { await connection.rollback(); return res.status(400).json({ error: "Admin has not set the purchase price yet." }); }

    // Check already paid
    const [existing] = await connection.query(
      "SELECT payment_id FROM Payments WHERE purchase_id = ? AND isPaid = TRUE", [purchase_id]
    );
    if (existing.length > 0)
      { await connection.rollback(); return res.status(400).json({ error: "This purchase is already paid." }); }

    await connection.query(
      `INSERT INTO Payments (purchase_id, payment_type, amount, method, isPaid)
       VALUES (?, 'Purchase', ?, ?, TRUE)`,
      [purchase_id, pur[0].price, method]
    );

    await connection.commit();
    res.json({ message: "Purchase payment successful", amount: pur[0].price });
  } catch (err) {
    await connection.rollback();
    res.status(500).json({ error: err.message });
  } finally { connection.release(); }
};

/* ── MY BOOKING HISTORY ──────────────────────────────────── */
exports.myBookingHistory = async (req, res) => {
  const customer_id = req.user.entityId;
  if (!customer_id) return res.status(400).json({ error: "Customer profile not linked." });
  try {
    const [rows] = await pool.query(
      `SELECT b.booking_id, b.booking_status, b.pickup_date, b.return_date, b.total_amount,
              CONCAT(v.make,' ',v.model) AS vehicle, v.photo, v.rent_per_day, v.id AS vehicle_id,
              d.name AS driver_name,
              p.payment_id, p.amount AS paid_amount, p.method AS payment_method, p.isPaid
       FROM Rental_Booking b
       JOIN Vehicle v   ON b.vehicle_id = v.id
       LEFT JOIN Driver   d ON b.driver_id   = d.driver_id
       LEFT JOIN Payments p ON b.booking_id  = p.booking_id
       WHERE b.customer_id = ?
       ORDER BY b.booking_id DESC`,
      [customer_id]
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
};

/* ── MY PURCHASES ────────────────────────────────────────── */
exports.myPurchases = async (req, res) => {
  const customer_id = req.user.entityId;
  if (!customer_id) return res.status(400).json({ error: "Customer profile not linked." });
  try {
    const [rows] = await pool.query(
      `SELECT pur.purchase_id, pur.price, pur.date, pur.status,
              CONCAT(v.make,' ',v.model) AS vehicle, v.photo, v.type, v.registration_year, v.id AS vehicle_id,
              p.payment_id, p.isPaid AS is_paid
       FROM Purchases pur
       JOIN Vehicle v ON pur.vehicle_id = v.id
       LEFT JOIN Payments p ON pur.purchase_id = p.purchase_id AND p.payment_type = 'Purchase'
       WHERE pur.customer_id = ?
       ORDER BY pur.purchase_id DESC`,
      [customer_id]
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
};
