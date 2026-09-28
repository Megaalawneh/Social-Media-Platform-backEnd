const mongoose = require("mongoose");
const Schema = mongoose.Schema;
const userSchema = new Schema(
  {
    userName: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    userEmail: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    userPassword: {
      type: String,
      required: true,
    },
    userFullName: {
      type: String,
      required: true,
    },
    userProfilePic: {
      type: String,
      default: "",
    },
    userBio: {
      type: String,
      default: "",
    },
    userBirthDate: {
      type: Date,
    },
    userCity: {
      name: {
        type: String,
        trim: true,
      },
      lat: Number,
      lon: Number,
    },
    followers: [
      {
        userFollower: {
          type: String,
          required: true,
        },
      },
    ],
    following: [
      {
        userfollowing: {
          type: String,
          required: true,
        },
      },
    ],
    pending: [
      {
        userFollower: {
          type: String,
          required: true,
        },
        userFollowing: {
          type: String,
          required: true,
        },
      },
    ],
    Notifications: [
      {
        userId: {
          type: Schema.Types.ObjectId,
          ref: "User",
          required: true,
        },
        type: {
          type: String,
          enum: ["follow", "comment", "like"],
          required: true,
        },
        postId: {
          type: String,
        },
        message: {
          type: String,
          required: true,
        },
        createdAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
  },
  {
    timestamps: true,
  },
);

const User = mongoose.model("User", userSchema);
module.exports = User;
