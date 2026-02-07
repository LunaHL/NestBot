const https = require('https');
require('dotenv').config();

const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
  console.error('❌ Error: GEMINI_API_KEY is missing in .env');
  process.exit(1);
}

const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;

console.log('🔄 Fetching available Gemini models...');

https.get(url, (res) => {
  let data = '';

  res.on('data', (chunk) => {
    data += chunk;
  });

  res.on('end', () => {
    if (res.statusCode !== 200) {
      console.error(`❌ API Error: ${res.statusCode} ${res.statusMessage}`);
      try { console.error(JSON.parse(data)); } catch { console.error(data); }
      return;
    }

    try {
      const json = JSON.parse(data);
      if (!json.models) {
        console.log('⚠️ No models found.');
        return;
      }

      console.log(`\n✅ Found ${json.models.length} models:\n`);
      
      json.models.forEach(model => {
        const isChat = model.supportedGenerationMethods.includes('generateContent');
        const icon = isChat ? '💬' : '🔧';
        console.log(`${icon} ${model.name}`);
        console.log(`   Methods: ${model.supportedGenerationMethods.join(', ')}`);
      });

    } catch (e) {
      console.error('❌ Failed to parse response:', e);
    }
  });
}).on('error', (err) => {
  console.error('❌ Request failed:', err.message);
});