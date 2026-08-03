# Department of Impossible Complaints — Adventure Forge Import

This folder contains a first Adventure Forge port of the current Department slice.

## Files

- `department-impossible-complaints.adventureforge.json` — import this through Adventure Forge's `Import` button.
- `department-impossible-complaints.playable.html` — standalone playable export generated from that JSON.
- `frames/` — split PNG frames extracted from the current runtime sprite sheets for inspection and future reimport.

## Layer contract

The lobby is intentionally not a single flattened poster.

- `Lobby background plate` is the static room art.
- `Counter front occlusion cutout` is a foreground occlusion layer rendered above Quire.
- `Lobby Walk Plane` is the player movement band.
- Mara uses a fixed-size actor model and depth baseline.
- Quire uses a fixed counter actor slot; his lower body must stay behind the counter occlusion.
- Hotspots and dialogue anchors remain separate editable scene objects.

If a character needs to pass behind an object, that object must be a foreground or occlusion layer above the character. Do not regenerate the whole room to animate one actor.

## Known limitations

- This is an authoring-port fixture, not a full replacement runtime.
- Pigeon is currently a static embedded model frame because the current source is SVG, not a split transparent PNG sequence.
- Quire has a custom `stamp` animation state in the JSON; Adventure Forge's current UI exposes the standard states, so this is retained as handoff metadata until custom states are supported.
