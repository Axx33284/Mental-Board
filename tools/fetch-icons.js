/* Downloads Material Symbols (Outlined) from Google and bakes them into
   assets/icons.js as bare path data. Run with `npm run icons`.

   Why bake rather than link: the app runs from file:// under a strict CSP with
   no network access, so every glyph has to ship inside the app. Path data is
   ~200 bytes each — the whole set is smaller than one PNG.

   Material Symbols are Apache 2.0 (see assets/ICONS-LICENSE.txt). */
const fs = require('fs');
const path = require('path');
const https = require('https');

const OUT = path.join(__dirname, '..', 'src', 'assets');
const URL = (n) => `https://fonts.gstatic.com/s/i/short-term/release/materialsymbolsoutlined/${n}/default/24px.svg`;

/* The app's own chrome. Keys here are referenced from renderer.js/index.html.

   Every name in this list must end up on screen somewhere — `npm run check:icons`
   fails the build on one that does not. A glyph nobody draws is 200 bytes of
   dead weight and, worse, a promise in the picker that the UI never keeps. */
const UI = [
  'add', 'close', 'remove', 'settings', 'search', 'link', 'link_off', 'add_link',
  'content_copy', 'content_cut', 'content_paste', 'delete', 'delete_forever', 'edit', 'check',
  'arrow_upward', 'arrow_downward', 'arrow_back', 'arrow_forward',
  'north_east', 'north_west', 'south_east', 'south_west',
  'palette', 'colorize', 'image', 'code', 'zoom_in', 'zoom_out', 'fit_screen',
  'sticky_note_2', 'select_all', 'more_horiz', 'undo', 'redo',
  'crop', 'crop_square', 'rotate_right', 'restart_alt', 'brush', 'draw', 'title',
  'text_fields', 'text_increase', 'text_decrease',
  'format_bold', 'format_italic', 'format_underlined', 'format_strikethrough',
  'format_h1', 'format_h2', 'format_h3', 'format_paragraph', 'format_clear',
  'format_ink_highlighter', 'format_quote', 'format_list_bulleted', 'format_list_numbered',
  'format_align_left', 'format_align_center', 'format_align_right',
  'format_textdirection_l_to_r', 'format_textdirection_r_to_l',
  'horizontal_rule', 'checklist', 'lightbulb',
  'download', 'upload', 'folder_open', 'dark_mode', 'light_mode', 'computer', 'mouse',
  'grid_on', 'tune', 'keyboard', 'space_dashboard', 'language',
  'my_location', 'open_in_full', 'mood', 'expand_more', 'chevron_right',
  /* Tables. Material Symbols has add_row_below and add_column_right but no
     delete equivalents — remove_row, delete_row and column_delete all 404. So
     the two delete buttons are composed in CSS instead: the plain row/column
     glyph with a small `close` badge over it. See .tb-stack in styles.css. */
  'table', 'add_row_below', 'add_column_right', 'table_rows', 'view_column',
  /* boards, reminders, history and locking */
  'unarchive', 'alarm_off',
  /* 2.1: duplicate, and the pen */
  'library_add', 'ink_pen', 'ink_highlighter', 'ink_eraser', 'flip_to_front', 'flip_to_back',
  'delete_sweep', 'volume_up', 'arrow_selector_tool',
  /* 2.3: maths and chemistry in a note */
  'superscript', 'subscript', 'functions', 'science', 'format_list_numbered_rtl',
  /* 2.8: the slash menu's Database section (js/database.js) — a glyph per
     view, per chart and per property type — and the table of contents */
  'view_kanban', 'view_timeline', 'dynamic_feed', 'bar_chart', 'align_horizontal_left',
  'show_chart', 'donut_large', 'check_box', 'radio_button_checked', 'arrow_drop_down_circle',
  'list', 'location_on', 'notes', 'toc', 'chevron_left',
  /* 2.9: the block handle (js/blocks.js) — its grip, Turn into, text and
     background colours — and the toggle blocks' row in the slash menu */
  'drag_indicator', 'autorenew', 'format_color_text', 'format_color_fill', 'arrow_right'
];

/* Icons the user can stamp on a note or a workflow, or drop into note text with
   `/icon`. Grouped for the picker; every group name needs an `icons.<Group>`
   key in assets/lang/*.js or the heading renders as the key.

   These are browsed, not searched-for by name, so the grouping is the whole
   interface: a group of forty is a wall, a group of eight is a shrug. Twelve to
   twenty-four each, ordered so the obvious ones come first.

   Anything that fails to download is dropped from its group automatically, so a
   name that turns out not to exist costs a gap, not a broken tile. */
const PICKER = {
  Work: ['work', 'business_center', 'description', 'task_alt', 'event', 'schedule', 'flag',
         'campaign', 'trending_up', 'trending_down', 'analytics', 'insights', 'leaderboard',
         'account_balance', 'gavel', 'handshake', 'groups', 'person', 'badge', 'inventory_2',
         'receipt_long', 'assignment', 'fact_check', 'approval'],
  Money: ['payments', 'savings', 'attach_money', 'euro', 'currency_pound', 'credit_card',
          'account_balance_wallet', 'request_quote', 'price_check', 'sell', 'shopping_bag',
          'shopping_cart', 'local_atm', 'paid', 'percent', 'calculate', 'monetization_on',
          'query_stats'],
  Build: ['code', 'terminal', 'bug_report', 'memory', 'storage', 'cloud', 'api', 'dns', 'hub',
          'rocket_launch', 'build', 'extension', 'lan', 'settings_ethernet', 'data_object',
          'account_tree', 'commit', 'deployed_code', 'database', 'webhook', 'integration_instructions',
          'developer_mode'],
  Think: ['lightbulb', 'psychology', 'science', 'school', 'menu_book', 'auto_awesome',
          'emoji_objects', 'quiz', 'help', 'priority_high', 'star', 'favorite', 'bookmark',
          'push_pin', 'label', 'category', 'target', 'tips_and_updates', 'question_mark',
          'crisis_alert'],
  Health: ['fitness_center', 'directions_run', 'exercise', 'sports_gymnastics', 'self_improvement',
           'monitor_heart', 'favorite_border', 'medical_services', 'medication', 'vaccines',
           'health_and_safety', 'spa', 'bedtime', 'water_drop', 'scale', 'timer', 'nutrition',
           'sports_score'],
  Sport: ['sports_soccer', 'sports_basketball', 'sports_tennis', 'sports_volleyball',
          'sports_football', 'sports_cricket', 'sports_martial_arts', 'pool', 'directions_bike',
          'hiking', 'downhill_skiing', 'skateboarding', 'surfing', 'golf_course', 'emoji_events',
          'military_tech'],
  Food: ['restaurant', 'local_cafe', 'local_pizza', 'lunch_dining', 'ramen_dining', 'bakery_dining',
         'icecream', 'cake', 'egg', 'set_meal', 'local_bar', 'wine_bar', 'liquor', 'coffee',
         'kitchen', 'grocery', 'blender', 'takeout_dining'],
  Life: ['home', 'bed', 'chair', 'shower', 'local_laundry_service', 'cleaning_services', 'pets',
         'child_care', 'family_restroom', 'volunteer_activism', 'celebration', 'cake',
         'card_giftcard', 'checkroom', 'diamond', 'watch'],
  Travel: ['flight', 'directions_car', 'train', 'directions_bus', 'directions_boat', 'two_wheeler',
           'local_taxi', 'luggage', 'beach_access', 'hotel', 'map', 'place', 'explore', 'public',
           'travel_explore', 'landscape', 'terrain', 'nights_stay'],
  Nature: ['park', 'forest', 'grass', 'potted_plant', 'local_florist', 'eco', 'recycling',
           'wb_sunny', 'cloud', 'thunderstorm', 'ac_unit', 'air', 'waves', 'volcano', 'bug_report',
           'nest_eco_leaf'],
  Media: ['photo_camera', 'movie', 'music_note', 'headphones', 'mic', 'brush', 'videogame_asset',
          'sports_esports', 'radio', 'palette', 'draw', 'theaters', 'podcasts', 'library_music',
          'graphic_eq', 'play_circle', 'videocam', 'collections'],
  Talk: ['mail', 'chat', 'call', 'notifications', 'share', 'public', 'language', 'rss_feed',
         'forum', 'alternate_email', 'question_answer', 'sms', 'contact_mail', 'group_add',
         'thumb_up', 'thumb_down', 'waving_hand', 'record_voice_over'],
  School: ['school', 'menu_book', 'auto_stories', 'book', 'edit_note', 'history_edu', 'translate',
           'functions', 'biotech', 'psychology_alt', 'draw_abstract', 'backpack', 'science',
           'calculate', 'architecture', 'design_services'],
  Devices: ['computer', 'laptop', 'smartphone', 'tablet', 'watch', 'tv', 'keyboard', 'mouse',
            'print', 'router', 'usb', 'battery_full', 'wifi', 'bluetooth', 'headset_mic',
            'speaker', 'sim_card', 'sd_card'],
  Tools: ['build', 'handyman', 'construction', 'hardware', 'plumbing', 'carpenter', 'electrical_services',
          'engineering', 'precision_manufacturing', 'colorize', 'straighten', 'square_foot',
          'settings', 'tune', 'science', 'science_off'],
  Time: ['schedule', 'timer', 'alarm', 'hourglass_empty', 'hourglass_top', 'calendar_month',
         'calendar_today', 'date_range', 'event_available', 'event_busy', 'update', 'history',
         'today', 'more_time', 'av_timer', 'punch_clock'],
  Status: ['check_circle', 'cancel', 'error', 'warning', 'info', 'pending', 'hourglass_empty',
           'done_all', 'block', 'verified', 'bolt', 'local_fire_department', 'new_releases',
           'report', 'gpp_good', 'gpp_bad', 'change_circle', 'do_not_disturb_on'],
  Arrows: ['north', 'south', 'east', 'west', 'north_east', 'north_west', 'south_east', 'south_west',
           'arrow_upward', 'arrow_downward', 'arrow_back', 'arrow_forward', 'swap_horiz',
           'swap_vert', 'sync', 'refresh', 'undo', 'redo', 'call_split', 'merge', 'trending_flat',
           'open_in_new'],
  Symbols: ['star', 'favorite', 'circle', 'square', 'change_history', 'hexagon', 'pentagon',
            'stars', 'brightness_1', 'radio_button_unchecked', 'add', 'remove', 'close', 'check',
            'priority_high', 'question_mark', 'tag', 'numbers', 'percent', 'currency_exchange',
            'all_inclusive', 'blur_on'],
  Secure: ['key', 'lock', 'lock_open', 'shield', 'security', 'visibility', 'visibility_off',
           'fingerprint', 'password', 'admin_panel_settings', 'verified_user', 'policy',
           'privacy_tip', 'encrypted', 'no_encryption', 'vpn_key'],
  Organise: ['folder', 'folder_open', 'topic', 'layers', 'filter_alt', 'sort', 'view_list',
             'view_module', 'grid_view', 'dashboard', 'space_dashboard', 'table', 'account_tree',
             'segment', 'format_list_bulleted', 'checklist', 'label', 'bookmarks', 'archive',
             'inventory']
};

function get(url) {
  return new Promise((resolve) => {
    https.get(url, { headers: { 'User-Agent': 'mental-board-icon-fetch' } }, (res) => {
      if (res.statusCode !== 200) { res.resume(); resolve(null); return; }
      let body = '';
      res.on('data', (d) => { body += d; });
      res.on('end', () => resolve(body));
    }).on('error', () => resolve(null));
  });
}

// pull every <path d="..."> out of the downloaded svg and join them
function paths(svg) {
  const out = [];
  const re = /<path[^>]*\sd="([^"]+)"/g;
  let m;
  while ((m = re.exec(svg))) out.push(m[1]);
  return out.length ? out.join(' ') : null;
}

async function pool(names, worker, size) {
  const queue = [...names];
  const runners = Array.from({ length: size }, async () => {
    while (queue.length) await worker(queue.shift());
  });
  await Promise.all(runners);
}

(async () => {
  const wanted = [...new Set([...UI, ...Object.values(PICKER).flat()])];
  const got = {};
  const missing = [];
  let done = 0;

  await pool(wanted, async (name) => {
    const svg = await get(URL(name));
    const d = svg && paths(svg);
    if (d) got[name] = d; else missing.push(name);
    if (++done % 25 === 0) process.stdout.write(`  ${done}/${wanted.length}\n`);
  }, 8);

  // drop anything that failed out of the picker groups so the UI never
  // renders an empty tile
  const groups = {};
  for (const [k, list] of Object.entries(PICKER)) {
    const kept = list.filter((n) => got[n]);
    if (kept.length) groups[k] = kept;
  }

  const sorted = Object.keys(got).sort();
  const body =
    '/* Generated by tools/fetch-icons.js — do not hand-edit.\n' +
    '   Material Symbols Outlined, Apache License 2.0.\n' +
    '   viewBox is "0 -960 960 960" for every glyph. */\n' +
    'window.MB_ICON_BOX = "0 -960 960 960";\n' +
    'window.MB_ICONS = {\n' +
    sorted.map((k) => `  ${JSON.stringify(k)}: ${JSON.stringify(got[k])}`).join(',\n') +
    '\n};\n' +
    'window.MB_ICON_GROUPS = ' + JSON.stringify(groups, null, 2) + ';\n';

  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'icons.js'), body);
  fs.writeFileSync(path.join(OUT, 'ICONS-LICENSE.txt'),
    'The icon path data in icons.js is from Google Material Symbols,\n' +
    'licensed under the Apache License, Version 2.0.\n' +
    'https://github.com/google/material-design-icons\n' +
    'http://www.apache.org/licenses/LICENSE-2.0\n');

  console.log(`wrote assets/icons.js — ${sorted.length} icons, ${Object.keys(groups).length} picker groups`);
  if (missing.length) console.log('missing (dropped):', missing.join(', '));
})();
