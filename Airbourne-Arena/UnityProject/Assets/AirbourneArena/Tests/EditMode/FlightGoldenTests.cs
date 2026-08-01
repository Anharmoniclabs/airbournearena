using System;
using System.IO;
using AirbourneArena.Flight;
using NUnit.Framework;
using UnityEngine;

namespace AirbourneArena.Tests
{
    public sealed class FlightGoldenTests
    {
        [Serializable] sealed class Fixture { public Sample[] samples; }
        [Serializable] sealed class Sample
        {
            public double t, alpha, speed, gLoad;
            public double[] position, velocity;
        }

        [Test]
        public void TenSecondReferenceFlightMatchesJavaScript()
        {
            var path = Path.GetFullPath(Path.Combine(Application.dataPath,
                "../../../docs/data/flight-golden.json"));
            var fixture = JsonUtility.FromJson<Fixture>(File.ReadAllText(path));
            var model = new FlightModel();
            var state = new FlightState();
            const double dt = 1.0 / 60.0;
            var sample = 0;
            for (var frame = 0; frame < 600; frame++)
            {
                model.Step(state, Controls(frame * dt), dt);
                if ((frame + 1) % 60 != 0) continue;
                var expected = fixture.samples[sample++];
                AssertVector(expected.position, state.position, expected.t, "position");
                AssertVector(expected.velocity, state.velocity, expected.t, "velocity");
                Assert.That(state.alpha, Is.EqualTo(expected.alpha).Within(1e-6));
                Assert.That(state.speed, Is.EqualTo(expected.speed).Within(1e-4));
                Assert.That(state.gLoad, Is.EqualTo(expected.gLoad).Within(1e-6));
            }
            Assert.That(sample, Is.EqualTo(10));
        }

        static FlightControls Controls(double t)
        {
            if (t < 2) return new FlightControls { throttle = .75 };
            if (t < 5) return new FlightControls {
                pitch = .38, roll = -.42, yaw = .08, throttle = 1
            };
            if (t < 8) return new FlightControls {
                pitch = -.16, roll = .25, yaw = -.04, throttle = 1, burner = true
            };
            return new FlightControls { pitch = .05, throttle = .62 };
        }

        static void AssertVector(double[] expected, FlightVector actual, double t, string field)
        {
            Assert.That(actual.x, Is.EqualTo(expected[0]).Within(1e-4), $"{field}.x at {t}s");
            Assert.That(actual.y, Is.EqualTo(expected[1]).Within(1e-4), $"{field}.y at {t}s");
            Assert.That(actual.z, Is.EqualTo(expected[2]).Within(1e-4), $"{field}.z at {t}s");
        }
    }
}
