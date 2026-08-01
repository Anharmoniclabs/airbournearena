using System;

namespace AirbourneArena.Flight
{
    /// <summary>
    /// Device-independent flight-control law ported from the canonical HTML
    /// game. It turns pilot intent into the pitch/roll/yaw commands consumed
    /// by <see cref="FlightModel"/>.
    /// </summary>
    public static class FlightControlSolver
    {
        public const double BankSnap = 0.92;
        public const double BankMax = 1.40;
        public const double TurnRamp = 0.55;
        public const double RollGain = 3.4;
        public const double LevelGain = 2.6;

        const double Gravity = 32.0;
        const double LiftK = 0.00284;
        const double ClAlpha = 5.2;
        const double ClZero = 0.06;
        const double CriticalAlpha = 0.30;
        const double AlphaGain = 7.0;
        const double AlphaCap = 0.88;
        const double GLimit = 9.0;

        static double Clamp(double value, double min, double max) =>
            Math.Max(min, Math.Min(max, value));

        static double Smooth(double low, double high, double value)
        {
            var t = Clamp((value - low) / (high - low), 0, 1);
            return t * t * (3 - 2 * t);
        }

        public static void Axes(FlightState state, out FlightVector forward,
            out FlightVector up, out FlightVector right)
        {
            forward = state.orientation.Rotate(new FlightVector(0, 0, -1));
            up = state.orientation.Rotate(new FlightVector(0, 1, 0));
            right = state.orientation.Rotate(new FlightVector(1, 0, 0));
        }

        public static double CurrentBank(FlightState state)
        {
            Axes(state, out _, out var up, out var right);
            return Math.Atan2(-right.y, up.y);
        }

        public static double AlphaPull(FlightState state, double requestedLoad)
        {
            var speed = state.speed > 0 ? state.speed : state.velocity.Length;
            var speedSquared = speed * speed;
            if (speedSquared < 400) return 0;
            var requiredLift = Clamp(requestedLoad, 0, GLimit) * Gravity /
                (LiftK * speedSquared);
            var requestedAlpha = Clamp((requiredLift - ClZero) / ClAlpha,
                -CriticalAlpha * AlphaCap, CriticalAlpha * AlphaCap);
            return Clamp((requestedAlpha - state.alpha) * AlphaGain, -1, 1);
        }

        public static double BankLoad(double bank) =>
            1 / Math.Max(0.14, Math.Cos(bank));

        public static FlightControls Keyboard(FlightState state, int turn,
            int pitch, double turnHold, double invertY, double throttle, bool burner)
        {
            var bankNow = CurrentBank(state);
            var bankWant = turn * (BankSnap + (BankMax - BankSnap) * turnHold);
            var pitchCommand = pitch * invertY;
            if (turn != 0 && pitch == 0)
            {
                pitchCommand = Clamp(AlphaPull(state, BankLoad(bankNow)) +
                    Clamp(-state.velocity.y * 0.006, -0.30, 0.30), -1, 1);
            }
            return new FlightControls {
                pitch = pitchCommand,
                roll = turn != 0
                    ? Clamp(-(bankWant - bankNow) * RollGain, -1, 1)
                    : Clamp(-bankNow * LevelGain, -1, 1),
                yaw = 0,
                throttle = throttle,
                burner = burner
            };
        }

        public static FlightControls SteerTo(FlightState state, FlightVector direction,
            double gain, bool hard, double throttle, bool burner)
        {
            Axes(state, out var forward, out var up, out var right);
            direction = direction.Normalized;
            var ex = FlightVector.Dot(direction, right);
            var ey = FlightVector.Dot(direction, up);
            var ez = FlightVector.Dot(direction, forward);
            var horizontal = Math.Sqrt(ex * ex + ez * ez);
            var pitchError = Math.Atan2(ey, horizontal);
            var yawError = Math.Atan2(ex, ez);
            var bankNow = Math.Atan2(-right.y, up.y);
            var cap = hard ? BankMax : 1.25;
            var bankWant = Clamp(yawError * (gain == 0 ? 1.7 : gain), -cap, cap);
            var roll = Clamp(-(bankWant - bankNow) * (hard ? RollGain : 1.9), -1, 1);
            double pitch;
            if (hard)
            {
                var blend = Smooth(0.30, 0.85, Math.Abs(bankNow));
                pitch = Clamp(pitchError * 2.6 +
                    Math.Max(0, AlphaPull(state, BankLoad(bankNow))) * blend, -1, 1);
            }
            else pitch = Clamp(pitchError * 2.5 + Math.Abs(bankNow) * 0.55, -1, 1);
            return new FlightControls {
                pitch = pitch,
                roll = roll,
                yaw = Clamp(yawError * 0.6, -1, 1) * 0.30,
                throttle = throttle,
                burner = burner
            };
        }

        public static FlightControls WingsLevel(FlightState state,
            double throttle, bool burner) => new FlightControls {
                pitch = 0,
                roll = Clamp(-CurrentBank(state) * LevelGain, -1, 1),
                yaw = 0,
                throttle = throttle,
                burner = burner
            };
    }
}
