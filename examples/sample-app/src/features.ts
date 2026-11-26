import flagsmith from "flagsmith";

export function getApplicationFeatures() {
  return {
    dashboard: flagsmith.hasFeature("new_dashboard"),
    assistant: flagsmith.hasFeature("ai_assistant"),
    checkout: flagsmith.hasFeature("legacy_checkout"),
    insights: flagsmith.hasFeature("checkout_insights"),
  };
}