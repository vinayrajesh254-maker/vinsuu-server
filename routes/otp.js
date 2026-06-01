const express = require("express");
const router = express.Router();
const axios = require("axios");

const API_KEY = process.env.TWO_FACTOR_API_KEY;

// ================= HELPER =================
function normalizeMobile(mobile) {
  return mobile?.toString().trim();
}


// ================= SEND OTP =================
router.post("/send", async (req, res) => {

  try {

    const mobile = normalizeMobile(req.body.mobile);

    if (!mobile || mobile.length !== 10) {
      return res.status(400).json({
        error: "Valid mobile required"
      });
    }

    const response = await axios.get(
      `https://2factor.in/API/V1/${API_KEY}/SMS/${mobile}/AUTOGEN`
    );

    res.json({
      success: true,
      sessionId: response.data.Details
    });

  } catch (err) {

    console.log(err);

    res.status(500).json({
      error: "OTP send failed"
    });

  }

});


// ================= VERIFY OTP =================
router.post("/verify", async (req, res) => {

  try {

    const { sessionId, otp } = req.body;

    const response = await axios.get(
      `https://2factor.in/API/V1/${API_KEY}/SMS/VERIFY/${sessionId}/${otp}`
    );

    if (response.data.Status !== "Success") {
      return res.status(400).json({
        error: "Invalid OTP"
      });
    }

    res.json({
      success: true
    });

  } catch (err) {

    console.log(err);

    res.status(500).json({
      error: "Verification failed"
    });

  }

});


// ================= RESEND OTP =================
router.post("/resend", (req, res) => {

  const mobile = normalizeMobile(req.body.mobile);

  if (!mobile || mobile.length !== 10) {
    return res.status(400).json({ error: "Valid mobile required" });
  }

  const otp = Math.floor(100000 + Math.random() * 900000);
  const expiresAt = Date.now() + 2 * 60 * 1000;

  otpStore[mobile] = { otp, expiresAt };

  console.log("🔁 RESEND OTP:", mobile, "OTP:", otp);

  res.json({
    success: true,
    message: "OTP resent successfully"
  });

});



module.exports = router;