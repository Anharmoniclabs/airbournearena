# Unity flight-model translation contract

This document specifies the observable behavior of
`Airbourne-Arena/src/game/21-flight-model.js`. The Unity port must translate
this model as a plain C# simulation class. A `Rigidbody`, if present, is
kinematic and exists only to support collision queries.

## Coordinates and stepping

The source uses right-handed three.js coordinates (Y up, forward −Z). Unity
gameplay data uses left-handed coordinates (Y up, forward +Z). Convert points
and vectors as `(x, y, z) -> (x, y, -z)`. Imported mesh geometry is converted by
the importer; code-authored gameplay coordinates must use this explicit rule.

Call the simulation from `FixedUpdate` with a fixed delta. The parity fixture
uses 1/60 second. Do not multiply or divide any individual force by the render
frame rate.

## Constants

| Name | Value | Meaning |
|---|---:|---|
| `G` | 32.0 | Gravity acceleration |
| `THRUST` | 16.0 | Military thrust acceleration |
| `DRAG_K` | 0.00032 | Parasitic drag |
| `CDI` | 0.35 | Induced-drag coefficient |
| `LIFT_K` | 0.00284 | Lift coefficient |
| `CL_A`, `CL0` | 5.2, 0.06 | Lift curve slope and intercept |
| `A_CRIT`, `A_TRIM` | 0.30, 0.045 | Stall and trim angle of attack, radians |
| `G_LIMIT` | 9.0 | Maximum lift load |
| `SIDE_K` | 0.0022 | Side-slip damping |
| `PITCH_RATE` | 1.85 | Pitch input rate |
| `ROLL_RATE` | 5.6 | Roll input rate |
| `YAW_RATE` | 0.60 | Yaw input rate |
| `STAB` | 1.9 | Weathervane stabilization |
| `AB_THRUST` | 1.85 | Full afterburner thrust multiplier |
| `AB_DRAIN` | 0.2 | Burner pool drain per second |
| `AB_RECHARGE` | 0.125 | Burner pool recharge per second |
| `AB_COOL` | 0.9 | Recharge delay, seconds |
| `AB_RELIGHT` | 0.18 | Minimum pool required to relight |
| `AIL_BIAS` | 1.35 | Damaged-aileron standing roll rate |

Atmosphere constants are `CEIL_RHO0=6500`, `CEIL_RHO_SPAN=18000`, and
`CEIL_RHO_MIN=0.42`. Density is
`clamp(1 - (altitude - CEIL_RHO0) / CEIL_RHO_SPAN, CEIL_RHO_MIN, 1)`.
`CEIL_HARD=18000` and `CEIL_MAX=24000` are runtime safety limits outside
`stepFlight`, not aerodynamic forces.

## Integration order

Order is part of the contract:

1. Derive forward, up, and right from the current orientation.
2. Apply engine damage to the commanded throttle.
3. Calculate airspeed control authority and the soft AoA limiter.
4. Rotate pitch, local roll, damaged-aileron bias, then local yaw.
5. Recalculate the aircraft axes after rotation.
6. Normalize velocity (or use forward below 0.5 speed); calculate alpha and
   beta from its dot products with up and right.
7. Calculate the lift curve and reduce lift beyond `A_CRIT`.
8. Build the lift direction as normalized `right × velocityDirection`.
9. Calculate density, G limit, induced/stall/compressibility drag, and burner
   spool (`+3.2/s` lit, `−2.4/s` unlit).
10. Accumulate thrust, lift, drag, side force, and gravity into acceleration.
11. Semi-implicit Euler: update velocity, then update position from the new
    velocity. Add 30% of the world wind displacement afterward.
12. Apply weathervane stabilization toward velocity rotated by `A_TRIM` around
    aircraft right.
13. Publish speed, alpha, stall state, and load.

Carrying the core multiplies pitch and roll authority by 0.82, thrust by 0.85,
induced drag by 1.25, and lowers the active limit to 6.5 G. Above speed 280,
add `(speed-280)/140` to drag. These modifiers must remain in their current
positions in the calculation.

## Parity gate

Generate and verify the JavaScript reference from
`Airbourne-Arena/source`:

```sh
npm run unity:flight-golden
npm run unity:flight-check
```

The fixture at `docs/data/flight-golden.json` records position, velocity,
angle of attack, speed, and load once per second for a deterministic ten-second
input sequence. Implement that same input sequence in a Unity Edit Mode test,
convert Unity Z back to the source convention for comparison, and compare every
scalar with an absolute tolerance of `1e-4`. The Phase 1 gate passes only when
all ten samples match.
