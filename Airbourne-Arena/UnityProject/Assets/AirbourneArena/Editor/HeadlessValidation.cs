using System;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using AirbourneArena.Flight;
using AirbourneArena.VerticalSlice;
using UnityEditor;
using UnityEngine;

namespace AirbourneArena.EditorTools
{
    /// Runs the EditMode suite and exercises the round pool without the test
    /// runner, so a machine with no Unity licence can still verify the project.
    ///
    /// `-runTests` is gated: the editor loads the project, compiles every
    /// assembly, then stops at "No valid Unity Editor license found" before the
    /// runner starts — and still exits 0, so a CI step that trusts the exit code
    /// reports success for a suite that never ran. `-executeMethod` runs on the
    /// same loaded domain with the compiled test assembly already in it, so the
    /// tests can be invoked directly.
    ///
    /// This is deliberately a plain reflection driver over [Test]/[TestCase] and
    /// [SetUp] — the attributes these fixtures actually use. It is not an NUnit
    /// replacement and should not grow into one; if the fixtures start using
    /// [TestCaseSource], [Values] or [UnityTest], run the real runner instead.
    public static class HeadlessValidation
    {
        static int failures;

        public static void Run()
        {
            failures = 0;
            var ok = true;
            try
            {
                ok &= RunEditModeTests();
                ok &= ExerciseRoundPool();
                ok &= ReportWorldScale();
            }
            catch (Exception e)
            {
                Console.WriteLine($"HEADLESS: unhandled {e}");
                ok = false;
            }
            Console.WriteLine(ok && failures == 0
                ? "HEADLESS: ALL PASS"
                : $"HEADLESS: FAILED ({failures} failure(s))");
            EditorApplication.Exit(ok && failures == 0 ? 0 : 1);
        }

        static bool RunEditModeTests()
        {
            var assembly = AppDomain.CurrentDomain.GetAssemblies()
                .FirstOrDefault(a => a.GetName().Name == "AirbourneArena.EditModeTests");
            if (assembly == null)
            {
                Console.WriteLine("HEADLESS: test assembly not loaded");
                failures++;
                return false;
            }

            var passed = 0;
            foreach (var type in assembly.GetTypes())
            {
                var methods = type.GetMethods(BindingFlags.Public | BindingFlags.Instance)
                    .Where(m => m.GetCustomAttributes()
                        .Any(a => a.GetType().Name is "TestAttribute" or "TestCaseAttribute"))
                    .ToArray();
                if (methods.Length == 0) continue;

                var setUp = type.GetMethods(BindingFlags.Public | BindingFlags.Instance)
                    .FirstOrDefault(m => m.GetCustomAttributes()
                        .Any(a => a.GetType().Name == "SetUpAttribute"));

                foreach (var method in methods)
                {
                    // One [TestCase] attribute is one case; a bare [Test] is a
                    // single case with no arguments.
                    var cases = method.GetCustomAttributes()
                        .Where(a => a.GetType().Name == "TestCaseAttribute")
                        .Select(a => (object[])a.GetType().GetProperty("Arguments")?.GetValue(a))
                        .ToList();
                    if (cases.Count == 0) cases.Add(null);

                    foreach (var args in cases)
                    {
                        var label = $"{type.Name}.{method.Name}"
                            + (args == null ? "" : $"({string.Join(", ", args)})");
                        try
                        {
                            var fixture = Activator.CreateInstance(type);
                            setUp?.Invoke(fixture, null);
                            method.Invoke(fixture, args);
                            passed++;
                        }
                        catch (TargetInvocationException e)
                        {
                            // The inner exception is the assertion; the wrapper
                            // is just reflection noise.
                            Console.WriteLine($"HEADLESS FAIL {label}: {e.InnerException?.Message}");
                            failures++;
                        }
                        catch (Exception e)
                        {
                            Console.WriteLine($"HEADLESS FAIL {label}: {e.Message}");
                            failures++;
                        }
                    }
                }
            }
            Console.WriteLine($"HEADLESS: EditMode {passed} passed, {failures} failed");
            return failures == 0;
        }

        /// The pool is the one piece of the parity work with no pure-C# test
        /// behind it: it needs a Mesh, a MeshFilter and a real component
        /// lifecycle. Awake and Update are private and edit mode does not call
        /// them, so they are invoked directly.
        static bool ExerciseRoundPool()
        {
            var before = failures;
            var host = new GameObject("HeadlessRoundPool");
            try
            {
                var pool = host.AddComponent<RoundPool>();
                Invoke(pool, "Awake");

                Check(pool.Live == 0, "pool starts empty");

                for (var i = 0; i < 12; i++)
                    pool.Fire(new Vector3(0, 500, i), new Vector3(0, 0, 780), 14, null, null, false);
                Check(pool.Live == 12, $"12 shots are live, got {pool.Live}");

                Invoke(pool, "Update");
                Check(pool.Live == 12, $"rounds survive a frame, got {pool.Live}");

                // The claim being tested is that a frame of flight allocates
                // nothing — that is the whole point of replacing the
                // GameObject-per-shot tracers.
                Invoke(pool, "Update");
                var start = GC.GetAllocatedBytesForCurrentThread();
                for (var i = 0; i < 120; i++) Invoke(pool, "Update");
                var perFrame = (GC.GetAllocatedBytesForCurrentThread() - start) / 120;
                // Reflection itself allocates an args array per Invoke, so this
                // is not expected to be zero — it is expected to be tiny and
                // flat. The old path allocated a GameObject, a LineRenderer and
                // a Material per shot.
                Check(perFrame < 512, $"a frame allocates {perFrame} bytes");

                var mesh = host.GetComponent<MeshFilter>().sharedMesh;
                Check(mesh != null, "pool built a mesh");
                Check(mesh.vertexCount == GunnerySolver.MaxRounds * 2,
                    $"mesh holds {GunnerySolver.MaxRounds * 2} vertices, got {mesh?.vertexCount}");
                Check(host.GetComponent<MeshRenderer>() != null, "pool has a renderer");

                // Firing past capacity must drop the shot, not grow the array
                // and not corrupt the count.
                for (var i = 0; i < GunnerySolver.MaxRounds + 40; i++)
                    pool.Fire(new Vector3(0, 500, 0), new Vector3(0, 0, 780), 14, null, null, false);
                Check(pool.Live <= GunnerySolver.MaxRounds,
                    $"pool caps at {GunnerySolver.MaxRounds}, got {pool.Live}");
            }
            catch (Exception e)
            {
                Console.WriteLine($"HEADLESS FAIL RoundPool: {e}");
                failures++;
            }
            finally
            {
                UnityEngine.Object.DestroyImmediate(host);
            }
            Console.WriteLine($"HEADLESS: RoundPool {(failures == before ? "passed" : "FAILED")}");
            return failures == before;
        }

        /// Does the world you can see agree with the ground you can hit?
        ///
        /// The browser's SIZE=7000 is not the size of the arena — it is a
        /// sliding window of terrain that updateTerrain(px,pz) recentres on the
        /// player every time it crosses a grid step, re-evaluating
        /// terrainHeight at each vertex. The world itself is unbounded and
        /// procedural, so comparing the authored FBX's extent against 7000
        /// compares an island against a view distance and means nothing.
        ///
        /// What does mean something: StarterCoastTerrain is the shared height
        /// function, and it is what FlightImpactSolver kills the player against
        /// and what ChaseCamera clears. If the visual mesh is at a different
        /// scale than that function, the aircraft clips through visible hills
        /// and dies on invisible ones — and every reading of height and speed
        /// against the scenery is off by the same factor.
        static bool ReportWorldScale()
        {
            const string path = "Assets/Art/Generated/starter-coast-world-authored-v2.fbx";
            var world = AssetDatabase.LoadAssetAtPath<GameObject>(path);
            if (world == null)
            {
                // Not a failure: the authored FBX is produced by
                // source/scripts/export-unity-assets.sh and is not in the repo.
                Console.WriteLine("HEADLESS: world FBX absent, scale not measured");
                return true;
            }

            var deviations = new List<float>();
            foreach (var filter in world.GetComponentsInChildren<MeshFilter>())
            {
                var mesh = filter.sharedMesh;
                if (mesh == null) continue;
                var vertices = mesh.vertices;
                // Sampling a prime stride avoids locking onto any regularity in
                // the mesh's own vertex ordering.
                for (var i = 0; i < vertices.Length; i += 37)
                {
                    var point = filter.transform.TransformPoint(vertices[i]);
                    deviations.Add(point.y -
                        (float)StarterCoastTerrain.Ground(point.x, point.z));
                }
            }
            if (deviations.Count == 0)
            {
                Console.WriteLine("HEADLESS FAIL: world FBX has no mesh vertices");
                failures++;
                return false;
            }

            // The world carries buildings, trees and gantries, all of which sit
            // legitimately above the ground. The ground itself is the bulk of
            // the geometry, so the median vertex should be close to the height
            // function; a systematic scale error moves the median far off it.
            deviations.Sort();
            var median = deviations[deviations.Count / 2];
            var terrainScale = StarterCoastTerrain.Ground(0, 0);
            Console.WriteLine($"HEADLESS: world vs collision height, median offset "
                + $"{median:0.0} units over {deviations.Count} samples "
                + $"(reference ground at origin {terrainScale:0.0})");
            return true;
        }

        static void Invoke(object target, string method) =>
            target.GetType().GetMethod(method, BindingFlags.NonPublic | BindingFlags.Instance)
                ?.Invoke(target, null);

        static void Check(bool condition, string what)
        {
            if (condition) return;
            Console.WriteLine($"HEADLESS FAIL: {what}");
            failures++;
        }
    }
}
