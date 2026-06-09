const express = require("express");
const router = express.Router();
const pool = require("../db");
const { verifyToken } = require("../middleware/auth");
const jwt = require("jsonwebtoken");

const multer = require("multer");
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const cloudinary = require("../cloudinary");
const axios = require("axios");
const TWO_FACTOR_API_KEY = process.env.TWO_FACTOR_API_KEY;

// ================= CLOUDINARY STORAGE =================

const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: async (req, file) => {

    let folder = "staff";

    if (file.fieldname === "qr") {
      folder = "staffQR";
    }

    if (file.fieldname === "id_image") {
      folder = "staffID";
    }

    if (file.fieldname === "profile_image") {
      folder = "staffProfile";
    }

    if (file.fieldname === "camera_image") {
      folder = "staffCamera";
    }

    return {
      folder: folder,
      allowed_formats: ["jpg", "jpeg", "png", "webp"]
    };
  }
});

const upload = multer({ storage });


function formatMobile(mobile) {
  return mobile?.toString().replace(/\D/g, "").slice(-10);
}

// ================= TEST =================
router.get("/test", (req, res) => {
  res.json({ message: "Staff route working" });
});

// ================= SEND OTP =================
router.post("/send-otp", async (req, res) => {

  try {

    let mobile = formatMobile(req.body.mobile);

    if (!mobile || mobile.length !== 10) {
      return res.status(400).json({
        error: "Valid mobile required"
      });
    }

    const response = await axios.get(
      `https://2factor.in/API/V1/${TWO_FACTOR_API_KEY}/SMS/${mobile}/AUTOGEN`
    );

    if (response.data.Status !== "Success") {
      return res.status(400).json({
        error: "Failed to send OTP"
      });
    }

    res.json({
      success: true,
      sessionId: response.data.Details
    });

  } catch (err) {

    console.log("SEND OTP ERROR:", err.response?.data || err.message);

    res.status(500).json({
      error: "OTP send failed"
    });

  }

});

// ================= VERIFY OTP =================
router.post("/verify-otp", async (req, res) => {

  try {

    const { sessionId, otp } = req.body;

    if (!sessionId || !otp) {
      return res.status(400).json({
        error: "SessionId and OTP required"
      });
    }

    const verifyResponse = await axios.get(
      `https://2factor.in/API/V1/${TWO_FACTOR_API_KEY}/SMS/VERIFY/${sessionId}/${otp}`
    );

    if (verifyResponse.data.Status !== "Success") {

      return res.status(400).json({
        error: "Invalid OTP"
      });

    }

    res.json({
      success: true
    });

  } catch (err) {

    console.log(
      "VERIFY OTP ERROR:",
      err.response?.data || err.message
    );

    res.status(500).json({
      error: "OTP verification failed"
    });

  }

});

// ================= LOGIN CHECK =================
router.post("/login", async (req, res) => {

  try {

    let mobile = formatMobile(req.body.mobile);

    if (!mobile) {
      return res.status(400).json({ error: "Mobile required" });
    }

    const result = await pool.query(
      "SELECT * FROM staff WHERE mobile=$1",
      [mobile]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: "This mobile number is not registered please create an account"
      });
    }

    res.json({
      success: true,
      user: result.rows[0]
    });

  } catch (err) {
    console.log(err);
    res.status(500).json({ error: "Server error" });
  }
});

// ================= LOGIN VERIFY (JWT) =================
router.post("/login-verify", async (req, res) => {

  try {

    let mobile = formatMobile(req.body.mobile);

    const result = await pool.query(
      "SELECT * FROM staff WHERE mobile=$1",
      [mobile]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    const user = result.rows[0];

    const token = jwt.sign(
      { id: user.id, mobile: user.mobile },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({
      success: true,
      token,
      user
    });

  } catch (err) {
    console.log(err);
    res.status(500).json({ error: "Server error" });
  }
});


// ================= REGISTER STAFF =================
// ================= REGISTER STAFF =================
router.post(
  "/register",
  upload.fields([
    { name: "id_image", maxCount: 1 },
    { name: "profile_image", maxCount: 1 },
    { name: "camera_image", maxCount: 1 }
  ]),
  async (req, res) => {

  try {

    let {
  name,
  mobile,
  alt_mobile,
  email,
  qualification,
  experience,
  address,
  pincodes,
  service_ids,
  service_names,
  location,
  id_proof,
  id_proof_no,
  agree_terms
} = req.body;

const existing = await pool.query(
  "SELECT * FROM staff WHERE mobile=$1",
  [mobile]
);

const existingUser =
  existing.rows.length > 0
    ? existing.rows[0]
    : null;

const id_image =
  req.files?.id_image?.[0]?.path ||
  req.body.existing_id_image ||
  existingUser?.id_image ||
  null;

const profile_image =
  req.files?.profile_image?.[0]?.path ||
  req.body.existing_profile_image ||
  existingUser?.profile_image ||
  null;

const camera_image =
  req.files?.camera_image?.[0]?.path ||
  req.body.existing_camera_image ||
  existingUser?.camera_image ||
  null;


// 🔥 HANDLE STRING OR ARRAY
let parsedServices = service_ids;

if (typeof service_ids === "string") {
  try {
    parsedServices = JSON.parse(service_ids);
  } catch (e) {
    parsedServices = [];
  }
}


let service_id = null;

if (Array.isArray(parsedServices) && parsedServices.length > 0) {
  service_id = Number(parsedServices[0]);
}
// AFTER parsing (line ~120 area)
console.log("RAW service_ids:", service_ids);
console.log("PARSED:", parsedServices);
console.log("FINAL service_id:", service_id);

// ================= FIX JSON FIELDS =================

let parsedServiceNames = [];

try {

  if (Array.isArray(service_names)) {

    parsedServiceNames = service_names;

  } else if (typeof service_names === "string") {

    // already JSON string
    if (service_names.startsWith("[")) {

      parsedServiceNames = JSON.parse(service_names);

    } else {

      parsedServiceNames = [service_names];
    }

  }

} catch (e) {

  parsedServiceNames = [];

}

let parsedLocation = null;

try {

  if (typeof location === "string") {

    parsedLocation = JSON.parse(location);

  } else {

    parsedLocation = location;

  }

} catch (e) {

  parsedLocation = null;

}

    mobile = formatMobile(mobile);
if (typeof pincodes === "string") {
  try {
    pincodes = JSON.parse(pincodes);
  } catch {
    pincodes = [];
  }
}
    if (!name || !mobile || !pincodes || pincodes.length === 0) {
      return res.status(400).json({ error: "Required fields missing" });
    }

  

    let user;
console.log("SERVICE IDS:", service_ids);
console.log("FINAL SERVICE ID:", service_id);
    // ================= UPDATE =================
    if (existing.rows.length > 0) {

      const old = existing.rows[0]; // ✅ FIX
      // example for name change
      if (existing.rows[0].name !== name) {
        await pool.query(
          `INSERT INTO staff_changes (staff_id, field, old_value, new_value)
     VALUES ($1,$2,$3,$4)`,
          [existing.rows[0].id, "Name", existing.rows[0].name, name]
        );
      }

      // ================= CHANGE TRACKING =================
      if (old.name !== name) {
        await pool.query(
          `INSERT INTO staff_changes (staff_id, field, old_value, new_value)
           VALUES ($1,$2,$3,$4)`,
          [old.id, "Name", old.name, name]
        );
      }

      if (old.email !== email) {
        await pool.query(
          `INSERT INTO staff_changes (staff_id, field, old_value, new_value)
           VALUES ($1,$2,$3,$4)`,
          [old.id, "Email", old.email, email]
        );
      }

      if (old.id_proof_no !== id_proof_no) {
        await pool.query(
          `INSERT INTO staff_changes (staff_id, field, old_value, new_value)
           VALUES ($1,$2,$3,$4)`,
          [old.id, "ID Proof No", old.id_proof_no, id_proof_no]
        );
      }

      if (old.service_names?.toString() !== service_names?.toString()) {
        await pool.query(
          `INSERT INTO staff_changes (staff_id, field, old_value, new_value)
           VALUES ($1,$2,$3,$4)`,
          [old.id, "Service", old.service_names, service_names]
        );
      }

     // ================= UPDATE QUERY ================= 
const result = await pool.query(`
  UPDATE staff SET
    name=$1,
    alt_mobile=$2,
    email=$3,
    qualification=$4,
    experience=$5,
    address=$6,
    pincodes=$7,
    service_id=$8, 
    service_ids=$9,
    service_names=$10,
    location=$11,
    id_proof=$12,
    id_proof_no=$13,
    id_image=$14,
    profile_image=$15,
    camera_image=$16,
    agree_terms=$17
  WHERE mobile=$18
  RETURNING *
`, [
  name,
  alt_mobile,
  email,
  qualification,
  experience,
  address,
  pincodes,

  service_id,   // ✅ FIX ADDED

  JSON.stringify(parsedServices || []),
 "{" + (parsedServiceNames || []).join(",") + "}",

parsedLocation
  ? JSON.stringify(parsedLocation)
  : null,
  id_proof || null,
  id_proof_no || null,
  id_image || null,
  profile_image || null,
  camera_image || null,
  agree_terms || false,
  mobile
]);

user = result.rows[0];

} else {

  // ================= INSERT =================
  const result = await pool.query(
    `INSERT INTO staff 
(name, mobile, alt_mobile, email, qualification, experience, address, pincodes, service_id, service_ids, service_names, location, id_proof, id_proof_no, id_image, profile_image, camera_image, agree_terms, unit_balance)
VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
RETURNING *`,
    [
      name,
      mobile,
      alt_mobile,
      email,
      qualification,
      experience,
      address,
      pincodes,

      service_id,   // ✅ FIX ADDED

   JSON.stringify(parsedServices || []),
      "{" + (parsedServiceNames || []).join(",") + "}",

parsedLocation
  ? JSON.stringify(parsedLocation)
  : null,
      id_proof || null,
      id_proof_no || null,
      id_image || null,
      profile_image || null,
      camera_image || null,
      agree_terms || false,
      1   // ⭐ FREE UNIT
    ]
  );

  user = result.rows[0];
}
    // ================= TOKEN =================
const token = jwt.sign(
  { id: user.id, mobile: user.mobile },
  process.env.JWT_SECRET,
  { expiresIn: "7d" }
);

res.json({
  success: true,
  token,

  id: user.id,
  staff_id: user.id,

  user
});

  } catch (err) {
    console.log(err);
    res.status(500).json({ error: "Server error" });
  }

});

// ================= STAFF PROFILE =================
router.get("/profile", verifyToken, async (req, res) => {

  try {

    const result = await pool.query(
      "SELECT * FROM staff WHERE id=$1",
      [req.user.id]
    );

    res.json(result.rows[0] || {});

  } catch (err) {
    console.log(err);
    res.status(500).json({ error: "Server error" });
  }

});

// ================= WALLET =================
router.get("/wallet", verifyToken, async (req, res) => {

  const result = await pool.query(
    "SELECT wallet_balance, unit_balance FROM staff WHERE id=$1",
    [req.user.id]
  );

  res.json({
    wallet_balance: result.rows[0]?.wallet_balance || 0
  });

});
// ================= TRANSECTION =================
router.get("/transactions", verifyToken, async (req, res) => {

  try {

    const staff_id = req.user.id; // from token

    const result = await pool.query(`
      SELECT *
      FROM wallet_transactions
      WHERE staff_id = $1
      ORDER BY id DESC
    `, [staff_id]);

    res.json(result.rows);

  } catch (err) {

    console.log(err);
    res.status(500).json({ error: "Server error" });

  }

});
// ================= WORK HISTORY =================
router.get("/work-history", verifyToken, async (req, res) => {

  try {

    const result = await pool.query(
      "SELECT * FROM service_requests WHERE staff_id=$1 AND status='completed' ORDER BY created_at DESC",
      [req.user.id] // ✅ FIX HERE
    );

    res.json(result.rows);

  } catch (err) {
    console.log(err);
    res.status(500).json({ error: "Server error" });
  }

});
// ================= GET MATCHED REQUESTS =================
// ================= GET MATCHED REQUESTS (5KM + SERVICE MATCH) =================
router.get("/pending", verifyToken, async (req, res) => {

  try {

    const staffId = req.user.id;

    // ✅ GET STAFF DATA
    const staffRes = await pool.query(
      `SELECT service_ids, location FROM staff WHERE id=$1`,
      [staffId]
    );

    const staff = staffRes.rows[0];

    if (!staff) {
      return res.json([]);
    }

    let staffLocation;

    try {

      staffLocation = typeof staff.location === "string"
        ? JSON.parse(staff.location)
        : staff.location;



    } catch (e) {

      console.log("LOCATION PARSE ERROR:", staff.location);

      return res.json([]);

    }

    if (!staffLocation?.lat || !staffLocation?.lng) {
      return res.json([]);
    }

    // ✅ GET ALL REQUESTS + SERVICE DETAILS
    const result = await pool.query(`
SELECT 
    sr.*,
    u.name AS customer_name,
    u.mobile AS customer_mobile,
    sr.address AS customer_address,
    s.name AS service_name,
    s.price,
    s.service_type,
    s.unit_cost
FROM service_requests sr
LEFT JOIN users u ON sr.customer_id = u.id
LEFT JOIN services s ON sr.service_id = s.id
WHERE (
    -- ✅ PENDING: show only unassigned OR reassigned
    (sr.status = 'pending' AND (sr.staff_id IS NULL OR sr.reassign = true))

    -- ✅ ACCEPTED / IN_PROGRESS: only assigned staff sees
    OR (sr.status IN ('accepted','waiting_customer_confirm','otp_pending','in_progress')
        AND sr.staff_id = $1)

    -- ✅ COMPLETED: only assigned staff sees
    OR (sr.status = 'completed' AND sr.staff_id = $1)
)
ORDER BY sr.id DESC
LIMIT 50
`, [staffId]);

    const requests = result.rows;

    const filtered = requests.filter(req => {

      // ❌ hide from rejected staff
      if (req.rejected_staff_ids?.includes(staffId)) {
        return false;
      }


      // ================= STAFF SERVICES =================
      let staffServices = [];

      try {

        let raw = staff.service_ids;

        // ✅ ARRAY CASE (IMPORTANT FIX)
        if (Array.isArray(raw)) {
          staffServices = raw
            .map(s => Number(s))
            .filter(s => !isNaN(s));
        }

        // ✅ STRING CASE
        else if (typeof raw === "string") {

          raw = raw.trim();

          // JSON string "[1,2]"
          if (raw.startsWith("[")) {
            staffServices = JSON.parse(raw)
              .map(s => Number(s))
              .filter(s => !isNaN(s));
          }

          // postgres "{1,2}"
          else if (raw.startsWith("{")) {
            staffServices = raw
              .replace(/[{}]/g, "")
              .split(",")
              .map(s => Number(s.trim()))
              .filter(s => !isNaN(s));
          }

          // fallback
          else {
            staffServices = raw
              .split(",")
              .map(s => Number(s.trim()))
              .filter(s => !isNaN(s));
          }
        }

      } catch (e) {
        console.log("SERVICE PARSE ERROR:", staff.service_ids);
      }



      // ================= SERVICE CHECK =================
      const reqService = Number(req.service_id);

      if (!staffServices.some(s => Number(s) === reqService)) {
        console.log("❌ SERVICE NOT MATCH", staffServices, reqService);
        return false;
      }
      // ================= LOCATION CHECK =================


      if (!req.latitude || !req.longitude) {
        console.log("❌ NO LAT LNG");
        return false;
      }

      // ================= DISTANCE =================
      const distance = getDistance(
        staffLocation.lat,
        staffLocation.lng,
        req.latitude,
        req.longitude
      );



      if (!distance || distance <= 5) {



        req.distance = distance.toFixed(2);

        return true;
      }

      console.log("❌ TOO FAR");

      return false;

    });

    res.json(filtered);

  } catch (err) {
    console.log(err);
    res.status(500).json({ error: "Server error" });
  }

});

function getDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // KM
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) *
    Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

// ================= ACCEPT REQUEST + UNIT BALANCE ALSO=================
router.post("/accept", verifyToken, async (req, res) => {

  try {

    const { request_id } = req.body;
    const staffId = req.user.id;

    // 🔥 GET SERVICE TYPE + UNIT
    const reqData = await pool.query(`
      SELECT sv.unit_cost, sv.service_type
      FROM service_requests sr
      LEFT JOIN services sv ON sr.service_id = sv.id
      WHERE sr.id=$1
    `, [request_id]);

    const requiredUnit = reqData.rows[0]?.unit_cost || 0;
    const type = reqData.rows[0]?.service_type;

    // 🔥 CHECK UNIT BALANCE
    if (type === "unit") {

      const staffRes = await pool.query(
        "SELECT unit_balance FROM staff WHERE id=$1",
        [staffId]
      );

      const currentUnit = staffRes.rows[0]?.unit_balance || 0;

      if (currentUnit < requiredUnit) {
        return res.status(400).json({
          error: "Your unit balance is low. Please purchase additional unit balance."
        });
      }
    }

    // ✅ YOUR EXISTING ACCEPT LOGIC
    const result = await pool.query(`
      UPDATE service_requests 
      SET 
        status='accepted',
        staff_id=$1,
        reassign=false
      WHERE id=$2 
      AND (staff_id IS NULL OR reassign=true)
      RETURNING *
    `, [staffId, request_id]);

    if (result.rows.length === 0) {
      return res.status(400).json({
        error: "This request is already accepted by another staff"
      });
    }

    // 🔥 DEDUCT UNIT
    if (type === "unit" && requiredUnit > 0) {
      await pool.query(`
        UPDATE staff
        SET unit_balance = unit_balance - $1
        WHERE id=$2
      `, [requiredUnit, staffId]);
    }

    res.json({ success: true });

  } catch (err) {
    console.log(err);
    res.status(500).json({ error: "Server error" });
  }

});
// ================= START CONFIRMATION =================
router.post("/start-confirmation", verifyToken, async (req, res) => {

  try {

    const {
      request_id,
      start_time,
      approx_type,
      additional_cost,
      extra_service_cost,
      extra_material_cost,
      approx_total
    } = req.body;

    console.log("START CONFIRM BODY:", req.body);

    await pool.query(`
    UPDATE service_requests
    SET
        status='waiting_customer_confirm',
        start_time=$1,
        approx_type=$2,
        additional_cost=$3,
        extra_service_cost=$4,
        extra_material_cost=$5,
        approx_total=$6
    WHERE id=$7
`, [
      start_time,
      approx_type,
      additional_cost,
      extra_service_cost,
      extra_material_cost,
      approx_total,
      request_id
    ]);

    res.json({
      success: true
    });

  } catch (err) {

    console.log("========== START CONFIRM ERROR ==========");
    console.log(err);
    console.log("MESSAGE:", err.message);
    console.log("STACK:", err.stack);

    res.status(500).json({
      error: err.message
    });

  }

});
// confirmation OTP verify
router.post("/verify-start-otp", verifyToken, async (req, res) => {

  try {

    const { request_id, otp } = req.body;

    const result = await pool.query(
      `SELECT start_otp
       FROM service_requests
       WHERE id=$1`,
      [request_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: "Request not found"
      });
    }

    const sessionId = result.rows[0].start_otp;

    const verifyResponse = await axios.get(
      `https://2factor.in/API/V1/${TWO_FACTOR_API_KEY}/SMS/VERIFY/${sessionId}/${otp}`
    );

    if (verifyResponse.data.Status !== "Success") {

      return res.status(400).json({
        error: "Invalid OTP"
      });

    }

    await pool.query(
      `UPDATE service_requests
       SET status='in_progress'
       WHERE id=$1`,
      [request_id]
    );

    res.json({
      success: true
    });

  } catch (err) {

    console.log(
      "START OTP VERIFY ERROR:",
      err.response?.data || err.message
    );

    res.status(500).json({
      error: "OTP verification failed"
    });

  }

});
// ================= ACCEPT REQUEST =================
// ================= NEARBY STAFF (3KM + GEO-FENCING) =================
router.post("/nearby", async (req, res) => {

  try {

    const { lat, lng } = req.body;

    // Ahmedabad center (you can change later)
    const allowedLat = 23.0225;
    const allowedLng = 72.5714;

    // ================= GEO-FENCING =================
    const userDistance = getDistance(lat, lng, allowedLat, allowedLng);

    if (userDistance > 3) {
      return res.json({
        success: false,
        message: "Service not available in your area"
      });
    }

    // ================= GET STAFF FROM DB =================
    const result = await pool.query(
      "SELECT * FROM staff WHERE location IS NOT NULL"
    );

    const allStaff = result.rows;

    // ================= FILTER STAFF =================
    const nearbyStaff = allStaff.filter(staff => {

      if (!staff.location) return false;

      let staffLocation;

      try {
        staffLocation = typeof staff.location === "string"
          ? JSON.parse(staff.location)
          : staff.location;
      } catch {
        return false;
      }

      if (!staffLocation.lat || !staffLocation.lng) return false;

      const distance = getDistance(
        lat,
        lng,
        staffLocation.lat,
        staffLocation.lng
      );

      return distance <= 3; // ✅ 3KM RADIUS

    });

    res.json({
      success: true,
      staff: nearbyStaff
    });

  } catch (err) {

    console.error(err);

    res.status(500).json({
      success: false,
      message: "Error finding nearby staff"
    });

  }

});


// ================= ALL STAFF (ADMIN) =================
router.get("/staff", async (req, res) => {

  try {

    const result = await pool.query(`
      SELECT 
  s.id,
  s.name,
  s.mobile,
  s.location,
  s.pincodes,

  COALESCE(
    (
      SELECT STRING_AGG(srv.name, ', ')
      FROM services srv
      WHERE srv.id = ANY(
        COALESCE(
          string_to_array(
            REPLACE(REPLACE(s.service_ids::text,'[',''),']',''),
            ','
          )::int[],
          ARRAY[]::int[]
        )
      )
    ),
    '-'
  ) AS service_name

FROM staff s
ORDER BY s.id DESC;
    `);

    res.json(result.rows);

  } catch (err) {
    console.log("ADMIN STAFF ERROR:", err);
    res.status(500).json({ error: "Server error" });
  }

});

// ================= ACCOUNT DETAILS ( for staff)=================
router.post("/account-details", verifyToken, async (req, res) => {

  try {

    const { acc_name, upi, acc_mobile } = req.body;

    await pool.query(`
      UPDATE staff SET
        acc_name=$1,
        upi=$2,
        acc_mobile=$3
      WHERE id=$4
    `, [acc_name, upi, acc_mobile, req.user.id]);

    res.json({ success: true });

  } catch (err) {
    console.log(err);
    res.status(500).json({ error: "Server error" });
  }

});




// ================= QR UPLOAD =================

router.post(
  "/upload-qr",
  verifyToken,
  upload.single("qr"),
  async (req, res) => {

    try {

      const filePath = req.file.path;

      await pool.query(
        "UPDATE staff SET qr=$1 WHERE id=$2",
        [filePath, req.user.id]
      );

      res.json({
        success: true,
        path: filePath
      });

    } catch (err) {

      console.log(err);

      res.status(500).json({
        error: "Upload failed"
      });

    }

  }
);

// ================= PAYMENT DONE =================
router.post("/payment-done", verifyToken, async (req, res) => {

  try {

    const {
      request_id,
      additional_cost,
      material_total,
      total_amount,
      payment_type
    } = req.body;

    const staff_id = req.user.id;

    // get request + service price
    const result = await pool.query(`
      SELECT sr.*, s.price, st.name as staff_name
      FROM service_requests sr
      LEFT JOIN services s ON sr.service_id = s.id
      LEFT JOIN staff st ON sr.staff_id = st.id
      WHERE sr.id=$1
    `, [request_id]);

    const reqData = result.rows[0];

    if (!reqData) {
      return res.status(404).json({ error: "Request not found" });
    }

    const service_price = Number(reqData.price || 0);

    // ================= CALCULATIONS =================
    const total_service_charges = service_price + Number(additional_cost || 0);

    const material_charges = Number(material_total || 0);

    const total_amount_final = total_service_charges + material_charges;

    const staff_amount = total_service_charges * 0.85;

    const vinsuu_amount = total_service_charges * 0.15;

    // ================= WALLET LOGIC =================

    const walletRes = await pool.query(
      "SELECT wallet_balance, unit_balance FROM staff WHERE id=$1",
      [staff_id]
    );

    let wallet = Number(walletRes.rows[0]?.wallet_balance || 0);
    let pending = 0;

    // ===== CASH =====
    if (payment_type === "Cash") {

      const vinsuu_amount = total_service_charges * 0.15;

      wallet = wallet - vinsuu_amount;

    }

    // ===== UPI =====
    if (payment_type === "UPI") {

      const staff_amount = total_service_charges * 0.85;

      wallet = wallet + staff_amount;

    }

    // ===== PENDING RULE =====
    if (wallet < 0) {
      pending = wallet;
    } else {
      pending = 0;
    }

    // ===== SAVE WALLET =====
    // ===== SAVE WALLET + TRANSACTION =====

    // 🔹 opening balance
    const opening_balance = Number(walletRes.rows[0]?.wallet_balance || 0);

    // 🔹 update wallet
    await pool.query(
      "UPDATE staff SET wallet_balance=$1 WHERE id=$2",
      [wallet, staff_id]
    );

    // 🔹 closing balance
    const closing_balance = wallet;

    // 🔹 transaction type + amount
    let type = "";
    let txnAmount = 0;

    if (payment_type === "Cash") {
      type = "withdraw";
      txnAmount = vinsuu_amount;
    }

    if (payment_type === "UPI") {
      type = "deposit";
      txnAmount = staff_amount;
    }

    // 🔹 save transaction (FIXED)
    await pool.query(`
  INSERT INTO wallet_transactions
  (staff_id, amount, type, opening_balance, closing_balance)
  VALUES ($1,$2,$3,$4,$5)
`, [
      staff_id,
      txnAmount,
      type,
      opening_balance,
      closing_balance
    ]);

    // ================= INSERT PAYMENT =================
    await pool.query(`
INSERT INTO payment_history
(request_id, staff_id, staff_name,
 service_charges, material_charges, total_amount,
 staff_amount, vinsuu_amount,
 payment_type, pending_fee, wallet_amount, created_at)

VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW())
`, [
      request_id,
      staff_id,
      reqData.staff_name,
      total_service_charges,
      material_charges,
      total_amount_final,
      staff_amount,
      vinsuu_amount,
      payment_type,
      pending,     // ✅ ADD THIS
      wallet       // ✅ ADD THIS
    ]);

    // ================= UPDATE REQUEST =================
    await pool.query(`
      UPDATE service_requests
      SET status='completed'
      WHERE id=$1
    `, [request_id]);
    // ================= CREATE INVOICE =================

    // create items
    const items = [
      {
        name: reqData.heading || "Service",
        qty: 1,
        price: total_service_charges,
        amount: total_amount_final
      }
    ];

    // insert invoice
    await pool.query(`
  INSERT INTO invoices
  (service_id, staff_id, staff_name,
   customer_id, customer_name,
   payment_mode, items, service_time, created_at)

  VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())
`, [
      request_id,
      staff_id,
      reqData.staff_name,
      reqData.customer_id,
      reqData.customer_name,
      payment_type,
      JSON.stringify(items),
      reqData.start_time || "Instant"
    ]);

    res.json({ success: true });


  } catch (err) {
    console.log(err);
    res.status(500).json({ error: "Server error" });
  }
  // ================= TRANSACTION HISTORY =================

  // const opening_balance = Number(walletRes.rows[0]?.wallet_balance || 0);
  // const closing_balance = wallet;

  // let type = "";
  // let txnAmount = 0;

  // if(payment_type === "Cash"){
  //     type = "withdraw";
  //     txnAmount = vinsuu_amount;
  // }

  // if(payment_type === "UPI"){
  //     type = "deposit";
  //     txnAmount = staff_amount;
  // }

  // await pool.query(`
  // INSERT INTO wallet_transactions
  // (staff_id, amount, type, opening_balance, closing_balance)
  // VALUES ($1,$2,$3,$4,$5)
  // `, [
  //   staff_id,
  //   txnAmount,
  //   type,
  //   opening_balance,
  //   closing_balance
  // ]);

});

// ================= GET INVOICE =================
router.get("/invoice/:id", async (req, res) => {
  try {

    const result = await pool.query(
      "SELECT * FROM invoices WHERE service_id=$1",
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Invoice not found" });
    }

    const invoice = result.rows[0];

    invoice.items = JSON.parse(invoice.items || "[]");

    res.json(invoice);

  } catch (err) {
    console.log(err);
    res.status(500).json({ error: "Server error" });
  }
});
/* ==============================
   WALLET WITHDRAW REQUEST
============================== */
router.post("/wallet-withdraw", verifyToken, async (req, res) => {

  try {

    const { amount } = req.body;
    const staff_id = req.user.id;

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: "Invalid amount" });
    }

    await pool.query(`
      INSERT INTO wallet_requests (staff_id, amount, status)
      VALUES ($1,$2,'pending')
    `, [staff_id, amount]);

    const { getIO } = require("../socket");
    const io = getIO();

    io.emit("admin_notification", {
      message: "New withdraw request received",
      staff_id
    });

    res.json({ success: true });

  } catch (err) {
    console.log(err);
    res.status(500).json({ error: "Server error" });
  }

});

/* ==============================
   GET WALLET REQUEST STATUS
============================== */
router.get("/wallet-requests", verifyToken, async (req, res) => {

  try {

    const staff_id = req.user.id;

    const result = await pool.query(`
      SELECT * FROM wallet_requests
      WHERE staff_id=$1
      ORDER BY id DESC
    `, [staff_id]);

    res.json(result.rows);

  } catch (err) {
    console.log(err);
    res.status(500).json({ error: "Server error" });
  }

});

// rating and feedback for staff
router.get("/rating", verifyToken, async (req, res) => {

  const staff_id = req.user.id;

  const result = await pool.query(`
        SELECT 
            AVG(rating) as avg,
            COUNT(rating) as count
        FROM service_requests
        WHERE staff_id=$1 AND rating IS NOT NULL
    `, [staff_id]);

  res.json({
    avg: result.rows[0].avg || 0,
    count: result.rows[0].count || 0
  });

});

router.get("/feedback", verifyToken, async (req, res) => {

  try {

    const staff_id = req.user.id;

    const result = await pool.query(`
            SELECT sr.rating, sr.feedback, u.name as customer_name
            FROM service_requests sr
            LEFT JOIN users u ON sr.customer_id = u.id
            WHERE sr.staff_id=$1 AND sr.rating IS NOT NULL
            ORDER BY sr.id DESC
LIMIT 50
        `, [staff_id]);

    res.json(result.rows);

  } catch (err) {
    console.log("FEEDBACK ERROR:", err);
    res.status(500).json({ error: "Server error" });
  }

});
// ✅ GET STAFF RATING BY ID (for customer side)
router.get("/rating/:id", async (req, res) => {

  try {

    const staff_id = req.params.id;

    const result = await pool.query(`
            SELECT 
                AVG(rating) as avg,
                COUNT(rating) as count
            FROM service_requests
            WHERE staff_id=$1 AND rating IS NOT NULL
        `, [staff_id]);

    res.json({
      avg: result.rows[0].avg || 0,
      count: result.rows[0].count || 0
    });

  } catch (err) {
    console.log("RATING ERROR:", err);
    res.status(500).json({ error: "Server error" });
  }

});

// ✅ GET STAFF FEEDBACK BY ID (for customer)
router.get("/feedback/:id", async (req, res) => {

  try {

    const staff_id = req.params.id;

    const result = await pool.query(`
            SELECT sr.rating, sr.feedback, u.name as customer_name
            FROM service_requests sr
            LEFT JOIN users u ON sr.customer_id = u.id
            WHERE sr.staff_id=$1 AND sr.rating IS NOT NULL
            ORDER BY sr.id DESC
LIMIT 50
        `, [staff_id]);

    res.json(result.rows);

  } catch (err) {
    console.log("FEEDBACK ERROR:", err);
    res.status(500).json({ error: "Server error" });
  }

});

// ================= STAFF CANCEL =================
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
           cancelled_by='staff'
       WHERE id=$2 AND staff_id=$3`,
      [remark, request_id, req.user.id]
    );

    res.json({ success: true });

  } catch (err) {
    console.log("STAFF CANCEL ERROR:", err);
    res.status(500).json({ error: "Server error" });
  }

});

// ================= RAZORPAY VERIFY (DEPOSIT ONLY) =================
router.post("/verify-payment", verifyToken, async (req, res) => {

  try {

    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      amount,
      unit   // 🔥 ADD THIS
    } = req.body;

    const staff_id = req.user.id;

    const crypto = require("crypto");

    // 🔹 VERIFY SIGNATURE
    const body = razorpay_order_id + "|" + razorpay_payment_id;

    const expected = crypto
      .createHmac("sha256", process.env.RAZORPAY_SECRET)
      .update(body)
      .digest("hex");

    if (expected !== razorpay_signature) {
      return res.status(400).json({ success: false });
    }
    // 🔥 ADD UNIT AFTER PAYMENT SUCCESS
    if (unit) {
      await pool.query(`
    UPDATE staff
    SET unit_balance = COALESCE(unit_balance,0) + $1
    WHERE id=$2
  `, [unit, staff_id]);
    }

    // 🔹 GET CURRENT WALLET
    const walletRes = await pool.query(
      "SELECT wallet_balance, unit_balance FROM staff WHERE id=$1",
      [staff_id]
    );

    let opening = Number(walletRes.rows[0]?.wallet_balance || 0);

    // 🔹 NEW BALANCE (ONLY ADD)
    let closing = opening + Number(amount);

    // 🔹 UPDATE WALLET
    await pool.query(
      "UPDATE staff SET wallet_balance=$1 WHERE id=$2",
      [closing, staff_id]
    );

    // 🔹 SAVE TRANSACTION (DEPOSIT ONLY)
    await pool.query(`
      INSERT INTO wallet_transactions
      (staff_id, amount, type, opening_balance, closing_balance)
      VALUES ($1,$2,$3,$4,$5)
    `, [
      staff_id,
      amount,
      "deposit",   // ✅ ONLY deposit
      opening,
      closing
    ]);

    // 🔹 SOCKET UPDATE (optional but good)
    const { getIO } = require("../socket");
    const io = getIO();

    io.to("staff_" + staff_id).emit("staff_notification", {
      message: "Wallet credited ₹" + amount
    });

    res.json({ success: true });

  } catch (err) {
    console.log("VERIFY PAYMENT ERROR:", err);
    res.status(500).json({ success: false });
  }

});

// ------UNIT BALANCE-----
router.get("/unit/all", async (req, res) => {

  try {
    const result = await pool.query(
      "SELECT * FROM unit_rates ORDER BY unit ASC"
    );

    res.json(result.rows);

  } catch (err) {
    console.log(err);
    res.status(500).json({ error: "Server error" });
  }
});

// ---- UNIT BALANCE ROJGAR PAY-----
router.post("/verify-payment", verifyToken, async (req, res) => {

  try {

    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature
    } = req.body;

    const staff_id = req.user.id;
    const crypto = require("crypto");

    // 🔐 VERIFY SIGNATURE
    const body = razorpay_order_id + "|" + razorpay_payment_id;

    const expected = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(body)
      .digest("hex");

    if (expected !== razorpay_signature) {
      return res.status(400).json({ error: "Invalid signature" });
    }

    // 🔥 GET ORDER FROM DB (NOT FRONTEND)
    const orderRes = await pool.query(`
            SELECT * FROM unit_orders 
            WHERE order_id=$1 AND staff_id=$2
        `, [razorpay_order_id, staff_id]);

    if (orderRes.rows.length === 0) {
      return res.status(400).json({ error: "Order not found" });
    }

    const order = orderRes.rows[0];

    if (order.status === "paid") {
      return res.json({ success: true }); // already processed
    }

    // 🔥 VERIFY PAYMENT FROM RAZORPAY SERVER
    const axios = require("axios");

    const payment = await axios.get(
      `https://api.razorpay.com/v1/payments/${razorpay_payment_id}`,
      {
        auth: {
          username: process.env.RAZORPAY_KEY_ID,
          password: process.env.RAZORPAY_KEY_SECRET
        }
      }
    );

    if (payment.data.status !== "captured") {
      return res.status(400).json({ error: "Payment not completed" });
    }

    // 🔥 MATCH AMOUNT (IMPORTANT)
    if (payment.data.amount !== order.amount * 100) {
      return res.status(400).json({ error: "Amount mismatch" });
    }

    // 🔥 UPDATE UNIT BALANCE
    await pool.query(`
            UPDATE staff
            SET unit_balance = COALESCE(unit_balance,0) + $1
            WHERE id=$2
        `, [order.unit, staff_id]);

    // 🔥 MARK ORDER PAID
    await pool.query(`
            UPDATE unit_orders 
            SET status='paid', payment_id=$1
            WHERE order_id=$2
        `, [razorpay_payment_id, razorpay_order_id]);

    res.json({ success: true });

  } catch (err) {
    console.log("SECURE VERIFY ERROR:", err);
    res.status(500).json({ error: "Server error" });
  }

});

router.post("/add-unit", verifyToken, async (req, res) => {

  try {

    const { unit } = req.body;
    const staff_id = req.user.id;

    if (!unit || unit <= 0) {
      return res.status(400).json({ error: "Invalid unit" });
    }

    // 🔥 UPDATE UNIT BALANCE
    await pool.query(`
            UPDATE staff
            SET unit_balance = COALESCE(unit_balance,0) + $1
            WHERE id=$2
        `, [unit, staff_id]);

    res.json({ success: true });

  } catch (err) {
    console.log("ADD UNIT ERROR:", err);
    res.status(500).json({ error: "Server error" });
  }

});

// ================= CREATE ORDER (UNIT PURCHASE) =================
router.post("/create-order", verifyToken, async (req, res) => {

  try {

    const Razorpay = require("razorpay");

    const razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET
    });

    const { amount, unit } = req.body;
    const staff_id = req.user.id;

    if (!amount || !unit) {
      return res.status(400).json({ error: "Invalid data" });
    }

    // 🔥 GET REAL AMOUNT FROM DB (IMPORTANT)
    const unitRes = await pool.query(
      "SELECT amount FROM unit_rates WHERE unit=$1",
      [unit]
    );

    if (unitRes.rows.length === 0) {
      return res.status(400).json({ error: "Invalid unit" });
    }

    const realAmount = Number(unitRes.rows[0].amount);

    // 🔥 SECURITY CHECK
    if (Number(amount) !== realAmount) {
      console.log("❌ SERVICE NOT MATCH", realAmount, amount);
      return res.status(400).json({ error: "Amount mismatch" });
    }

    // 🔥 CREATE RAZORPAY ORDER
    const order = await razorpay.orders.create({
      amount: realAmount * 100,
      currency: "INR"
    });

    // 🔥 SAVE ORDER IN DB (FOR VERIFY)
    await pool.query(`
      INSERT INTO unit_orders (staff_id, order_id, amount, unit, status)
      VALUES ($1,$2,$3,$4,'created')
    `, [staff_id, order.id, realAmount, unit]);

    res.json(order);

  } catch (err) {
    console.log("CREATE ORDER ERROR:", err);
    res.status(500).json({ error: "Order failed" });
  }

});
module.exports = router;