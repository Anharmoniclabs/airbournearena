using AirbourneArena.Flight;
using UnityEngine;

namespace AirbourneArena.VerticalSlice
{
    public sealed class VerticalSliceBootstrap : MonoBehaviour
    {
        [Header("Authored assets — required")]
        [SerializeField] GameObject playerAircraftPrefab;
        [SerializeField] GameObject worldPrefab;
        [SerializeField] GameObject practiceDronePrefab;
        [SerializeField] GameObject navigationGatePrefab;

        [Header("Runtime")]
        [SerializeField] ChaseCamera chaseCamera;
        [SerializeField] SliceHud hud;

        void Awake()
        {
            if (!playerAircraftPrefab || !worldPrefab || !practiceDronePrefab ||
                !navigationGatePrefab || !chaseCamera || !hud)
            {
                Debug.LogError("Vertical slice requires authored aircraft/world/drone/gate prefabs, camera, and HUD.");
                enabled = false;
                return;
            }

            Instantiate(worldPrefab, Vector3.zero, Quaternion.identity);
            var player = Instantiate(playerAircraftPrefab, new Vector3(-2500, 520, 0),
                Quaternion.LookRotation(Vector3.right, Vector3.up));
            var body = player.GetComponent<UnityFlightBody>() ?? player.AddComponent<UnityFlightBody>();
            var controller = player.GetComponent<PlayerFlightController>() ??
                player.AddComponent<PlayerFlightController>();
            var guns = player.GetComponent<AircraftGuns>() ?? player.AddComponent<AircraftGuns>();
            var mission = gameObject.AddComponent<FirstFlightMission>();
            mission.Initialize(body, guns, practiceDronePrefab, navigationGatePrefab);
            chaseCamera.Follow(player.transform);
            hud.Initialize(body, controller, guns, mission);
        }
    }
}
