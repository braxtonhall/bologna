// ── State ──────────────────────────────────────────
let db, calendar;
let allEvents = [];
let allFilms = [];
let eventsBySlug = {};
let filmsByEventSlug = {};
let eventsByFilmTitle = {};
let uniqueFilms = [];
let days = [];
let venues = [];
let activeDetailTab = 'events';
let expandedEventSlug = null;
let expandedFilmKey = null;
let calendarHighlightSlug = null;
let filmHighlightSlugs = new Set();
let currentFilters = { venues: new Set(), type: '' };
let eventsSearch = '';
let filmsSearch = '';
let selectedVenues = new Set();
let calendarDayCount = 8;
const ZOOM_LEVELS = [1, 3, 5, 7, 8, 10, 14, 17];
let eventPriorities = {};
let activeCalendarTab = 'all';
let filmPriorities = {};
let pendingImportData = null;
let suggestedEvents = new Set();
let focusedEvents = new Set();
let builderSeed = Date.now();
let scheduleStart = '2026-06-21T00:00:00';
let scheduleEnd = '2026-06-29T00:00:00';
let shadeEvents = [];

try {
  const saved = localStorage.getItem('pinned-events');
  if (saved) {
    const parsed = JSON.parse(saved);
    if (Array.isArray(parsed)) {
      for (const slug of parsed) eventPriorities[slug] = 'pin';
    } else if (parsed && typeof parsed === 'object') {
      eventPriorities = parsed;
    }
  }
} catch (e) { /* ignore */ }

try {
  const saved = localStorage.getItem('film-priorities');
  if (saved) filmPriorities = JSON.parse(saved);
} catch (e) { /* ignore */ }

let calendarInitialDate = '2026-06-21';

try {
  const saved = localStorage.getItem('calendar-day-count');
  if (saved) {
    const val = parseInt(saved, 10);
    if (ZOOM_LEVELS.includes(val)) calendarDayCount = val;
  }
} catch (e) { /* ignore */ }

try {
  const saved = localStorage.getItem('calendar-date');
  if (saved && /^\d{4}-\d{2}-\d{2}$/.test(saved)) calendarInitialDate = saved;
} catch (e) { /* ignore */ }

try {
  const saved = localStorage.getItem('schedule-start');
  if (saved) scheduleStart = saved;
} catch (e) { /* ignore */ }

try {
  const saved = localStorage.getItem('schedule-end');
  if (saved) scheduleEnd = saved;
} catch (e) { /* ignore */ }

function saveEventPriorities() {
  try {
    localStorage.setItem('pinned-events', JSON.stringify(eventPriorities));
  } catch (e) { /* ignore */ }
}

function saveFilmPriorities() {
  try {
    localStorage.setItem('film-priorities', JSON.stringify(filmPriorities));
  } catch (e) { /* ignore */ }
}

function saveCalendarDayCount() {
  try {
    localStorage.setItem('calendar-day-count', calendarDayCount);
  } catch (e) { /* ignore */ }
}

function saveCalendarDate() {
  try {
    if (calendar) {
      const d = calendar.getDate();
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      localStorage.setItem('calendar-date', `${y}-${m}-${day}`);
    }
  } catch (e) { /* ignore */ }
}

function saveScheduleBounds() {
  try {
    if (scheduleStart) {
      localStorage.setItem('schedule-start', scheduleStart);
    } else {
      localStorage.removeItem('schedule-start');
    }
    if (scheduleEnd) {
      localStorage.setItem('schedule-end', scheduleEnd);
    } else {
      localStorage.removeItem('schedule-end');
    }
  } catch (e) { /* ignore */ }
}

function exportSchedule() {
  const data = {
    pinnedEvents: eventPriorities,
    filmPriorities: filmPriorities
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'bologna.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function importSchedule(file) {
  const reader = new FileReader();
  reader.onload = function () {
    try {
      const data = JSON.parse(reader.result);
      if (!data.pinnedEvents || !data.filmPriorities || typeof data.filmPriorities !== 'object') return;

      const convertedEvents = normalizeImportedEvents(data.pinnedEvents);
      if (!convertedEvents) return;

      if (isScheduleEmpty()) {
        eventPriorities = convertedEvents;
        filmPriorities = data.filmPriorities;
        saveEventPriorities();
        saveFilmPriorities();
        applyFilters();
      } else {
        pendingImportData = { eventPriorities: convertedEvents, filmPriorities: data.filmPriorities };
        showImportModal();
      }
    } catch (e) { /* ignore */ }
  };
  reader.readAsText(file);
}

function normalizeImportedEvents(pinnedEvents) {
  if (Array.isArray(pinnedEvents)) {
    const obj = {};
    for (const slug of pinnedEvents) obj[slug] = 'pin';
    return obj;
  }
  if (typeof pinnedEvents === 'object') return pinnedEvents;
  return null;
}

function isScheduleEmpty() {
  return Object.keys(eventPriorities).length === 0 && Object.keys(filmPriorities).length === 0;
}

function mergePriorities(existing, incoming) {
  const weights = { low: 1, med: 2, high: 3, pin: 4 };
  const result = { ...existing };
  for (const [key, value] of Object.entries(incoming)) {
    const incomingWeight = weights[value] || 0;
    const existingWeight = weights[result[key]] || 0;
    if (incomingWeight > existingWeight) {
      result[key] = value;
    } else if (!(key in result)) {
      result[key] = value;
    }
  }
  return result;
}

function showImportModal() {
  document.getElementById('import-modal').classList.add('open');
}

function hideImportModal() {
  document.getElementById('import-modal').classList.remove('open');
  pendingImportData = null;
}

function handleImportMerge() {
  if (!pendingImportData) return;
  eventPriorities = mergePriorities(eventPriorities, pendingImportData.eventPriorities);
  filmPriorities = mergePriorities(filmPriorities, pendingImportData.filmPriorities);
  saveEventPriorities();
  saveFilmPriorities();
  applyFilters();
  hideImportModal();
}

function handleImportOverwrite() {
  if (!pendingImportData) return;
  eventPriorities = pendingImportData.eventPriorities;
  filmPriorities = pendingImportData.filmPriorities;
  saveEventPriorities();
  saveFilmPriorities();
  applyFilters();
  hideImportModal();
}

function handleImportCancel() {
  hideImportModal();
}

// ── Init ──────────────────────────────────────────
async function init() {
  const SQL = await initSqlJs({
    locateFile: file => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.3/${file}`
  });

  const resp = await fetch('festival.db');
  const buf = await resp.arrayBuffer();
  db = new SQL.Database(new Uint8Array(buf));

  loadData();
  initCalendar();
  renderEventsList();
  renderFilmsList();
  setupFilterListeners();
  setupTabListeners();
  setupMenuListeners();

  document.getElementById('loading').style.display = 'none';
  document.getElementById('app').style.display = '';

  calendar.render();
}

// ── Data loading ──────────────────────────────────
function loadData() {
  // Load events
  const stmt = db.prepare('SELECT * FROM events ORDER BY schedule_datetime ASC');
  while (stmt.step()) {
    const row = stmt.getAsObject();
    row.is_free = !!row.is_free;
    allEvents.push(row);
    eventsBySlug[row.slug] = row;
  }
  stmt.free();

  // Load films joined with event info
  const fstmt = db.prepare(`
    SELECT f.*, e.slug as event_slug, e.title as event_title,
      e.schedule_datetime, e.schedule_day, e.schedule_time,
      e.schedule_datetime as event_datetime,
      e.venue, e.type as event_type
    FROM films f JOIN events e ON e.slug = f.event_slug
    ORDER BY f.title COLLATE NOCASE, e.schedule_datetime ASC
  `);
  while (fstmt.step()) {
    const row = fstmt.getAsObject();
    allFilms.push(row);

    if (!filmsByEventSlug[row.event_slug]) filmsByEventSlug[row.event_slug] = [];
    filmsByEventSlug[row.event_slug].push(row);

    if (!eventsByFilmTitle[row.title]) eventsByFilmTitle[row.title] = [];
    eventsByFilmTitle[row.title].push(row);
  }
  fstmt.free();

  // Build unique films list (grouped by title)
  const filmMap = {};
  for (const f of allFilms) {
    if (!filmMap[f.title]) {
      filmMap[f.title] = {
        title: f.title,
        director: f.director || null,
        year: f.year || null,
        country: f.country || null,
        running_time_minutes: f.running_time_minutes || null,
        count: 0
      };
    }
    filmMap[f.title].count++;
  }
  uniqueFilms = Object.values(filmMap).sort((a, b) => a.title.localeCompare(b.title));

  // Extract metadata
  days = [...new Set(allEvents.map(e => e.schedule_day).filter(Boolean))];
  venues = [...new Set(allEvents.filter(e => e.venue).map(e => e.venue))].sort();

  selectedVenues = new Set(venues);
  populateVenueCheckboxes();
}

function populateVenueCheckboxes() {
  const list = document.getElementById('venue-list');
  list.innerHTML = '';
  for (const v of venues) {
    const label = document.createElement('label');
    label.className = 'multi-item';
    label.innerHTML = `<input type="checkbox" value="${escHtml(v)}" checked><span>${escHtml(v)}</span>`;
    list.appendChild(label);
  }
  updateVenueTrigger();
}

// ── Helpers ───────────────────────────────────────
function getEventDuration(event) {
  const fs = filmsByEventSlug[event.slug] || [];
  if (fs.length === 0) return 60;
  const total = fs.reduce((s, f) => s + (f.running_time_minutes || 0), 0);
  return total + 20;
}

function addMinutesToISO(isoStr, minutes) {
  const clean = isoStr.replace(/[+-]\d{2}:\d{2}$/, '');
  const [datePart, timePart] = clean.split('T');
  const [year, month, day] = datePart.split('-').map(Number);
  const [hour, min, sec] = timePart.split(':').map(Number);

  const d = new Date(year, month - 1, day, hour, min, sec || 0);
  d.setMinutes(d.getMinutes() + minutes);

  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const da = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  const s = String(d.getSeconds()).padStart(2, '0');

  return `${y}-${mo}-${da}T${h}:${mi}:${s}`;
}

function stripOffset(isoStr) {
  if (!isoStr) return null;
  return isoStr.replace(/[+-]\d{2}:\d{2}$/, '');
}

function formatDuration(minutes) {
  if (!minutes) return '';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h${m}m`;
}

function filmKey(title) {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/, '');
}

function escHtml(s) {
  if (!s) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    var t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function eventsConflict(slugA, slugB) {
  if (slugA === slugB) return false;
  const evA = eventsBySlug[slugA];
  const evB = eventsBySlug[slugB];
  if (!evA || !evB) return false;
  const rangeA = getEventTimeRange(evA);
  const rangeB = getEventTimeRange(evB);
  const overlapStart = new Date(Math.max(rangeA.start.getTime(), rangeB.start.getTime()));
  const overlapEnd = new Date(Math.min(rangeA.end.getTime(), rangeB.end.getTime()));
  if (overlapStart >= overlapEnd) return false;
  const overlapMinutes = (overlapEnd - overlapStart) / 60000;
  if (evA.venue === evB.venue) return false;
  return overlapMinutes > 10;
}

function isFilmSatisfied(title) {
  const evs = eventsByFilmTitle[title] || [];
  return evs.some(e => eventPriorities[e.event_slug] === 'pin' || suggestedEvents.has(e.event_slug));
}

function isBuilderUnsatisfied(eventSlug) {
  const fs = filmsByEventSlug[eventSlug] || [];
  for (const f of fs) {
    const key = filmKey(f.title);
    if (filmPriorities[key] && !isFilmSatisfied(f.title)) return true;
  }
  return false;
}

function buildSchedule() {
  suggestedEvents = new Set();

  const unsatisfiedFilms = [];
  for (const film of uniqueFilms) {
    const key = filmKey(film.title);
    const priority = filmPriorities[key];
    if (!priority) continue;
    const evs = eventsByFilmTitle[film.title] || [];
    const hasPinned = evs.some(e => eventPriorities[e.event_slug] === 'pin');
    if (hasPinned) continue;
    unsatisfiedFilms.push({ type: 'film', key, title: film.title, priority });
  }

  for (const [slug, pri] of Object.entries(eventPriorities)) {
    if (pri === 'pin') continue;
    const ev = eventsBySlug[slug];
    if (!ev || !ev.schedule_datetime) continue;
    unsatisfiedFilms.push({ type: 'event', key: slug, title: ev.title, priority: pri, slug });
  }

  const PRIORITY_WEIGHT = { high: 3, med: 2, low: 1 };
  const rng = mulberry32(builderSeed);

  unsatisfiedFilms.sort((a, b) => PRIORITY_WEIGHT[b.priority] - PRIORITY_WEIGHT[a.priority]);

  const grouped = [];
  let currentWeight = null;
  for (const item of unsatisfiedFilms) {
    const w = PRIORITY_WEIGHT[item.priority];
    if (w !== currentWeight) {
      currentWeight = w;
      grouped.push([]);
    }
    grouped[grouped.length - 1].push(item);
  }

  for (const group of grouped) {
    for (let i = group.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [group[i], group[j]] = [group[j], group[i]];
    }
  }

  unsatisfiedFilms.length = 0;
  for (const group of grouped) unsatisfiedFilms.push(...group);

  const pinnedSlugs = Object.entries(eventPriorities)
    .filter(([, pri]) => pri === 'pin')
    .map(([slug]) => slug);
  const conflictSlugs = new Set([...pinnedSlugs, ...suggestedEvents]);

  for (const item of unsatisfiedFilms) {
    if (item.type === 'event') {
      if (suggestedEvents.has(item.slug)) continue;
      const realEv = eventsBySlug[item.slug];
      if (currentFilters.venues.size > 0 && !currentFilters.venues.has(realEv.venue)) continue;
      const range = getEventTimeRange(realEv);
      if (scheduleStart && range.start < new Date(stripOffset(scheduleStart))) continue;
      if (scheduleEnd && range.end > new Date(stripOffset(scheduleEnd))) continue;
      let blocked = false;
      for (const conflictSlug of conflictSlugs) {
        if (eventsConflict(item.slug, conflictSlug)) { blocked = true; break; }
      }
      if (!blocked) {
        suggestedEvents.add(item.slug);
        conflictSlugs.add(item.slug);
      }
    } else {
      if (isFilmSatisfied(item.title)) continue;
      const evs = eventsByFilmTitle[item.title] || [];
      const candidates = evs.filter(e => {
        const realEv = eventsBySlug[e.event_slug];
        if (!realEv) return false;
        if (currentFilters.venues.size > 0 && !currentFilters.venues.has(realEv.venue)) return false;
        const range = getEventTimeRange(realEv);
        if (scheduleStart) {
          const startVal = new Date(stripOffset(scheduleStart));
          if (range.start < startVal) return false;
        }
        if (scheduleEnd) {
          const endVal = new Date(stripOffset(scheduleEnd));
          if (range.end > endVal) return false;
        }
        for (const conflictSlug of conflictSlugs) {
          if (eventsConflict(realEv.slug, conflictSlug)) return false;
        }
        return true;
      });
      if (candidates.length > 0) {
        const idx = Math.floor(rng() * candidates.length);
        suggestedEvents.add(candidates[idx].event_slug);
        conflictSlugs.add(candidates[idx].event_slug);
      }
    }
  }
}

function regenerateSchedule() {
  builderSeed = Math.floor(Math.random() * 2147483647);
  buildSchedule();
  applyFilters();
}

function readScheduleStart() {
  const d = document.getElementById('builder-start-date').value;
  const t = document.getElementById('builder-start-time').value;
  return d && t ? `${d}T${t}:00` : null;
}

function readScheduleEnd() {
  const d = document.getElementById('builder-end-date').value;
  const t = document.getElementById('builder-end-time').value;
  return d && t ? `${d}T${t}:00` : null;
}

function updateScheduleWindowShade() {
  for (const se of shadeEvents) se.remove();
  shadeEvents = [];
  if (activeCalendarTab !== 'builder' || !calendar) return;
  const view = calendar.view;
  if (!view) return;
  const viewStart = view.activeStart;
  const viewEnd = view.activeEnd;
  if (scheduleStart) {
    const ss = new Date(stripOffset(scheduleStart));
    if (ss > viewStart) {
      const shadeEnd = new Date(Math.min(ss.getTime(), viewEnd.getTime()));
      const ev = calendar.addEvent({ start: viewStart, end: shadeEnd, display: 'background', backgroundColor: 'rgba(0,0,0,0.08)', groupId: 'schedule-shade' });
      shadeEvents.push(ev);
    }
  }
  if (scheduleEnd) {
    const se = new Date(stripOffset(scheduleEnd));
    if (se < viewEnd) {
      const shadeStart = new Date(Math.max(se.getTime(), viewStart.getTime()));
      const ev = calendar.addEvent({ start: shadeStart, end: viewEnd, display: 'background', backgroundColor: 'rgba(0,0,0,0.08)', groupId: 'schedule-shade' });
      shadeEvents.push(ev);
    }
  }
}

function passesFilters(event) {
  if (currentFilters.venues.size > 0 && !currentFilters.venues.has(event.venue)) return false;
  if (currentFilters.type && event.type !== currentFilters.type) return false;
  if (eventsSearch) {
    const q = eventsSearch.toLowerCase();
    if (!event.title.toLowerCase().includes(q)) return false;
  }
  return event.schedule_datetime !== null;
}

function passesFiltersForFilms(event) {
  if (currentFilters.venues.size > 0 && !currentFilters.venues.has(event.venue)) return false;
  if (currentFilters.type && event.type !== currentFilters.type) return false;
  return event.schedule_datetime !== null;
}

function getEventTimeRange(ev) {
  const duration = getEventDuration(ev);
  const start = new Date(stripOffset(ev.schedule_datetime));
  const end = new Date(start.getTime() + duration * 60000);
  return { start, end, duration };
}

function isShadowed(eventSlug) {
  if (eventPriorities[eventSlug] === 'pin') return false;
  if (suggestedEvents.has(eventSlug)) return false;

  const shadowCasters = [
    ...Object.keys(eventPriorities).filter(s => eventPriorities[s] === 'pin'),
    ...suggestedEvents
  ];
  if (shadowCasters.length === 0) return false;

  const ev = eventsBySlug[eventSlug];
  if (!ev) return false;

  const { start: evStart, end: evEnd, duration: evDuration } = getEventTimeRange(ev);
  if (evDuration === 0) return false;

  const overlaps = [];
  for (const casterSlug of shadowCasters) {
    const casterEv = eventsBySlug[casterSlug];
    if (!casterEv) continue;
    const { start: pStart, end: pEnd } = getEventTimeRange(casterEv);

    const overlapStart = new Date(Math.max(evStart.getTime(), pStart.getTime()));
    const overlapEnd = new Date(Math.min(evEnd.getTime(), pEnd.getTime()));
    if (overlapStart < overlapEnd) {
      overlaps.push({ start: overlapStart, end: overlapEnd });
    }
  }

  if (overlaps.length === 0) return false;

  overlaps.sort((a, b) => a.start - b.start);
  const merged = [];
  for (const o of overlaps) {
    if (merged.length === 0 || o.start > merged[merged.length - 1].end) {
      merged.push({ start: o.start, end: o.end });
    } else {
      merged[merged.length - 1].end = new Date(Math.max(merged[merged.length - 1].end.getTime(), o.end.getTime()));
    }
  }

  const totalOverlap = merged.reduce((sum, o) => sum + (o.end - o.start) / 60000, 0);
  return totalOverlap > 0.5 * evDuration;
}

function getEventClassNames(slug) {
  const classes = [];
  if (slug === calendarHighlightSlug || filmHighlightSlugs.has(slug)) {
    classes.push('calendar-highlight');
  }
  if (activeCalendarTab !== 'builder' && isShadowed(slug)) classes.push('cal-event--shadowed');
  if (activeCalendarTab === 'builder' && !suggestedEvents.has(slug) && eventPriorities[slug] !== 'pin') {
    classes.push('cal-event--unsatisfied');
  }
  if (eventsBySlug[slug]?.celluloid) classes.push('cal-event--celluloid');
  return classes;
}

function isUnsatisfiedPriority(eventSlug) {
  const fs = filmsByEventSlug[eventSlug] || [];
  for (const f of fs) {
    const key = filmKey(f.title);
    if (filmPriorities[key]) {
      const evs = eventsByFilmTitle[f.title] || [];
      if (!evs.some(e => eventPriorities[e.event_slug] === 'pin')) return true;
    }
  }
  return false;
}

// ── Calendar ──────────────────────────────────────
function buildCalEvent(ev) {
  const duration = getEventDuration(ev);
  const fs = filmsByEventSlug[ev.slug] || [];
  const startStr = stripOffset(ev.schedule_datetime);
  const endStr = addMinutesToISO(ev.schedule_datetime, duration);

  const classNames = getEventClassNames(ev.slug);
  const hasFilms = fs.length > 0;
  const priority = eventPriorities[ev.slug];
  const isPinned = priority === 'pin';
  const isPrioritized = priority && !isPinned;
  const isSuggested = suggestedEvents.has(ev.slug);
  let bg, border, text;

  if (isSuggested && !isPinned) {
    bg = '#0FC3AE';
    border = '#0FC3AE';
    text = '#000000';
    classNames.push('cal-event--suggested');
  } else if (isPrioritized) {
    bg = '#3A9A00';
    border = '#3A9A00';
    text = '#FFFFFF';
  } else if (isBuilderUnsatisfied(ev.slug)) {
    bg = '#64EB00';
    border = '#50C400';
    text = '#000000';
  } else if (isPinned) {
    if (hasFilms) {
      bg = '#E80247';
      border = '#E80247';
      text = '#ffffff';
    } else {
      bg = '#C2003A';
      border = '#C2003A';
      text = '#ffffff';
    }
  } else if (hasFilms) {
    bg = '#EFEFEF';
    border = '#EFEFEF';
    text = '#000000';
  } else {
    bg = '#707070';
    border = '#707070';
    text = '#ffffff';
  }


  return {
    id: ev.slug,
    title: ev.title,
    start: startStr,
    end: endStr,
    backgroundColor: bg,
    borderColor: border,
    textColor: text,
    classNames: classNames,
    extendedProps: {
      venue: ev.venue,
      type: ev.type,
      schedule_time: ev.schedule_time,
      filmCount: fs.length,
      totalRuntime: duration,
      isFree: ev.is_free
    }
  };
}

function initCalendar() {
  const calEl = document.getElementById('calendar');

  const views = {};
  for (const n of ZOOM_LEVELS) {
    views[`timeGrid${n}Day`] = { type: 'timeGridWeek', duration: { days: n } };
  }

  const initialEvents = allEvents.filter(passesFilters).map(ev => buildCalEvent(ev));

  calendar = new FullCalendar.Calendar(calEl, {
    initialView: `timeGrid${calendarDayCount}Day`,
    initialDate: calendarInitialDate,
    views: views,
    events: initialEvents,
    headerToolbar: false,
    allDaySlot: false,
    slotMinTime: '09:00:00',
    slotMaxTime: '26:00:00',
    slotDuration: '00:30:00',
    nowIndicator: false,
    height: '100%',
    expandRows: true,
    eventClick: (info) => {
      info.jsEvent.preventDefault();
      const slug = info.event.id;
      navigateToEvent(slug, false);
    },
    eventDidMount: (info) => {
      const ev = info.event.extendedProps;
      const rt = ev.totalRuntime;
      const fc = ev.filmCount;
      const v = ev.venue || '';
      let parts = [ev.schedule_time];
      if (rt) parts.push(formatDuration(rt));
      if (fc) parts.push(`${fc} film${fc > 1 ? 's' : ''}`);
      if (v) parts.push(v);
      info.el.title = parts.join(' · ');
    },
    datesSet: () => {
      updateScheduleWindowShade();
      saveCalendarDate();
    }
  });


  document.getElementById('cal-zoom-label').textContent = `${calendarDayCount} day${calendarDayCount > 1 ? 's' : ''}`;

  document.getElementById('cal-prev').addEventListener('click', () => {
    calendar.incrementDate({ days: -1 });
    if (activeCalendarTab === 'all') { renderEventsList(); renderFilmsList(); }
  });
  document.getElementById('cal-next').addEventListener('click', () => {
    calendar.incrementDate({ days: 1 });
    if (activeCalendarTab === 'all') { renderEventsList(); renderFilmsList(); }
  });
  document.getElementById('cal-zoom-in').addEventListener('click', () => zoomDayCount(1));
  document.getElementById('cal-zoom-out').addEventListener('click', () => zoomDayCount(-1));
}

let calendarLoadingTimer = null;

function showCalendarLoading() {
  const el = document.getElementById('calendar-loading');
  if (!el) return;
  calendarLoadingTimer = setTimeout(() => {
    el.classList.add('visible');
  }, 120);
}

function hideCalendarLoading() {
  if (calendarLoadingTimer) {
    clearTimeout(calendarLoadingTimer);
    calendarLoadingTimer = null;
  }
  const el = document.getElementById('calendar-loading');
  if (el) el.classList.remove('visible');
}

function buildCalendarEvents() {
  if (!calendar) return;

  showCalendarLoading();

  const tabAtStart = activeCalendarTab;

  requestAnimationFrame(() => {
    calendar.getEventSources().forEach(s => s.remove());
    calendarHighlightSlug = null;

    let filtered = allEvents.filter(passesFilters);
    if (activeCalendarTab === 'personal') {
      filtered = filtered.filter(ev => focusedEvents.has(ev.slug) || eventPriorities[ev.slug] || isUnsatisfiedPriority(ev.slug));
    } else if (activeCalendarTab === 'builder') {
      filtered = filtered.filter(ev => focusedEvents.has(ev.slug) || eventPriorities[ev.slug] || suggestedEvents.has(ev.slug) || isBuilderUnsatisfied(ev.slug));
    }

    const calEvents = filtered.map(ev => buildCalEvent(ev));
    calendar.addEventSource(calEvents);

    if (tabAtStart === 'builder') updateScheduleWindowShade();

    hideCalendarLoading();
  });
}

function zoomDayCount(delta) {
  const idx = ZOOM_LEVELS.indexOf(calendarDayCount);
  const newIdx = Math.max(0, Math.min(ZOOM_LEVELS.length - 1, idx + delta));
  if (newIdx === idx) return;

  calendarDayCount = ZOOM_LEVELS[newIdx];
  calendar.changeView(`timeGrid${calendarDayCount}Day`);
  saveCalendarDayCount();
  document.getElementById('cal-zoom-label').textContent = `${calendarDayCount} day${calendarDayCount > 1 ? 's' : ''}`;

  if (activeCalendarTab === 'all') { renderEventsList(); renderFilmsList(); }
}

function getCalendarEndDate() {
  const end = new Date(calendar.getDate());
  end.setDate(end.getDate() + calendarDayCount);
  return end;
}

function isEventInCalendarView(ev) {
  const dt = new Date(stripOffset(ev.schedule_datetime));
  return dt >= calendar.getDate() && dt < getCalendarEndDate();
}

function isEventInCalendarRange(ev) {
  if (!ev) return false;
  const view = calendar.view;
  const s = ev.start;
  return s >= view.activeStart && s < view.activeEnd;
}

function highlightCalendarEvent(slug, scrollIfNeeded = true) {
  if (calendarHighlightSlug === slug) return;
  const prevSlug = calendarHighlightSlug;
  calendarHighlightSlug = slug;
  if (prevSlug) {
    const prev = calendar.getEventById(prevSlug);
    if (prev) prev.setProp('classNames', getEventClassNames(prevSlug));
  }
  if (!slug) return;

  const calEv = calendar.getEventById(slug);
  if (!calEv) return;

  calEv.setProp('classNames', getEventClassNames(slug));

  if (scrollIfNeeded && !isEventInCalendarRange(calEv)) {
    calendar.gotoDate(calEv.start);
  }
}

function applyFilmHighlights(slugs) {
  filmHighlightSlugs = new Set(slugs);
  for (const slug of slugs) {
    const calEv = calendar.getEventById(slug);
    if (calEv) calEv.setProp('classNames', getEventClassNames(slug));
  }
}

function clearFilmHighlights() {
  const slugs = [...filmHighlightSlugs];
  filmHighlightSlugs = new Set();
  for (const slug of slugs) {
    const calEv = calendar.getEventById(slug);
    if (calEv) calEv.setProp('classNames', getEventClassNames(slug));
  }
}

// ── Event list ────────────────────────────────────
function renderEventsList() {
  const container = document.getElementById('events-list');
  if (!container) return;

  let filtered = allEvents.filter(passesFilters);
  if (activeCalendarTab === 'all') {
    filtered = filtered.filter(isEventInCalendarView);
  } else if (activeCalendarTab === 'personal') {
    filtered = filtered.filter(ev => focusedEvents.has(ev.slug) || eventPriorities[ev.slug] || isUnsatisfiedPriority(ev.slug));
  } else if (activeCalendarTab === 'builder') {
    filtered = filtered.filter(ev => focusedEvents.has(ev.slug) || eventPriorities[ev.slug] || suggestedEvents.has(ev.slug) || isBuilderUnsatisfied(ev.slug));
  }

  // Group by day
  const dayMap = new Map();
  for (const ev of filtered) {
    const d = ev.schedule_day || 'Unknown';
    if (!dayMap.has(d)) dayMap.set(d, []);
    dayMap.get(d).push(ev);
  }

  let html = '';
  for (const [day, evs] of dayMap) {
    html += `<div class="day-group">`;
    html += `<div class="day-header">${escHtml(day)} · ${evs.length} event${evs.length !== 1 ? 's' : ''}</div>`;

    for (const ev of evs) {
      const fs = filmsByEventSlug[ev.slug] || [];
      const duration = getEventDuration(ev);
      const isExpanded = ev.slug === expandedEventSlug;
      const priority = eventPriorities[ev.slug] || '';
      const isPinned = priority === 'pin';
      const isSuggested = suggestedEvents.has(ev.slug);
      let shadowed;
      if (activeCalendarTab === 'builder') {
        shadowed = !isSuggested && priority !== 'pin';
      } else {
        shadowed = isShadowed(ev.slug);
      }

      let badges = '';
      if (ev.is_free) badges += `<span class="badge badge--free">FREE</span>`;
      if (fs.length > 0) badges += `<span class="badge badge--screenings">${fs.length} film${fs.length !== 1 ? 's' : ''}</span>`;
      if (ev.type === 'Appointment') badges += `<span class="badge">APPOINTMENT</span>`;

      html += `<div class="event-row${isExpanded ? ' expanded' : ''}${shadowed ? ' event-row--shadowed' : ''}" id="evt-${escHtml(ev.slug)}" data-slug="${escHtml(ev.slug)}">`;
      html += `<div class="event-row-header" data-action="toggle-event" data-slug="${escHtml(ev.slug)}">`;
      html += `<button class="event-row-pin${isPinned ? ' pinned' : priority ? ` priority-${priority}` : ''}" data-action="toggle-pin" data-slug="${escHtml(ev.slug)}" aria-label="${isPinned ? 'Remove from schedule' : priority ? 'Priority: ' + priority : 'Add to schedule'}">${PRIORITY_CHARS[priority] || ''}</button>`;
      html += `<span class="event-row-time">${escHtml(ev.schedule_time || '')}</span>`;
      html += `<span class="event-row-title">${escHtml(ev.title)}${ev.celluloid ? ' <svg class="celluloid-icon" width="12" height="12" viewBox="0 0 14 14"><circle cx="7" cy="7" r="5.5" fill="none" stroke="#E8A202" stroke-width="1.5"/><circle cx="7" cy="7" r="2" fill="#E8A202"/></svg>' : ''}</span>`;
      html += `<span class="event-row-venue">${escHtml(ev.venue || '')}</span>`;
      html += `<span class="event-row-badges">${badges}</span>`;
      html += `</div>`;

      html += `<div class="event-row-expand">`;

      // Films
      if (fs.length > 0) {
        html += `<div class="event-row-films">`;
        for (const f of fs) {
          const meta = [];
          if (f.director) meta.push(f.director);
          if (f.year) meta.push(f.year);
          if (f.running_time_minutes) meta.push(formatDuration(f.running_time_minutes));
          html += `<div class="event-row-film">`;
          const fkey = filmKey(f.title);
          const fpri = filmPriorities[fkey] || '';
          html += `<button class="film-priority" data-action="toggle-priority" data-film-key="${escHtml(fkey)}" data-priority="${fpri}" aria-label="${fpri ? 'Priority: ' + fpri : 'Set priority'}">${PRIORITY_CHARS[fpri] || ''}</button>`;
          html += `<span class="event-row-film-title" data-action="nav-film" data-film-title="${escHtml(f.title)}">${escHtml(f.title)}</span>`;
          if (meta.length) html += `<span class="event-row-film-meta">${escHtml(meta.join(' · '))}</span>`;

          const allSc = eventsByFilmTitle[f.title] || [];
          const otherSc = allSc.filter(e => e.event_slug !== ev.slug);
          if (otherSc.length > 0) {
            html += `<span class="badge badge--more" title="${otherSc.length} other screening${otherSc.length > 1 ? 's' : ''}">+${otherSc.length}</span>`;
          }

          html += `</div>`;
        }
        html += `</div>`;
        html += `<p style="font-family: var(--font-mono); font-size: 0.65rem; color: var(--cr-gray-mid);">Total: ~${formatDuration(duration)}</p>`;
      }

      // Description
      if (ev.description) {
        const truncated = ev.description.length > 500 ? ev.description.substring(0, 500) + '…' : ev.description;
        html += `<div class="event-row-desc">${escHtml(truncated)}</div>`;
      }

      // Introduced by / notes
      if (ev.introduced_by) html += `<div class="event-row-intro">${escHtml(ev.introduced_by)}</div>`;
      if (ev.notes) html += `<div class="event-row-notes">${escHtml(ev.notes)}</div>`;

      if (ev.discover_more_url) html += `<a href="${escHtml(ev.discover_more_url)}" class="event-row-link" target="_blank" rel="noopener">View on ilcinemaritrovato.it →</a>`;

      html += `</div></div>`;
    }

    html += `</div>`;
  }

  container.innerHTML = html || '<p style="color:var(--cr-gray-mid);padding:20px;">No events match the current filters.</p>';
}

function toggleEvent(slug) {
  if (expandedEventSlug === slug) {
    expandedEventSlug = null;
    highlightCalendarEvent(null);
  } else {
    expandedEventSlug = slug;
    highlightCalendarEvent(slug);
  }
  renderEventsList();
  scrollToEvent(slug);
}

function scrollToEvent(slug) {
  requestAnimationFrame(() => {
    const el = document.getElementById(`evt-${slug}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
}

function toggleEventPriority(slug) {
  const current = eventPriorities[slug];
  const next = current ? EVENT_PRIORITY_NEXT[current] : 'low';
  if (next) {
    eventPriorities[slug] = next;
  } else {
    delete eventPriorities[slug];
  }
  focusedEvents.add(slug);
  saveEventPriorities();

  const container = document.getElementById('events-list');
  const scrollTop = container.scrollTop;
  renderEventsList();
  container.scrollTop = scrollTop;

  if (activeDetailTab === 'films') {
    const filmsContainer = document.getElementById('films-list');
    const filmsScrollTop = filmsContainer.scrollTop;
    renderFilmsList();
    filmsContainer.scrollTop = filmsScrollTop;
  }

  const savedHighlight = calendarHighlightSlug;
  if (activeCalendarTab === 'builder') buildSchedule();
  buildCalendarEvents();
  if (savedHighlight) {
    requestAnimationFrame(() => {
      calendarHighlightSlug = null;
      highlightCalendarEvent(savedHighlight, false);
    });
  }
}

const PRIORITY_NEXT = { 'low': 'med', 'med': 'high', 'high': null };
const EVENT_PRIORITY_NEXT = { 'low': 'med', 'med': 'high', 'high': 'pin', 'pin': null };
const PRIORITY_CHARS = { low: '\u25BC', med: '\u25A0', high: '\u25B2' };

function toggleFilmPriority(fKey) {
  const current = filmPriorities[fKey];
  const next = current ? PRIORITY_NEXT[current] : 'low';
  if (next) {
    filmPriorities[fKey] = next;
  } else {
    delete filmPriorities[fKey];
  }
  saveFilmPriorities();

  for (const film of uniqueFilms) {
    if (filmKey(film.title) === fKey) {
      const evs = eventsByFilmTitle[film.title] || [];
      for (const e of evs) focusedEvents.add(e.event_slug);
      break;
    }
  }

  const eventsContainer = document.getElementById('events-list');
  const eventsScroll = eventsContainer.scrollTop;
  renderEventsList();
  eventsContainer.scrollTop = eventsScroll;

  const filmsContainer = document.getElementById('films-list');
  const filmsScroll = filmsContainer.scrollTop;
  renderFilmsList();
  filmsContainer.scrollTop = filmsScroll;

  if (activeCalendarTab === 'builder') buildSchedule();
  buildCalendarEvents();
}

// ── Film list ─────────────────────────────────────
function renderFilmsList() {
  const container = document.getElementById('films-list');
  if (!container) return;

  let baseEvents = allEvents.filter(passesFiltersForFilms);
  if (activeCalendarTab === 'all') {
    baseEvents = baseEvents.filter(isEventInCalendarView);
  } else if (activeCalendarTab === 'personal') {
    baseEvents = baseEvents.filter(ev => focusedEvents.has(ev.slug) || eventPriorities[ev.slug] || isUnsatisfiedPriority(ev.slug));
  } else if (activeCalendarTab === 'builder') {
    baseEvents = baseEvents.filter(ev => focusedEvents.has(ev.slug) || eventPriorities[ev.slug] || suggestedEvents.has(ev.slug) || isBuilderUnsatisfied(ev.slug));
  }
  const filteredEvents = new Set(baseEvents.map(e => e.slug));

  const searchQ = filmsSearch.toLowerCase();

  const shown = uniqueFilms.filter(f => {
    const evs = eventsByFilmTitle[f.title] || [];
    if (!evs.some(e => filteredEvents.has(e.event_slug))) return false;
    if (searchQ && !f.title.toLowerCase().includes(searchQ)) return false;
    return true;
  });

  if (shown.length === 0) {
    container.innerHTML = '<p style="color:var(--cr-gray-mid);padding:20px;">No films match the current filters.</p>';
    return;
  }

  let currentLetter = '';
  let html = '';

  for (const film of shown) {
    const firstChar = film.title.charAt(0).toUpperCase();
    if (firstChar !== currentLetter) {
      currentLetter = firstChar;
      html += `<div class="films-alpha-header">${currentLetter}</div>`;
    }

    const key = filmKey(film.title);
    const priority = filmPriorities[key] || '';
    const isExpanded = expandedFilmKey === key;
    const evs = eventsByFilmTitle[film.title] || [];
    const unsatisfied = activeCalendarTab === 'builder' && priority && !isFilmSatisfied(film.title);

    // Determine if this film is in the filtered set or all events
    const filteredEvs = evs.filter(e => filteredEvents.has(e.event_slug));

    const meta = [film.director, film.year, film.country].filter(Boolean);

    html += `<div class="film-row${isExpanded ? ' expanded' : ''}${unsatisfied ? ' film-row--unsatisfied' : ''}" id="film-${key}" data-film-key="${key}" data-film-title="${escHtml(film.title)}">`;
    html += `<div class="film-row-header" data-action="toggle-film" data-film-key="${key}">`;
    html += `<button class="film-priority" data-action="toggle-priority" data-film-key="${escHtml(key)}" data-priority="${priority}" aria-label="${priority ? 'Priority: ' + priority : 'Set priority'}">${PRIORITY_CHARS[priority] || ''}</button>`;
    html += `<span class="film-row-title">${escHtml(film.title)}</span>`;
    if (meta.length) html += `<span class="film-row-meta">${escHtml(meta.join(' · '))}</span>`;
    html += `<span class="film-row-count">${filteredEvs.length} screening${filteredEvs.length !== 1 ? 's' : ''}${filteredEvs.length !== evs.length ? ` / ${evs.length} total` : ''}</span>`;
    html += `</div>`;

    html += `<div class="film-row-expand">`;
    for (const e of evs) {
      const inFilter = filteredEvents.has(e.event_slug);
      const priority = eventPriorities[e.event_slug] || '';
      const isPinned = priority === 'pin';
      html += `<div class="film-screening" style="${inFilter ? '' : 'opacity:0.35;'}">`;
      html += `<button class="event-row-pin film-screening-pin${isPinned ? ' pinned' : priority ? ` priority-${priority}` : ''}" data-action="toggle-pin" data-slug="${escHtml(e.event_slug)}" aria-label="${isPinned ? 'Remove from schedule' : priority ? 'Priority: ' + priority : 'Add to schedule'}">${PRIORITY_CHARS[priority] || ''}</button>`;
      html += `<span class="film-screening-date">${escHtml(e.schedule_day || '')} ${escHtml(e.schedule_time || '')}</span>`;
      html += `<span class="film-screening-event" data-action="nav-event" data-slug="${escHtml(e.event_slug)}">${escHtml(e.event_title)}</span>`;
      html += `<span class="film-screening-venue">${escHtml(e.venue || '')}</span>`;
      html += `</div>`;
    }
    html += `</div></div>`;
  }

  container.innerHTML = html;
}

function toggleFilm(key) {
  if (expandedFilmKey === key) {
    expandedFilmKey = null;
    clearFilmHighlights();
  } else {
    if (expandedFilmKey) clearFilmHighlights();
    expandedFilmKey = key;
    const film = uniqueFilms.find(f => filmKey(f.title) === key);
    if (film) {
      const evs = eventsByFilmTitle[film.title] || [];
      applyFilmHighlights(evs.map(e => e.event_slug));
    }
  }
  renderFilmsList();
  scrollToFilm(key);
}

function scrollToFilm(key) {
  requestAnimationFrame(() => {
    const el = document.getElementById(`film-${key}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
}

// ── Navigation ────────────────────────────────────
function navigateToEvent(slug, shouldScroll = true) {
  switchDetailTab('events');
  expandedEventSlug = slug;
  highlightCalendarEvent(slug, shouldScroll);
  renderEventsList();
  scrollToEvent(slug);
}

function navigateToFilm(title) {
  const key = filmKey(title);
  clearFilmHighlights();
  expandedFilmKey = key;
  switchDetailTab('films');
  renderFilmsList();
  scrollToFilm(key);
}

// ── Filters ───────────────────────────────────────
let searchTimeout = null;

function updateVenueTrigger() {
  const btn = document.getElementById('venue-trigger');
  const label = btn.querySelector('.multi-trigger-label');
  const allCb = document.getElementById('venue-all');
  if (!btn || !label) return;
  const all = document.querySelectorAll('#venue-list input[type="checkbox"]');
  const checked = Array.from(all).filter(cb => cb.checked);

  if (checked.length === 0) {
    label.textContent = 'No venues';
  } else if (checked.length === venues.length) {
    label.textContent = 'All venues';
    if (allCb) allCb.checked = true;
    allCb.indeterminate = false;
  } else {
    label.textContent = `${checked.length} venue${checked.length > 1 ? 's' : ''}`;
    if (allCb) {
      allCb.checked = false;
      allCb.indeterminate = true;
    }
  }
}

function syncVenueFilters() {
  const checked = document.querySelectorAll('#venue-list input[type="checkbox"]:checked');
  currentFilters.venues = new Set(Array.from(checked).map(cb => cb.value));
  selectedVenues = currentFilters.venues;
  applyFilters();
}

function setupFilterListeners() {
  const trigger = document.getElementById('venue-trigger');
  const dropdown = document.getElementById('venue-dropdown');

  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    const open = dropdown.classList.toggle('open');
    trigger.classList.toggle('open', open);
  });

  document.addEventListener('click', () => {
    dropdown.classList.remove('open');
    trigger.classList.remove('open');
  });

  document.addEventListener('click', (e) => {
    if (!focusedEvents.size) return;
    if (e.target.closest('[data-action="toggle-pin"], [data-action="toggle-priority"]')) return;
    focusedEvents = new Set();
    renderEventsList();
    renderFilmsList();
    buildCalendarEvents();
  });

  dropdown.addEventListener('click', (e) => e.stopPropagation());

  document.getElementById('venue-all').addEventListener('change', function () {
    const all = document.querySelectorAll('#venue-list input[type="checkbox"]');
    all.forEach(cb => { cb.checked = this.checked; });
    if (this.checked) this.indeterminate = false;
    updateVenueTrigger();
    syncVenueFilters();
  });

  document.getElementById('venue-list').addEventListener('change', (e) => {
    if (e.target.type === 'checkbox') {
      updateVenueTrigger();
      syncVenueFilters();
    }
  });

  document.getElementById('filter-type').addEventListener('change', (e) => {
    currentFilters.type = e.target.value;
    applyFilters();
  });

  document.getElementById('filter-search-events').addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      eventsSearch = e.target.value;
      applyFilters();
    }, 200);
  });

  document.getElementById('filter-search-films').addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      filmsSearch = e.target.value;
      applyFilters();
    }, 200);
  });
}

function applyFilters() {
  expandedEventSlug = null;
  expandedFilmKey = null;
  calendarHighlightSlug = null;
  if (activeCalendarTab === 'builder') buildSchedule();
  buildCalendarEvents();
  renderEventsList();
  renderFilmsList();
}

// ── Tabs ──────────────────────────────────────────
function setupTabListeners() {
  // Calendar tabs
  document.getElementById('calendar-tabs').addEventListener('click', (e) => {
    const tab = e.target.closest('.tab');
    if (!tab) return;
    const name = tab.dataset.tab;
    document.querySelectorAll('#calendar-tabs .tab').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
    activeCalendarTab = name;

    const builderToolbar = document.getElementById('builder-toolbar');
    if (name === 'builder') {
      builderToolbar.style.display = '';
      if (scheduleStart) {
        document.getElementById('builder-start-date').value = scheduleStart.substring(0, 10);
        document.getElementById('builder-start-time').value = scheduleStart.substring(11, 16);
      }
      if (scheduleEnd) {
        document.getElementById('builder-end-date').value = scheduleEnd.substring(0, 10);
        document.getElementById('builder-end-time').value = scheduleEnd.substring(11, 16);
      }
    } else {
      builderToolbar.style.display = 'none';
      suggestedEvents = new Set();
    }

    expandedEventSlug = null;
    expandedFilmKey = null;
    highlightCalendarEvent(null);
    clearFilmHighlights();
    if (name === 'builder') buildSchedule();
    renderEventsList();
    renderFilmsList();
    buildCalendarEvents();
  });

  // Detail tabs
  document.getElementById('detail-tabs').addEventListener('click', (e) => {
    const tab = e.target.closest('.tab');
    if (!tab) return;
    switchDetailTab(tab.dataset.tab);
  });

  // Event row clicks
  document.getElementById('events-list').addEventListener('click', (e) => {
    const action = e.target.closest('[data-action]');
    if (!action) return;
    e.preventDefault();

    if (action.dataset.action === 'toggle-event') {
      toggleEvent(action.dataset.slug);
    } else if (action.dataset.action === 'nav-film') {
      navigateToFilm(action.dataset.filmTitle);
    } else if (action.dataset.action === 'toggle-pin') {
      toggleEventPriority(action.dataset.slug);
    } else if (action.dataset.action === 'toggle-priority') {
      toggleFilmPriority(action.dataset.filmKey);
    }
  });

  // Film row clicks
  document.getElementById('films-list').addEventListener('click', (e) => {
    const action = e.target.closest('[data-action]');
    if (!action) return;
    e.preventDefault();

    if (action.dataset.action === 'toggle-film') {
      toggleFilm(action.dataset.filmKey);
    } else if (action.dataset.action === 'nav-event') {
      navigateToEvent(action.dataset.slug);
    } else if (action.dataset.action === 'toggle-pin') {
      toggleEventPriority(action.dataset.slug);
    } else if (action.dataset.action === 'toggle-priority') {
      toggleFilmPriority(action.dataset.filmKey);
    }
  });

  // Film row header clicks (direct click on .film-row-header)
  document.getElementById('films-list').addEventListener('click', (e) => {
    const header = e.target.closest('.film-row-header');
    if (!header || e.target.closest('[data-action]')) return;
    const row = header.closest('.film-row');
    if (row) toggleFilm(row.dataset.filmKey);
  });

  // Builder toolbar
  let builderStartTimeout;
  document.getElementById('builder-start-date').addEventListener('input', () => {
    scheduleStart = readScheduleStart();
    saveScheduleBounds();
    clearTimeout(builderStartTimeout);
    builderStartTimeout = setTimeout(() => applyFilters(), 300);
  });
  document.getElementById('builder-start-time').addEventListener('input', () => {
    scheduleStart = readScheduleStart();
    saveScheduleBounds();
    clearTimeout(builderStartTimeout);
    builderStartTimeout = setTimeout(() => applyFilters(), 300);
  });
  let builderEndTimeout;
  document.getElementById('builder-end-date').addEventListener('input', () => {
    scheduleEnd = readScheduleEnd();
    saveScheduleBounds();
    clearTimeout(builderEndTimeout);
    builderEndTimeout = setTimeout(() => applyFilters(), 300);
  });
  document.getElementById('builder-end-time').addEventListener('input', () => {
    scheduleEnd = readScheduleEnd();
    saveScheduleBounds();
    clearTimeout(builderEndTimeout);
    builderEndTimeout = setTimeout(() => applyFilters(), 300);
  });
  document.getElementById('builder-regenerate').addEventListener('click', () => {
    regenerateSchedule();
  });
}

function setupMenuListeners() {
  const trigger = document.getElementById('menu-trigger');
  const dropdown = document.getElementById('menu-dropdown');
  const fileInput = document.getElementById('import-file');

  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    const open = dropdown.classList.toggle('open');
    trigger.classList.toggle('open', open);
  });

  document.addEventListener('click', () => {
    dropdown.classList.remove('open');
    trigger.classList.remove('open');
  });

  dropdown.addEventListener('click', (e) => {
    e.stopPropagation();
    const action = e.target.closest('[data-action]');
    if (!action) return;

    if (action.dataset.action === 'export-schedule') {
      exportSchedule();
      dropdown.classList.remove('open');
      trigger.classList.remove('open');
    } else if (action.dataset.action === 'import-schedule') {
      fileInput.click();
      dropdown.classList.remove('open');
      trigger.classList.remove('open');
    }
  });

  fileInput.addEventListener('change', () => {
    if (fileInput.files.length > 0) {
      importSchedule(fileInput.files[0]);
      fileInput.value = '';
    }
  });

  const importModal = document.getElementById('import-modal');
  importModal.addEventListener('click', (e) => {
    const action = e.target.closest('[data-action]');
    if (!action) {
      if (e.target === importModal) handleImportCancel();
      return;
    }
    if (action.dataset.action === 'import-merge') {
      handleImportMerge();
    } else if (action.dataset.action === 'import-overwrite') {
      handleImportOverwrite();
    } else if (action.dataset.action === 'import-cancel') {
      handleImportCancel();
    }
  });
}

function switchDetailTab(name) {
  activeDetailTab = name;
  document.querySelectorAll('#detail-tabs .tab').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
  document.getElementById('events-panel').classList.toggle('active', name === 'events');
  document.getElementById('films-panel').classList.toggle('active', name === 'films');

  if (name === 'films') {
    highlightCalendarEvent(null);
    if (expandedFilmKey) {
      const film = uniqueFilms.find(f => filmKey(f.title) === expandedFilmKey);
      if (film) {
        const evs = eventsByFilmTitle[film.title] || [];
        applyFilmHighlights(evs.map(e => e.event_slug));
      }
    }
  } else {
    clearFilmHighlights();
    if (expandedEventSlug) {
      highlightCalendarEvent(expandedEventSlug, false);
    }
  }
}

// ── Bootstrap ─────────────────────────────────────
init().catch(err => {
  console.error(err);
  document.getElementById('loading').innerHTML = `<p style="color:#E80247">Failed to load data: ${escHtml(err.message)}</p><p style="font-size:0.7rem;">Make sure festival.db is in the same directory.</p>`;
});
