import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { addAgent, deleteAgent, json, listAgents, setIdentity, spawnRunner, type Runner } from "../src/openclaw.ts";
import { refusal, tempDir } from "./kit/sample.ts";

const answers = (r: { code?: number; stdout?: string; stderr?: string }, calls: string[][] = []): Runner => async (args) => {
  calls.push([...args]);
  return { code: r.code ?? 0, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
};

test("the JSON OpenClaw prints is read, also after a line of another kind", () => {
  assert.deepEqual(json(`[\n  {"id": "main"}\n]\n`), [{ id: "main" }]);
  assert.deepEqual(json(`{"agentId":"a"}`), { agentId: "a" });
  assert.deepEqual(json(`[plugins] a notice in brackets\nWarning: something\n[\n  {"id": "main"}\n]\n`), [{ id: "main" }]);
  assert.deepEqual(json(`{not json}\n{"agentId": "a"}\n`), { agentId: "a" });
  for (const none of ["", "no json here", "[plugins] only a notice", "{"]) assert.equal(json(none), undefined, none);
});

test("agents are listed by id and workspace; anything else OpenClaw says is a refusal with its words", async () => {
  const out = JSON.stringify([{ id: "main", workspace: "/w", isDefault: true }, { id: "x" }, { name: "no id" }, null, 7]);
  assert.deepEqual(await listAgents(answers({ stdout: out })), [{ id: "main", workspace: "/w" }, { id: "x", workspace: "" }]);
  assert.match(await refusal(listAgents(answers({ code: 1, stderr: "state is locked\n" }))), /OpenClaw did not list its agents \(state is locked\)/);
  assert.match(await refusal(listAgents(answers({ stdout: `{"agents": []}` }))), /did not list its agents/);
  assert.match(await refusal(listAgents(answers({ code: 3 }))), /exit code 3/);
});

test("every OpenClaw command is an argument array: a name is one argument whatever it holds", async () => {
  const calls: string[][] = [];
  assert.equal(await addAgent(answers({ stdout: `{"agentId": "acc"}` }, calls), "accountant", "/state dir/workspace-accountant"), "acc");
  assert.equal(await addAgent(answers({ stdout: "added" }, calls), "accountant", "/w"), "accountant", "no JSON: the name asked for");
  assert.equal(await setIdentity(answers({}, calls), "accountant"), true);
  assert.equal(await setIdentity(answers({ code: 1 }, calls), "accountant"), false);
  await deleteAgent(answers({}, calls), "accountant");
  assert.match(await refusal(addAgent(answers({ code: 1, stderr: "name is reserved" }), "x", "/w")), /OpenClaw did not add the agent \(name is reserved\)/);
  assert.match(await refusal(deleteAgent(answers({ code: 1, stdout: "no such agent" }), "x")), /OpenClaw did not delete the agent \(no such agent\)/);
  assert.deepEqual(calls, [
    ["agents", "add", "accountant", "--workspace", "/state dir/workspace-accountant", "--non-interactive", "--json"],
    ["agents", "add", "accountant", "--workspace", "/w", "--non-interactive", "--json"],
    ["agents", "set-identity", "--agent", "accountant", "--from-identity", "--json"],
    ["agents", "set-identity", "--agent", "accountant", "--from-identity", "--json"],
    ["agents", "delete", "accountant", "--force", "--json"],
  ]);
});

test("the runner starts the openclaw program that is running, without a shell", async () => {
  const dir = tempDir(), cli = join(dir, "fake openclaw.mjs");
  writeFileSync(cli, `console.log(JSON.stringify(process.argv.slice(2))); console.error("to stderr"); process.exit(process.argv.includes("fail") ? 4 : 0);`);
  const run = spawnRunner(["node", cli]);
  const odd = ["agents", "add", "a b", "$(touch pwned)", "; echo x", "`id`", "--workspace", join(dir, "it's here")];
  const r = await run(odd);
  assert.deepEqual([r.code, JSON.parse(r.stdout), r.stderr.trim()], [0, odd, "to stderr"], "each argument arrives as it was given");
  assert.equal((await run(["fail"])).code, 4);
  assert.equal((await spawnRunner(["node"])(["agents", "list"])).code, 1, "no openclaw program to run");
  assert.equal((await spawnRunner(["node", cli], join(dir, "no-such-node"))(["agents", "list"])).code, 1);
});
