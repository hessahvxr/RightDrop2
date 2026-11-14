// Catalogue of verified product pictures for eye drops.
//
// THE LIST IS EMPTY ON PURPOSE. No source was found that is trustworthy, shows
// the packs sold in Saudi Arabia, and may be used automatically (see
// docs/MEDICATION_IMAGES.md). Until an entry is added here, every medication
// shows the same neutral eye-drop picture.
//
// How a picture is chosen (src/core/medicationImage.js): the prescription's
// medication name must be exactly one of `tradeNames`, its concentration must
// equal `strength`, the entry must be an eye-drop form, and the entry must be
// complete. Otherwise the neutral picture is shown. Doctors upload nothing, and
// the database is not involved.
//
// One entry per product and strength:
//
//   {
//     tradeNames: ['Example'],              // trade name(s) exactly as on the pack; Arabic spelling may be added
//     scientificName: 'example substance',  // for the record only; never used for matching
//     strength: '0.5%',                     // or '5 mg/ml'; combination: '2% + 0.5%'
//     dosageForm: 'eye drops',              // one of EYE_DROP_FORMS
//     image: '/medication-images/example-0.5.webp', // file placed in public/medication-images/
//     source: 'Name of the source',         // who published the picture
//     sourceUrl: 'https://...',             // the exact page the picture came from
//     verifiedOn: '2026-11-14',             // date a person compared name, strength and form with the picture
//   }
//
// Only add a picture that the source allows to be reused, and only after a
// person has compared it with the registered product.
export const MEDICATION_IMAGES = []
