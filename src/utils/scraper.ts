import axios from 'axios';
import * as cheerio from 'cheerio';
import type { ScrapeResult, TwitterProfile } from '../types.js';
import { setTimeout } from 'timers/promises';

const NITTER_INSTANCES = [
  'https://nitter.catsarch.com',
  'https://nitter.in.projectsegfau.lt',
  'https://nitter.poast.org',
  'https://nitter.woodland.cafe'
];

async function fetchWithRetry(url: string, maxRetries = 3) {
  const controller = new AbortController();
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await axios.get(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; TwitterBot/1.0)',
          'Accept': 'text/html',
          'Accept-Language': 'en-US,en;q=0.9',
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        },
        timeout: 10000
      });
      
      // Verify we got valid HTML with expected elements
      if (!response.data.includes('profile-card') && !response.data.includes('timeline-item')) {
        throw new Error('Invalid response format');
      }
      
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
      console.error(`Failed to fetch from ${instance}:`, error);
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
    
    // Use multiple selectors to handle different Nitter instance variations
    const name = $('.profile-card-fullname, .fullname, .profile-name').first().text().trim();
    const bio = $('.profile-bio, .bio, .profile-description').first().text().trim();
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
    $('.timeline-item .tweet-content, .tweet-content, .tweet-text').each((_, elem) => {
      const tweet = $(elem).text().trim();
      if (tweet && !tweet.startsWith('RT @')) tweets.push(tweet);
    });

    if (!name) {
      return {
        success: false,
        error: 'Could not find Twitter profile. Please check the username and try again.'
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