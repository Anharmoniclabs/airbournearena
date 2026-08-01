using UnityEngine;

namespace AirbourneArena.Flight
{
    [DefaultExecutionOrder(-100)]
    [RequireComponent(typeof(UnityFlightBody))]
    public sealed class PlayerFlightController : MonoBehaviour
    {
        [SerializeField] Camera aimCamera;
        [SerializeField, Range(20, 120)] float mouseSensitivity = 65;
        [SerializeField] bool invertY;
        [SerializeField] bool capturePointerOnClick = true;

        public const float AimRadius = 0.55f;
        const double BurnerDrain = 1.0 / 5.0;
        const double BurnerRecharge = 1.0 / 8.0;
        const double BurnerCoolTime = 0.9;
        const double BurnerRelight = 0.18;
        const double RollDuration = 1.05;
        const double RollCooldown = 3.4;
        const double RollMultiplier = 1.35;

        UnityFlightBody body;
        VerticalSlice.ChaseCamera chaseCamera;
        Vector2 aim;
        /// Canonical: respawnFighter sets f.throttle = .85, so the aircraft
        /// launches with headroom and W is a live control. Starting at 1 made
        /// the throttle key do nothing at all — the aircraft was already at
        /// military power and only the burner could add anything, which is
        /// exactly why the accelerator felt dead.
        double throttle = .85;
        double burnerFuel = 1;
        double burnerCool;
        double turnHold;
        double rollTime;
        double rollCooldown;
        int turnDirection;
        int rollDirection;
        bool burnerLit;
        bool idleHeld;
        bool mouseSeen;
        bool pointerArmed;
        int pointerSettleFrames;

        public Vector2 Aim => aim;

        FlightVector aimWorldDirection;
        bool aimDirectionValid;
        /// The reticle's world direction, or the airframe's own forward before
        /// the first steered frame. Never a zero vector, so callers can dot
        /// against it without guarding.
        public FlightVector AimWorldDirection => aimDirectionValid
            ? aimWorldDirection
            : new FlightVector(transform.forward.x, transform.forward.y, transform.forward.z);
        public double Throttle => throttle;
        public double BurnerFuel => burnerFuel;
        public bool BurnerLit => burnerLit;
        public bool PointerReady => pointerArmed || Cursor.lockState == CursorLockMode.Locked;

        float CameraZoom => chaseCamera ? chaseCamera.Zoom : 0;

        void Awake()
        {
            body = GetComponent<UnityFlightBody>();
            if (!aimCamera) aimCamera = Camera.main;
            if (aimCamera) chaseCamera = aimCamera.GetComponent<VerticalSlice.ChaseCamera>();
            mouseSensitivity = PlayerPrefs.GetInt("airbourne.sensitivity",
                Mathf.RoundToInt(mouseSensitivity));
            invertY = PlayerPrefs.GetInt("airbourne.invertY", invertY ? 1 : 0) != 0;
        }

        void Update()
        {
            var dt = Time.deltaTime;
            UpdatePointer();
            UpdateThrottle(dt);
            UpdateBarrelRoll(dt);
            var controls = ReadPilotIntent(dt);
            if (rollTime > 0)
            {
                controls.roll = rollDirection;
                controls.rollMultiplier = RollMultiplier;
                controls.pitch = Mathf.Clamp((float)(controls.pitch * 0.2 + 0.40), -1, 1);
            }
            body.SetControls(controls, burnerFuel, burnerLit);
        }

        void UpdatePointer()
        {
            if (capturePointerOnClick && Input.GetMouseButtonDown(0))
            {
                pointerArmed = true;
                pointerSettleFrames = 3;
                aim = Vector2.zero;
                mouseSeen = true;
                Cursor.lockState = CursorLockMode.Locked;
                Cursor.visible = false;
            }
            if (Input.GetKeyDown(KeyCode.Escape))
            {
                pointerArmed = false;
                aim = Vector2.zero;
                mouseSeen = false;
                Cursor.lockState = CursorLockMode.None;
                Cursor.visible = true;
            }
            var mouseDelta = new Vector2(Input.GetAxisRaw("Mouse X"), Input.GetAxisRaw("Mouse Y"));
            // A launch-button click can move the unlocked browser cursor over
            // the canvas during the scene transition. Do not turn that into a
            // full-stick command. Mouse flight begins only after a deliberate
            // click in this scene.
            if (pointerSettleFrames > 0)
            {
                pointerSettleFrames--;
                return;
            }
            if (pointerArmed && mouseDelta.sqrMagnitude > 0.000001f)
            {
                mouseSeen = true;
                if (Cursor.lockState == CursorLockMode.Locked)
                {
                    aim = AccumulateAim(aim, mouseDelta, mouseSensitivity, invertY, CameraZoom);
                }
                else if (aimCamera)
                {
                    // Embedded WebGL frames can refuse pointer lock. Match the
                    // HTML fallback by mapping the cursor across the canvas.
                    var rect = aimCamera.pixelRect;
                    var pointer = (Vector2)Input.mousePosition;
                    aim.x = ((pointer.x - rect.x) / rect.width * 2 - 1) * AimRadius;
                    aim.y = ((pointer.y - rect.y) / rect.height * 2 - 1) *
                        AimRadius * (invertY ? -1 : 1);
                    // A corner of the canvas is AimRadius on both axes, which is
                    // outside the circle the reticle is allowed to occupy.
                    aim = ClampAim(aim);
                }
            }
        }

        void UpdateThrottle(double dt)
        {
            if (Input.GetKey(KeyCode.W)) throttle = Clamp01(throttle + dt * .55);
            if (Input.GetKey(KeyCode.S)) throttle = Clamp01(throttle - dt * .55);
            var wantsBurner = Input.GetKey(KeyCode.LeftShift) || Input.GetKey(KeyCode.RightShift);
            if (Input.GetKey(KeyCode.LeftControl) || Input.GetKey(KeyCode.RightControl))
            {
                wantsBurner = false;
                idleHeld = true;
            }
            else idleHeld = false;
            if (wantsBurner && !burnerLit && burnerFuel > BurnerRelight) burnerLit = true;
            if (!wantsBurner || burnerFuel <= 0) burnerLit = false;
            if (burnerLit)
            {
                burnerFuel = Clamp01(burnerFuel - dt * BurnerDrain);
                burnerCool = BurnerCoolTime;
                if (burnerFuel <= 0) burnerLit = false;
            }
            else if (wantsBurner) burnerCool = BurnerCoolTime;
            else if (burnerCool > 0) burnerCool -= dt;
            else burnerFuel = Clamp01(burnerFuel + dt * BurnerRecharge);
        }

        void UpdateBarrelRoll(double dt)
        {
            rollCooldown = System.Math.Max(0, rollCooldown - dt);
            if (rollTime > 0) rollTime = System.Math.Max(0, rollTime - dt);
            if (rollCooldown > 0 || rollTime > 0 || body.State.velocity.Length < 70) return;
            if (Input.GetKeyDown(KeyCode.Q)) StartBarrelRoll(1);
            else if (Input.GetKeyDown(KeyCode.E)) StartBarrelRoll(-1);
        }

        void StartBarrelRoll(int direction)
        {
            rollDirection = direction;
            rollTime = RollDuration;
            rollCooldown = RollCooldown;
        }

        FlightControls ReadPilotIntent(double dt)
        {
            var state = body.State;
            var turn = (Input.GetKey(KeyCode.D) || Input.GetKey(KeyCode.RightArrow) ? 1 : 0) -
                (Input.GetKey(KeyCode.A) || Input.GetKey(KeyCode.LeftArrow) ? 1 : 0);
            var pitch = (Input.GetKey(KeyCode.UpArrow) ? 1 : 0) -
                (Input.GetKey(KeyCode.DownArrow) ? 1 : 0);
            var commandedThrottle = idleHeld ? 0 : burnerLit ? 1 : throttle;
            if (turn != 0 || pitch != 0)
            {
                if (turn != 0 && turn == turnDirection)
                    turnHold = System.Math.Min(1, turnHold + dt / FlightControlSolver.TurnRamp);
                else turnHold = 0;
                turnDirection = turn;
                return FlightControlSolver.Keyboard(state, turn, pitch, turnHold,
                    invertY ? -1 : 1, commandedThrottle, burnerLit);
            }

            turnHold = 0;
            turnDirection = 0;
            var stick = new Vector2(PadAxis(Input.GetAxisRaw("FlightAimX")),
                PadAxis(Input.GetAxisRaw("FlightAimY")));
            if (stick.sqrMagnitude > 0)
            {
                aim = Vector2.ClampMagnitude(stick, 1) * AimRadius;
                mouseSeen = true;
            }
            if (!mouseSeen || !aimCamera)
                return FlightControlSolver.WingsLevel(state, commandedThrottle, burnerLit);

            var sourceDirection = AimDirection(state, aim,
                aimCamera.transform.right, aimCamera.transform.up,
                aimCamera.fieldOfView, aimCamera.aspect);
            // Target acquisition scores off this, not the nose — see
            // LockOnSolver.PickTarget. Published here because it is already
            // computed once a frame and the gun must read the same reticle the
            // player can see, in the same frame it was steered with.
            aimWorldDirection = sourceDirection;
            aimDirectionValid = true;
            var controls = FlightControlSolver.SteerTo(state, sourceDirection,
                2.2, true, commandedThrottle, burnerLit);
            controls.pitch *= .95;
            controls.roll *= .97;
            return controls;
        }

        static double Clamp01(double value) => System.Math.Max(0, System.Math.Min(1, value));

        static float PadAxis(float value)
        {
            const float deadZone = .16f;
            return Mathf.Abs(value) < deadZone ? 0 :
                (value - Mathf.Sign(value) * deadZone) / (1 - deadZone);
        }

        /// Canonical: 31-input.js
        ///     aim.x += e.movementX * mouseSens();
        ///     aim.y -= e.movementY * mouseSens() * st.invertY;
        /// with mouseSens() = (cfg.sens / 100000) * zoomGain()
        /// and  zoomGain() = 1 - zoom.k * 0.62
        ///
        /// Two bugs lived here, and together they made Unity steering feel an
        /// order of magnitude heavier than the browser.
        ///
        /// The InputManager's Mouse X/Y axes were left at Unity's default
        /// sensitivity of 0.1, which scales the raw pixel delta before
        /// GetAxisRaw ever returns it — mouse-type axes apply that multiplier
        /// even to GetAxisRaw. The gain below was then applied on top, so the
        /// same physical mouse movement produced a tenth of the browser's
        /// command. Those axes are now at 1, which is what makes GetAxisRaw
        /// return the same pixel deltas the browser's movementX/Y carry.
        ///
        /// And the .026 clamp was on the wrong quantity. The canonical game
        /// clamps the *accumulated* aim vector to AIM_R, which bounds where the
        /// reticle can sit; it never clamps a single frame's delta. Capping the
        /// delta throttles exactly the fast flick a pilot uses to bring the nose
        /// round, which is the movement that most needs to arrive intact. The
        /// accumulated clamp is applied by the caller, as it is in the browser.
        public static Vector2 MouseAimDelta(Vector2 mouseDelta, float sensitivity,
            bool invertedY, float zoomK = 0)
        {
            var gain = sensitivity / 100000f * ZoomGain(zoomK);
            return new Vector2(mouseDelta.x * gain,
                mouseDelta.y * gain * (invertedY ? -1 : 1));
        }

        /// The accumulate-and-clamp the browser performs inline:
        ///     aim.x += ...; aim.y -= ...;
        ///     if (aim.length() > AIM_R) aim.setLength(AIM_R);
        ///
        /// This is where a pointer-lock spike is actually contained. A frame
        /// that reports a 2000 px jump — a lock transition, an alt-tab, a
        /// compositor stall — moves the reticle straight to the edge of its
        /// circle and no further. The nose then chases the reticle at the
        /// airframe's own rate, so the spike costs a fully deflected stick for
        /// as long as it takes the pilot to pull back, never more. Clamping the
        /// delta instead would also have throttled every fast flick.
        public static Vector2 AccumulateAim(Vector2 aim, Vector2 mouseDelta,
            float sensitivity, bool invertedY, float zoomK = 0) =>
            ClampAim(aim + MouseAimDelta(mouseDelta, sensitivity, invertedY, zoomK));

        public static Vector2 ClampAim(Vector2 aim) =>
            aim.magnitude > AimRadius ? aim.normalized * AimRadius : aim;

        /// Narrowing the field of view without narrowing the mouse gain makes
        /// the reticle travel the same angle across a third of the screen — the
        /// classic "zoom makes it worse" feel. The browser ties the two
        /// together; this had been dropped in the port, so a zoomed Unity pass
        /// was twitchier than an unzoomed one instead of steadier.
        public static float ZoomGain(float zoomK) => 1 - zoomK * .62f;

        public static FlightVector AimDirection(FlightState state, Vector2 reticle,
            Vector3 cameraRight, Vector3 cameraUp, float verticalFieldOfView,
            float aspect)
        {
            // The chase camera pitches down at altitude to keep Starter Coast
            // readable. Projecting the centred reticle through that camera
            // made the first pointer-lock click command an immediate dive.
            // Centre is the airframe's forward direction; reticle displacement
            // still uses the camera's screen-right/up basis and current FOV.
            FlightControlSolver.Axes(state, out var forward, out _, out _);
            var right = UnityFlightBody.ToFlight(cameraRight).Normalized;
            var up = UnityFlightBody.ToFlight(cameraUp).Normalized;
            var verticalScale = System.Math.Tan(verticalFieldOfView *
                System.Math.PI / 360.0);
            var horizontalScale = verticalScale * System.Math.Max(.1, aspect);
            return (forward + right * (reticle.x * horizontalScale) +
                up * (reticle.y * verticalScale)).Normalized;
        }
    }
}
