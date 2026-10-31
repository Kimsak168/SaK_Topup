export const GAME_EVENT_GAMES = [
  "pubg-mobile",
  "mobile-legends",
  "free-fire",
  "roblox",
  "call-of-duty",
] as const;

export type GameEventGame = (typeof GAME_EVENT_GAMES)[number];

export const GAME_EVENT_GAME_LABELS: Record<GameEventGame, string> = {
  "pubg-mobile": "PUBG Mobile",
  "mobile-legends": "Mobile Legends",
  "free-fire": "Free Fire",
  roblox: "Roblox",
  "call-of-duty": "Call of Duty",
};

export const GAME_EVENT_STATUSES = ["upcoming", "live", "ended"] as const;
export type GameEventStatus = (typeof GAME_EVENT_STATUSES)[number];

export const GAME_EVENT_STATUS_LABELS: Record<GameEventStatus, string> = {
  upcoming: "Upcoming",
  live: "Live",
  ended: "Ended",
};

export interface GameEventView {
  id: string;
  game: GameEventGame;
  title: string;
  description: string;
  details: string;
  startDate: string;
  endDate: string;
  status: GameEventStatus;
  imageUrl: string;
  targetUrl: string;
  isActive: boolean;
  sortOrder: number;
}
