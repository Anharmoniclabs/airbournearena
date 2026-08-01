using System;

namespace AirbourneArena.Flight
{
    /// <summary>
    /// Exact C# translation of src/game/01-util.js and src/game/06-arena.js.
    /// Public coordinates are Unity left-handed coordinates; source Z is
    /// reflected internally so mission and terrain locations stay canonical.
    /// </summary>
    public static class StarterCoastTerrain
    {
        public const double SeaLevel = 0;
        const double SeabedLevel = -32;

        static readonly double[,] LandLobes = {
            { 0, 0, 1250, 1120, 1 }, { -2760, 0, 900, 900, .82 },
            { 2760, 0, 900, 900, .82 }, { 0, 2100, 930, 760, 1.16 },
            { 0, -2200, 1080, 830, .72 }, { -1500, 1300, 980, 820, .86 },
            { 1550, 1300, 980, 820, .92 }, { -1550, -1300, 1030, 860, .78 },
            { 1650, -1250, 1030, 850, .84 }
        };

        static readonly double[,] SitePlateaus = {
            { -2100, -1200, 260 }, { 2100, -900, 260 }, { 1200, 1800, 260 },
            { -1400, 1600, 260 }, { -1800, -1600, 250 }, { 1900, -1400, 250 },
            { 1700, 1500, 250 }, { -1600, 1700, 250 }, { 1500, -400, 230 },
            { -900, -1500, 230 }, { 600, 1600, 230 }, { 2225, -525, 240 }
        };

        static readonly double[,] ConstructionPads = {
            { 0, 2100, 285, 220, 110, 0 },
            { -430, -410, 65, 52, 70, 0 }, { 430, -410, 62, 50, 70, 0 },
            { -430, 410, 62, 50, 70, 0 }, { 430, 410, 64, 52, 70, 0 },
            { -1560, 1300, 72, 55, 85, 0 }, { -1360, 1380, 65, 51, 80, 0 },
            { 1630, 1205, 190, 150, 120, 0 }, { -1520, -1303, 175, 125, 110, 0 },
            { 2225, -525, 67, 54, 85, 0 }, { 0, -2150, 68, 53, 70, 0 },
            { -280, -2070, 112, 67, 90, 0 }, { 280, -2070, 112, 67, 90, 0 }
        };

        static StarterCoastTerrain()
        {
            for (var index = 0; index < ConstructionPads.GetLength(0); index++)
                ConstructionPads[index, 5] = TerrainBaseHeight(
                    ConstructionPads[index, 0], ConstructionPads[index, 1]);
        }

        public static double Ground(double unityX, double unityZ) =>
            Math.Max(TerrainHeightSource(unityX, -unityZ), SeaLevel);

        public static double TerrainHeight(double unityX, double unityZ) =>
            TerrainHeightSource(unityX, -unityZ);

        static double TerrainHeightSource(double x, double z)
        {
            var height = TerrainBaseHeight(x, z);
            for (var index = 0; index < ConstructionPads.GetLength(0); index++)
            {
                var dx = Math.Max(Math.Abs(x - ConstructionPads[index, 0]) -
                    ConstructionPads[index, 2], 0);
                var dz = Math.Max(Math.Abs(z - ConstructionPads[index, 1]) -
                    ConstructionPads[index, 3], 0);
                var weight = 1 - Smooth(0, ConstructionPads[index, 4],
                    Math.Sqrt(dx * dx + dz * dz));
                if (weight > 0)
                    height += (ConstructionPads[index, 5] - height) * weight;
            }
            return height;
        }

        static double TerrainBaseHeight(double x, double z)
        {
            var mask = IslandMask(x, z);
            if (mask <= .001) return SeabedLevel;
            var basis = Math.Pow(Fbm(x * .00072, z * .00072, 5), 1.72);
            var ridge = 1 - Math.Abs(ValueNoise(x * .0018 + 31.3, z * .0018 + 17.7) * 2 - 1);
            var height = 18 + basis * 210 + ridge * ridge * 105;
            for (var index = 0; index < LandLobes.GetLength(0); index++)
            {
                var dx = (x - LandLobes[index, 0]) / LandLobes[index, 2];
                var dz = (z - LandLobes[index, 1]) / LandLobes[index, 3];
                height += Math.Max(0, 1 - Math.Sqrt(dx * dx + dz * dz)) *
                    34 * LandLobes[index, 4];
            }
            var urban = 1 - Smooth(650, 1050, Math.Sqrt(x * x + z * z));
            height += (24 - height) * urban;
            for (var side = -1; side <= 1; side += 2)
            {
                var dx = x - side * 2760;
                var field = 1 - Smooth(250, 520, Math.Sqrt(dx * dx + z * z));
                height += (34 - height) * field;
            }
            var harborZ = z + 2200;
            var harbor = 1 - Smooth(360, 720, Math.Sqrt(x * x + harborZ * harborZ));
            height += (16 - height) * harbor;
            for (var index = 0; index < SitePlateaus.GetLength(0); index++)
            {
                var dx = x - SitePlateaus[index, 0];
                var dz = z - SitePlateaus[index, 1];
                var radius = SitePlateaus[index, 2];
                var pad = 1 - Smooth(radius * .55, radius,
                    Math.Sqrt(dx * dx + dz * dz));
                if (pad <= 0) continue;
                var target = 34 + Hash(SitePlateaus[index, 0] * .01,
                    SitePlateaus[index, 1] * .01) * 24;
                height += (target - height) * pad;
            }
            return SeabedLevel + (height - SeabedLevel) * Smooth(.02, .82, mask);
        }

        static double IslandMask(double x, double z)
        {
            var best = 0d;
            var edge = (Fbm(x * .0016 + 18.1, z * .0016 + 3.7, 4) - .48) * .16;
            for (var index = 0; index < LandLobes.GetLength(0); index++)
            {
                var dx = (x - LandLobes[index, 0]) / LandLobes[index, 2];
                var dz = (z - LandLobes[index, 1]) / LandLobes[index, 3];
                var radius = Math.Sqrt(dx * dx + dz * dz);
                best = Math.Max(best, 1 - Smooth(.78 + edge, 1.04 + edge, radius));
            }
            for (var index = 0; index < SitePlateaus.GetLength(0); index++)
            {
                var dx = x - SitePlateaus[index, 0];
                var dz = z - SitePlateaus[index, 1];
                var distance = Math.Sqrt(dx * dx + dz * dz);
                best = Math.Max(best, 1 - Smooth(SitePlateaus[index, 2] * .68,
                    SitePlateaus[index, 2], distance));
            }
            return Clamp(best, 0, 1);
        }

        static double Fbm(double x, double y, int octaves)
        {
            var sum = 0d;
            var amplitude = .5;
            var frequency = 1d;
            for (var index = 0; index < octaves; index++)
            {
                sum += amplitude * ValueNoise(x * frequency, y * frequency);
                frequency *= 2.03;
                amplitude *= .5;
            }
            return sum;
        }

        static double ValueNoise(double x, double y)
        {
            var xi = Math.Floor(x);
            var yi = Math.Floor(y);
            var xf = x - xi;
            var yf = y - yi;
            var u = xf * xf * (3 - 2 * xf);
            var v = yf * yf * (3 - 2 * yf);
            var a = Hash(xi, yi);
            var b = Hash(xi + 1, yi);
            var c = Hash(xi, yi + 1);
            var d = Hash(xi + 1, yi + 1);
            return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
        }

        static double Hash(double x, double y)
        {
            var value = Math.Sin(x * 127.1 + y * 311.7) * 43758.5453123;
            return value - Math.Floor(value);
        }

        static double Smooth(double low, double high, double value)
        {
            var t = Clamp((value - low) / (high - low), 0, 1);
            return t * t * (3 - 2 * t);
        }

        static double Clamp(double value, double low, double high) =>
            Math.Max(low, Math.Min(high, value));
    }
}
