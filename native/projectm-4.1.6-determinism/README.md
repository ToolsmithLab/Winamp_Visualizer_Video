# projectM 4.1.6 deterministic overlay

This directory contains the complete modified source files used to build the
distributed `projectM-4.dll`. It is an overlay for the unmodified projectM
4.1.6 release source:

- tag: `v4.1.6`;
- commit: `3158ee6`;
- archive: `libprojectM-4.1.6.tar.gz`;
- archive SHA-256:
  `1B9E6D56C59FE24E5416DA4D42E941A34C982811003E43AC88B5ACA8AFA52C87`.

The overlay keeps the projectM version and existing C ABI intact. It adds
`projectm_create_with_seed(uint64_t)` and resets every projectM PRNG before the
engine constructor runs. Deterministic instances advance the engine and
transition clocks by the configured FPS instead of wall-clock time. The
original `projectm_create()` remains available with its normal nondeterministic
behaviour for ABI compatibility.

## Applying the overlay

1. Extract the exact upstream release archive.
2. Populate the release's vendored dependencies using the normal projectM
   build procedure.
3. Copy the contents of `overlay/` over the extracted source tree, preserving
   relative paths.
4. Configure an x64 Release build with shared libraries enabled and the C++
   interface, playlist, SDL UI and tests disabled.
5. Build with MSVC 19.44.35228.0.

The application host requires protocol version 2 and resolves
`projectm_create_with_seed`. An unpatched DLL or protocol-v1 host therefore
fails with an explicit incompatibility error instead of silently losing
determinism.

The projectM license and author notices remain in `licenses/projectM/`.
These modified source files are provided under the same
LGPL-2.1-or-later terms declared by projectM. This is technical and
documentary compliance information, not a legal opinion.
