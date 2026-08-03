# Source Sprite Strips

First-pass generated strips and model references for the Department of
Impossible Complaints Adventure Forge workflow.

## Current production gate

Animation strip generation is paused until each strip is made from the approved
character model sheet in `model-sheets/`.

The earlier text-only strip prompts can produce attractive drawings, but they
also re-cast the character between poses. That causes the exact in-game bugs we
are avoiding: model scale drift, face/outfit drift, ghost bodies, detached
hands, shadow/contact mismatch, and character-size mismatch.

Going forward, every cycle must pass a model-consistency check against the model
sheet before slicing.

## Existing first-pass strips

- `mara-idle-5pose-strip-v1.png` — usable first-pass idle reference. Good scale
  consistency and restrained motion; background is slightly gradient, so it may
  need cleanup before automated keying.
- `quire-counter-idle-6pose-strip-v1.png` — good counter-actor direction, but
  pose 5 includes a drawn sigh puff/effect. Regenerate before final slicing.
- `pigeon-idle-5pose-strip-v1.png` — usable first-pass perched idle reference.
  Background is slightly gradient, so cleanup may be needed before automated
  keying.

## Model sheets

- `model-sheets/mara-vane-model-sheet-v1.png`
- `model-sheets/quire-model-sheet-v1.png`
- `model-sheets/pigeon-model-sheet-v1.png`
- `model-sheets/dill-model-sheet-v1.png`

These are the canonical identity references for the next animation pass.

## Next QA gate

Before slicing into Adventure Forge frames:

1. Confirm even cell divisions.
2. Remove or reject gradient backgrounds if chroma-key trimming fails.
3. Reject any strip with detached hands, contact drift, duplicate body parts, or
   scale changes.
4. Regenerate Quire without symbols/effects before using him as production
   source.
5. Compare every cell to the matching model sheet before accepting the strip.

