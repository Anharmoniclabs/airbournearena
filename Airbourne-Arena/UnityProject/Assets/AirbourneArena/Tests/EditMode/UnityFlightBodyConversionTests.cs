using AirbourneArena.Flight;
using NUnit.Framework;
using UnityEngine;

namespace AirbourneArena.Tests
{
    public sealed class UnityFlightBodyConversionTests
    {
        [Test]
        public void PositionRoundTripPreservesCanonicalCoordinates()
        {
            var unity = new Vector3(-2500, 520, 260);

            var flight = UnityFlightBody.ToFlight(unity);
            var roundTrip = UnityFlightBody.ToUnity(flight);

            Assert.That(flight.x, Is.EqualTo(-2500).Within(1e-6));
            Assert.That(flight.y, Is.EqualTo(520).Within(1e-6));
            Assert.That(flight.z, Is.EqualTo(-260).Within(1e-6));
            Assert.That(Vector3.Distance(roundTrip, unity), Is.LessThan(1e-5f));
        }

        [TestCase(0f)]
        [TestCase(90f)]
        [TestCase(-90f)]
        [TestCase(179f)]
        public void OrientationRoundTripPreservesUnityHeading(float yaw)
        {
            var unity = Quaternion.Euler(0, yaw, 0);

            var flight = UnityFlightBody.FromUnity(unity);
            var roundTrip = UnityFlightBody.ToUnity(flight);

            Assert.That(Quaternion.Angle(roundTrip, unity), Is.LessThan(.001f));
        }

        [Test]
        public void BreakwaterSpawnFacesCanonicalMidfieldDirection()
        {
            var unity = Quaternion.LookRotation(Vector3.right, Vector3.up);
            var flight = UnityFlightBody.FromUnity(unity);
            var canonicalForward = flight.Rotate(new FlightVector(0, 0, -1));

            Assert.That(canonicalForward.x, Is.EqualTo(1).Within(1e-5));
            Assert.That(canonicalForward.y, Is.EqualTo(0).Within(1e-5));
            Assert.That(canonicalForward.z, Is.EqualTo(0).Within(1e-5));
        }
    }
}
