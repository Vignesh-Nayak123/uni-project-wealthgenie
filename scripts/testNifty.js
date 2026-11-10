import fs from 'fs';

async function testNifty() {
  const url = 'https://www.niftyindices.com/Backpage.aspx/getTotalReturnIndexString';
  const payload = {
    cinfo: "{'name':'NIFTY 50','startDate':'01-Jan-2024','endDate':'20-Oct-2024','indexName':'NIFTY 50'}"
  };
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Requested-With': 'XMLHttpRequest',
        'Referer': 'https://www.niftyindices.com/reports/historical-data',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000)
    });
    console.log('STATUS:', res.status);
    const text = await res.text();
    fs.writeFileSync('scripts/nifty_response.html', text);
    console.log('Saved to scripts/nifty_response.html');
  } catch (err) {
    console.error('ERROR:', err.message);
  }
}
testNifty();
