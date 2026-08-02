using AirbourneArena.Flight;
using UnityEngine;

namespace AirbourneArena.VerticalSlice
{
    /// Every round in the air, in one preallocated array drawn by one mesh.
    ///
    /// The slice used to spawn a GameObject per shot, add a LineRenderer to it,
    /// and build a Material with Shader.Find inside Initialize — then destroy
    /// all three on impact. At 11.76 rounds a second that is a material lookup,
    /// three allocations and a destroy per shot, which on WebGL means garbage
    /// collection hitches exactly while the trigger is held, plus a draw call
    /// per round in flight.
    ///
    /// The browser has always done this the other way: one Float32Array of 480
    /// segment endpoints and a single LineSegments object. This is that, as a
    /// Mesh the pool rewrites in place — no allocation after Awake, one draw
    /// call however many rounds are up.
    public sealed class RoundPool : MonoBehaviour
    {
        struct Round
        {
            public Vector3 position, velocity;
            public float life, damage, guideRemaining;
            public Transform owner;
            public PracticeTarget guideTarget;
            public bool active;
        }

        /// Same rationale as AircraftGuns: the solver is frame-invariant, so
        /// the pool stays in Unity space and only widens to double where the
        /// arithmetic happens. No handedness flip.
        static FlightVector V(Vector3 v) => new FlightVector(v.x, v.y, v.z);
        static Vector3 U(FlightVector v) => new Vector3((float)v.x, (float)v.y, (float)v.z);

        [SerializeField] Material tracerMaterial;
        [SerializeField] float tracerLength = 8;

        Round[] rounds;
        Vector3[] vertices;
        int[] indices;
        Mesh mesh;
        MeshFilter meshFilter;
        int live;

        public int Live => live;

        void Awake()
        {
            rounds = new Round[GunnerySolver.MaxRounds];
            vertices = new Vector3[GunnerySolver.MaxRounds * 2];
            indices = new int[GunnerySolver.MaxRounds * 2];
            for (var i = 0; i < indices.Length; i++) indices[i] = i;

            mesh = new Mesh { name = "TracerSegments" };
            // The pool is world-space and always on screen somewhere; skipping
            // recalculation keeps a bounds pass off every frame.
            mesh.MarkDynamic();
            mesh.vertices = vertices;
            mesh.SetIndices(indices, MeshTopology.Lines, 0, false);
            mesh.bounds = new Bounds(Vector3.zero, Vector3.one * 1e6f);

            meshFilter = gameObject.AddComponent<MeshFilter>();
            meshFilter.sharedMesh = mesh;
            var meshRenderer = gameObject.AddComponent<MeshRenderer>();
            meshRenderer.sharedMaterial = tracerMaterial ? tracerMaterial : DefaultTracerMaterial();
            meshRenderer.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            meshRenderer.receiveShadows = false;
        }

        static Material DefaultTracerMaterial()
        {
            // Built once for the pool, not once per round.
            var shader = Shader.Find("Sprites/Default");
            return new Material(shader)
            {
                name = "TracerDefault",
                color = new Color(1, .85f, .63f, .95f)
            };
        }

        public void Fire(Vector3 origin, Vector3 velocity, float damage, Transform owner,
            PracticeTarget guideTarget, bool guided)
        {
            for (var i = 0; i < rounds.Length; i++)
            {
                if (rounds[i].active) continue;
                rounds[i] = new Round
                {
                    position = origin,
                    velocity = velocity,
                    life = (float)GunnerySolver.RoundLife,
                    damage = damage,
                    owner = owner,
                    guideTarget = guided ? guideTarget : null,
                    guideRemaining = guided ? (float)GunnerySolver.GuideTime : 0,
                    active = true
                };
                live++;
                return;
            }
            // Full. The browser drops the shot too rather than growing the
            // array; at 480 rounds that is several seconds of continuous fire.
        }

        /// Stepped from Update, on the same clamped frame delta the aircraft
        /// uses, so a round and the aircraft that fired it always advance
        /// through the same slice of time.
        void Update()
        {
            var dt = Mathf.Min(Time.deltaTime, UnityFlightBody.MaxFrameDelta);
            var vertex = 0;
            for (var i = 0; i < rounds.Length; i++)
            {
                if (!rounds[i].active) continue;

                if (rounds[i].guideTarget && rounds[i].guideRemaining > 0
                    && rounds[i].guideTarget.Alive)
                {
                    rounds[i].velocity = U(GunnerySolver.GuideRound(
                        V(rounds[i].position), V(rounds[i].velocity),
                        V(rounds[i].guideTarget.transform.position),
                        V(rounds[i].guideTarget.Velocity), rounds[i].guideRemaining, dt));
                    rounds[i].guideRemaining -= dt;
                }

                var from = rounds[i].position;
                var to = from + rounds[i].velocity * dt;
                var hit = false;

                foreach (var target in PracticeTarget.Active)
                {
                    if (!target || !target.Alive) continue;
                    if (rounds[i].owner && target.transform.IsChildOf(rounds[i].owner)) continue;
                    if (!GunnerySolver.SegmentHitsSphere(V(from), V(to),
                        V(target.transform.position), GunnerySolver.HitRadius, out _)) continue;
                    target.Hit(rounds[i].damage);
                    hit = true;
                    break;
                }

                rounds[i].position = to;
                rounds[i].life -= dt;
                if (hit || rounds[i].life <= 0)
                {
                    rounds[i].active = false;
                    rounds[i].owner = null;
                    rounds[i].guideTarget = null;
                    live--;
                    continue;
                }

                vertices[vertex++] = to;
                vertices[vertex++] = to - rounds[i].velocity.normalized * tracerLength;
            }
            // Retired rounds are collapsed to a degenerate segment rather than
            // the array being rebuilt, so this allocates nothing.
            for (var i = vertex; i < vertices.Length; i++) vertices[i] = Vector3.zero;
            mesh.vertices = vertices;
        }

        void OnDestroy()
        {
            if (mesh) Destroy(mesh);
        }
    }
}
