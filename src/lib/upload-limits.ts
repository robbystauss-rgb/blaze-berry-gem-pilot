// Inline base64 uploads must leave room for request metadata below Vercel's
// 4.5 MB function payload limit. This applies only when accepting new files;
// existing stored originals are never resized or rewritten by this limit.
export const MAX_NEW_UPLOAD_BYTES = 3_000_000;
export const MAX_NEW_UPLOAD_DATA_URL_LENGTH = 4_001_000;
