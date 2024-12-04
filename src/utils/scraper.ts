import axios from 'axios';
import * as cheerio from 'cheerio';
import type { ScrapeResult, TwitterProfile } from '../types.js';
import { setTimeout } from 'timers/promises'; 

const NITTER_INSTANCES = [
  'https://nitter.net',
  'https://nitter.1d4.us',
  'https://nitter.kavin.rocks',
  'https://nitter.it'
];

async function fetchWithRetry(url: string, maxRetries = 3) {
  const controller = new AbortController();
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await axios.get(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) ' +
                       'Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        timeout: 10000
      });
      return response;
    } catch (error) {
      if (attempt === maxRetries - 1) throw error;
      await setTimeout(1000 * Math.pow(2, attempt)); // Exponential backoff
    }
  }
  throw new Error('Failed to fetch after max retries');
}

async function tryNitterInstances(username: string): Promise<string> {
  const errors: string[] = [];
  
  for (const instance of NITTER_INSTANCES) {
    try {
      const response = await fetchWithRetry(`${instance}/${username}`);
      return response.data;
    } catch (error) {
      errors.push(`${instance}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      continue;
    }
  }
  throw new Error(`All Nitter instances failed. Details: ${errors.join(' | ')}`);
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

    const name = $('.profile-card-fullname, .fullname').first().text().trim();
    const bio = $('.profile-bio, .bio').first().text().trim();
    const followersText = $('.profile-stat-num, .followers .profile-stat-num').first().text().trim() || '0';
    const followingText = $('.profile-stat-num, .following .profile-stat-num').first().text().trim() || '0';
    
    const convertCount = (count: string): number => {
      if (!count || count === '0' || count === '-') return 0;
      const num = parseFloat(count.replace(/,/g, ''));
      if (count.endsWith('K')) return num * 1000;
      if (count.endsWith('M')) return num * 1000000;
      return num;
    };

    const tweets: string[] = [];
    $('.timeline-item .tweet-content, .tweet-content').each((_, elem) => {
      const tweet = $(elem).text().trim();
      if (tweet && !tweet.startsWith('RT @')) tweets.push(tweet);
    });

    if (!name) {
      return {
        success: false,
        error: 'Twitter profile not found or is private'
      };
    }

    if (tweets.length === 0) {
      return {
        success: false,
        error: 'No public tweets found. The profile might be private or temporarily unavailable.'
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