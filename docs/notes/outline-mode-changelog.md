# Outline Mode Changelog

## Added
- Optional `Outline mode` pipeline: `Scene Skeleton -> Act it out -> Final prose`.
- New `SceneSkeleton` JSON contract with strict validation.
- New tracker snapshots for scene structure health:
  - protagonist intent
  - protagonist commitment
  - decision/consequence flags
- Passive-scene validator with one automatic repair pass.
- Script Room Scene Skeleton panel:
  - generate/regenerate skeleton
  - edit fields
  - lock skeleton
- Warning banner when scene may still be passive.

## Updated
- Script prompt now binds beat generation to skeleton and tracker guidance when Outline mode is on.
- Summary refresh now stores tracker snapshots and injects guidance note for next beats when needed.
- Persistence schema supports skeleton/tracker/warning fields with backward-compatible loading.
- Settings include:
  - default outline mode
  - repair beats count

## Compatibility
- Existing projects without new fields still load.
- When Outline mode is off, generation behavior stays backward-compatible.
