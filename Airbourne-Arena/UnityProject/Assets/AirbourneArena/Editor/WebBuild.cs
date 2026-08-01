using System;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEditor.Build;
using UnityEditor.Build.Reporting;
using UnityEngine;

namespace AirbourneArena.Editor
{
    public static class WebBuild
    {
        const long FirstLoadBudget = 25L * 1024 * 1024;

        [MenuItem("Airbourne Arena/Configure WebGL")]
        public static void Configure()
        {
            PlayerSettings.companyName = "Airbourne Arena";
            PlayerSettings.productName = "Airbourne Arena Web";
            PlayerSettings.WebGL.compressionFormat = WebGLCompressionFormat.Brotli;
            PlayerSettings.WebGL.dataCaching = true;
            PlayerSettings.WebGL.decompressionFallback = false;
            var webTarget = NamedBuildTarget.FromBuildTargetGroup(BuildTargetGroup.WebGL);
            PlayerSettings.SetManagedStrippingLevel(webTarget,
                ManagedStrippingLevel.High);
            EditorUserBuildSettings.SwitchActiveBuildTarget(BuildTargetGroup.WebGL,
                BuildTarget.WebGL);
            AssetDatabase.SaveAssets();
            Debug.Log("Configured WebGL: Brotli, data caching, high managed stripping.");
        }

        public static void BuildFromCommandLine()
        {
            Configure();
            var output = Path.GetFullPath(Path.Combine(Application.dataPath,
                "../../../Builds/WebGL"));
            var scenes = EditorBuildSettings.scenes.Where(x => x.enabled)
                .Select(x => x.path).ToArray();
            if (scenes.Length == 0) throw new BuildFailedException("No enabled scene");
            var report = BuildPipeline.BuildPlayer(new BuildPlayerOptions {
                scenes = scenes,
                locationPathName = output,
                target = BuildTarget.WebGL,
                options = BuildOptions.None
            });
            if (report.summary.result != BuildResult.Succeeded)
                throw new BuildFailedException(report.summary.result.ToString());
            ValidateFirstLoad(output);
        }

        [MenuItem("Airbourne Arena/Validate Last WebGL Build")]
        public static void ValidateLastBuild()
        {
            var output = Path.GetFullPath(Path.Combine(Application.dataPath,
                "../../../Builds/WebGL"));
            ValidateFirstLoad(output);
        }

        static void ValidateFirstLoad(string output)
        {
            if (!Directory.Exists(output)) throw new DirectoryNotFoundException(output);
            var bytes = Directory.EnumerateFiles(output, "*", SearchOption.AllDirectories)
                .Where(IsInitialPayload).Sum(x => new FileInfo(x).Length);
            if (bytes > FirstLoadBudget)
                throw new BuildFailedException(
                    $"First-load payload {bytes / 1048576f:F1} MiB exceeds 25 MiB");
            Debug.Log($"WebGL first-load payload: {bytes / 1048576f:F1} MiB / 25 MiB");
        }

        static bool IsInitialPayload(string path)
        {
            var extension = Path.GetExtension(path).ToLowerInvariant();
            return extension is ".wasm" or ".data" or ".br" or ".js" or ".unityweb";
        }
    }
}
