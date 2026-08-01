using UnityEditor;
using UnityEngine;

namespace AirbourneArena.Editor
{
    public sealed class UnityAssetImport : AssetPostprocessor
    {
        public static void ReimportBriefingBoard()
        {
            AssetDatabase.ImportAsset(
                "Assets/Art/Textures/ui_and_briefing/flight-briefing-board-diffusion-4k-v1.png",
                ImportAssetOptions.ForceUpdate | ImportAssetOptions.ForceSynchronousImport);
            AssetDatabase.SaveAssets();
        }

        void OnPreprocessModel()
        {
            if (!assetPath.StartsWith("Assets/Art/Generated/")) return;
            var importer = (ModelImporter)assetImporter;
            var pilotLocomotionClip = assetPath.Contains("/starter-coast-pilot-") &&
                !assetPath.EndsWith("-rig-v1.fbx");
            importer.globalScale = 1;
            // Aircraft and environment FBXs are rigid and should not carry
            // Blender actions into WebGL. The pilot locomotion FBXs are the
            // deliberate exception: each contains one accepted named take.
            importer.importAnimation = pilotLocomotionClip;
            if (pilotLocomotionClip)
            {
                importer.animationType = ModelImporterAnimationType.Generic;
                importer.avatarSetup = ModelImporterAvatarSetup.CreateFromThisModel;
                importer.animationCompression = ModelImporterAnimationCompression.Optimal;
                importer.optimizeGameObjects = false;
            }
            importer.importCameras = false;
            importer.importLights = false;
            importer.isReadable = false;
            importer.meshCompression = ModelImporterMeshCompression.Medium;
            importer.optimizeMeshPolygons = true;
            importer.optimizeMeshVertices = true;
        }

        void OnPreprocessTexture()
        {
            if (!assetPath.StartsWith("Assets/Art/Textures/")) return;
            var importer = (TextureImporter)assetImporter;
            importer.textureType = TextureImporterType.Default;
            importer.sRGBTexture = true;
            importer.mipmapEnabled = true;
            importer.wrapMode = TextureWrapMode.Repeat;
            importer.filterMode = FilterMode.Trilinear;
            importer.anisoLevel = 4;
            importer.textureCompression = TextureImporterCompression.Compressed;
            var settings = importer.GetPlatformTextureSettings("WebGL");
            settings.overridden = true;
            settings.format = TextureImporterFormat.DXT1;
            settings.textureCompression = TextureImporterCompression.Compressed;
            settings.compressionQuality = 65;
            if (assetPath.EndsWith("flight-briefing-board-diffusion-4k-v1.png"))
            {
                // This panel occupies a small part of a 960p WebGL frame. Its
                // live TextMesh supplies the readable copy, so a 256px frame
                // texture is visually sufficient and keeps first load below
                // the hard 25 MiB budget.
                importer.mipmapEnabled = false;
                importer.wrapMode = TextureWrapMode.Clamp;
                importer.anisoLevel = 1;
                settings.maxTextureSize = 256;
            }
            importer.SetPlatformTextureSettings(settings);
        }
    }
}
