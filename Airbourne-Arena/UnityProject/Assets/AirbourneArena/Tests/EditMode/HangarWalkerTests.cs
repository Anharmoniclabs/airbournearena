using AirbourneArena.UI;
using NUnit.Framework;
using UnityEngine;

namespace AirbourneArena.Tests.EditMode
{
    public sealed class HangarWalkerTests
    {
        [Test]
        public void CanonicalKeyboardDirectionsFaceIntoHangarAtSpawn()
        {
            Assert.That(Vector3.Distance(HangarWalker.MovementForInput(Vector2.up, 0),
                Vector3.back), Is.LessThan(.0001f));
            Assert.That(Vector3.Distance(HangarWalker.MovementForInput(Vector2.right, 0),
                Vector3.right), Is.LessThan(.0001f));
        }

        [Test]
        public void MovementRemainsCameraRelativeAfterTurningRight()
        {
            Assert.That(Vector3.Distance(HangarWalker.MovementForInput(Vector2.up, -90),
                Vector3.right), Is.LessThan(.0001f));
        }

        [Test]
        public void ExplicitPcKeysCannotInheritAnInvertedLegacyAxis()
        {
            Assert.That(HangarWalker.KeyAxis(false, true), Is.EqualTo(1),
                "D/right must always be the positive strafe direction.");
            Assert.That(HangarWalker.KeyAxis(true, false), Is.EqualTo(-1),
                "A/left must always be the negative strafe direction.");
            Assert.That(HangarWalker.KeyAxis(true, true), Is.Zero);
        }

        [Test]
        public void AircraftInteractionUsesTheCanonicalThirteenMetreBayRadius()
        {
            Assert.That(HangarWalker.NearestAircraftFaction(new Vector3(-17, 0, 3.9f)),
                Is.EqualTo("vanguard"));
            Assert.That(HangarWalker.NearestAircraftFaction(new Vector3(17, 0, 3.9f)),
                Is.EqualTo("inferno"));
            Assert.That(HangarWalker.NearestAircraftFaction(new Vector3(0, 0, 26)),
                Is.Empty);
        }
    }
}
