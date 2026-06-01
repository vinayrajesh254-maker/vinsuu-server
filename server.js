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
  express.static(path.join(__dirname, "../uploads"))
);

// ✅ Serve frontend public folder
app.use(
  express.static(path.join(__dirname, "../public"))
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

app.use("/api/payment", require("./routes/payment"));

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

app.post("/api/payment/create-order", async (req,res)=>{

  const { amount, staff_id } = req.body;

  const order = await razorpay.orders.create({
    amount: Math.round(amount * 100),
    currency: "INR",
    receipt: "rcpt_" + Date.now(),
    notes: { staff_id }
  });

  res.json(order);
});

const crypto = require("crypto");

app.post("/api/payment/verify-payment", async (req,res)=>{

  const {
    razorpay_order_id,
    razorpay_payment_id,
    razorpay_signature,
    amount
  } = req.body;

  const body = razorpay_order_id + "|" + razorpay_payment_id;

  const expected = crypto
    .createHmac("sha256", process.env.RAZORPAY_SECRET)
    .update(body)
    .digest("hex");

  if(expected !== razorpay_signature){
    return res.status(400).json({ success:false });
  }

  const staff_id = req.body.staff_id;

  // ✅ UPDATE WALLET
  await pool.query(`
    UPDATE staff
    SET wallet_balance = wallet_balance + $1
    WHERE id=$2
  `,[amount, staff_id]);

  // ✅ SAVE TRANSACTION
  await pool.query(`
    INSERT INTO wallet_transactions
    (staff_id, amount, type)
    VALUES ($1,$2,'deposit')
  `,[staff_id, amount]);

  res.json({ success:true });
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
    path.join(__dirname, "../uploads")
  );
  console.log("Public path:",
    path.join(__dirname, "../public")
  );
  console.log("=================================");

});