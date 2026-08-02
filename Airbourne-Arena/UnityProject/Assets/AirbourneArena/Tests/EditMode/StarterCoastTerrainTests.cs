using AirbourneArena.Flight;
using NUnit.Framework;

namespace AirbourneArena.Tests
{
    public sealed class StarterCoastTerrainTests
    {
        [TestCase(0, 0, 24.0)]
        [TestCase(-2400, 0, 54.177617518142966)]
        [TestCase(0, -2100, 158.17612717631243)]
        [TestCase(1000, -1000, 142.72857649253021)]
        [TestCase(4000, -4000, 0.0)]
        [TestCase(2225, 525, 40.653680984571110)]
        [TestCase(-1550, 1300, 212.10359560754355)]
        public void GroundMatchesCanonicalJavaScript(double unityX, double unityZ,
            double expected)
        {
            Assert.That(StarterCoastTerrain.Ground(unityX, unityZ),
                Is.EqualTo(expected).Within(1e-9));
        }

        [Test]
        public void SweptImpactCannotTunnelThroughSeaLevel()
        {
            var from = new FlightVector(4000, 120, 4000);
            var to = new FlightVector(4000, -90, 4000);
            Assert.That(FlightImpactSolver.TryImpact(from, to,
                out var impact, out var surface), Is.True);
            Assert.That(surface, Is.EqualTo(StarterCoastTerrain.SeaLevel));
            Assert.That(impact.y, Is.LessThan(FlightImpactSolver.Clearance));
        }

        [Test]
        public void SafeFlightSegmentDoesNotImpact()
        {
            var from = new FlightVector(0, 800, 0);
            var to = new FlightVector(0, 790, -10);
            Assert.That(FlightImpactSolver.TryImpact(from, to,
                out _, out _), Is.False);
        }
    }
}
