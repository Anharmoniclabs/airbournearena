using AirbourneArena.Flight;
using NUnit.Framework;

namespace AirbourneArena.Tests
{
    /// The behaviours the dwell exists to produce. The numeric agreement with
    /// the browser's stepLock is covered separately, from the real source, in
    /// source/tests/unity-lock-on-numeric.test.mjs.
    public sealed class LockOnSolverTests
    {
        static readonly FlightVector Origin = new(0, 0, 0);
        static readonly FlightVector Forward = new(0, 0, 1);

        static LockCandidate[] One(double x, double z, bool alive = true) =>
            new[] { new LockCandidate(1, new FlightVector(x, 0, z), alive) };

        static void Hold(LockOnState state, LockCandidate[] candidates, double seconds)
        {
            for (var t = 0d; t < seconds; t += 1 / 60d)
                LockOnSolver.Step(state, 1 / 60d, true, Origin, Forward, candidates, out _);
        }

        [Test]
        public void AContactIsAcquiredBeforeAssistanceArms()
        {
            var state = new LockOnState();
            var candidates = One(0, 400);
            LockOnSolver.Step(state, 1 / 60d, true, Origin, Forward, candidates, out _);

            Assert.That(state.target, Is.EqualTo(1), "acquired");
            Assert.That(state.assisted, Is.False, "assistance must wait for the dwell");
        }

        [Test]
        public void AssistanceArmsOnlyAfterTheDwell()
        {
            var state = new LockOnState();
            var candidates = One(0, 400);

            Hold(state, candidates, LockOnSolver.SoftLockDwell * .5);
            Assert.That(state.assisted, Is.False, "armed at half the dwell");

            Hold(state, candidates, LockOnSolver.SoftLockDwell);
            Assert.That(state.assisted, Is.True, "never armed");
        }

        [Test]
        public void FreshLockIsReportedOnceNotEveryFrame()
        {
            var state = new LockOnState();
            var candidates = One(0, 400);
            var announcements = 0;
            for (var t = 0d; t < 2; t += 1 / 60d)
            {
                LockOnSolver.Step(state, 1 / 60d, true, Origin, Forward, candidates, out var fresh);
                if (fresh) announcements++;
            }
            Assert.That(announcements, Is.EqualTo(1));
        }

        [Test]
        public void ALockSurvivesABriefCorrectionThroughTheGrace()
        {
            var state = new LockOnState();
            var held = One(0, 400);
            Hold(state, held, LockOnSolver.SoftLockDwell * 2);
            Assert.That(state.assisted, Is.True, "precondition: locked");

            // Outside the release cone, but for less than the grace period.
            var away = new FlightVector(0, .6, .8).Normalized;
            for (var t = 0d; t < LockOnSolver.SoftLockGrace * .5; t += 1 / 60d)
                LockOnSolver.Step(state, 1 / 60d, true, Origin, away, held, out _);

            Assert.That(state.assisted, Is.True, "lock dropped inside the grace period");
        }

        [Test]
        public void ALockIsReleasedAfterTheGraceExpires()
        {
            var state = new LockOnState();
            var held = One(0, 400);
            Hold(state, held, LockOnSolver.SoftLockDwell * 2);

            var away = new FlightVector(0, .8, .6).Normalized;
            for (var t = 0d; t < LockOnSolver.SoftLockGrace * 2; t += 1 / 60d)
                LockOnSolver.Step(state, 1 / 60d, true, Origin, away, held, out _);

            Assert.That(state.assisted, Is.False, "lock outlived its grace period");
        }

        [Test]
        public void TheContactUnderTheCrosshairWinsOverACloserOneOffToTheSide()
        {
            // The bug the squared aim term exists to prevent: something nearer
            // but well off axis taking the solution from a dead-on contact.
            var state = new LockOnState();
            var candidates = new[] {
                new LockCandidate(1, new FlightVector(0, 0, 900), true),    // dead ahead
                new LockCandidate(2, new FlightVector(150, 0, 430), true)   // closer, off axis
            };
            Assert.That(LockOnSolver.PickTarget(state, Origin, Forward, candidates),
                Is.EqualTo(1));
        }

        [Test]
        public void ADeadTargetIsDropped()
        {
            var state = new LockOnState();
            Hold(state, One(0, 400), LockOnSolver.SoftLockDwell * 2);
            Assert.That(state.assisted, Is.True, "precondition: locked");

            LockOnSolver.Step(state, 1 / 60d, true, Origin, Forward, One(0, 400, false), out _);
            Assert.That(state.target, Is.EqualTo(LockOnState.None));
            Assert.That(state.assisted, Is.False);
        }

        [Test]
        public void ManualLockArmsImmediatelyAndHoldsOffAxis()
        {
            var state = new LockOnState();
            var candidates = One(0, 400);
            LockOnSolver.Cycle(state, Origin, Forward, candidates);

            Assert.That(state.assisted, Is.True, "a manual designation is not a soft lock");
            Assert.That(state.manual, Is.True);

            // Pointing well away must not drop a deliberate designation.
            var away = new FlightVector(0, 1, 0);
            for (var t = 0d; t < 3; t += 1 / 60d)
                LockOnSolver.Step(state, 1 / 60d, true, Origin, away, candidates, out _);
            Assert.That(state.target, Is.EqualTo(1), "manual lock dropped by looking away");
        }

        [Test]
        public void CycleStepsThroughContactsInBearingOrder()
        {
            var state = new LockOnState();
            var candidates = new[] {
                new LockCandidate(7, new FlightVector(400, 0, 400), true),  // off to one side
                new LockCandidate(8, new FlightVector(0, 0, 500), true)     // dead ahead
            };
            Assert.That(LockOnSolver.Cycle(state, Origin, Forward, candidates), Is.EqualTo(8),
                "most nearly ahead should come first");
            Assert.That(LockOnSolver.Cycle(state, Origin, Forward, candidates), Is.EqualTo(7));
            Assert.That(LockOnSolver.Cycle(state, Origin, Forward, candidates), Is.EqualTo(8),
                "cycle should wrap");
        }

        [Test]
        public void ReleaseOnlyDropsAManualDesignation()
        {
            var soft = new LockOnState();
            Hold(soft, One(0, 400), LockOnSolver.SoftLockDwell * 2);
            Assert.That(LockOnSolver.Release(soft), Is.False, "a soft lock is not released by hand");
            Assert.That(soft.assisted, Is.True);

            var manual = new LockOnState();
            LockOnSolver.Cycle(manual, Origin, Forward, One(0, 400));
            Assert.That(LockOnSolver.Release(manual), Is.True);
            Assert.That(manual.assisted, Is.False);
            Assert.That(manual.manual, Is.False);
        }

        [Test]
        public void DeathClearsEverything()
        {
            var state = new LockOnState();
            Hold(state, One(0, 400), LockOnSolver.SoftLockDwell * 2);
            LockOnSolver.Step(state, 1 / 60d, false, Origin, Forward, One(0, 400), out _);

            Assert.That(state.target, Is.EqualTo(LockOnState.None));
            Assert.That(state.assisted, Is.False);
            Assert.That(state.manual, Is.False);
            Assert.That(state.hoverTime, Is.EqualTo(0));
        }

        [Test]
        public void NothingBeyondAcquisitionRangeIsPicked()
        {
            var state = new LockOnState();
            Assert.That(
                LockOnSolver.PickTarget(state, Origin, Forward,
                    One(0, LockOnSolver.TargetRange + 10)),
                Is.EqualTo(LockOnState.None));
        }
    }
}
