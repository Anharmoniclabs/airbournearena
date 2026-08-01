using UnityEngine;

namespace AirbourneArena.VerticalSlice
{
    [RequireComponent(typeof(Renderer))]
    public sealed class OceanSurface : MonoBehaviour
    {
        [SerializeField] Vector2 drift = new(.004f, -.006f);
        Material runtimeMaterial;

        void Awake() => runtimeMaterial = GetComponent<Renderer>().material;

        void Update()
        {
            if (runtimeMaterial)
                runtimeMaterial.mainTextureOffset = drift * Time.time;
        }

        void OnDestroy()
        {
            if (runtimeMaterial) Destroy(runtimeMaterial);
        }
    }
}
