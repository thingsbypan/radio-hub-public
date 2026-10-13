// Local coverage supplements the internet relay directory; null URLs are intentional.
(function (root) {
  const stations = [
    { id: 'WXK53-local', call: 'WXK53', state: 'Georgia', city: 'Pelham', frequency: '162.550', powerWatts: 500, coverage: 'Dougherty County / Albany', localRole: 'Regional coverage station', url: null, provider: null, forecastLat: 31.5785, forecastLon: -84.1557, forecastLocation: 'Albany, Georgia', streamStatus: 'unavailable', streamChecked: '2026-10-04', metadataSource: 'https://www.weather.gov/tae/nwr' },
    { id: 'KWN50-local', call: 'KWN50', state: 'Georgia', city: 'Ashburn', frequency: '162.450', powerWatts: 300, coverage: 'Dougherty County / Albany', localRole: 'Regional coverage station', url: null, provider: null, forecastLat: 31.5785, forecastLon: -84.1557, forecastLocation: 'Albany, Georgia', streamStatus: 'unavailable', streamChecked: '2026-10-04', metadataSource: 'https://www.weather.gov/tae/nwr' },
  ];
  function merge(directory) {
    // Keep provider entries (including any future legitimate local streams).
    const local = stations.map(s => {
      const feed = directory.find(p => p.call === s.call && p.state === s.state && p.url);
      return feed ? { ...s, ...feed, coverage: s.coverage, localRole: s.localRole, powerWatts: s.powerWatts } : { ...s };
    });
    return [...local, ...directory.filter(s => !local.some(l => l.id === s.id))];
  }
  function startup(read, save) {
    return { state: read('noaaState') || 'Alabama', call: read('noaaCall') || '' };
  }
  const api = { stations, merge, startup };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.NoaaLocal = api;
})(globalThis);
