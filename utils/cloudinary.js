const cloudinary = require("cloudinary").v2;
const { AppErorr } = require("../handleError");

function configureCloudinary() {
  const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } =
    process.env;
  const hasCloudinaryUrl = Boolean(process.env.CLOUDINARY_URL);
  const hasIndividualCredentials =
    CLOUDINARY_CLOUD_NAME && CLOUDINARY_API_KEY && CLOUDINARY_API_SECRET;

  if (
    CLOUDINARY_CLOUD_NAME &&
    !/^[a-z0-9][a-z0-9_-]*$/.test(CLOUDINARY_CLOUD_NAME)
  ) {
    throw new AppErorr(
      "Invalid Cloudinary Cloud Name. Copy the exact lowercase Cloud Name from your Cloudinary dashboard.",
      503,
    );
  }

  if (!hasCloudinaryUrl && !hasIndividualCredentials) {
    throw new AppErorr(
      "Cloudinary is not configured. Set CLOUDINARY_URL or CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET.",
      503,
    );
  }

  if (hasIndividualCredentials) {
    cloudinary.config({
      cloud_name: CLOUDINARY_CLOUD_NAME,
      api_key: CLOUDINARY_API_KEY,
      api_secret: CLOUDINARY_API_SECRET,
      secure: true,
    });
  }

  return cloudinary;
}

async function uploadPostMedia(file) {
  const configuredCloudinary = configureCloudinary();
  const resourceType = file.mimetype.startsWith("video/") ? "video" : "image";

  try {
    return await new Promise((resolve, reject) => {
      const uploadStream = configuredCloudinary.uploader.upload_stream(
        {
          folder: "path-project/posts",
          resource_type: resourceType,
        },
        (error, result) => {
          if (error) {
            reject(error);
            return;
          }

          if (!result?.secure_url || !result.public_id) {
            reject(
              new Error("Cloudinary returned an incomplete upload result."),
            );
            return;
          }

          resolve(result);
        },
      );

      uploadStream.end(file.buffer);
    });
  } catch (error) {
    console.error("Cloudinary upload failed:", error.message);
    throw new AppErorr(
      "Cloudinary could not accept the upload. Verify the Cloud Name, API Key, API Secret, and account upload limits.",
      502,
    );
  }
}

async function deletePostMedia(publicId, resourceType) {
  if (!publicId) return;

  const configuredCloudinary = configureCloudinary();
  const result = await configuredCloudinary.uploader.destroy(publicId, {
    resource_type: resourceType === "video" ? "video" : "image",
    invalidate: true,
  });

  if (result.result !== "ok" && result.result !== "not found") {
    throw new Error(`Cloudinary media deletion failed: ${result.result}`);
  }
}

module.exports = { uploadPostMedia, deletePostMedia };
