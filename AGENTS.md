# AGENTS.md - WorkAdventure Monorepo

WorkAdventure is a TypeScript monorepo (npm workspaces) for building collaborative virtual worlds.

## Instruction scope

- The closest `AGENTS.md` to a changed file takes precedence.
- Directories without their own `AGENTS.md` inherit this file and the shared guides below.
- Package scripts and `.github/workflows/continuous_integration.yml` are the source of truth when a documented command drifts.
- Run package scripts from that package's directory unless the command explicitly uses `--workspace`.

## Fork maintenance

- Read [FORK.md](FORK.md) before changing a fork-specific integration or synchronizing with upstream.
- Update its inventory when adding, changing, or removing a local adaptation, including relevant validation and status.
- For every upstream synchronization, check whether upstream now covers each local adaptation. Prefer the upstream
  implementation when it preserves the required behavior in the self-hosted edition; remove redundant local code,
  configuration, and tests, migrate existing data if needed, and record the replacement and validation in `FORK.md`.
- Do not retain a patch merely because it was previously marked "preserve", or remove one based on a similar feature
  name alone. Verify behavior, configuration compatibility, and availability in this deployment.

## Main projects

- `play/AGENTS.md`: Svelte/Phaser frontend, pusher, and Room API server.
- `back/AGENTS.md`: backend API.
- `map-storage/AGENTS.md`: map storage backend.
- `messages/AGENTS.md`: protobuf sources and generated TypeScript.
- `libs/AGENTS.md`: shared `@workadventure/*` libraries.
- `tests/AGENTS.md`: Playwright end-to-end tests.

## Shared guidance

- `docs/agent/dev-setup.md`
- `docs/agent/lint-format.md`
- `docs/agent/testing-vitest.md`
- `docs/agent/typescript-style.md`
- `docs/agent/error-handling.md`
- `docs/agent/svelte.md`
- `docs/agent/i18n.md`
- `docs/agent/common-issues.md`
- `docs/agent/devtools.md`
