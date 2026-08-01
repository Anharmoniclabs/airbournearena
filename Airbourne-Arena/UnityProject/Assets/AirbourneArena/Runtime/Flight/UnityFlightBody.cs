using UnityEngine;

namespace AirbourneArena.Flight
{
    public enum FlightLifeState
    {
        Airborne,
        Rebuilding
    }

    public sealed class UnityFlightBody : MonoBehaviour
    {
        public const double LaunchTrimAlpha = 0.055;
        [SerializeField] double initialSpeed = 185;
        [SerializeField] bool acceptExternalControls = true;
        [SerializeField] double rebuildDelay = 10;

        readonly FlightModel model = new FlightModel();
        FlightState state;
        FlightControls controls;
        FlightVector spawnPosition;
        FlightQuaternion spawnOrientation;
        Renderer[] renderers;
        Collider[] colliders;
        Rigidbody flightRigidbody;
        double burnerFuel = 1;
        double rebuildRemaining;
        bool burnerLit;
        bool hasControls;

        public FlightState State => state;
        public Vector3 WorldVelocity => ToUnity(state.velocity);
        /// The simulated position, which is what the gunnery solver has to work
        /// from — transform.position is the same value, but only after this
        /// frame's Update has written it.
        public Vector3 WorldPosition => ToUnity(state.position);
        public double BurnerFuel => burnerFuel;
        public bool BurnerLit => burnerLit;
        public FlightLifeState LifeState { get; private set; }
        public double RebuildRemaining => rebuildRemaining;
        public Vector3 LastImpactPoint { get; private set; }

        void Awake()
        {
            spawnPosition = ToFlight(transform.position);
            spawnOrientation = FromUnity(transform.rotation);
            renderers = GetComponentsInChildren<Renderer>(true);
            colliders = GetComponentsInChildren<Collider>(true);
            ResetAirframe();
            flightRigidbody = GetComponent<Rigidbody>();
            if (flightRigidbody == null) flightRigidbody = gameObject.AddComponent<Rigidbody>();
            flightRigidbody.isKinematic = true;
            flightRigidbody.useGravity = false;
            // Interpolation smooths a body between physics steps. The airframe
            // is now written every rendered frame, so there is nothing between
            // to smooth — leaving it on would add a frame of lag to a transform
            // that is already exactly current.
            flightRigidbody.interpolation = RigidbodyInterpolation.None;
        }

        /// Canonical: 49-loop.js steps the whole game inside one
        /// requestAnimationFrame — read input, advance the aircraft, move the
        /// camera, render — on a variable delta clamped to .05:
        ///
        ///     var dt=(now-prevT)/1000; prevT=now; if(dt>.05)dt=.05;
        ///
        /// This ran in FixedUpdate at Unity's 50 Hz default instead. Two things
        /// were wrong with that. The rate did not match the 60 Hz the model was
        /// tuned and golden-tested at, so identical input produced a different
        /// trajectory. And splitting input (Update), flight (FixedUpdate) and
        /// camera (LateUpdate) across three cadences puts a variable amount of
        /// staleness between a mouse movement and the frame that shows its
        /// result — the unevenness a pilot reads as lag, and which gets worse
        /// exactly when WebGL drops frames.
        ///
        /// Stepping in Update restores the browser's ordering: this runs before
        /// the camera's LateUpdate, which runs before the frame is drawn. The
        /// airframe is a kinematic transform integrated by hand — Unity's
        /// solver never touches it — so there is nothing here that wanted a
        /// fixed timestep in the first place.
        public const float MaxFrameDelta = .05f;

        void Update()
        {
            var dt = Mathf.Min(Time.deltaTime, MaxFrameDelta);
            if (LifeState == FlightLifeState.Rebuilding)
            {
                rebuildRemaining = System.Math.Max(0, rebuildRemaining - dt);
                if (rebuildRemaining <= 0) ResetAirframe();
                return;
            }
            var activeControls = acceptExternalControls && hasControls
                ? controls : new FlightControls { throttle = 0.75 };
            var previous = state.position;
            model.Step(state, activeControls, dt);
            if (FlightImpactSolver.TryImpact(previous, state.position,
                out var impact, out var surfaceHeight))
            {
                Crash(impact, surfaceHeight);
                return;
            }
            // Written straight to the transform. MovePosition/MoveRotation
            // exist to hand a target to the physics step and are only correct
            // from FixedUpdate; driven from Update they queue a move that the
            // solver then interpolates on its own schedule, which shows up as
            // the aircraft lagging its own controls. The Rigidbody stays for
            // collision queries — it never moves the aircraft.
            transform.SetPositionAndRotation(ToUnity(state.position),
                ToUnity(state.orientation));
        }

        public void SetControls(FlightControls value, double remainingBurnerFuel, bool isBurnerLit)
        {
            controls = value;
            burnerFuel = remainingBurnerFuel;
            burnerLit = isBurnerLit;
            hasControls = true;
        }

        public void Crash(FlightVector impact, double surfaceHeight)
        {
            if (LifeState != FlightLifeState.Airborne) return;
            LifeState = FlightLifeState.Rebuilding;
            rebuildRemaining = rebuildDelay;
            state.position = new FlightVector(impact.x,
                surfaceHeight + FlightImpactSolver.Clearance, impact.z);
            state.velocity = default;
            LastImpactPoint = ToUnity(state.position);
            SetAirframeVisible(false);
            Debug.Log($"AIRFRAME_LOST terrain impact at {LastImpactPoint}");
        }

        public void ResetAirframe()
        {
            state = new FlightState {
                position = spawnPosition,
                velocity = LaunchVelocity(spawnOrientation, initialSpeed),
                orientation = LaunchOrientation(spawnOrientation)
            };
            burnerFuel = 1;
            burnerLit = false;
            rebuildRemaining = 0;
            LifeState = FlightLifeState.Airborne;
            var position = ToUnity(state.position);
            var rotation = ToUnity(state.orientation);
            if (flightRigidbody)
            {
                flightRigidbody.position = position;
                flightRigidbody.rotation = rotation;
            }
            transform.SetPositionAndRotation(position, rotation);
            SetAirframeVisible(true);
        }

        public static FlightVector LaunchVelocity(FlightQuaternion orientation, double speed)
        {
            // Launch velocity stays level; the airframe attitude below is
            // pitched above it to create lift without adding an initial sink.
            return orientation.Rotate(new FlightVector(0, 0, -speed));
        }

        public static FlightQuaternion LaunchOrientation(FlightQuaternion orientation) =>
            orientation * FlightQuaternion.AxisAngle(new FlightVector(1, 0, 0),
                LaunchTrimAlpha);

        void SetAirframeVisible(bool visible)
        {
            if (renderers != null)
                foreach (var item in renderers) item.enabled = visible;
            if (colliders != null)
                foreach (var item in colliders) item.enabled = visible;
        }

        public static Vector3 ToUnity(FlightVector value) =>
            new Vector3((float)value.x, (float)value.y, (float)-value.z);

        public static FlightVector ToFlight(Vector3 value) =>
            new FlightVector(value.x, value.y, -value.z);

        public static FlightQuaternion FromUnity(Quaternion source) =>
            new FlightQuaternion(-source.x, -source.y, source.z, source.w).Normalized;

        public static Quaternion ToUnity(FlightQuaternion source)
        {
            // Reflection through Z maps a source rotation matrix into Unity.
            var forward = ToUnity(source.Rotate(new FlightVector(0, 0, -1)));
            var up = ToUnity(source.Rotate(new FlightVector(0, 1, 0)));
            return Quaternion.LookRotation(forward, up);
        }
    }
}
