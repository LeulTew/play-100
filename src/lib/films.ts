export interface CollectionFilm {
  id: 'the-100' | 'discover-compare';
  title: string;
  description: string;
  context: string;
  durationSeconds: number;
  video: { src: string; bytes: number; sha256: string };
  poster: { src: string; width: number; height: number };
  captions: string;
  credits: string;
  transcriptFile: string;
  transcript: readonly { time: string; text: string }[];
}

export const collectionFilms: readonly CollectionFilm[] = [{
  id: 'the-100',
  title: 'The 100',
  description: 'One point of view. The original order, ratings and workbook.',
  context: "The shown order and Leul's ratings come from the original workbook. Critic scores are recorded snapshots, not live results. No play or completion state is implied.",
  durationSeconds: 22,
  video: {
    src: '/videos/e6cd0cdf26b363e06c399f8b65a702a2e9d9e90cd6826125c2eb5d04c82b4782.mp4',
    bytes: 2965324,
    sha256: 'e6cd0cdf26b363e06c399f8b65a702a2e9d9e90cd6826125c2eb5d04c82b4782',
  },
  poster: { src: '/videos/2d5598c99f42915f129a8e97f4a2073f12e1384b560371df8549ba58b353bb0f.jpg', width: 1920, height: 1080 },
  captions: '/videos/771e9ff1de62fff490f226fcc4555832ee62672aac6ae5e2155e64fceab39bb6.vtt',
  credits: '/videos/1152ca02b811985425a3403a3923908d7e092314a4f602a2ad13483b7bea208d.md',
  transcriptFile: '/videos/8819bf07402dd0da0f10d4ae9ae8a772c62517a84125faf6d3ebf626c0c0e8e6.txt',
  transcript: [
    { time: '00:00-00:04', text: '"100 games. One point of view." Numbered source jackets open into a stack. "The Core 50. And 50 more essentials." The foreground entry is #01, Red Dead Redemption 2 (2018, Core 50). Credit: Leul Tewodros Agonafer.' },
    { time: '00:04-00:10', text: 'The collection shows #01 Red Dead Redemption 2, #07 Grand Theft Auto IV and #51 DOOM Eternal. Genre, year and collection filters are available; public-catalog search is off. Searching "Grand Theft Auto IV" finds one game: 2008, Core 50, Leul\'s rating 9.8/10. Its original rank stays 07. "Original rank, unchanged." Reset filters, then switch to the ratings table.' },
    { time: '00:10-00:17', text: '"His order. His ratings." Leul\'s original /10 ratings are separate from critic scores. #01 Red Dead Redemption 2: Leul 10.0, Metacritic 97/100, IGN 10/10. #07 Grand Theft Auto IV: Leul 9.8, Metacritic 98/100, IGN unavailable. #51 DOOM Eternal (2020, Essential 50): Leul 8.5, Metacritic 88/100, IGN 9/10. A dash means unavailable. These are workbook snapshots, not live scores; no play or completion state is implied.' },
    { time: '00:17-00:22', text: '"Play 100. Take all 100 with you." A workbook shows the same selected source rows in their original positions. Both the enhanced workbook and untouched original Excel are available. play-100-collection.vercel.app. Curated by Leul Tewodros Agonafer.' },
  ],
}, {
  id: 'discover-compare',
  title: 'Discover & compare',
  description: 'Find games, pin a shortlist and compare shared rankings.',
  context: 'A product walkthrough, not gameplay footage. Friend names and personal ratings are explicitly labelled demo examples; no real accounts or private data are shown.',
  durationSeconds: 22,
  video: {
    src: '/videos/42a58634237bb92b8cf67275ddf1b16d8cb99d05141694d63823af45a34a9a65.mp4',
    bytes: 2231133,
    sha256: '42a58634237bb92b8cf67275ddf1b16d8cb99d05141694d63823af45a34a9a65',
  },
  poster: { src: '/videos/9ad1b154e0052138411dbdeec800b42183d46e8a5f2a21748abdcabcaa9f215e.jpg', width: 1920, height: 1080 },
  captions: '/videos/771e9ff1de62fff490f226fcc4555832ee62672aac6ae5e2155e64fceab39bb6.vtt',
  credits: '/videos/1f6bf9d8fddb61620080855efd6dc16449382c77be13dba709737430e4e8700f.md',
  transcriptFile: '/videos/ccd64134f0e897887cfdf962b7597fc6fbeca8b52fa2e5622831b290dff503a7.txt',
  transcript: [
    { time: '00:00-00:04', text: '"Your next game starts here. Less choosing. More playing." "Play 100. Bring your friends." Source-derived Hades and Hollow Knight cards.' },
    { time: '00:04-00:11', text: 'Discover displays Hades, Hollow Knight and Portal 2. Pin Hades, then Hollow Knight. The Compare tray changes from one to two games. "Pinning does not save, rate or share a game." Choose Compare.' },
    { time: '00:11-00:18', text: 'Compare the two pinned games with You, Alex and Sam selected. "Demo friends & ratings" explicitly identifies the examples. Hades: You 9.0 (rank 2), Alex 8.0 (rank 3), Sam 9.5 (rank 1); mean 8.83, three raters, spread 1.50. Hollow Knight: You 9.5 (rank 1), Alex 9.0 (rank 2), Sam 9.0 (rank 2); mean 9.17, three raters, spread 0.50. Ratings are /10. "Friends choose what to share."' },
    { time: '00:18-00:22', text: '"Less choosing. More playing. Play 100. Find. Pin. Compare." play-100-collection.vercel.app. Curated by Leul Tewodros Agonafer.' },
  ],
}];

export function filmDuration(seconds: number): string {
  const rounded = Math.round(seconds);
  return `${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(2, '0')}`;
}

export function unloadFilm(video: HTMLVideoElement): void {
  video.pause();
  video.removeAttribute('src');
  video.load();
}
