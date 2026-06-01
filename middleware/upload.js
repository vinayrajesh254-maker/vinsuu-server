// const multer = require("multer");

// const storage = multer.diskStorage({

// destination:(req,file,cb)=>{

// cb(null,"uploads/");

// },

// filename:(req,file,cb)=>{

// cb(null,Date.now()+"-"+file.originalname);

// }

// });

// const upload = multer({ storage });

// module.exports = upload;

const multer = require("multer");
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const cloudinary = require("../cloudinary");

const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: "vinsuu",
    allowed_formats: ["jpg", "jpeg", "png", "webp"],
  },
});

const upload = multer({ storage });

module.exports = upload;