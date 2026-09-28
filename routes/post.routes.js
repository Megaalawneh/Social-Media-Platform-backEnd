const express = require("express");
const { AppErorr, handleAsyncError } = require("../handleError");
const Post = require("../models/postVaild");
const User = require("../models/userVaild");
const multer = require("multer");
const xpath = require("path");
const { uploadPostMedia, deletePostMedia } = require("../utils/cloudinary");
const createPostRouter = (io) => {
  const router = express.Router();
  const allowedFileTypes = new Map([
    ["image/jpeg", new Set([".jpg", ".jpeg"])],
    ["image/png", new Set([".png"])],
    ["image/gif", new Set([".gif"])],
    ["image/webp", new Set([".webp"])],
    ["video/mp4", new Set([".mp4"])],
    ["video/webm", new Set([".webm"])],
    ["video/quicktime", new Set([".mov"])],
  ]);
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 25 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
      const allowedExtensions = allowedFileTypes.get(file.mimetype);
      const extension = xpath.extname(file.originalname).toLowerCase();

      if (!allowedExtensions?.has(extension)) {
        return cb(
          new AppErorr(
            "Unsupported media type. Use JPG, PNG, GIF, WEBP, MP4, WEBM, or MOV.",
            400,
          ),
        );
      }

      cb(null, true);
    },
  });
  const uploadSingleMedia = upload.single("media");
  function handleUpload(req, res, next) {
    uploadSingleMedia(req, res, (error) => {
      if (error instanceof multer.MulterError) {
        error.statusCode =
          error.code === "LIMIT_FILE_SIZE" ? 413 : 400;
      }

      next(error);
    });
  }
  async function checkUserFound(req, res, next) {
    try {
      const user = await User.findById(req.session.userId).select(
        "-userPassword",
      );

      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      next();
    } catch (error) {
      next(error);
    }
  }
  function checkUserIsLoggedIn(req, res, next) {
    if (!req.session.userId) {
      return res.status(401).json({ loggedIn: false });
    }

    next();
  }
  router.get(
    "/",
    checkUserIsLoggedIn,
    checkUserFound,
    handleAsyncError(async (req, res) => {
      const posts = await Post.find().sort({ createdAt: -1 }).limit(10);
      res.json(posts);
    }),
  );

  router.post(
    "/",
    checkUserIsLoggedIn,
    checkUserFound,
    handleUpload,
    handleAsyncError(async (req, res) => {
      const userId = req.session.userId;
      const { caption, mediaType } = req.body;
      if (!req.file) {
        throw new AppErorr("A media file is required", 400);
      }

      const actualMediaType = req.file.mimetype.startsWith("video/")
        ? "video"
        : "image";
      if (mediaType !== actualMediaType) {
        throw new AppErorr("Media type does not match the uploaded file", 400);
      }

      const uploadedMedia = await uploadPostMedia(req.file);

      const post = new Post({
        userId: userId,
        postCaption: caption,
        mediaType: mediaType,
        media: uploadedMedia.secure_url,
        mediaPublicId: uploadedMedia.public_id,
      });

      try {
        await post.save();
      } catch (error) {
        try {
          await deletePostMedia(uploadedMedia.public_id, mediaType);
        } catch (cleanupError) {
          console.error(
            "Failed to clean up Cloudinary upload after post save failed:",
            cleanupError.message,
          );
        }

        throw error;
      }

      res.status(201).json({
        message: "post created successfully",
        post,
      });
    }),
  );
  router.delete(
    "/:id",
    checkUserIsLoggedIn,
    checkUserFound,
    handleAsyncError(async (req, res) => {
      const userId = req.session.userId;

      const idPost = req.params.id;

      const post = await Post.findOne({
        _id: idPost,
        userId: userId,
      });

      if (!post) {
        return res.status(404).json({
          message: "Post not found or unauthorized to delete",
        });
      }

      await deletePostMedia(post.mediaPublicId, post.mediaType);
      await post.deleteOne();

      res.json({
        message: "post request deleted",
      });
    }),
  );
  router.post(
    "/:postId/comment",
    checkUserIsLoggedIn,
    checkUserFound,
    handleAsyncError(async (req, res, next) => {
      const { postId } = req.params;
      const { content } = req.body;

      const userId = req.session.userId;

      const updatedPost = await Post.findByIdAndUpdate(
        postId,
        {
          $push: {
            comments: { userId, content, createdAt: new Date() },
          },
        },
        { new: true, runValidators: true },
      );

      if (!updatedPost) {
        return res.status(404).json({ message: "Post not found" });
      }

      if (userId !== updatedPost.userId) {
        io.to(`user:${updatedPost.userId}`).emit("NewComment", {
          type: "NewComment",
          fromUserId: userId,
          postId: updatedPost._id,
          message: "You got a new comment",
        });
        await User.findByIdAndUpdate(
          updatedPost.userId,
          {
            $push: {
              Notifications: {
                userId: userId,
                type: "comment",
                postId: postId,
                message: "You got a new comment",
              },
            },
          },
          { new: true, runValidators: true },
        );
      }

      res.json({
        message: "new comment added",
        updatedPost,
      });
    }),
  );
  router.post(
    "/:postId/like",
    checkUserIsLoggedIn,
    checkUserFound,
    handleAsyncError(async (req, res, next) => {
      const { postId } = req.params;
      const userId = req.session.userId;

      const existingPost = await Post.findById(postId);
      if (!existingPost) {
        return res.status(404).json({ message: "Post not found" });
      }

      const hasLiked = existingPost.likes.some(
        (like) =>
          (like.userId ? like.userId.toString() : like.toString()) ===
          userId.toString(),
      );

      const updateOperator = hasLiked
        ? { $pull: { likes: { userId } } }
        : { $addToSet: { likes: { userId } } };

      const updatedPost = await Post.findByIdAndUpdate(postId, updateOperator, {
        new: true,
        runValidators: true,
      });

      if (!updatedPost) {
        return res.status(404).json({ message: "Post not found" });
      }

      if (!hasLiked && userId !== updatedPost.userId) {
        await User.findByIdAndUpdate(updatedPost.userId, {
          $push: {
            Notifications: {
              userId: userId,
              type: "like",
              postId: postId,
              message: "You got a New Like",
            },
          },
        });

        io.to(`user:${updatedPost.userId}`).emit("NewLike", {
          type: "NewLike",
          fromUserId: userId,
          postId: updatedPost._id,
          message: "You got a New Like",
        });
      }

      res.json({
        message: hasLiked ? "Like removed" : "Like added",
        updatedPost,
      });
    }),
  );
  router.post(
    "/:postId/:commentId/like",
    checkUserIsLoggedIn,
    checkUserFound,
    handleAsyncError(async (req, res, next) => {
      const { postId, commentId } = req.params;
      const userId = req.session.userId;

      const existingPost = await Post.findById(postId);
      if (!existingPost) {
        return res.status(404).json({ message: "Post not found" });
      }

      const targetComment = existingPost.comments.id(commentId);
      if (!targetComment) {
        return res.status(404).json({ message: "Comment not found" });
      }

      const hasLiked = targetComment.likes.some(
        (like) =>
          (like.userId ? like.userId.toString() : like.toString()) ===
          userId.toString(),
      );

      const updateOperator = hasLiked
        ? { $pull: { "comments.$[comment].likes": { userId } } }
        : { $addToSet: { "comments.$[comment].likes": { userId } } };

      const updatedPost = await Post.findByIdAndUpdate(postId, updateOperator, {
        arrayFilters: [{ "comment._id": commentId }],
        new: true,
        runValidators: true,
      });

      if (!updatedPost) {
        return res.status(404).json({ message: "Post not found" });
      }

      if (!hasLiked) {
        if (userId !== targetComment.userId) {
          io.to(`user:${targetComment.userId}`).emit("NewCommentLike", {
            type: "NewCommentLike",
            fromUserId: userId,
            postId: updatedPost._id,
            commentId: commentId,
            message: "You got a new like on your comment",
          });
        }
      }

      res.json({
        message: hasLiked ? "Like removed" : "Like added",
        updatedPost,
      });
    }),
  );
  router.delete(
    "/:postId/:commentId",
    checkUserIsLoggedIn,
    checkUserFound,
    handleAsyncError(async (req, res, next) => {
      const { postId, commentId } = req.params;

      const userId = req.session.userId;

      const existingPost = await Post.findById(postId);
      if (!existingPost) {
        return res.status(404).json({ message: "Post not found" });
      }
      const targetComment = existingPost.comments.id(commentId);
      if (!targetComment) {
        return res.status(404).json({ message: "Comment not found" });
      }
      const isCommentOwner =
        targetComment.userId.toString() === userId.toString();
      const isPostOwner = existingPost.userId.toString() === userId.toString();

      if (!isCommentOwner && !isPostOwner) {
        return res
          .status(403)
          .json({ message: "Unauthorized to delete this comment" });
      }

      const updatedPost = await Post.findByIdAndUpdate(
        postId,
        {
          $pull: { comments: { _id: commentId } },
        },
        { new: true, runValidators: true },
      );

      if (!updatedPost) {
        return res.status(404).json({ message: "Post not found" });
      }

      res.json({
        message: "Comment deleted successfully",
        updatedPost,
      });
    }),
  );
  return router;
};

module.exports = createPostRouter;
