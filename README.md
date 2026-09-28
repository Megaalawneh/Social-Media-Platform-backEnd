# Path Project Backend

Express, MongoDB, and Socket.IO backend for the Path web application.

## Requirements

- Node.js and npm
- A MongoDB deployment, such as MongoDB Atlas
- Cloudinary credentials to upload post media

## Local setup

From this directory, install dependencies:

```powershell
npm install
```

Create a `.env` file in this directory:

```env
PORT=3001
FRONTEND_ORIGIN=http://localhost:3000
MONGODB_URI=mongodb+srv://<database-user>:<url-encoded-password>@<cluster-host>/pathDb?retryWrites=true&w=majority&appName=pathproject
MONGODB_SESSION_URI=
SESSION_SECRET=<long-random-secret>
CLOUDINARY_CLOUD_NAME=<cloud-name>
CLOUDINARY_API_KEY=<api-key>
CLOUDINARY_API_SECRET=<api-secret>
```

`MONGODB_URI` is required and must point to the application database. Ensure the database user has the required Atlas permissions and the server's IP is allowed in Atlas Network Access. URL-encode reserved characters in the database password.

`SESSION_SECRET` is required. Generate a random value locally, for example:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

`MONGODB_SESSION_URI` is optional; when omitted, session documents use the same MongoDB URI as the application. `CLOUDINARY_*` values are required for post media uploads. Keep `.env` private; it is excluded from Git.

Start the server:

```powershell
node pathServer.js
```

The server connects to MongoDB before listening. By default it serves HTTP on port `3001` and allows the frontend origin `http://localhost:3000`. Set `PORT` and `FRONTEND_ORIGIN` for other environments. In production, serve the app over HTTPS so secure session cookies work as intended.

## Main API routes

The API uses session cookies. Sign-in, account creation, and other protected operations require the browser to send credentials.

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/isLoggedIn` | Check the current session |
| `POST` | `/user` | Create an account |
| `GET` | `/user/:userName` | Get a profile by username |
| `GET` | `/user/search/:userName` | Search users |
| `GET` | `/user/id/:userId` | Get a profile by ID |
| `PUT` | `/user` | Update the signed-in profile |
| `POST` | `/userLogin` | Sign in |
| `POST` | `/userLogout` | Sign out |
| `GET`, `POST` | `/post` | List recent posts or create a post |
| `DELETE` | `/post/:id` | Delete the signed-in user's post |
| `POST` | `/post/:postId/comment` | Add a comment |
| `POST` | `/post/:postId/like` | Toggle a post like |
| `GET` | `/follow/following` | List followed users |
| `PUT`, `DELETE` | `/follow` and `/follow/:userId` | Send or remove a follow |
| `GET` | `/messages/conversations` | List conversations |
| `GET`, `POST` | `/messages/:userId` | Load a conversation or send a message |
| `POST` | `/messages/share/:postId` | Share a post in messages |
| `PATCH`, `DELETE` | `/messages/:messageId` | Edit or delete a sent message |
| `DELETE`, `PUT` | `/Notifications/:id` | Dismiss or accept a follow notification |

Post uploads use `multipart/form-data` with a `media` file field, plus `caption` and `mediaType`. Accepted file types are JPG/JPEG, PNG, GIF, WEBP, MP4, WEBM, and MOV; the file size limit is 25 MB. New media is stored in Cloudinary, while the post document stores its secure URL and Cloudinary public ID.

Socket.IO shares the Express session and provides authenticated real-time messages, presence, typing updates, notifications, and post-share updates.

## Tests

No backend test suite is currently configured; the `npm test` script is a placeholder.
