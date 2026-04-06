# Changelog

## [2.0.0](https://github.com/BrunoJurkovic/claude-code-discord-status/compare/v1.3.0...v2.0.0) (2026-04-06)


### ⚠ BREAKING CHANGES

* binary renamed from claude-discord-status to claude-presence, config dir moved from ~/.claude-discord-status/ to ~/.claude-presence/, env vars renamed from CLAUDE_DISCORD_* to CLAUDE_PRESENCE_*

### feat\

* rename to claude-presence ([9905e18](https://github.com/BrunoJurkovic/claude-code-discord-status/commit/9905e186eefd17ebe77ffd610a8bf43d5e698cd6))


### Features

* add Windows support ([#10](https://github.com/BrunoJurkovic/claude-code-discord-status/issues/10)) ([c693bbd](https://github.com/BrunoJurkovic/claude-code-discord-status/commit/c693bbd654ec8866252b792409ed700886d4b342))
* rename to claude-presence with UX overhaul (v2.0.0) ([#8](https://github.com/BrunoJurkovic/claude-code-discord-status/issues/8)) ([146b840](https://github.com/BrunoJurkovic/claude-code-discord-status/commit/146b840c995f809517bfd9a013ac0c141af73df7))

## [1.3.0](https://github.com/BrunoJurkovic/claude-code-discord-status/compare/v1.2.0...v1.3.0) (2026-03-17)


### Features

* show real-time tool icon in multi-session mode ([e4a2020](https://github.com/BrunoJurkovic/claude-code-discord-status/commit/e4a2020caec915f834187da2d9956a854eff70fc))


### Bug Fixes

* auto-restart daemon from hook when it dies ([d9e42e2](https://github.com/BrunoJurkovic/claude-code-discord-status/commit/d9e42e208afd74c78272d14515f4e582da98914a))
* copy hook to stable path and recommend global install ([3642926](https://github.com/BrunoJurkovic/claude-code-discord-status/commit/3642926b5f8b269589fe7fc2fd5281751668bfb9))

## [1.2.0](https://github.com/BrunoJurkovic/claude-code-discord-status/compare/v1.1.0...v1.2.0) (2026-03-03)


### Features

* add configurable message presets with 5 styles ([fdb90af](https://github.com/BrunoJurkovic/claude-code-discord-status/commit/fdb90af14367d263bf0c044550194e6a34869e0a))
* remove MCP server component to prevent project detail leaks ([51a47b4](https://github.com/BrunoJurkovic/claude-code-discord-status/commit/51a47b4d79979f478e707743e0730dfefb274132))


### Bug Fixes

* clean up legacy MCP registration on auto-update ([5a50c87](https://github.com/BrunoJurkovic/claude-code-discord-status/commit/5a50c873563029f3b071ce152feec82f706817bc))
* resolve restart race condition and PID file race ([9e4af97](https://github.com/BrunoJurkovic/claude-code-discord-status/commit/9e4af973d0c06109efecd34c78cbf63f3df4f49d))

## [1.1.0](https://github.com/BrunoJurkovic/claude-code-discord-status/compare/v1.0.1...v1.1.0) (2026-02-17)


### Features

* redesign Discord status icons with official Claude starburst ([9ffa677](https://github.com/BrunoJurkovic/claude-code-discord-status/commit/9ffa677174b0b0684f83e93342107f2611019781))
* replace single session details with action-specific messages ([0e0d273](https://github.com/BrunoJurkovic/claude-code-discord-status/commit/0e0d27315ca2d60cb36d97d5287666b51b83abc8))
* show changelog after updating ([7dbc45c](https://github.com/BrunoJurkovic/claude-code-discord-status/commit/7dbc45cfdd27046aa232966b539539ab8aaa4ae2))


### Bug Fixes

* prevent active file names from leaking to Discord status ([141cab2](https://github.com/BrunoJurkovic/claude-code-discord-status/commit/141cab2d5eecb1c95499cdc549f33fd019b9c1b5))

## [1.0.1](https://github.com/BrunoJurkovic/claude-code-discord-status/compare/v1.0.0...v1.0.1) (2026-02-16)


### Bug Fixes

* compare update notification against running version instead of stale cache ([ea86241](https://github.com/BrunoJurkovic/claude-code-discord-status/commit/ea862415721cb1781bb19eb447c466504fccc53f))

## 1.0.0 (2026-02-16)


### Features

* add update management system with CLI notifications and release workflow ([4e4512d](https://github.com/BrunoJurkovic/claude-code-discord-status/commit/4e4512d5ecf90e5f7f5cd0687e707947c163f6a3))
* auto-start daemon from MCP server on session start ([8aa5c20](https://github.com/BrunoJurkovic/claude-code-discord-status/commit/8aa5c205983f8f672998b25da08524b2265f1cd9))
* overhaul CLI UI with @clack/prompts ([bf9e99a](https://github.com/BrunoJurkovic/claude-code-discord-status/commit/bf9e99a167c4f817a4d6c0d45876746b8f64fcaf))
* overhaul README with SVG assets and polished layout ([42285cb](https://github.com/BrunoJurkovic/claude-code-discord-status/commit/42285cbd6a95909842c0fc53b62f49861e593163))
* use official Claude and Discord logos in hero banner ([ba6b88e](https://github.com/BrunoJurkovic/claude-code-discord-status/commit/ba6b88e8a5e1d245ac205f91974a0a35d5632f7f))


### Bug Fixes

* apply Prettier formatting to pass CI ([c99d108](https://github.com/BrunoJurkovic/claude-code-discord-status/commit/c99d1088648aeecb4b9aa1e7c2da26758baa0e1a))
* architecture diagram label overlap and card padding ([0f84f23](https://github.com/BrunoJurkovic/claude-code-discord-status/commit/0f84f23900e97810e910f89f91af151ee2e70778))
* format cli.ts and require format check before commits ([f80c5e4](https://github.com/BrunoJurkovic/claude-code-discord-status/commit/f80c5e40eef5ea0da6b57df5e2b3c01a14535163))
* include full Discord logo path with eye cutouts ([e5b5a71](https://github.com/BrunoJurkovic/claude-code-discord-status/commit/e5b5a718c0c40603ae4893c4bebf95938bee51d8))
* prevent project name from leaking to Discord presence ([ff698b9](https://github.com/BrunoJurkovic/claude-code-discord-status/commit/ff698b92691d52797ef22d247858d74d95a4ee2f))
* replace HTML entities with XML numeric refs in architecture SVG ([ce5d42f](https://github.com/BrunoJurkovic/claude-code-discord-status/commit/ce5d42fa01ecec45bf9b952acc97d21563c83983))
