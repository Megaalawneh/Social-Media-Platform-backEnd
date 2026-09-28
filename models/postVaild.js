const mongoose = require("mongoose");

const postSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
  },

  media: {
    type: String,
    required: true,
  },

  mediaPublicId: {
    type: String,
    default: null,
  },

  mediaType: {
    type: String,
    required: true,
  },

  postCaption: {
    type: String,
    default: "",
  },

  comments: [
    {
      userId: {
        type: String,
        required: true,
      },

      content: {
        type: String,
        required: true,
        trim: true,
      },
      createdAt: String,
      likes: [
        {
          userId: {
            type: String,
            required: true,
          },
        },
      ],
    },
  ],

  shares: [
    {
      userId: {
        type: String,
        required: true,
      },
    },
  ],

  likes: [
    {
      userId: {
        type: String,
        required: true,
      },
    },
  ],

  createdAt: {
    type: Date,
    default: Date.now,
  },
});

const Post = mongoose.model("Post", postSchema);

module.exports = Post;
