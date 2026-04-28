const pool = require("../config/db");
const jwt  = require("jsonwebtoken");

// ================= REGISTER CUSTOMER =================
exports.registerCustomer = async (req, res) => {
  const { name, email, phone_number, address, license_number, password } = req.body;
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [cr] = await connection.query(
      `INSERT INTO Customer (name, email, phone_number, address, license_number) VALUES (?,?,?,?,?)`,
      [name, email, phone_number, address, license_number]
    );
    await connection.query(
      `INSERT INTO Users (name, role, email, password, hire_date, isActive) VALUES (?, 'Customer', ?, ?, CURDATE(), TRUE)`,
      [name, email, password]
    );
    await connection.commit();
    res.json({ message: "Customer registered successfully", customer_id: cr.insertId });
  } catch (err) {
    await connection.rollback();
    res.status(500).json({ error: err.message });
  } finally { connection.release(); }
};

// ================= REGISTER DRIVER =================
exports.registerDriver = async (req, res) => {
  const { name, email, phone_number, address, license_number, password } = req.body;
  if (!name || !email || !phone_number || !address || !license_number || !password)
    return res.status(400).json({ error: "All fields are required." });
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [dr] = await connection.query(
      `INSERT INTO Driver (name, email, phone_number, address, license_number, available) VALUES (?,?,?,?,?,TRUE)`,
      [name, email, phone_number, address, license_number]
    );
    await connection.query(
      `INSERT INTO Users (name, role, email, password, hire_date, isActive) VALUES (?, 'Driver', ?, ?, CURDATE(), TRUE)`,
      [name, email, password]
    );
    await connection.commit();
    res.json({ message: "Driver registered successfully", driver_id: dr.insertId });
  } catch (err) {
    await connection.rollback();
    res.status(500).json({ error: err.message });
  } finally { connection.release(); }
};

// ================= REGISTER ADMIN =================
exports.registerAdmin = async (req, res) => {
  const { name, email, password, admin_secret } = req.body;
  if (admin_secret !== process.env.ADMIN_SECRET)
    return res.status(403).json({ error: "Invalid admin secret key." });
  if (!name || !email || !password)
    return res.status(400).json({ error: "Name, email and password are required." });
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.query(
      `INSERT INTO Users (name, role, email, password, hire_date, isActive) VALUES (?, 'Admin', ?, ?, CURDATE(), TRUE)`,
      [name, email, password]
    );
    await connection.commit();
    res.json({ message: "Admin registered successfully" });
  } catch (err) {
    await connection.rollback();
    res.status(500).json({ error: err.message });
  } finally { connection.release(); }
};

exports.login = async (req, res) => {
  const { email, password } = req.body;

  try {
    const [rows] = await pool.query(
      "SELECT * FROM Users WHERE email = ? AND isActive = TRUE",
      [email]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    const user = rows[0];

    if (user.password !== password) {
      return res.status(401).json({ message: "Invalid password" });
    }

    let entityId = null;

    // ✅ Correct mapping using EMAIL (since that's your link)
    if (user.role === "Customer") {
      const [c] = await pool.query(
        "SELECT customer_id FROM Customer WHERE email = ?",
        [email]
      );

      entityId = c.length ? c[0].customer_id : null;
    }

    if (user.role === "Driver") {
      const [d] = await pool.query(
        "SELECT driver_id FROM Driver WHERE email = ?",
        [email]
      );

      entityId = d.length ? d[0].driver_id : null;
    }

    const token = jwt.sign(
      {
        id: user.user_id,
        role: user.role,
        email: user.email,
        entityId
      },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    res.json({
      token,
      role: user.role,
      entityId
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ================= LOGIN =================
// exports.login = async (req, res) => {
//   const { email, password } = req.body;
//   try {
//     const [rows] = await pool.query(
//       "SELECT * FROM Users WHERE email = ? AND isActive = TRUE", [email]
//     );
//     if (rows.length === 0) return res.status(404).json({ message: "User not found" });
//     const user = rows[0];
//     if (user.password !== password) return res.status(401).json({ message: "Invalid password" });

//     // Get customer_id or driver_id so frontend never needs to ask for it
//     let entityId = null;
//     if (user.role === "Customer") {
//       const [c] = await pool.query("SELECT customer_id FROM Customer WHERE email = ?", [email]);
//       if (c.length > 0) entityId = c[0].customer_id;
//     } else if (user.role === "Driver") {
//       const [d] = await pool.query("SELECT driver_id FROM Driver WHERE email = ?", [email]);
//       if (d.length > 0) entityId = d[0].driver_id;
//     }

//     const token = jwt.sign(
//       { id: user.user_id, role: user.role, email: user.email, entityId },
//       process.env.JWT_SECRET,
//       { expiresIn: "1d" }
//     );
//     res.json({ token, role: user.role, entityId });
//   } catch (err) {
//     res.status(500).json({ error: err.message });
//   }
// };


// const pool = require("../config/db");
// const jwt  = require("jsonwebtoken");

// // ================= REGISTER CUSTOMER =================
// exports.registerCustomer = async (req, res) => {
//   const { name, email, phone_number, address, license_number, password } = req.body;
//   const connection = await pool.getConnection();

//   try {
//     await connection.beginTransaction();

//     const [customerResult] = await connection.query(
//       `INSERT INTO Customer (name, email, phone_number, address, license_number)
//        VALUES (?, ?, ?, ?, ?)`,
//       [name, email, phone_number, address, license_number]
//     );

//     await connection.query(
//       `INSERT INTO Users (name, role, email, password, hire_date, isActive)
//        VALUES (?, 'Customer', ?, ?, CURDATE(), TRUE)`,
//       [name, email, password]
//     );

//     await connection.commit();
//     res.json({ message: "Customer registered successfully", customer_id: customerResult.insertId });

//   } catch (err) {
//     await connection.rollback();
//     res.status(500).json({ error: err.message });
//   } finally {
//     connection.release();
//   }
// };

// // ================= REGISTER DRIVER =================
// exports.registerDriver = async (req, res) => {
//   const { name, email, phone_number, address, license_number, password } = req.body;

//   if (!name || !email || !phone_number || !address || !license_number || !password) {
//     return res.status(400).json({ error: "All fields are required." });
//   }

//   const connection = await pool.getConnection();

//   try {
//     await connection.beginTransaction();

//     const [driverResult] = await connection.query(
//       `INSERT INTO Driver (name, email, phone_number, address, license_number, available)
//        VALUES (?, ?, ?, ?, ?, TRUE)`,
//       [name, email, phone_number, address, license_number]
//     );

//     await connection.query(
//       `INSERT INTO Users (name, role, email, password, hire_date, isActive)
//        VALUES (?, 'Driver', ?, ?, CURDATE(), TRUE)`,
//       [name, email, password]
//     );

//     await connection.commit();
//     res.json({ message: "Driver registered successfully", driver_id: driverResult.insertId });

//   } catch (err) {
//     await connection.rollback();
//     res.status(500).json({ error: err.message });
//   } finally {
//     connection.release();
//   }
// };

// // ================= REGISTER ADMIN =================
// exports.registerAdmin = async (req, res) => {
//   const { name, email, password, admin_secret } = req.body;

//   // Secret key protects admin registration — set ADMIN_SECRET in your .env
//   if (admin_secret !== process.env.ADMIN_SECRET) {
//     return res.status(403).json({ error: "Invalid admin secret key." });
//   }

//   if (!name || !email || !password) {
//     return res.status(400).json({ error: "Name, email and password are required." });
//   }

//   const connection = await pool.getConnection();

//   try {
//     await connection.beginTransaction();

//     await connection.query(
//       `INSERT INTO Users (name, role, email, password, hire_date, isActive)
//        VALUES (?, 'Admin', ?, ?, CURDATE(), TRUE)`,
//       [name, email, password]
//     );

//     await connection.commit();
//     res.json({ message: "Admin registered successfully" });

//   } catch (err) {
//     await connection.rollback();
//     res.status(500).json({ error: err.message });
//   } finally {
//     connection.release();
//   }
// };

// ================= LOGIN =================
// exports.login = async (req, res) => {
//   const { email, password } = req.body;

//   try {
//     const [rows] = await pool.query(
//       "SELECT * FROM Users WHERE email = ? AND isActive = TRUE",
//       [email]
//     );

//     if (rows.length === 0) {
//       return res.status(404).json({ message: "User not found" });
//     }

//     const user = rows[0];

//     if (user.password !== password) {
//       return res.status(401).json({ message: "Invalid password" });
//     }

//     const token = jwt.sign(
//       { id: user.user_id, role: user.role, email: user.email },
//       process.env.JWT_SECRET,
//       { expiresIn: "1d" }
//     );

//     res.json({ token, role: user.role });

//   } catch (err) {
//     res.status(500).json({ error: err.message });
//   }
// };


// const pool = require("../config/db");
// const jwt = require("jsonwebtoken");

// // ================= REGISTER =================
// exports.registerCustomer = async (req, res) => {
//   const { name, email, phone_number, address, license_number, password } = req.body;

//   const connection = await pool.getConnection();

//   try {
//     await connection.beginTransaction();

//     // Insert into Customer table
//     const [customerResult] = await connection.query(
//       `INSERT INTO Customer (name, email, phone_number, address, license_number)
//        VALUES (?, ?, ?, ?, ?)`,
//       [name, email, phone_number, address, license_number]
//     );

//     const customerId = customerResult.insertId;

//     // Insert into Users table (plain password)
//     await connection.query(
//       `INSERT INTO Users (name, role, email, password, hire_date, isActive)
//        VALUES (?, 'Customer', ?, ?, CURDATE(), TRUE)`,
//       [name, email, password]
//     );

//     await connection.commit();

//     res.json({
//       message: "Customer registered successfully",
//       customer_id: customerId
//     });

//   } catch (err) {

//     await connection.rollback();
//     res.status(500).json({ error: err.message });

//   } finally {

//     connection.release();

//   }
// };

// // ================= LOGIN =================
// exports.login = async (req, res) => {
//   const { email, password } = req.body;

//   const [rows] = await db.query(
//     "SELECT * FROM users WHERE email = ?",
//     [email]
//   );

//   if (rows.length === 0) {
//     return res.status(404).json({ message: "User not found" });
//   }

//   const user = rows[0];

//   // simple password match (for now)
//   if (user.password !== password) {
//     return res.status(401).json({ message: "Invalid password" });
//   }

//   const token = jwt.sign(
//     {
//       id: user.id,
//       role: user.role   
//     },
//     process.env.JWT_SECRET,
//     { expiresIn: "1d" }
//   );

//   res.json({
//     token,
//     role: user.role
//   });
// };