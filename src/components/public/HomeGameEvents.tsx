import { getPublicGameEvents } from "@/lib/services/gameEventService";
import { GameEventsCarousel } from "./GameEventsCarousel";

export async function HomeGameEvents() {
  let events: Awaited<ReturnType<typeof getPublicGameEvents>> = [];
  let unavailable = false;
  try {
    events = await getPublicGameEvents();
  } catch {
    // Keep a catalogue outage from taking down the homepage, while distinguishing
    // unavailable data from a genuinely empty event list.
    console.error("Unable to load homepage game events.");
    events = [];
    unavailable = true;
  }
  return <GameEventsCarousel events={events} unavailable={unavailable} />;
}
