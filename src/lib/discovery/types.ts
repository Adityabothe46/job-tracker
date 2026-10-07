import type { RawListing, WatchedBoard } from "@/types";

export interface SearchCriteria {
  keywords: string[];
  locations: string[];
  remoteOk: boolean;
  freshnessHours: number;
  watchedBoards: WatchedBoard[];
}

export interface Connector {
  source: RawListing["source"];
  fetchNewListings(criteria: SearchCriteria): Promise<RawListing[]>;
}
