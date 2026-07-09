"use strict";

// Slot assignment for per-tab autosave to prevent overwrites in multi-tab scenario
let PS_SLOT = 0;

// Configuration constants
const PS_LIVE_KEY = 'prodrys_live';       // localStorage key holding slot -> timestamp mapping
const PS_SESSION_KEY = 'prodrys_slot';    // sessionStorage key for this tab's slot persistence
const PS_STALE_MS = 6000;                 // slot stale threshold (6 seconds)
const PS_HEARTBEAT_MS = 2000;             // heartbeat interval (2 seconds)

// Helper: read live registry from localStorage
function PS_readLive() {
  try {
    var data = localStorage.getItem(PS_LIVE_KEY);
    return data ? JSON.parse(data) : {};
  } catch (e) {
    return {};
  }
}

// Helper: write live registry to localStorage
function PS_writeLive(obj) {
  try {
    localStorage.setItem(PS_LIVE_KEY, JSON.stringify(obj));
  } catch (e) {
    // ignore errors (quota exceeded, etc.)
  }
}

// Helper: check if slot is free (stale or missing)
function PS_isFree(slot, live, now) {
  return live[slot] === undefined || (now - live[slot]) > PS_STALE_MS;
}

// Claim a slot for this tab, reusing if possible
function PS_claimSlot() {
  // Try to reuse slot from sessionStorage (page reload scenario)
  try {
    var saved = sessionStorage.getItem(PS_SESSION_KEY);
    if (saved) {
      var slot = parseInt(saved, 10);
      if (slot > 0) {
        PS_SLOT = slot;
        return slot;
      }
    }
  } catch (e) {
    // sessionStorage unavailable; fall through to slot 1
  }

  // Find first free slot starting from 1
  var live = PS_readLive();
  var now = Date.now();
  var n = 1;
  while (!PS_isFree(n, live, now)) {
    n++;
  }

  // Claim and persist slot
  try {
    sessionStorage.setItem(PS_SESSION_KEY, String(n));
  } catch (e) {
    // sessionStorage unavailable; just use it in memory
  }
  PS_SLOT = n;
  live[n] = now;
  PS_writeLive(live);

  return n;
}

// Public API: return autosave key for this tab
function PS_autoKey() {
  return 'prodrys_auto:' + PS_SLOT;
}

// Heartbeat: update this tab's timestamp to mark slot as active
function PS_heartbeat() {
  var live = PS_readLive();
  live[PS_SLOT] = Date.now();
  PS_writeLive(live);
}

// Release: remove this tab's slot from registry on close
function PS_release() {
  var live = PS_readLive();
  delete live[PS_SLOT];
  PS_writeLive(live);
}

// One-time migration: copy legacy autosave to slot 1 if needed
function PS_migrateLegacy() {
  try {
    var legacy = localStorage.getItem('prodrys_auto');
    var slot1 = localStorage.getItem('prodrys_auto:1');
    if (legacy && !slot1) {
      localStorage.setItem('prodrys_auto:1', legacy);
    }
  } catch (e) {
    // ignore
  }
}

// Initialization: run immediately (before other scripts)
PS_migrateLegacy();
PS_claimSlot();
PS_heartbeat();   // stamp immediately so a reused (reload) slot isn't seen as stale
setInterval(PS_heartbeat, PS_HEARTBEAT_MS);
window.addEventListener('beforeunload', PS_release);
