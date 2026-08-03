# AdventureForge MVP

AdventureForge is a Codex-first adventure-game authoring studio. Codex can propose structured JSON changes, while a human can manually fix hitboxes, dialogue anchors, character state notes, scene layers, and walkable areas.

Open `index.html` in a browser to run it, or serve this folder with a static server:

```powershell
cd C:\Users\KyleB\Documents\Codex\2026-08-03\cv\outputs\adventure-forge-repo
npm.cmd run preview:runtime
```

Then open `http://127.0.0.1:4177/index.html`.

## What works now

- Visual scene canvas with selectable/editable objects.
- Hitbox, dialogue anchor, character, and walkable-region tools.
- Scene exits for turning hitboxes into preview/playable navigation between authored scenes.
- Scene management controls for adding, duplicating, locking, deleting, resizing, and recoloring scenes.
- Manual repair controls: resize handles on selected objects and keyboard nudging for 1px or 10px adjustments.
- Scene object outliner for selecting, locking, and scanning authored hitboxes, dialogue anchors, characters, and walkable regions.
- Optional editor grid and snap-to-grid controls for cleaner hitbox, anchor, character, and walkable layout.
- Stage zoom controls for fitting the scene to the panel or inspecting it at 100% and 200% while keeping canvas selection math accurate.
- Editor overlay controls for labels, hitbox/object shapes, and all draw baselines during QA sweeps.
- Undo/redo for structural editor changes, script sync, Codex patches, canvas drawing, resizing, moving, and nudging.
- Browser-local autosave with manual save, restore, and clear controls.
- Scene layer list with visibility controls.
- Dynamic baseline depth sorting for characters, interaction objects, prop layers, and foreground/occlusion layers.
- Depth QA panel for reviewing draw order and close-baseline conflicts, with click-through repair targets.
- Project name and slug fields for stable export naming.
- Scene background plate import and foreground/occlusion image-layer import.
- Scene image layers are included in export JSON and restored on import.
- Scene layers can be locked before removal or Codex-side updates.
- Character model library with transparent PNG animation-frame import.
- Character model management for adding placeholder models, renaming/role tagging them, deleting unused models, and removing bad imported frames.
- Imported character frames render directly on the scene canvas and playable preview.
- Character placement from the model library.
- Frame registration QA for imported model sheets: shared canvas-size checks, alpha-bounds scans, anchor/baseline fields, status, and model lock state.
- Onion-skin frame preview for checking transparent PNG animation drift.
- Animation state timeline assignment for idle, walk, talk, waiting, and failed states.
- Timeline-bound frame hitboxes for animation states, stored relative to the transparent PNG canvas and drawn over the frame preview.
- Timed animation state playback for imported transparent PNG frame sequences.
- Per-character runtime animation state selection for editor preview and standalone playable export.
- Character animation-bible fields for idle, walk, talk, waiting, and failed states.
- Script import/sync tab for plain-text scene commands, dialogue lines, and branching choices, with preview-before-apply diff review.
- Script sync review controls with create/update/blocked counts, filters, selectable actions, and apply-selected behavior.
- Dialogue graph tab with a visible branch map, node cards, speaker/line editing, and branching choice editing.
- Positioned dialogue bubbles in preview and playable export, using matching dialogue anchors when present and falling back above the clicked object.
- Clickable QA issue navigator for jumping from validation findings to the object, dialogue node, or character model that needs repair.
- QA and Codex handoff tabs summarizing project state, model frames, sync metadata, depth order, and structured QA targets.
- Scene objects can be locked from the inspector; script sync and Codex patches skip locked objects instead of overwriting manual fixes.
- Codex patch intake for `addHitbox`, `addCharacter`, `updateObject`, and `addDialogueNode`.
- Codex patch review accepts a single patch or an array of patches, shows blocked rows, and applies only selected valid actions.
- Project JSON import/export.
- Standalone playable HTML export with embedded project data and imported assets.
- Export target settings and package manifest export for standalone HTML or Phaser scaffold handoff.
- Playable preview for clicking authored interactions.
- MVP validation checks.

## Script sync format

```text
@scene Forest Clearing
@character Script Clerk 300 220
Script Clerk: Imported from the script sync tab.
- Ask a question => The clerk answers from the synced dialogue graph.
- Leave => The conversation closes.
@hitbox Script Door 700 250 90 150
@exit North Gate Door 820 250 90 150 -> North Gate
@walkable Script Path 100 420 760 70
```

Choice lines use `- Label => Response` and attach to the preceding `Speaker: dialogue line`. Exit lines use `@exit Name x y w h -> Target Scene`. When a dialogue block includes choices, the imported choices replace that node's previous choices so the graph matches the script. The sync tab previews creates, updates, skips, and locked-object conflicts before applying them to matching scene objects and dialogue nodes.

Preview Sync turns the script into a review checklist. Use the create/update/blocked filters to audit the plan, clear any action you do not want applied, then use `Sync to Scene` to apply only the selected applicable actions. Context rows and blocked rows stay visible but cannot be selected.

## Dialogue graph

- Use `Dialogue` to add, select, edit, or delete dialogue nodes for the active scene.
- Each node has a speaker, line, and any number of player choices.
- Choices have a label and response, and appear in the playable preview for matching scene characters.
- The branch map draws each node, labels choice paths, links choices to matching speakers when a response names or points to another node, and leaves unresolved responses as visible endpoints.
- Dialogue anchor objects control where matching speech bubbles render; name the anchor with a shared word from the character or hotspot, such as `Well text anchor` for `Old well interaction`.
- Script sync, script export, and Codex dialogue patches update the same scene dialogue data.

## Character frame QA

After importing transparent PNG frames, open `Characters`:

- `Add Model` creates an empty model shell for manual setup before art arrives.
- `Model Name` and `Role` rename/tag the selected model for Codex handoff and human scanning.
- `Delete Model` removes only unused models; models used by placed characters are protected.
- The frame list under the preview lets you remove a bad imported PNG and repairs animation frame references.
- Each imported frame records visible alpha bounds, and QA flags empty transparent frames plus visible-pixel bottom/center drift across an animation set.
- `Onion Skin` overlays imported frames to reveal drift.
- `Anchor X`, `Anchor Y`, and `Baseline` define the model registration contract.
- `Model status` tracks provisional, reviewed, final, or rejected.
- `Lock Model` prevents accidental anchor/baseline edits after manual review.
- The QA tab includes model frame issues and Codex handoff metadata.

## Animation states

The `Characters` tab includes a `State Timeline` panel:

- Pick an animation state: idle, walk, talk, waiting, or failed.
- Assign frame indices such as `0,1,2`.
- Set FPS and loop behavior.
- Use `Assign All` to bind every imported frame to the selected state.
- Use `Play State` to preview timing in the frame preview canvas.
- Use `Frame Hitboxes` to add body, interaction, mouth, or prop boxes for a specific state/frame; these appear in QA and Codex handoff.
- Select a placed character in the Editor and set `Runtime State` to choose which authored animation timeline the preview/playable runtime should draw.

## Playable export

Use `Playable` in the Project panel to export a single `.playable.html` file. It embeds the current project data, imported image layers, transparent PNG character frames, selected runtime animation-state playback, clickable hotspots/characters, dialogue lines, choices, and positioned dialogue bubbles.

Use `Target` and `Debug` in the Project panel to describe the intended runtime export. `Package` writes a `.package.json` manifest with scene geometry, depth order, dialogue branches, character frame metadata, QA issues, and adapter notes for either standalone HTML or a Phaser scaffold.

The checked-in fixture can also be rebuilt from the command line:

```powershell
cd C:\Users\KyleB\Documents\Codex\2026-08-03\cv\outputs\adventure-forge-repo
npm.cmd run build:playable
```

## Scene image layers and locks

- Use `Background` to import a scene plate image into the active scene.
- Use `Foreground` to import an image layer for foreground art, occlusion masks, or walk-behind visual layers.
- Foreground/prop layers and selectable scene objects have editable baselines; the editor, handoff JSON, preview, and playable export draw them in baseline order.
- Each layer row has `Hide`, `Lock`, and `Remove`; locked layers cannot be removed until unlocked.
- Select an object and use `Lock Object` to protect hand-tuned hitboxes, anchors, dialogue locations, or placed characters.
- Codex patch `updateObject` / `updateLayer` and script sync skip locked targets and report why.

## Scene management

- Use `Add` for a blank scene with a background layer.
- Use `Duplicate` to copy the active scene's layers, objects, dialogue, dimensions, and background color into a new editable scene.
- Use `Width`, `Height`, and `Back` to resize or recolor the active scene; the editor canvas updates to the same authored dimensions.
- Use `Lock Scene` to prevent accidental scene setting edits or deletion.
- Deleting a scene clears exits that pointed to the removed scene and moves the editor to a remaining scene.
- Codex handoff includes `sceneSettings` with each scene's size, background, lock state, and content counts.

## QA issue navigator

- Use `Validate` or open the `QA` tab to see repair tasks.
- Issue rows marked `Fix` or `Review` are clickable and jump to the matching editor tab, scene object, dialogue node, or character model.
- Codex handoff includes structured `qaIssues` entries with severity, message, and target metadata.

## Manual layout fixes

- Select an object on the canvas to show resize handles.
- Use the `Scene Objects` outliner to select tiny or overlapping objects without hunting for them on the canvas.
- Use the `Scenes` panel to duplicate a working scene setup, resize the active scene, or lock scene settings before risky manual/Codex changes.
- Use `Grid` to show or hide the editor grid.
- Use `Snap` and the grid-size field to place, move, resize, and nudge objects on consistent increments.
- Use `Fit`, `100%`, and `200%` to switch between whole-scene layout and close repair work; the enlarged stage scrolls while pointer coordinates still map back to authored scene pixels.
- Use `Labels`, `Hitboxes`, and `Baselines` to switch between clean art inspection, clickable-region repair, and depth-sorting QA.
- Use the `QA` tab's Depth QA panel to inspect active-scene draw order and jump to renderables whose baselines are too close.
- Lock or unlock objects directly from the outliner.
- Drag a handle to resize hitboxes, dialogue anchors, characters, or walkable regions.
- Use arrow keys to nudge the selected object by 1px, or hold `Shift` to nudge by 10px.
- Character, hitbox, and dialogue baselines follow vertical moves and bottom-edge resizes automatically.
- Use `Undo` and `Redo` in the top bar to recover from accidental editor, script-sync, or Codex-patch changes.

## Local persistence

- AdventureForge autosaves the current project to this browser as you edit.
- Use `Save Local` for an explicit browser checkpoint before risky manual or Codex-assisted changes.
- Use `Restore` to reload the browser checkpoint.
- Use `Clear` to remove the browser checkpoint after exporting or when starting clean.

## Scene exits

- Select a hitbox and set `Exit Destination` to turn it into a scene transition.
- The playable preview and standalone playable HTML change scenes when an exit hitbox is clicked.
- `Export Script` writes exit hitboxes as `@exit Name x y w h -> Target Scene`.
- Codex handoff includes `sceneExits` so generated patches can reason about navigation.

## Example Codex patches

Paste one object or an array of patch objects into `Codex Patch`, then use `Preview` to review valid and blocked actions. Clear any checked action you do not want, then `Apply` commits only the selected valid actions as one undoable edit.

```json
{"addHitbox":{"name":"North gate exit","x":52,"y":246,"w":96,"h":170,"action":"Exit north","dialogue":"The gate is stuck, but fresh rope fibers cling to the latch."}}
```

```json
{"addCharacter":{"name":"Gate Keeper","x":120,"y":260,"w":70,"h":136,"dialogue":"The gate opens for people who remember why they came."}}
```

```json
{"updateObject":{"name":"Old well interaction","values":{"x":610,"y":268,"w":150,"h":160,"dialogue":"The well rope has been cut cleanly."}}}
```

## Next build targets

- Optional engine-specific runtime bundles beyond the current package manifest scaffold.
