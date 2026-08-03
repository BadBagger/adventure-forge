# Model-Locked Candidate Strips

First complete Department of Impossible Complaints candidate strip set generated
from the approved model sheets.

These files are **candidate source strips**, not final sliced runtime sprites.
They still need slicing, registration, chroma cleanup, contact-line checks, and
in-engine playback review before use in a shipped scene.

## Generated set

### Mara Vane

- `mara-idle-5pose-model-v1.png`
- `mara-bored-idle-a-6pose-model-v1.png`
- `mara-bored-idle-b-6pose-model-v1.png`
- `mara-walk-8pose-model-v1.png`
- `mara-talk-6pose-model-v1.png`
- `mara-pickup-7pose-model-v1.png`
- `mara-give-item-6pose-model-v1.png`

QA notes: much stronger character consistency than the older text-only strips.
Walk has real coat/satchel overlap and no turn-around pose. Final slicing should
still verify the boot/contact baseline frame by frame.

### Quire

- `quire-counter-idle-6pose-model-v1.png`
- `quire-bored-paperwork-a-6pose-model-v1.png`
- `quire-bored-paperwork-b-6pose-model-v1.png`
- `quire-talk-6pose-model-v1.png`
- `quire-stamp-8pose-model-v1.png`
- `quire-exchange-6pose-model-v1.png`

QA notes: major improvement over the earlier broken Quire attempts. The counter
baseline is shared, hands remain attached, and the body is designed as a
counter-window actor. The stamp smear and exchange reach are intentionally
provisional and need careful registration review after slicing.

### Pigeon

- `pigeon-idle-5pose-model-v1.png`
- `pigeon-bored-idle-a-6pose-model-v1.png`
- `pigeon-bored-idle-b-6pose-model-v1.png`
- `pigeon-talk-bark-6pose-model-v1.png`
- `pigeon-delivery-reaction-6pose-model-v1.png`

QA notes: strong perch/contact consistency. Motion is mostly head, beak, chest,
and small wing action, which is correct for a background actor.

### Dill

- `dill-idle-5pose-model-v1.png`
- `dill-talk-6pose-model-v1.png`
- `dill-panic-panel-8pose-model-v1.png`

QA notes: strong acting and consistent anxious-technician model. Panic-panel
strip contains one intentional hand-smear candidate that must be reviewed after
slicing.

## Required next gate before engine integration

1. Slice each strip by equal cell width.
2. Remove/key the generated grey background or produce alpha frames.
3. Register every frame to a stable origin.
4. Check foot, perch, or counter contact line for every frame.
5. Check character-relative scale across the final sliced set.
6. Play each cycle at normal and half speed before approving runtime use.

