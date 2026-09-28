require("dotenv").config();
const express = require("express");
const {AppErorr,handleAsyncError} = require("./handleError");
const mongoose = require("mongoose");
const User = require("./models/userVaild");
const bcrypt = require("bcrypt");
const session = require("express-session");
const MongoDBStore = require("connect-mongodb-session")(session);
const cors = require("cors");
const pathModule = require("path");
const path = express();
const uploadDirectory = pathModule.join(__dirname, "uploads");
const portServer = Number(process.env.PORT) || 3001;
const frontendOrigin = process.env.FRONTEND_ORIGIN || "http://localhost:3000";
const isProduction = process.env.NODE_ENV === "production";
const mongoUri = process.env.MONGODB_URI;
const sessionSecret = process.env.SESSION_SECRET;
if (!mongoUri) {
  throw new Error("MONGODB_URI must be configured before starting the server.");
}
if (!sessionSecret) {
  throw new Error("SESSION_SECRET must be configured before starting the server.");
}
const http = require("http");
const { Server } = require("socket.io");
const userRoutes = require("./routes/user.routes");
const postRoutes = require("./routes/post.routes");
const followRoutes = require("./routes/follow.routes");
const notificationsRoutes = require("./routes/notifications.routes");
const messagesRoutes = require("./routes/messages.routes");
const httpServer = http.createServer(path);

if (isProduction) {
  path.set("trust proxy", 1);
}

const io = new Server(httpServer, {
  cors: {
    origin: frontendOrigin,
    credentials: true,
  },
});

path.use(express.json());
path.use(express.urlencoded({ extended: true }));

path.use(
  cors({
    origin: frontendOrigin,
    credentials: true,
  }),
);

const store = new MongoDBStore({
  uri: process.env.MONGODB_SESSION_URI || mongoUri,
  collection: "mySessions",
});

const sessionMiddleware = session({
  secret: sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? "none" : "lax",
  },
  store,
});
path.use(sessionMiddleware);
io.engine.use(sessionMiddleware);

io.use(async (socket, next) => {
  try {
    const userId = socket.request.session?.userId;
    if (!userId || !(await User.exists({ _id: userId }))) {
      return next(new Error("Unauthorized"));
    }

    socket.data.userId = userId.toString();
    next();
  } catch (error) {
    next(error);
  }
});

const onlineUsers = new Map();

io.on("connection", (socket) => {
  const userId = socket.data.userId;
  const room = `user:${userId}`;
  const connectionCount = onlineUsers.get(userId) || 0;
  onlineUsers.set(userId, connectionCount + 1);
  socket.join(room);

  if (connectionCount === 0) {
    io.emit("presence:update", { userId, online: true });
  }
  socket.emit("presence:online-users", [...onlineUsers.keys()]);

  const sessionCheck = setInterval(() => {
    if (!socket.connected) {
      clearInterval(sessionCheck);
      return;
    }

    store.get(socket.request.sessionID, (error, sessionData) => {
      const sessionExpired =
        sessionData?.cookie?.expires &&
        new Date(sessionData.cookie.expires).getTime() <= Date.now();
      if (error || sessionData?.userId !== userId || sessionExpired) {
        if (error) {
          console.error("Could not verify active socket session:", error.message);
        }
        socket.disconnect(true);
      }
    });
  }, 30000);

  socket.on("presence:request", () => {
    socket.emit("presence:online-users", [...onlineUsers.keys()]);
  });

  socket.on("typing:update", async ({ recipientId, isTyping } = {}) => {
    if (
      typeof recipientId !== "string" ||
      !mongoose.Types.ObjectId.isValid(recipientId) ||
      typeof isTyping !== "boolean" ||
      recipientId === userId
    ) {
      return;
    }

    try {
      if (await User.exists({ _id: recipientId })) {
        io.to(`user:${recipientId}`).emit("typing:update", {
          userId,
          isTyping,
        });
      }
    } catch (error) {
      console.error("Failed to relay typing status:", error.message);
    }
  });

  socket.on("disconnect", () => {
    clearInterval(sessionCheck);
    const remainingConnections = (onlineUsers.get(userId) || 1) - 1;
    if (remainingConnections > 0) {
      onlineUsers.set(userId, remainingConnections);
      return;
    }

    onlineUsers.delete(userId);
    io.emit("presence:update", { userId, online: false });
  });
});

path.use("/user", userRoutes);
path.use("/uploads", express.static(uploadDirectory));
path.use("/post", postRoutes(io));
path.use("/follow", followRoutes(io));
path.use("/Notifications", notificationsRoutes(io));
path.use("/messages", messagesRoutes(io));
path.get("/health", (req, res) => {
  const isDatabaseConnected = mongoose.connection.readyState === 1;
  res.status(isDatabaseConnected ? 200 : 503).json({
    status: isDatabaseConnected ? "ok" : "database_unavailable",
  });
});
path.get(
  "/isLoggedIn",
  handleAsyncError(async (req, res) => {
    if (!req.session.userId) {
      return res.status(401).json({
        loggedIn: false,
      });
    }
    const user = await User.findById(req.session.userId).select(
      "-userPassword",
    );
    if (!user) {
      return res.status(401).json({
        loggedIn: false,
      });
    }
    res.json({
      loggedIn: true,
      user,
    });
  }),
);
path.post(
  "/userLogin",
  handleAsyncError(async (req, res, next) => {
    const data = req.body;

    const emailExists = await User.findOne({ userEmail: data.email });

    if (!emailExists) {
      return next(new AppErorr("The Email Or The Password Is Incorrect", 401));
    }

    const check = await bcrypt.compare(data.password, emailExists.userPassword);

    if (!check) {
      return next(new AppErorr("The Email Or The Password Is Incorrect", 401));
    }

    req.session.userId = emailExists._id.toString();

    req.session.save((err) => {
      if (err) {
        return next(err);
      }

      res.send("done");
    });
  }),
);
path.post("/userLogout", (req, res, next) => {
  const userId = req.session.userId;
  req.session.destroy((err) => {
    if (err) {
      return next(err);
    }

    if (userId) {
      io.in(`user:${userId}`).disconnectSockets(true);
    }

    res.clearCookie("connect.sid");
    res.json({
      message: "Logged out successfully",
    });
  });
});

path.use((err, req, res, next) => {
  res.status(err.statusCode || err.status || 500).json({
    status: "error",
    message: err.message,
  });
});

mongoose
  .connect(mongoUri)
  .then(() => {
    console.log("Connected to MongoDB.");
    httpServer.listen(portServer, () => {
      console.log(`Server is running on port ${portServer}`);
    });
  })
  .catch((error) => {
    console.error("MongoDB connection failed:", error.message);
    process.exitCode = 1;
  });
