using System;
using System.Collections.Generic;

namespace AirbourneArena.Campaign
{
    public readonly struct CampaignEnding
    {
        public CampaignEnding(string title, string text) =>
            (Title, Text) = (title, text);

        public string Title { get; }
        public string Text { get; }
    }

    public static class CampaignEndingResolver
    {
        public static CampaignEnding Decide(string choice, int unity, int alliedAces,
            int civilianReputation, int blackWingReputation, string ledgerChoice,
            bool nyxAlly, string pilotTeam)
        {
            choice = string.IsNullOrEmpty(choice) ? "limited" : choice;
            var team = pilotTeam == "blue" ? "VANGUARD" : "INFERNO";
            if (ledgerChoice == "veyr" && blackWingReputation >= 20 &&
                choice == "faction")
                return new CampaignEnding("THE QUIET SKY",
                    "The network survives, and so does the arrangement that built it. " +
                    "Traffic moves on time. Nobody files a complaint, because the system " +
                    "that would hear it is the system that would be complained about. You " +
                    "are the most trusted pilot in a sky that no longer asks anyone’s " +
                    "permission — including yours.");
            if (choice == "break")
                return new CampaignEnding("INDEPENDENT SKYWAYS",
                    "The Warden architecture comes apart into a hundred local agreements " +
                    "and not one central authority. The Skyways are slower, patchier and " +
                    "harder to abuse. Breakwater Field runs the northern coalition out of " +
                    "Mara’s office, which she claims to resent. The three teams are " +
                    "still powerful. They are no longer the only ones who decide.");
            if (choice == "council" && unity >= 40 && alliedAces >= 2)
                return new CampaignEnding("UNITED SKIES",
                    "Vanguard, Tempest and Inferno stay distinct and sit on the same " +
                    "council, with civilian seats they cannot outvote. You are its first " +
                    "field commander, which everyone involved finds slightly ridiculous and " +
                    "nobody contests. " + (nyxAlly
                        ? "Nyx testifies, serves eighteen months, and flies again."
                        : "Nyx’s name is on the memorial with the rest of them."));
            if (choice == "council")
                return new CampaignEnding("A COUNCIL, OF SORTS",
                    "The council forms, and it argues. Without the trust to back it, it " +
                    "is three delegations watching each other across a table and one " +
                    "independent trying to keep the floor. It holds — barely, and only " +
                    "because the alternative is still burning on the seabed.");
            if (choice == "faction")
                return team == "VANGUARD"
                    ? new CampaignEnding("VANGUARD ASCENDANCY",
                        "Vanguard takes primary responsibility for airspace security. The " +
                        "skies get measurably safer and measurably more watched. You are the " +
                        "best-known pilot in the service, which makes you the one person who " +
                        "can still argue with it from the inside.")
                    : new CampaignEnding("INFERNO ASCENDANCY",
                        "Inferno secures the major routes through sheer deterrence. Attacks " +
                        "fall away almost overnight. Strength becomes the language the whole " +
                        "region negotiates in, and you spend the rest of your career deciding " +
                        "what that strength is pointed at.");
            return new CampaignEnding("A LIMITED NETWORK",
                "What survives is an emergency system under independent oversight — " +
                "small, auditable, and switched off by default. It is nobody’s " +
                "victory and everybody’s compromise, which is why it lasts. " +
                (civilianReputation >= 40
                    ? "The settlements that were written off vote to fund it first."
                    : "The settlements watch it carefully, and say nothing yet."));
        }

        public static List<string> FinaleNotes(Dictionary<string, object> flags)
        {
            var notes = new List<string>();
            if (Bool(flags, "savedShuttle", out var savedShuttle))
                notes.Add(savedShuttle
                    ? "You covered the falling shuttle and let Nyx go."
                    : "You chased Nyx. The shuttle came down.");
            if (Has(flags, "ridgemouth"))
                notes.Add("Ridgemouth is on a supply run again, and remembers who flew it.");
            switch (Text(flags, "fragment"))
            {
                case "share": notes.Add("You put the Warden fragment in front of all three teams."); break;
                case "team": notes.Add("You handed the Warden fragment to your own team."); break;
                case "hide": notes.Add("A copy of the fragment is still under Mara’s floor."); break;
            }
            var rescuedAce = Text(flags, "rescuedAce");
            if (!string.IsNullOrEmpty(rescuedAce))
                notes.Add($"You reached {rescuedAce.ToUpperInvariant()} first on the night of the ace hunt.");
            if (Has(flags, "witness")) notes.Add("The engineer lived to testify.");
            var chain = Count(flags, "sawStolenTech", "falseFlagProof", "foundRelay", "witness");
            if (chain >= 4)
                notes.Add("You assembled the whole chain: stolen hardware, hulls in borrowed colours, an unfiled relay, and a witness.");
            else if (chain > 0)
                notes.Add($"You brought back {chain} of the four proofs against Black Wing.");
            if (Has(flags, "nodesDown")) notes.Add("The Warden nodes were down before the carrier ever arrived.");
            if (Has(flags, "carrierCrippled")) notes.Add("The carrier lost its engines over the Starter Coast.");
            if (Text(flags, "debut") == "win") notes.Add("You won your league debut.");
            if (Has(flags, "rescuedHauler")) notes.Add("The hauler crew off Starter Coast are still flying.");
            switch (Text(flags, "ledger"))
            {
                case "all": notes.Add("You published the whole ledger, your own team included."); break;
                case "half": notes.Add("You published enough to convict Black Wing and no more."); break;
                case "veyr": notes.Add("You handed the ledger to Cassian Veyr."); break;
            }
            if (Has(flags, "westField")) notes.Add("The west field is held.");
            if (Has(flags, "mastsUp")) notes.Add("Five independent masts are lit and off the network.");
            if (Has(flags, "cityHeld")) notes.Add("The central sky city never lost its civilian traffic.");
            if (Text(flags, "taskforce") == "united") notes.Add("The carrier was met by one joint task force.");
            if (Text(flags, "taskforce") == "faction") notes.Add("The carrier was met by your team alone.");
            if (Has(flags, "nyxAlly")) notes.Add("Nyx Arlen held the bay doors for you.");
            else if (Bool(flags, "nyxSpared", out var spared) && !spared)
                notes.Add("You shot Nyx Arlen down over a civilian corridor.");
            return notes;
        }

        static int Count(Dictionary<string, object> flags, params string[] keys)
        {
            var count = 0;
            foreach (var key in keys) if (Has(flags, key)) count++;
            return count;
        }

        static bool Has(Dictionary<string, object> flags, string key) =>
            flags.TryGetValue(key, out var value) && value is bool boolean && boolean;

        static bool Bool(Dictionary<string, object> flags, string key, out bool value)
        {
            if (flags.TryGetValue(key, out var raw) && raw is bool boolean)
            {
                value = boolean;
                return true;
            }
            value = false;
            return false;
        }

        static string Text(Dictionary<string, object> flags, string key) =>
            flags.TryGetValue(key, out var value) ? value as string : null;
    }
}
