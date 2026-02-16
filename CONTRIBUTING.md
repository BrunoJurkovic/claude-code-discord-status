# Contributing

Thanks for your interest in contributing!

## Development Setup

```bash
git clone https://github.com/your-username/claude-code-discord-status.git
cd claude-code-discord-status
npm install
```

## Commands

```bash
npm run build        # Build with tsup
npm run dev          # Build in watch mode
npm test             # Run tests
npm run test:watch   # Run tests in watch mode
npm run lint         # Lint with ESLint
npm run format       # Format with Prettier
npm run typecheck    # TypeScript type checking
```

## Running Locally

```bash
npm run build
node dist/cli.js setup
node dist/cli.js start
```

## Testing

Tests use Vitest. Run them with:

```bash
npm test
```

Key test files:
- `tests/daemon/sessions.test.ts` — Session registry logic
- `tests/daemon/resolver.test.ts` — Presence resolver (single vs multi mode)
- `tests/daemon/server.test.ts` — HTTP API integration tests
- `tests/shared/config.test.ts` — Configuration loading

## Pull Request Guidelines

1. Fork the repo and create your branch from `main`
2. Write tests for new functionality
3. Ensure `npm test` and `npm run typecheck` pass
4. Update documentation if needed
5. Submit a PR with a clear description
