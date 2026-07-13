# RackFrame2D modular structure

`index.html` is the local development entry point. It loads the engines below as separate files so a change to one part does not require editing the complete application.

## Engines

- `engines/sections/ub-section-data.js` - Universal Beam data
- `engines/sections/uc-section-data.js` - Universal Column data
- `engines/sections/pfc-section-data.js` - Parallel Flange Channel data
- `engines/sections/rhs-section-data.js` - hot-finished Rectangular Hollow Section data
- `engines/sections/shs-section-data.js` - hot-finished Square Hollow Section data
- `engines/sections/shs-cold-formed-section-data.js` - cold-formed SHS data
- `engines/analysis-engine.js` - first-order 2D frame solver, fixed-free column boundary enforcement, diagrams, UI and section picker logic
- `engines/standards/bs5950-engine.js` - BS 5950 column calculations
- `engines/standards/eurocode-load-cases.js` - EN 1990 ULS/SLS combination cases
- `engines/standards/eurocode-mcr-engine.js` - 1D Vlasov FE eigenvalue Mcr solver with editable end restraints, MasterSeries-style NCCI C1 decomposition, SN003 and P360/SN009 calculations
- `engines/standards/eurocode-engine.js` - EN 1993-1-1 calculations
- `engines/standards/design-layer-ui.js` - column-design panel and standard dispatcher
- `cantilever-designer.html` - complete cantilever beam member-design screen opened from the rack's **Beam design** tab and per-beam **Design** buttons

## Build one file for Google Sites

Run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\build-single-html.ps1
```

The pasteable standalone file is generated at `dist/advance-bs-rack.html`. The build embeds `cantilever-designer.html` into that file so the complete beam-design report works inside a Google Sites custom embed without a separate hosted file.

`monolith-source-backup.html` is the original single-file version retained for comparison and recovery.

## Verification

Run the Eurocode regression checks with the bundled or system Node.js runtime:

```powershell
node .\tests\analysis-boundary.test.js
node .\tests\eurocode-regression.test.js
```

## Load combinations

The main Loads panel contains two explicit combinations:

- **ULS** factors drive member forces, reactions, force diagrams, Frame3DD export, and column design.
- **SLS** factors drive sway, node displacement, deflection KPIs, the deformed shape, and serviceability checks.

Member self-weight is always generated automatically as the permanent action `G`. A `G` factor of `1.0` applies the full characteristic member self-weight; `0.0` removes it for that combination. Entered point loads are the variable action `Q`.

The column-design panel offers two Eurocode Mcr routes for doubly symmetric open sections:

- `FE eigenvalue - editable restraints` uses the signed analysis moment diagram in a separate lateral-torsional eigenproblem. At both the column root and tip, lateral displacement `v`, lateral bending slope `v'`, twist `phi`, and warping `phi'` can be restrained or released independently. The default remains a fixed root/free tip with root warping free.
- `NCCI - MasterSeries style` calculates `M1`, `M2`, `M0`, `psi`, `mu` and `C1` from the signed moment diagram, then applies the SN003 coefficient expression with the entered `k`. This is retained as a transparent software-comparison route and does not alter the frame supports. Because SN003 requires both ends to have lateral and torsional restraint, selecting it for the free-tip column reports `UNVERIFIED`.

The manual compression effective-length factors `K_y` and `K_z`, and the manual/NCCI LTB factor, are deliberately separate from the FE end-restraint table. Changing a manual effective length (for example to `2.6L`) does not silently add or remove FE restraints.

The base tie option `No releases - welded at column` creates an unreleased member connection to the column in the 2D frame. The tie's far-end behaviour still comes from the separate **Tie far end** support selector. The welded column connection supplies the in-plane frame connection represented by that model, but it does not automatically claim minor-direction lateral, twist, or warping restraint for the separate LTB model; those four boundary conditions must be declared in the FE table to match the actual connection detail.

For Annex B interaction factors, the fixed-free column is treated as a sway member. The Table B.3 sway note therefore sets `Cmy = 0.9` for major-axis frame bending or `Cmz = 0.9` for minor-axis frame bending. `CmLT` remains based on the signed moment diagram between its relevant y-y restraint points.
