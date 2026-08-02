using AirbourneArena.Flight;
using NUnit.Framework;

namespace AirbourneArena.Tests
{
    public sealed class FlightControlSolverTests
    {
        [Test]
        public void KeyboardTurnBanksThenPullsWithoutRawAxisFlight()
        {
            var state = new FlightState {
                position = new FlightVector(0, 800, 0),
                velocity = new FlightVector(0, 0, -180)
            };
            var model = new FlightModel();
            const double dt = 1.0 / 60.0;
            double hold = 0;
            for (var frame = 0; frame < 240; frame++)
            {
                hold = System.Math.Min(1, hold + dt / FlightControlSolver.TurnRamp);
                var controls = FlightControlSolver.Keyboard(state, 1, 0, hold, 1, 1, false);
                model.Step(state, controls, dt);
            }
            FlightControlSolver.Axes(state, out var forward, out _, out _);
            Assert.That(System.Math.Abs(forward.x), Is.GreaterThan(.25),
                "A held turn must change heading, not merely roll the aircraft.");
            Assert.That(state.position.y, Is.GreaterThan(400),
                "The level-turn governor must prevent the catastrophic altitude loss from the placeholder controls.");
            Assert.That(System.Math.Abs(FlightControlSolver.CurrentBank(state)),
                Is.GreaterThan(.45).And.LessThan(1.55));
        }

        [Test]
        public void ReleasedControlsCommandWingsLevel()
        {
            var state = new FlightState {
                orientation = FlightQuaternion.AxisAngle(new FlightVector(0, 0, 1), .8)
            };
            var controls = FlightControlSolver.WingsLevel(state, .75, false);
            Assert.That(System.Math.Abs(controls.roll), Is.GreaterThan(.9));
            Assert.That(controls.pitch, Is.Zero);
        }

        [Test]
        public void TrimmedLaunchHoldsSafeAltitudeForTenSecondsWithoutInput()
        {
            var state = new FlightState {
                position = new FlightVector(0, 520, 0),
                orientation = UnityFlightBody.LaunchOrientation(FlightQuaternion.Identity),
                velocity = UnityFlightBody.LaunchVelocity(FlightQuaternion.Identity, 185)
            };
            var model = new FlightModel();
            const double dt = 1.0 / 60.0;
            for (var frame = 0; frame < 600; frame++)
                model.Step(state, FlightControlSolver.WingsLevel(state, 1, false), dt);

            Assert.That(state.position.y, Is.GreaterThan(470),
                "A hands-off launch must not lose the terrain-safe flight corridor.");
            Assert.That(state.position.y, Is.LessThan(700),
                "Launch trim should hold altitude rather than balloon vertically.");
        }
    }
}
