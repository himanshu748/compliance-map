import {
  Fact,
  places,
  recommend,
  scenarioText,
  type ComplianceInput,
  type ComplianceResult,
  type ModelComplianceReport,
  type ResultPlace,
} from "./core.js";

const observed = "2026-11-08T07:15:10.000Z";
const city =
  "https://www.cityoflondon.gov.uk/services/business-standards/food-safety/food-premises-registration";
const nyc =
  "https://nyc-business.nyc.gov/nycbusiness/description/food-service-establishment-permit";
const hse =
  "https://about.hse.ie/environmental-health/notify-the-hse-about-starting-a-food-business/";
const ipsc =
  "https://www.pointofsinglecontact.ie/browse-by-sector/food/opening-a-cafe-restaurant/";
const source = (url: string, quote: string) => ({
  url,
  title:
    url === city
      ? "Food premises registration — City of London"
      : url === nyc
        ? "Food Service Establishment Permit — NYC"
        : url === hse
          ? "Notify the HSE about starting a food business"
          : "Starting a Food Service Business — Irish Point of Single Contact",
  quote,
  published_on:
    url === city ? "2026-07-01" : url === ipsc ? "2024-09-03" : null,
  observed_at: observed,
});
type ModelFact =
  ModelComplianceReport["jurisdictions"][number]["facts"][number];
const fact = (value: ModelFact) => Fact.parse(value);

/** Manually reviewed public sources, deliberately not a TinyResearch receipt. */
export function sourceReviewReport(
  priority: ComplianceInput["priority"] = "registration_fee",
): ComplianceResult {
  const facts: Record<string, ModelFact[]> = {
    "city-of-london": [
      fact({
        id: "food-registration",
        category: "registration",
        claim:
          "Most new food businesses must register with the City of London.",
        value: {
          type: "text",
          summary:
            "Food premises registration with the local authority for this Square Mile location.",
        },
        sources: [source(city, "required by law to register")],
      }),
      fact({
        id: "registration-fee",
        category: "fee",
        claim:
          "Food-business registration is free. This excludes all other startup and operating costs.",
        value: {
          type: "fee",
          amount: 0,
          currency: "GBP",
          period: "registration",
          scope:
            "Food-business registration only; changes and other approvals need separate review.",
        },
        sources: [source(city, "registration is free of charge")],
      }),
      fact({
        id: "advance-notice",
        category: "timing",
        claim: "The page states registration 28 days before opening.",
        value: {
          type: "timing",
          days_min: 28,
          days_max: 28,
          kind: "advance_notice",
          conditions:
            "A notice requirement, not a processing-time estimate. The page also says business can continue after submission; confirm interpretation with the authority.",
        },
        sources: [source(city, "28 days prior to opening")],
      }),
    ],
    "new-york-city": [
      fact({
        id: "food-permit",
        category: "registration",
        claim: "Food service establishments require a DOHMH permit.",
        value: {
          type: "text",
          summary:
            "The published food-service definition covers prepared food sold for on-site use or takeaway.",
        },
        sources: [source(nyc, "need a permit")],
      }),
      fact({
        id: "permit-fee",
        category: "fee",
        claim:
          "The standard food-service permit fee is $280 annually; this scenario excludes the frozen-dessert surcharge.",
        value: {
          type: "fee",
          amount: 280,
          currency: "USD",
          period: "annual",
          scope:
            "Standard food-service establishment permit only, subject to applicable exceptions; other costs excluded.",
        },
        sources: [source(nyc, "$280.00"), source(nyc, "Annually")],
      }),
      fact({
        id: "operation-route",
        category: "timing",
        claim:
          "The published application route allows operation after 22 days, subject to the other requirements.",
        value: {
          type: "timing",
          days_min: 22,
          days_max: 22,
          kind: "operation_route",
          conditions:
            "Earlier opening may involve a pre-operating inspection. Food protection certification and other agency requirements still apply; not a guaranteed opening date.",
        },
        sources: [source(nyc, "22 days after you submit your application")],
      }),
      fact({
        id: "food-manager",
        category: "training",
        claim:
          "A supervising manager needs the Food Protection Course and must be present; certification is required before opening.",
        value: {
          type: "text",
          summary:
            "Food Protection Certificate requirements must be planned separately; course fees and availability are not established here.",
        },
        sources: [
          source(
            nyc,
            "A supervising manager must pass a Food Protection Course",
          ),
        ],
      }),
    ],
    dublin: [
      fact({
        id: "hse-notification",
        category: "registration",
        claim: "Notify the HSE before starting this food business.",
        value: {
          type: "text",
          summary:
            "HSE records and assesses the notification, registers eligible businesses and issues an acknowledgement.",
        },
        sources: [
          source(hse, "must notify the HSE before you start operating"),
        ],
      }),
      fact({
        id: "notification-fee",
        category: "fee",
        claim:
          "The published notification fee is zero; premises and other obligations are separate.",
        value: {
          type: "fee",
          amount: 0,
          currency: "EUR",
          period: "registration",
          scope:
            "Food-business notification only. Direct consumer café, no wholesale animal-origin processing.",
        },
        sources: [
          source(ipsc, "There is no cost to notifying a food business."),
        ],
      }),
      fact({
        id: "before-operation",
        category: "scope",
        claim:
          "Notification must happen before operation; the HSE page gives no fixed day count.",
        value: {
          type: "text",
          summary:
            "No numeric legal waiting period is established by this source.",
        },
        sources: [source(hse, "before you start operating a food business")],
      }),
      fact({
        id: "processing-estimate",
        category: "timing",
        claim:
          "The information page estimates confirmation in 3–5 days when details are correct.",
        value: {
          type: "timing",
          days_min: 3,
          days_max: 5,
          kind: "typical_processing",
          conditions:
            "Typical administrative confirmation only, not a legal waiting period or guaranteed opening time. Excludes wholesale animal-origin approval.",
        },
        sources: [source(ipsc, "generally only takes 3-5 days")],
      }),
    ],
  };
  const jurisdictions: ResultPlace[] = places.map((p) => ({
    ...p,
    facts: (facts[p.id] ?? []).map((f) => ({
      ...f,
      sources: f.sources.map((s) => ({
        ...s,
        quote_check: "not_checked",
        checked_at: null,
        text_sha256: null,
      })),
    })),
    unknowns:
      p.id === "city-of-london"
        ? [
            "The local page combines 28-day advance registration wording with a statement about continuing after submission; resolve the opening-date interpretation with the authority.",
            "Training format, premises permissions and total startup cost were not researched.",
          ]
        : p.id === "new-york-city"
          ? [
              "Exact premises, food-manager course cost, insurance and other applicable fees remain unpriced.",
              "The 22-day food-permit route does not replace building or occupancy clearance.",
            ]
          : [
              "The 3–5-day estimate comes from guidance last updated in September 2024; confirm current service time.",
              "No fixed legal waiting-day count, training format, premises clearance or total cost is established.",
              "Confirm registration versus approval for the exact menu and handling activities with the HSE.",
            ],
  }));
  return {
    format: "compliance-map-result-v1",
    scenario: {
      business: "fixed-premises-cafe",
      priority,
      scope_confirmed: true,
    },
    scope: scenarioText,
    status: "source_review",
    evidence_mode: "source_review",
    provider_run_id: null,
    observed_at: observed,
    jurisdictions,
    recommendation: recommend(jurisdictions, priority),
    limitations: [
      "Manually reviewed official pages, not a TinyResearch execution. Quoted excerpts remain not_checked until the source corroboration command fetches the exact pages.",
      "Food-entry comparison only. No overall cheapest or fastest city, currency conversion, total setup cost or legal completeness is established.",
    ],
  };
}
