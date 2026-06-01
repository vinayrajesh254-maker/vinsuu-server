const jwt = require("jsonwebtoken");

// Verify Token
function verifyToken(req, res, next) {

  const header = req.headers.authorization;

  if (!header)
    return res.status(401).json({ message: "No token provided" });

  try {

    const token = header.split(" ")[1];
// ✅ ADD THIS BLOCK HERE
if (!token) {
  return res.status(401).json({ message: "Invalid token format" });
}
    const decoded = jwt.verify(
  token,
  process.env.JWT_SECRET
);

    req.user = decoded;

    next();

  } catch (err) {

    res.status(401).json({ message: "Invalid token" });

  }

}


// Role Check (optional but required for your import)
function requireRole(role) {

  return (req, res, next) => {

    if (!req.user || req.user.role !== role)
      return res.status(403).json({ message: "Access denied" });

    next();

  };

}
// EXPORT BOTH
module.exports = {
  verifyToken,
  requireRole
};