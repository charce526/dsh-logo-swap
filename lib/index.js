// dsh-logo-swap — Host half.
// Exposes a tiny remote service `logoswap` for the client half:
//   status  — whether a prepared image file exists (local disk)
//   read    — read a local image file (path-based import), returns dataURL
// Local icon files are the only filesystem touchpoints; no settings writes,
// no asar changes, no other subsystems.

import { readFile, stat } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";

const REMOTE_MARKER = "@deepseek-ai/dsh-typert-protocol/remote-methods";
const MAX_IMAGE_BYTES = 4 * 1024 * 1024; // 4 MiB — plenty for a logo, keeps memory sane
const ALLOWED_EXT = new Set([".png", ".svg", ".webp", ".jpg", ".jpeg", ".gif", ".ico"]);
const MIME_BY_EXT = {
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
};

const proto = {
  /**
   * Read a local image file and return it as a data URL the client half can
   * persist into localStorage. Path must be absolute; size and extension are
   * validated. SVG is returned as-is (the client renders it via <img>/background).
   */
  async read(payload) {
    const raw = String(payload?.path ?? "");
    if (!raw) throw new Error("path is required");
    const path = isAbsolute(raw) ? raw : resolve(raw);
    const ext = path.slice(path.lastIndexOf(".")).toLowerCase();
    if (!ALLOWED_EXT.has(ext)) {
      throw new Error(`unsupported image type ${ext} (allowed: ${[...ALLOWED_EXT].join(" ")})`);
    }
    const info = await stat(path);
    if (!info.isFile()) throw new Error("not a file");
    if (info.size > MAX_IMAGE_BYTES) {
      throw new Error(`file too large (${(info.size / 1024 / 1024).toFixed(1)} MiB, max 4 MiB)`);
    }
    const buf = await readFile(path);
    const mime = MIME_BY_EXT[ext];
    return { dataUrl: `data:${mime};base64,${buf.toString("base64")}`, bytes: info.size };
  },

  async status() {
    return { ok: true };
  },
};

Object.defineProperty(proto, REMOTE_MARKER, {
  value: Object.freeze({
    version: 1,
    methods: Object.freeze(
      ["status", "read"].map((method) =>
        Object.freeze({ method, invocation: Object.freeze({ kind: "direct" }) }),
      ),
    ),
  }),
});

/** Host plugin body — provides the `logoswap` remote service. */
export function apply(ctx) {
  const service = Object.create(proto);
  Object.defineProperty(service, "ctx", { value: ctx, enumerable: false });
  Object.defineProperty(service, "typertRemote", {
    value: Object.freeze({ service, serviceKey: "logoswap", namespace: "logoswap" }),
  });
  ctx.provide("logoswap", service);
  ctx.effect(() => async () => {
    // stateless: nothing to clean up
  });
}
