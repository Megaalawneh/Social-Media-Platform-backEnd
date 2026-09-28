const express = require("express");
const User = require("../models/userVaild");
const { AppErorr, handleAsyncError } = require("../handleError");
const createFollowRouter = (io) => {
  const router = express.Router();

  async function checkUserFound(query) {
    const user = await User.findOne(query).select("-userPassword");

    if (!user) {
      throw new AppErorr("User not found", 404);
    }

    return user;
  }

  function checkUserIsLoggedIn(req, res, next) {
    if (!req.session.userId) {
      return res.status(401).json({ loggedIn: false });
    }

    next();
  }

  router.get(
    "/following",
    checkUserIsLoggedIn,
    handleAsyncError(async (req, res) => {
      const user = await User.findById(req.session.userId)
        .select("following")
        .lean();

      if (!user) {
        throw new AppErorr("User not found", 404);
      }

      const followingIds = user.following.map(({ userfollowing }) => userfollowing);
      const followingUsers = await User.find({ _id: { $in: followingIds } })
        .select("_id userName userFullName userProfilePic")
        .sort({ userName: 1 })
        .lean();

      res.json(followingUsers);
    }),
  );

  router.delete(
    "/:userId",
    checkUserIsLoggedIn,
    handleAsyncError(async (req, res, next) => {
      const userIdNow = req.session.userId;
      const { userId } = req.params;

      const existingUser = await checkUserFound({ _id: userId });
      const existingFollowing = await User.findOne({
        _id: userIdNow,
        "following.userfollowing": existingUser._id,
      });

      if (!existingFollowing) {
        return next(new AppErorr("You are not following this user", 409));
      }
      const follow = await User.findByIdAndUpdate(
        userIdNow,
        {
          $pull: {
            following: {
              userfollowing: existingUser._id,
            },
          },
        },
        { new: true },
      ).select("-userPassword");
      await User.findByIdAndUpdate(existingUser._id, {
        $pull: {
          followers: {
            userFollower: userIdNow,
          },
        },
      });
      res.json({
        message: "follow was removed successfully",
        follow,
      });
    }),
  );
  router.delete(
    "/pending/:id",
    checkUserIsLoggedIn,
    handleAsyncError(async (req, res, next) => {
      const userId = req.session.userId;
      const pendingId = req.params.id;
      const { userFollowing } = req.body;

      await checkUserFound({ _id: userFollowing });

      await User.findByIdAndUpdate(userFollowing, {
        $pull: {
          Notifications: { userId: userId },
        },
      });

      const user = await User.findByIdAndUpdate(
        userId,
        {
          $pull: {
            pending: { _id: pendingId },
          },
        },
        { new: true },
      ).select("-userPassword");

      res.json({
        message: "Pending request deleted",
        user,
      });
    }),
  );
  router.put(
    "/",
    checkUserIsLoggedIn,
    handleAsyncError(async (req, res, next) => {
      const { userFollowing } = req.body;
      const userFollower = req.session.userId;

      if (userFollower === userFollowing) {
        return next(new AppErorr("You cannot follow yourself", 400));
      }

      await checkUserFound({ _id: userFollowing });

      const alreadyPending = await User.findOne({
        _id: userFollower,
        "pending.userFollowing": userFollowing,
      });

      if (alreadyPending) {
        return next(new AppErorr("Follow request already exists", 409));
      }

      const alreadyFollowing = await User.findOne({
        _id: userFollower,
        "following.userfollowing": userFollowing,
      });

      if (alreadyFollowing) {
        return next(new AppErorr("You are already following this user", 409));
      }

      const updatedTargetUser = await User.findByIdAndUpdate(
        userFollower,
        {
          $push: {
            pending: { userFollower, userFollowing },
          },
        },
        { new: true, runValidators: true },
      ).select("-userPassword");

      await User.findByIdAndUpdate(
        userFollowing,
        {
          $push: {
            Notifications: {
              userId: userFollower,
              type: "follow",
              message: "Follow request sent",
            },
          },
        },
        { new: true, runValidators: true },
      );

      io.to(`user:${userFollowing}`).emit("newNotification", {
        type: "followRequest",
        fromUserId: userFollower,
        message: "You received a follow request",
      });

      res.json({
        message: "Follow request sent",
        user: updatedTargetUser,
      });
    }),
  );
  return router;
};

module.exports = createFollowRouter;
