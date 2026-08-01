using UnityEngine;

namespace AirbourneArena.UI
{
    public sealed class HangarWalker : MonoBehaviour
    {
        const float AircraftCollisionRadius = 8.4f;
        const float AircraftInteractionRadius = 13f;
        static readonly Vector3 VanguardBay = new Vector3(-17, 0, -9);
        static readonly Vector3 InfernoBay = new Vector3(17, 0, -9);
        static readonly Vector3 CampaignBoard = new Vector3(0, 0, -33.2f);

        [SerializeField] Transform avatar;
        [SerializeField] Animator animator;
        [SerializeField] HangarUiController hangarUi;
        [SerializeField] float walkSpeed = 2.8f;
        [SerializeField] float runSpeed = 5.2f;
        [SerializeField] float lookSensitivity = .16f;

        float yaw;
        float pitch;
        bool mouseLookArmed;
        void Start()
        {
            if (!hangarUi) hangarUi = FindObjectOfType<HangarUiController>();
            Cursor.lockState = CursorLockMode.None;
            Cursor.visible = true;
            if (avatar)
            {
                avatar.position = new Vector3(0, 0, 26);
                avatar.rotation = Quaternion.identity;
            }
            Play("Idle");
        }

        void Update()
        {
            if (!avatar) return;
            // The HTML game captures free-look from a normal click on the
            // canvas. Keep the bottom UI clickable and retain right-click as
            // an alternate gesture, but never require it.
            var pointerOverBottomControls = Input.mousePosition.y < 78;
            var canArmLook = hangarUi == null || !hangarUi.HasOpenOverlay;
            if ((Input.GetMouseButtonDown(1) ||
                 (Input.GetMouseButtonDown(0) && !pointerOverBottomControls)) && canArmLook)
            {
                mouseLookArmed = true;
                Cursor.lockState = CursorLockMode.Locked;
                Cursor.visible = false;
            }
            if (Input.GetKeyDown(KeyCode.Escape))
            {
                mouseLookArmed = false;
                Cursor.lockState = CursorLockMode.None;
                Cursor.visible = true;
            }
            // Embedded WebGL players may refuse pointer lock. Once the pilot
            // deliberately clicks the view, relative deltas still provide a
            // useful bounded fallback until Escape is pressed.
            if ((Cursor.lockState == CursorLockMode.Locked || mouseLookArmed) && canArmLook)
            {
                // Unity normalizes legacy Mouse Y to positive-up, including
                // in WebGL. Positive pitch is look-up in this camera rig.
                yaw -= Input.GetAxisRaw("Mouse X") * lookSensitivity;
                pitch = Mathf.Clamp(pitch + Input.GetAxisRaw("Mouse Y") *
                    lookSensitivity, -77, 77);
            }
            // Read PC keys explicitly. The legacy Horizontal axis can be
            // inverted by a local Input Manager override, which is exactly
            // what the recorded D-left / A-right failure exposed.
            var keyboard = new Vector2(
                KeyAxis(Input.GetKey(KeyCode.A) || Input.GetKey(KeyCode.LeftArrow),
                    Input.GetKey(KeyCode.D) || Input.GetKey(KeyCode.RightArrow)),
                KeyAxis(Input.GetKey(KeyCode.S) || Input.GetKey(KeyCode.DownArrow),
                    Input.GetKey(KeyCode.W) || Input.GetKey(KeyCode.UpArrow)));
            var input = keyboard.sqrMagnitude > 0
                ? keyboard
                : new Vector2(Input.GetAxisRaw("Horizontal"),
                    Input.GetAxisRaw("Vertical"));
            var movement = MovementForInput(input, yaw);
            var running = Input.GetKey(KeyCode.LeftShift) || Input.GetKey(KeyCode.RightShift);
            avatar.position += movement * (running ? runSpeed : walkSpeed) * Time.deltaTime;
            var position = avatar.position;
            position.x = Mathf.Clamp(position.x, -43.6f, 43.6f);
            position.z = Mathf.Clamp(position.z, -31.6f, 31);
            ResolveAircraftCollision(ref position, VanguardBay);
            ResolveAircraftCollision(ref position, InfernoBay);
            avatar.position = position;
            if (movement.sqrMagnitude > .001f)
            {
                avatar.rotation = Quaternion.Slerp(avatar.rotation,
                    Quaternion.LookRotation(-movement), Time.deltaTime * 12);
                Play(running ? "Run" : "Walk");
            }
            else Play("Idle");
            var view = Quaternion.Euler(pitch, yaw, 0) * Vector3.back;
            transform.position = avatar.position - view * 4.6f + Vector3.up * 3.35f;
            transform.rotation = Quaternion.LookRotation(view, Vector3.up);

            var faction = NearestAircraftFaction(avatar.position);
            hangarUi?.ShowAircraftPrompt(faction);
            if (Input.GetKeyDown(KeyCode.E))
            {
                if (!string.IsNullOrEmpty(faction)) hangarUi?.OpenAircraftFit(faction);
                else if (HorizontalDistance(avatar.position, CampaignBoard) < 11)
                    hangarUi?.OpenCampaign();
            }
            if (Input.GetKeyDown(KeyCode.F)) hangarUi?.OpenFit();
            if (Input.GetKeyDown(KeyCode.Return)) hangarUi?.LaunchFlight();
        }

        public static Vector3 MovementForInput(Vector2 input, float yawDegrees)
        {
            var angle = yawDegrees * Mathf.Deg2Rad;
            var forward = new Vector3(-Mathf.Sin(angle), 0, -Mathf.Cos(angle));
            var right = new Vector3(-forward.z, 0, forward.x);
            return Vector3.ClampMagnitude(forward * input.y + right * input.x, 1);
        }

        public static float KeyAxis(bool negativeHeld, bool positiveHeld) =>
            (positiveHeld ? 1 : 0) - (negativeHeld ? 1 : 0);

        public static string NearestAircraftFaction(Vector3 position)
        {
            var vanguard = HorizontalDistance(position, VanguardBay);
            var inferno = HorizontalDistance(position, InfernoBay);
            if (vanguard < AircraftInteractionRadius && vanguard <= inferno)
                return "vanguard";
            return inferno < AircraftInteractionRadius ? "inferno" : string.Empty;
        }

        static void ResolveAircraftCollision(ref Vector3 position, Vector3 bay)
        {
            var offset = new Vector2(position.x - bay.x, position.z - bay.z);
            var distance = offset.magnitude;
            if (distance >= AircraftCollisionRadius || distance <= .001f) return;
            offset *= AircraftCollisionRadius / distance;
            position.x = bay.x + offset.x;
            position.z = bay.z + offset.y;
        }

        static float HorizontalDistance(Vector3 left, Vector3 right) =>
            Vector2.Distance(new Vector2(left.x, left.z), new Vector2(right.x, right.z));

        void Play(string clip)
        {
            if (animator && !animator.GetCurrentAnimatorStateInfo(0).IsName(clip))
                animator.CrossFade(clip, .18f);
        }
    }
}
