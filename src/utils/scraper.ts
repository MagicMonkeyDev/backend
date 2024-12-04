import axios from 'axios';
import * as cheerio from 'cheerio';
import type { ScrapeResult, TwitterProfile } from '../types.js';

const NITTER_INSTANCES = [
  'https://nitter.net',
  'https://nitter.1d4.us',
  'https://nitter.kavin.rocks',
  'https://nitter.it',
  'https://nitter.privacydev.net',
  'https://nitter.projectsegfau.lt'
];

async function fetchWithTimeout(url: string, timeout = 8000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await axios.get(url, { 
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });
    clearTimeout(id);
    return response;
  } catch (error) {
    clearTimeout(id);
    throw error;
  }
}

async function tryNitterInstances(username: string) {
  const errors: string[] = [];
  for (const instance of NITTER_INSTANCES) {
    try {
      const url = `${instance}/${username}`;
      const response = await fetchWithTimeout(url);
      return response.data;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      errors.push(`${instance}: ${errorMessage}`);
      continue;
    }
  }
  throw new Error(`Failed to fetch profile data from all instances. Details: ${errors.join(', ')}`);
}

export async function scrapeTwitterProfile(username: string): Promise<ScrapeResult> {
  try {
    const cleanUsername = username.replace(/^@/, '').trim();
    if (!cleanUsername) {
      return {
        success: false,
        error: 'Please enter a valid username'
      };
    }

    const html = await tryNitterInstances(cleanUsername);
    const $ = cheerio.load(html);

    const name = $('.profile-card-fullname').text().trim();
    const bio = $('.profile-bio').text().trim();
    const followersText = $('.profile-stat-num').eq(0).text().trim();
    const followingText = $('.profile-stat-num').eq(1).text().trim();
    
    const convertCount = (count: string): number => {
      const num = parseFloat(count.replace(/,/g, ''));
      if (count.endsWith('K')) return num * 1000;
      if (count.endsWith('M')) return num * 1000000;
      return num;
    };

    const tweets: string[] = [];
    $('.tweet-content').each((_, elem) => {
      const tweet = $(elem).text().trim();
      if (tweet && !tweet.startsWith('RT @')) tweets.push(tweet);
    });

    if (!name) {
      return {
        success: false,
        error: 'Profile not found, is private, or has been suspended'
      };
    }

    if (tweets.length === 0) {
      return {
        success: false,
        error: 'No tweets found. The profile might be private or temporarily unavailable.'
      };
    }

    const profile: TwitterProfile = {
      username: cleanUsername,
      name,
      bio,
      tweets: tweets.slice(0, 5),
      followers: convertCount(followersText),
      following: convertCount(followingText)
    };

    return {
      success: true,
      profile
    };
  } catch (error) {
    const errorMessage = error instanceof Error 
      ? error.message 
      : 'Failed to fetch Twitter profile. Please try again later.';
    return {
      success: false,
      error: errorMessage
    };
  }
}