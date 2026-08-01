using System;
using System.IO;
using System.Linq;
using AirbourneArena.UI;
using UnityEditor;
using UnityEditor.Animations;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.SceneManagement;
using UnityEngine.UIElements;

namespace AirbourneArena.Editor
{
    public static class HangarSetup
    {
        const string Generated = "Assets/AirbourneArena/Generated";
        const string Art = "Assets/Art/Generated";
        const string Textures = "Assets/Art/Textures";
        const string Materials = Generated + "/Materials";
        const string ScenePath = Generated + "/BreakwaterHangar.unity";
        const string FlightScenePath = Generated + "/FirstFlight.unity";
        const string PilotModelPath = Art + "/starter-coast-pilot-rig-v1.fbx";
        const string PilotClipPrefix = Art + "/starter-coast-pilot-";
        const string HangarModelPath = Art + "/breakwater-hangar-detail-authored-v1.fbx";
        const string AircraftModelPath = Art + "/vanguard-interceptor-v4.fbx";

        [MenuItem("Airbourne Arena/Create Complete Hangar + Flight Game")]
        public static void CreateCompleteGame()
        {
            VerticalSliceSetup.Create();
            Create();
        }

        [MenuItem("Airbourne Arena/Create or Refresh Breakwater Hangar")]
        public static void Create()
        {
            AssetDatabase.Refresh(ImportAssetOptions.ForceSynchronousImport);
            ConfigurePilotImporter();
            var pilotModel = RequireModel(PilotModelPath);
            var hangarDetail = RequireModel(HangarModelPath);
            var aircraftModel = RequireModel(AircraftModelPath);
            ValidateTriangleCount(pilotModel, 11000, "Pilot");
            ValidateTriangleCount(hangarDetail, 6500, "Breakwater hangar detail");
            var pilot = CreatePilot(pilotModel);
            var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
            ConfigureEnvironment();
            CreateShell();
            CreateHangarDetails(hangarDetail);
            CreateAircraftDisplays(aircraftModel);
            var player = (GameObject)PrefabUtility.InstantiatePrefab(pilot);
            player.name = "Independent Pilot";
            player.transform.SetPositionAndRotation(new Vector3(0, 0, 26), Quaternion.identity);
            var mara = (GameObject)PrefabUtility.InstantiatePrefab(pilot);
            mara.name = "Mara Switch Voss";
            mara.transform.SetPositionAndRotation(new Vector3(10, 0, -27),
                Quaternion.Euler(0, 160, 0));
            var interfaceController = CreateInterface();
            CreateCamera(player, interfaceController);
            EditorSceneManager.SaveScene(scene, ScenePath);
            EditorBuildSettings.scenes = new[]
            {
                new EditorBuildSettingsScene(ScenePath, true),
                new EditorBuildSettingsScene(FlightScenePath, true)
            };
            AssetDatabase.SaveAssets();
            Debug.Log($"BREAKWATER_HANGAR scene refreshed: {ScenePath}");
        }

        static void ConfigurePilotImporter()
        {
            var importer = AssetImporter.GetAtPath(PilotModelPath) as ModelImporter ??
                throw new InvalidOperationException("Pilot FBX has no model importer.");
            if (importer.animationType != ModelImporterAnimationType.Generic)
            {
                importer.animationType = ModelImporterAnimationType.Generic;
                importer.avatarSetup = ModelImporterAvatarSetup.NoAvatar;
                importer.SaveAndReimport();
            }
            foreach (var clipSpec in new[] { ("idle", 48f), ("walk", 25f), ("run", 17f) })
            {
                var path = PilotClipPrefix + clipSpec.Item1 + ".fbx";
                var clipImporter = AssetImporter.GetAtPath(path) as ModelImporter ??
                    throw new InvalidOperationException($"Pilot clip has no importer: {path}");
                clipImporter.importAnimation = true;
                clipImporter.animationType = ModelImporterAnimationType.Generic;
                clipImporter.avatarSetup = ModelImporterAvatarSetup.NoAvatar;
                clipImporter.clipAnimations = new[]
                {
                    new ModelImporterClipAnimation
                    {
                        name = char.ToUpperInvariant(clipSpec.Item1[0]) +
                            clipSpec.Item1.Substring(1),
                        takeName = "Scene",
                        firstFrame = 1,
                        lastFrame = clipSpec.Item2,
                        loopTime = true,
                        loopPose = true
                    }
                };
                clipImporter.SaveAndReimport();
            }
        }

        [MenuItem("Airbourne Arena/Capture Breakwater Hangar Snapshot")]
        public static void CaptureSnapshot()
        {
            Create();
            var camera = Camera.main;
            if (!camera) throw new InvalidOperationException("Hangar has no camera");
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
                "../../../docs/renders/unity-breakwater-hangar.png"));
            Directory.CreateDirectory(Path.GetDirectoryName(output)!);
            File.WriteAllBytes(output, image.EncodeToPNG());
            UnityEngine.Object.DestroyImmediate(image);
            UnityEngine.Object.DestroyImmediate(target);
            Debug.Log($"UNITY_HANGAR_SNAPSHOT {output}");
        }

        static GameObject CreatePilot(GameObject source)
        {
            var instance = (GameObject)PrefabUtility.InstantiatePrefab(source);
            instance.name = "Independent_Pilot_Rig";
            instance.transform.localScale = Vector3.one * 1.72f;
            var body = Material("Pilot ceramic and textile",
                "character_reference/starter-coast-pilot-albedo-diffusion-v2.png",
                Color.white, .08f, .34f, new Color(.26f, .26f, .26f));
            var visor = Material("Pilot teal visor", null,
                new Color(.20f, .76f, .86f), .24f, .84f,
                new Color(.02f, .34f, .44f));
            foreach (var renderer in instance.GetComponentsInChildren<Renderer>(true))
            {
                var sourceMaterials = renderer.sharedMaterials;
                var mapped = new Material[sourceMaterials.Length];
                for (var i = 0; i < mapped.Length; i++)
                    mapped[i] = sourceMaterials[i] &&
                        sourceMaterials[i].name.IndexOf("visor",
                            StringComparison.OrdinalIgnoreCase) >= 0 ? visor : body;
                renderer.sharedMaterials = mapped;
            }
            var controllerPath = Generated + "/HangarPilot.controller";
            var controller = AssetDatabase.LoadAssetAtPath<AnimatorController>(controllerPath);
            if (!controller)
                controller = AnimatorController.CreateAnimatorControllerAtPath(controllerPath);
            var stateMachine = controller.layers[0].stateMachine;
            foreach (var child in stateMachine.states.ToArray())
                stateMachine.RemoveState(child.state);
            AnimatorState idle = null;
            var importedClips = new System.Collections.Generic.List<(string, AnimationClip)>();
            foreach (var clipName in new[] { "Idle", "Walk", "Run" })
            {
                var clipPath = PilotClipPrefix + clipName.ToLowerInvariant() + ".fbx";
                var clip = AssetDatabase.LoadAllAssetsAtPath(clipPath)
                    .OfType<AnimationClip>().FirstOrDefault(item =>
                        !item.name.StartsWith("__preview__", StringComparison.Ordinal));
                if (!clip) continue;
                importedClips.Add((clipName, clip));
            }
            if (importedClips.Count == 3)
            foreach (var pair in importedClips)
            {
                var clipName = pair.Item1;
                var clip = pair.Item2;
                var state = stateMachine.AddState(clipName);
                state.motion = clip;
                if (clipName == "Idle") idle = state;
            }
            if (idle)
            {
                stateMachine.defaultState = idle;
                var animator = instance.GetComponent<Animator>();
                // Imported model roots can expose a managed Animator wrapper
                // whose native component has already been stripped. Unity's
                // bool check detects that state; C# null coalescing does not.
                if (!animator) animator = instance.AddComponent<Animator>();
                animator.runtimeAnimatorController = controller;
                animator.applyRootMotion = false;
            }
            else Debug.LogWarning(
                "Pilot mesh imported, but Unity did not expose the FBX animation takes. " +
                "The accepted Idle/Walk/Run clip FBXs remain in Assets/Art/Generated.");
            var path = Generated + "/IndependentPilot.prefab";
            var prefab = PrefabUtility.SaveAsPrefabAsset(instance, path);
            UnityEngine.Object.DestroyImmediate(instance);
            return prefab;
        }

        static void CreateShell()
        {
            const float width = 46, depth = 34, height = 15;
            var floor = Material("Hangar floor",
                "architecture/hangar-floor-diffusion-4k-v1.png", Color.white, 0, .12f,
                new Color(.16f, .16f, .16f));
            floor.mainTextureScale = new Vector2(6, 4.5f);
            var wall = Material("Hangar wall",
                "terrain/breakwater-field-surface-diffusion-4k-v1.png",
                new Color(.82f, .85f, .86f), .12f, .26f, new Color(.18f, .18f, .18f));
            wall.mainTextureScale = new Vector2(6, 1);
            var roof = Material("Hangar roof",
                "terrain/breakwater-field-surface-diffusion-4k-v1.png",
                new Color(.58f, .61f, .63f), .20f, .24f, new Color(.025f, .025f, .025f));
            roof.mainTextureScale = new Vector2(6, 4.5f);
            var beam = Material("Graphite hangar structure",
                "ui_and_briefing/aviation-hardware-diffusion-4k-v1.png",
                new Color(.50f, .55f, .60f), .62f, .48f, new Color(.08f, .09f, .10f));
            Cube("Floor", new Vector3(0, -.18f, 0), new Vector3(width * 2, .35f, depth * 2), floor);
            Cube("Roof", new Vector3(0, height + .2f, 0), new Vector3(width * 2, .45f, depth * 2), roof);
            Cube("Back wall", new Vector3(0, height / 2, -depth), new Vector3(width * 2, height, .55f), wall);
            Cube("Left wall", new Vector3(-width, height / 2, 0), new Vector3(.55f, height, depth * 2), wall);
            Cube("Right wall", new Vector3(width, height / 2, 0), new Vector3(.55f, height, depth * 2), wall);
            for (var t = -3; t <= 3; t++)
            {
                Cube($"Roof truss {t}", new Vector3(0, height - .8f, t * 9),
                    new Vector3(width * 2, .7f, .7f), beam);
                for (var side = -1; side <= 1; side += 2)
                {
                    var brace = Cube($"Roof brace {t} {side}",
                        new Vector3(side * width * .48f, height - 3.7f, t * 9),
                        new Vector3(1.2f, .42f, 13), beam);
                    brace.transform.rotation = Quaternion.Euler(0, 0, side * 41.25f);
                }
            }
            for (var z = -27; z <= 27; z += 9)
            for (var side = -1; side <= 1; side += 2)
                Cube($"Wall rib {z} {side}", new Vector3(side * (width - .7f), height / 2, z),
                    new Vector3(.9f, height, .85f), beam);
            CreateBays(beam);
            CreateBoard(beam);
            var door = Material("Open hangar daylight", null,
                new Color(.62f, .78f, .91f), 0, .05f,
                new Color(.40f, .61f, .82f));
            Quad("Open flight line", new Vector3(0, (height - 2) / 2, depth - .42f),
                new Vector2(width * 2 - 14, height - 2), Quaternion.Euler(0, 180, 0), door);
            Cube("Door jamb left", new Vector3(-(width - 3.5f), height / 2, depth - .4f),
                new Vector3(7, height, 1.2f), wall);
            Cube("Door jamb right", new Vector3(width - 3.5f, height / 2, depth - .4f),
                new Vector3(7, height, 1.2f), wall);
            Cube("Door lintel", new Vector3(0, height - 1, depth - .4f),
                new Vector3(width * 2, 2, 1.2f), wall);
        }

        static void CreateBays(Material structure)
        {
            var blue = Material("Vanguard bay light", null,
                new Color(.31f, .76f, 1), .1f, .7f, new Color(.04f, .40f, .68f));
            var red = Material("Inferno bay light", null,
                new Color(1, .42f, .36f), .1f, .7f, new Color(.66f, .10f, .05f));
            var ringMesh = BuildRing(11, 12.2f, 44);
            foreach (var pair in new[] { (-17f, blue, "Vanguard"), (17f, red, "Inferno") })
            {
                var ring = new GameObject(pair.Item3 + " bay marking");
                ring.AddComponent<MeshFilter>().sharedMesh = ringMesh;
                ring.AddComponent<MeshRenderer>().sharedMaterial = pair.Item2;
                ring.transform.position = new Vector3(pair.Item1, .04f, -9);
                ring.transform.rotation = Quaternion.Euler(90, 0, 0);
                Cube(pair.Item3 + " lamp housing", new Vector3(pair.Item1, 13.78f, -9),
                    new Vector3(6.5f, .32f, 2.1f), structure);
                var light = new GameObject(pair.Item3 + " bay lamp").AddComponent<Light>();
                light.type = LightType.Point;
                light.color = new Color(1, .95f, .84f);
                light.intensity = 58f;
                light.range = 27;
                light.shadows = LightShadows.Soft;
                light.transform.position = new Vector3(pair.Item1, 12.8f, -9);
            }
        }

        static void CreateBoard(Material frame)
        {
            Cube("Campaign board frame", new Vector3(0, 7.1f, -33.5f),
                new Vector3(16, 16, .5f), frame);
            var board = Material("Campaign board screen",
                "ui_and_briefing/flight-briefing-board-diffusion-4k-v1.png",
                Color.white, .05f, .42f);
            Quad("Campaign board", new Vector3(0, 7.1f, -33.20f),
                new Vector2(15, 15), Quaternion.Euler(0, 180, 0), board);
            var title = new GameObject("Campaign board copy").AddComponent<TextMesh>();
            title.text = "ARENA LEAGUE — CORE RUN\n\n" +
                "TWO LEAGUE FLIGHTS. ONE ARENA CORE ADRIFT AT MIDFIELD.\n\n" +
                "DELIVER IT THROUGH THE SCORING RING.\nKEEP IT MOVING.\n\n" +
                "NOBODY MAKES THE RUN ALONE.";
            title.fontSize = 34;
            title.characterSize = .105f;
            title.color = new Color(.34f, .76f, .70f);
            title.anchor = TextAnchor.UpperCenter;
            title.alignment = TextAlignment.Center;
            title.transform.position = new Vector3(0, 11.7f, -32.88f);
            title.transform.rotation = Quaternion.Euler(0, 180, 0);
        }

        static void CreateHangarDetails(GameObject source)
        {
            var detail = (GameObject)PrefabUtility.InstantiatePrefab(source);
            detail.name = "Authored Breakwater Hangar Detail";
            foreach (var renderer in detail.GetComponentsInChildren<Renderer>(true))
            {
                var key = renderer.sharedMaterial ? renderer.sharedMaterial.name.ToLowerInvariant() : "";
                renderer.sharedMaterial = key.Contains("orange")
                    ? Material("Safety orange", null, new Color(.9f, .38f, .10f), .34f, .46f)
                    : key.Contains("light")
                        ? Material("Hangar work light", null, new Color(1, .86f, .60f), .1f, .78f,
                            new Color(.32f, .18f, .055f))
                        : Material("Hangar metal detail",
                            "architecture/hangar-metal-diffusion-v1.png",
                            new Color(.58f, .62f, .65f), .68f, .42f);
            }
        }

        static void CreateAircraftDisplays(GameObject source)
        {
            foreach (var pair in new[]
                     {
                         (-17f, new Color(.31f, .76f, 1), "Vanguard"),
                         (17f, new Color(1, .42f, .36f), "Inferno")
                     })
            {
                var aircraft = (GameObject)PrefabUtility.InstantiatePrefab(source);
                aircraft.name = pair.Item3 + " Kestrel";
                aircraft.transform.SetPositionAndRotation(new Vector3(pair.Item1, 1.9f, -9),
                    Quaternion.Euler(-2.3f, 180, 0));
                var surface = Material(pair.Item3 + " aircraft display",
                    pair.Item3 == "Vanguard"
                        ? "aircraft/vanguard-surface-diffusion-4k-v1.png"
                        : "aircraft/inferno-surface-diffusion-4k-v1.png",
                    Color.white, .36f, .62f);
                foreach (var renderer in aircraft.GetComponentsInChildren<Renderer>(true))
                    renderer.sharedMaterial = surface;
                CreateGear(aircraft.transform);
            }
        }

        static void CreateGear(Transform parent)
        {
            var gear = Material("Landing gear",
                "ui_and_briefing/aviation-hardware-diffusion-4k-v1.png",
                new Color(.34f, .38f, .41f), .7f, .48f);
            foreach (var offset in new[] { new Vector2(0, -3.4f), new Vector2(-3.2f, 1.2f), new Vector2(3.2f, 1.2f) })
            {
                var leg = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
                leg.name = "Landing gear strut";
                leg.transform.SetParent(parent, false);
                leg.transform.localPosition = new Vector3(offset.x, -1, offset.y);
                leg.transform.localScale = new Vector3(.16f, .95f, .16f);
                leg.GetComponent<Renderer>().sharedMaterial = gear;
                UnityEngine.Object.DestroyImmediate(leg.GetComponent<Collider>());
            }
        }

        static void CreateCamera(GameObject player, HangarUiController interfaceController)
        {
            var cameraObject = new GameObject("Hangar Camera");
            cameraObject.tag = "MainCamera";
            var camera = cameraObject.AddComponent<Camera>();
            camera.fieldOfView = 58;
            camera.nearClipPlane = .1f;
            camera.farClipPlane = 700;
            camera.allowHDR = true;
            cameraObject.AddComponent<AudioListener>();
            cameraObject.transform.position = new Vector3(0, 3.35f, 30.6f);
            cameraObject.transform.rotation = Quaternion.Euler(0, 180, 0);
            var walker = cameraObject.AddComponent<HangarWalker>();
            var serialized = new SerializedObject(walker);
            serialized.FindProperty("avatar").objectReferenceValue = player.transform;
            serialized.FindProperty("animator").objectReferenceValue = player.GetComponent<Animator>();
            serialized.FindProperty("hangarUi").objectReferenceValue = interfaceController;
            serialized.ApplyModifiedPropertiesWithoutUndo();
        }

        static HangarUiController CreateInterface()
        {
            var panelPath = Generated + "/HangarPanelSettings.asset";
            var settings = AssetDatabase.LoadAssetAtPath<PanelSettings>(panelPath);
            if (!settings)
            {
                settings = ScriptableObject.CreateInstance<PanelSettings>();
                settings.name = "Airbourne Arena Hangar Panel";
                settings.scaleMode = PanelScaleMode.ScaleWithScreenSize;
                settings.referenceResolution = new Vector2Int(1600, 900);
                settings.screenMatchMode = PanelScreenMatchMode.MatchWidthOrHeight;
                settings.match = .5f;
                AssetDatabase.CreateAsset(settings, panelPath);
            }
            var ui = new GameObject("Hangar Interface");
            var document = ui.AddComponent<UIDocument>();
            document.panelSettings = settings;
            document.visualTreeAsset = AssetDatabase.LoadAssetAtPath<VisualTreeAsset>(
                "Assets/AirbourneArena/Runtime/UI/HangarUi.uxml");
            document.sortingOrder = 20;
            return ui.AddComponent<HangarUiController>();
        }

        static void ConfigureEnvironment()
        {
            RenderSettings.ambientMode = AmbientMode.Trilight;
            RenderSettings.ambientSkyColor = new Color(.30f, .35f, .41f);
            RenderSettings.ambientEquatorColor = new Color(.38f, .44f, .50f);
            RenderSettings.ambientGroundColor = new Color(.18f, .21f, .24f);
            RenderSettings.ambientIntensity = .92f;
            RenderSettings.fog = true;
            RenderSettings.fogMode = FogMode.ExponentialSquared;
            RenderSettings.fogColor = new Color(.031f, .055f, .082f);
            RenderSettings.fogDensity = .0075f;
            var ambient = new GameObject("Hangar ambient").AddComponent<Light>();
            ambient.type = LightType.Directional;
            ambient.intensity = .44f;
            ambient.color = new Color(.55f, .66f, .78f);
            ambient.transform.rotation = Quaternion.Euler(52, 160, 0);
            var door = new GameObject("Flight line daylight").AddComponent<Light>();
            door.type = LightType.Directional;
            door.intensity = .62f;
            door.color = new Color(.74f, .85f, .95f);
            door.transform.rotation = Quaternion.Euler(22, 180, 0);
            for (var z = -22; z <= 20; z += 21)
            {
                var fill = new GameObject($"Hangar ceiling fill {z}").AddComponent<Light>();
                fill.type = LightType.Point;
                fill.intensity = 72;
                fill.range = 34;
                fill.color = new Color(.78f, .86f, .94f);
                fill.shadows = LightShadows.None;
                fill.transform.position = new Vector3(0, 12, z);
            }
        }

        static GameObject Cube(string name, Vector3 position, Vector3 scale, Material material)
        {
            var value = GameObject.CreatePrimitive(PrimitiveType.Cube);
            value.name = name;
            value.transform.position = position;
            value.transform.localScale = scale;
            value.GetComponent<Renderer>().sharedMaterial = material;
            UnityEngine.Object.DestroyImmediate(value.GetComponent<Collider>());
            return value;
        }

        static GameObject Quad(string name, Vector3 position, Vector2 scale,
            Quaternion rotation, Material material)
        {
            var value = GameObject.CreatePrimitive(PrimitiveType.Quad);
            value.name = name;
            value.transform.SetPositionAndRotation(position, rotation);
            value.transform.localScale = new Vector3(scale.x, scale.y, 1);
            value.GetComponent<Renderer>().sharedMaterial = material;
            UnityEngine.Object.DestroyImmediate(value.GetComponent<Collider>());
            return value;
        }

        static Mesh BuildRing(float inner, float outer, int segments)
        {
            var mesh = new Mesh { name = "Hangar Bay Ring" };
            var vertices = new Vector3[segments * 2];
            var triangles = new int[segments * 6];
            for (var i = 0; i < segments; i++)
            {
                var angle = i * Mathf.PI * 2 / segments;
                vertices[i * 2] = new Vector3(Mathf.Cos(angle) * inner,
                    Mathf.Sin(angle) * inner, 0);
                vertices[i * 2 + 1] = new Vector3(Mathf.Cos(angle) * outer,
                    Mathf.Sin(angle) * outer, 0);
                var next = (i + 1) % segments;
                var triangle = i * 6;
                triangles[triangle] = i * 2;
                triangles[triangle + 1] = next * 2;
                triangles[triangle + 2] = next * 2 + 1;
                triangles[triangle + 3] = i * 2;
                triangles[triangle + 4] = next * 2 + 1;
                triangles[triangle + 5] = i * 2 + 1;
            }
            mesh.vertices = vertices;
            mesh.triangles = triangles;
            mesh.RecalculateNormals();
            mesh.RecalculateBounds();
            return mesh;
        }

        static Material Material(string name, string texture, Color color,
            float metallic, float smoothness, Color? emission = null)
        {
            var safe = string.Concat(name.Select(character =>
                Path.GetInvalidFileNameChars().Contains(character) ? '_' : character));
            var path = Materials + "/" + safe + ".mat";
            var value = AssetDatabase.LoadAssetAtPath<Material>(path);
            var shader = Shader.Find("Universal Render Pipeline/Lit") ??
                throw new InvalidOperationException("URP Lit shader is unavailable");
            if (!value)
            {
                value = new Material(shader) { name = name };
                AssetDatabase.CreateAsset(value, path);
            }
            value.shader = shader;
            value.color = color;
            value.SetColor("_BaseColor", color);
            value.SetFloat("_Metallic", metallic);
            value.SetFloat("_Smoothness", smoothness);
            value.SetTexture("_BaseMap", string.IsNullOrEmpty(texture)
                ? Texture2D.whiteTexture
                : RequireTexture(Textures + "/" + texture));
            if (emission.HasValue && emission.Value.maxColorComponent > 0)
            {
                if (!string.IsNullOrEmpty(texture))
                    value.SetTexture("_EmissionMap", RequireTexture(Textures + "/" + texture));
                value.SetColor("_EmissionColor", emission.Value);
                value.EnableKeyword("_EMISSION");
            }
            else
            {
                value.SetTexture("_EmissionMap", null);
                value.DisableKeyword("_EMISSION");
            }
            EditorUtility.SetDirty(value);
            return value;
        }

        static GameObject RequireModel(string path) =>
            AssetDatabase.LoadAssetAtPath<GameObject>(path) ??
            throw new FileNotFoundException($"Missing Unity model: {path}");

        static Texture2D RequireTexture(string path) =>
            AssetDatabase.LoadAssetAtPath<Texture2D>(path) ??
            throw new FileNotFoundException($"Missing Unity texture: {path}");

        static void ValidateTriangleCount(GameObject model, int minimum, string label)
        {
            long triangles = 0;
            foreach (var filter in model.GetComponentsInChildren<MeshFilter>(true))
                if (filter.sharedMesh)
                    triangles += filter.sharedMesh.triangles.LongLength / 3;
            foreach (var renderer in model.GetComponentsInChildren<SkinnedMeshRenderer>(true))
                if (renderer.sharedMesh)
                    triangles += renderer.sharedMesh.triangles.LongLength / 3;
            if (triangles < minimum)
                throw new InvalidDataException(
                    $"{label} imported only {triangles:N0} triangles; expected {minimum:N0}.");
            Debug.Log($"UNITY_MESH_GATE {label}={triangles:N0} triangles");
        }
    }
}
