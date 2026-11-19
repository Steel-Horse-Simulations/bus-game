// A random, plausible UK driver name for "+ Hire driver" (duty-panel.ts)
// — editable afterward via renameDriver, same "generated but overridable"
// convention nextDutyNumber already uses for duty numbers. Pure, no DOM
// dependency, so it's unit-testable; takes an injectable random source
// (defaults to Math.random) so a test can pass a deterministic one
// instead of asserting on a genuinely random pick.
const FIRST_NAMES = [
  "James", "John", "Robert", "Michael", "David", "William", "Richard", "Thomas", "Mark", "Paul",
  "Steven", "Andrew", "Kenneth", "Stephen", "Gary", "Jason", "Ryan", "Craig", "Alan", "Graham",
  "Mary", "Jennifer", "Linda", "Patricia", "Elizabeth", "Susan", "Jessica", "Sarah", "Karen", "Nancy",
  "Lisa", "Margaret", "Sandra", "Donna", "Carol", "Michelle", "Emma", "Laura", "Fiona", "Claire",
] as const;

const SURNAMES = [
  "Smith", "Jones", "Taylor", "Brown", "Wilson", "Johnson", "Davies", "Robinson", "Wright", "Thompson",
  "Evans", "Walker", "White", "Roberts", "Green", "Hall", "Wood", "Jackson", "Clarke", "Patel",
  "Campbell", "Stewart", "Robertson", "Anderson", "MacDonald", "Scott", "Reid", "Murray", "Clark", "Ross",
] as const;

export function randomDriverName(rng: () => number = Math.random): string {
  const first = FIRST_NAMES[Math.floor(rng() * FIRST_NAMES.length)];
  const last = SURNAMES[Math.floor(rng() * SURNAMES.length)];
  return `${first} ${last}`;
}
