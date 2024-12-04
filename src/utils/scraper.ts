import axios from 'axios';
import * as cheerio from 'cheerio';
import type { ScrapeResult, TwitterProfile } from '../types.js';
import { setTimeout } from 'timers/promises';

async function fetchWithRetry(url: string, maxRetries = 3) {
  const controller = new AbortController();
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await axios.get(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36',
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

export async function scrapeTwitterProfile(username: string): Promise<ScrapeResult> {
  try {
    const cleanUsername = username.replace(/^@/, '').trim();
    if (!cleanUsername) {
      return {
        success: false,
        error: 'Please enter a valid username'
      };
    }

    const response = await fetchWithRetry(`https://nitter.net/${cleanUsername}`);
    const html = response.data;
    const $ = cheerio.load(html);

    const name = $('.profile-card-fullname, .fullname').first().text().trim();
    const bio = $('.profile-bio, .bio').first().text().trim();
    const followersText = $('.profile-stat-num, .followers .profile-stat-num').first().text().trim() || '0';
    const followingText = $('.profile-stat-num, .following .profile-stat-num').first().text().trim() || '0';
    
    const convertCount = (count: string): number => {
      if (!count || count === '0') return 0;
      const num = parseFloat(count.replace(/,/g, ''));
      if (count.endsWith('K')) return num * 1000;
      if (count.endsWith('M')) return num * 1000000;
      return num;
    };

    const tweets: string[] = [];
    $('.tweet-content, .timeline-item .tweet-content').each((_, elem) => {
      const tweet = $(elem).text().trim();
      if (tweet && !tweet.startsWith('RT @')) tweets.push(tweet);
    });

    if (!name) {
      return {
        success: false,
        error: 'Profile not found or is private'
      };
    }

    if (tweets.length === 0) {
      return {
        success: false,
        error: 'No public tweets found for this profile'
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