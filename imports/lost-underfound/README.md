# Lost & Underfound Production Import

AdventureForge is the production surface for this build. Lost & Underfound remains the source/content/art repository; this repo owns the playable forge project, exported standalone runtime, scene layout, interaction rules, and production QA surfaces.

Current imported source:

- `script/ACT_01_SCRIPT.json` - 49 Act 1 dialogue/script lines.
- `docs/ACT_01_DESIGN.md` - Act 1 hotspots, inventory item, flags, Bramble topics, and toll-gate puzzle rules.
- `art/concept-sheets/act01-idle-72/` - 72-frame idle concept sheets for Act 1 characters.
- `art/concept-sheets/act01-interactions/` - pickup/handoff interaction concept sheets.
- Acts 2 and 3 are authored directly in the Forge fixture as placeholder-art continuation content.

AdventureForge project outputs:

- `adventureforge-playable-fixture.json` - authored project data, imported assets, scene layer markers, hitboxes, dialogue, inventory/flag rules, and complete placeholder-story game metadata.
- `adventureforge-pilot.playable.html` - standalone playable export built from the fixture.
- `assets/lost-underfound/` - sliced transparent runtime frame assets and scene plate.
- `cast-animation-library.json` - canonical character/prop clip manifest with runtime scale, prompt blocks, clip metadata, source strips, frame directories, and QA status.
- `generated-strips/` - horizontal grey-background source strips. These are sliced by Forge; actor strips must not include desks, gates, cobwebs, or other occluder layers.
- `qa/animation-library/` - generated contact sheets and onion-skin checks for sliced library clips.

Scope boundary:

The current AdventureForge build is complete as a placeholder-art playable story. The Lost & Underfound source repo should still become the canonical home for any later final script, production art, audio, and localization passes.

Animation-library boundary:

The library treats scale as runtime data, not baked pixels. Grommet is metadata-only/deferred until Acts 2-3 have real script/design. The Roar has no sprite frames; it remains an environmental threat handled through audio, tremor, lighting, and later Act 3 scripting.
