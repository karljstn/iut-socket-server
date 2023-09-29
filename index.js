const express = require("express");
const app = express();
const http = require("http");
const { Server } = require("socket.io");
const crypto = require("crypto");
const { SessionStore } = require("./SessionStore");
const { MessageStore } = require("./MessageStore");
const store = new SessionStore();
const messageStore = new MessageStore();

require("dotenv").config();

const https = require("https");
const fs = require("fs");

// const options = {
//   key: fs.readFileSync(process.env.KEY_PATH),
//   cert: fs.readFileSync(process.env.CERT_PATH),
// };

const server = http.createServer(app);
// const server = https.createServer(options, app);

const randomId = () => crypto.randomBytes(8).toString("hex");

const io = new Server(server, {
  cors: {
    origin: "*",
  },
});

app.get("/", (req, res) => {
  res.send();
});

const isCommand = (input) => {
  return input[0] === "/";
};

const isSpam = (socket) => {
  if (socket.lastMessage && socket.lastMessage > Date.now() - 2000) {
    if (socket.tries > 3) return true;
    else socket.tries += 1;
  } else {
    socket.tries = 0;
  }
  socket.lastMessage = Date.now();
  return false;
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

    if (isSpam(socket)) {
      socket.emit("error", {
        code: 100,
        error: "Dose le spam cousin",
      });
      return new Error("Dose le spam cousin");
    }

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

  // when a user is typing, broadcast the event to all the clients
  socket.on("user typing", (nickname) => {
    console.log("user is typing", nickname);
    socket.broadcast.emit("user typing", nickname);
  });

  // when a user stops typing, broadcast the event to all the clients
  socket.on("user stopped typing", (nickname) => {
    console.log("user stopped typing", nickname);
    socket.broadcast.emit("user stopped typing", nickname);
  });

  socket.on("user typing private", ({ username, to }) => {
    console.log("user typing private", username, to);

    socket.to(to).to(socket.userID).emit("user typing private", username);
  });

  socket.on("user stopped typing private", ({ username, to }) => {
    console.log("user stopped typing private", username, to);

    socket
      .to(to)
      .to(socket.userID)
      .emit("user stopped typing private", username);
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
});

server.listen(1234, () => {
  console.log("listening on *:1234");
});
