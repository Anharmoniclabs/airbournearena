using System.Collections.Generic;
using AirbourneArena.Flight;
using UnityEngine;

namespace AirbourneArena.VerticalSlice
{
    public sealed class FirstFlightMission : MonoBehaviour
    {
        public enum Stage { Gates, Drones, Return, Complete }
        static readonly Vector3[] GatePositions = {
            new(-1900,620,260), new(-1400,700,-260), new(-900,780,200),
            new(-500,720,-240), new(-150,660,0)
        };

        readonly List<PracticeTarget> targets = new();
        readonly List<Transform> gates = new();
        UnityFlightBody player;
        GameObject dronePrefab, gatePrefab;
        int gatesRemaining;
        Stage stage;
        static readonly Vector3 Breakwater = new(-2500, 460, 0);

        public Stage CurrentStage => stage;
        public int GatesRemaining => gatesRemaining;
        public int GateCount => GatePositions.Length;
        public float NextGateDistance
        {
            get
            {
                if (!player || stage != Stage.Gates) return 0;
                while (gates.Count > 0 && !gates[0]) gates.RemoveAt(0);
                return gates.Count > 0
                    ? Vector3.Distance(player.transform.position, gates[0].position)
                    : 0;
            }
        }
        public string Objective => stage switch {
            Stage.Gates => $"FLY THE NAVIGATION GATES ({gatesRemaining} LEFT)",
            Stage.Drones => $"DESTROY THE PRACTICE DRONES ({LivingTargets()} LEFT)",
            Stage.Return => "RETURN TO BREAKWATER FIELD",
            _ => "FIRST FLIGHT COMPLETE"
        };

        public void Initialize(UnityFlightBody flightBody, AircraftGuns guns,
            GameObject authoredDronePrefab, GameObject authoredGatePrefab)
        {
            player = flightBody;
            dronePrefab = authoredDronePrefab;
            gatePrefab = authoredGatePrefab;
            gatesRemaining = GatePositions.Length;
            foreach (var position in GatePositions)
            {
                var gate = Instantiate(gatePrefab, position, Quaternion.identity);
                gates.Add(gate.transform);
                var trigger = gate.GetComponent<NavigationGate>() ?? gate.AddComponent<NavigationGate>();
                trigger.Initialize(player, OnGatePassed);
            }
        }

        void Update()
        {
            if (!player) return;
            if (stage == Stage.Drones && LivingTargets() == 0) stage = Stage.Return;
            if (stage == Stage.Return &&
                Vector3.Distance(player.transform.position, Breakwater) < 420)
                stage = Stage.Complete;
        }

        void OnGatePassed()
        {
            gatesRemaining--;
            if (gatesRemaining > 0) return;
            stage = Stage.Drones;
            SpawnDrones();
        }

        void SpawnDrones()
        {
            var positions = new[] {
                new Vector3(-760,700,-300), new Vector3(-540,780,30), new Vector3(-340,620,360)
            };
            foreach (var position in positions)
            {
                var drone = Instantiate(dronePrefab, position, Quaternion.identity);
                var target = drone.GetComponent<PracticeTarget>() ?? drone.AddComponent<PracticeTarget>();
                target.Configure(40);
                targets.Add(target);
            }
        }

        int LivingTargets()
        {
            var alive = 0;
            foreach (var target in targets) if (target && target.Alive) alive++;
            return alive;
        }
    }
}
