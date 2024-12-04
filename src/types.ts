export interface TwitterProfile {
  username: string;
  name: string;
  bio: string;
  tweets: string[];
  following: number;
  followers: number;
}

export interface ScrapeResult {
  success: boolean;
  profile?: TwitterProfile;
  error?: string;
}