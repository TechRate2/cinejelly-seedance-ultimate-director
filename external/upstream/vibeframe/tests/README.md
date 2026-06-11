# Tests

Most automated tests live next to the code as `*.test.ts` files and run through
package scripts such as:

```bash
pnpm test
```

This root `tests/` directory is only for manual smoke checks that need external
tools, real provider keys, large local model downloads, or optional rendering
dependencies.

- `smoke/kokoro.sh` - checks local Kokoro narration, optional Whisper
  word-sync, scene linting, and optional render/audio muxing.

Keep historical experiments and release scratch output out of this directory.
