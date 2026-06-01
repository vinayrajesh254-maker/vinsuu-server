const express = require("express");
const router = express.Router();

const pool = require("../db");
const { verifyToken } = require("../middleware/auth");

const multer = require("multer");
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const cloudinary = require("../cloudinary");


/* =====================================================
   CLOUDINARY STORAGE CONFIG
===================================================== */

const storage = new CloudinaryStorage({

  cloudinary: cloudinary,

  params: async (req, file) => {

    let folder = "admin";

    if (req.originalUrl.includes("category")) {
      folder = "categories";
    }

    if (req.originalUrl.includes("service")) {
      folder = "services";
    }

    if (req.originalUrl.includes("qr")) {
      folder = "qrCodes";
    }

    if (req.originalUrl.includes("upload-image")) {
      folder = "appImages";
    }

    return {
      folder,
      allowed_formats: ["jpg", "jpeg", "png", "webp"]
    };

  }

});

const upload = multer({

  storage,

  limits: {
    fileSize: 5 * 1024 * 1024
  }

});

/* =====================================================
   DASHBOARD
===================================================== */
router.get("/dashboard", async (req,res)=>{

  try{

    const { from, to, type } = req.query;

    const fromDate = from || new Date(Date.now() - 7*86400000).toISOString().split("T")[0];
    const toDate = to || new Date().toISOString().split("T")[0];

    let groupBy = "DATE(created_at)";
    if(type === "monthly") groupBy = "TO_CHAR(created_at,'YYYY-MM')";
    if(type === "yearly") groupBy = "EXTRACT(YEAR FROM created_at)";

    // ✅ STATS (SAFE)
    const stats = await pool.query(`
      SELECT 
        (SELECT COUNT(*)::int FROM staff) as "totalStaff",
        (SELECT COUNT(*)::int FROM users WHERE role='customer') as "totalCustomers",
        (SELECT COUNT(*)::int FROM services) as "totalServices",
        (SELECT COUNT(*)::int FROM service_requests WHERE status='pending') as "pending",
        (SELECT COUNT(*)::int FROM service_requests WHERE status='completed') as "completed"
    `);

    const s = stats.rows[0];

    // ✅ REVENUE (SAFE)
   const revenue = await pool.query(`
  SELECT DATE(created_at) as day,
  SUM(COALESCE(additional_cost,0) + COALESCE(extra_service_cost,0)) as revenue
  FROM service_requests
  WHERE created_at BETWEEN $1::date AND $2::date + INTERVAL '1 day'
  GROUP BY day
  ORDER BY day ASC
`,[fromDate,toDate]);

    // ✅ EXPENSE (SAFE)
  const expense = await pool.query(`
  SELECT DATE(created_at) as day,
  0 as expense
  FROM service_requests
  WHERE created_at BETWEEN $1::date AND $2::date + INTERVAL '1 day'
  GROUP BY day
  ORDER BY day ASC
`,[fromDate,toDate]);

    const labels = revenue.rows.map(r=>r.day);
    const revenueData = revenue.rows.map(r=>Number(r.revenue));
    const expenseData = expense.rows.map(r=>Number(r.expense));
    const profitData = revenueData.map((r,i)=> r - (expenseData[i] || 0));

    // ✅ TOP SERVICES (SAFE JOIN)
    let topServices = [];
    try{
      const result = await pool.query(`
        SELECT s.name, COUNT(*) as total
        FROM service_requests sr
        LEFT JOIN services s ON s.id = sr.service_id
        WHERE DATE(sr.created_at) BETWEEN $1 AND $2
        GROUP BY s.name
        ORDER BY total DESC
        LIMIT 5
      `,[fromDate,toDate]);

      topServices = result.rows;
    }catch(e){
      console.log("TopServices error:", e.message);
    }

    // ✅ FINAL RESPONSE
    res.json({
      totalStaff: s.totalStaff || 0,
      totalCustomers: s.totalCustomers || 0,
      totalServices: s.totalServices || 0,
      pending: s.pending || 0,
      completed: s.completed || 0,

      labels,
      revenueLabels: labels,
      revenueData,
      expenseData,
      profitData,

      growth: 0,
      peakDay: labels[labels.length-1] || null,

      serviceLabels: topServices.map(r=>r.name || "Unknown"),
      serviceCounts: topServices.map(r=>r.total || 0)
    });

  }catch(err){
    console.log("🔥 DASHBOARD ERROR:", err);   // 👈 VERY IMPORTANT
    res.status(500).json({error:"Server error"});
  }

});
/* =====================================================
   ADD CATEGORY
===================================================== */

router.post(
  "/add-category",
  upload.single("image"),
  async (req, res) => {

    try {

      console.log("BODY:", req.body);
      console.log("FILE:", req.file);

      const name = req.body.name;

      if (!name || !req.file) {

        return res.status(400).json({
          success: false,
          error: "Name and image required"
        });

      }

      const image = req.file.path;

      const result = await pool.query(

        "INSERT INTO categories(name,image) VALUES($1,$2) RETURNING *",

        [name, image]

      );

      console.log("INSERTED:", result.rows[0]);

      res.json({
        success: true,
        category: result.rows[0]
      });

    } catch (err) {

      console.log("ERROR:", err);

      res.status(500).json({
        success: false,
        error: err.message
      });

    }

  }
);
// edit category
router.put(
"/category/:id",
upload.single("image"),
async(req,res)=>{

try{

const name = req.body.name;
const image = req.file.path;

await pool.query(
"UPDATE categories SET name=$1,image=$2 WHERE id=$3",
[name,image,req.params.id]
);

res.json({success:true});

}catch(err){

res.status(500).json({error:err.message});

}

});

/* =====================================================
   GET CATEGORIES
===================================================== */

router.get("/categories", async (req, res) => {

  try {

    const result =
      await pool.query(
        "SELECT * FROM categories ORDER BY id DESC"
      );

    res.json(result.rows);

  } catch (err) {

    res.status(500).json({
      error: err.message
    });

  }

});


/* =====================================================
   DELETE CATEGORY
===================================================== */

router.delete("/category/:id", async (req, res) => {

  try {

    await pool.query(
      "DELETE FROM categories WHERE id=$1",
      [req.params.id]
    );

    res.json({ success: true });

  } catch (err) {

    res.status(500).json({
      error: err.message
    });

  }

});


// ================= GET SERVICES =================
router.get("/services", async (req, res) => {

  try {

    const result = await pool.query(`
      SELECT services.*, categories.name as category_name
      FROM services
      LEFT JOIN categories
      ON categories.id = services.category_id
      ORDER BY services.id DESC
    `);

    res.json(result.rows);

  } catch (err) {

    console.log(err);
    res.status(500).json({ error: err.message });

  }

});

// ================= ADD SERVICE (WITH IMAGE UPLOAD) =================




// 🔥 ADD SERVICE
router.post(
  "/add-service",
 upload.single("image"),
  async (req, res) => {

    try {

      let {
  name,
  unit_cost,
  category_id,
  details,
  price,
  service_type
} = req.body;
// ✅ FIX INTEGER ERROR
price = price ? Number(price) : null;
unit_cost = unit_cost ? Number(unit_cost) : null;

      if (!req.file) {
        return res.status(400).json({ error: "Image required" });
      }

      const image = req.file.path;

      // ✅ FIX 1: convert category_id to number
      category_id = Number(category_id);

      // ✅ FIX 2: handle details properly
      if (typeof details === "string") {
        try {
          details = JSON.parse(details);
        } catch {
          details = [];
        }
      }

      const result = await pool.query(

        `INSERT INTO services
(name,image,unit_cost,category_id,details,price,service_type)
VALUES ($1,$2,$3,$4,$5,$6,$7)
RETURNING *`,

       [
  name,
  image,
  unit_cost,
  category_id,
  JSON.stringify(details),
  price,
service_type || null
]

      );

      res.json({ success: true, service: result.rows[0] });

    } catch (err) {

      console.log(err);

      res.status(500).json({ error: err.message });

    }

  }
);

// ================= POPULAR SERVICE =================
router.put("/toggle-popular/:id", async (req,res)=>{

  try{

    const id = req.params.id;

    // 🔥 toggle logic
    const result = await pool.query(`
      UPDATE services
      SET is_popular = NOT COALESCE(is_popular,false)
      WHERE id=$1
      RETURNING is_popular
    `,[id]);

    res.json({
      success:true,
      is_popular: result.rows[0].is_popular
    });

  }catch(err){
    console.log(err);
    res.status(500).json({ error:"Server error" });
  }

});

// ================= DELETE SERVICE =================
router.delete("/service/:id", async (req, res) => {

  try {

    await pool.query(
      "DELETE FROM services WHERE id=$1",
      [req.params.id]
    );

    res.json({ success: true });

  } catch (err) {

    console.log(err);

    res.status(500).json({ error: "Server error" });

  }

});

// ✅ GET POPULAR SERVICES
router.get("/services/popular", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT * FROM services 
      WHERE is_popular = true 
      ORDER BY id DESC
    `);

    res.json(result.rows);

  } catch (err) {
    console.log(err);
    res.status(500).json({ error: "Server error" });
  }
});
/* =====================================================
   STAFF
===================================================== */
// ================= STAFF LIST =================
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

      ARRAY(
        SELECT CAST(x AS INTEGER)
        FROM unnest(
          string_to_array(
            REPLACE(
              REPLACE(
                REPLACE(s.service_ids::text, '[', ''),
              ']', ''),
            '"', ''),
            ','
          )
        ) AS x
        WHERE x ~ '^[0-9]+$'
      )

    )
  ),
  '-'
) AS service_name

  FROM staff s
  ORDER BY s.id DESC
`);

    console.log("STAFF LIST:", result.rows); // 🔥 DEBUG

    res.json(result.rows);

  } catch (err) {
    console.log("ADMIN STAFF ERROR:", err);
    res.status(500).json({ error: "Server error" });
  }

});



// ================= GET SINGLE STAFF (VIEW PROFILE) =================
router.get("/staff/:id", async (req, res) => {

    try {

        const result = await pool.query(
            "SELECT * FROM staff WHERE id=$1",
            [req.params.id]
        );

        res.json(result.rows[0] || {});

    } catch (err) {
        console.log(err);
        res.status(500).json({ error: "Server error" });
    }

});

// ================= CHENGES IN PROFILE =================
router.get("/staff-changes/:id", async (req, res) => {
  const result = await pool.query(
    "SELECT * FROM staff_changes WHERE staff_id=$1 ORDER BY changed_at DESC",
    [req.params.id]
  );
  res.json(result.rows);
});
// ================= REMOVE STAFF =================
router.delete("/remove-staff/:id", async (req, res) => {

  try {

    const id = req.params.id;

    await pool.query("DELETE FROM staff WHERE id=$1", [id]);

    res.json({ success: true });

  } catch (err) {
    console.log("DELETE STAFF ERROR:", err);
    res.status(500).json({ error: "Server error" });
  }

});
/* =====================================================
   CUSTOMERS
===================================================== */

router.get("/customers", async (req, res) => {

  try {

    const result = await pool.query(`
     SELECT 
  u.id,
  u.name,
  u.mobile,

  COALESCE(r.location, '-') AS location,
  COALESCE(r.pincode, '-') AS pin_code,

  u.created_at

FROM users u

LEFT JOIN (
  SELECT DISTINCT ON (customer_id) customer_id, location, pincode
  FROM service_requests
  ORDER BY customer_id, created_at DESC
) r ON r.customer_id = u.id

WHERE u.role = 'customer'
ORDER BY u.id DESC;
    `);

    res.json(result.rows);

  } catch (err) {

    res.status(500).json({ error: err.message });

  }

});

// ================= UPDATE CUSTOMER LOCATION =================
router.post("/customer/update-location", async (req, res) => {

  try {

    const { mobile, location, pin_code } = req.body;

    await pool.query(
      "UPDATE users SET location=$1, pin_code=$2 WHERE mobile=$3",
      [location, pin_code, mobile]
    );

    res.json({ success: true });

  } catch (err) {
    console.log("UPDATE LOCATION ERROR:", err);
    res.status(500).json({ error: "Server error" });
  }

});

// ================= REMOVE CUSTOMER =================
router.delete("/remove-customer/:id", async (req, res) => {

  try {

    const id = req.params.id;

    await pool.query("DELETE FROM users WHERE id=$1 AND role='customer'", [id]);

    res.json({ success: true });

  } catch (err) {
    console.log("DELETE CUSTOMER ERROR:", err);
    res.status(500).json({ error: "Server error" });
  }

});
/* =====================================================
   PAYMENTS
===================================================== */

router.get("/payments", async (req, res) => {

  try {

   const result = await pool.query(`
  SELECT 
    payments.*,
    users.name,
    users.mobile,
    payments.purchased_unit,
    payments.remaining_unit
  FROM payment_history ph
JOIN staff s ON s.id = ph.staff_id
  ORDER BY payments.id DESC
`);

    res.json(result.rows);

  } catch (err) {

    res.status(500).json({ error: err.message });

  }

});


/* =====================================================
   PAYMENT HISTORY
===================================================== */

router.get("/payment-history", async (req, res) => {

  try {

    const result = await pool.query(`
      SELECT *
      FROM payment_history
      ORDER BY created_at DESC
    `);

    res.json(result.rows);

  } catch (err) {

    res.status(500).json({ error: err.message });

  }

});


/* =====================================================
   CONTACT MESSAGES
===================================================== */

router.get("/messages", async (req, res) => {
  try {

    const result = await pool.query(`
      SELECT * FROM messages
      ORDER BY id DESC
    `);

    console.log("DB RESULT:", result.rows);

    res.json(result.rows || []);

  } catch (err) {

    console.log("MESSAGES ERROR:", err);

    res.status(500).json([]);

  }
});

/* =====================================================
   PAYMENT QR CODE 
===================================================== */



/* ==============================
   UPLOAD QR CODE
============================== */
router.post(
  "/upload-qr",
  upload.single("qr"),
  async (req, res) => {

    try {

      const path = req.file.path;

      // REMOVE OLD QR
      await pool.query(
        "DELETE FROM app_images WHERE type='qr'"
      );

      // SAVE NEW QR
      await pool.query(
        "INSERT INTO app_images(type, path) VALUES($1,$2)",
        ["qr", path]
      );

      res.json({
        success: true,
        path
      });

    } catch (err) {

      console.log(err);

      res.status(500).json({
        success: false,
        error: err.message
      });

    }

});


/* ==============================
   GET SAVED QR CODE
============================== */
router.get("/get-qr", async (req, res) => {

  try {

    const result = await pool.query(`
      SELECT *
      FROM app_images
      WHERE type='qr'
      ORDER BY id DESC
      LIMIT 1
    `);

    res.json({
      success: true,
      path:
  result.rows[0]?.path ||
  result.rows[0]?.image ||
  ""
    });

  } catch (err) {

    res.status(500).json({
      success: false
    });

  }

});
/* ==============================
   WALLET PAYMENT REQUEST
============================== */
router.post("/wallet-deduct", async (req,res)=>{

  try{

    const { staff_id, amount, request_id } = req.body;

    if(!staff_id || !amount || !request_id){
      return res.status(400).json({ error:"Missing data" });
    }

    const deductAmount = Number(amount);

    if(deductAmount <= 0){
      return res.status(400).json({ error:"Invalid amount" });
    }

    // 🔹 GET CURRENT WALLET
    const walletRes = await pool.query(
      "SELECT wallet_balance FROM staff WHERE id=$1",
      [staff_id]
    );

    if(walletRes.rows.length === 0){
      return res.status(404).json({ error:"Staff not found" });
    }

    let currentWallet = Number(walletRes.rows[0].wallet_balance || 0);

    // 🔹 CALCULATE NEW WALLET
    let newWallet = currentWallet - deductAmount;

    // 🔹 UPDATE WALLET
    await pool.query(
      "UPDATE staff SET wallet_balance=$1 WHERE id=$2",
      [newWallet, staff_id]
    );
//     // 🔹 UPDATE PAYMENT DETAILS WALLET AMOUNT (SYNC)
// await pool.query(
//   `UPDATE payments 
//    SET wallet_amount = $1 
//    WHERE staff_id = $2`,
//   [newWallet, staff_id]
// );

    // 🔹 UPDATE REQUEST STATUS
    await pool.query(
      "UPDATE wallet_requests SET status='completed' WHERE id=$1",
      [request_id]
    );

    // 🔹 SAVE TRANSACTION (FIXED LOGIC)
    await pool.query(`
      INSERT INTO wallet_transactions
      (staff_id, amount, type, opening_balance, closing_balance)
      VALUES ($1,$2,$3,$4,$5)
    `,[
      staff_id,
      deductAmount,
      "withdraw",
      currentWallet,   // ✅ correct opening
      newWallet        // ✅ correct closing
    ]);

    // 🔹 SOCKET NOTIFICATION (SAFE CALL)
    try{
      const { getIO } = require("../socket");
      const io = getIO();

      io.to("staff_" + staff_id).emit("staff_notification", {
        message: "Withdraw completed"
      });
    }catch(e){
      console.log("Socket not available");
    }

    res.json({
      success:true,
      wallet:newWallet
    });

  }catch(err){
    console.log(err);
    res.status(500).json({ error:"Server error" });
  }

});


/* ==============================
   GET WALLET REQUESTS
============================== */
router.get("/wallet-requests", async (req,res)=>{

  try{

    const result = await pool.query(`
      SELECT 
        wr.id,
        wr.staff_id,
        s.name as staff_name,
        s.wallet_balance,
        wr.amount as withdraw_amount,
        wr.status,
        wr.created_at
      FROM wallet_requests wr
      JOIN staff s ON s.id = wr.staff_id
      ORDER BY wr.id DESC
    `);

    res.json(result.rows);

  }catch(err){
    console.log(err);
    res.status(500).json({ error:"Server error" });
  }

});

// ================= SERVICE REQUEST LIST =================
router.get("/service-requests", async (req, res) => {
  try {
    // 
    const result = await pool.query(`
      SELECT sr.*,
       u.name as customer_name,
       u.mobile,

       st.name as staff_name,
       st.mobile as staff_mobile,
       st.address as staff_address,

       sv.name AS service_name,
sv.unit_cost,
sv.service_type   -- ✅ THIS FIX
       

FROM service_requests sr

LEFT JOIN users u ON u.id = sr.customer_id
LEFT JOIN staff st ON st.id = sr.staff_id

LEFT JOIN services sv ON sv.id = sr.service_id   -- ✅ IMPORTANT

ORDER BY sr.id DESC
    `);

    res.json(result.rows);

  } catch (err) {
    console.log(err);
    res.status(500).json({ error: "Server error" });
  }
});

// CONTENT MANENGMENT
router.post("/content", async (req,res)=>{

  const { type, title, content } = req.body;

  await pool.query(`
    INSERT INTO content_pages (type,title,content)
    VALUES ($1,$2,$3)
    ON CONFLICT (type)
    DO UPDATE SET title=$2, content=$3
  `,[type,title,content]);

  res.json({ success:true });
});

// GET
router.get("/content/:type", async (req,res)=>{

  const result = await pool.query(
    "SELECT * FROM content_pages WHERE type=$1",
    [req.params.type]
  );

  res.json(result.rows[0] || {});
});

//  IMAGES upload - setting
router.get("/images/:type", async (req,res)=>{
    const result = await pool.query(
        "SELECT * FROM app_images WHERE type=$1 ORDER BY id DESC",
        [req.params.type]
    );
    res.json(result.rows);
});

// DELETE IMAGE
router.delete("/image/:id", async (req,res)=>{
    await pool.query("DELETE FROM app_images WHERE id=$1",[req.params.id]);
    res.json({success:true});
});

// ================= IMAGE UPLOAD (SETTING) =================
router.post("/upload-image", upload.single("image"), async (req, res) => {

  try {

    const { type, link } = req.body;

    if (!req.file || !type) {
      return res.status(400).json({ success:false, error:"Missing data" });
    }

    const path = req.file.path;

   await pool.query(
  "INSERT INTO app_images(type, path, link) VALUES($1,$2,$3)",
  [type, path, link || null]
);

    res.json({ success:true, path });

  } catch (err) {
    console.log("UPLOAD ERROR:", err);
    res.status(500).json({ success:false });
  }

});

router.post("/upload-multiple", upload.array("images", 10), async (req, res) => {

  try {

    const { type, link } = req.body;

    if (!req.files || req.files.length === 0) {
      return res.json({ success:false });
    }

    for (const file of req.files) {

      const path = file.path;

      await pool.query(
  "INSERT INTO app_images(type, path, link) VALUES($1,$2,$3)",
  [type, path, link || null]
);
    }

    res.json({ success:true });

  } catch (err) {
    console.log(err);
    res.json({ success:false });
  }

});

// ------UNIT BALANCE-----
router.post("/unit/add", async (req, res) => {

    const { unit, amount } = req.body;

    try {

        // 🔥 CHECK DUPLICATE
        const check = await pool.query(
            "SELECT * FROM unit_rates WHERE unit=$1",
            [unit]
        );

        if(check.rows.length > 0){
            return res.json({ error: "Unit already exists" });
        }

        await pool.query(
            "INSERT INTO unit_rates (unit, amount) VALUES ($1,$2)",
            [unit, amount]
        );

        res.json({ success: true });

    } catch (err) {
        console.log(err);
        res.status(500).json({ error: "Server error" });
    }
});

router.put("/unit/update/:id", async (req, res) => {

    const { id } = req.params;
    const { unit, amount } = req.body;

    try {

        await pool.query(
            "UPDATE unit_rates SET unit=$1, amount=$2 WHERE id=$3",
            [unit, amount, id]
        );

        res.json({ success: true });

    } catch (err) {
        console.log(err);
        res.status(500).json({ error: "Server error" });
    }
});

router.delete("/unit/delete/:id", async (req, res) => {

    const { id } = req.params;

    try {

        await pool.query(
            "DELETE FROM unit_rates WHERE id=$1",
            [id]
        );

        res.json({ success: true });

    } catch (err) {
        console.log(err);
        res.status(500).json({ error: "Server error" });
    }
});

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
// ------SEND MESSAGE-----
router.post("/contact", async (req, res) => {
  try {
    const { name, email, mobile, pin_code, message } = req.body;

    await pool.query(
      `INSERT INTO messages (name,email,mobile,pin_code,message)
       VALUES ($1,$2,$3,$4,$5)`,
      [name, email, mobile, pin_code, message]
    );

    res.json({ success: true });

  } catch (err) {
    console.log("CONTACT ERROR:", err);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;