# SOLAR v2.2 UI Smoke Checklist

Use this checklist in a normal desktop browser or Codespace preview. The automated suite cannot replace a human map/editor check.

## Desktop — 1440px+

- [ ] New project opens in Simple Mode at Stage 1.
- [ ] Five-stage stepper and sticky readiness bar remain visible.
- [ ] Stage 1 contains project, location and installation choices; location inputs are not duplicated.
- [ ] Draw a design surface in Stage 2; buildable overlay/readiness updates without navigating to another card.
- [ ] Stage 3 shows searchable equipment pickers and the map-centered Array Editor.
- [ ] Generate a layout, select six modules, group-move, undo, rotate, delete one and undo.
- [ ] Invalid move/rotation shows red preview/reason and does not use a blocking alert.
- [ ] Add Row, Align, Distribute and Lock/Unlock use the current module-gap and geometry constraints.
- [ ] Accepted panel edits mark Electrical/SLD stale.
- [ ] Refresh Electrical/SLD in Stage 4 and confirm `Drawing current` only after matching fingerprint.
- [ ] Switch Compact/Detailed and IEC-style/ANSI-style SLD views.
- [ ] Open Edit Drawing; move a symbol, add/copy/paste a note, select/reroute a circuit, undo/redo and reset auto layout.
- [ ] Confirm calculated electrical data is read-only and design-bound deletion is refused.
- [ ] Validate SLD preflight and inspect title block/source fingerprint/preliminary disclaimer.
- [ ] Export SVG, PDF, PNG and DXF.
- [ ] Stage 5 Engineering Pack ZIP contains coordinated G-001/PV-101/PV-201/E-301/E-401/E-501 artifacts and one source fingerprint.
- [ ] Save a formal revision, reload it and verify immutable revision behavior remains unchanged.
- [ ] Load a schema-compatible legacy project and confirm the new UI does not block it.

## Tablet — around 900px

- [ ] Canvas remains dominant; SLD/panel inspectors collapse or reposition without overlap.
- [ ] Five-stage navigation and sticky primary action remain usable.
- [ ] Toolbars wrap/scroll without clipping.

## Mobile — around 430px

- [ ] Stage navigation is compact and readable.
- [ ] Sticky primary action remains thumb reachable.
- [ ] Editor side panels stack rather than squeezing into three columns.
- [ ] Inputs, buttons and focus indicators remain reachable with keyboard/accessibility controls.

## Keyboard/accessibility

- [ ] Visible focus is present for stage steps, tools and property fields.
- [ ] Ctrl/Cmd-click/Shift-click selection has keyboard-reachable alternatives where practical.
- [ ] Panel Undo/Redo/Delete/Escape shortcuts do not trigger while typing in INPUT/SELECT/TEXTAREA.
- [ ] SLD Undo/Redo, annotation copy/paste, zoom and Delete shortcuts do not trigger while typing.
