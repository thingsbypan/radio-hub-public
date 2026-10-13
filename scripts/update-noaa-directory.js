const fs = require('node:fs');
const path = require('node:path');
const cheerio = require('cheerio');
const acorn = require('acorn');

async function get(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(`${url}: ${response.status}`);
  return response.text();
}
// Read only literal data from the provider's JavaScript, never execute it.
function literal(node) {
  if (node.type === 'Literal') return node.value;
  if (node.type === 'ArrayExpression') return node.elements.map(literal);
  if (node.type === 'ObjectExpression') return Object.fromEntries(node.properties.map(p => [p.key.value || p.key.name, literal(p.value)]));
  throw new Error(`Unexpected directory data: ${node.type}`);
}
(async () => {
  const html = await get('https://noaaweatherradio.org/');
  const source = await get('https://noaaweatherradio.org/java/NWR-player-radios.js');
  const ast = acorn.parse(source, { ecmaVersion: 'latest' });
  const declaration = ast.body.flatMap(n => n.declarations || []).find(n => n.id.name === 'markers');
  const markers = literal(declaration.init);
  const $ = cheerio.load(html), stations = [];
  $('#playlist1 li[data-path]').each((_i, element) => {
    const item = $(element), url = item.attr('data-path');
    const state = item.find('.pwsited').text().trim();
    const text = item.find('p').clone(); text.find('span,small').remove();
    const match = text.text().trim().match(/^(.+?)\s+(162\.\d{3})/);
    if (!state || !match || !/^https?:/.test(url) || /\.mp3(?:$|\?)/i.test(url)) return;
    const city = match[1].trim(), frequency = match[2];
    const marker = markers.find(m => m.description.includes(`on ${frequency}MHz from ${city},`));
    const call = marker?.description.match(/(?:&starf;|&star;)([A-Z0-9]+)/)?.[1];
    if (!call || !marker) return;
    stations.push({ id: `${call}-${stations.length}`, call, state, city, frequency, url,
      lat: Number(marker.lat), lon: Number(marker.lng), provider: cheerio.load(marker.title).text() });
  });
  if (stations.length < 50) throw new Error('Directory unexpectedly small; refusing to replace snapshot');
  const data = { source: 'https://noaaweatherradio.org/', updated: new Date().toISOString(), stations };
  fs.writeFileSync(path.join(__dirname, '..', 'noaa-stations.json'), JSON.stringify(data, null, 2) + '\n');
  console.log(`${stations.length} feeds / ${new Set(stations.map(s => s.state)).size} regions`);
})();
