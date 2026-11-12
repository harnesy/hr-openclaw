# hr-openclaw

A plugin for [OpenClaw](https://openclaw.ai) that hires an employee from [hr.harnsy.dev](https://hr.harnsy.dev), the
catalog of AI employees, as an OpenClaw agent with a workspace of its own.

An employee is a role with a character: who it is, how it decides and speaks, its job, and the skills it works with.
`hire` downloads the employee from the catalog's signed feed, checks the signature on your machine, shows you what it
is about to write, asks, and only then writes the files and adds the agent. Your own agent and its workspace are not
touched; several employees live side by side.

Built and tested against OpenClaw 2026.11.3.

> **Status.** The catalog's public key is not published yet, so this version has no key built in
> (`src/keys.ts` holds an empty slot for it). Until a version with the key is released, every command that reads the
> catalog stops with a sentence saying so; nothing is fetched and nothing is written.

## Install

From a release tag (valid once a tag exists; none is published yet):

```
openclaw plugins install git:github.com/harnesy/hr-openclaw@<tag>
```

OpenClaw treats a git source as untrusted: it shows what the plugin declares (one terminal command, one chat command)
and asks you to confirm. In a script: `--force --accept-capabilities`.

From a checkout of this repository:

```
openclaw plugins install <path to the checkout> --force --accept-capabilities
```

Nothing is built or downloaded at install: the built plugin is in `dist/`, and it has no dependencies to install.

## Commands

In a terminal:

| Command | What it does |
|---|---|
| `openclaw harnsy-hr search [words…]` | Search the catalog by words (a role, a skill, a need). `--department <name>`, `--limit <n>` (at most 20). No words lists everyone. The words stay on your machine. |
| `openclaw harnsy-hr show <id>` | One employee: what it needs, the files a hire writes, its notice. |
| `openclaw harnsy-hr hire <id>` | Shows the card, what the employee needs, every file and the full notice, then asks. After a yes it writes the files and adds the agent. `--yes` for scripts. |
| `openclaw harnsy-hr update <id>` | Fetches and verifies the employee again and brings the files this plugin wrote to the current version. `--yes`, `--replace-edited`. |
| `openclaw harnsy-hr list` | The employees hired on this machine. Reads the disk only. |
| `openclaw harnsy-hr fire <id>` | After a yes, has OpenClaw delete the agent (`openclaw agents delete`; OpenClaw moves its workspace, state and transcripts to the Trash). `--yes` for scripts. |

An id is `<publisher>/<name>`, for example `harnsy/accountant`.

In a chat, `/harnsy-hr search <words>`, `/harnsy-hr show <id>` and `/harnsy-hr list` answer with text. `hire`,
`update` and `fire` are not run from a chat: they write files and wait for your yes, so the chat command answers with
the terminal command to type.

The plugin adds nothing else: no tools for the model, no hooks, no background service. It runs only when you call it.

## What a hire writes

Under OpenClaw's state directory (`~/.openclaw`), a folder `workspace-<name>`:

```
SOUL.md              who the employee is
AGENTS.md            its job
IDENTITY.md          its name, vibe and emoji
skills/<skill>/…     its skills, byte for byte as published; they belong to this agent only
docs/…               its casebook of worked cases
NOTICE.md            licence, source, credits: keep it with the employee
.harnsy/hire.json    this plugin's record: which employee, and the SHA-256 of each file it wrote
```

The files are written first; then the plugin runs `openclaw agents add <name> --workspace <folder> --non-interactive`.
OpenClaw adds its own `USER.md` there and puts the agent's id into the name line of `IDENTITY.md`; the plugin puts
the employee's `IDENTITY.md` back and runs `openclaw agents set-identity --agent <name> --from-identity`, so the agent
carries the employee's name.

- If an agent of that name exists, or the folder already holds files, `hire` stops and says so. It never overwrites.
- If OpenClaw does not add the agent, the files written for it are removed again.
- `USER.md`, `MEMORY.md` and the agent's notes are OpenClaw's and yours: the plugin never writes or reads them.
- Scripts that come with a skill are written as plain files, without the execute bit. The plugin never runs them. The
  agent may run them later, as it may run any file in its workspace: read what `hire` lists before you say yes.
- `update` replaces only files that are still as the plugin wrote them. A file you changed is asked about, one by
  one, and kept unless you say yes (`--yes` keeps them, `--replace-edited` replaces them). `NOTICE.md` is always
  brought up to date.
- The hired agent uses the model your OpenClaw is set up with. Talking to it (`openclaw agent --agent <name> …`) is
  OpenClaw's own command; it needs a model and was not part of this repository's tests.

## What is checked on your machine

Before anything is written, in this order; any failure stops with the reason and writes nothing:

1. `feed.json` against `feed.json.sig`: an Ed25519 signature over the exact bytes of the feed, by a catalog key built
   into the plugin. A feed signed under a key id the plugin does not know is refused («update the plugin»).
2. The feed's version, its expiry date, and its sequence number: the highest one seen is remembered
   (`~/.openclaw/harnsy-hr/state.json`), and an older feed, even a validly signed one, is refused.
3. Every employee entry of the feed: its id and version must have the catalog's form (`<publisher>/<name>` in lowercase
   letters, digits and `-`; `MAJOR.MINOR.PATCH`), and its addresses must be on `hr.harnsy.dev`. Versions the catalog
   withdrew are not served.
4. The bundle file: its size and SHA-256 must equal the feed's, before it is opened.
5. The bundle as a zip, read in memory: at most 128 entries and 8 MB unpacked (counted as it unpacks, whatever the
   headers say), plain files only, no name twice, no name that leaves the bundle.
6. The bundle's manifest: it must name the same employee and version, list only the kinds of files a bundle may carry,
   and every listed file's SHA-256 must match.
7. The catalog's signature over the manifest (`signatures/catalog.jws`: EdDSA, the same key, bound to the catalog's
   host, the employee's id and version, and the manifest's hash).
8. Every path about to be written is checked once more to lie inside the employee's own workspace folder, and the
   plugin does not read or write through symbolic links.

OpenClaw's `openclaw skills verify` covers ClawHub skills only and does not apply here; the checks above are the
check. A signature says the files are the ones the catalog published. It does not make an employee's text or scripts
safe for your purpose: read what you hire.

## What is sent over the network

Only `GET` requests to the catalog, `https://hr.harnsy.dev`: the feed, its signature, and the bundle of the employee
you asked for. Each carries one header of the plugin's, `User-Agent: hr-openclaw/<version>`. No cookies, no account,
no search words, nothing about you or your machine; redirects are not followed. There is no telemetry, and the plugin
never updates itself: a new version arrives only when you install it.

`list` and the chat's `list` use no network. The catalog's server sees what any web server sees of a download (address,
time, path, the User-Agent above).

Installing through ClawHub's CLI is subject to ClawHub's own telemetry.

### Test catalogs

For stands only, two environment variables: `HARNSY_HR_FEED` (an address that replaces `https://hr.harnsy.dev` for
fetching; the feed must still name `hr.harnsy.dev`) and `HARNSY_HR_PUB` (`<kid>:<base64 of the raw Ed25519 public
key>`, the only key trusted while it is set). When either is set, every command first prints one line saying a test
catalog is in use.

## Licences

The code in this repository is under the MIT licence (`LICENSE`); the library the built plugin contains is listed in
`NOTICE`, with its licence text in `THIRD_PARTY_LICENSES`. The employees are not part of this repository. Each has its
own licence, most often CC BY 4.0, and arrives with a `NOTICE.md` that names its author, licence, source and the works
it is built on: keep that file with the employee. An employee's text is under the licence its `NOTICE.md` names, not
under this repository's MIT licence. Each skill keeps its own `LICENSE` file where it has one. Employee pictures are
not copied.

This project is not affiliated with or endorsed by OpenClaw, Nous Research (Hermes Agent), Anthropic, OpenAI or the
MCP project; their names are used only to say what it works with.

## Development

Node 22 or newer for the tests; OpenClaw itself runs plugins on Node 24.22.1+.

```
npm ci
npm test          # type check, then every test
npm run build     # rebuilds dist/index.js; commit it with the change (a test fails when it is out of step)
```

`src/index.ts` is the only file that imports OpenClaw's plugin SDK; everything else is tested without OpenClaw.
`test/testdata` holds four made-up employees and the workspaces they must render to, byte for byte the same as
[hr-mcp](https://github.com/harnesy/hr-mcp) renders for its target `openclaw`. A cross-check on a whole catalog runs
when `HR_OPENCLAW_STAND`, `HR_OPENCLAW_STAND_PUB` and `HR_OPENCLAW_TREES` are set (see `test/whole-catalog.test.ts`).
