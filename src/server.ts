import express from 'express';
import cors from 'cors';
import { scrapeTwitterProfile } from './utils/scraper.js';

const app = express();
const port = process.env.PORT || 3000;

app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? ['https://marvelous-bubblegum-9aec88.netlify.app']
    : ['http://localhost:5173'],
  methods: ['POST'],
  credentials: true
}));

app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.post('/api/scrape', async (req, res) => {
  try {
    const { username } = req.body;
    if (!username) {
      return res.status(400).json({ 
        success: false, 
        error: 'Username is required' 
      });
    }

    const result = await scrapeTwitterProfile(username);
    res.json(result);
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to scrape profile',
      details: process.env.NODE_ENV === 'development' ? error : undefined
    });
  }
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});