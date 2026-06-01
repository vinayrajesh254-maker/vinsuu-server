const express = require("express");
const router = express.Router();
const pool = require("../db");
const jwt = require("jsonwebtoken");

let otpStore = {};

// helper (important)
function normalizeMobile(mobile){
  return mobile?.toString().trim();
}

// ================= SEND OTP =================
router.post("/send-otp", async (req, res) => {

  const mobile = normalizeMobile(req.body.mobile);

  if (!mobile || mobile.length !== 10) {
    return res.status(400).json({ error: "Valid mobile required" });
  }

  const otp = Math.floor(100000 + Math.random() * 900000);

  otpStore[mobile] = otp;

  console.log("📤 OTP:", mobile, otp);

  res.json({ success: true });

});


// ================= VERIFY OTP =================
router.post("/verify-otp", async (req, res) => {

  const mobile = normalizeMobile(req.body.mobile);
  const otp = req.body.otp?.toString().trim();
  const role = req.body.role || "user";

  if (!mobile || !otp) {
    return res.status(400).json({ error: "Mobile & OTP required" });
  }

  if (otpStore[mobile]?.toString() !== otp) {
    return res.json({ success:false, message:"Invalid OTP" });
  }

  // ✅ remove OTP after success
  delete otpStore[mobile];

  try {

    // check user exists
    let result = await pool.query(
      "SELECT * FROM staff WHERE mobile=$1"
      [mobile]
    );

    let user;

    if (result.rows.length === 0) {

      const newUser = await pool.query(
        "INSERT INTO staff (mobile) VALUES ($1,$2) RETURNING *",
        [mobile, role]
      );

      user = newUser.rows[0];

    } else {
      user = result.rows[0];
    }

    // 🔥 FIXED SECRET (IMPORTANT)
    const token = jwt.sign(
      { id:user.id, role:user.role },
      "SECRET_KEY",   // ✅ SAME as staff.js & middleware
      { expiresIn:"30d" }
    );

    res.json({
      success:true,
      token,
      user
    });

  } catch (err) {
    console.log("ERROR:", err);
    res.status(500).json({ error: "Server error" });
  }

});

module.exports = router;