// Seed values for the Job Watch lists on search_preferences. Imported by
// scripts/init-db.ts (which writes them once, when the job_watch_* columns
// are first added) — so this file must stay dependency-free plain TS. After
// that, the user edits these in Settings → Discovery → Job Watch.
//
// EVERYTHING IN THIS FILE IS SAMPLE CONFIGURATION. The values sketch one
// example search (an early-career supply chain and warehouse automation hunt)
// so the app does something useful on first run. Replace them with your own
// field, employers and markets.

/**
 * Sample value. Roughly when you graduate, used to judge whether a posting is
 * aimed at your cohort. Set it to your own term, or to the current year if
 * you are already working.
 */
export const GRADUATION_TERM = "May 2027";

/**
 * Sample value, off by default. Turn this on if you need an employer to
 * sponsor a work visa: Job Watch will then skip postings that refuse
 * sponsorship, require citizenship or permanent residency, or require a
 * security clearance, and will apply the per-country work-permit rules in
 * `visaRule()` (job-watch.ts).
 */
export const REQUIRES_SPONSORSHIP = false;

/**
 * Sample value. Searched first and hardest on every run, with a wider net
 * than the general target list below. Put the few employers you care most
 * about here.
 */
export const DEFAULT_JOB_WATCH_PRIORITY_COMPANIES = [
  "Amazon (amazon.jobs)",
  "DHL Supply Chain (dhl.com/careers)",
  "Siemens (siemens.com/careers)",
].join("\n");

/**
 * Sample value. The general target list, grouped by industry. Each run
 * searches a rotating slice of it (see `TARGETS_PER_RUN` in job-watch.ts),
 * so a long list is fine and gives better variety. Lines starting with `//`
 * are group headers and are skipped when sampling.
 */
export const DEFAULT_JOB_WATCH_COMPANIES = [
  "// Warehouse automation & robotics vendors",
  "Toyota Automated Logistics (Bastian Solutions / Vanderlande / viastore)",
  "Symbotic",
  "Locus Robotics",
  "Berkshire Grey",
  "Dematic",
  "Honeywell Intelligrated",
  "Swisslog",
  "Fortna",
  "KNAPP",
  "AutoStore",
  "Exotec",
  "Geek+",
  "Körber Supply Chain",
  "SSI Schaefer",
  "Zebra Technologies",
  "Interlake Mecalux",
  "// 3PL / logistics / transportation",
  "GXO Logistics",
  "DHL Supply Chain",
  "Ryder",
  "NFI Industries",
  "Americold",
  "Lineage Logistics",
  "Penske Logistics",
  "C.H. Robinson",
  "XPO",
  "Saddle Creek Logistics",
  "Capstone Logistics",
  "ID Logistics",
  "Geodis",
  "Kuehne+Nagel",
  "DB Schenker",
  "UPS",
  "FedEx",
  "CEVA Logistics",
  "J.B. Hunt",
  "// Retail / e-commerce / grocery distribution",
  "Amazon (Operations Engineer, Industrial Engineer, RME, Amazon Robotics, Area Manager)",
  "Walmart",
  "Target",
  "Lowe's",
  "Costco",
  "Kroger",
  "Albertsons",
  "Ahold Delhaize (Stop & Shop, Food Lion)",
  "Publix",
  "H-E-B",
  "Wegmans",
  "Meijer",
  "BJ's Wholesale Club",
  "Wayfair",
  "Chewy",
  "Williams-Sonoma",
  "TJX Companies",
  "Ross Stores",
  "Dollar General",
  "Tractor Supply",
  "Best Buy",
  "IKEA",
  "C&S Wholesale Grocers",
  "US Foods",
  "Sysco",
  "Performance Food Group",
  "McLane Company",
  "UNFI",
  "// Manufacturing / industrial / medical / aerospace",
  "Jabil",
  "Flex",
  "Celestica",
  "Plexus",
  "Benchmark Electronics",
  "Thermo Fisher Scientific",
  "Danaher",
  "Becton Dickinson",
  "Stryker",
  "Medtronic",
  "Johnson Controls",
  "Eaton",
  "Emerson",
  "Parker Hannifin",
  "Illinois Tool Works",
  "Trane Technologies",
  "Carrier",
  "Schneider Electric",
  "ABB",
  "Siemens",
  "Rockwell Automation",
  "Procter & Gamble",
  "Unilever",
  "PepsiCo",
  "General Mills",
  "Clorox",
  "Kimberly-Clark",
  "Tesla",
  "Rivian",
  "Toyota Motor Manufacturing",
  "Bosch",
  "Cummins",
  "Caterpillar",
  "John Deere",
  "// Pharma / healthcare distribution",
  "McKesson",
  "Cencora (AmerisourceBergen)",
  "Cardinal Health",
  "Henry Schein",
  "Owens & Minor",
  "// WMS / supply chain software & consulting",
  "Manhattan Associates",
  "Blue Yonder",
  "enVista",
  "Spinnaker SCA",
  "VCO Systems",
].join("\n");

/** Sample value. The role titles Job Watch searches for. */
export const DEFAULT_JOB_WATCH_ROLES = [
  "Industrial Engineer (supply chain / distribution / fulfillment)",
  "Supply Chain Engineer",
  "Automation / Robotics Deployment Engineer",
  "Robotics Reliability / Fleet Engineer",
  "Solutions Design Analyst / Engineer (logistics)",
  "Project Engineer (material handling)",
  "Operations Engineer",
  "Process Engineer (fulfillment / DC)",
  "WMS Analyst / junior Manhattan consultant",
  "Supply chain rotational / leadership development program",
  "Material Flow Engineer",
].join("\n");

/**
 * Job Watch only surfaces postings dated within this many days: older ones
 * are usually closed. Enforced when parsing search results (job-watch.ts)
 * and when listing the board (jobs.ts hides older/undated Job Watch finds
 * still sitting in Wishlist).
 */
export const JOB_WATCH_MAX_AGE_DAYS = 30;

/** The default board / Job Watch's main market (≈40 postings/day). */
export const HOME_COUNTRY = "United States";

/**
 * Sample value. International boards selectable in the header's country
 * picker; Job Watch runs one extra search per country. Leave it empty for a
 * single-country search. Editable in Settings → Discovery.
 *
 * `visaRule()` in job-watch.ts knows the work-permit route for Germany,
 * Ireland, Belgium, the Netherlands, Luxembourg, the UK, New Zealand and the
 * UAE; anything else falls back to a generic rule.
 */
export const DEFAULT_JOB_WATCH_COUNTRIES = [
  "Germany",
  "Ireland",
  "United Kingdom",
].join("\n");
