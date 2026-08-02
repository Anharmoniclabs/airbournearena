using System.Text.Json;
using AirbourneArena.Flight;

// Gunnery parity mode: read cases, emit what GunnerySolver computes for each,
// so the browser's own interceptTime/interceptAim can be run over the same
// inputs and the two compared numerically rather than by reading both.
if (args.Length == 2 && args[0] == "--gunnery")
{
    var cases = JsonSerializer.Deserialize<GunCase[]>(File.ReadAllText(args[1]),
        new JsonSerializerOptions { PropertyNameCaseInsensitive = true })!;
    var results = new List<GunResult>();
    foreach (var c in cases)
    {
        var sp = new FlightVector(c.sp[0], c.sp[1], c.sp[2]);
        var sv = new FlightVector(c.sv[0], c.sv[1], c.sv[2]);
        var tp = new FlightVector(c.tp[0], c.tp[1], c.tp[2]);
        var tv = new FlightVector(c.tv[0], c.tv[1], c.tv[2]);
        var t = GunnerySolver.InterceptTime(sp, sv, tp, tv);
        var aim = GunnerySolver.InterceptAim(sp, sv, tp, tv, t);
        results.Add(new GunResult { t = t, aim = new[] { aim.x, aim.y, aim.z } });
    }
    Console.WriteLine(JsonSerializer.Serialize(results));
    return 0;
}

// Variable-delta parity. The runtime steps the aircraft once per rendered
// frame on Time.deltaTime clamped to .05, not on a fixed tick, so a fixed-rate
// fixture proves the equations and says nothing about the cadence the game
// actually runs at. This replays an explicit delta sequence so the browser can
// be driven through exactly the same one.
if (args.Length == 2 && args[0] == "--jitter")
{
    var deltas = JsonSerializer.Deserialize<double[]>(File.ReadAllText(args[1]))!;
    var jm = new FlightModel();
    var js = new FlightState();
    var jt = 0.0;
    var trace = new List<double[]>();
    for (var i = 0; i < deltas.Length; i++)
    {
        jm.Step(js, Schedule(jt), deltas[i]);
        jt += deltas[i];
        if ((i + 1) % 60 == 0)
            trace.Add(new[] { js.position.x, js.position.y, js.position.z,
                js.velocity.x, js.velocity.y, js.velocity.z,
                js.alpha, js.speed, js.gLoad });
    }
    Console.WriteLine(JsonSerializer.Serialize(trace));
    return 0;
}

if (args.Length != 1)
{
    Console.Error.WriteLine("Usage: dotnet run --project FlightParity.csproj -- <flight-golden.json>");
    return 2;
}

var golden = JsonSerializer.Deserialize<Golden>(File.ReadAllText(args[0]),
    new JsonSerializerOptions { PropertyNameCaseInsensitive = true })
    ?? throw new InvalidDataException("Could not read golden fixture");
var model = new FlightModel();
var state = new FlightState();
const double dt = 1.0 / 60.0;
var sampleIndex = 0;
for (var frame = 0; frame < 600; frame++)
{
    var t = frame * dt;
    FlightControls controls;
    if (t < 2) controls = new FlightControls { throttle = .75 };
    else if (t < 5) controls = new FlightControls {
        pitch = .38, roll = -.42, yaw = .08, throttle = 1
    };
    else if (t < 8) controls = new FlightControls {
        pitch = -.16, roll = .25, yaw = -.04, throttle = 1, burner = true
    };
    else controls = new FlightControls { pitch = .05, throttle = .62 };
    model.Step(state, controls, dt);
    if ((frame + 1) % 60 != 0) continue;
    var expected = golden.samples[sampleIndex++];
    Check(expected.position, state.position, expected.t, "position", 1e-4);
    Check(expected.velocity, state.velocity, expected.t, "velocity", 1e-4);
    CheckScalar(expected.alpha, state.alpha, expected.t, "alpha", 1e-6);
    CheckScalar(expected.speed, state.speed, expected.t, "speed", 1e-4);
    CheckScalar(expected.gLoad, state.gLoad, expected.t, "gLoad", 1e-6);
}
Console.WriteLine($"C# flight model matches all {sampleIndex} golden samples");
return 0;

static void Check(double[] expected, FlightVector actual, double t, string field, double tolerance)
{
    CheckScalar(expected[0], actual.x, t, field + ".x", tolerance);
    CheckScalar(expected[1], actual.y, t, field + ".y", tolerance);
    CheckScalar(expected[2], actual.z, t, field + ".z", tolerance);
}

static void CheckScalar(double expected, double actual, double t, string field, double tolerance)
{
    if (Math.Abs(expected - actual) > tolerance)
        throw new Exception($"t={t} {field}: expected {expected}, actual {actual}");
}

static FlightControls Schedule(double t)
{
    if (t < 2) return new FlightControls { throttle = .75 };
    if (t < 5) return new FlightControls { pitch = .38, roll = -.42, yaw = .08, throttle = 1 };
    if (t < 8) return new FlightControls { pitch = -.16, roll = .25, yaw = -.04, throttle = 1, burner = true };
    return new FlightControls { pitch = .05, throttle = .62 };
}

sealed class Golden
{
    public Sample[] samples { get; set; } = [];
}

sealed class Sample
{
    public double t { get; set; }
    public double[] position { get; set; } = [];
    public double[] velocity { get; set; } = [];
    public double alpha { get; set; }
    public double speed { get; set; }
    public double gLoad { get; set; }
}

sealed class GunCase
{
    public double[] sp { get; set; } = new double[3];
    public double[] sv { get; set; } = new double[3];
    public double[] tp { get; set; } = new double[3];
    public double[] tv { get; set; } = new double[3];
}
sealed class GunResult
{
    public double t { get; set; }
    public double[] aim { get; set; } = new double[3];
}
