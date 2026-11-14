import { useState } from 'react'
import { findVerifiedMedicationImage } from '../core'
import { MEDICATION_IMAGES } from '../data/medicationImages'

// Picture shown next to a medication.
//
// A real product picture is shown only when the prescription's name and
// concentration match one verified entry of the picture catalogue (the rules
// are in src/core/medicationImage.js). In every other case, and whenever the
// picture fails to load, the SAME neutral eye-drop drawing is shown for all
// medications: no cap colour, drug class or letter is derived from the name,
// so the drawing can never be taken for the patient's own bottle. The cap is
// left uncoloured because cap colours carry a meaning on real eye-drop bottles.
const SIZES = {
  sm: { box: 'w-12 h-14', svgW: 32, svgH: 44, badge: false },
  md: { box: 'w-20 h-24', svgW: 52, svgH: 70, badge: false },
  lg: { box: 'w-28 h-32', svgW: 72, svgH: 96, badge: true },
  xl: { box: 'w-36 h-40', svgW: 92, svgH: 120, badge: true },
}

export default function MedicationImage({
  medicationName = '',
  concentration = '',
  size = 'md', // 'sm' | 'md' | 'lg' | 'xl'
  className = '',
}) {
  const dim = SIZES[size] || SIZES.md
  const entry = findVerifiedMedicationImage(
    { medication_name: medicationName, concentration },
    MEDICATION_IMAGES
  )
  // Remember a picture that failed to load, so the neutral drawing replaces it.
  const [failedImage, setFailedImage] = useState(null)
  const showPhoto = !!entry && failedImage !== entry.image
  const box = `relative flex shrink-0 flex-col items-center justify-center rounded-2xl border border-sand-200 bg-sand-50/70 p-2 shadow-sm ${dim.box} ${className}`

  if (showPhoto) {
    return (
      <div className={box}>
        <img
          src={entry.image}
          alt={`صورة عبوة ${medicationName} ${concentration}`.trim()}
          loading="lazy"
          onError={() => setFailedImage(entry.image)}
          className="h-full w-full rounded-xl object-contain"
        />
      </div>
    )
  }

  return (
    <div className={box} aria-hidden="true">
      <svg
        width={dim.svgW}
        height={dim.svgH}
        viewBox="0 0 80 110"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="shrink-0 drop-shadow-sm"
      >
        {/* Dropper tip */}
        <path d="M36 4C36 1.79086 37.7909 0 40 0C42.2091 0 44 1.79086 44 4V16H36V4Z" fill="#E2E8F0" />
        {/* Cap: uncoloured outline, the same for every medication */}
        <rect x="28" y="12" width="24" height="18" rx="4" fill="#F8FAFC" stroke="#94A3B8" strokeWidth="2" />
        <rect x="26" y="28" width="28" height="5" rx="2" fill="#F8FAFC" stroke="#94A3B8" strokeWidth="2" />
        <line x1="34" y1="16" x2="34" y2="26" stroke="#CBD5E1" strokeWidth="1.5" />
        <line x1="40" y1="16" x2="40" y2="26" stroke="#CBD5E1" strokeWidth="1.5" />
        <line x1="46" y1="16" x2="46" y2="26" stroke="#CBD5E1" strokeWidth="1.5" />
        {/* Neck */}
        <rect x="32" y="32" width="16" height="8" fill="#F1F5F9" />
        {/* Body */}
        <path
          d="M20 44C20 38.4772 24.4772 34 30 34H50C55.5228 34 60 38.4772 60 44V92C60 98.6274 54.6274 104 48 104H32C25.3726 104 20 98.6274 20 92V44Z"
          fill="#FFFFFF"
          stroke="#CBD5E1"
          strokeWidth="2"
        />
        <path
          d="M22 62C22 58 26 56 30 56H50C54 56 58 58 58 62V92C58 97.5228 53.5228 102 48 102H32C26.4772 102 22 97.5228 22 92V62Z"
          fill="#E2E8F0"
          fillOpacity="0.45"
        />
        {/* Blank label with a drop: no name, letter or colour code */}
        <rect x="24" y="52" width="32" height="32" rx="4" fill="#FFFFFF" stroke="#E2E8F0" strokeWidth="1" />
        <path
          d="M40 58C40 58 34 65.5 34 69.5C34 72.8137 36.6863 75.5 40 75.5C43.3137 75.5 46 72.8137 46 69.5C46 65.5 40 58 40 58Z"
          fill="#94A3B8"
        />
        <path d="M24 44V92" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" strokeOpacity="0.8" />
      </svg>

      {dim.badge && (
        <span className="mt-1.5 line-clamp-1 rounded-full bg-sand-100 px-2 py-0.5 text-2xs font-bold text-slate-700">
          قطرة عين
        </span>
      )}
    </div>
  )
}
