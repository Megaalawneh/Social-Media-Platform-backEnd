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

`MONGODB_SESSION_URI` is optional; when omitted, session documents use the same MongoDB URI as the application. For a simple Atlas setup, leave it empty. `CLOUDINARY_*` values are required for post media uploads. Keep `.env` private; it is excluded from Git.

Start the server:

```powershell
node pathServer.js
```

The server connects to MongoDB before listening. By default it serves HTTP on port `3001` and allows the frontend origin `http://localhost:3000`. Set `PORT` and `FRONTEND_ORIGIN` for other environments. In production, the server trusts Render's proxy and enables secure cross-site session cookies; serve the frontend over HTTPS as well.

## Deploy to Render

This repository includes a `render.yaml` Blueprint for a Node web service. To deploy:

1. Push the backend repository to GitHub.
2. In Render, choose **New + → Blueprint**, connect the backend repository, and select `render.yaml`.
3. In the service's Environment settings, set `FRONTEND_ORIGIN` to the exact deployed frontend origin (including `https://`, with no trailing slash).
4. Add `MONGODB_URI` from Atlas, targeting the `pathDb` database. Ensure Atlas Network Access allows the Render service's outbound IP ranges. Find those ranges in the service's **Connect → Outbound** panel in Render and add the appropriate CIDR ranges to Atlas Network Access; avoid leaving `0.0.0.0/0` enabled.
5. Add the Cloudinary cloud name, API key, and API secret as Render environment variables. Never commit these values.
6. Deploy and verify the service's `/health` endpoint returns `{"status":"ok"}`.
7. Set the frontend's `NEXT_PUBLIC_API_URL` to the Render service URL and redeploy the frontend.

Leave `MONGODB_SESSION_URI` unset in Render so sessions use the same Atlas URI as the application. If you change `render.yaml`, make sure Render deploys the new commit; dashboard build-command overrides can take precedence until updated.

The Blueprint uses Render's free web-service plan for evaluation. Free services can spin down after inactivity, causing slow first requests and interrupted real-time connections; use an always-on plan for dependable messaging. Browser privacy features may block cookies between unrelated frontend and API domains even when cross-site cookies are enabled. For reliable session authentication, use frontend and API subdomains under the same custom domain where possible.

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
