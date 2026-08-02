using AirbourneArena.Flight;
using UnityEngine;

namespace AirbourneArena.VerticalSlice
{
    [RequireComponent(typeof(Camera))]
    public sealed class ChaseCamera : MonoBehaviour
    {
        [SerializeField, Range(0, 2)] int cameraMode;
        [SerializeField] bool reduceMotion;
        [SerializeField] float groundHeight;
        Transform target;
        UnityFlightBody targetBody;
        Camera flightCamera;
        Vector3 lookPoint;
        float zoom;
        bool lookReady;

        /// The pilot's mouse gain scales with this, exactly as it does in the
        /// browser — see PlayerFlightController.ZoomGain.
        public float Zoom => zoom;

        public void Follow(Transform subject)
        {
            target = subject;
            targetBody = subject ? subject.GetComponent<UnityFlightBody>() : null;
            lookReady = false;
            RenderRig(0, true);
        }

        void Awake() => flightCamera = GetComponent<Camera>();

        void Update()
        {
            if (Input.GetKeyDown(KeyCode.C))
            {
                cameraMode = (cameraMode + 1) % 3;
                lookReady = false;
            }
            var zoomHeld = Input.GetMouseButton(1) ||
                Input.GetKey(KeyCode.JoystickButton4) || Input.GetKey(KeyCode.Z);
            // Canonical: zoom.k += ((zoom.on?1:0) - zoom.k) * Math.min(1, dt*7)
            // — an exponential approach, not a linear one. MoveTowards at 4.5
            // crossed the same distance on a straight line, which reads as the
            // gunsight snapping rather than settling, and took a different
            // amount of time to get there.
            zoom += ((zoomHeld ? 1 : 0) - zoom) * Mathf.Min(1, Time.deltaTime * 7);
        }

        void LateUpdate()
        {
            RenderRig(Time.deltaTime, false);
        }

        void RenderRig(float dt, bool snap)
        {
            if (!target) return;
            // Hold the last readable impact composition. Following the hidden
            // airframe down to its terrain-clearance point put the camera four
            // metres above the ground and filled the failure screen with road
            // and terrain geometry.
            if (!snap && targetBody && targetBody.LifeState == FlightLifeState.Rebuilding)
                return;
            if (!flightCamera) flightCamera = GetComponent<Camera>();
            var right = target.right;
            var up = target.up;
            var forward = target.forward;
            var bank = Mathf.Atan2(-right.y, up.y);
            var turnPivot = cameraMode == 2 || reduceMotion
                ? 0 : Smooth(.30f, 1.18f, Mathf.Abs(bank));
            Vector3 offset;
            if (cameraMode == 0)
                offset = new Vector3(-Mathf.Sin(bank) * 5.2f * turnPivot,
                    6.5f, 26 + turnPivot * 4.5f);
            else if (cameraMode == 1)
                offset = new Vector3(-Mathf.Sin(bank) * 2.7f * turnPivot,
                    3.6f, 14 + turnPivot * 2.2f);
            else offset = new Vector3(0, 1.5f, .6f);

            Vector3 wantedPosition;
            if (cameraMode == 2) wantedPosition = target.TransformPoint(offset);
            else
            {
                var flatRight = Vector3.Cross(forward, Vector3.up);
                if (flatRight.sqrMagnitude < .001f)
                    flatRight = new Vector3(right.x, 0, right.z);
                flatRight.Normalize();
                wantedPosition = target.position + flatRight * offset.x +
                    Vector3.up * offset.y - forward * offset.z;
            }
            var positionBlend = snap || cameraMode == 2 ? 1 : 1 - Mathf.Pow(.0012f, dt);
            transform.position = Vector3.Lerp(transform.position, wantedPosition, positionBlend);
            var cameraGround = (float)StarterCoastTerrain.Ground(
                transform.position.x, transform.position.z);
            if (transform.position.y < cameraGround + 4)
                transform.position = new Vector3(transform.position.x, cameraGround + 4,
                    transform.position.z);

            var lookDistance = cameraMode == 2 ? 60 : cameraMode == 0 ? 38 : 30;
            var wantedLook = target.position + forward * lookDistance;
            if (cameraMode != 2)
            {
                var subjectGround = (float)StarterCoastTerrain.Ground(
                    target.position.x, target.position.z);
                var altitude = Mathf.Max(0, target.position.y - subjectGround);
                wantedLook.y -= 3 + Smooth(180, 1100, altitude) * 22;
            }
            if (turnPivot > 0)
                wantedLook += right * (Mathf.Sin(bank) * 12 * turnPivot);
            if (snap || !lookReady)
            {
                lookPoint = wantedLook;
                lookReady = true;
            }
            else lookPoint = Vector3.Lerp(lookPoint, wantedLook, 1 - Mathf.Pow(.018f, dt));

            var cameraUp = Vector3.Lerp(Vector3.up, up,
                cameraMode == 2 ? 1 : .18f + turnPivot * .10f).normalized;
            transform.rotation = Quaternion.LookRotation(lookPoint - transform.position, cameraUp);
            var targetFov = 70 + (cameraMode == 2 ? 0 : turnPivot * 6) - zoom * 30;
            flightCamera.fieldOfView = snap ? targetFov : Mathf.Lerp(
                flightCamera.fieldOfView, targetFov, Mathf.Min(1, dt * 4.5f));
        }

        static float Smooth(float low, float high, float value)
        {
            var t = Mathf.Clamp01((value - low) / (high - low));
            return t * t * (3 - 2 * t);
        }
    }
}
