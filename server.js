const express = require("express");
const http = require("http");
const cors = require("cors");
const path = require("path");
require("dotenv").config();
require("./cloudinary");
const pool = require("./db");

const app = express();
const server = http.createServer(app);


// =====================================================
// IMPORTANT: STATIC FOLDERS
// =====================================================

// ✅ Serve uploads folder (FIXED PATH)
app.use(
  "/uploads",
  express.static(path.join(__dirname, "uploads"))
);

// ✅ Serve frontend public folder
app.use(
  express.static(path.join(__dirname, "public"))
);


// =====================================================
// MIDDLEWARE
// =====================================================

app.use(cors());

const session = require("express-session");

app.use(session({
  secret: process.env.ADMIN_SECRET || "vinsuu_super_secret_key",
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 1000 * 60 * 30,
    httpOnly: true
  }
}));

app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ limit: "20mb", extended: true }));




// =====================================================
// DATABASE
// =====================================================

require("./db");


// =====================================================
// CRON JOBS
// =====================================================

require("./cronJobs.js"); 



// =====================================================
// ROUTES
// =====================================================

app.use("/api/auth", require("./routes/auth"));

app.use("/api/admin-auth",require("./routes/admin-auth"));

app.use("/api/admin", require("./routes/admin"));

app.use("/api/customer", require("./routes/customer"));

app.use("/api/staff", require("./routes/staff"));

// app.use("/api/payment", require("./routes/payment"));

app.use("/api/otp", require("./routes/otp"));

app.use("/uploads", express.static(path.join(__dirname, "../uploads")));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ limit: "10mb", extended: true }));


// =====================================================
// LOCATION API (GPS + PIN SAVE)
// =====================================================

app.post("/api/location/save", async (req, res) => {

  try {

    const { lat, lng, pincode, city, district, state } = req.body;

    console.log("📍 Location Received:", req.body);
    

    // =====================================================
    // 👉 SAVE TO DATABASE (OPTIONAL - ADD MODEL LATER)
    // =====================================================

    // Example MongoDB (if you create model later):
    // const Location = require("./models/Location");
    // await Location.create({ lat, lng, pincode, city, district, state });

    // Example PostgreSQL:
    // INSERT INTO locations (lat, lng, pincode, city, district, state)

    // =====================================================
    // 👉 GEO-FENCING LOGIC (Ahmedabad example)
    // =====================================================

    let serviceAvailable = true;

    if (lat && lng) {

      const allowedLat = 23.0225; // Ahmedabad
      const allowedLng = 72.5714;

      const distance = getDistance(lat, lng, allowedLat, allowedLng);

      if (distance > 50) {
        serviceAvailable = false;
      }

    }

    res.json({
      success: true,
      message: "Location saved",
      serviceAvailable
    });

  } catch (err) {

    console.error("Location Save Error:", err);

    res.status(500).json({
      success: false,
      message: "Failed to save location"
    });

  }

});


// =====================================================
// DISTANCE FUNCTION (GEO-FENCING)
// =====================================================

function getDistance(lat1, lon1, lat2, lon2) {

  const R = 6371;

  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) *
    Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) *
    Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;

}
// Geo code
app.get("/api/geocode", async (req, res) => {

  try {

    const { lat, lng } = req.query;

    const response = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${process.env.GOOGLE_KEY}`
    );

    const data = await response.json();

    res.json(data);

  } catch (err) {
    res.status(500).json({ error: "Geocode failed" });
  }

});
// ROJGAR PAY
const Razorpay = require("razorpay");

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY,
  key_secret: process.env.RAZORPAY_SECRET
});

app.post("/api/payment/create-order", async (req, res) => {

  try {

    const { amount, staff_id } = req.body;

    console.log("Create Order Request:", req.body);

    const order = await razorpay.orders.create({
      amount: Math.round(Number(amount) * 100),
      currency: "INR",
      receipt: "rcpt_" + Date.now(),
      notes: {
        staff_id: staff_id || ""
      }
    });

    console.log("Order Created:", order);

    res.json(order);

  } catch (err) {

    console.error("Razorpay Create Order Error:");
    console.error(err);
    console.log("RAZORPAY_KEY =", process.env.RAZORPAY_KEY);
console.log("RAZORPAY_SECRET =", process.env.RAZORPAY_SECRET ? "Loaded" : "Missing");

    res.status(500).json({
      success: false,
      message: err.error?.description || err.message
    });

  }

});

const crypto = require("crypto");
console.log("VERIFY ROUTE VERSION: 2026-08-04");
app.post("/api/payment/verify-payment", async (req, res) => {

  console.log("========== VERIFY ROUTE ==========");
  console.log(req.body);

  try {

    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      amount,
      unit,
      staff_id
    } = req.body;

    console.log("Updating staff:", staff_id);

    const updateResult = await pool.query(`
      UPDATE staff
      SET unit_balance = COALESCE(unit_balance,0)+$1
      WHERE id=$2
      RETURNING id, unit_balance;
    `,[Number(unit), Number(staff_id)]);

    console.log("UPDATE RESULT:", updateResult.rows);

    const balance = await pool.query(`
      SELECT unit_balance
      FROM staff
      WHERE id=$1
    `,[staff_id]);

    console.log("BALANCE:", balance.rows);

    const insertResult = await pool.query(`
      INSERT INTO unit_payment_history
      (
        staff_id,
        payment_id,
        order_id,
        amount,
        purchased_unit,
        remaining_unit,
        payment_method,
        status
      )
      VALUES
      ($1,$2,$3,$4,$5,$6,$7,$8)
      RETURNING *;
    `,[
      Number(staff_id),
      razorpay_payment_id,
      razorpay_order_id,
      Number(amount),
      Number(unit),
      Number(balance.rows[0].unit_balance),
      "Razorpay",
      "success"
    ]);

    console.log("INSERT RESULT:", insertResult.rows);

    res.json({ success:true });

  } catch(err){

    console.error(err);

    res.status(500).json({
      success:false,
      message:err.message
    });

  }

});


 

 

// =====================================================
// SOCKET.IO
// =====================================================

const socket = require("./socket");

const io = socket.init(server);

io.on("connection", (socket) => {

  console.log("User Connected:", socket.id);

  socket.on("joinStaffRoom", (staffId) => {

    socket.join("staff_" + staffId);

  });

  socket.on("disconnect", () => {

    console.log("User Disconnected:", socket.id);

  });

});


// =====================================================
// TEST ROUTE
// =====================================================

app.get("/api/test", (req, res) => {

  res.json({
    success: true,
    message: "Server working correctly"
  });

});


// =====================================================
// ERROR HANDLER
// =====================================================

app.use((err, req, res, next) => {

  console.error("ERROR:", err);

  res.status(500).json({

    success: false,
    message: err.message || "Server error"

  });

});


// =====================================================
// START SERVER
// =====================================================

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {

  console.log("=================================");
  console.log("Server running on port:", PORT);
  console.log("http://localhost:" + PORT);
  console.log("Uploads path:",
    path.join(__dirname, "uploads")
  );
  console.log("Public path:",
    path.join(__dirname, "public")
  );
  console.log("=================================");

});