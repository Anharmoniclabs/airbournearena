using AirbourneArena.Flight;
using NUnit.Framework;
using UnityEngine;

namespace AirbourneArena.Tests.EditMode
{
    public sealed class PlayerFlightControllerTests
    {
        [Test]
        public void BrowserMouseUpCommandsPositivePitchAim()
        {
            var delta = PlayerFlightController.MouseAimDelta(
                new Vector2(0, 40), 65, false);
            Assert.That(delta.y, Is.GreaterThan(0));
        }

        // This used to assert that MouseAimDelta itself capped a single frame at
        // .026. That cap was not in the canonical game and was removed: the
        // browser clamps the accumulated aim, never the per-frame delta, and
        // capping the delta throttles the fast flick a pilot uses to bring the
        // nose round. The protection the test was named for is real, but it
        // lives in the accumulation — so that is what it now checks.
        [Test]
        public void PointerLockSpikeCannotBecomeFullStickInput()
        {
            var aim = PlayerFlightController.AccumulateAim(
                Vector2.zero, new Vector2(2000, 2000), 120, false);
            Assert.That(aim.magnitude,
                Is.LessThanOrEqualTo(PlayerFlightController.AimRadius + .00001f));
        }

        [Test]
        public void RepeatedSpikesCannotWalkTheReticleOutsideItsCircle()
        {
            var aim = Vector2.zero;
            for (var i = 0; i < 50; i++)
                aim = PlayerFlightController.AccumulateAim(aim, new Vector2(5000, -3000), 120, false);
            Assert.That(aim.magnitude,
                Is.LessThanOrEqualTo(PlayerFlightController.AimRadius + .00001f));
        }

        // The removed clamp, stated as an invariant so it cannot come back: a
        // fast flick has to arrive at full size, well past the old .026 cap.
        [Test]
        public void AFastFlickIsNotThrottledByAPerFrameCap()
        {
            var delta = PlayerFlightController.MouseAimDelta(
                new Vector2(2000, 2000), 120, false);
            Assert.That(delta.magnitude, Is.GreaterThan(.026f));
        }

        [Test]
        public void InvertYReversesOnlyVerticalMouseAim()
        {
            var normal = PlayerFlightController.MouseAimDelta(
                new Vector2(20, 20), 65, false);
            var inverted = PlayerFlightController.MouseAimDelta(
                new Vector2(20, 20), 65, true);
            Assert.That(inverted.x, Is.EqualTo(normal.x).Within(.00001f));
            Assert.That(inverted.y, Is.EqualTo(-normal.y).Within(.00001f));
        }

        [Test]
        public void CentredReticleFliesAirframeForwardNotDownCameraSightline()
        {
            var state = new FlightState {
                orientation = UnityFlightBody.LaunchOrientation(FlightQuaternion.Identity)
            };
            FlightControlSolver.Axes(state, out var forward, out _, out _);
            var direction = PlayerFlightController.AimDirection(state, Vector2.zero,
                Vector3.right, new Vector3(0, .8f, .6f), 70, 1.6f);

            Assert.That(FlightVector.Dot(direction, forward), Is.EqualTo(1).Within(.00001));
        }

        [Test]
        public void ReticleUpCommandsAboveNeutralFlightDirection()
        {
            var state = new FlightState();
            var direction = PlayerFlightController.AimDirection(state,
                new Vector2(0, .4f), Vector3.right, Vector3.up, 70, 1.6f);

            Assert.That(direction.y, Is.GreaterThan(0));
        }
    }
}
