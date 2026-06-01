const { Server } = require("socket.io");

let io;

// Initialize socket
function init(server) {

  io = new Server(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });

  io.on("connection", (socket) => {

    console.log("Socket connected:", socket.id);

    socket.on("joinStaffRoom", (staffId) => {

      socket.join("staff_" + staffId);

      console.log("Staff joined room:", staffId);

    });

    socket.on("disconnect", () => {
      console.log("Socket disconnected:", socket.id);
    });

  });

  return io;
}


// Get io instance anywhere
function getIO() {

  if (!io) {
    throw new Error("Socket.io not initialized");
  }

  return io;

}


module.exports = {
  init,
  getIO
};