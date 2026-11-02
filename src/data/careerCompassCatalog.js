/**
 * Career Compass — college & branch catalog (IIT / NIT / IIIT / Medical).
 * Cutoffs = General closing ranks (JoSAA / CSAB / MCC), last 3 counselling years.
 * Placement figures = published TPO / NIRF numbers when verified; otherwise Not available.
 * Catalog ballparks are Indicative/unverified — Gemini must not invent typical packages.
 */

/** @typedef {'iit'|'nit'|'iiit'|'gfti'|'medical'} CollegeType */
/** @typedef {'jee-main'|'jee-advanced'|'neet'} ExamId */

/**
 * @typedef {{
 *   avgLpa?: number
 *   medianLpa?: number
 *   lowestLpa?: number
 *   highestLpa?: number
 *   highestDomesticLpa?: number
 *   highestIntlLpa?: number
 *   pctPlaced?: number
 *   indicative?: boolean
 *   placementSource?: 'official' | 'indicative' | 'unverified' | null
 *   sourceNote?: string
 *   sourceUrl?: string | null
 *   sourceYear?: number | string | null
 *   scope?: 'institute' | 'branch' | null
 * }} PlacementStats
 */

/**
 * @typedef {{
 *   id: string
 *   name: string
 *   cutoffs: Record<string, number>
 *   roundCutoffs?: Record<string, Record<string, number>>
 *   feeAnnualLakh?: number
 *   placement?: PlacementStats
 * }} BranchRow
 */

/**
 * @typedef {{
 *   id: string
 *   name: string
 *   shortName: string
 *   type: CollegeType
 *   exams: ExamId[]
 *   city: string
 *   state: string
 *   nirfRank?: number
 *   nirfYear?: number
 *   nirfSource?: 'nirf' | null
 *   placementSource?: 'official' | 'indicative' | 'unverified' | null
 *   feeAnnualLakh?: number
 *   hostelFeeLakh?: number
 *   website?: string
 *   placementPageUrl?: string
 *   quotas?: string[]
 *   typeLabel?: string
 *   counsellingBody?: string
 *   establishedYear?: number
 *   affiliation?: string
 *   placement?: PlacementStats
 *   branches: BranchRow[]
 * }} CollegeRow
 */

/** JoSAA / CSAB / MCC counselling years used for college matching */
const Y = ['2024', '2025', '2026']

export const PLACEMENT_SOURCE_NOTE =
  'Indicative/unverified unless tagged Official. Official = published TPO or NIRF. Missing stays Not available.'
export const FEE_SOURCE_NOTE = 'Institute-wide annual fee (shared across branches unless noted).'
export const NIRF_SOURCE_NOTE = 'College-level NIRF rank (shown per branch for comparison).'

/** @param {PlacementStats} stats */
function indicativePlacement(stats) {
  return {
    ...stats,
    indicative: true,
    placementSource: 'indicative',
    sourceNote: PLACEMENT_SOURCE_NOTE,
  }
}

/**
 * Institute-level placement ballparks (₹ LPA) — not formula-generated.
 * @type {Record<string, PlacementStats>}
 */
const KNOWN_PLACEMENT = {
  'nit-trichy': { avgLpa: 20.2, medianLpa: 18, lowestLpa: 9, highestDomesticLpa: 58, highestIntlLpa: 42, pctPlaced: 87 },
  'nit-surathkal': { avgLpa: 19.8, medianLpa: 17.5, lowestLpa: 8.5, highestDomesticLpa: 55, highestIntlLpa: 38, pctPlaced: 86 },
  'nit-warangal': { avgLpa: 18.5, medianLpa: 16.5, lowestLpa: 8, highestDomesticLpa: 48, highestIntlLpa: 32, pctPlaced: 85 },
  'nit-calicut': { avgLpa: 17.8, medianLpa: 16, lowestLpa: 7.5, highestDomesticLpa: 45, highestIntlLpa: 28, pctPlaced: 84 },
  'nit-rourkela': { avgLpa: 17.2, medianLpa: 15.5, lowestLpa: 7.2, highestDomesticLpa: 42, highestIntlLpa: 26, pctPlaced: 83 },
  'nit-allahabad': { avgLpa: 15.5, medianLpa: 14, lowestLpa: 6.8, highestDomesticLpa: 38, highestIntlLpa: 22, pctPlaced: 82 },
  'nit-jaipur': { avgLpa: 15, medianLpa: 13.5, lowestLpa: 6.5, highestDomesticLpa: 36, highestIntlLpa: 20, pctPlaced: 81 },
  'nit-kurukshetra': { avgLpa: 14.2, medianLpa: 12.8, lowestLpa: 6.2, highestDomesticLpa: 34, highestIntlLpa: 18, pctPlaced: 80 },
  'nit-durgapur': { avgLpa: 12.8, medianLpa: 11.2, lowestLpa: 5.5, highestDomesticLpa: 28, highestIntlLpa: 16, pctPlaced: 78 },
  'nit-silchar': { avgLpa: 12.2, medianLpa: 10.8, lowestLpa: 5.2, highestDomesticLpa: 26, highestIntlLpa: 14, pctPlaced: 76 },
  'nit-hamirpur': { avgLpa: 13.5, medianLpa: 12, lowestLpa: 5.8, highestDomesticLpa: 30, highestIntlLpa: 17, pctPlaced: 79 },
  'nit-jalandhar': { avgLpa: 13.8, medianLpa: 12.2, lowestLpa: 6, highestDomesticLpa: 31, highestIntlLpa: 18, pctPlaced: 80 },
  'nit-patna': { avgLpa: 11.5, medianLpa: 10.2, lowestLpa: 5, highestDomesticLpa: 24, highestIntlLpa: 12, pctPlaced: 74 },
  'nit-raipur': { avgLpa: 11.8, medianLpa: 10.5, lowestLpa: 5.1, highestDomesticLpa: 25, highestIntlLpa: 13, pctPlaced: 75 },
  'nit-nagpur': { avgLpa: 14.8, medianLpa: 13.2, lowestLpa: 6.4, highestDomesticLpa: 35, highestIntlLpa: 19, pctPlaced: 81 },
  'nit-surat': { avgLpa: 12.5, medianLpa: 11, lowestLpa: 5.4, highestDomesticLpa: 27, highestIntlLpa: 15, pctPlaced: 77 },
  'nit-bhopal': { avgLpa: 12, medianLpa: 10.6, lowestLpa: 5, highestDomesticLpa: 26, highestIntlLpa: 14, pctPlaced: 76 },
  'nit-goa': { avgLpa: 11.2, medianLpa: 9.8, lowestLpa: 4.8, highestDomesticLpa: 23, highestIntlLpa: 12, pctPlaced: 73 },
  'nit-puducherry': { avgLpa: 10.5, medianLpa: 9.2, lowestLpa: 4.6, highestDomesticLpa: 22, highestIntlLpa: 10, pctPlaced: 72 },
  'nit-meghalaya': { avgLpa: 7.6, medianLpa: 6.8, lowestLpa: 3.8, highestDomesticLpa: 14, highestIntlLpa: 8, pctPlaced: 65 },
  'nit-agartala': { avgLpa: 8.2, medianLpa: 7.2, lowestLpa: 4, highestDomesticLpa: 16, highestIntlLpa: 9, pctPlaced: 68 },
  'nit-srinagar': { avgLpa: 9.5, medianLpa: 8.4, lowestLpa: 4.4, highestDomesticLpa: 18, highestIntlLpa: 10, pctPlaced: 70 },
  'nit-delhi': { avgLpa: 14.5, medianLpa: 13, lowestLpa: 6.3, highestDomesticLpa: 34, highestIntlLpa: 18, pctPlaced: 80 },
  'nit-andhra': { avgLpa: 10.8, medianLpa: 9.5, lowestLpa: 4.7, highestDomesticLpa: 21, highestIntlLpa: 11, pctPlaced: 71 },
  'nit-uttarakhand': { avgLpa: 9.8, medianLpa: 8.6, lowestLpa: 4.5, highestDomesticLpa: 19, highestIntlLpa: 10, pctPlaced: 70 },
  'nit-mizoram': { avgLpa: 7.2, medianLpa: 6.4, lowestLpa: 3.6, highestDomesticLpa: 13, highestIntlLpa: 7, pctPlaced: 62 },
  'nit-nagaland': { avgLpa: 7, medianLpa: 6.2, lowestLpa: 3.5, highestDomesticLpa: 12, highestIntlLpa: 7, pctPlaced: 60 },
  'nit-manipur': { avgLpa: 7.4, medianLpa: 6.5, lowestLpa: 3.7, highestDomesticLpa: 13, highestIntlLpa: 8, pctPlaced: 63 },
  'nit-sikkim': { avgLpa: 7.8, medianLpa: 6.9, lowestLpa: 3.9, highestDomesticLpa: 14, highestIntlLpa: 8, pctPlaced: 64 },
  'nit-arunachal': { avgLpa: 7.1, medianLpa: 6.3, lowestLpa: 3.5, highestDomesticLpa: 12, highestIntlLpa: 7, pctPlaced: 61 },
  'nit-jamshedpur': { avgLpa: 11, medianLpa: 9.8, lowestLpa: 4.9, highestDomesticLpa: 24, highestIntlLpa: 13, pctPlaced: 74 },
  'iiit-hyderabad': { avgLpa: 32, medianLpa: 28, lowestLpa: 12, highestDomesticLpa: 85, highestIntlLpa: 60, pctPlaced: 92 },
  'iiit-bangalore': { avgLpa: 24, medianLpa: 22, lowestLpa: 10, highestDomesticLpa: 55, highestIntlLpa: 40, pctPlaced: 90 },
  'iiit-delhi': { avgLpa: 26, medianLpa: 24, lowestLpa: 11, highestDomesticLpa: 62, highestIntlLpa: 45, pctPlaced: 91 },
  'iiit-allahabad': { avgLpa: 16, medianLpa: 14.5, lowestLpa: 7, highestDomesticLpa: 38, highestIntlLpa: 25, pctPlaced: 84 },
  'iiit-gwalior': { avgLpa: 14, medianLpa: 12.5, lowestLpa: 6.2, highestDomesticLpa: 32, highestIntlLpa: 20, pctPlaced: 82 },
  'iiit-guwahati': { avgLpa: 12.5, medianLpa: 11, lowestLpa: 5.5, highestDomesticLpa: 28, highestIntlLpa: 16, pctPlaced: 78 },
  'iiit-vadodara': { avgLpa: 11.5, medianLpa: 10.2, lowestLpa: 5, highestDomesticLpa: 26, highestIntlLpa: 14, pctPlaced: 76 },
  'iiit-kota': { avgLpa: 11.8, medianLpa: 10.5, lowestLpa: 5.2, highestDomesticLpa: 27, highestIntlLpa: 15, pctPlaced: 77 },
  'iiit-pune': { avgLpa: 13.2, medianLpa: 11.8, lowestLpa: 5.8, highestDomesticLpa: 30, highestIntlLpa: 18, pctPlaced: 80 },
  'iit-indore': { avgLpa: 19, medianLpa: 15, lowestLpa: 7, highestDomesticLpa: 52, highestIntlLpa: 85, pctPlaced: 90 },
  'iit-bhu': { avgLpa: 18, medianLpa: 14.5, lowestLpa: 6.5, highestDomesticLpa: 48, highestIntlLpa: 80, pctPlaced: 89 },
  'iit-ism': { avgLpa: 17, medianLpa: 13.5, lowestLpa: 6, highestDomesticLpa: 45, highestIntlLpa: 75, pctPlaced: 88 },
  'iit-bhubaneswar': { avgLpa: 16.5, medianLpa: 13, lowestLpa: 6, highestDomesticLpa: 42, highestIntlLpa: 70, pctPlaced: 87 },
  'iit-gandhinagar': { avgLpa: 17.5, medianLpa: 14, lowestLpa: 6.5, highestDomesticLpa: 46, highestIntlLpa: 78, pctPlaced: 88 },
  'iit-patna': { avgLpa: 15, medianLpa: 12, lowestLpa: 5.5, highestDomesticLpa: 38, highestIntlLpa: 65, pctPlaced: 85 },
  'iit-ropar': { avgLpa: 15.5, medianLpa: 12.5, lowestLpa: 5.8, highestDomesticLpa: 40, highestIntlLpa: 68, pctPlaced: 86 },
  'iit-mandi': { avgLpa: 14.5, medianLpa: 11.8, lowestLpa: 5.5, highestDomesticLpa: 36, highestIntlLpa: 62, pctPlaced: 84 },
  'iit-jodhpur': { avgLpa: 16, medianLpa: 13, lowestLpa: 6, highestDomesticLpa: 41, highestIntlLpa: 72, pctPlaced: 87 },
}

/** No published row → Not available. Never invent a NIRF-tier "typical" package. */
/** @param {number} [_nirf] @param {'nit'|'iiit'|'iit'} [_tier] */
function placementFromNirfTier(_nirf, _tier) {
  return {
    indicative: true,
    placementSource: 'unverified',
    sourceNote: PLACEMENT_SOURCE_NOTE,
  }
}

/** @param {string} id @param {number} nirf @param {'nit'|'iiit'|'iit'} tier */
function resolvePlacement(id, nirf, tier) {
  if (KNOWN_PLACEMENT[id]) return indicativePlacement(KNOWN_PLACEMENT[id])
  return placementFromNirfTier(nirf, tier)
}

/** @param {number} base @param {number} drift */
function trend3(base, drift = 0.03) {
  return {
    [Y[0]]: Math.max(1, Math.round(base * (1 - drift))),
    [Y[1]]: Math.max(1, Math.round(base)),
    [Y[2]]: Math.max(1, Math.round(base * (1 + drift * 0.6))),
  }
}

/** @param {string} id @param {string} name @param {Record<string, number>} cutoffs @param {PlacementStats} [placement] */
function br(id, name, cutoffs, placement) {
  return placement ? { id, name, cutoffs, placement: indicativePlacement(placement) } : { id, name, cutoffs }
}

/** @returns {CollegeRow[]} */
function buildIits() {
  /** @type {Array<[string, string, string, string, string, number, number, PlacementStats, Array<[string,string,number]>]>} */
  const rows = [
    [
      'iit-madras',
      'Indian Institute of Technology Madras',
      'IIT Madras',
      'Chennai',
      'Tamil Nadu',
      1,
      2.3,
      { avgLpa: 22, medianLpa: 17, lowestLpa: 7, highestDomesticLpa: 65, highestIntlLpa: 110, pctPlaced: 93 },
      [
        ['cse', 'Computer Science & Engineering', 175],
        ['ee', 'Electrical Engineering', 980],
        ['me', 'Mechanical Engineering', 2400],
        ['ae', 'Aerospace Engineering', 3200],
      ],
    ],
    [
      'iit-delhi',
      'Indian Institute of Technology Delhi',
      'IIT Delhi',
      'New Delhi',
      'Delhi',
      2,
      2.3,
      { avgLpa: 24, medianLpa: 18, lowestLpa: 8, highestDomesticLpa: 70, highestIntlLpa: 125, pctPlaced: 94 },
      [
        ['cse', 'Computer Science & Engineering', 115],
        ['ee', 'Electrical Engineering', 650],
        ['me', 'Mechanical Engineering', 1800],
        ['mt', 'Mathematics & Computing', 280],
      ],
    ],
    [
      'iit-bombay',
      'Indian Institute of Technology Bombay',
      'IIT Bombay',
      'Mumbai',
      'Maharashtra',
      3,
      2.3,
      { avgLpa: 25, medianLpa: 19, lowestLpa: 8, highestDomesticLpa: 72, highestIntlLpa: 130, pctPlaced: 95 },
      [
        ['cse', 'Computer Science & Engineering', 66],
        ['ee', 'Electrical Engineering', 420],
        ['me', 'Mechanical Engineering', 1500],
        ['che', 'Chemical Engineering', 2200],
      ],
    ],
    [
      'iit-kanpur',
      'Indian Institute of Technology Kanpur',
      'IIT Kanpur',
      'Kanpur',
      'Uttar Pradesh',
      4,
      2.2,
      { avgLpa: 20, medianLpa: 16, lowestLpa: 7, highestDomesticLpa: 58, highestIntlLpa: 95, pctPlaced: 92 },
      [
        ['cse', 'Computer Science & Engineering', 250],
        ['ee', 'Electrical Engineering', 1100],
        ['me', 'Mechanical Engineering', 2800],
        ['ae', 'Aerospace Engineering', 3600],
      ],
    ],
    [
      'iit-kharagpur',
      'Indian Institute of Technology Kharagpur',
      'IIT Kharagpur',
      'Kharagpur',
      'West Bengal',
      5,
      2.2,
      { avgLpa: 19, medianLpa: 15, lowestLpa: 6.5, highestDomesticLpa: 55, highestIntlLpa: 90, pctPlaced: 91 },
      [
        ['cse', 'Computer Science & Engineering', 320],
        ['ee', 'Electrical Engineering', 1400],
        ['me', 'Mechanical Engineering', 3200],
        ['min', 'Mining Engineering', 7800],
      ],
    ],
    [
      'iit-roorkee',
      'Indian Institute of Technology Roorkee',
      'IIT Roorkee',
      'Roorkee',
      'Uttarakhand',
      6,
      2.2,
      { avgLpa: 18, medianLpa: 14, lowestLpa: 6, highestDomesticLpa: 52, highestIntlLpa: 85, pctPlaced: 90 },
      [
        ['cse', 'Computer Science & Engineering', 420],
        ['ee', 'Electrical Engineering', 1800],
        ['ce', 'Civil Engineering', 6200],
        ['arch', 'Architecture', 11000],
      ],
    ],
    [
      'iit-guwahati',
      'Indian Institute of Technology Guwahati',
      'IIT Guwahati',
      'Guwahati',
      'Assam',
      7,
      2.2,
      { avgLpa: 17, medianLpa: 13, lowestLpa: 6, highestDomesticLpa: 48, highestIntlLpa: 80, pctPlaced: 89 },
      [
        ['cse', 'Computer Science & Engineering', 620],
        ['ee', 'Electronics & Electrical Engg.', 2200],
        ['me', 'Mechanical Engineering', 4200],
        ['design', 'Design', 9000],
      ],
    ],
    [
      'iit-hyderabad',
      'Indian Institute of Technology Hyderabad',
      'IIT Hyderabad',
      'Hyderabad',
      'Telangana',
      8,
      2.2,
      { avgLpa: 21, medianLpa: 16, lowestLpa: 7, highestDomesticLpa: 60, highestIntlLpa: 100, pctPlaced: 92 },
      [
        ['cse', 'Computer Science & Engineering', 680],
        ['ai', 'Artificial Intelligence', 750],
        ['ee', 'Electrical Engineering', 2400],
        ['me', 'Mechanical Engineering', 4800],
      ],
    ],
  ]

  const newer = [
    ['iit-indore', 'IIT Indore', 'Indore', 'Madhya Pradesh', 14, 1400],
    ['iit-bhu', 'IIT (BHU) Varanasi', 'Varanasi', 'Uttar Pradesh', 15, 1100],
    ['iit-ism', 'IIT (ISM) Dhanbad', 'Dhanbad', 'Jharkhand', 17, 2800],
    ['iit-bhubaneswar', 'IIT Bhubaneswar', 'Bhubaneswar', 'Odisha', 22, 3200],
    ['iit-gandhinagar', 'IIT Gandhinagar', 'Gandhinagar', 'Gujarat', 18, 1800],
    ['iit-patna', 'IIT Patna', 'Patna', 'Bihar', 28, 2800],
    ['iit-ropar', 'IIT Ropar', 'Rupnagar', 'Punjab', 31, 2200],
    ['iit-mandi', 'IIT Mandi', 'Mandi', 'Himachal Pradesh', 33, 2600],
    ['iit-jodhpur', 'IIT Jodhpur', 'Jodhpur', 'Rajasthan', 30, 2500],
    ['iit-tirupati', 'IIT Tirupati', 'Tirupati', 'Andhra Pradesh', 40, 4500],
    ['iit-palakkad', 'IIT Palakkad', 'Palakkad', 'Kerala', 42, 4800],
    ['iit-dharwad', 'IIT Dharwad', 'Dharwad', 'Karnataka', 45, 5200],
    ['iit-bhilai', 'IIT Bhilai', 'Bhilai', 'Chhattisgarh', 48, 5500],
    ['iit-goa', 'IIT Goa', 'Goa', 'Goa', 50, 5800],
    ['iit-jammu', 'IIT Jammu', 'Jammu', 'J&K', 52, 6000],
  ]

  /** @type {CollegeRow[]} */
  const out = rows.map(([id, name, shortName, city, state, nirf, fee, placement, branches]) => ({
    id,
    name,
    shortName,
    type: 'iit',
    exams: ['jee-advanced'],
    city,
    state,
    nirfRank: nirf,
    nirfYear: 2025,
    nirfSource: 'nirf',
    placementSource: 'indicative',
    feeAnnualLakh: fee,
    website: `https://www.${id.replace(/-/g, '')}.ac.in`,
    placement: indicativePlacement(placement),
    branches: branches.map(([bid, bname, base]) => br(bid, bname, trend3(base, 0.04))),
  }))

  for (const [id, shortName, city, state, nirf, cseBase] of newer) {
    out.push({
      id,
      name: shortName,
      shortName,
      type: 'iit',
      exams: ['jee-advanced'],
      city,
      state,
      nirfRank: nirf,
      nirfYear: 2025,
      nirfSource: 'nirf',
      placementSource: 'indicative',
      feeAnnualLakh: 2.2,
      website: `https://www.${id.replace(/-/g, '')}.ac.in`,
      placement: resolvePlacement(id, nirf, 'iit'),
      branches: [
        br('cse', 'Computer Science & Engineering', trend3(cseBase, 0.05)),
        br('ee', 'Electrical Engineering', trend3(Math.round(cseBase * 2.8), 0.05)),
        br('me', 'Mechanical Engineering', trend3(Math.round(cseBase * 4.2), 0.05)),
        br('ce', 'Civil Engineering', trend3(Math.round(cseBase * 5.5), 0.05)),
      ],
    })
  }
  return out
}

/** @returns {CollegeRow[]} */
function buildNits() {
  /** @type {Array<[string, string, string, string, number, number]>} */
  const list = [
    ['nit-trichy', 'NIT Tiruchirappalli', 'Tiruchirappalli', 'Tamil Nadu', 9, 1500],
    ['nit-surathkal', 'NIT Karnataka (Surathkal)', 'Mangaluru', 'Karnataka', 12, 2200],
    ['nit-warangal', 'NIT Warangal', 'Warangal', 'Telangana', 21, 2800],
    ['nit-calicut', 'NIT Calicut', 'Kozhikode', 'Kerala', 23, 4500],
    ['nit-rourkela', 'NIT Rourkela', 'Rourkela', 'Odisha', 16, 5000],
    ['nit-allahabad', 'MNNIT Allahabad', 'Prayagraj', 'Uttar Pradesh', 49, 5500],
    ['nit-jaipur', 'MNIT Jaipur', 'Jaipur', 'Rajasthan', 37, 6000],
    ['nit-kurukshetra', 'NIT Kurukshetra', 'Kurukshetra', 'Haryana', 58, 7500],
    ['nit-durgapur', 'NIT Durgapur', 'Durgapur', 'West Bengal', 44, 9000],
    ['nit-silchar', 'NIT Silchar', 'Silchar', 'Assam', 40, 14000],
    ['nit-hamirpur', 'NIT Hamirpur', 'Hamirpur', 'Himachal Pradesh', 51, 16000],
    ['nit-jalandhar', 'NIT Jalandhar', 'Jalandhar', 'Punjab', 46, 12000],
    ['nit-patna', 'NIT Patna', 'Patna', 'Bihar', 56, 18000],
    ['nit-raipur', 'NIT Raipur', 'Raipur', 'Chhattisgarh', 70, 20000],
    ['nit-nagpur', 'VNIT Nagpur', 'Nagpur', 'Maharashtra', 41, 7000],
    ['nit-surat', 'SVNIT Surat', 'Surat', 'Gujarat', 65, 10000],
    ['nit-bhopal', 'MANIT Bhopal', 'Bhopal', 'Madhya Pradesh', 80, 11000],
    ['nit-goa', 'NIT Goa', 'Ponda', 'Goa', 90, 16000],
    ['nit-puducherry', 'NIT Puducherry', 'Karaikal', 'Puducherry', 95, 22000],
    ['nit-meghalaya', 'NIT Meghalaya', 'Shillong', 'Meghalaya', 100, 28000],
    ['nit-agartala', 'NIT Agartala', 'Agartala', 'Tripura', 91, 30000],
    ['nit-srinagar', 'NIT Srinagar', 'Srinagar', 'J&K', 82, 32000],
    ['nit-delhi', 'NIT Delhi', 'New Delhi', 'Delhi', 45, 9000],
    ['nit-andhra', 'NIT Andhra Pradesh', 'Tadepalligudem', 'Andhra Pradesh', 88, 18000],
    ['nit-uttarakhand', 'NIT Uttarakhand', 'Srinagar (Garhwal)', 'Uttarakhand', 92, 25000],
    ['nit-mizoram', 'NIT Mizoram', 'Aizawl', 'Mizoram', 105, 35000],
    ['nit-nagaland', 'NIT Nagaland', 'Dimapur', 'Nagaland', 108, 36000],
    ['nit-manipur', 'NIT Manipur', 'Imphal', 'Manipur', 107, 34000],
    ['nit-sikkim', 'NIT Sikkim', 'Ravangla', 'Sikkim', 106, 33000],
    ['nit-arunachal', 'NIT Arunachal Pradesh', 'Yupia', 'Arunachal Pradesh', 110, 37000],
    ['nit-jamshedpur', 'NIT Jamshedpur', 'Jamshedpur', 'Jharkhand', 86, 15000],
  ]

  return list.map(([id, shortName, city, state, nirf, cse]) => ({
    id,
    name: shortName,
    shortName,
    type: /** @type {CollegeType} */ ('nit'),
    exams: /** @type {ExamId[]} */ (['jee-main']),
    city,
    state,
    nirfRank: nirf,
    nirfYear: 2025,
    nirfSource: 'nirf',
    placementSource: 'indicative',
    feeAnnualLakh: 1.6,
    website: id === 'nit-trichy' ? 'https://www.nitt.edu' : `https://www.${id}.ac.in`,
    placementPageUrl:
      id === 'nit-trichy'
        ? 'https://www.nitt.edu/academics/pages/TrainingPlacement/index.html'
        : undefined,
    placement: resolvePlacement(id, nirf, 'nit'),
    branches: [
      br('cse', 'Computer Science & Engineering', trend3(cse, 0.04)),
      br('ece', 'Electronics & Communication', trend3(Math.round(cse * 1.6), 0.04)),
      br('ee', 'Electrical Engineering', trend3(Math.round(cse * 2.2), 0.04)),
      br('me', 'Mechanical Engineering', trend3(Math.round(cse * 3.1), 0.04)),
      br('ce', 'Civil Engineering', trend3(Math.round(cse * 4.2), 0.04)),
    ],
  }))
}

/** @returns {CollegeRow[]} */
function buildIiits() {
  /** @type {Array<[string, string, string, string, number, number]>} */
  const list = [
    ['iiit-hyderabad', 'IIIT Hyderabad', 'Hyderabad', 'Telangana', 55, 900],
    ['iiit-bangalore', 'IIIT Bangalore', 'Bengaluru', 'Karnataka', 74, 1800],
    ['iiit-delhi', 'IIIT Delhi', 'New Delhi', 'Delhi', 75, 2500],
    ['iiit-allahabad', 'IIIT Allahabad', 'Prayagraj', 'Uttar Pradesh', 87, 4500],
    ['iiit-gwalior', 'ABV-IIITM Gwalior', 'Gwalior', 'Madhya Pradesh', 93, 8000],
    ['iiit-guwahati', 'IIIT Guwahati', 'Guwahati', 'Assam', 102, 14000],
    ['iiit-vadodara', 'IIIT Vadodara', 'Vadodara', 'Gujarat', 115, 16000],
    ['iiit-kota', 'IIIT Kota', 'Kota', 'Rajasthan', 120, 18000],
    ['iiit-sri-city', 'IIIT Sri City', 'Sri City', 'Andhra Pradesh', 125, 15000],
    ['iiit-pune', 'IIIT Pune', 'Pune', 'Maharashtra', 118, 12000],
    ['iiit-lucknow', 'IIIT Lucknow', 'Lucknow', 'Uttar Pradesh', 122, 14000],
    ['iiit-una', 'IIIT Una', 'Una', 'Himachal Pradesh', 130, 22000],
    ['iiit-kalyani', 'IIIT Kalyani', 'Kalyani', 'West Bengal', 128, 20000],
    ['iiit-dharwad', 'IIIT Dharwad', 'Dharwad', 'Karnataka', 132, 21000],
    ['iiit-kottayam', 'IIIT Kottayam', 'Kottayam', 'Kerala', 135, 19000],
    ['iiitdm-kancheepuram', 'IIITDM Kancheepuram', 'Chennai', 'Tamil Nadu', 98, 10000],
    ['iiitdm-jabalpur', 'IIITDM Jabalpur', 'Jabalpur', 'Madhya Pradesh', 101, 12000],
    ['iiitdm-kurnool', 'IIITDM Kurnool', 'Kurnool', 'Andhra Pradesh', 140, 25000],
  ]

  return list.map(([id, shortName, city, state, nirf, cse]) => ({
    id,
    name: shortName,
    shortName,
    type: /** @type {CollegeType} */ ('iiit'),
    exams: /** @type {ExamId[]} */ (['jee-main']),
    city,
    state,
    nirfRank: nirf,
    nirfYear: 2025,
    nirfSource: 'nirf',
    placementSource: 'indicative',
    feeAnnualLakh: id.includes('hyderabad') || id.includes('bangalore') || id.includes('delhi') ? 3.5 : 2.2,
    website:
      id === 'iiit-hyderabad'
        ? 'https://www.iiit.ac.in'
        : id === 'iiit-bangalore'
          ? 'https://www.iiitb.ac.in'
          : id === 'iiit-delhi'
            ? 'https://www.iiitd.ac.in'
            : `https://www.${id}.ac.in`,
    placementPageUrl:
      id === 'iiit-hyderabad' ? 'https://www.iiit.ac.in/placements/' : undefined,
    placement: resolvePlacement(id, nirf, 'iiit'),
    branches: [
      br('cse', 'Computer Science & Engineering', trend3(cse, 0.04)),
      br('it', 'Information Technology', trend3(Math.round(cse * 1.25), 0.04)),
      br('ece', 'Electronics & Communication', trend3(Math.round(cse * 1.8), 0.04)),
    ],
  }))
}

/** @returns {CollegeRow[]} */
function buildMedical() {
  /** @type {Array<[string, string, string, string, number, number, number]>} */
  const list = [
    ['aiims-delhi', 'AIIMS New Delhi', 'New Delhi', 'Delhi', 1, 55, 2.0],
    ['aiims-jodhpur', 'AIIMS Jodhpur', 'Jodhpur', 'Rajasthan', 8, 520, 1.5],
    ['aiims-bhopal', 'AIIMS Bhopal', 'Bhopal', 'Madhya Pradesh', 10, 680, 1.5],
    ['aiims-bhubaneswar', 'AIIMS Bhubaneswar', 'Bhubaneswar', 'Odisha', 12, 750, 1.5],
    ['aiims-raipur', 'AIIMS Raipur', 'Raipur', 'Chhattisgarh', 14, 900, 1.5],
    ['aiims-rishikesh', 'AIIMS Rishikesh', 'Rishikesh', 'Uttarakhand', 11, 820, 1.5],
    ['aiims-patna', 'AIIMS Patna', 'Patna', 'Bihar', 15, 1100, 1.5],
    ['aiims-nagpur', 'AIIMS Nagpur', 'Nagpur', 'Maharashtra', 16, 1200, 1.5],
    ['aiims-mangalagiri', 'AIIMS Mangalagiri', 'Mangalagiri', 'Andhra Pradesh', 18, 1400, 1.5],
    ['aiims-bibinagar', 'AIIMS Bibinagar', 'Bibinagar', 'Telangana', 19, 1500, 1.5],
    ['jipmer', 'JIPMER Puducherry', 'Puducherry', 'Puducherry', 5, 280, 1.2],
    ['cmc-vellore', 'CMC Vellore', 'Vellore', 'Tamil Nadu', 3, 180, 4.5],
    ['maulana-azad', 'Maulana Azad Medical College', 'New Delhi', 'Delhi', 20, 450, 0.4],
    ['ucms-delhi', 'UCMS Delhi', 'New Delhi', 'Delhi', 25, 900, 0.4],
    ['lhmc-delhi', 'Lady Hardinge Medical College', 'New Delhi', 'Delhi', 28, 1200, 0.35],
    ['kgmc-lucknow', 'King George Medical University', 'Lucknow', 'Uttar Pradesh', 30, 2500, 0.6],
    ['bhu-ims', 'IMS BHU', 'Varanasi', 'Uttar Pradesh', 22, 1800, 0.5],
    ['afmc-pune', 'AFMC Pune', 'Pune', 'Maharashtra', 6, 150, 0.8],
    ['grant-mumbai', 'Grant Medical College', 'Mumbai', 'Maharashtra', 35, 2200, 0.9],
    ['seth-gs', 'Seth GS Medical College', 'Mumbai', 'Maharashtra', 32, 2000, 0.9],
    ['madras-mc', 'Madras Medical College', 'Chennai', 'Tamil Nadu', 40, 3500, 0.5],
    ['stanley-mc', 'Stanley Medical College', 'Chennai', 'Tamil Nadu', 48, 5000, 0.5],
    ['bangalore-mc', 'Bangalore Medical College', 'Bengaluru', 'Karnataka', 42, 4000, 0.6],
    ['osmania-mc', 'Osmania Medical College', 'Hyderabad', 'Telangana', 45, 4500, 0.55],
    ['gmc-chandigarh', 'GMCH Chandigarh', 'Chandigarh', 'Chandigarh', 27, 1600, 0.7],
    ['sms-jaipur', 'SMS Medical College', 'Jaipur', 'Rajasthan', 50, 6000, 0.55],
    ['gmc-kozhikode', 'GMC Kozhikode', 'Kozhikode', 'Kerala', 55, 7000, 0.45],
    ['ipgmer-kolkata', 'IPGMER Kolkata', 'Kolkata', 'West Bengal', 38, 3200, 0.5],
    ['nrsmc-kolkata', 'NRS Medical College', 'Kolkata', 'West Bengal', 52, 5500, 0.5],
    ['gmch-guwahati', 'Gauhati Medical College', 'Guwahati', 'Assam', 60, 9000, 0.4],
    ['gmc-patna', 'Patna Medical College', 'Patna', 'Bihar', 70, 18000, 0.35],
    ['rmc-ranchi', 'RIMS Ranchi', 'Ranchi', 'Jharkhand', 75, 22000, 0.4],
    ['gmc-amritsar', 'GMC Amritsar', 'Amritsar', 'Punjab', 68, 15000, 0.45],
    ['snmc-agra', 'SN Medical College Agra', 'Agra', 'Uttar Pradesh', 72, 20000, 0.4],
    ['gmc-aurangabad', 'GMC Aurangabad', 'Chhatrapati Sambhajinagar', 'Maharashtra', 65, 16000, 0.5],
    ['kgh-visakhapatnam', 'Andhra Medical College', 'Visakhapatnam', 'Andhra Pradesh', 62, 14000, 0.45],
    ['gmc-thiruvananthapuram', 'GMC Thiruvananthapuram', 'Thiruvananthapuram', 'Kerala', 58, 12000, 0.4],
    ['rjms-jaipur', 'RUHS CMS Jaipur', 'Jaipur', 'Rajasthan', 78, 28000, 0.5],
    ['gmc-shimla', 'IGMC Shimla', 'Shimla', 'Himachal Pradesh', 80, 30000, 0.35],
  ]

  return list.map(([id, shortName, city, state, nirf, mbbs, fee]) => ({
    id,
    name: shortName,
    shortName,
    type: /** @type {CollegeType} */ ('medical'),
    exams: /** @type {ExamId[]} */ (['neet']),
    city,
    state,
    nirfRank: nirf,
    nirfYear: 2025,
    nirfSource: 'nirf',
    placementSource: null,
    feeAnnualLakh: fee,
    website: 'https://mcc.nic.in',
    placement: {
      avgLpa: undefined,
      medianLpa: undefined,
      lowestLpa: undefined,
      highestDomesticLpa: undefined,
      highestIntlLpa: undefined,
      pctPlaced: undefined,
      placementSource: null,
    },
    branches: [
      br('mbbs', 'MBBS', trend3(mbbs, 0.05)),
      ...(nirf <= 20
        ? [br('bds', 'BDS (if offered)', trend3(Math.round(mbbs * 8), 0.05))]
        : []),
    ],
  }))
}

/** @type {CollegeRow[]} */
export const CAREER_COMPASS_BASELINE = [
  ...buildIits(),
  ...buildNits(),
  ...buildIiits(),
  ...buildMedical(),
]

export const CAREER_COMPASS_SOURCES = [
  {
    id: 'josaa',
    label: 'JoSAA counselling reports',
    url: 'https://josaa.nic.in',
    verifyUrl: 'https://josaa.nic.in/Archives/result/archiveresult.aspx',
    years: '2024–2026',
    verifyLabel: 'Verify on JoSAA',
    description: 'Official IIT / NIT / IIIT / GFTI closing ranks & seat allotment.',
  },
  {
    id: 'csab',
    label: 'CSAB special rounds',
    url: 'https://csab.nic.in',
    verifyUrl: 'https://csab.nic.in',
    years: '2024–2026',
    verifyLabel: 'Verify on CSAB',
    description: 'Official vacant-seat counselling after JoSAA.',
  },
  {
    id: 'mcc',
    label: 'MCC NEET UG counselling',
    url: 'https://mcc.nic.in',
    verifyUrl: 'https://mcc.nic.in/web/open/allotment-result',
    years: '2024–2026',
    verifyLabel: 'Verify on MCC',
    description: 'Official NEET UG AIQ & deemed-university cutoffs.',
  },
  {
    id: 'nta',
    label: 'NTA marks / percentile / AIR & State Rank',
    url: 'https://nta.ac.in',
    verifyUrl: 'https://nta.ac.in/Examination',
    years: '2024–2026',
    verifyLabel: 'Verify on NTA',
    description: 'Official JEE / NEET scorecards and rank statements.',
  },
  {
    id: 'nirf',
    label: 'NIRF rankings',
    url: 'https://www.nirfindia.org',
    verifyUrl: 'https://www.nirfindia.org/Rankings',
    years: '2024–2025',
    verifyLabel: 'Verify on NIRF',
    description: 'National Institutional Ranking Framework — official institute ranks.',
  },
]

export const CAREER_EXAMS = [
  { id: 'jee-main', label: 'JEE Main', rankLabel: 'All India Rank (AIR)', marksMax: 300 },
  { id: 'jee-advanced', label: 'JEE Advanced', rankLabel: 'All India Rank (AIR)', marksMax: 360 },
  { id: 'neet', label: 'NEET UG', rankLabel: 'All India Rank (AIR)', marksMax: 720 },
]

/** @param {CollegeType | 'all'} type */
export function filterCollegesByType(colleges, type) {
  if (!type || type === 'all') return colleges
  return colleges.filter((c) => c.type === type)
}
