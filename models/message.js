const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema(
  {
    senderId: {
      type: String,
      required: true,
      index: true,
    },
    recipientId: {
      type: String,
      required: true,
      index: true,
    },
    text: {
      type: String,
      default: "",
      trim: true,
      maxlength: 4000,
    },
    type: {
      type: String,
      enum: ["text", "post"],
      default: "text",
      required: true,
    },
    postId: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  },
);

messageSchema.index({ senderId: 1, recipientId: 1, createdAt: -1 });
messageSchema.index({ recipientId: 1, senderId: 1, createdAt: -1 });

module.exports = mongoose.model("Message", messageSchema);
