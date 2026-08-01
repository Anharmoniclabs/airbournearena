using System;

namespace AirbourneArena.Flight
{
    public static class FlightImpactSolver
    {
        public const double Clearance = 8;

        public static bool TryImpact(FlightVector from, FlightVector to,
            out FlightVector impact, out double surfaceHeight)
        {
            var dx = to.x - from.x;
            var dy = to.y - from.y;
            var dz = to.z - from.z;
            var distance = Math.Sqrt(dx * dx + dy * dy + dz * dz);
            var samples = Math.Max(2, Math.Min(32, (int)Math.Ceiling(distance / 12)));
            for (var index = 0; index <= samples; index++)
            {
                var t = (double)index / samples;
                var point = new FlightVector(from.x + dx * t, from.y + dy * t,
                    from.z + dz * t);
                var unityZ = -point.z;
                var ground = StarterCoastTerrain.Ground(point.x, unityZ);
                if (point.y - ground >= Clearance) continue;
                impact = point;
                surfaceHeight = ground;
                return true;
            }
            impact = default;
            surfaceHeight = 0;
            return false;
        }
    }
}
