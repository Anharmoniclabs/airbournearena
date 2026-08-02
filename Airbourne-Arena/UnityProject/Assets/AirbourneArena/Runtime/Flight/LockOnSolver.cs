using System;

namespace AirbourneArena.Flight
{
    /// One target the solver can designate. Deliberately not a MonoBehaviour:
    /// the whole point of keeping this pure is that the browser's stepLock can
    /// be run over the same inputs and the two compared numerically.
    public struct LockCandidate
    {
        public int id;
        public FlightVector position;
        public bool alive;

        public LockCandidate(int id, FlightVector position, bool alive)
        {
            this.id = id;
            this.position = position;
            this.alive = alive;
        }
    }

    /// The designation state machine, matched to 27-gunnery.js.
    ///
    /// `target` is what the HUD boxes. `assisted` is the part that matters for
    /// gunnery: until the dwell completes, rounds are completely ballistic and
    /// the box is only tracking information. The port had no dwell at all, so
    /// assistance armed the instant anything entered the cone — every pass over
    /// a crowded skyline stole the shot.
    public sealed class LockOnState
    {
        public const int None = -1;

        public int target = None;
        public bool manual;
        public bool assisted;
        public int hover = None;
        public double hoverTime;
        public double grace;

        public void Clear()
        {
            target = None;
            manual = false;
            assisted = false;
            hover = None;
            hoverTime = 0;
            grace = 0;
        }
    }

    public static class LockOnSolver
    {
        public const double TargetRange = 1800;
        public const double TargetCone = .9397;
        public const double TargetStick = .20;
        public const double RangeWeight = .18;
        public const double StickAim = .25;

        public const double SoftLockCone = .9848;
        public const double SoftReleaseCone = .9511;
        public const double SoftLockDwell = .24;
        public const double SoftLockGrace = .48;
        /// The held target is allowed to drift 12% past acquisition range
        /// before the grace timer starts, so a lock does not drop the instant a
        /// bandit crosses the boundary while still under the crosshair.
        public const double ReleaseRangeSlack = 1.12;

        /// Direction and distance from the shooter to a candidate.
        static FlightVector Bearing(FlightVector origin, FlightVector target, out double distance)
        {
            var to = target - origin;
            distance = to.Length;
            return distance > 1e-3 ? to / distance : to;
        }

        /// Canonical: pickTarget().
        ///
        /// Scored off the reticle, not the nose. The nose only chases the
        /// reticle, so in any hard pull the two sit tens of degrees apart, and
        /// scoring off the nose designates whoever is centred in the airframe
        /// rather than whoever the player is pointing at.
        ///
        /// The aim term is squared so the bandit actually under the crosshair
        /// wins outright; left linear, something closer but well off to one side
        /// beats a dead-on target on the distance term alone.
        public static int PickTarget(LockOnState state, FlightVector origin,
            FlightVector aimDirection, LockCandidate[] candidates) =>
            PickTarget(state, origin, aimDirection, candidates, candidates.Length);

        /// `count` is the live prefix of `candidates`. Callers rebuild that
        /// buffer in place every frame, so passing a length rather than a
        /// trimmed array is what keeps designation allocation-free.
        public static int PickTarget(LockOnState state, FlightVector origin,
            FlightVector aimDirection, LockCandidate[] candidates, int count)
        {
            var best = LockOnState.None;
            var bestScore = 0d;
            for (var i = 0; i < count; i++)
            {
                if (!candidates[i].alive) continue;
                var direction = Bearing(origin, candidates[i].position, out var distance);
                if (distance > TargetRange) continue;
                var dot = FlightVector.Dot(direction, aimDirection);
                if (dot < TargetCone) continue;

                var aimScore = (dot - TargetCone) / (1 - TargetCone);
                var score = aimScore * aimScore + (1 - distance / TargetRange) * RangeWeight;
                // Hold the current designation only while the crosshair is
                // still broadly on it, so a deliberate move onto someone else
                // is not fought by the stickiness that exists to stop flicker.
                if (candidates[i].id == state.target && aimScore > StickAim) score += TargetStick;
                if (score <= bestScore) continue;
                bestScore = score;
                best = candidates[i].id;
            }
            return best;
        }

        /// Canonical: stepLock(dt). `freshLock` reports the frame MAG LOCK arms
        /// on a new contact, which is what drives the callout and the tone.
        public static void Step(LockOnState state, double dt, bool playerAlive,
            FlightVector origin, FlightVector aimDirection, LockCandidate[] candidates,
            out bool freshLock) =>
            Step(state, dt, playerAlive, origin, aimDirection,
                candidates, candidates.Length, out freshLock);

        public static void Step(LockOnState state, double dt, bool playerAlive,
            FlightVector origin, FlightVector aimDirection, LockCandidate[] candidates,
            int count, out bool freshLock)
        {
            freshLock = false;
            if (!playerAlive)
            {
                state.Clear();
                return;
            }
            if (state.target != LockOnState.None && !IsAlive(state.target, candidates, count))
            {
                state.target = LockOnState.None;
                state.manual = false;
                state.assisted = false;
                state.hover = LockOnState.None;
                state.hoverTime = 0;
            }

            // A deliberate designation is a decision, not a proximity test: it
            // holds right across the arena until the bandit dies or the player
            // drops it. That is what makes an off-screen cue worth having.
            if (state.manual && state.target != LockOnState.None) return;

            var candidate = PickTarget(state, origin, aimDirection, candidates, count);
            var candidateDot = -1d;
            if (candidate != LockOnState.None && TryFind(candidate, candidates, count, out var picked))
                candidateDot = FlightVector.Dot(
                    Bearing(origin, picked.position, out _), aimDirection);

            // Dwell directly over a target to arm assistance.
            if (candidate != LockOnState.None && candidateDot >= SoftLockCone)
            {
                if (candidate == state.hover) state.hoverTime += dt;
                else { state.hover = candidate; state.hoverTime = 0; }
                if (!state.assisted) state.target = candidate;
                if (state.hoverTime >= SoftLockDwell)
                {
                    freshLock = !state.assisted || state.target != candidate;
                    state.target = candidate;
                    state.assisted = true;
                    state.grace = SoftLockGrace;
                }
                return;
            }

            state.hover = LockOnState.None;
            state.hoverTime = 0;
            if (state.assisted && state.target != LockOnState.None
                && TryFind(state.target, candidates, count, out var held) && held.alive)
            {
                var heldDot = FlightVector.Dot(
                    Bearing(origin, held.position, out var heldRange), aimDirection);
                if (heldRange < TargetRange * ReleaseRangeSlack && heldDot >= SoftReleaseCone)
                {
                    state.grace = SoftLockGrace;
                    return;
                }
                state.grace -= dt;
                if (state.grace > 0) return;
            }
            state.assisted = false;
            state.grace = 0;
            state.target = candidate;
        }

        /// Canonical: cycleTarget(). Walks everything in front of the aircraft
        /// in bearing order off the nose, so pressing it repeatedly steps
        /// through the fight instead of re-picking the same bandit. Manual lock
        /// arms assistance immediately — the dwell is what a soft lock needs,
        /// and this is not one.
        public static int Cycle(LockOnState state, FlightVector origin,
            FlightVector forward, LockCandidate[] candidates) =>
            Cycle(state, origin, forward, candidates, candidates.Length);

        public static int Cycle(LockOnState state, FlightVector origin,
            FlightVector forward, LockCandidate[] candidates, int count)
        {
            var live = 0;
            for (var i = 0; i < count; i++) if (candidates[i].alive) live++;
            if (live == 0) return LockOnState.None;

            var order = new int[live];
            var bearings = new double[live];
            var n = 0;
            for (var i = 0; i < count; i++)
            {
                if (!candidates[i].alive) continue;
                order[n] = candidates[i].id;
                bearings[n] = FlightVector.Dot(
                    Bearing(origin, candidates[i].position, out _), forward);
                n++;
            }
            // Descending bearing: most nearly ahead first. Insertion sort keeps
            // ties in candidate order, which is what Array.Sort would not
            // guarantee and what the browser's stable sort does give.
            for (var i = 1; i < live; i++)
            {
                var keyId = order[i];
                var keyBearing = bearings[i];
                var j = i - 1;
                while (j >= 0 && bearings[j] < keyBearing)
                {
                    order[j + 1] = order[j];
                    bearings[j + 1] = bearings[j];
                    j--;
                }
                order[j + 1] = keyId;
                bearings[j + 1] = keyBearing;
            }

            var index = Array.IndexOf(order, state.target);
            // indexOf returns -1 when nothing is locked, and (-1 + 1) % n == 0
            // selects the most nearly ahead — same as the browser.
            state.target = order[(index + 1) % live];
            state.manual = true;
            state.assisted = true;
            state.hover = state.target;
            state.hoverTime = SoftLockDwell;
            return state.target;
        }

        /// Canonical: releaseLock(). Only a manual designation can be released;
        /// a soft lock is dropped by looking away, not by a keypress.
        public static bool Release(LockOnState state)
        {
            if (!state.manual) return false;
            state.manual = false;
            state.assisted = false;
            state.hover = LockOnState.None;
            state.hoverTime = 0;
            state.grace = 0;
            return true;
        }

        static bool IsAlive(int id, LockCandidate[] candidates, int count) =>
            TryFind(id, candidates, count, out var found) && found.alive;

        static bool TryFind(int id, LockCandidate[] candidates, int count, out LockCandidate found)
        {
            for (var i = 0; i < count; i++)
            {
                if (candidates[i].id != id) continue;
                found = candidates[i];
                return true;
            }
            found = default;
            return false;
        }
    }
}
