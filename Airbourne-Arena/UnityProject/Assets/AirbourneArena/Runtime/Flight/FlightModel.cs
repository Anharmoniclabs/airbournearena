using System;

namespace AirbourneArena.Flight
{
    [Serializable]
    public sealed class FlightState
    {
        public FlightVector position = new FlightVector(0, 800, 0);
        public FlightVector velocity = new FlightVector(0, 0, -135);
        public FlightQuaternion orientation = FlightQuaternion.Identity;
        public double alpha, speed, gLoad, afterburnerRamp;
        public bool stalled, carrying;
        public double engineDamage, aileronDamage, aileronSign = 1;
        public double thrustTrim = 1, agilityTrim = 1;
    }

    public struct FlightControls
    {
        public double pitch, roll, yaw, throttle, rollMultiplier;
        public bool burner;
        public double EffectiveRollMultiplier => rollMultiplier == 0 ? 1 : rollMultiplier;
    }

    public sealed class FlightModel
    {
        public const double Gravity = 32.0;
        public FlightVector Wind;

        const double Thrust = 16.0, DragK = 0.00032, InducedDrag = 0.35;
        const double LiftK = 0.00284, ClAlpha = 5.2, ClZero = 0.06;
        const double CriticalAlpha = 0.30, TrimAlpha = 0.045, GLimit = 9.0;
        const double SideK = 0.0022, PitchRate = 1.85, RollRate = 5.6;
        const double YawRate = 0.60, Stability = 1.9, BurnerThrust = 1.85;
        const double AileronBias = 1.35;

        static double Clamp(double value, double min, double max) =>
            Math.Max(min, Math.Min(max, value));

        static double AirDensity(double altitude) =>
            Clamp(1 - (altitude - 6500) / 18000, 0.42, 1);

        static void Axes(FlightState state, out FlightVector forward,
            out FlightVector up, out FlightVector right)
        {
            forward = state.orientation.Rotate(new FlightVector(0, 0, -1));
            up = state.orientation.Rotate(new FlightVector(0, 1, 0));
            right = state.orientation.Rotate(new FlightVector(1, 0, 0));
        }

        public void Step(FlightState state, FlightControls controls, double deltaTime)
        {
            Axes(state, out var forward, out var up, out var right);
            double speed = state.velocity.Length;
            double carry = state.carrying ? 1 : 0;
            if (state.engineDamage > 0)
                controls.throttle = Math.Min(controls.throttle, 1 - state.engineDamage * 0.40);
            double authority = Clamp((speed - 16) / 125, 0.10, 1);
            double limiter = 1;
            double over = (Math.Abs(state.alpha) - CriticalAlpha * 0.72) / (CriticalAlpha * 0.55);
            if (over > 0 && controls.pitch * (state.alpha >= 0 ? 1 : -1) > 0)
                limiter = 1 - Clamp(over, 0, 1) * 0.70;

            RotateLocal(state, new FlightVector(1, 0, 0),
                controls.pitch * PitchRate * state.agilityTrim * (carry > 0 ? .82 : 1) *
                authority * limiter * deltaTime);
            RotateLocal(state, new FlightVector(0, 0, 1),
                controls.roll * RollRate * controls.EffectiveRollMultiplier * state.agilityTrim *
                (carry > 0 ? .82 : 1) * (1 - state.aileronDamage * 0.5) * authority * deltaTime);
            if (state.aileronDamage > 0)
                RotateLocal(state, new FlightVector(0, 0, 1),
                    state.aileronDamage * state.aileronSign * AileronBias * deltaTime);
            RotateLocal(state, new FlightVector(0, 1, 0),
                -controls.yaw * YawRate * authority * deltaTime);
            Axes(state, out forward, out up, out right);

            FlightVector velocityDirection = speed > 0.5 ? state.velocity / speed : forward;
            double alpha = Math.Asin(Clamp(-FlightVector.Dot(velocityDirection, up), -1, 1));
            double beta = Math.Asin(Clamp(FlightVector.Dot(velocityDirection, right), -1, 1));
            double cl = ClZero + ClAlpha * alpha;
            bool stalled = Math.Abs(alpha) > CriticalAlpha;
            if (stalled) cl *= 1 - 0.75 * Clamp((Math.Abs(alpha) - CriticalAlpha) / 0.25, 0, 1);
            double speedSquared = speed * speed;
            FlightVector liftDirection = FlightVector.Cross(right, velocityDirection);
            liftDirection = liftDirection.LengthSquared > 1e-6 ? liftDirection.Normalized : up;

            double density = AirDensity(state.position.y);
            double activeGLimit = carry > 0 ? 6.5 : GLimit;
            double liftAcceleration = Clamp(LiftK * speedSquared * cl * density,
                -activeGLimit * Gravity, activeGLimit * Gravity);
            double cd = 1 + InducedDrag * (carry > 0 ? 1.25 : 1) * cl * cl + (stalled ? 0.9 : 0);
            if (speed > 280) cd += (speed - 280) / 140;

            double thrustMultiplier = 1;
            if (controls.burner)
            {
                state.afterburnerRamp = Math.Min(1, state.afterburnerRamp + deltaTime * 3.2);
                thrustMultiplier = 1 + (BurnerThrust - 1) * state.afterburnerRamp;
            }
            else state.afterburnerRamp = Math.Max(0, state.afterburnerRamp - deltaTime * 2.4);

            var acceleration = forward * (Thrust * state.thrustTrim * (carry > 0 ? .85 : 1) *
                controls.throttle * thrustMultiplier * Math.Pow(density, 0.75));
            acceleration += liftDirection * liftAcceleration;
            acceleration += velocityDirection * (-DragK * speedSquared * cd * density);
            acceleration += right * (-SideK * speedSquared * beta);
            acceleration.y -= Gravity;

            state.velocity += acceleration * deltaTime;
            state.position += state.velocity * deltaTime;
            state.position += Wind * (deltaTime * 0.30);

            if (speed > 8)
            {
                var target = FlightQuaternion.AxisAngle(right, TrimAlpha).Rotate(velocityDirection);
                var axis = FlightVector.Cross(forward, target);
                double sine = Clamp(axis.Length, -1, 1);
                if (sine > 1e-4)
                    RotateWorld(state, axis.Normalized,
                        Math.Asin(sine) * Math.Min(1, Stability * deltaTime));
            }
            state.orientation = state.orientation.Normalized;
            state.speed = state.velocity.Length;
            state.alpha = alpha;
            state.stalled = stalled;
            state.gLoad = liftAcceleration / Gravity;
        }

        static void RotateLocal(FlightState state, FlightVector axis, double radians) =>
            state.orientation = state.orientation * FlightQuaternion.AxisAngle(axis, radians);
        static void RotateWorld(FlightState state, FlightVector axis, double radians) =>
            state.orientation = FlightQuaternion.AxisAngle(axis, radians) * state.orientation;
    }
}
