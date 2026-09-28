const express = require("express");
const User = require("../models/userVaild");
const { AppErorr, handleAsyncError } = require("../handleError");
const createNotificationsRouter = (io) => {
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
  router.delete(
    "/:id",
    checkUserIsLoggedIn,
    handleAsyncError(async (req, res, next) => {
      const userId = req.session.userId;

      const userFollower = req.params.id;

      const followerExists = await User.findOne({
        _id: userId,
        "Notifications.userId": userFollower,
      });

      if (!followerExists) {
        return next(
          new AppErorr("Follower does not exist in the Notifications", 404),
        );
      }

      await checkUserFound({ _id: userFollower });

      await User.findByIdAndUpdate(userId, {
        $pull: {
          Notifications: { userId: userFollower },
        },
      });

      const user = await User.findByIdAndUpdate(
        userFollower,
        {
          $pull: {
            pending: {
              userFollower: userFollower,
              userFollowing: userId,
            },
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
    "/:id",
    checkUserIsLoggedIn,
    handleAsyncError(async (req, res, next) => {
      const userId = req.session.userId;

      const userFollower = req.params.id;

      await checkUserFound({ _id: userFollower });

      const alreadyFollowing = await User.findOne({
        _id: userId,
        "followers.userFollower": userFollower,
      });

      if (alreadyFollowing) {
        return next(new AppErorr("This user is already following you", 409));
      }

      await User.findByIdAndUpdate(userId, {
        $pull: { Notifications: { userId: userFollower } },
        $push: {
          followers: { userFollower: userFollower },
        },
      });

      const user = await User.findByIdAndUpdate(
        userFollower,
        {
          $pull: {
            pending: { userFollower: userFollower, userFollowing: userId },
          },
          $push: {
            following: { userfollowing: userId },
          },
        },
        { new: true },
      ).select("-userPassword");

      io.to(`user:${userFollower}`).emit("newNotification", {
        type: "followAccepted",
        fromUserId: userId,
        message: "Your follow request was accepted",
      });

      res.json({
        message: "Accepted the Follow",
        user,
      });
    }),
  );
  return router;
};

module.exports = createNotificationsRouter;
