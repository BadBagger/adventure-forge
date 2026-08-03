# Forge Runtime Conformance

AdventureForge treats `src/runtime/forge-runtime-core.js` as the truth compiler. The editor preview, exported standalone playable, and CLI playable builder must consume the same core rules for scene lookup, depth sorting, animation timing, hit testing, walk clamping, dialogue anchoring, inventory, flags, counters, and ending state.

If a behavior can affect whether an actor appears behind a counter, whether a click hits the topmost hotspot, which frame is visible, or where a speech bubble appears, that behavior belongs in the shared core first.

## Runtime Contract

- `baseline(item, scene)` computes each renderable footing/depth key.
- `sortedDepthRenderables(scene, options)` returns the stable back-to-front draw order used by editor QA and playable rendering.
- `currentFrame(model, stateName, elapsedMs)` resolves animation states through one shared clock, including optional per-frame `holds`.
- `dialogueAnchorFor(scene, object)` resolves speech-bubble anchors by matching authored dialogue-anchor objects.
- `objectAt(scene, x, y, options)` ignores walkable zones and chooses the topmost interactive object by the same depth order used for drawing.
- `nearestWalkPoint(scene, x, y)` clamps click-to-walk destinations into authored walkable regions.
- `createGameState`, `applyEffects`, and `pickInteractionRule` own runtime flags, counters, inventory, use-item rules, and ending effects.
- `collectGameCompletionIssues(project)` is the placeholder-complete story gate for playable builds.

Adapters may draw, hydrate assets, collect input, and play audio. They must not fork these rules.

## Required Tests

`npm.cmd test` runs the conformance suite:

- baseline sorting flips when an actor crosses a counter baseline.
- occlusion QA warns when an actor is sorted behind a foreground/occlusion layer that does not cover the actor body.
- dialogue anchor lookup matches the anchors used by playable bubbles.
- custom animation states resolve by FPS, loop setting, elapsed time, and held-frame beats.
- walk clicks outside a walkable region clamp to the nearest authored walk point.
- object hit testing ignores walkable regions and respects topmost depth order.
- inventory, flag, animation, and ending effects mutate state predictably.
- standalone HTML embeds `ForgeRuntimeCore` and `ForgeCanvasRuntime`.
- browser runtime conformance plays the Lost & Underfound fixture through `The End`.

A failure in depth sorting, registration/placement, occlusion coverage, or timing is a build blocker. Those are not visual polish warnings; they mean the editor and playable can disagree about the game truth.
