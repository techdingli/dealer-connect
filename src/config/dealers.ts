import adventInfra from '@/assets/dealers/advent-infra.png'
import aguatechEngineers from '@/assets/dealers/aguatech-engineers.png'
import ahujaCorporation from '@/assets/dealers/ahuja-corporation.png'
import asgInfratech from '@/assets/dealers/asg-infratech.png'
import asianCranes from '@/assets/dealers/asian-cranes.png'
import cearsExports from '@/assets/dealers/cears-exports.png'
import deepEngineering from '@/assets/dealers/deep-engineering.png'
import depaamSales from '@/assets/dealers/depaam-sales.png'
import distiAndCo from '@/assets/dealers/disti-and-co.png'
import eazyLift from '@/assets/dealers/eazy-lift.png'
import futuretechCranes from '@/assets/dealers/futuretech-cranes.png'
import gulatiCranes from '@/assets/dealers/gulati-cranes.png'
import krownInfrastructure from '@/assets/dealers/krown-infrastructure.png'
import marutiConstruction from '@/assets/dealers/maruti-construction.png'
import ramanandPower from '@/assets/dealers/ramanand-power.png'
import rksEngineering from '@/assets/dealers/rks-engineering.png'

export interface Dealer {
  /** Stable slug — used as the demo user id and as the seed for their data. */
  id: string
  /** Full registered name, as it appears on the Dingli India dealer list. */
  companyName: string
  /** Shorter form used in greetings and tight UI ("Welcome back, …"). */
  shortName: string
  city: string
  state: string
  /** GST state code for `city` — gives generated GSTINs the right prefix. */
  stateCode: string
  /** Imported logo asset, or null where Dingli has no logo on file. */
  logo: string | null
}

/**
 * The 17 Dingli India dealers, from "Dingli Dealer list.xls".
 *
 * Deliberately branding/identity only — company name, city and logo. Contact
 * names, phone numbers and email addresses from that sheet are NOT duplicated
 * here: this repo is public (see PENDING_TASKS.md), and none of the portal's
 * screens need them.
 */
export const DEALERS: Dealer[] = [
  {
    id: 'rks-engineering',
    companyName: 'RKS Engineering Industries',
    shortName: 'RKS Engineering',
    city: 'Chennai',
    state: 'Tamil Nadu',
    stateCode: '33',
    logo: rksEngineering,
  },
  {
    id: 'maruti-construction',
    companyName: 'Maruti Construction Equipments',
    shortName: 'Maruti',
    city: 'Ahmedabad',
    state: 'Gujarat',
    stateCode: '24',
    logo: marutiConstruction,
  },
  {
    id: 'advent-infra',
    companyName: 'Advent Infra Equipment',
    shortName: 'Advent',
    city: 'Bangalore',
    state: 'Karnataka',
    stateCode: '29',
    logo: adventInfra,
  },
  {
    id: 'deep-engineering',
    companyName: 'Deep Engineering Works Pvt. Ltd.',
    shortName: 'Deep Engineering',
    city: 'Rewari',
    state: 'Haryana',
    stateCode: '06',
    logo: deepEngineering,
  },
  {
    id: 'futuretech-cranes',
    companyName: 'Futuretech Cranes & Hoists',
    shortName: 'Futuretech',
    city: 'Coimbatore',
    state: 'Tamil Nadu',
    stateCode: '33',
    logo: futuretechCranes,
  },
  {
    id: 'depaam-sales',
    companyName: 'Depaam Sales & Services',
    shortName: 'Depaam',
    city: 'Delhi',
    state: 'Delhi',
    stateCode: '07',
    logo: depaamSales,
  },
  {
    id: 'aguatech-engineers',
    companyName: 'Aguatech Engineers Pvt Ltd',
    shortName: 'Aguatech',
    city: 'Pune',
    state: 'Maharashtra',
    stateCode: '27',
    logo: aguatechEngineers,
  },
  {
    id: 'ramanand-power',
    companyName: 'Ramanand Power Systems Pvt Ltd',
    shortName: 'Ramanand Power',
    city: 'Hyderabad',
    state: 'Telangana',
    stateCode: '36',
    logo: ramanandPower,
  },
  {
    id: 'ahuja-corporation',
    companyName: 'Ahuja Corporation Private Limited',
    shortName: 'Ahuja Corporation',
    city: 'Jaipur',
    state: 'Rajasthan',
    stateCode: '08',
    logo: ahujaCorporation,
  },
  {
    id: 'gulati-cranes',
    companyName: 'Gulati Cranes',
    shortName: 'Gulati Cranes',
    city: 'Nashik',
    state: 'Maharashtra',
    stateCode: '27',
    logo: gulatiCranes,
  },
  {
    id: 'disti-and-co',
    companyName: 'Disti And Co',
    shortName: 'Disti & Co',
    city: 'Bhubaneswar',
    state: 'Odisha',
    stateCode: '21',
    logo: distiAndCo,
  },
  {
    id: 'asian-cranes',
    companyName: 'Asian Cranes Private Limited',
    shortName: 'Asian Cranes',
    city: 'Ludhiana',
    state: 'Punjab',
    stateCode: '03',
    logo: asianCranes,
  },
  {
    id: 'krown-infrastructure',
    companyName: 'Krown Infrastructure Equipments Limited',
    shortName: 'Krown',
    city: 'Mumbai',
    state: 'Maharashtra',
    stateCode: '27',
    logo: krownInfrastructure,
  },
  {
    id: 'eazy-lift',
    companyName: 'Eazy Lift Solutions',
    shortName: 'Eazy Lift',
    city: 'Jamshedpur',
    state: 'Jharkhand',
    stateCode: '20',
    logo: eazyLift,
  },
  {
    id: 'cears-exports',
    companyName: 'Cears Exports Pvt Ltd',
    shortName: 'Cears',
    city: 'Kochi',
    state: 'Kerala',
    stateCode: '32',
    logo: cearsExports,
  },
  {
    // The one dealer with no logo in "16 Dealer logos.rar" — DealerLogo falls
    // back to initials for this row.
    id: 'ramanand-laud',
    companyName: 'Ramanand Laud',
    shortName: 'Ramanand Laud',
    city: 'Goa',
    state: 'Goa',
    stateCode: '30',
    logo: null,
  },
  {
    id: 'asg-infratech',
    companyName: 'ASG Infra Tech',
    shortName: 'ASG Infratech',
    city: 'Panchkula',
    state: 'Haryana',
    stateCode: '06',
    logo: asgInfratech,
  },
]

export const DEALERS_BY_ID = new Map(DEALERS.map((d) => [d.id, d]))

export function getDealer(id: string | null | undefined): Dealer | null {
  return id ? (DEALERS_BY_ID.get(id) ?? null) : null
}

/**
 * Normalises a dealership name for comparison: case, punctuation and the legal
 * suffix all vary between the dealer list, Focus and whatever someone typed at
 * signup ("AHUJA CORPORATION PRIVATE LIMITED" vs "Ahuja Corporation Pvt. Ltd.").
 */
function normaliseName(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, ' and ')
    // Punctuation first, so "Pvt. Ltd." and "Pvt Ltd" collapse the same way.
    .replace(/[^a-z0-9]+/g, ' ')
    // Word boundaries matter: without them "co" eats the "co" in "Construction".
    .replace(/\b(?:private|pvt|limited|ltd|llp|inc|company|corporation|corp)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const DEALERS_BY_NORMALISED_NAME = new Map(
  DEALERS.flatMap((d) => [
    [normaliseName(d.companyName), d] as const,
    [normaliseName(d.shortName), d] as const,
  ]),
)

/**
 * Finds a dealer's branding from a name, for live mode — where identity comes
 * from the Supabase `profiles` row, not from the demo dropdown. Supabase holds
 * no logos (no column, no storage bucket), so the logo has to be looked up from
 * the bundled registry; matching on name is what links the two.
 *
 * Returns null rather than guessing when nothing matches — a wrong logo on
 * someone's invoice is far worse than no logo.
 */
export function findDealerByName(...names: (string | null | undefined)[]): Dealer | null {
  for (const name of names) {
    if (!name) continue
    const match = DEALERS_BY_NORMALISED_NAME.get(normaliseName(name))
    if (match) return match
  }
  return null
}

/** Two-letter monogram, used wherever a dealer has no logo on file. */
export function dealerInitials(dealer: Dealer) {
  return dealer.companyName
    .split(/\s+/)
    .filter((w) => /^[A-Za-z]/.test(w))
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('')
}
