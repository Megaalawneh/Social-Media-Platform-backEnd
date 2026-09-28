const express = require("express");
const router = express.Router();
const User = require("../models/userVaild");
const bcrypt = require("bcrypt");
const { AppErorr, handleAsyncError } = require("../handleError");

async function checkUserFound(query) {
  const user = await User.findOne(query).select("-userPassword -userBirthDate");

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
  "/:userName",
  handleAsyncError(async (req, res) => {
    const { userName } = req.params;
    const user = await checkUserFound({ userName });
    res.json(user);
  }),
);
router.get(
  "/search/:userName",
  checkUserIsLoggedIn,
  handleAsyncError(async (req, res) => {
    const { userName } = req.params;
    const searchTerm = userName.trim();

    if (!searchTerm) {
      return res.json([]);
    }

    const escapedSearchTerm = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const users = await User.find({
      userName: { $regex: `^${escapedSearchTerm}`, $options: "i" },
    })
      .limit(10)
      .select("-userPassword -userBirthDate");

    res.json(users);
  }),
);
router.get(
  "/id/:userId",
  checkUserIsLoggedIn,
  handleAsyncError(async (req, res) => {
    const { userId } = req.params;
    const user = await checkUserFound({ _id: userId });
    res.json(user);
  }),
);
router.post(
  "/",
  handleAsyncError(async (req, res, next) => {
    const data = req.body;
    const birthDate =
      typeof data.userBirthDate === "string" &&
      /^\d{4}-\d{2}-\d{2}$/.test(data.userBirthDate)
        ? new Date(`${data.userBirthDate}T00:00:00.000Z`)
        : null;
    const city = data.userCity;

    if (
      !birthDate ||
      Number.isNaN(birthDate.getTime()) ||
      birthDate.toISOString().slice(0, 10) !== data.userBirthDate ||
      birthDate > new Date()
    ) {
      return next(new AppErorr("A valid date of birth is required", 400));
    }

    if (
      !city ||
      typeof city.name !== "string" ||
      !city.name.trim() ||
      !Number.isFinite(city.lat) ||
      city.lat < -90 ||
      city.lat > 90 ||
      !Number.isFinite(city.lon) ||
      city.lon < -180 ||
      city.lon > 180
    ) {
      return next(new AppErorr("A valid city is required", 400));
    }

    const userExists = await User.findOne({ userName: data.userName });
    if (userExists) {
      return next(new AppErorr("UserName already exists", 409));
    }

    const emailExists = await User.findOne({ userEmail: data.userEmail });
    if (emailExists) {
      return next(new AppErorr("Email already exists", 409));
    }

    const saltRounds = 10;
    const pw = await bcrypt.hash(data.userPassword, saltRounds);
    const newUser = new User({
      userName: data.userName,
      userEmail: data.userEmail,
      userPassword: pw,
      userFullName: data.userFullName,
      userBirthDate: birthDate,
      userCity: {
        name: city.name.trim(),
        lat: city.lat,
        lon: city.lon,
      },
    });

    await newUser.save();
    req.session.userId = newUser._id.toString();
    const userResponse = newUser.toObject();
    delete userResponse.userPassword;
    delete userResponse.userBirthDate;

    res.status(201).json({
      message: "User created successfully",
      newUser: userResponse,
    });
  }),
);
router.put(
  "/",
  checkUserIsLoggedIn,
  handleAsyncError(async (req, res, next) => {
    const {
      userFullName,
      userEmail,
      userName,
      userPassword,
      userBio,
      userProfilePic,
      userBirthDate,
      userCity,
    } = req.body;

    const userId = req.session.userId;

    const updates = {
      userFullName,
      userEmail,
      userName,
      userBio,
      userProfilePic,
    };

    if (userBirthDate !== undefined) {
      const birthDate =
        typeof userBirthDate === "string" &&
        /^\d{4}-\d{2}-\d{2}$/.test(userBirthDate)
          ? new Date(`${userBirthDate}T00:00:00.000Z`)
          : null;
      if (
        !birthDate ||
        Number.isNaN(birthDate.getTime()) ||
        birthDate.toISOString().slice(0, 10) !== userBirthDate ||
        birthDate > new Date()
      ) {
        return next(new AppErorr("A valid date of birth is required", 400));
      }
      updates.userBirthDate = birthDate;
    }

    if (userCity !== undefined) {
      if (
        !userCity ||
        typeof userCity.name !== "string" ||
        !userCity.name.trim() ||
        !Number.isFinite(userCity.lat) ||
        userCity.lat < -90 ||
        userCity.lat > 90 ||
        !Number.isFinite(userCity.lon) ||
        userCity.lon < -180 ||
        userCity.lon > 180
      ) {
        return next(new AppErorr("A valid city is required", 400));
      }
      updates.userCity = {
        name: userCity.name.trim(),
        lat: userCity.lat,
        lon: userCity.lon,
      };
    }

    if (userPassword) {
      updates.userPassword = await bcrypt.hash(userPassword, 10);
    }

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { $set: updates },
      { returnDocument: "after", runValidators: true },
    ).select("-userPassword");

    if (!updatedUser) {
      return next(new AppErorr("User not found", 404));
    }

    res.json({
      message: "User updated successfully",
      user: updatedUser,
    });
  }),
);

module.exports = router;
