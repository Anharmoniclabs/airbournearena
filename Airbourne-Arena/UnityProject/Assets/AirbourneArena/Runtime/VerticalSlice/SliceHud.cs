using System.Text;
using AirbourneArena.Flight;
using UnityEngine;

namespace AirbourneArena.VerticalSlice
{
    /// The slice HUD.
    ///
    /// Two things were wrong here beyond the layout. It carried its own copy of
    /// the intercept solver with MuzzleVelocity = 520 — the pre-parity number —
    /// so the lead pip was drawn for a gun the aircraft does not have, and
    /// pointed somewhere a round would never go. And it drew the pip for the
    /// *nearest* contact rather than the designated one, so with two drones up
    /// it advertised a solution for the one the player was not shooting at.
    /// Both are gone: the pip is whatever AircraftGuns already computed from
    /// GunnerySolver, for whatever the lock actually is.
    ///
    /// The rest is allocation. OnGUI runs every frame of every repaint, and
    /// this built seven GUIStyles inline in the draw path and interpolated a
    /// fresh string for every readout — on WebGL that is a collection every few
    /// seconds purely from drawing the numbers. Styles are now built once, and
    /// readouts rebuild their string only when the displayed value changes,
    /// which for an integer airspeed is a few times a second rather than sixty.
    public sealed class SliceHud : MonoBehaviour
    {
        UnityFlightBody body;
        PlayerFlightController controller;
        AircraftGuns guns;
        FirstFlightMission mission;

        GUIStyle micro, value, panelTitle, objective, centered, radio, muted;
        GUIStyle alertTitle, scoreBig, miniMap, miniMapArrow, reticleGlyph, lockLabel;
        Texture2D pixel;

        static readonly Color PanelColor = new(.025f, .10f, .15f, .88f);
        static readonly Color Teal = new(.25f, .95f, .86f, 1);
        static readonly Color Muted = new(.50f, .67f, .70f, 1);
        static readonly Color Orange = new(1f, .67f, .12f, 1);
        static readonly Color MiniMapGreen = new(.35f, .56f, .32f, 1);

        readonly Readout airspeed = new();
        readonly Readout altitude = new();
        readonly Readout attitude = new();
        readonly Readout clock = new();
        readonly Readout checkpoints = new();
        readonly Readout nextGate = new();
        readonly Readout rebuilding = new();

        public void Initialize(UnityFlightBody flightBody, PlayerFlightController flightController,
            AircraftGuns aircraftGuns, FirstFlightMission firstFlight)
        {
            body = flightBody; controller = flightController;
            guns = aircraftGuns; mission = firstFlight;
        }

        void OnGUI()
        {
            if (!body || mission == null) return;
            EnsureStyles();
            var scale = Mathf.Min(Screen.width / 1600f, Screen.height / 900f) *
                PlayerPrefs.GetFloat("airbourne.hudScale", 1);
            var oldMatrix = GUI.matrix;
            GUI.matrix = Matrix4x4.Scale(new Vector3(scale, scale, 1));
            var width = Screen.width / scale;
            var height = Screen.height / scale;

            if (body.LifeState == FlightLifeState.Rebuilding)
            {
                DrawRebuilding(width, height);
                GUI.matrix = oldMatrix;
                return;
            }
            DrawTelemetry();
            DrawScore(width);
            DrawConditions(width);
            DrawMissionBrief();
            DrawObjective(width);
            DrawRadio(height);
            DrawRoster(height);
            DrawMiniMap(width, height);
            DrawReticle(width, height);
            GUI.matrix = oldMatrix;
            DrawLead();
        }

        void DrawRebuilding(float width, float height)
        {
            var panel = new Rect(width * .5f - 260, height * .5f - 72, 520, 144);
            Panel(panel);
            GUI.Label(new Rect(panel.x, panel.y + 24, panel.width, 34),
                "AIRFRAME LOST", alertTitle);
            GUI.Label(new Rect(panel.x, panel.y + 66, panel.width, 30),
                rebuilding.Get(Mathf.CeilToInt((float)body.RebuildRemaining),
                    "REBUILDING AIRFRAME — "), centered);
            GUI.Label(new Rect(panel.x, panel.y + 103, panel.width, 20),
                "Terrain impact · Breakwater recovery crew inbound", micro);
        }

        void EnsureStyles()
        {
            if (micro != null) return;
            pixel = new Texture2D(1, 1, TextureFormat.RGBA32, false) {
                name = "HUD solid pixel",
                hideFlags = HideFlags.HideAndDontSave
            };
            pixel.SetPixel(0, 0, Color.white);
            pixel.Apply();
            micro = new GUIStyle(GUI.skin.label) {
                fontSize = 12, richText = true,
                normal = { textColor = Muted }
            };
            value = new GUIStyle(GUI.skin.label) {
                fontSize = 23, richText = true,
                normal = { textColor = Teal }
            };
            panelTitle = new GUIStyle(micro) { normal = { textColor = Orange } };
            objective = new GUIStyle(GUI.skin.label) {
                fontSize = 15, richText = true,
                normal = { textColor = Color.white }
            };
            centered = new GUIStyle(objective) { alignment = TextAnchor.MiddleCenter };
            radio = new GUIStyle(objective) { fontSize = 14 };
            muted = new GUIStyle(objective) { normal = { textColor = Muted } };

            // Everything below used to be constructed inside a draw call.
            alertTitle = new GUIStyle(centered) {
                fontSize = 26, normal = { textColor = Orange }
            };
            scoreBig = new GUIStyle(centered) { fontSize = 26 };
            miniMap = new GUIStyle(centered) {
                fontSize = 18, normal = { textColor = MiniMapGreen }
            };
            miniMapArrow = new GUIStyle(centered) { normal = { textColor = Teal } };
            reticleGlyph = new GUIStyle(centered) {
                fontSize = 35, normal = { textColor = Teal }
            };
            lockLabel = new GUIStyle(centered) {
                fontSize = 13, normal = { textColor = Orange }
            };
        }

        void DrawTelemetry()
        {
            var rect = new Rect(16, 16, 438, 102);
            Panel(rect);
            GUI.Label(new Rect(30, 24, 90, 20), "AIRSPEED", micro);
            GUI.Label(new Rect(126, 24, 90, 20), "ALTITUDE", micro);
            GUI.Label(new Rect(230, 24, 92, 20), "AOA / G", micro);
            GUI.Label(new Rect(335, 24, 90, 20), "AIRFRAME", micro);
            GUI.Label(new Rect(28, 42, 105, 32),
                airspeed.Get(Mathf.RoundToInt((float)(body.State.speed * 1.1)),
                    null, "<size=12>KTS</size>"), value);
            GUI.Label(new Rect(124, 42, 112, 32),
                altitude.Get(Mathf.RoundToInt((float)(body.State.position.y * 3.6)),
                    null, "<size=12>FT</size>"), value);
            // Tenths of a G are packed alongside whole degrees of alpha so the
            // pair shares one cache key and one rebuild.
            GUI.Label(new Rect(230, 42, 105, 32),
                attitude.GetAngleAndG(Mathf.RoundToInt((float)body.State.alpha * Mathf.Rad2Deg),
                    Mathf.RoundToInt((float)body.State.gLoad * 10)), value);
            GUI.Label(new Rect(334, 42, 95, 32), "100", value);
            Bar(new Rect(335, 76, 88, 5), 1, Teal);
            GUI.Label(new Rect(335, 83, 90, 16), "BURNER", micro);
            Bar(new Rect(335, 98, 88, 5), (float)body.BurnerFuel,
                body.BurnerLit ? Orange : Teal);
        }

        void DrawScore(float width)
        {
            var x = width * .5f - 165;
            Panel(new Rect(x, 14, 330, 80));
            GUI.Label(new Rect(x, 18, 330, 30),
                "<color=#5eeedc>0</color>  —  <color=#ff6262>0</color>", scoreBig);
            var remaining = Mathf.Max(0, 300 - Time.timeSinceLevelLoad);
            GUI.Label(new Rect(x, 48, 330, 18),
                clock.GetClock(Mathf.FloorToInt(remaining)), centered);
            GUI.Label(new Rect(x, 67, 330, 18), "<color=#ffad1f>CORE LOOSE · 2.45 KM</color>", centered);
            Panel(new Rect(x - 32, 106, 394, 28));
            GUI.Label(new Rect(x - 20, 108, 370, 24), "W     NW      N      093      E      SE", centered);
        }

        void DrawConditions(float width)
        {
            var x = width - 202;
            Panel(new Rect(x, 16, 186, 68));
            GUI.Label(new Rect(x + 12, 22, 162, 18), "CONDITIONS", micro);
            GUI.Label(new Rect(x + 12, 41, 162, 18), "CLEAR", centered);
            GUI.Label(new Rect(x + 12, 59, 162, 18), "WIND 010/08 · 14:01", micro);
        }

        void DrawMissionBrief()
        {
            Panel(new Rect(16, 132, 316, 112));
            GUI.Label(new Rect(30, 143, 270, 18), "FIRST SORTIE          01 / 06", panelTitle);
            GUI.Label(new Rect(30, 170, 274, 42),
                "Build speed and bank through the arena.", objective);
            GUI.Label(new Rect(30, 218, 270, 18), "W adds throttle. Hold A / D to tighten the turn.", micro);
        }

        void DrawObjective(float width)
        {
            var x = width - 314;
            Panel(new Rect(x, 104, 298, 168));
            GUI.Label(new Rect(x + 16, 114, 270, 20), "FIRST FLIGHT", panelTitle);
            var gate = mission.CurrentStage == FirstFlightMission.Stage.Gates;
            var drones = mission.CurrentStage == FirstFlightMission.Stage.Drones;
            var returning = mission.CurrentStage == FirstFlightMission.Stage.Return;
            GUI.Label(new Rect(x + 16, 143, 266, 22),
                gate ? "<color=#5eeedc>▸</color> FLY THE NAVIGATION GATES"
                     : "✓ FLY THE NAVIGATION GATES", objective);
            GUI.Label(new Rect(x + 16, 172, 266, 22),
                drones ? "<color=#5eeedc>▸</color> DESTROY THE PRACTICE DRONES"
                       : "○ DESTROY THE PRACTICE DRONES", muted);
            GUI.Label(new Rect(x + 16, 201, 266, 22),
                returning ? "<color=#5eeedc>▸</color> RETURN TO BREAKWATER FIELD"
                          : "○ RETURN TO BREAKWATER FIELD", muted);
            GUI.color = new Color(.25f, .95f, .86f, .28f);
            GUI.DrawTexture(new Rect(x + 16, 230, 266, 1), pixel);
            GUI.color = Color.white;
            if (gate)
            {
                GUI.Label(new Rect(x + 16, 237, 266, 18),
                    checkpoints.GetPair(mission.GateCount - mission.GatesRemaining,
                        mission.GateCount, "CHECKPOINTS  <color=#5eeedc>", " / ", "</color>"),
                    micro);
                GUI.Label(new Rect(x + 16, 254, 266, 18),
                    nextGate.GetHundredths(Mathf.RoundToInt(mission.NextGateDistance / 10f),
                        "NEXT  <color=#5eeedc>", " KM</color>"),
                    micro);
            }
            else GUI.Label(new Rect(x + 16, 239, 266, 18), mission.Objective, micro);
        }

        void DrawRadio(float height)
        {
            var y = height - 140;
            Panel(new Rect(16, y, 430, 82));
            GUI.Label(new Rect(32, y + 12, 390, 18), "MARA", panelTitle);
            GUI.Label(new Rect(32, y + 36, 390, 26),
                "Vanguard is fuelled. Take her up and stay off my roof.", radio);
        }

        void DrawRoster(float height)
        {
            var y = height - 58;
            Panel(new Rect(16, y, 344, 48));
            GUI.Label(new Rect(30, y + 5, 314, 16), "FLIGHT ROSTER", micro);
            GUI.Label(new Rect(30, y + 22, 314, 18),
                "<color=#5eeedc>● YOU</color>      100%    " +
                "<color=#718ca0>● GUARDIN  100%   ● YAGUANA  100%</color>", micro);
        }

        void DrawMiniMap(float width, float height)
        {
            var x = width - 188;
            var y = height - 188;
            Panel(new Rect(x, y, 172, 172));
            GUI.Label(new Rect(x, y + 22, 172, 112),
                "       ○ ○\n   ○  ◎  ○\n ○  ◎  ◉  ◎  ○\n   ○  ◎  ○\n       ○ ○", miniMap);
            GUI.Label(new Rect(x + 72, y + 74, 28, 24), "▲", miniMapArrow);
            GUI.Label(new Rect(x + 10, y + 146, 150, 16), "STARTER COAST", micro);
        }

        void DrawReticle(float width, float height)
        {
            GUI.Label(new Rect(width * .5f - 22, height * .5f - 30, 44, 60), "⊙", reticleGlyph);
            GUI.Label(new Rect(width * .5f - 140, height - 126, 280, 24),
                controller != null && !controller.PointerReady
                    ? "CLICK THE GAME TO ENABLE MOUSE STEERING"
                    : "MOVE THE MOUSE TO STEER · A / D TO TURN", centered);
            if (!guns || !guns.Lock) return;
            // The dwell is invisible otherwise: the box would appear and rounds
            // would still be ballistic with nothing on screen saying so.
            GUI.Label(new Rect(width * .5f - 90, height * .5f + 34, 180, 20),
                guns.Assisted ? "MAG LOCK" : "ACQUIRING", lockLabel);
            if (!guns.Assisted)
                Bar(new Rect(width * .5f - 34, height * .5f + 54, 68, 3),
                    guns.LockProgress, Orange);
        }

        void Panel(Rect rect)
        {
            GUI.color = PanelColor;
            GUI.DrawTexture(rect, pixel);
            GUI.color = Teal;
            GUI.DrawTexture(new Rect(rect.x, rect.y, 2, rect.height), pixel);
            GUI.color = Color.white;
        }

        void Bar(Rect rect, float amount, Color color)
        {
            GUI.color = new Color(.20f, .32f, .35f, 1);
            GUI.DrawTexture(rect, pixel);
            GUI.color = color;
            GUI.DrawTexture(new Rect(rect.x, rect.y, rect.width * Mathf.Clamp01(amount), rect.height), pixel);
            GUI.color = Color.white;
        }

        /// The lead pip, for the designated contact and the real gun. The
        /// solution itself is AircraftGuns' — computed once a frame from
        /// GunnerySolver rather than recomputed here from a different muzzle
        /// velocity, which is how the two came to disagree.
        void DrawLead()
        {
            if (!guns || guns.LeadPoint == null || !Camera.main) return;
            var screen = Camera.main.WorldToScreenPoint(guns.LeadPoint.Value);
            if (screen.z <= 0) return;
            GUI.Label(new Rect(screen.x - 14, Screen.height - screen.y - 17, 28, 34),
                "○", guns.Assisted ? lockLabel : objective);
        }

        void OnDestroy()
        {
            if (pixel) Destroy(pixel);
        }

        /// A readout that rebuilds its string only when the displayed value
        /// changes. Airspeed at 60 fps changes maybe a dozen times a second, so
        /// this removes roughly four fifths of the HUD's string traffic; a
        /// static readout like a full clock second removes 59 in 60.
        sealed class Readout
        {
            readonly StringBuilder builder = new(48);
            long key = long.MinValue;
            string cached = "";

            string Rebuild(long newKey)
            {
                key = newKey;
                cached = builder.ToString();
                builder.Clear();
                return cached;
            }

            bool Hit(long newKey) => key == newKey && cached.Length > 0;

            public string Get(int amount, string prefix, string suffix)
            {
                if (Hit(amount)) return cached;
                builder.Clear();
                if (prefix != null) builder.Append(prefix);
                builder.Append(amount);
                if (suffix != null) builder.Append(suffix);
                return Rebuild(amount);
            }

            public string Get(int amount, string prefix) => Get(amount, prefix, null);

            public string GetPair(int first, int second, string prefix, string separator, string suffix)
            {
                var composite = (long)first * 100000 + second;
                if (Hit(composite)) return cached;
                builder.Clear();
                builder.Append(prefix).Append(first).Append(separator).Append(second).Append(suffix);
                return Rebuild(composite);
            }

            /// "12°  3.4G" from whole degrees and tenths of a G.
            public string GetAngleAndG(int degrees, int tenthsOfG)
            {
                var composite = (long)degrees * 100000 + tenthsOfG;
                if (Hit(composite)) return cached;
                builder.Clear();
                builder.Append(degrees).Append("°  ")
                    .Append(tenthsOfG / 10).Append('.').Append(Mathf.Abs(tenthsOfG % 10))
                    .Append('G');
                return Rebuild(composite);
            }

            /// MM:SS, zero padded, from a whole number of seconds.
            public string GetClock(int seconds)
            {
                if (Hit(seconds)) return cached;
                builder.Clear();
                Pad(builder, seconds / 60).Append(':');
                Pad(builder, seconds % 60);
                return Rebuild(seconds);
            }

            /// A distance carried in hundredths, rendered as "0.00".
            public string GetHundredths(int hundredths, string prefix, string suffix)
            {
                if (Hit(hundredths)) return cached;
                builder.Clear();
                builder.Append(prefix).Append(hundredths / 100).Append('.');
                Pad(builder, Mathf.Abs(hundredths % 100));
                builder.Append(suffix);
                return Rebuild(hundredths);
            }

            static StringBuilder Pad(StringBuilder into, int value)
            {
                if (value < 10) into.Append('0');
                return into.Append(value);
            }
        }
    }
}
