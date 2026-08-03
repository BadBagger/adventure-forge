# Source Sprite Strips

First-pass generated strips for the Department of Impossible Complaints Adventure Forge workflow.

## Files

- `mara-idle-5pose-strip-v1.png` — usable first-pass idle reference. Good scale consistency and restrained motion; background is slightly gradient, so it may need cleanup before automated keying.
- `quire-counter-idle-6pose-strip-v1.png` — good counter-actor direction, but pose 5 includes a drawn sigh puff/effect. Regenerate before final slicing.
- `pigeon-idle-5pose-strip-v1.png` — usable first-pass perched idle reference. Background is slightly gradient, so cleanup may be needed before automated keying.

## Next QA gate

Before slicing into Adventure Forge frames:

1. Confirm even cell divisions.
2. Remove or reject gradient backgrounds if chroma-key trimming fails.
3. Reject any strip with detached hands, contact drift, duplicate body parts, or scale changes.
4. Regenerate Quire without symbols/effects before using him as production source.
