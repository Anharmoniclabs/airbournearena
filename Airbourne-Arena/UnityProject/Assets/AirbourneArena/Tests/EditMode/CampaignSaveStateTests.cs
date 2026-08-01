using System.Collections.Generic;
using AirbourneArena.Campaign;
using NUnit.Framework;

namespace AirbourneArena.Tests
{
    public sealed class CampaignSaveStateTests
    {
        [Test]
        public void InterpreterSaveRoundTripPreservesStoryChoicesAndProgress()
        {
            var state = new CampaignSaveState();
            var value = state.ToInterpreterSave();
            value["mission"] = "ch4_m2";
            value["chapter"] = 4d;
            value["credits"] = 900d;
            value["unity"] = 22d;
            ((List<object>)value["completed"]).Add("ch1_m1");
            ((Dictionary<string, object>)value["flags"])["savedShuttle"] = true;
            ((Dictionary<string, object>)value["flags"])["fragment"] = "share";
            ((Dictionary<string, object>)value["trust"])["nyx"] = 20d;

            state.Capture(value);
            var restored = state.ToInterpreterSave();

            Assert.That(restored["mission"], Is.EqualTo("ch4_m2"));
            Assert.That(restored["chapter"], Is.EqualTo(4d));
            Assert.That(restored["credits"], Is.EqualTo(900d));
            Assert.That(restored["unity"], Is.EqualTo(22d));
            Assert.That((List<object>)restored["completed"], Contains.Item("ch1_m1"));
            Assert.That(((Dictionary<string, object>)restored["flags"])["savedShuttle"], Is.True);
            Assert.That(((Dictionary<string, object>)restored["flags"])["fragment"], Is.EqualTo("share"));
            Assert.That(((Dictionary<string, object>)restored["trust"])["nyx"], Is.EqualTo(20d));
        }
    }
}
