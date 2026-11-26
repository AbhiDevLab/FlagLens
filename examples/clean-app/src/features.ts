
import flagsmith from "flagsmith";

export function getFeatureAccess() {
  return {
    dashboard: flagsmith.hasFeature("new_dashboard"),
    assistant: flagsmith.hasFeature("ai_assistant"),
    checkout: flagsmith.hasFeature("legacy_checkout"),
    analytics: flagsmith.hasFeature("beta_analytics"),
  };
}
