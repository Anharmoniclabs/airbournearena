using System;
using System.Collections.Generic;

namespace AirbourneArena.Campaign
{
    public sealed class CampaignDocument
    {
        readonly Dictionary<string, object> root;
        readonly List<object> missions;
        readonly Dictionary<string, Dictionary<string, object>> byId;

        CampaignDocument(Dictionary<string, object> root)
        {
            this.root = root;
            SchemaVersion = Convert.ToInt32(root["schemaVersion"]);
            missions = RequireList(root, "missions");
            byId = new Dictionary<string, Dictionary<string, object>>(StringComparer.Ordinal);
            foreach (var raw in missions)
            {
                var mission = raw as Dictionary<string, object> ??
                    throw new FormatException("Mission entry is not an object.");
                byId.Add(RequireString(mission, "id"), mission);
            }
            if (Convert.ToInt32(root["missionCount"]) != missions.Count)
                throw new FormatException("Campaign mission count does not match its payload.");
        }

        public int SchemaVersion { get; }
        public int MissionCount => missions.Count;
        public IReadOnlyList<object> Missions => missions;
        public IReadOnlyDictionary<string, object> Root => root;

        public static CampaignDocument Parse(string json)
        {
            var value = CampaignJson.Parse(json) as Dictionary<string, object> ??
                throw new FormatException("Campaign root is not an object.");
            return new CampaignDocument(value);
        }

        public Dictionary<string, object> Mission(string id) =>
            byId.TryGetValue(id, out var mission)
                ? mission
                : throw new KeyNotFoundException($"Unknown campaign mission '{id}'.");

        public static string RequireString(Dictionary<string, object> value, string key) =>
            value.TryGetValue(key, out var item) && item is string text
                ? text
                : throw new FormatException($"Expected string field '{key}'.");

        public static List<object> RequireList(Dictionary<string, object> value, string key) =>
            value.TryGetValue(key, out var item) && item is List<object> list
                ? list
                : throw new FormatException($"Expected array field '{key}'.");
    }
}
