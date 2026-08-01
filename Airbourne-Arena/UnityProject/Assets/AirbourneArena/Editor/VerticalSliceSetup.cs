using System;
using System.IO;
using System.Linq;
using AirbourneArena.Flight;
using AirbourneArena.VerticalSlice;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;
using UnityEngine.SceneManagement;

namespace AirbourneArena.Editor
{
    public static class VerticalSliceSetup
    {
        const string Generated = "Assets/AirbourneArena/Generated";
        const string Art = "Assets/Art/Generated";
        const string Textures = "Assets/Art/Textures";
        const string Materials = Generated + "/Materials";
        const string ScenePath = Generated + "/FirstFlight.unity";

        [MenuItem("Airbourne Arena/Create or Refresh FIRST FLIGHT Scene")]
        public static void Create()
        {
            EnsureFolder("Assets/AirbourneArena", "Generated");
            EnsureFolder(Generated, "Materials");
            EnsureRenderPipeline();
            AssetDatabase.Refresh(ImportAssetOptions.ForceSynchronousImport);

            var vanguard = RequireModel(Art + "/vanguard-interceptor-v4.fbx");
            var vanguardLod1 = RequireModel(Art + "/vanguard-interceptor-v4-lod1.fbx");
            var world = RequireModel(Art + "/starter-coast-world-authored-v2.fbx");
            var drone = RequireModel(Art + "/blackwing-drone.fbx");
            ValidateTriangleCount(world, 150000, "Starter Coast LOD0");
            var vanguardPrefab = CreateVanguard(vanguard, vanguardLod1);
            var worldPrefab = CreateVisualPrefab(world, "StarterCoast");
            var dronePrefab = CreateDrone(drone);
            var gatePrefab = CreateGate();
            CreateScene(vanguardPrefab, worldPrefab, dronePrefab, gatePrefab);
            AssetDatabase.SaveAssets();
            Debug.Log($"FIRST FLIGHT scene refreshed: {ScenePath}");
        }

        [MenuItem("Airbourne Arena/Capture FIRST FLIGHT Snapshot")]
        public static void CaptureSnapshot()
        {
            Create();
            var world = AssetDatabase.LoadAssetAtPath<GameObject>(
                Generated + "/StarterCoast.prefab");
            var vanguard = AssetDatabase.LoadAssetAtPath<GameObject>(
                Generated + "/VanguardPlayer.prefab");
            var drone = AssetDatabase.LoadAssetAtPath<GameObject>(
                Generated + "/BlackwingPracticeDrone.prefab");
            var gate = AssetDatabase.LoadAssetAtPath<GameObject>(
                Generated + "/NavigationGate.prefab");
            PrefabUtility.InstantiatePrefab(world);
            var aircraft = (GameObject)PrefabUtility.InstantiatePrefab(vanguard);
            aircraft.transform.SetPositionAndRotation(new Vector3(-1050, 730, -80),
                Quaternion.Euler(4, 18, -8));
            var contact = (GameObject)PrefabUtility.InstantiatePrefab(drone);
            contact.transform.position = new Vector3(-520, 720, 170);
            var previewGates = new[] {
                aircraft.transform.position + aircraft.transform.forward * 230 +
                    aircraft.transform.right * 95 + Vector3.up * 24,
                aircraft.transform.position + aircraft.transform.forward * 520 -
                    aircraft.transform.right * 150 - Vector3.up * 35,
                aircraft.transform.position + aircraft.transform.forward * 810 +
                    aircraft.transform.right * 70 - Vector3.up * 80
            };
            foreach (var position in previewGates)
                ((GameObject)PrefabUtility.InstantiatePrefab(gate)).transform.position = position;

            var camera = Camera.main;
            if (!camera) throw new InvalidOperationException("Generated scene has no main camera");
            camera.transform.position = new Vector3(-1090, 748, -142);
            camera.transform.position = aircraft.transform.position -
                aircraft.transform.forward * 30 + Vector3.up * 8;
            camera.transform.LookAt(aircraft.transform.position +
                aircraft.transform.forward * 26 + Vector3.up * 1.5f);
            camera.fieldOfView = 62;
            camera.allowHDR = true;
            DynamicGI.UpdateEnvironment();

            const int width = 1600, height = 900;
            var target = new RenderTexture(width, height, 24, RenderTextureFormat.ARGB32);
            var image = new Texture2D(width, height, TextureFormat.RGB24, false);
            camera.targetTexture = target;
            camera.Render();
            RenderTexture.active = target;
            image.ReadPixels(new Rect(0, 0, width, height), 0, 0);
            image.Apply();
            camera.targetTexture = null;
            RenderTexture.active = null;
            var output = Path.GetFullPath(Path.Combine(Application.dataPath,
                "../../../docs/renders/unity-first-flight.png"));
            Directory.CreateDirectory(Path.GetDirectoryName(output)!);
            File.WriteAllBytes(output, image.EncodeToPNG());
            UnityEngine.Object.DestroyImmediate(image);
            UnityEngine.Object.DestroyImmediate(target);
            Debug.Log($"UNITY_SNAPSHOT {output}");
        }

        static GameObject RequireModel(string path)
        {
            var asset = AssetDatabase.LoadAssetAtPath<GameObject>(path);
            if (!asset) throw new FileNotFoundException(
                $"Missing authored FBX: {path}. Run source/scripts/export-unity-assets.sh first.");
            return asset;
        }

        static GameObject CreateVanguard(GameObject source, GameObject lod1Source)
        {
            var instance = new GameObject("Vanguard_Interceptor_Player");
            var near = (GameObject)PrefabUtility.InstantiatePrefab(source);
            var far = (GameObject)PrefabUtility.InstantiatePrefab(lod1Source);
            near.name = "LOD0";
            far.name = "LOD1";
            near.transform.SetParent(instance.transform, false);
            far.transform.SetParent(instance.transform, false);
            // Blender authors the interceptor nose toward -Y. After FBX axis
            // conversion the imported visual points opposite Unity's +Z
            // flight root, placing the chase camera on the nose side. Rotate
            // only the render children so physics and mission headings remain
            // unchanged while the player sees the aircraft from behind.
            near.transform.localRotation = Quaternion.Euler(0, 180, 0);
            far.transform.localRotation = Quaternion.Euler(0, 180, 0);
            ApplyAuthoredMaterials(near, false);
            ApplyAuthoredMaterials(far, false);
            var lodGroup = instance.AddComponent<LODGroup>();
            lodGroup.SetLODs(new[] {
                new LOD(.60f, near.GetComponentsInChildren<Renderer>()),
                new LOD(.25f, far.GetComponentsInChildren<Renderer>()),
                new LOD(.02f, System.Array.Empty<Renderer>())
            });
            lodGroup.RecalculateBounds();
            var rigidbody = instance.GetComponent<Rigidbody>();
            if (!rigidbody) rigidbody = instance.AddComponent<Rigidbody>();
            rigidbody.isKinematic = true;
            rigidbody.useGravity = false;
            var collider = instance.GetComponent<CapsuleCollider>();
            if (!collider) collider = instance.AddComponent<CapsuleCollider>();
            collider.direction = 2;
            collider.radius = 4;
            collider.height = 15;
            if (!instance.GetComponent<UnityFlightBody>()) instance.AddComponent<UnityFlightBody>();
            if (!instance.GetComponent<PlayerFlightController>())
                instance.AddComponent<PlayerFlightController>();
            if (!instance.GetComponent<AircraftGuns>()) instance.AddComponent<AircraftGuns>();
            return Save(instance, Generated + "/VanguardPlayer.prefab");
        }

        static GameObject CreateDrone(GameObject source)
        {
            var instance = (GameObject)PrefabUtility.InstantiatePrefab(source);
            instance.name = "Blackwing_PracticeDrone";
            ApplyAuthoredMaterials(instance, false);
            var collider = instance.GetComponent<SphereCollider>();
            if (!collider) collider = instance.AddComponent<SphereCollider>();
            collider.radius = 5;
            if (!instance.GetComponent<PracticeTarget>()) instance.AddComponent<PracticeTarget>();
            return Save(instance, Generated + "/BlackwingPracticeDrone.prefab");
        }

        static GameObject CreateVisualPrefab(GameObject source, string name)
        {
            var instance = (GameObject)PrefabUtility.InstantiatePrefab(source);
            instance.name = name;
            ApplyAuthoredMaterials(instance, true);
            return Save(instance, Generated + "/" + name + ".prefab");
        }

        static GameObject CreateGate()
        {
            var meshPath = Generated + "/NavigationGate.asset";
            var mesh = AssetDatabase.LoadAssetAtPath<Mesh>(meshPath);
            if (!mesh)
            {
                mesh = BuildTorus(70, 3.2f, 32, 8);
                mesh.name = "NavigationGate";
                AssetDatabase.CreateAsset(mesh, meshPath);
            }
            var materialPath = Generated + "/NavigationGate.mat";
            var material = AssetDatabase.LoadAssetAtPath<Material>(materialPath);
            var shader = RequireGateShader();
            if (!material)
            {
                material = new Material(shader) {
                    name = "Navigation Gate Teal"
                };
                AssetDatabase.CreateAsset(material, materialPath);
            }
            material.shader = shader;
            SetBaseColor(material, new Color(0.08f, .90f, 1f, .58f));
            material.renderQueue = 3000;
            EditorUtility.SetDirty(material);
            var gate = new GameObject("NavigationGate");
            gate.AddComponent<MeshFilter>().sharedMesh = mesh;
            gate.AddComponent<MeshRenderer>().sharedMaterial = material;
            var trigger = gate.AddComponent<SphereCollider>();
            trigger.radius = 70;
            trigger.isTrigger = true;
            gate.AddComponent<NavigationGate>();
            return Save(gate, Generated + "/NavigationGate.prefab");
        }

        static Mesh BuildTorus(float radius, float tube, int radialSegments, int tubeSegments)
        {
            var vertices = new Vector3[radialSegments * tubeSegments];
            var normals = new Vector3[vertices.Length];
            var uv = new Vector2[vertices.Length];
            var triangles = new int[radialSegments * tubeSegments * 6];
            for (var ring = 0; ring < radialSegments; ring++)
            for (var side = 0; side < tubeSegments; side++)
            {
                var u = ring * Mathf.PI * 2 / radialSegments;
                var v = side * Mathf.PI * 2 / tubeSegments;
                var index = ring * tubeSegments + side;
                var normal = new Vector3(Mathf.Cos(u) * Mathf.Cos(v),
                    Mathf.Sin(u) * Mathf.Cos(v), Mathf.Sin(v));
                vertices[index] = new Vector3(Mathf.Cos(u) * radius,
                    Mathf.Sin(u) * radius, 0) + normal * tube;
                normals[index] = normal;
                uv[index] = new Vector2((float)ring / radialSegments, (float)side / tubeSegments);
                var nextRing = ((ring + 1) % radialSegments) * tubeSegments;
                var nextSide = (side + 1) % tubeSegments;
                var triangle = index * 6;
                triangles[triangle] = index;
                triangles[triangle + 1] = nextRing + side;
                triangles[triangle + 2] = nextRing + nextSide;
                triangles[triangle + 3] = index;
                triangles[triangle + 4] = nextRing + nextSide;
                triangles[triangle + 5] = ring * tubeSegments + nextSide;
            }
            var mesh = new Mesh { vertices = vertices, normals = normals, uv = uv, triangles = triangles };
            mesh.RecalculateBounds();
            return mesh;
        }

        static void CreateScene(GameObject vanguard, GameObject world, GameObject drone, GameObject gate)
        {
            var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
            var sunObject = new GameObject("Sun");
            var sun = sunObject.AddComponent<Light>();
            sun.type = LightType.Directional;
            sun.intensity = 1.35f;
            sun.color = new Color(1, .90f, .76f);
            sun.shadows = LightShadows.Soft;
            sunObject.transform.rotation = Quaternion.Euler(38, -34, 0);
            var fillObject = new GameObject("Atmospheric Fill");
            var fill = fillObject.AddComponent<Light>();
            fill.type = LightType.Directional;
            fill.intensity = .72f;
            fill.color = new Color(.55f, .71f, 1);
            fill.shadows = LightShadows.None;
            fillObject.transform.rotation = Quaternion.Euler(145, 120, 0);
            RenderSettings.ambientMode = AmbientMode.Trilight;
            RenderSettings.ambientSkyColor = new Color(.32f, .47f, .64f);
            RenderSettings.ambientEquatorColor = new Color(.24f, .31f, .36f);
            RenderSettings.ambientGroundColor = new Color(.10f, .12f, .14f);
            RenderSettings.ambientIntensity = 1.35f;
            RenderSettings.fog = true;
            RenderSettings.fogMode = FogMode.ExponentialSquared;
            RenderSettings.fogColor = new Color(.47f, .62f, .71f);
            RenderSettings.fogDensity = .000075f;
            RenderSettings.skybox = CreateSkybox();
            CreateOcean();

            var cameraObject = new GameObject("FlightCamera");
            cameraObject.tag = "MainCamera";
            var camera = cameraObject.AddComponent<Camera>();
            camera.fieldOfView = 68;
            camera.nearClipPlane = .3f;
            camera.farClipPlane = 24000;
            cameraObject.AddComponent<AudioListener>();
            var chase = cameraObject.AddComponent<ChaseCamera>();
            var hudObject = new GameObject("SliceHud");
            var hud = hudObject.AddComponent<SliceHud>();
            // Every round in the air lives in this one object. AircraftGuns
            // finds it at Awake, so it has to exist in the scene or the cannon
            // has nowhere to put a shot.
            new GameObject("RoundPool").AddComponent<RoundPool>();
            var bootstrapObject = new GameObject("VerticalSlice");
            var bootstrap = bootstrapObject.AddComponent<VerticalSliceBootstrap>();
            var serialized = new SerializedObject(bootstrap);
            serialized.FindProperty("playerAircraftPrefab").objectReferenceValue = vanguard;
            serialized.FindProperty("worldPrefab").objectReferenceValue = world;
            serialized.FindProperty("practiceDronePrefab").objectReferenceValue = drone;
            serialized.FindProperty("navigationGatePrefab").objectReferenceValue = gate;
            serialized.FindProperty("chaseCamera").objectReferenceValue = chase;
            serialized.FindProperty("hud").objectReferenceValue = hud;
            serialized.ApplyModifiedPropertiesWithoutUndo();

            EditorSceneManager.SaveScene(scene, ScenePath);
            EditorBuildSettings.scenes = new[] { new EditorBuildSettingsScene(ScenePath, true) };
        }

        static void CreateOcean()
        {
            var materialPath = Generated + "/Ocean.mat";
            var material = AssetDatabase.LoadAssetAtPath<Material>(materialPath);
            var shader = RequireLitShader();
            if (!material)
            {
                material = new Material(shader) {
                    name = "Starter Coast Ocean"
                };
                AssetDatabase.CreateAsset(material, materialPath);
            }
            material.shader = shader;
            SetBaseColor(material, new Color(.38f, .62f, .69f, 1));
            material.SetTexture("_BaseMap", RequireTexture(
                Textures + "/terrain/starter-coast-ocean-diffusion-4k-v1.png"));
            material.mainTextureScale = new Vector2(18, 18);
            material.SetFloat("_Metallic", .34f);
            material.SetFloat("_Smoothness", .88f);
            EditorUtility.SetDirty(material);
            var ocean = GameObject.CreatePrimitive(PrimitiveType.Plane);
            ocean.name = "Runtime Ocean";
            ocean.transform.position = new Vector3(0, 0, 0);
            ocean.transform.localScale = new Vector3(1600, 1, 1600);
            ocean.GetComponent<MeshRenderer>().sharedMaterial = material;
            ocean.AddComponent<OceanSurface>();
            UnityEngine.Object.DestroyImmediate(ocean.GetComponent<Collider>());
        }

        static void EnsureRenderPipeline()
        {
            const string path = Generated + "/AirbourneArenaURP.asset";
            var pipeline = AssetDatabase.LoadAssetAtPath<UniversalRenderPipelineAsset>(path);
            if (!pipeline)
            {
                pipeline = UniversalRenderPipelineAsset.Create();
                pipeline.name = "Airbourne Arena WebGL URP";
                pipeline.renderScale = 1;
                pipeline.shadowDistance = 1800;
                pipeline.msaaSampleCount = 4;
                AssetDatabase.CreateAsset(pipeline, path);
                var renderer = pipeline.rendererDataList[0];
                renderer.name = "Airbourne Arena Forward Renderer";
                AssetDatabase.AddObjectToAsset(renderer, pipeline);
            }
            GraphicsSettings.defaultRenderPipeline = pipeline;
            QualitySettings.renderPipeline = pipeline;
            EditorUtility.SetDirty(pipeline);
        }

        static Shader RequireLitShader()
        {
            var shader = Shader.Find("Universal Render Pipeline/Lit");
            if (!shader) throw new InvalidOperationException("URP Lit shader is unavailable");
            return shader;
        }

        static Material CreateSkybox()
        {
            const string path = Generated + "/StarterCoastSkybox.mat";
            var material = AssetDatabase.LoadAssetAtPath<Material>(path);
            var shader = Shader.Find("Skybox/Procedural");
            if (!shader) return null;
            if (!material)
            {
                material = new Material(shader) { name = "Starter Coast Atmosphere" };
                AssetDatabase.CreateAsset(material, path);
            }
            material.SetColor("_SkyTint", new Color(.31f, .56f, .82f));
            material.SetColor("_GroundColor", new Color(.28f, .43f, .56f));
            material.SetFloat("_SunSize", .025f);
            material.SetFloat("_SunSizeConvergence", 5f);
            material.SetFloat("_AtmosphereThickness", .72f);
            material.SetFloat("_Exposure", .96f);
            EditorUtility.SetDirty(material);
            return material;
        }

        static void ApplyAuthoredMaterials(GameObject root, bool world)
        {
            foreach (var renderer in root.GetComponentsInChildren<Renderer>(true))
            {
                var source = renderer.sharedMaterials;
                var mapped = new Material[source.Length];
                for (var index = 0; index < source.Length; index++)
                {
                    mapped[index] = ResolveMaterial(source[index], world);
                }
                renderer.sharedMaterials = mapped;
                renderer.shadowCastingMode = world ? ShadowCastingMode.Off : ShadowCastingMode.On;
                renderer.receiveShadows = true;
            }
        }

        static Material ResolveMaterial(Material source, bool world)
        {
            var sourceName = source ? source.name : "Authored fallback";
            var key = sourceName.ToLowerInvariant();
            string texture = null;
            var color = world && source ? source.color : Color.white;
            var metallic = .12f;
            var smoothness = .42f;
            var emission = Color.black;
            if (world)
            {
                /* The HTML renderer lifts these generated atlases before
                   lighting and adds a hemisphere fill. A low albedo-matched
                   emission term reproduces that readable shadow floor in URP
                   without flattening sun/specular response. */
                emission = new Color(.34f, .34f, .34f);
                if (key.Contains("terrain")) texture = "terrain/volcanic-terrain-v2.png";
                else if (key.Contains("road") || key.Contains("runway"))
                    texture = "architecture/road-surface-diffusion-v1.png";
                else if (key.Contains("airbase deck"))
                    texture = "architecture/airbase-deck-diffusion-4k-v1.png";
                else if (key.Contains("bunker"))
                    texture = "architecture/bunker-concrete-diffusion-v1.png";
                else if (key.Contains("city roof"))
                    texture = "architecture/city-roofs-diffusion-v1.png";
                else if (key.Contains("hangar"))
                    texture = "architecture/hangar-metal-diffusion-v1.png";
                else if (key.Contains("breakwater"))
                    texture = "terrain/breakwater-field-surface-diffusion-4k-v1.png";
                else if (key.Contains("inferno"))
                    texture = "aircraft/inferno-surface-diffusion-4k-v1.png";
                else if (key.Contains("navigation"))
                    texture = "architecture/skyway-navigation-surface-diffusion-4k-v1.png";
                else if (key.Contains("foliage"))
                    texture = "terrain/conifer-foliage-diffusion-v1.png";
                else texture = "ui_and_briefing/aviation-hardware-diffusion-4k-v1.png";
                if (key.Contains("glazing"))
                {
                    color = new Color(.08f, .17f, .23f);
                    metallic = .18f;
                    smoothness = .80f;
                    emission = new Color(.02f, .10f, .15f);
                }
                if (key.Contains("safety orange"))
                {
                    color = new Color(.90f, .42f, .13f);
                    emission = new Color(.22f, .06f, 0);
                }
            }
            else if (key.Contains("vanguard"))
            {
                texture = "aircraft/vanguard-surface-diffusion-4k-v1.png";
                metallic = key.Contains("cobalt") ? .58f : .28f;
                smoothness = .62f;
                if (key.Contains("energy"))
                {
                    color = new Color(.75f, .93f, 1);
                    emission = new Color(.10f, .78f, 1.8f);
                }
            }
            else if (key.Contains("black wing"))
            {
                texture = "aircraft/black-wing-surface-diffusion-4k-v1.png";
                metallic = .55f;
                smoothness = .52f;
            }
            else
            {
                texture = "ui_and_briefing/aviation-hardware-diffusion-4k-v1.png";
                metallic = key.Contains("heat") ? .88f : .68f;
                smoothness = .62f;
                if (key.Contains("energy")) emission = new Color(.10f, .78f, 1.8f);
            }
            return GetOrCreateMaterial(sourceName, texture, color, metallic, smoothness,
                emission, world);
        }

        static Material GetOrCreateMaterial(string sourceName, string texture,
            Color color, float metallic, float smoothness, Color emission, bool unlit)
        {
            var safeName = string.Concat(sourceName.Select(character =>
                Path.GetInvalidFileNameChars().Contains(character) ? '_' : character));
            var path = Materials + "/" + safeName + ".mat";
            var material = AssetDatabase.LoadAssetAtPath<Material>(path);
            if (!material)
            {
                material = new Material(unlit ? RequireWorldShader() : RequireLitShader()) {
                    name = sourceName
                };
                AssetDatabase.CreateAsset(material, path);
            }
            material.shader = unlit ? RequireWorldShader() : RequireLitShader();
            SetBaseColor(material, color);
            var map = RequireTexture(Textures + "/" + texture);
            material.SetTexture("_BaseMap", map);
            if (material.HasProperty("_Metallic")) material.SetFloat("_Metallic", metallic);
            if (material.HasProperty("_Smoothness")) material.SetFloat("_Smoothness", smoothness);
            if (unlit)
            {
                material.SetFloat("_Exposure", 1.35f);
                material.SetFloat("_Ambient", .62f);
                material.SetFloat("_SunStrength", .68f);
            }
            if (!unlit && emission.maxColorComponent > 0)
            {
                material.SetTexture("_EmissionMap", map);
                material.SetColor("_EmissionColor", emission);
                material.EnableKeyword("_EMISSION");
            }
            else
            {
                if (material.HasProperty("_EmissionMap"))
                    material.SetTexture("_EmissionMap", null);
                material.DisableKeyword("_EMISSION");
            }
            EditorUtility.SetDirty(material);
            return material;
        }

        static Shader RequireWorldShader()
        {
            var shader = Shader.Find("AirbourneArena/WorldSurface");
            if (!shader) throw new InvalidOperationException(
                "Airbourne Arena world-surface shader is unavailable");
            return shader;
        }

        static Shader RequireGateShader()
        {
            var shader = Shader.Find("AirbourneArena/NavigationGate");
            if (!shader) throw new InvalidOperationException(
                "Airbourne Arena navigation-gate shader is unavailable");
            return shader;
        }

        static void SetBaseColor(Material material, Color color)
        {
            material.color = color;
            if (material.HasProperty("_BaseColor")) material.SetColor("_BaseColor", color);
        }

        static Texture2D RequireTexture(string path)
        {
            var texture = AssetDatabase.LoadAssetAtPath<Texture2D>(path);
            if (!texture) throw new FileNotFoundException($"Missing Unity texture: {path}");
            return texture;
        }

        static void ValidateTriangleCount(GameObject model, int minimum, string label)
        {
            long triangles = 0;
            foreach (var filter in model.GetComponentsInChildren<MeshFilter>(true))
                if (filter.sharedMesh)
                    triangles += filter.sharedMesh.triangles.LongLength / 3;
            if (triangles < minimum)
                throw new InvalidDataException(
                    $"{label} imported only {triangles:N0} triangles; expected at least {minimum:N0}.");
            Debug.Log($"UNITY_MESH_GATE {label}={triangles:N0} triangles");
        }

        static GameObject Save(GameObject instance, string path)
        {
            var prefab = PrefabUtility.SaveAsPrefabAsset(instance, path);
            UnityEngine.Object.DestroyImmediate(instance);
            if (!prefab) throw new InvalidOperationException($"Could not create {path}");
            return prefab;
        }

        static void EnsureFolder(string parent, string child)
        {
            var path = parent + "/" + child;
            if (!AssetDatabase.IsValidFolder(path)) AssetDatabase.CreateFolder(parent, child);
        }
    }
}
