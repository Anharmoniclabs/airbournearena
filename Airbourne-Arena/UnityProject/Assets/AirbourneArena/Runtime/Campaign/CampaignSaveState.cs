using System;
using System.Collections.Generic;
using System.Globalization;
using UnityEngine;

namespace AirbourneArena.Campaign
{
    [Serializable]
    public sealed class CampaignValueEntry
    {
        public string key;
        public string type;
        public string text;
        public double number;
        public bool boolean;

        public object Read() => type switch
        {
            "bool" => boolean,
            "number" => number,
            "null" => null,
            _ => text
        };

        public static CampaignValueEntry From(string key, object value)
        {
            var entry = new CampaignValueEntry { key = key };
            switch (value)
            {
                case null:
                    entry.type = "null";
                    break;
                case bool flag:
                    entry.type = "bool";
                    entry.boolean = flag;
                    break;
                case byte or sbyte or short or ushort or int or uint or long or ulong or
                    float or double or decimal:
                    entry.type = "number";
                    entry.number = Convert.ToDouble(value, CultureInfo.InvariantCulture);
                    break;
                default:
                    entry.type = "string";
                    entry.text = Convert.ToString(value, CultureInfo.InvariantCulture);
                    break;
            }
            return entry;
        }
    }

    [Serializable]
    public sealed class CampaignSaveState
    {
        public const int CurrentVersion = 1;
        public int version = CurrentVersion;
        public int chapter = 1;
        public string mission = "ch1_m1";
        public List<string> completed = new();
        public List<CampaignValueEntry> flags = new();
        public List<CampaignValueEntry> rep = Defaults(
            "vanguard", "tempest", "inferno", "independent", "civilian", "blackwing");
        public List<CampaignValueEntry> trust = Defaults("aras", "mercer", "serrano", "nyx");
        public List<CampaignValueEntry> trials = new();
        public List<CampaignValueEntry> loadout = new()
        {
            CampaignValueEntry.From("engine", "turbine"),
            CampaignValueEntry.From("wings", "stable"),
            CampaignValueEntry.From("armor", "light"),
            CampaignValueEntry.From("primary", "machine"),
            CampaignValueEntry.From("power", null)
        };
        public double unity;
        public double credits;
        public string ending;

        public Dictionary<string, object> ToInterpreterSave()
        {
            return new Dictionary<string, object>(StringComparer.Ordinal)
            {
                ["version"] = (double)version,
                ["chapter"] = (double)chapter,
                ["mission"] = mission,
                ["completed"] = Box(completed),
                ["flags"] = ToDictionary(flags),
                ["rep"] = ToDictionary(rep),
                ["trust"] = ToDictionary(trust),
                ["unity"] = unity,
                ["credits"] = credits,
                ["trials"] = ToDictionary(trials),
                ["ending"] = string.IsNullOrEmpty(ending) ? null : ending,
                ["loadout"] = ToDictionary(loadout)
            };
        }

        public void Capture(Dictionary<string, object> value)
        {
            version = Number(value, "version", CurrentVersion);
            chapter = Number(value, "chapter", 1);
            mission = Text(value, "mission", "ch1_m1");
            unity = NumberDouble(value, "unity");
            credits = NumberDouble(value, "credits");
            ending = Text(value, "ending", null);
            completed = Strings(value, "completed");
            flags = Entries(value, "flags");
            rep = Entries(value, "rep");
            trust = Entries(value, "trust");
            trials = Entries(value, "trials");
            loadout = Entries(value, "loadout");
        }

        static List<CampaignValueEntry> Defaults(params string[] keys)
        {
            var result = new List<CampaignValueEntry>(keys.Length);
            foreach (var key in keys) result.Add(CampaignValueEntry.From(key, 0d));
            return result;
        }

        static List<object> Box(List<string> values)
        {
            var result = new List<object>(values?.Count ?? 0);
            if (values != null)
                foreach (var value in values) result.Add(value);
            return result;
        }

        static Dictionary<string, object> ToDictionary(List<CampaignValueEntry> entries)
        {
            var result = new Dictionary<string, object>(StringComparer.Ordinal);
            if (entries == null) return result;
            foreach (var entry in entries)
                if (entry != null && !string.IsNullOrEmpty(entry.key)) result[entry.key] = entry.Read();
            return result;
        }

        static List<CampaignValueEntry> Entries(Dictionary<string, object> source, string key)
        {
            var result = new List<CampaignValueEntry>();
            if (!source.TryGetValue(key, out var raw) ||
                raw is not Dictionary<string, object> values) return result;
            foreach (var pair in values) result.Add(CampaignValueEntry.From(pair.Key, pair.Value));
            return result;
        }

        static List<string> Strings(Dictionary<string, object> source, string key)
        {
            var result = new List<string>();
            if (!source.TryGetValue(key, out var raw) || raw is not List<object> values) return result;
            foreach (var value in values) result.Add(Convert.ToString(value, CultureInfo.InvariantCulture));
            return result;
        }

        static int Number(Dictionary<string, object> source, string key, int fallback) =>
            source.TryGetValue(key, out var value) && value != null
                ? Convert.ToInt32(value, CultureInfo.InvariantCulture)
                : fallback;

        static double NumberDouble(Dictionary<string, object> source, string key) =>
            source.TryGetValue(key, out var value) && value != null
                ? Convert.ToDouble(value, CultureInfo.InvariantCulture)
                : 0;

        static string Text(Dictionary<string, object> source, string key, string fallback) =>
            source.TryGetValue(key, out var value) && value != null
                ? Convert.ToString(value, CultureInfo.InvariantCulture)
                : fallback;
    }

    public static class CampaignProgressStore
    {
        public const string SaveKey = "airbourne:unity-save";

        public static CampaignSaveState Load()
        {
            try
            {
                var json = PlayerPrefs.GetString(SaveKey, string.Empty);
                if (string.IsNullOrEmpty(json)) return new CampaignSaveState();
                var save = JsonUtility.FromJson<CampaignSaveState>(json);
                return save != null && save.version == CampaignSaveState.CurrentVersion
                    ? save
                    : new CampaignSaveState();
            }
            catch (Exception exception)
            {
                Debug.LogWarning($"Campaign save was reset: {exception.Message}");
                return new CampaignSaveState();
            }
        }

        public static void Save(CampaignSaveState state)
        {
            if (state == null) throw new ArgumentNullException(nameof(state));
            PlayerPrefs.SetString(SaveKey, JsonUtility.ToJson(state));
            PlayerPrefs.Save();
        }
    }
}
