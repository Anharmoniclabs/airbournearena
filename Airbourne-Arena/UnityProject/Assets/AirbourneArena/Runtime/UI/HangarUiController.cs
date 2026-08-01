using System;
using System.Collections.Generic;
using AirbourneArena.Campaign;
using UnityEngine;
using UnityEngine.SceneManagement;
using UnityEngine.UIElements;

namespace AirbourneArena.UI
{
    [RequireComponent(typeof(UIDocument))]
    public sealed class HangarUiController : MonoBehaviour
    {
        const string FlightScene = "FirstFlight";
        UIDocument document;
        VisualElement root;
        VisualElement campaignOverlay;
        VisualElement settingsOverlay;
        VisualElement fitOverlay;
        VisualElement interactionPrompt;
        Label interactionLabel;

        public bool HasOpenOverlay =>
            IsVisible(campaignOverlay) || IsVisible(settingsOverlay) || IsVisible(fitOverlay);

        void OnEnable()
        {
            document = GetComponent<UIDocument>();
            root = document.rootVisualElement;
            var embeddedFont = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
            if (embeddedFont)
                root.style.unityFontDefinition = FontDefinition.FromFont(embeddedFont);
            campaignOverlay = root.Q("campaign-overlay");
            settingsOverlay = root.Q("settings-overlay");
            fitOverlay = root.Q("fit-overlay");
            interactionPrompt = root.Q("interaction-prompt");
            interactionLabel = root.Q<Label>("interaction-label");
            root.Q<Button>("begin-button").clicked += LaunchFlight;
            root.Q<Button>("fit-launch").clicked += LaunchFlight;
            root.Q<Button>("campaign-button").clicked += OpenCampaign;
            root.Q<Button>("settings-button").clicked += () => Show(settingsOverlay);
            root.Q<Button>("fit-button").clicked += OpenFit;
            root.Q<Button>("campaign-close").clicked += () => Hide(campaignOverlay);
            root.Q<Button>("settings-close").clicked += () => Hide(settingsOverlay);
            root.Q<Button>("fit-close").clicked += () => Hide(fitOverlay);
            SetupSettings();
            SetupFitOut();
            PopulateCampaign();
        }

        void Update()
        {
            if (!Input.GetKeyDown(KeyCode.Escape)) return;
            Hide(campaignOverlay);
            Hide(settingsOverlay);
            Hide(fitOverlay);
        }

        public void LaunchFlight()
        {
            PlayerPrefs.Save();
            SceneManager.LoadScene(FlightScene);
        }

        public void OpenCampaign() => Show(campaignOverlay);

        public void OpenFit() => Show(fitOverlay);

        public void OpenAircraftFit(string faction)
        {
            var normalized = faction == "inferno" ? "inferno" : "vanguard";
            PlayerPrefs.SetString("airbourne.faction", normalized);
            root.Q<Label>("hangar-team").text = normalized.ToUpperInvariant();
            foreach (var name in new[] { "vanguard-button", "tempest-button", "inferno-button" })
                root.Q<Button>(name).RemoveFromClassList("active-blue");
            root.Q<Button>(normalized + "-button").AddToClassList("active-blue");
            Show(fitOverlay);
        }

        public void ShowAircraftPrompt(string faction)
        {
            if (interactionPrompt == null || interactionLabel == null) return;
            var visible = !string.IsNullOrEmpty(faction) &&
                fitOverlay.ClassListContains("hidden") &&
                campaignOverlay.ClassListContains("hidden") &&
                settingsOverlay.ClassListContains("hidden");
            interactionPrompt.EnableInClassList("hidden", !visible);
            if (visible)
                interactionLabel.text = $"[E]  {(faction == "inferno" ? "JOIN INFERNO" : "JOIN VANGUARD")} FOR THIS TRIAL";
        }

        void SetupSettings()
        {
            var sensitivity = root.Q<SliderInt>("sensitivity");
            var sensitivityValue = root.Q<Label>("sensitivity-value");
            sensitivity.value = PlayerPrefs.GetInt("airbourne.sensitivity", 65);
            sensitivityValue.text = sensitivity.value.ToString();
            sensitivity.RegisterValueChangedCallback(change =>
            {
                PlayerPrefs.SetInt("airbourne.sensitivity", change.newValue);
                sensitivityValue.text = change.newValue.ToString();
            });

            var hudScale = root.Q<Slider>("hud-scale");
            var hudScaleValue = root.Q<Label>("hud-scale-value");
            hudScale.value = PlayerPrefs.GetFloat("airbourne.hudScale", 1);
            hudScaleValue.text = $"{Mathf.RoundToInt(hudScale.value * 100)}%";
            hudScale.RegisterValueChangedCallback(change =>
            {
                PlayerPrefs.SetFloat("airbourne.hudScale", change.newValue);
                hudScaleValue.text = $"{Mathf.RoundToInt(change.newValue * 100)}%";
            });
            BindToggle("invert-y", "airbourne.invertY");
            BindToggle("reduced-motion", "airbourne.reducedMotion");
            BindToggle("colour-blind", "airbourne.colourBlind");
        }

        void BindToggle(string element, string key)
        {
            var toggle = root.Q<Toggle>(element);
            toggle.value = PlayerPrefs.GetInt(key, 0) != 0;
            toggle.RegisterValueChangedCallback(change =>
                PlayerPrefs.SetInt(key, change.newValue ? 1 : 0));
        }

        void SetupFitOut()
        {
            var callsign = root.Q<TextField>("callsign");
            callsign.value = PlayerPrefs.GetString("airbourne.callsign", "ROOKIE");
            callsign.RegisterValueChangedCallback(change =>
                PlayerPrefs.SetString("airbourne.callsign",
                    change.newValue.Trim().ToUpperInvariant()));
            ConfigureDropdown("engine", "airbourne.engine",
                "BALANCED TURBINE", "HIGH-OUTPUT BOOSTER", "LONG-RANGE ENGINE", "HEAVY-LOAD PLANT");
            ConfigureDropdown("wings", "airbourne.wings",
                "STABLE CONTROL", "HIGH-TURN", "SWEPT HIGH-SPEED", "ARMORED WINGS");
            ConfigureDropdown("armor", "airbourne.armor",
                "LIGHT COMPOSITE", "REINFORCED PLATE", "REACTIVE ARMOR", "SELF-REPAIR LATTICE");
            ConfigureDropdown("primary", "airbourne.primary",
                "MACHINE CANNON", "HEAVY CANNON", "BURST LASER", "SCATTER CANNON");
            BindFaction("vanguard-button", "vanguard");
            BindFaction("tempest-button", "tempest");
            BindFaction("inferno-button", "inferno");
        }

        void ConfigureDropdown(string element, string key, params string[] choices)
        {
            var field = root.Q<DropdownField>(element);
            field.choices = new List<string>(choices);
            var saved = PlayerPrefs.GetString(key, choices[0]);
            field.value = field.choices.Contains(saved) ? saved : choices[0];
            field.RegisterValueChangedCallback(change =>
                PlayerPrefs.SetString(key, change.newValue));
        }

        void BindFaction(string element, string faction)
        {
            root.Q<Button>(element).clicked += () =>
            {
                PlayerPrefs.SetString("airbourne.faction", faction);
                root.Q<Label>("hangar-team").text = faction.ToUpperInvariant();
                root.Q<Label>("hangar-call").text =
                    root.Q<TextField>("callsign").value.ToUpperInvariant();
                foreach (var name in new[] { "vanguard-button", "tempest-button", "inferno-button" })
                    root.Q<Button>(name).RemoveFromClassList("active-blue");
                root.Q<Button>(element).AddToClassList("active-blue");
            };
        }

        void PopulateCampaign()
        {
            var source = Resources.Load<TextAsset>("missions");
            if (!source) return;
            var campaign = CampaignDocument.Parse(source.text);
            var list = root.Q<ScrollView>("mission-list");
            var currentChapter = -1;
            var first = true;
            foreach (var raw in campaign.Missions)
            {
                var mission = (Dictionary<string, object>)raw;
                var chapter = Convert.ToInt32(mission["chapter"]);
                if (chapter != currentChapter)
                {
                    currentChapter = chapter;
                    var heading = new Label($"CHAPTER {chapter}");
                    heading.AddToClassList("chapter-heading");
                    list.Add(heading);
                }
                var id = CampaignDocument.RequireString(mission, "id");
                var title = CampaignDocument.RequireString(mission, "title");
                var button = new Button(() =>
                {
                    PlayerPrefs.SetString("airbourne.mission", id);
                    LaunchFlight();
                }) { text = $"{(first ? "▸" : "○")}   {title}                     {id.ToUpperInvariant()}" };
                button.AddToClassList("mission-row");
                if (first) button.AddToClassList("mission-now");
                else
                {
                    button.AddToClassList("mission-locked");
                    button.SetEnabled(false);
                }
                list.Add(button);
                first = false;
            }
        }

        static void Show(VisualElement overlay) => overlay.RemoveFromClassList("hidden");
        static void Hide(VisualElement overlay) => overlay.AddToClassList("hidden");
        static bool IsVisible(VisualElement overlay) =>
            overlay != null && !overlay.ClassListContains("hidden");
    }
}
