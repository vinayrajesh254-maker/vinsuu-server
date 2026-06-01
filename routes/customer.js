const express = require("express");
const router = express.Router();
const pool = require("../db");
const { verifyToken } = require("../middleware/auth");

const multer = require("multer");
const path = require("path");
const axios = require("axios");
const TWO_FACTOR_API_KEY = process.env.TWO_FACTOR_API_KEY;

// ================= MULTER CONFIG =================
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "../uploads");
  },
  filename: (req, file, cb) => {
    const uniqueName = Date.now() + path.extname(file.originalname);
    cb(null, uniqueName);
  }
});

const upload = multer({ storage });

// ================= TEST =================
router.get("/test", (req, res) => {
  res.json({ message: "Customer route working" });
});

// ================= SUBMIT SERVICE REQUEST =================
router.post("/request-service", async (req, res) => {

  try {

    const {
      service_id,
      heading,
      details,
      address,
      pincode,
      location,
      latitude,
      longitude,
      name,
      mobile,
      distance,
      price,
      confirmation_amount
    } = req.body;

    // FIND OR CREATE USER
    let userResult = await pool.query(
      "SELECT * FROM users WHERE mobile=$1",
      [mobile]
    );

    let user;

    if (userResult.rows.length === 0) {

      const newUser = await pool.query(
  `INSERT INTO users
   (name,mobile,email,address)
   VALUES ($1,$2,$3,$4)
   RETURNING *`,
  [
    name,
    mobile,
    req.body.email?.trim() || null,
    address || ""
  ]
);

      user = newUser.rows[0];

    } else {

      user = userResult.rows[0];

await pool.query(
  `UPDATE users
   SET name=$1,
       address=$2
   WHERE id=$3`,
  [
    name,
    address || "",
    user.id
  ]
);

    }

    // SAVE REQUEST
   const result = await pool.query(
  `INSERT INTO service_requests
  (service_id,customer_id,heading,details,address,pincode,location,latitude,longitude,status,
   distance,price,confirmation_amount)
  VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
  RETURNING id`,
  [
    service_id,
    user.id,
    heading,
    details,
    address,
    pincode,
    location,
    latitude || null,
    longitude || null,
    "pending",

    // ✅ ADD THESE
    distance || 0,
    price || 0,
    confirmation_amount || 0
  ]
);
    // CREATE TOKEN
    const jwt = require("jsonwebtoken");

    const token = jwt.sign(
      {
        id: user.id,
        mobile: user.mobile
      },
      process.env.JWT_SECRET,
      { expiresIn: "30d" }
    );

    res.json({
      success: true,
      token,
      serviceNo: result.rows[0].id,
      user
    });

  } catch (err) {

    console.log(err);

    res.status(500).json({
      error: "Server error"
    });

  }

});

// ================= PROFILE =================
router.get("/profile", verifyToken, async (req, res) => {

  const result = await pool.query(
    `SELECT name, mobile, email, address, image FROM users WHERE id=$1`,
    [req.user.id]
  );

  res.json(result.rows[0] || {});
});

// ================= MY REQUESTS =================
router.get("/my-requests", verifyToken, async (req, res) => {

  try {

    const result = await pool.query(
      `SELECT 
      sr.*,
      st.name as staff_name,
      st.mobile as staff_mobile,
      sv.price as service_price

   FROM service_requests sr

   LEFT JOIN staff st 
   ON sr.staff_id = st.id

   LEFT JOIN services sv
   ON sr.service_id = sv.id

   WHERE sr.customer_id=$1

   ORDER BY sr.id DESC`,
      [req.user.id]
    );

    res.json(result.rows);

  } catch (err) {
    console.log(err);
    res.status(500).json({ error: "Server error" });
  }

});
// ================= UPDATE PROFILE =================
router.post("/update-profile", verifyToken, async (req, res) => {

  try {

    const { name, email, address } = req.body;

    await pool.query(
      `UPDATE users 
       SET name=$1, email=$2, address=$3 
       WHERE id=$4`,
      [
        name || "",
        email || "",
        address || "",
        req.user.id
      ]
    );

    res.json({ success: true });

  } catch (err) {
    console.log("PROFILE UPDATE ERROR:", err);
    res.status(500).json({ error: "Server error" });
  }

});
// ================= UPLOAD IMAGE =================
router.post("/upload-image", verifyToken, upload.single("image"), async (req, res) => {

  try {

    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const imagePath = "/uploads/" + req.file.filename;

    // save in DB
    await pool.query(
      "UPDATE users SET image=$1 WHERE id=$2",
      [imagePath, req.user.id]
    );

    res.json({
      success: true,
      image: imagePath
    });

  } catch (err) {
    console.log(err);
    res.status(500).json({ error: "Upload failed" });
  }

});
// ================= CUSTOMER LOGIN VERIFY =================
const jwt = require("jsonwebtoken");

// OTP verified already on frontend, this creates/login user
router.post("/login-verify", async (req, res) => {
  try {
    const { mobile } = req.body;

    if (!mobile) {
      return res.status(400).json({ error: "Mobile required" });
    }

    // Check existing user
    let userResult = await pool.query(
      "SELECT * FROM users WHERE mobile=$1",
      [mobile]
    );

    let user;

    // If not found → create new user
    if (userResult.rows.length === 0) {
      const newUser = await pool.query(
        `INSERT INTO users (mobile, name)
         VALUES ($1,$2)
         RETURNING *`,
        [mobile, "Customer"]
      );

      user = newUser.rows[0];
    } else {
      user = userResult.rows[0];
    }

    // Create token
    const token = jwt.sign(
      {
        id: user.id,
        mobile: user.mobile
      },
      process.env.JWT_SECRET,
      { expiresIn: "30d" }
    );

    res.json({
      token,
      user
    });

  } catch (err) {
    console.log(err);
    res.status(500).json({ error: "Server error" });
  }
});

// ================= CUSTOMER CONFIRM START =================
router.post("/confirm-start", verifyToken, async (req, res) => {

  try {

    const { request_id } = req.body;

    // customer mobile nikalo
    const customerRes = await pool.query(
      `SELECT u.mobile
       FROM service_requests sr
       JOIN users u ON sr.customer_id = u.id
       WHERE sr.id=$1`,
      [request_id]
    );

    if (customerRes.rows.length === 0) {
      return res.status(404).json({
        error: "Request not found"
      });
    }

    const mobile = customerRes.rows[0].mobile;

    // SEND 2FACTOR OTP
    const otpRes = await axios.get(
      `https://2factor.in/API/V1/${TWO_FACTOR_API_KEY}/SMS/${mobile}/AUTOGEN`
    );

    if (otpRes.data.Status !== "Success") {
      return res.status(400).json({
        error: "Failed to send OTP"
      });
    }
    
console.log("CONFIRM START:", request_id);
    const updateResult = await pool.query(
  `UPDATE service_requests
   SET
     status='otp_pending',
     customer_confirmed=TRUE,
     start_otp=$1
   WHERE id=$2
   RETURNING id,status,start_otp`,
  [
    otpRes.data.Details,
    request_id
  ]
);

console.log("UPDATE RESULT:", updateResult.rows);
    res.json({
      success: true
    });

  } catch(err){

   console.log("CONFIRM START ERROR:");
   console.log(err);
   console.log(err.response?.data);
   console.log(err.message);

   res.status(500).json({
      error: err.message
   });
}

});

// ================= INVOICE =================
router.get("/invoice/:id", verifyToken, async (req, res) => {

  try {

    const id = req.params.id;

    // 🔹 GET REQUEST DATA
    const result = await pool.query(`
      SELECT 
        sr.*,
        u.name AS customer_name,
        u.id AS customer_id,
        st.name AS staff_name,
        st.id AS staff_id,
        sv.price AS service_price
      FROM service_requests sr
      LEFT JOIN users u ON sr.customer_id = u.id
      LEFT JOIN staff st ON sr.staff_id = st.id
      LEFT JOIN services sv ON sr.service_id = sv.id
      WHERE sr.id = $1
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Invoice not found" });
    }

    const data = result.rows[0];

    // 🔹 BUILD ITEMS
    let items = [];

    // Service price
    if (data.service_price) {
      items.push({
        name: "Service Price",
        qty: 1,
        price: Number(data.service_price),
        amount: Number(data.service_price)
      });
    }

    // Additional charges
    if (data.additional_cost) {
      items.push({
        name: "Additional service charges",
        qty: 1,
        price: Number(data.additional_cost),
        amount: Number(data.additional_cost)
      });
    }

    // Material charges
    if (data.extra_material_cost) {
      items.push({
        name: "Additional material charges",
        qty: 1,
        price: Number(data.extra_material_cost),
        amount: Number(data.extra_material_cost)
      });
    }

    // 🔹 TOTAL
    let total = items.reduce((sum, i) => sum + i.amount, 0);

    // ✅ get payment type from payment_history
    const payRes = await pool.query(
      "SELECT payment_type FROM payment_history WHERE request_id=$1 ORDER BY id DESC LIMIT 1",
      [req.params.id]
    );

    const paymentMode = payRes.rows[0]?.payment_type || "UPI";

    res.json({
      id: data.id,
      staff_id: data.staff_id,
      staff_name: data.staff_name,
      service_time: data.start_time || "Instant",
      customer_id: data.customer_id,
      customer_name: data.customer_name,
      payment_mode: paymentMode,
      items,
      total
    });

  } catch (err) {

    console.log("INVOICE ERROR:", err);

    res.status(500).json({
      error: "Server error"
    });

  }

});
// review and feedback for staff
router.post("/review", verifyToken, async (req, res) => {

  try {

    const { request_id, rating, feedback } = req.body;

    // 🔥 ensure request belongs to this customer
    const check = await pool.query(
      "SELECT * FROM service_requests WHERE id=$1 AND customer_id=$2",
      [request_id, req.user.id]
    );

    if (check.rows.length === 0) {
      return res.status(400).json({ error: "Invalid request" });
    }

    // 🔥 ensure staff assigned
    if (!check.rows[0].staff_id) {
      return res.status(400).json({ error: "Service not completed yet" });
    }

    // 🔥 update rating
    const result = await pool.query(`
            UPDATE service_requests
            SET rating=$1, feedback=$2
            WHERE id=$3
            RETURNING id, rating, feedback, staff_id
        `, [rating, feedback, request_id]);

    console.log("UPDATED REVIEW:", result.rows);

    res.json({
      success: true,
      data: result.rows[0]
    });

  } catch (err) {
    console.log("REVIEW ERROR:", err);
    res.status(500).json({ error: "Server error" });
  }

});

// ================= CUSTOMER CANCEL =================
router.post("/cancel", verifyToken, async (req, res) => {

  try {

    const { request_id, remark } = req.body;

    if (!remark || remark.trim() === "") {
      return res.status(400).json({ error: "Remark required" });
    }

    await pool.query(
      `UPDATE service_requests
       SET status='cancel',
           cancel_remark=$1,
           cancelled_by='customer'
       WHERE id=$2 AND customer_id=$3`,
      [remark, request_id, req.user.id]
    );

    res.json({ success: true });

  } catch (err) {
    console.log("CUSTOMER CANCEL ERROR:", err);
    res.status(500).json({ error: "Server error" });
  }

});
module.exports = router;