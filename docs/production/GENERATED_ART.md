# Generated art exchange — 2026-10-13

This package adds resources only. It does not change game code or install character portraits. See `generated-art-manifest.json` for paths, dimensions, byte counts, SHA-256, Git blob hashes, Library backup IDs and approval states.

## Contents

- `art-src/refs/`: nine character turnaround sheets (including Ratnikov) and Burtsev's left-hand detail. These are development references, not in-game portraits.
- `art-src/refs/native/`: untouched 1536×1024 originals for the eight additional sheets and hand study. Their canonical reference exports are technical Lanczos enlargements to 2304×1536. Ratnikov's approved sheet stays at its actual native 1536×1024; no higher-resolution master is claimed.
- `art-src/refs/prompts/` and `qa/`: full effective prompts, canonical CSV data, review results and limitations.
- `art-src/styleframes/ratnikov-neutral/`: initial and expressive style explorations. The expressive style was approved, but its framing/safe zones and flat-background requirements have not passed production QA. Neither is a production neutral anchor or a transparent game portrait.
- `art-src/backgrounds/basement_b0_03_evening/`: approved basement styleframe native PNG and prompt/QA. `public/backgrounds/basement_b0_03_evening.webp` is the 1920×1080 resource export. Native output is 1672×941; export uses proportional Lanczos enlargement and a one-pixel bottom crop. No 2560×1440 master exists.

## Approval and continuity

Ratnikov's expressive style, basement style and Ratnikov's appearance were approved separately. The owner waived individual approval of the remaining references; those are marked QA-reviewed, not individually owner-approved. Historical generation-time metadata may say “awaiting approval”; `publication_approval_state` and the stable manifest record the current status.

Retain Dasha's Koryo-saram appearance and anatomical-left shaved temple, Oleg's abstract purple mark, and Valentina's photograph shown from the reverse until Irina's identity is established. Burtsev's short brush moustache includes documented local revisions. His hand study depicts the left hand, five digits, with only the ring finger's distal phalanx absent.

## Reuse

Use character sheets as identity references, then follow `ART_BIBLE.md` and `prompts.csv` for production framing, lighting, emotion and export QA. Do not silently promote a styleframe to a game-ready asset. Native pixels are preserved; generated resolution and technical enlargement are distinguished explicitly.

The repository ignores `art-src/` for ordinary untracked files, but this specifically requested exchange package is deliberately tracked. Future additions require an explicit tracked add (for example `git add -f` for the intended files only). Existing source and game files are preserved. No redundant ZIP is included.

Validation performed: all 25 image files decode; native/export dimensions and hashes match the supplied metadata; all nine canonical additional-reference paths match the CSV; reference sheets and the approved styleframe/background were inspected during packaging. This resource-only delivery does not claim a full application build or test run.
