import flagsmith from "flagsmith";

export function getApplicationFeatures() {
  return {
    dashboard: flagsmith.hasFeature("new_dashboard"),
    payments: flagsmith.hasFeature("unknown_payment_gateway"),
    admin: flagsmith.hasFeature("internal_admin_panel"),
  };
}