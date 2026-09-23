/* =============================================================
   CONFERENCE DATA — edit this file to update the whole site.
   Every value here is injected as PLAIN TEXT (never HTML),
   so this file is safe to edit without security review.
   =============================================================
   HOW IT WORKS
   Any element in the HTML pages with  data-conf="key"  gets its
   text replaced by CONFERENCE[key]. The countdown reads
   CONFERENCE.startDateISO.
   ============================================================= */
"use strict";

const CONFERENCE = Object.freeze({
  /* --- Identity ------------------------------------------------ */
  shortName:   "ICEAST 2027",
  fullName:    "International Conference on Engineering Advancements, Science and Technology",
  edition:     "2027",

  /* --- Dates (keep the three in sync) -------------------------- */
  datesLong:   "31 October – 4 November 2027",
  datesShort:  "31 Oct – 4 Nov 2027",
  startDateISO: "2027-10-31T08:00:00+04:00",  /* drives the countdown */

  /* --- Venue ---------------------------------------------------- */
  venue:       "Military Technological College",
  city:        "Muscat, Sultanate of Oman",
  venueFull:   "Military Technological College, Muscat, Sultanate of Oman",

  /* --- Contact -------------------------------------------------- */
  email:       "iceast@mtc.edu.om",

  /* --- Location (drives the venue-page map widget) --------------
     mapQuery is the place searched on Google Maps when a visitor
     chooses to load the interactive map. Plain text only. */
  mapQuery:    "Military Technological College, Muscat, Oman",

  /* --- Organizer ------------------------------------------------ */
  organizer:   "Military Technological College",
  authority:   "Ministry of Defence, Sultanate of Oman"
});
