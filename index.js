const express = require("express");
const app = express();
const http = require("http");
const server = http.createServer(app);
const { Server } = require("socket.io");
const crypto = require("crypto");
const { SessionStore } = require("./SessionStore");
const { MessageStore } = require("./MessageStore");
const store = new SessionStore();
const messageStore = new MessageStore();

const { EVENTS_IN, EVENTS_OUT } = require("./const.events");
const { ERRORS, ERROR_MESSAGES } = require("./const.errors");

const randomId = () => crypto.randomBytes(8).toString("hex");

const io = new Server(server, {
  cors: {
    origin: "http://localhost:3000",
  },
});

app.get("/", (req, res) => {
  res.send();
});

const isCommand = (input) => {
  return input[0] === "/";
};

io.use((socket, next) => {
  const sessionID = socket.handshake.auth.sessionID;

  if (sessionID) {
    // find existing session
    const session = store.findSession(sessionID);
    console.log("sessionID defined", sessionID, session);

    if (session) {
      socket.sessionID = sessionID;
      socket.userID = session.userID;
      socket.username = session.username;
      console.log("username is", socket.username);
      return next();
    }
  }

  const username = socket.handshake.auth.username;
  if (!username) {
    return next(new Error("invalid username"));
  }

  store.usernameAlreadyExists(username);
  // create new session
  socket.sessionID = randomId();
  socket.userID = randomId();
  socket.username = username;
  next();
});

io.on("connection", async (socket) => {
  // persist session
  store.saveSession(socket.sessionID, {
    userID: socket.userID,
    username: socket.username,
    connected: true,
  });

  socket.emit("session", {
    sessionID: socket.sessionID,
    userID: socket.userID,
  });

  // join the "userID" room
  socket.join(socket.userID);

  const users = [];
  const messagesPerUser = new Map();
  messageStore.findMessagesForUser(socket.userID).forEach((message) => {
    const { from, to } = message;
    const otherUser = socket.userID === from ? to : from;
    if (messagesPerUser.has(otherUser)) {
      messagesPerUser.get(otherUser).push(message);
    } else {
      messagesPerUser.set(otherUser, [message]);
    }
  });
  store.findAllSessions().forEach((session) => {
    users.push({
      userID: session.userID,
      username: session.username,
      connected: session.connected,
      messages: messagesPerUser.get(session.userID) || [],
    });
  });

  socket.emit("messages", messageStore.generalMessages);
  // send the user list to the user that just connected
  socket.emit("users", users);

  socket.broadcast.emit("user connected", {
    userID: socket.userID,
    username: socket.username,
    messages: messageStore.findMessagesForUser(socket.userID) || [],
    connected: true,
  });

  socket.on("message", ({ content }) => {
    const message = {
      content,
      from: socket.userID,
      username: socket.username,
    };

    if (isCommand(content)) {
      io.emit("command", content);
    } else {
      io.emit("message", message);
      messageStore.saveGeneralMessage(message);
    }
  });

  socket.on("private message", ({ content, to }) => {
    const message = {
      content,
      from: socket.userID,
      to,
      username: socket.username,
    };

    if (isCommand(content)) {
      socket.to(to).to(socket.userID).emit("command", content);
    } else {
      socket.to(to).to(socket.userID).emit("private message", message);
      messageStore.saveMessage(message);
    }
  });

  // // when a user is typing, broadcast the event to all the clients
  socket.on("user typing", (nickname) => {
    socket.broadcast.emit("user typing", nickname);
  });

  socket.on("disconnect", async () => {
    const matchingSockets = await io.in(socket.userID).allSockets();
    const isDisconnected = matchingSockets.size === 0;

    if (isDisconnected) {
      // notify other users
      socket.broadcast.emit("user disconnected", socket.userID);
      // update the connection status of the session
      store.saveSession(socket.sessionID, {
        userID: socket.userID,
        username: socket.username,
        connected: false,
      });
    }
  });

  const emitError = (errCode) => {
    socket.emit("chat error", {
      code: errCode,
      message: ERROR_MESSAGES[errCode],
    });
  };
});

// io.on("connection", (socket) => {
// const users = [];
// persist session
// store.saveSession(socket.sessionID, {
//   userID: socket.userID,
//   username: socket.username,
//   connected: true,
// });
// socket.emit("session", {
//   sessionID: socket.sessionID,
//   userID: socket.userID,
// });
// for (let [id, socket] of io.of("/").sockets) {
//   users.push({
//     userID: id,
//     username: socket.username,
//   });
// }
// io.emit("users", users);
// socket.on("private message", ({ content, to }) => {
//   socket.to(to).emit("private message", {
//     content,
//     from: socket.id,
//   });
// });
// socket.broadcast.emit("user connected", {
//   userID: socket.id,
//   username: socket.username,
// });
// const user = {
//   id: socket.id,
// };
// socket.on("set_nickname", (nickname) => {
//   console.log("nickname", nickname);
//   user.nickname = nickname;
//   users.push(user);
//   // give the client the initial state on connection
//   socket.emit("send_user_info", user);
//   // give the users list
//   io.emit("get_users_list", users);
//   // socket.emit("send_users", users);
//   // update the client everytime someone connects
//   socket.broadcast.emit("chat message", {
//     sender: "System",
//     content: `${user.nickname} joined the conversation`,
//   });
// });
// socket.on("disconnect", (data) => {
//   // console.log("user disconnected", socket.id);
//   const disconnected_user_id = users.findIndex(
//     (user) => user.id === socket.id
//   );
//   // console.log("length before", users.length);
//   if (disconnected_user_id !== -1) {
//     console.log(
//       "remove user with nickname",
//       users[disconnected_user_id].nickname
//     );
//     // say to everyone that this user disconnected
//     socket.broadcast.emit("chat message", {
//       sender: "System",
//       content: `${users[disconnected_user_id].nickname} disconnected`,
//     });
//     socket.broadcast.emit(
//       "user_stopped_typing",
//       users[disconnected_user_id].nickname
//     );
//     users.splice(disconnected_user_id, 1);
//     io.emit("get_users_list", users);
//     console.log(users);
//   }
//   // console.log("length after", users.length);
// });
// // when the server receives a message from a user
// socket.on("chat message", (msg) => {
//   console.log("message: " + msg);
//   // use io to emit to every client
//   io.emit("chat message", msg);
// });
// // when a user is typing, broadcast the event to all the clients
// socket.on("user_typing", (nickname) => {
//   socket.broadcast.emit("user_typing", nickname);
// });
// socket.on("user_stopped_typing", (nickname) => {
//   socket.broadcast.emit("user_stopped_typing", nickname);
// });
// });

server.listen(1234, () => {
  console.log("listening on *:1234");
});
