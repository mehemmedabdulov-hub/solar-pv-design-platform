# SOLAR v2.3 Alpha Browser Smoke Checklist

This checklist is intentionally separate from the automated shell runner. A row may be marked PASS only in an environment where the application can actually be loaded and interacted with.

## A1 — Location lifecycle / geometry lock

- [ ] Confirm a valid initial project location and observe `Confirmed` state.
- [ ] Draw one design surface and observe `Locked-by-geometry` state.
- [ ] Click elsewhere on the map without Set Location mode; marker and latitude/longitude must not move.
- [ ] Enter different coordinates; verify Relocate Project dialog appears.
- [ ] Cancel relocation; verify coordinates, geometry, resource origin, shading origin and state fingerprint remain unchanged.
- [ ] Repeat and confirm destructive relocation; verify location-bound site/shading state is cleared/invalidated and new location is confirmed.

## A2 — Installation migration

- [ ] With no geometry, switch Rooftop/Ground/Carport and verify the change applies immediately.
- [ ] With geometry, request a different installation type; verify the radio selection remains on the committed type while the migration decision is pending.
- [ ] Inspect migration summary for old/new type, surface/sub-array counts, invalidation effects and custom-name protection.
- [ ] Cancel; verify polygons, metadata, layout, fingerprints and formal revisions are unchanged.
- [ ] Confirm migration; verify polygon coordinates are preserved, only documented/default metadata is rewritten, custom names/IDs are preserved, and downstream state is stale/missing until regenerated.

## A3 — Deliverable decoupling

- [ ] Generate a current SLD/BOM/report source.
- [ ] Edit/move one panel and verify map interaction remains responsive.
- [ ] Verify electrical/energy results refresh but SLD/BOM/report are not rebuilt automatically.
- [ ] Verify the last successful SLD stays visible and is clearly marked STALE with its source fingerprint.
- [ ] Use Refresh SLD / Refresh Electrical + SLD; verify the current fingerprint is restored.
- [ ] Attempt export while stale; verify export refuses or explicitly regenerates rather than silently exporting stale output as current.

## A4 — Release/UI accessibility

- [ ] Run the Alpha scenarios at desktop width.
- [ ] Repeat essential location/migration flows at a tablet width.
- [ ] Verify stage readiness/sticky actions remain usable.
- [ ] Verify decision dialogs can be reached and cancelled/confirmed with keyboard controls, including Escape on cancel-capable dialogs.
- [ ] Verify visible version text identifies **v2.3 Alpha orchestration**, inherited **v2.2 UX/Drawings**, engine **v2.1**, project schema **2.0**, and rule-pack schema **2.0.0** without ambiguity.

## Current execution status in this build environment

**BLOCKED — NOT EXECUTED.** Chromium is installed, but administrator policy blocks navigation to the local server and to `file://` sources. Static/unit/server verification is not substituted for this checklist.
