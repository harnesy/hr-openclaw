import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import { after, test } from "node:test";
import { hireCommand } from "../src/commands/hire.ts";
import { DEADLINE_MS, httpSource } from "../src/catalog/source.ts";
import { USER_AGENT, VERSION } from "../src/version.ts";
import { refusal } from "./kit/sample.ts";
import { staff } from "./kit/staff.ts";
import { world } from "./kit/world.ts";

interface Seen { method: string; url: string; headers: string[]; body: number }
const seen: Seen[] = [];
const servers: Server[] = [];
after(() => servers.forEach((s) => s.close()));

/** Serves a folder the way a static file server does, and records every request. */
async function serve(dir: string, handle?: (req: IncomingMessage) => { status: number; headers?: Record<string, string>; body?: Buffer } | undefined): Promise<string> {
  const server = createServer((req, res) => {
    let body = 0;
    req.on("data", (c: Buffer) => { body += c.length; });
    req.on("end", () => {
      seen.push({ method: req.method!, url: req.url!, headers: Object.keys(req.headers).sort(), body });
      const special = handle?.(req);
      if (special) return res.writeHead(special.status, special.headers).end(special.body);
      let file: Buffer | undefined;
      try {
        file = readFileSync(join(dir, ...decodeURIComponent(req.url!).split("/")));
      } catch {
        // not there
      }
      res.writeHead(file ? 200 : 404).end(file);
    });
  });
  servers.push(server);
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

test("a hire over the network: only GETs to the catalog, one header of ours, nothing in a body or a query", async () => {
  const { kit, dir } = await staff(), w = world(kit, dir), base = await serve(dir);
  seen.length = 0;
  const pub = `t1:${Buffer.from(kit.key.pub).toString("base64")}`;
  const cx = (testCatalog: boolean) => w.cx({ keys: [], source: undefined, env: { HARNSY_HR_FEED: base, HARNSY_HR_PUB: pub }, testCatalog });
  assert.match(await refusal(hireCommand(cx(false), "harnsy/sample-skills", { yes: true })), /--test-catalog was not given/);
  assert.equal(seen.length, 0, "without the word of the command line no request is made");
  await hireCommand(cx(true), "harnsy/sample-skills", { yes: true });
  assert.ok(w.agents.has("sample-skills"));
  assert.deepEqual(seen.map((r) => `${r.method} ${r.url}`), ["GET /v1/feed.json", "GET /v1/feed.json.sig", "GET /packs/harnsy/sample-skills/1.2.0.harnsy"],
    "the feed names https://hr.harnsy.dev/…; the path of each url is fetched from the stand's address");
  for (const r of seen) {
    assert.deepEqual(r.headers, ["connection", "host", "user-agent"], "no cookie, no referer, no accept-language, nothing of the person");
    assert.equal(r.body, 0);
  }
  assert.equal(USER_AGENT, `hr-openclaw/${VERSION}`);
});

test("the network source sends its name and version and nothing else of its own", async () => {
  const dir = (await staff()).dir, base = await serve(dir, (req) => (req.url === "/ua" ? { status: 200, body: Buffer.from(req.headers["user-agent"] ?? "") } : undefined));
  const got = await httpSource(base, USER_AGENT).get("ua", 100);
  assert.equal(Buffer.from(got).toString(), `hr-openclaw/${VERSION}`);
});

test("the network source refuses what is not a plain 200 within the size it was told", async () => {
  const dir = (await staff()).dir;
  const base = await serve(dir, (req) => {
    if (req.url === "/moved") return { status: 302, headers: { location: "http://127.0.0.1:1/elsewhere" } };
    if (req.url === "/big") return { status: 200, body: Buffer.alloc(5000) };
    if (req.url === "/a%20b/c%3Fd") return { status: 200, body: Buffer.from("escaped") };
    return undefined;
  });
  const src = httpSource(base, USER_AGENT);
  assert.match(await refusal(src.get("moved", 100)), /the catalog answered 302/, "a redirect is not followed");
  assert.match(await refusal(src.get("missing", 100)), /the catalog answered 404/);
  assert.match(await refusal(src.get("big", 4999)), /more than 4999 bytes/);
  assert.equal((await src.get("big", 5000)).length, 5000);
  assert.equal(Buffer.from(await src.get("a b/c?d", 100)).toString(), "escaped", "a path is sent as a path, never as a query");
  assert.match(await refusal(httpSource("http://127.0.0.1:1", USER_AGENT).get("v1/feed.json", 100)), /cannot be fetched/);
  assert.throws(() => httpSource("file:///etc", USER_AGENT), /not http\(s\)/);
});

test("a download has one deadline for the whole file: an address that drips, or never answers, is given up in one plain sentence", async () => {
  let open = 0;
  const server = createServer((req, res) => {
    open++;
    res.on("close", () => { open--; });
    if (req.url === "/silent") return; // the request is taken and never answered
    res.writeHead(200);
    const drip = setInterval(() => res.write("x"), 20); // never silent for long, never done
    res.on("close", () => clearInterval(drip));
  });
  servers.push(server);
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const host = `127.0.0.1:${(server.address() as AddressInfo).port}`, src = httpSource(`http://${host}`, USER_AGENT, 300);
  for (const path of ["drip", "silent"]) {
    const started = Date.now();
    assert.equal(await refusal(src.get(path, 1 << 20)), `${host}/${path}: not whole after 0.3 seconds; the download was stopped`);
    assert.ok(Date.now() - started < 5000, "it does not wait for the idle timeout");
  }
  for (let i = 0; open > 0 && i < 100; i++) await new Promise((done) => setTimeout(done, 10));
  assert.equal(open, 0, "the connection is closed, not left to drip");
  assert.equal(DEADLINE_MS, 60_000, "as shipped: 60 seconds for one file");
});
