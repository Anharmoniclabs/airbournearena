using AirbourneArena.Flight;
using UnityEngine;

namespace AirbourneArena.VerticalSlice
{
    /// The nose cannon, matched to 22-bullets.js and 27-gunnery.js.
    ///
    /// Every number here was wrong in the slice: 520 m/s instead of 780, 12
    /// damage instead of 14, a fixed 12 rounds a second instead of the .085 s
    /// interval, no spread, and — the part that changes how a pass feels most —
    /// no lead solution, no magnetic aim and no guided rounds. A shot that
    /// scores in the browser missed here, which reads as the aircraft being
    /// wrong rather than the gun being different.
    ///
    /// Designation now runs the canonical state machine too. Acquisition alone
    /// is not a lock: a contact has to sit under the crosshair for the dwell
    /// before MAG LOCK arms, and until it does, rounds are completely
    /// ballistic. Without the dwell, assistance armed the instant anything
    /// entered the cone.
    [RequireComponent(typeof(UnityFlightBody))]
    public sealed class AircraftGuns : MonoBehaviour
    {
        [SerializeField] Transform muzzle;
        [SerializeField] RoundPool pool;
        [SerializeField] KeyCode cycleTargetKey = KeyCode.Tab;
        [SerializeField] KeyCode releaseTargetKey = KeyCode.Backspace;
        /// Loadout multipliers, matching the browser's f.gunRate / f.gunDmg /
        /// f.gunSpread. Left at 1 they reproduce the stock cannon exactly.
        [SerializeField] float gunRate = 1;
        [SerializeField] float gunDamage = 1;
        [SerializeField] float gunSpread = 1;

        float cannonCooldown;
        UnityFlightBody flightBody;
        PlayerFlightController controller;

        readonly LockOnState lockOn = new();
        /// Rebuilt in place every frame. The browser allocates a fresh array in
        /// targetCandidates(); doing that here would put a garbage collection
        /// in the middle of a gun run for no benefit.
        LockCandidate[] candidates = new LockCandidate[16];
        PracticeTarget[] candidateTargets = new PracticeTarget[16];
        int candidateCount;

        /// The solver is frame-invariant vector math — dots, lengths, lerps —
        /// so it gives the same answer in either space and these do not apply
        /// the handedness flip UnityFlightBody.ToUnity does. Everything here
        /// stays in Unity space and only widens to double for the arithmetic.
        static FlightVector V(Vector3 v) => new FlightVector(v.x, v.y, v.z);
        static Vector3 U(FlightVector v) => new Vector3((float)v.x, (float)v.y, (float)v.z);

        public int ShotsFired { get; private set; }
        public bool CanFire => cannonCooldown <= 0;
        /// What the HUD boxes. Present as soon as a contact is acquired, which
        /// is deliberately earlier than assistance arming.
        public PracticeTarget Lock { get; private set; }
        /// Whether MAG LOCK has armed. Rounds are ballistic until this is true.
        public bool Assisted => lockOn.assisted;
        /// How far through the dwell the current contact is, 0..1, for the HUD
        /// to show the lock closing rather than popping.
        public float LockProgress => lockOn.assisted ? 1
            : Mathf.Clamp01((float)(lockOn.hoverTime / LockOnSolver.SoftLockDwell));
        /// Where the browser would draw the lead pip. Null when nothing is
        /// locked, so the HUD can simply not draw it.
        public Vector3? LeadPoint { get; private set; }

        void Awake()
        {
            flightBody = GetComponent<UnityFlightBody>();
            controller = GetComponent<PlayerFlightController>();
            if (!pool) pool = FindObjectOfType<RoundPool>();
        }

        void Update()
        {
            var dt = Mathf.Min(Time.deltaTime, UnityFlightBody.MaxFrameDelta);
            cannonCooldown -= dt;

            CollectCandidates();
            var origin = flightBody.WorldPosition;
            var aimDirection = controller
                ? controller.AimWorldDirection
                : V(transform.forward);

            if (Input.GetKeyDown(cycleTargetKey))
                LockOnSolver.Cycle(lockOn, V(origin), V(transform.forward),
                    candidates, candidateCount);
            if (Input.GetKeyDown(releaseTargetKey))
                LockOnSolver.Release(lockOn);

            LockOnSolver.Step(lockOn, dt,
                flightBody.LifeState == FlightLifeState.Airborne,
                V(origin), aimDirection, candidates, candidateCount, out _);

            Lock = Resolve(lockOn.target);
            UpdateLeadPoint(origin);

            if (Input.GetKey(KeyCode.Space) || Input.GetMouseButton(0)) Fire();
        }

        /// The pool of live drones, as the solver's plain value type. Grows only
        /// when the arena does, never per frame.
        void CollectCandidates()
        {
            var active = PracticeTarget.Active;
            if (candidates.Length < active.Count)
            {
                candidates = new LockCandidate[active.Count * 2];
                candidateTargets = new PracticeTarget[active.Count * 2];
            }
            candidateCount = 0;
            for (var i = 0; i < active.Count; i++)
            {
                var target = active[i];
                if (!target) continue;
                candidateTargets[candidateCount] = target;
                candidates[candidateCount] = new LockCandidate(
                    target.GetInstanceID(), V(target.transform.position), target.Alive);
                candidateCount++;
            }
        }

        PracticeTarget Resolve(int id)
        {
            if (id == LockOnState.None) return null;
            for (var i = 0; i < candidateCount; i++)
                if (candidateTargets[i] && candidateTargets[i].GetInstanceID() == id)
                    return candidateTargets[i];
            return null;
        }

        void UpdateLeadPoint(Vector3 origin)
        {
            LeadPoint = null;
            if (!Lock || !Lock.Alive) return;
            var flightTime = (float)GunnerySolver.InterceptTime(V(origin),
                V(flightBody.WorldVelocity), V(Lock.transform.position), V(Lock.Velocity));
            LeadPoint = Lock.transform.position + Lock.Velocity * flightTime;
        }

        public bool Fire()
        {
            // Without a pool there is nowhere to put a round. Fail quietly
            // rather than throwing once a frame while the trigger is held.
            if (!pool || !CanFire || flightBody.LifeState != FlightLifeState.Airborne) return false;
            cannonCooldown = (float)GunnerySolver.ShotInterval / Mathf.Max(gunRate, .01f);
            ShotsFired++;

            var origin = muzzle ? muzzle.position : transform.position;
            var forward = muzzle ? muzzle.forward : transform.forward;
            var guided = false;
            var fireDirection = V(forward);
            // Assistance is gated on the dwell, not on merely having a contact.
            if (lockOn.assisted && Lock && Lock.Alive)
            {
                var shooterPos = V(flightBody.WorldPosition);
                var shooterVel = V(flightBody.WorldVelocity);
                var targetPos = V(Lock.transform.position);
                var targetVel = V(Lock.Velocity);
                var flightTime = GunnerySolver.InterceptTime(shooterPos, shooterVel,
                    targetPos, targetVel);
                var intercept = GunnerySolver.InterceptAim(shooterPos, shooterVel,
                    targetPos, targetVel, flightTime);
                fireDirection = GunnerySolver.AssistedFireDirection(V(forward), intercept,
                    true, out guided);
            }

            fireDirection = GunnerySolver.ApplySpread(fireDirection,
                GunnerySolver.PlayerSpread * gunSpread, () => Random.value);
            var direction = U(fireDirection);

            // Rounds carry the aircraft's velocity — the reason a deflection
            // shot from a fast pass leads differently than one from a hover.
            var velocity = flightBody.WorldVelocity + direction * (float)GunnerySolver.MuzzleVelocity;
            pool.Fire(origin + forward * (float)GunnerySolver.MuzzleOffset, velocity,
                (float)GunnerySolver.RoundDamage * gunDamage, transform,
                guided ? Lock : null, guided);
            return true;
        }
    }
}
