import { copyFile, mkdir, stat } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("../../", import.meta.url)));
export const MEDIA_DIR = join(ROOT, "data", "media");
const ALLOWED = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".mp4", ".mov", ".webm"]);

export interface MediaFile {
  token: string;
  filename: string;
  path: string;
  url: string;
  bytes: number;
}

/**
 * Copy a generated image/video into the public media directory and return an unguessable URL.
 * Buffer and social schedulers need a public HTTP(S) URL; the token is the access control.
 */
export async function addMedia(file: string): Promise<MediaFile> {
  const ext = extname(file).toLowerCase();
  if (!ALLOWED.has(ext)) {
    throw new Error(`Unsupported media type ${ext}. Use jpg, png, webp, gif, mp4, mov or webm.`);
  }
  const info = await stat(file);
  if (!info.isFile()) throw new Error("Media path is not a file");
  await mkdir(MEDIA_DIR, { recursive: true });
  const token = randomBytes(16).toString("hex");
  const filename = `${token}${ext}`;
  const destination = join(MEDIA_DIR, filename);
  await copyFile(file, destination);
  const base = (process.env.CHOICE_PUBLIC_URL ?? "http://127.0.0.1:4177").replace(/\/$/, "");
  return { token, filename, path: destination, url: `${base}/media/${filename}`, bytes: info.size };
}

export function isMediaFilename(name: string): boolean {
  return /^[a-f0-9]{32}\.(?:jpg|jpeg|png|webp|gif|mp4|mov|webm)$/.test(name);
}

export function mediaContentType(name: string): string {
  const ext = extname(name).toLowerCase();
  return (
    {
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".png": "image/png",
      ".webp": "image/webp",
      ".gif": "image/gif",
      ".mp4": "video/mp4",
      ".mov": "video/quicktime",
      ".webm": "video/webm",
    }[ext] ?? "application/octet-stream"
  );
}
