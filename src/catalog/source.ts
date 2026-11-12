// Where a release is read from: the catalog over HTTPS, or a folder laid out as the site serves it. Either way the
// bytes are data: every check happens after they are read.
import { open } from "node:fs/promises";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { join } from "node:path";
import { Refusal } from "./types.ts";

/** Reads one file of a release by its path from the release's root, at most max bytes. */
export interface Source {
  get(path: string, max: number): Promise<Uint8Array>;
}

/** A release in a folder: <dir>/v1/feed.json, <dir>/v1/feed.json.sig and the bundle files at their feed paths. */
export function dirSource(dir: string): Source {
  return {
    async get(path, max) {
      let f;
      try {
        f = await open(join(dir, ...path.split("/")), "r");
      } catch {
        throw new Refusal(`${path}: not in the release`);
      }
      try {
        const buf = Buffer.alloc(max + 1);
        let n = 0;
        for (let got = -1; got !== 0 && n <= max; n += got) {
          got = (await f.read(buf, n, max + 1 - n, n)).bytesRead;
        }
        if (n > max) throw new Refusal(`${path}: more than ${max} bytes`);
        return buf.subarray(0, n);
      } finally {
        await f.close();
      }
    },
  };
}

const IDLE_MS = 30_000; // a connection that goes silent this long is dropped
export const DEADLINE_MS = 60_000; // one file has this long to arrive whole, however steadily it drips

/**
 * The catalog over the network: GET only, one header of ours (User-Agent), no cookies, no redirects followed, nothing
 * sent in a body or a query. A file that is not whole within deadlineMs is given up.
 */
export function httpSource(base: string, userAgent: string, deadlineMs = DEADLINE_MS): Source {
  const root = new URL(base.endsWith("/") ? base : base + "/");
  if (root.protocol !== "https:" && root.protocol !== "http:") throw new Refusal("the catalog address is not http(s)");
  const request = root.protocol === "https:" ? httpsRequest : httpRequest;
  return {
    get(path, max) {
      const url = new URL(path.split("/").map(encodeURIComponent).join("/"), root);
      return new Promise((resolve, reject) => {
        const refuse = (why: string) => reject(new Refusal(`${url.host}/${path}: ${why}`));
        const req = request(url, { method: "GET", headers: { "User-Agent": userAgent }, agent: false, timeout: IDLE_MS }, (res) => {
          if (res.statusCode !== 200) {
            res.destroy();
            return refuse(`the catalog answered ${res.statusCode}`);
          }
          const chunks: Buffer[] = [];
          let n = 0;
          res.on("data", (c: Buffer) => {
            chunks.push(c);
            if ((n += c.length) > max) {
              res.destroy();
              refuse(`more than ${max} bytes`);
            }
          });
          res.on("end", () => resolve(Buffer.concat(chunks)));
          res.on("error", () => refuse("the download broke off"));
        });
        // The first word wins: once the promise is settled, a later refusal or a late deadline changes nothing.
        AbortSignal.timeout(deadlineMs).addEventListener("abort", () => {
          refuse(`not whole after ${deadlineMs / 1000} seconds; the download was stopped`);
          req.destroy();
        }, { once: true });
        req.on("timeout", () => req.destroy(new Error("timeout")));
        req.on("error", (err) => refuse(`cannot be fetched (${err.message})`));
        req.end();
      });
    },
  };
}
