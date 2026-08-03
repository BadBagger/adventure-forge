# Lost & Underfound Production Import

AdventureForge is the production surface for this build. Lost & Underfound remains the source/content/art repository; this repo owns the playable forge project, exported standalone runtime, scene layout, interaction rules, and production QA surfaces.

Current imported source:

- `script/ACT_01_SCRIPT.json` - 49 Act 1 dialogue/script lines.
- `docs/ACT_01_DESIGN.md` - Act 1 hotspots, inventory item, flags, Bramble topics, and toll-gate puzzle rules.
- `art/concept-sheets/act01-idle-72/` - 72-frame idle concept sheets for Act 1 characters.
- `art/concept-sheets/act01-interactions/` - pickup/handoff interaction concept sheets.

AdventureForge project outputs:

- `adventureforge-playable-fixture.json` - authored project data, imported assets, scene layer markers, hitboxes, dialogue, inventory/flag rules, and Act 1 game metadata.
- `adventureforge-pilot.playable.html` - standalone playable export built from the fixture.
- `assets/lost-underfound/` - sliced transparent runtime frame assets and scene plate.

Scope boundary:

Act 1 is playable. Acts 2 and 3 are intentionally blocked with an in-project placeholder scene until their script/design passes exist in the Lost & Underfound source repo.
