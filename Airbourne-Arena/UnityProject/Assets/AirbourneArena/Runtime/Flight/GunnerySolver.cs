using System;

namespace AirbourneArena.Flight
{
    /// The canonical gun, ported from 22-bullets.js and 27-gunnery.js.
    ///
    /// The vertical slice shipped a gun that fired straight from the muzzle at
    /// 520 m/s for 12 damage with a .32 m hit sphere. None of those numbers are
    /// the game's: it fires at 780 for 14 with a 14-unit hit radius, and — far
    /// more important to how it feels — it has a lead solver, a magnetic aim
    /// that closes part of a small aiming error, and rounds that steer for the
    /// first two thirds of a second. Without those, a pass that would have
    /// scored in the browser produces nothing, which reads as the aircraft
    /// being wrong rather than the gun being absent.
    ///
    /// Written against FlightVector rather than UnityEngine.Vector3 for the
    /// same two reasons FlightModel is. It compiles without a Unity reference,
    /// so Tools/FlightParity can run it against values recorded from the
    /// browser in CI; and it computes in double precision, which is what
    /// JavaScript numbers are. A float lead solution drifts from the canonical
    /// one by a little at every step, and the whole point of this file is that
    /// it does not.
    public static class GunnerySolver
    {
        // 22-bullets.js
        public const double MuzzleVelocity = 780;
        public const double RoundDamage = 14;
        public const double HitRadius = 14;
        public const double RoundLife = 1.6;
        /// f.cannonCd = .085 / (f.gunRate || 1) — 11.76 rounds/sec, not 12.
        public const double ShotInterval = .085;
        /// The player's cannon is far tighter than an AI's; f.spread is the
        /// difficulty-scaled figure used for everyone else.
        public const double PlayerSpread = .0032;
        public const double MuzzleOffset = 6.4;
        public const int MaxRounds = 480;

        // Magnetic aim. Only rewards a shot already lined up: the initial pull
        // closes part of an eight-degree error, and the round may then bend a
        // few more degrees during its first half second. It cannot U-turn,
        // chase an off-screen lock, or keep steering all the way to impact.
        public const double AssistCone = .9903;
        public const double AssistPull = .38;
        public const double GuideFireCone = .9703;
        public const double GuideTime = .62;
        public const double GuideTurn = 1.35;
        public const double GuideTrackCone = .9455;

        /// Aircraft are aimed at their centre; a fixed installation is planted
        /// at terrain height, so aim halfway up it rather than magnetising
        /// rounds into the dirt at its origin.
        public static FlightVector TargetPoint(FlightVector position, bool isAircraft, double height)
        {
            if (!isAircraft && height > 0) position.y += height * .52;
            return position;
        }

        /// Time of flight for rounds fired now to meet the target.
        ///
        /// Solves |R + W t| = MUZZLE t for t, where R is the relative position
        /// and W the relative velocity. Falls back to the straight-line
        /// estimate whenever there is no real solution — a target opening
        /// faster than the rounds close has no intercept at all, and returning
        /// nothing there would silently disable the lead pip.
        public static double InterceptTime(FlightVector shooterPosition,
            FlightVector shooterVelocity, FlightVector targetPosition, FlightVector targetVelocity)
        {
            var r = targetPosition - shooterPosition;
            var w = targetVelocity - shooterVelocity;
            var range = r.Length;
            var a = MuzzleVelocity * MuzzleVelocity - w.LengthSquared;
            if (a <= 1e-6) return range / MuzzleVelocity;
            var b = -2 * FlightVector.Dot(r, w);
            var c = -range * range;
            var disc = b * b - 4 * a * c;
            if (disc < 0) return range / MuzzleVelocity;
            var t = (-b + Math.Sqrt(disc)) / (2 * a);
            return t > 0 && !double.IsInfinity(t) && !double.IsNaN(t)
                ? Math.Min(t, 4) : range / MuzzleVelocity;
        }

        /// Direction the nose must point for rounds fired now to arrive at the
        /// same place, at the same time, as the target.
        public static FlightVector InterceptAim(FlightVector shooterPosition,
            FlightVector shooterVelocity, FlightVector targetPosition,
            FlightVector targetVelocity, double flightTime)
        {
            var aim = (targetPosition - shooterPosition) / Math.Max(flightTime, .001)
                + (targetVelocity - shooterVelocity);
            return aim.Normalized;
        }

        /// The firing direction after magnetic aim. Also reports whether the
        /// shot earns guidance — a tighter cone than the pull, so a round only
        /// steers when the pilot was already close.
        public static FlightVector AssistedFireDirection(FlightVector forward,
            FlightVector interceptDirection, bool hasLock, out bool guided)
        {
            guided = false;
            if (!hasLock) return forward;
            var aimDot = FlightVector.Dot(interceptDirection, forward);
            var direction = forward;
            if (aimDot > AssistCone)
                direction = Lerp(forward, interceptDirection, AssistPull).Normalized;
            if (aimDot > GuideFireCone) guided = true;
            return direction;
        }

        /// One frame of a guided round's correction; returns the new velocity.
        ///
        /// Speed is preserved: this bends the round, it does not accelerate it.
        /// The correction is rate limited, decays as the allowance expires, and
        /// stops entirely once the target leaves a forward cone — which is what
        /// keeps this an aim assist rather than a homing missile.
        public static FlightVector GuideRound(FlightVector roundPosition,
            FlightVector roundVelocity, FlightVector targetPosition,
            FlightVector targetVelocity, double guideRemaining, double dt)
        {
            var speed = roundVelocity.Length;
            if (speed <= 1e-6) return roundVelocity;
            var lead = Math.Min(.65, (targetPosition - roundPosition).Length / Math.Max(speed, 1));
            var want = (targetPosition + targetVelocity * lead - roundPosition).Normalized;
            var current = roundVelocity / speed;
            if (FlightVector.Dot(current, want) <= GuideTrackCone) return roundVelocity;
            var alpha = Math.Min(1, GuideTurn * dt * (.45 + .55 * guideRemaining / GuideTime));
            return Lerp(current, want, alpha).Normalized * speed;
        }

        /// Closest approach of a round's travel this frame to a target centre,
        /// as the canonical stepBullets does it: segment/point distance, not a
        /// sphere cast. A sphere cast stops at the first collider it touches and
        /// needs colliders to exist on the right layer; this is the arithmetic
        /// the browser runs and needs neither.
        public static bool SegmentHitsSphere(FlightVector from, FlightVector to,
            FlightVector centre, double radius, out FlightVector contact)
        {
            var segment = to - from;
            var lengthSquared = segment.LengthSquared;
            if (lengthSquared < 1e-6) { contact = from; return false; }
            var t = FlightMathUtil.Clamp(FlightVector.Dot(centre - from, segment) / lengthSquared, 0, 1);
            contact = from + segment * t;
            return (contact - centre).LengthSquared < radius * radius;
        }

        /// Uniform spread per axis, matching the browser's rnd(-s, s) applied
        /// to each component before normalising.
        public static FlightVector ApplySpread(FlightVector direction, double spread,
            Func<double> random01)
        {
            if (spread <= 0) return direction;
            direction.x += (random01() * 2 - 1) * spread;
            direction.y += (random01() * 2 - 1) * spread;
            direction.z += (random01() * 2 - 1) * spread;
            return direction.Normalized;
        }

        static FlightVector Lerp(FlightVector a, FlightVector b, double t) => a + (b - a) * t;
    }

    static class FlightMathUtil
    {
        public static double Clamp(double v, double lo, double hi) =>
            v < lo ? lo : v > hi ? hi : v;
    }
}
