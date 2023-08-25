const express = require("express");
const app = express();
const http = require("http");
const server = http.createServer(app);
const { Server } = require("socket.io");

const io = new Server(server, {
  cors: {
    origin: "http://localhost:3000",
  },
  //   allowEIO3: true,
});

let users = [];

app.get("/", (req, res) => {
  res.send();
});

io.on("connection", (socket) => {
  const user = {
    id: socket.id,
  };

  socket.on("set_nickname", (nickname) => {
    console.log("nickname", nickname);
    user.nickname = nickname;
    users.push(user);

    // give the client the initial state on connection
    socket.emit("send_user_info", user);
    io.emit("user_connect", users);
    // socket.emit("send_users", users);
  });

  // update the client everytime someone connects

  socket.on("disconnect", (data) => {
    // console.log("user disconnected", socket.id);
    const disconnected_user_id = users.findIndex(
      (user) => user.id === socket.id
    );
    // console.log("length before", users.length);
    if (disconnected_user_id !== -1) {
      console.log(
        "remove user with nickname",
        users[disconnected_user_id].nickname
      );
      users.splice(disconnected_user_id, 1);
      console.log(users);
    }
    // console.log("length after", users.length);
    io.emit("user_disconnect", users);
  });

  // when the server receives a message from a user
  socket.on("chat message", (msg) => {
    console.log("message: " + msg);

    // use io to emit to every client
    io.emit("chat message", msg);
  });
});

// io.listen(1234);

server.listen(1234, () => {
  console.log("listening on *:1234");
});
