// AI trip planner. Grounds the LLM with real OpenStreetMap places, and falls back to a
// deterministic "smart planner" when no model is reachable, so the feature always works for free.
import { geocode, nearbyAll } from './osm.js';
import { getAttractions } from './attractions.js';
import { chatJSON, llmProvider } from './llm.js';
import { bearing, haversine } from '../utils/http.js';

const PACE_SLOTS = {
  relaxed: ['10:00', '15:00'],
  moderate: ['09:30', '11:30', '15:00'],
  packed: ['08:30', '10:30', '14:30', '16:30'],
};

// Interest → attraction categories (Wikipedia categories from attractions.js, plus OSM ones for fallback areas).
const INTEREST_CATEGORIES = {
  history: ['historic site', 'palace / castle', 'monument', 'museum', 'castle', 'palace', 'memorial', 'ruins', 'archaeological_site', 'fort', 'city_gate'],
  art: ['museum', 'gallery', 'theatre', 'artwork'],
  nature: ['park', 'nature', 'garden', 'nature_reserve', 'viewpoint'],
  family: ['family', 'park', 'zoo', 'aquarium', 'theme_park'],
  culture: ['church', 'mosque', 'temple', 'synagogue', 'museum', 'theatre', 'market', 'place of worship', 'attraction'],
  photography: ['tower', 'bridge', 'square', 'fountain', 'viewpoint', 'landmark', 'nature'],
  shopping: ['market', 'square'],
};

function addDays(iso, n) {
  if (!iso) return null;
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function clampInput(body) {
  const days = Math.min(14, Math.max(1, parseInt(body.days, 10) || 3));
  const pace = PACE_SLOTS[body.pace] ? body.pace : 'moderate';
  const interests = Array.isArray(body.interests) ? body.interests.map(String).slice(0, 10) : [];
  return {
    destination: String(body.destination || '').slice(0, 120).trim(),
    days,
    pace,
    interests,
    startDate: body.startDate || null,
    travelers: String(body.travelers || 'couple').slice(0, 40),
    budget: String(body.budget || 'moderate').slice(0, 40),
    notes: String(body.notes || '').slice(0, 1200),
  };
}

async function groundingData(destination) {
  const [place] = await geocode(destination, 1);
  if (!place) return { place: null, attractions: [], food: [] };
  // Same sources and caches as the city page: Wikipedia attractions + OSM restaurants, in parallel.
  const [attr, near] = await Promise.all([
    getAttractions(place.lat, place.lon, place.isArea ? 10000 : 5000).catch(() => null),
    nearbyAll(place.lat, place.lon, 3000).catch(() => null),
  ]);
  return { place, attractions: attr?.items || [], food: near?.food || [] };
}

// ---------- deterministic fallback ----------

export function smartPlan(input, { place, attractions, food }) {
  const name = place?.name || input.destination;
  const wanted = new Set(input.interests.flatMap((i) => INTEREST_CATEGORIES[i.toLowerCase()] || []));
  const pool = [...attractions]
    .map((a) => ({ ...a, score: Math.log10((a.views || 0) + 10) + (wanted.has(a.category) ? 1.5 : 0) - a.distance / 5000 }))
    .sort((x, y) => y.score - x.score);

  const slots = PACE_SLOTS[input.pace];
  const chosen = pool.slice(0, input.days * slots.length);

  // Split the city into wedges by bearing so each day stays in one neighbourhood.
  if (place) for (const c of chosen) c.angle = bearing(place.lat, place.lon, c.lat, c.lon);
  chosen.sort((x, y) => (x.angle ?? 0) - (y.angle ?? 0));

  const usedFood = new Set();
  const pickFood = (lat, lon, kinds) => {
    const options = food
      .filter((f) => !usedFood.has(f.id) && kinds.includes(f.kind))
      .map((f) => ({ f, d: haversine(lat, lon, f.lat, f.lon) }))
      .sort((x, y) => x.d - y.d);
    const pick = options[0]?.f;
    if (pick) usedFood.add(pick.id);
    return pick;
  };

  const days = [];
  for (let d = 0; d < input.days; d++) {
    const stops = chosen.slice(d * slots.length, (d + 1) * slots.length);
    const items = [];
    const center = stops[0] || place || { lat: 0, lon: 0 };

    stops.forEach((s, i) => {
      items.push({
        time: slots[i],
        title: s.name,
        description: `Explore this ${s.category.replace(/_/g, ' ')}${s.distance ? `, about ${(s.distance / 1000).toFixed(1)} km from the centre` : ''}. ${s.openingHours ? `Hours: ${s.openingHours}.` : 'Check opening hours before you go.'}`,
        type: 'sight',
        lat: s.lat,
        lon: s.lon,
      });
      // Lunch near the last morning stop (items are time-sorted afterwards).
      if (i === Math.max(0, slots.filter((t) => t < '13:00').length - 1)) {
        const lunch = pickFood(s.lat, s.lon, ['restaurant', 'cafe', 'food_court', 'fast_food']);
        items.push({
          time: '13:00',
          title: lunch ? `Lunch at ${lunch.name}` : 'Lunch break',
          description: lunch
            ? `${lunch.cuisines.length ? lunch.cuisines.join(', ') + ' · ' : ''}close to your morning stops.`
            : 'Try a local spot near your morning stops.',
          type: 'food',
          lat: lunch?.lat,
          lon: lunch?.lon,
        });
      }
    });

    const dinner = pickFood(center.lat, center.lon, ['restaurant', 'pub', 'bar']);
    items.push({
      time: '19:30',
      title: dinner ? `Dinner at ${dinner.name}` : 'Dinner',
      description: dinner
        ? `${dinner.cuisines.length ? dinner.cuisines.join(', ') + ' · ' : ''}${input.interests.includes('nightlife') ? 'then explore the nightlife nearby.' : 'a relaxed end to the day.'}`
        : 'Ask locals for their favourite neighbourhood restaurant.',
      type: 'food',
      lat: dinner?.lat,
      lon: dinner?.lon,
    });

    items.sort((a, b) => a.time.localeCompare(b.time));
    days.push({
      day: d + 1,
      date: addDays(input.startDate, d),
      theme: stops.length ? `Around ${stops[0].name}` : d === 0 ? `Arrive & settle into ${name}` : `Free day in ${name}`,
      items: items.length ? items : [{ time: '10:00', title: `Wander ${name}`, description: 'Explore at your own pace.', type: 'activity' }],
    });
  }

  return {
    title: `${input.days} day${input.days > 1 ? 's' : ''} in ${name}`,
    summary: `A ${input.pace} itinerary for ${input.travelers} with a ${input.budget} budget, grouped by neighbourhood to keep travel time short. Built from real places on OpenStreetMap.`,
    destination: name,
    days,
    tips: [
      'Book popular museums and landmarks online in advance to skip queues.',
      'Group sights by neighbourhood and use public transport between areas.',
      'Keep a little local cash for small vendors and public washrooms.',
      'Opening hours change seasonally – double-check the day before.',
    ],
  };
}

// ---------- LLM path ----------

const SYSTEM = `You are Wanderly, an expert travel planner. Create realistic, geographically sensible itineraries.
Return ONLY valid JSON with this exact shape:
{"title": string, "summary": string, "days": [{"day": number, "theme": string, "items": [{"time": "HH:MM", "title": string, "description": string, "type": "sight"|"food"|"activity"|"transport"|"rest"}]}], "tips": [string], "budgetNote": string}
Rules: one entry in "days" per requested day; 4-7 items per day including meals; times in 24h order; descriptions 1-2 sentences with practical detail; prefer the provided real places; never invent prices as facts – give rough ranges.`;

function normalisePlan(raw, input, place) {
  const days = Array.isArray(raw.days) ? raw.days : [];
  if (!days.length) throw new Error('Empty plan');
  return {
    title: String(raw.title || `${input.days} days in ${place?.name || input.destination}`),
    summary: String(raw.summary || ''),
    destination: place?.name || input.destination,
    budgetNote: raw.budgetNote ? String(raw.budgetNote) : null,
    days: days.slice(0, input.days).map((d, i) => ({
      day: i + 1,
      date: addDays(input.startDate, i),
      theme: String(d.theme || `Day ${i + 1}`),
      items: (Array.isArray(d.items) ? d.items : [])
        .map((it) => ({
          time: String(it.time || '').slice(0, 5),
          title: String(it.title || '').slice(0, 140),
          description: String(it.description || '').slice(0, 500),
          type: ['sight', 'food', 'activity', 'transport', 'rest'].includes(it.type) ? it.type : 'activity',
        }))
        .filter((it) => it.title),
    })),
    tips: (Array.isArray(raw.tips) ? raw.tips : []).map(String).slice(0, 8),
  };
}

export async function planTrip(body) {
  const input = clampInput(body);
  if (!input.destination) throw Object.assign(new Error('Please enter a destination.'), { status: 400 });

  const ground = await groundingData(input.destination).catch(() => ({ place: null, attractions: [], food: [] }));

  if (llmProvider() !== 'none') {
    const placeList = ground.attractions.slice(0, 30).map((a) => `- ${a.name} (${a.category})`).join('\n');
    const foodList = ground.food.slice(0, 15).map((f) => `- ${f.name}${f.cuisines.length ? ` (${f.cuisines.join(', ')})` : ''}`).join('\n');
    const user = `Destination: ${ground.place?.displayName || input.destination}
Days: ${input.days}${input.startDate ? ` starting ${input.startDate}` : ''}
Travellers: ${input.travelers}
Budget: ${input.budget}
Pace: ${input.pace}
Interests: ${input.interests.join(', ') || 'a bit of everything'}
Extra wishes: ${input.notes || 'none'}

Real attractions near the destination (from OpenStreetMap):
${placeList || '(none found – use your knowledge)'}

Real places to eat nearby:
${foodList || '(none found)'}`;
    try {
      const { json, model } = await chatJSON(SYSTEM, user);
      return { source: 'ai', model, input, plan: normalisePlan(json, input, ground.place) };
    } catch (e) {
      console.warn('[planner] LLM unavailable, using smart planner:', e.message);
    }
  }
  return { source: 'smart', model: null, input, plan: smartPlan(input, ground) };
}
