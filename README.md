# hr-openclaw

A plugin for [OpenClaw](https://openclaw.ai) that hires an employee from [hr.harnsy.dev](https://hr.harnsy.dev), the
catalog of AI employees, as an OpenClaw agent with a workspace of its own.

An employee is a role with a character: who it is, how it decides and speaks, its job, and the skills it works with.
`hire` downloads the employee from the catalog's signed feed, checks the signature on your machine, shows you what it
is about to write, asks, and only then writes the files and adds the agent. Your own agent and its workspace are not
touched; several employees live side by side.

Built and tested against OpenClaw 2026.11.3.

The catalog's public key (key id `c1`) is built into the plugin (`src/keys.ts`). A feed whose signature does not verify
under it is refused, and nothing is written.

## Install

From a release tag (valid once a tag exists; none is published yet):

```
openclaw plugins install git:github.com/harnesy/hr-openclaw@<tag>
```

From a checkout of this repository:

```
openclaw plugins install <path to the checkout>
```

OpenClaw warns that a source outside ClawHub is not reviewed, and wants a confirmation. In a script, add
`--force --accept-capabilities`. What the plugin declares is one terminal command and one chat command.

Nothing is built or downloaded at install: the built plugin is in `dist/`, and it has no dependencies to install.
`openclaw plugins inspect harnsy-hr --runtime --json` shows what OpenClaw loaded.

## Commands

In a terminal:

| Command | What it does |
|---|---|
| `openclaw harnsy-hr search [words…]` | Search the catalog by a few words (a role, a skill, a need; at most 256 bytes and 16 different words). `--department <name>`, `--limit <n>` (at most 20). No words lists everyone. The words stay on your machine. |
| `openclaw harnsy-hr show <id>` | One employee: what it needs, the files a hire writes, its notice. |
| `openclaw harnsy-hr hire <id>` | Shows the card, what the employee needs, every file and the full notice, then asks. After a yes it writes the files and adds the agent. `--yes` for scripts. |
| `openclaw harnsy-hr update <id>` | Fetches and verifies the employee again and brings the files this plugin wrote to the current version. `--yes`, `--replace-edited`. |
| `openclaw harnsy-hr list` | The employees hired on this machine. Reads the disk only. |
| `openclaw harnsy-hr fire <id>` | After a yes, has OpenClaw delete the agent (`openclaw agents delete`: OpenClaw removes the agent and moves its workspace to the Trash). Only an agent this plugin hired. `--yes` for scripts. |

An id is `<publisher>/<name>`, for example `harnsy/accountant`.

In a chat, `/harnsy-hr search <words>`, `/harnsy-hr show <id>` and `/harnsy-hr list` answer with text. `hire`,
`update` and `fire` are not run from a chat: they write files and wait for your yes, so the chat command answers with
the terminal command to type. (OpenClaw registers the chat command, and this repository's tests run it; it has not
been tried in a live channel yet.)

What the commands print of the catalog's text (a card, what an employee needs, a notice) is printed without control
characters and without the characters that hide or reorder text (zero-width characters, direction overrides and the
rest of Unicode's format characters); in an error message such a character is shown as an escape (`\u202e`). The files
a hire writes keep every byte the catalog signed. A chat answer is sent as one code block, so nothing in a publisher's
text is posted as a link, a mention or markup; a backtick in it is shown as an apostrophe.

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
no search words, nothing about you or your machine; redirects are not followed. Each file has 60 seconds to arrive
whole, and a connection that is silent for 30 seconds is dropped: either way the command stops with one sentence and
writes nothing. There is no telemetry, and the plugin never updates itself: a new version arrives only when you install
it.

`list` and the chat's `list` use no network. The catalog's server sees what any web server sees of a download (address,
time, path, the User-Agent above).

Installing through ClawHub's CLI is subject to ClawHub's own telemetry.

### Test catalogs

For stands only. A test catalog is read when two things agree:

- the environment names it: `HARNSY_HR_FEED` (an address that replaces `https://hr.harnsy.dev` for fetching; the feed
  must still name `hr.harnsy.dev`), `HARNSY_HR_PUB` (`<kid>:<base64 of the raw Ed25519 public key>`, the only key
  trusted while it is set), or both;
- the command line says `--test-catalog` (`search`, `show`, `hire` and `update` take it).

The flag is there because OpenClaw fills the environment from files: a `.env` in the folder a command is run from,
`~/.openclaw/.env`, the `env` block of its config. A folder someone else prepared (a cloned repository, a download, the
workspace of a hired agent) could name a catalog and a key of its own that way. A word of the command line cannot come
from a file.

- A variable is set and `--test-catalog` is not given: the command refuses before anything is fetched or written, and
  names the variable. Unset it to read `hr.harnsy.dev`.
- `--test-catalog` is given and neither variable is set: refused.
- In a chat a test catalog is never read. With a variable set, `/harnsy-hr search` and `/harnsy-hr show` refuse;
  `/harnsy-hr list` reads no catalog and answers as ever.
- Both agree: the command first prints one line saying that a test catalog is in use, with its address and key id, and
  the question `hire` and `update` ask names the address and the key again and says that this is not `hr.harnsy.dev`.
  `--yes` together with `--test-catalog` is allowed, because stands are scripted: both are words of the command line.
- Plain `http` is taken only for this machine itself (`127.0.0.1`, `[::1]`, `localhost`); any other address needs
  `https`.
- The feed number of a test catalog is kept apart in `state.json`, under `test:<key id>`: a test run never reads or
  writes the number kept for the real catalog's key, so a stand cannot make the real catalog look old.

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
