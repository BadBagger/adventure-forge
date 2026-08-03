# Department of Impossible Complaints — Sprite Strip Prompt Library

Use this for generating Adventure Forge animation strips. Generate **one strip per cycle**, then slice by even divisions. The AI makes the art; Adventure Forge / scripts handle geometry, registration, alpha trimming, and playback FPS.

## Core rule

Do **not** ask for giant 72-frame sheets. They get small, mushy, and identity-drifty. Use short strips with fewer poses and generate multiple strips when more variety is needed.

| Cycle | Frames | Strips | Playback FPS | Loop | Use |
|---|---:|---:|---:|---|---|
| Idle | 5 | 1 | 6-8 | yes | Default breathing/resting state |
| Bored idle | 12 | 2 x 6 | 8-10 | no | Inactivity one-shot, then return to idle |
| Walk | 8 | 1 | 10-12 | yes | Standard point-and-click navigation |
| Talk | 6 | 1+ variants | 6-8 | yes/line-held | Small readable gestures while speaking |
| Pick up item | 7 | 1 | 12 | no | Reach, grab, straighten |
| Give item | 6 | 1 | 12 | no | Offer object forward |
| Stamp / impact | 8 | 1 | 14-16 | no | Fast action, may use 1 smear frame |

Frames control smoothness. FPS controls speed. Do not fix bad motion by raising FPS.

## Locked strip structure

Paste this into every strip prompt and only change `[N]`, the character block, and the pose breakdown:

> Single horizontal strip, **[N] poses** left to right, evenly spaced. Flat solid mid-grey background (#808080), no grid lines, no borders, no text, no shadows cast on the background. Same character, same outfit, same scale, same camera distance and eye level in every pose. Full body visible in each pose unless the character block explicitly says counter-window upper-body actor. Feet or contact point stay on a consistent ground/contact line, even margins between poses. Consistent flat lighting.

Why grey: it is easy to trim/key out and less likely to contaminate the characters than pink/green.

## Character blocks

Keep the relevant character block byte-identical across that character's prompts.

### Mara Vane

> **MARA VANE** — adult woman investigator, average height, practical athletic build, grounded silhouette, wearing a teal trench coat over a white shirt and dark tie, dark trousers, brown lace-up boots, and a brown shoulder satchel. Short wavy brown hair, tired sharp eyes, one eyebrow often skeptical. 3/4 adventure-game view unless walk/sprint requires side profile.

Personality motion: restrained, dry, observant, tired but competent. Small gestures only. No frantic arm flinging.

### Quire

> **QUIRE** — adult bureaucratic intake clerk, narrow anxious build, visible as an upper-body counter-window actor behind a simple desk/counter edge, wearing folded-paper-inspired cream clerk clothing, green visor, green tie, small tired eyes or glasses, angular paper-like silhouette. Hands, pen, paper stack, and rubber stamp visible above the counter. 3/4 adventure-game view.

Personality motion: fussy, precise, rule-bound, nervous. Always doing paperwork. Hands must remain attached and visibly above the counter surface.

### Pigeon

> **PIGEON** — stylized grey city pigeon with smug bureaucratic personality, compact rounded body, purple-green neck sheen, small tie or department tag, perched on a simple brass perch. Cartoon readable but not babyish. 3/4 adventure-game view.

Personality motion: smug, twitchy, officious. Feet stay locked to perch.

### Dill

> **DILL** — overwhelmed weather-office technician, slim nervous build, slightly damp office clothes with rolled sleeves, loosened tie, utility vest or clipboard harness, tired apologetic face, messy hair flattened by indoor rain. 3/4 adventure-game view unless walk/sprint requires side profile.

Personality motion: jittery, apologetic, reactive. Checks gauges, flinches at drips, over-explains with nervous hands.

## Mara prompts

### Idle — 5 poses @ 6-8fps

> [LOCKED STRUCTURE, N=5] [MARA VANE CHARACTER BLOCK]
> Poses: subtle breathing loop. 1 neutral stand with one hand near satchel, 2 shoulders and chest rise slightly, 3 peak inhale with tiny eyebrow lift, 4 chest lowers and coat tails lag, 5 return to neutral matching pose 1. Feet planted identically in all 5. No speaking gesture.

### Bored idle — Strip A, 6 poses @ 8-10fps

> [LOCKED STRUCTURE, N=6] [MARA VANE CHARACTER BLOCK]
> Poses 1-6: restrained impatience. 1 neutral, 2 shifts weight slightly without moving feet, 3 glances sideways, 4 adjusts satchel strap, 5 exhales with shoulders dropping, 6 straightens. Coat and satchel follow through softly.

### Bored idle — Strip B, 6 poses @ 8-10fps

> [LOCKED STRUCTURE, N=6] [MARA VANE CHARACTER BLOCK]
> Poses 7-12 continuing the same character: 7 checks the room with skeptical eyes, 8 hand to coat lapel, 9 tiny head tilt, 10 one eyebrow rises, 11 hand returns to side, 12 neutral stand matching idle pose 1.

### Walk — 8 poses side profile @ 10-12fps

> [LOCKED STRUCTURE, N=8] [MARA VANE CHARACTER BLOCK]
> Side profile, moving right. Standard 8-frame walk cycle: 1 contact right foot forward, 2 down/recoil, 3 passing, 4 high point, 5 contact left foot forward, 6 down/recoil, 7 passing, 8 high point. Arms swing opposite legs, coat tails lag, satchel lags. Ground line identical.

### Talk — 6 poses @ 6-8fps

> [LOCKED STRUCTURE, N=6] [MARA VANE CHARACTER BLOCK]
> Restrained dry speech gesture. 1 neutral listening, 2 mouth opens slightly and head tilts, 3 one hand lifts palm-up halfway, 4 eyebrow rises at the point, 5 hand lowers with coat lag, 6 returns to neutral. No arm flinging, no full-body sway.

### Pick up item — 7 poses @ 12fps

> [LOCKED STRUCTURE, N=7] [MARA VANE CHARACTER BLOCK]
> Pick-up-from-floor action. 1 neutral, 2 knees bend and torso leans, 3 crouching reach down, 4 hand reaches floor, 5 fingers close on invisible object, 6 rises with object near chest, 7 upright holding invisible object. Feet remain registered.

### Give item — 6 poses @ 12fps

> [LOCKED STRUCTURE, N=6] [MARA VANE CHARACTER BLOCK]
> Hand-over-object action. 1 neutral holding invisible object at chest, 2 arm begins to extend, 3 arm half extended, 4 arm fully extended offering forward, 5 hand opens to release, 6 arm returns toward neutral. Expression stays dry and controlled.

## Quire prompts

### Counter idle writing — 6 poses @ 8-10fps

> [LOCKED STRUCTURE, N=6] [QUIRE CHARACTER BLOCK]
> Counter-window upper-body idle. 1 neutral writing pose, 2 pen hand moves right slightly, 3 pen hand moves left slightly, 4 free hand squares paper stack, 5 visor dips with tiny sigh, 6 returns to neutral writing pose. Counter edge stays identical in every pose. Body remains behind counter.

### Bored paperwork — Strip A, 6 poses @ 8-10fps

> [LOCKED STRUCTURE, N=6] [QUIRE CHARACTER BLOCK]
> Poses 1-6: fussy bureaucracy. 1 writing neutral, 2 stops pen, 3 looks at paper, 4 taps paper stack, 5 adjusts visor, 6 resumes writing. Hands stay attached and above the counter.

### Bored paperwork — Strip B, 6 poses @ 8-10fps

> [LOCKED STRUCTURE, N=6] [QUIRE CHARACTER BLOCK]
> Poses 7-12 continuing same character: 7 picks up one paper, 8 scans it tiredly, 9 lowers paper, 10 squares stack, 11 pen returns to page, 12 neutral writing pose matching idle pose 1.

### Talk — 6 poses @ 6-8fps

> [LOCKED STRUCTURE, N=6] [QUIRE CHARACTER BLOCK]
> Evasive talking while filing. 1 writing neutral, 2 eyes flick toward listener, 3 mouth opens and pen pauses, 4 free hand lifts a paper as if hiding behind procedure, 5 paper lowers, 6 resumes writing. Small anxious motion, no big gestures.

### Stamp — 8 poses @ 14-16fps, one smear

> [LOCKED STRUCTURE, N=8] [QUIRE CHARACTER BLOCK]
> Dramatic bureaucratic stamp action. 1 neutral with stamp on counter, 2 hand grips stamp, 3 stamp lifts, 4 anticipation hold with shoulders tense, 5 fast downward motion-smear frame on stamp arm only, 6 stamp impact on paper, 7 rebound, 8 settle back behind counter. Counter edge identical, body behind counter, hand attached.

### Give / receive item — 6 poses @ 12fps

> [LOCKED STRUCTURE, N=6] [QUIRE CHARACTER BLOCK]
> Counter exchange action. 1 neutral writing, 2 notices item, 3 reaches one hand forward across counter, 4 takes or offers invisible paper, 5 pulls hand back to paperwork, 6 returns to neutral writing. Hand must remain attached and over counter surface.

## Pigeon prompts

### Idle — 5 poses @ 6-8fps

> [LOCKED STRUCTURE, N=5] [PIGEON CHARACTER BLOCK]
> Perched idle loop. 1 neutral perch, 2 chest puff rises slightly, 3 head bob up, 4 head settles down, 5 return to neutral matching pose 1. Feet locked to perch.

### Bored idle — Strip A, 6 poses @ 8-10fps

> [LOCKED STRUCTURE, N=6] [PIGEON CHARACTER BLOCK]
> Poses 1-6: officious impatience. 1 neutral, 2 slow blink, 3 side-eye left, 4 side-eye right, 5 tiny claw adjustment on perch, 6 neutral smug stare.

### Bored idle — Strip B, 6 poses @ 8-10fps

> [LOCKED STRUCTURE, N=6] [PIGEON CHARACTER BLOCK]
> Poses 7-12 continuing same pigeon: 7 feathers puff, 8 tiny ruffle, 9 beak opens slightly, 10 beak closes, 11 chest settles, 12 neutral perch matching idle pose 1.

### Talk / bark — 6 poses @ 8-10fps

> [LOCKED STRUCTURE, N=6] [PIGEON CHARACTER BLOCK]
> Short official bark. 1 neutral smug perch, 2 head snaps forward, 3 beak opens, 4 beak closes and eyes narrow, 5 chest puff settles, 6 neutral. Feet locked to perch.

### Delivery reaction — 6 poses @ 12fps

> [LOCKED STRUCTURE, N=6] [PIGEON CHARACTER BLOCK]
> Tiny delivery reaction. 1 neutral perch, 2 looks toward tube, 3 wing twitches outward slightly, 4 beak opens as if announcing delivery, 5 wing returns, 6 neutral smug perch. No flying, no drifting.

## Dill prompts

### Idle — 5 poses @ 6-8fps

> [LOCKED STRUCTURE, N=5] [DILL CHARACTER BLOCK]
> Nervous weather-office idle. 1 neutral anxious stand, 2 shoulders rise, 3 glances up at ceiling drip, 4 wipes sleeve or cheek, 5 returns to neutral. Feet planted.

### Talk — 6 poses @ 8fps

> [LOCKED STRUCTURE, N=6] [DILL CHARACTER BLOCK]
> Apologetic explanation gesture. 1 neutral, 2 hand lifts with clipboard or palm, 3 nervous point toward machine offscreen, 4 realizes that was not helpful and retracts, 5 small apologetic half-smile, 6 neutral anxious stand.

### Panic panel reaction — 8 poses @ 12fps, one smear

> [LOCKED STRUCTURE, N=8] [DILL CHARACTER BLOCK]
> Weather panel panic reaction. 1 neutral, 2 hears drip, 3 looks up, 4 reaches toward imaginary control panel, 5 quick motion-smear hand recoil, 6 shoulders tense, 7 checks clipboard, 8 returns to anxious neutral.

## Slicing and QA

- Slice each strip by `strip_width / N`.
- Trim #808080 by color key or alpha-bounds crop per cell.
- Store frames as ordered arrays per cycle.
- FPS lives in animation data, not the image.
- Reject strips with identity drift, detached hands, scale drift, inconsistent ground/contact line, merged poses, shadows on background, or non-even spacing.
- If a strip fails because poses are cramped, regenerate with fewer poses.
