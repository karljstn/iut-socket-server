const { ERRORS, ERROR_MESSAGES } = require("./const.errors");

class SessionStore {
  constructor() {
    this.sessions = new Map();
  }

  findSession(id) {
    return this.sessions.get(id);
  }

  saveSession(id, session) {
    console.log("user saved", id, session);
    this.sessions.set(id, session);
    console.log("sessions", this.sessions);
  }

  usernameAlreadyExists(username) {
    console.log("check if", username, "is already taken");
    console.log(this.sessions.values());
    [...this.sessions.values()].forEach((session) => {
      console.log("username is", session.username);
      if (username === session.username) {
        return ERROR_MESSAGES[101];
      }
    });
  }

  findAllSessions() {
    return [...this.sessions.values()];
  }
}

module.exports = {
  SessionStore,
};
