export const DISCOVERY_GENRE_FAMILIES = [
  { id: 'action-adventure', label: 'Action & adventure' },
  { id: 'role-playing', label: 'Role-playing' },
  { id: 'shooter', label: 'Shooters' },
  { id: 'strategy', label: 'Strategy' },
  { id: 'simulation', label: 'Simulation & building' },
  { id: 'platform', label: 'Platformers' },
  { id: 'puzzle', label: 'Puzzles' },
  { id: 'racing-sports', label: 'Racing & sports' },
  { id: 'fighting', label: 'Fighting' },
  { id: 'horror-survival', label: 'Horror & survival' },
  { id: 'cards', label: 'Cards' },
  { id: 'casual-social', label: 'Casual & social' },
  { id: 'rhythm', label: 'Rhythm' },
  { id: 'other', label: 'Other / unclassified' },
] as const;
export type DiscoveryGenreFamily = typeof DISCOVERY_GENRE_FAMILIES[number]['id'];

// Exact slash-separated source terms, not inferred game facts or substring matching.
// Themes and ambiguous labels (e.g. Fantasy, MMO, roguelike) do not imply a gameplay family.
const familyTerms: Record<Exclude<DiscoveryGenreFamily, 'other'>, readonly string[]> = {
  'action-adventure': [
    'action', 'action game', 'action-adventure', 'action-adventure game', 'adventure', 'adventure video game',
    'graphic adventure game', 'point-and-click adventure', 'interactive fiction', 'interactive film', 'visual novel',
    'stealth', 'stealth game', 'immersive sim', 'character-action video game', 'hack and slash', "beat 'em up",
    'open-world action', 'open-world action-adventure', 'action-platformer', 'action rpg', 'arpg', 'mmoarpg',
    'action role-playing game', 'online action rpg', 'open-world action rpg',
  ],
  'role-playing': [
    'rpg', 'crpg', 'action rpg', 'arpg', 'mmorpg', 'mmoarpg', 'online action rpg', 'open-world rpg',
    'open-world action rpg', 'turn-based rpg', 'role-playing video game', 'action role-playing game',
    'japanese role-playing video game', 'turn-based role-playing game', 'turn-based japanese role-playing game',
    'tactical role-playing game', 'massively multiplayer online role-playing game',
  ],
  shooter: [
    'shooter', 'fps', 'open-world fps', 'hero shooter', 'first-person shooter', 'third-person shooter',
    'third-person roguelike shooter', 'tactical shooter', 'rail shooter', "shoot 'em up", 'run and gun',
    'looter shooter', 'horde shooter', 'twitch shooter',
  ],
  strategy: [
    'strategy', 'strategy video game', 'strategic game', 'rts', 'real-time strategy', 'turn-based strategy video game',
    'real-time tactics', 'grand strategy wargame', '4x', 'moba', 'tactical role-playing game',
  ],
  simulation: [
    'simulation video game', 'construction and management simulation', 'city-building game', 'factory simulation game',
    'life simulation game', 'social simulation game', 'flight simulation video game', 'space flight simulation game',
    'farming simulation game', 'farm life sim', 'submarine simulator', 'train simulator', 'truck simulation video game',
    'business simulation game',
  ],
  platform: [
    'platformer', '2d platform game', '3d platform game', 'collect-a-thon platformer', 'cinematic platformer',
    'puzzle-platformer', 'action-platformer', 'metroidvania',
  ],
  puzzle: ['puzzle', 'puzzle video game', 'puzzle-platformer', 'sokoban video game', 'maze video game', 'breakout clone'],
  'racing-sports': [
    'racing', 'sports', 'racing video game', 'kart racing game', 'mascot racer', 'association football video game',
    'roller skating video game',
  ],
  fighting: ['fighting', 'fighting game', '2d fighting game', '3d fighting game', 'airdasher', 'platform fighter', "beat 'em up"],
  'horror-survival': [
    'survival', 'survival game', 'survival horror', 'horror video game', 'supernatural horror game', 'psychological horror fiction',
  ],
  cards: ['card game', 'card battle video game'],
  'casual-social': ['social', 'casual game', 'party video game', 'social deduction video game', 'social simulation game'],
  rhythm: ['rhythm game'],
};
const familiesByTerm = new Map<string, DiscoveryGenreFamily[]>();
for (const { id } of DISCOVERY_GENRE_FAMILIES) {
  if (id === 'other') continue;
  for (const term of familyTerms[id]) {
    const matches = familiesByTerm.get(term) ?? [];
    matches.push(id);
    familiesByTerm.set(term, matches);
  }
}

export function parseDiscoveryGenreFamily(value: string | null): DiscoveryGenreFamily | '' {
  return DISCOVERY_GENRE_FAMILIES.find(family => family.id === value)?.id ?? '';
}

export function discoveryGenreFamilies(genre: string | null): readonly DiscoveryGenreFamily[] {
  const matches = new Set((genre ?? '').split('/').flatMap(term => familiesByTerm.get(term.trim().toLowerCase()) ?? []));
  return matches.size ? [...matches] : ['other'];
}

export function matchesDiscoveryGenre(genre: string | null, exact: string, family: DiscoveryGenreFamily | '' = ''): boolean {
  return (!exact || genre === exact) && (!family || discoveryGenreFamilies(genre).includes(family));
}
