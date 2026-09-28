const express = require("express");
const mongoose = require("mongoose");
const User = require("../models/userVaild");
const Message = require("../models/message");
const Post = require("../models/postVaild");
const { AppErorr, handleAsyncError } = require("../handleError");

const createMessagesRouter = (io) => {
  const router = express.Router();

  function checkUserIsLoggedIn(req, res, next) {
    if (!req.session.userId) {
      return res.status(401).json({ loggedIn: false });
    }

    next();
  }

  async function findChatUser(userId) {
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      throw new AppErorr("User not found", 404);
    }

    const user = await User.findById(userId)
      .select("_id userName userFullName userProfilePic")
      .lean();

    if (!user) {
      throw new AppErorr("User not found", 404);
    }

    return user;
  }

  async function addPostDetails(messages) {
    const postIds = messages
      .filter((message) => message.type === "post" && message.postId)
      .map((message) => message.postId);
    const posts = await Post.find({ _id: { $in: postIds } })
      .select("_id userId media mediaType postCaption createdAt")
      .lean();
    const postsById = new Map(posts.map((post) => [post._id.toString(), post]));
    const authors = await User.find({
      _id: { $in: posts.map((post) => post.userId) },
    })
      .select("_id userName")
      .lean();
    const authorsById = new Map(
      authors.map((author) => [author._id.toString(), author]),
    );

    return messages.map((message) => {
      if (message.type !== "post" || !message.postId) return message;
      const post = postsById.get(message.postId);
      return {
        ...message,
        post: post
          ? { ...post, author: authorsById.get(post.userId) || null }
          : null,
      };
    });
  }

  router.use(checkUserIsLoggedIn);

  router.get(
    "/conversations",
    handleAsyncError(async (req, res) => {
      const userId = req.session.userId;
      const conversations = await Message.aggregate([
        {
          $match: {
            $or: [{ senderId: userId }, { recipientId: userId }],
          },
        },
        { $sort: { createdAt: -1 } },
        {
          $group: {
            _id: {
              $cond: [
                { $eq: ["$senderId", userId] },
                "$recipientId",
                "$senderId",
              ],
            },
            lastMessage: {
              $first: {
                $cond: [{ $eq: ["$type", "post"] }, "Shared a post", "$text"],
              },
            },
            lastMessageAt: { $first: "$createdAt" },
            lastMessageSenderId: { $first: "$senderId" },
          },
        },
        { $sort: { lastMessageAt: -1 } },
      ]);

      const users = await User.find({
        _id: { $in: conversations.map(({ _id }) => _id) },
      })
        .select("_id userName userFullName userProfilePic")
        .lean();
      const usersById = new Map(users.map((user) => [user._id.toString(), user]));

      res.json(
        conversations.flatMap((conversation) => {
          const user = usersById.get(conversation._id);
          return user
            ? [
                {
                  user,
                  lastMessage: conversation.lastMessage,
                  lastMessageAt: conversation.lastMessageAt,
                  lastMessageSenderId: conversation.lastMessageSenderId,
                },
              ]
            : [];
        }),
      );
    }),
  );

  router.get(
    "/:userId",
    handleAsyncError(async (req, res) => {
      const currentUserId = req.session.userId;
      const user = await findChatUser(req.params.userId);

      if (user._id.toString() === currentUserId) {
        throw new AppErorr("You cannot message yourself", 400);
      }

      const recentMessages = await Message.find({
        $or: [
          { senderId: currentUserId, recipientId: user._id.toString() },
          { senderId: user._id.toString(), recipientId: currentUserId },
        ],
      })
        .sort({ createdAt: -1 })
        .limit(200)
        .lean();

      res.json({
        user,
        messages: await addPostDetails(recentMessages.reverse()),
      });
    }),
  );

  router.post(
    "/:userId",
    handleAsyncError(async (req, res) => {
      const senderId = req.session.userId;
      const recipient = await findChatUser(req.params.userId);
      const recipientId = recipient._id.toString();
      const text = typeof req.body.text === "string" ? req.body.text.trim() : "";

      if (recipientId === senderId) {
        throw new AppErorr("You cannot message yourself", 400);
      }

      if (!text) {
        throw new AppErorr("Message text is required", 400);
      }

      if (text.length > 4000) {
        throw new AppErorr("Message must be 4000 characters or fewer", 400);
      }

      const sender = await User.findById(senderId)
        .select("_id userName userFullName userProfilePic")
        .lean();
      if (!sender) {
        throw new AppErorr("User not found", 401);
      }

      const message = await Message.create({ senderId, recipientId, text });
      const payload = {
        ...message.toObject(),
        sender,
        recipient,
      };

      io.to(`user:${recipientId}`).emit("message:new", payload);
      io.to(`user:${senderId}`).emit("message:new", payload);

      res.status(201).json(message);
    }),
  );

  router.post(
    "/share/:postId",
    handleAsyncError(async (req, res) => {
      const senderId = req.session.userId;
      const { postId } = req.params;
      const recipientIds = req.body.recipientIds;

      if (!mongoose.Types.ObjectId.isValid(postId)) {
        throw new AppErorr("Post not found", 404);
      }

      if (
        !Array.isArray(recipientIds) ||
        recipientIds.length === 0 ||
        recipientIds.some((id) => typeof id !== "string")
      ) {
        throw new AppErorr("Choose at least one recipient", 400);
      }

      const uniqueRecipientIds = [...new Set(recipientIds)];
      if (
        uniqueRecipientIds.some(
          (id) => !mongoose.Types.ObjectId.isValid(id) || id === senderId,
        )
      ) {
        throw new AppErorr("Invalid recipient", 400);
      }

      const post = await Post.findById(postId)
        .select("_id userId media mediaType postCaption createdAt")
        .lean();
      if (!post) {
        throw new AppErorr("Post not found", 404);
      }

      const senderWithFollowing = await User.findById(senderId)
        .select("following")
        .lean();
      if (!senderWithFollowing) {
        throw new AppErorr("User not found", 401);
      }

      const followedIds = new Set(
        senderWithFollowing.following.map(({ userfollowing }) => userfollowing),
      );
      if (uniqueRecipientIds.some((id) => !followedIds.has(id))) {
        throw new AppErorr("You can share posts only with users you follow", 403);
      }

      const recipients = await User.find({ _id: { $in: uniqueRecipientIds } })
        .select("_id userName userFullName userProfilePic")
        .lean();
      if (recipients.length !== uniqueRecipientIds.length) {
        throw new AppErorr("One or more recipients were not found", 404);
      }

      const sender = await User.findById(senderId)
        .select("_id userName userFullName userProfilePic")
        .lean();
      const messages = await Message.insertMany(
        uniqueRecipientIds.map((recipientId) => ({
          senderId,
          recipientId,
          type: "post",
          postId,
        })),
      );
      const recipientsById = new Map(
        recipients.map((recipient) => [recipient._id.toString(), recipient]),
      );
      const postAuthor = await User.findById(post.userId)
        .select("_id userName")
        .lean();
      const payloads = messages.map((message) => ({
        ...message.toObject(),
        sender,
        recipient: recipientsById.get(message.recipientId),
        post: { ...post, author: postAuthor },
      }));
      let updatedPost = await Post.findOneAndUpdate(
        { _id: postId, "shares.userId": { $ne: senderId } },
        { $push: { shares: { userId: senderId } } },
        { returnDocument: "after", runValidators: true },
      );

      if (!updatedPost) {
        updatedPost = await Post.findById(postId);
      }

      if (!updatedPost) {
        throw new AppErorr("Post not found", 404);
      }
      io.emit("post:shares-updated", {
        _id: updatedPost._id.toString(),
        shares: updatedPost.shares,
      });

      for (const payload of payloads) {
        io.to(`user:${payload.recipientId}`).emit("message:new", payload);
        io.to(`user:${senderId}`).emit("message:new", payload);
      }

      res.status(201).json({ messages: payloads, post: updatedPost });
    }),
  );

  router.patch(
    "/:messageId",
    handleAsyncError(async (req, res) => {
      const { messageId } = req.params;
      const text = typeof req.body.text === "string" ? req.body.text.trim() : null;

      if (!mongoose.Types.ObjectId.isValid(messageId)) {
        throw new AppErorr("Message not found", 404);
      }
      if (text === null || text.length > 4000) {
        throw new AppErorr("Message must be 4000 characters or fewer", 400);
      }

      const message = await Message.findOne({
        _id: messageId,
        senderId: req.session.userId,
      });
      if (!message) {
        throw new AppErorr("Message not found", 404);
      }
      if (message.type !== "post" && !text) {
        throw new AppErorr("Message text is required", 400);
      }

      message.text = text;
      await message.save();
      const payload = message.toObject();
      io.to(`user:${message.senderId}`).emit("message:updated", payload);
      io.to(`user:${message.recipientId}`).emit("message:updated", payload);

      res.json(payload);
    }),
  );

  router.delete(
    "/:messageId",
    handleAsyncError(async (req, res) => {
      const { messageId } = req.params;

      if (!mongoose.Types.ObjectId.isValid(messageId)) {
        throw new AppErorr("Message not found", 404);
      }

      const message = await Message.findOneAndDelete({
        _id: messageId,
        senderId: req.session.userId,
      });
      if (!message) {
        throw new AppErorr("Message not found", 404);
      }

      const payload = {
        messageId: message._id.toString(),
        senderId: message.senderId,
        recipientId: message.recipientId,
      };
      io.to(`user:${message.senderId}`).emit("message:deleted", payload);
      io.to(`user:${message.recipientId}`).emit("message:deleted", payload);

      res.json({ message: "Message deleted", ...payload });
    }),
  );

  return router;
};

module.exports = createMessagesRouter;
