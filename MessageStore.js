class MessageStore {
  constructor() {
    this.messages = [];
    this.generalMessages = [];
  }

  saveMessage(message) {
    this.messages.push(message);
  }

  saveGeneralMessage(message) {
    this.generalMessages.push(message);
  }

  findMessagesForUser(userID) {
    return this.messages.filter(
      ({ from, to }) => from === userID || to === userID
    );
  }
}

module.exports = {
  MessageStore,
};
