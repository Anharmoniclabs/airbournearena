using System;
using System.Collections.Generic;
using AirbourneArena.Campaign;
using NUnit.Framework;
using UnityEngine;

namespace AirbourneArena.Tests
{
    public sealed class CampaignRuntimeTests
    {
        CampaignDocument document;

        [SetUp]
        public void SetUp()
        {
            var source = Resources.Load<TextAsset>("missions");
            Assert.That(source, Is.Not.Null, "Generated Resources/missions.json is missing.");
            document = CampaignDocument.Parse(source.text);
        }

        [Test]
        public void CanonicalExportContainsAllThirtyTwoMissions()
        {
            Assert.That(document.SchemaVersion, Is.EqualTo(1));
            Assert.That(document.MissionCount, Is.EqualTo(32));
            Assert.That(CampaignDocument.RequireString(document.Mission("ch1_m1"), "title"),
                Is.EqualTo("FIRST FLIGHT"));
            Assert.That(CampaignDocument.RequireString(document.Mission("ch6_m5"), "title"),
                Is.EqualTo("THE WARDEN CORE"));
        }

        [Test]
        public void FirstFlightExecutesCanonicalDialogueAndFiveGates()
        {
            var runtime = new RecordingPrimitives();
            var interpreter = new CampaignInterpreter(runtime, 7);
            var mission = document.Mission("ch1_m1");
            interpreter.Execute(Program(mission, "intro"), Globals());
            var objectives = CampaignDocument.RequireList(mission, "objectives");
            var first = (Dictionary<string, object>)objectives[0];
            interpreter.Execute(Program(first, "setup"), Globals());

            Assert.That(runtime.Dialogue.Count, Is.EqualTo(2));
            Assert.That(runtime.Dialogue[0],
                Does.Contain("Kestrel is fuelled. Take her up and stay off my roof."));
            Assert.That(runtime.Gates.Count, Is.EqualTo(5));
            Assert.That(runtime.Gates[0].X, Is.EqualTo(-1900).Within(.0001));
            Assert.That(runtime.Gates[0].Y, Is.EqualTo(620).Within(.0001));
            Assert.That(runtime.Gates[0].Z, Is.EqualTo(260).Within(.0001));
        }

        [Test]
        public void AllTopLevelMissionProgramsSmokeExecute()
        {
            foreach (var rawMission in document.Missions)
            {
                var mission = (Dictionary<string, object>)rawMission;
                var id = CampaignDocument.RequireString(mission, "id");
                var runtime = new RecordingPrimitives();
                var interpreter = new CampaignInterpreter(runtime, 17);
                foreach (var key in new[] { "intro", "start", "reward", "finale" })
                    ExecuteIfProgram(interpreter, mission, key, id);
                foreach (var rawObjective in CampaignDocument.RequireList(mission, "objectives"))
                {
                    var objective = (Dictionary<string, object>)rawObjective;
                    foreach (var key in new[] { "text", "setup", "step", "done", "fail" })
                        ExecuteIfProgram(interpreter, objective, key, id);
                }
            }
        }

        [Test]
        public void CanonicalEndingBranchesRemainAvailable()
        {
            Assert.That(CampaignEndingResolver.Decide("break", 0, 0, 0, 0, null,
                false, "blue").Title, Is.EqualTo("INDEPENDENT SKYWAYS"));
            Assert.That(CampaignEndingResolver.Decide("council", 40, 2, 0, 0, null,
                true, "blue").Title, Is.EqualTo("UNITED SKIES"));
            Assert.That(CampaignEndingResolver.Decide("council", 0, 0, 0, 0, null,
                false, "blue").Title, Is.EqualTo("A COUNCIL, OF SORTS"));
            Assert.That(CampaignEndingResolver.Decide("faction", 0, 0, 0, 20, "veyr",
                false, "blue").Title, Is.EqualTo("THE QUIET SKY"));
            Assert.That(CampaignEndingResolver.Decide("faction", 0, 0, 0, 0, null,
                false, "blue").Title, Is.EqualTo("VANGUARD ASCENDANCY"));
            Assert.That(CampaignEndingResolver.Decide("faction", 0, 0, 0, 0, null,
                false, "red").Title, Is.EqualTo("INFERNO ASCENDANCY"));
            Assert.That(CampaignEndingResolver.Decide(null, 0, 0, 40, 0, null,
                false, "blue").Title, Is.EqualTo("A LIMITED NETWORK"));
        }

        void ExecuteIfProgram(CampaignInterpreter interpreter,
            Dictionary<string, object> owner, string key, string missionId)
        {
            if (!owner.TryGetValue(key, out var value) ||
                value is not Dictionary<string, object> program ||
                !program.TryGetValue("op", out var op) || (string)op != "program")
                return;
            var parameters = program.TryGetValue("params", out var rawParameters)
                ? (List<object>)rawParameters
                : new List<object>();
            var args = new object[parameters.Count];
            for (var i = 0; i < args.Length; i++) args[i] = .016;
            Assert.DoesNotThrow(() => interpreter.Execute(program, Globals(), args),
                $"{missionId}.{key}");
        }

        static Dictionary<string, object> Program(Dictionary<string, object> owner,
            string key) => (Dictionary<string, object>)owner[key];

        static IDictionary<string, object> Globals()
        {
            var globals = CampaignInterpreter.CreateStandardGlobals();
            var flags = new Dictionary<string, object>();
            var save = new Dictionary<string, object>
            {
                ["flags"] = flags,
                ["credits"] = 0d,
                ["unity"] = 0d,
                ["trials"] = new Dictionary<string, object>(),
                ["trust"] = new Dictionary<string, object> { ["nyx"] = 0d },
                ["loadout"] = new Dictionary<string, object> { ["power"] = null }
            };
            globals["SAVE"] = save;
            globals["mission"] = new Dictionary<string, object>
            {
                ["t"] = 100d,
                ["choice"] = "council",
                ["obj"] = new Dictionary<string, object>()
            };
            globals["player"] = new Dictionary<string, object>
            {
                ["pos"] = new CampaignVector3(0, 700, 0),
                ["hp"] = 100d,
                ["team"] = "blue",
                ["alive"] = true
            };
            globals["BREAKWATER"] = new CampaignVector3(0, 700, 0);
            globals["PILOT"] = new Dictionary<string, object>
            {
                ["signed"] = true,
                ["faction"] = "vanguard"
            };
            globals["TRUST_KEYS"] = new List<object> { "aras", "mercer", "serrano", "nyx" };
            globals["core"] = new Dictionary<string, object>
            {
                ["carrier"] = null,
                ["lockout"] = 0d,
                ["charge"] = 0d,
                ["pos"] = new CampaignVector3(0, 700, 0),
                ["vel"] = new CampaignVector3(0, 0, 0)
            };
            globals["coreGroup"] = new Dictionary<string, object> { ["visible"] = false };
            globals["st"] = new Dictionary<string, object>
            {
                ["mode"] = "campaign", ["over"] = false, ["phase"] = 0d,
                ["scoreB"] = 0d, ["scoreR"] = 0d
            };
            globals["convoy"] = new List<object> {
                new Dictionary<string, object> { ["alive"] = true, ["passive"] = false }
            };
            globals["gates"] = new List<object>();
            globals["sh"] = new Dictionary<string, object>
            {
                ["alive"] = true, ["pos"] = new CampaignVector3(0, 700, 0)
            };
            globals["wxKey"] = "clear";
            globals["wxTimer"] = 0d;
            return globals;
        }

        sealed class RecordingPrimitives : ICampaignPrimitives
        {
            public readonly List<string> Dialogue = new();
            public readonly List<CampaignVector3> Gates = new();

            public object Invoke(string name, IReadOnlyList<object> arguments)
            {
                switch (name)
                {
                    case "say":
                        Dialogue.Add($"{arguments[0]}: {arguments[1]}");
                        return null;
                    case "makeGate":
                        Gates.Add(new CampaignVector3(ToNumber(arguments[0]),
                            ToNumber(arguments[1]), ToNumber(arguments[2])));
                        return null;
                    case "spawnFlier":
                    case "makeSite":
                    case "namedFlier":
                        return new Dictionary<string, object>
                        {
                            ["alive"] = true,
                            ["pos"] = new CampaignVector3(0, 700, 0)
                        };
                    case "hostilesLeft":
                    case "gatesLeft":
                    case "sitesLeft":
                    case "sitesToWork":
                    case "sitesWorked":
                    case "convoyAlive":
                        return 0d;
                    case "convoyArrived":
                    case "allWorked":
                        return true;
                    case "factionKey":
                        return "vanguard";
                    case "radioBusy":
                        return false;
                    case "openChoice":
                        return null;
                    case "decideEnding":
                        return new Dictionary<string, object>
                        {
                            ["title"] = "UNITED SKIES", ["text"] = "Ending"
                        };
                    default:
                        return null;
                }
            }

            static double ToNumber(object value) => Convert.ToDouble(value);
        }
    }
}
