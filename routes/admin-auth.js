const express = require("express");
const axios = require("axios");

const router = express.Router();


// ================= CONFIG =================

// YOUR 2FACTOR API KEY
const API_KEY =
"4b9fee3b-580b-11f1-8352-0200cd936042";

// YOUR ADMIN MOBILE
const ADMIN_MOBILE =
"9173199552";


// ================= LOGIN =================

router.post("/login", async (req,res)=>{

    const { username,password } = req.body;

    const ADMIN_USER = "admin";
    const ADMIN_PASS = "Vinsuu@#$9824";

    if(
        username !== ADMIN_USER ||
        password !== ADMIN_PASS
    ){
        return res.status(401).json({
            success:false,
            message:"Invalid credentials"
        });
    }

    try{

        // SEND OTP
        const response = await axios.get(
`https://2factor.in/API/V1/${API_KEY}/SMS/${ADMIN_MOBILE}/AUTOGEN`
        );

        // SAVE SESSION ID
        req.session.adminSessionId =
        response.data.Details;

        res.json({
            success:true,
            message:"OTP Sent"
        });

    }catch(err){

        console.log(err.response?.data || err);

        res.status(500).json({
            success:false,
            message:"OTP send failed"
        });

    }

});


// ================= VERIFY OTP =================

router.post("/verify-otp", async (req,res)=>{

    const { otp } = req.body;

    try{

        const sessionId =
        req.session.adminSessionId;

        const response = await axios.get(
`https://2factor.in/API/V1/${API_KEY}/SMS/VERIFY/${sessionId}/${otp}`
        );

        if(
            response.data.Status !== "Success"
        ){

            return res.status(401).json({
                success:false,
                message:"Invalid OTP"
            });

        }

        req.session.adminLoggedIn = true;

        delete req.session.adminSessionId;

        res.json({
            success:true
        });

    }catch(err){

        console.log(err.response?.data || err);

        res.status(500).json({
            success:false,
            message:"OTP verification failed"
        });

    }

});


// ================= CHECK LOGIN =================

router.get("/check",(req,res)=>{

    res.json({
        loggedIn:
        req.session.adminLoggedIn === true
    });

});


// ================= LOGOUT =================

router.post("/logout",(req,res)=>{

    req.session.destroy(()=>{

        res.json({
            success:true
        });

    });

});

module.exports = router;