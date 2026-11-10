async function testAMFI() {
  const url = 'https://portal.amfiindia.com/DownloadNAVHistoryReport_Po.aspx?frmdt=01-Jan-2024&todt=10-Jan-2024';
  console.log('Testing AMFI endpoint:', url);
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      signal: AbortSignal.timeout(10000)
    });
    console.log('STATUS:', res.status);
    const text = await res.text();
    console.log('LENGTH:', text.length);
    console.log('SAMPLE:\n', text.substring(0, 500));
  } catch (err) {
    console.error('ERROR:', err.message);
  }
}
testAMFI();
