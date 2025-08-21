// Modern Music Player (ES Module)
// Features:
// - Playlist: add local files (drag/drop or file picker), add remote URLs, import/export JSON
// - Play/Pause, Next, Previous, Seek, Volume, Mute
// - Shuffle & Repeat (off / one / all)
// - Keyboard shortcuts and Media Session integration
// - Drag-and-drop reorder playlist, remove tracks
// - Persist remote-URL playlist entries in localStorage

const audio = document.getElementById('audio');
const playBtn = document.getElementById('play-btn');
const prevBtn = document.getElementById('prev-btn');
const nextBtn = document.getElementById('next-btn');
const shuffleBtn = document.getElementById('shuffle-btn');
const repeatBtn = document.getElementById('repeat-btn');
const muteBtn = document.getElementById('mute-btn');
const volumeEl = document.getElementById('volume');
const progressEl = document.getElementById('progress');
const seekbar = document.getElementById('seekbar');
const currentTimeEl = document.getElementById('current-time');
const totalTimeEl = document.getElementById('total-time');
const playlistEl = document.getElementById('playlist');
const trackTitleEl = document.getElementById('track-title');
const trackArtistEl = document.getElementById('track-artist');
const artworkEl = document.getElementById('artwork');
const fileInput = document.getElementById('file-input');
const openFilesBtn = document.getElementById('open-files');
const addUrlBtn = document.getElementById('add-url-btn');
const playlistSearch = document.getElementById('playlist-search');

const exportBtn = document.getElementById('export-playlist');
const importBtn = document.getElementById('import-playlist');
const importFile = document.getElementById('import-file');
const clearBtn = document.getElementById('clear-playlist');

let state = {
  playlist: [], // {id, title, artist, src, isLocal}
  currentIndex: -1,
  playing: false,
  shuffle: false,
  repeatMode: 'off', // off | one | all
};

const STORAGE_KEY = 'modern_music_player_playlist_v1';

// Sample remote tracks to start with
const sampleTracks = [
  { title: "SoundHelix Song 1", artist: "SoundHelix", src: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3", isLocal:false },
  { title: "SoundHelix Song 3", artist: "SoundHelix", src: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3", isLocal:false },
  { title: "SoundHelix Song 6", artist: "SoundHelix", src: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-6.mp3", isLocal:false }
];

function uuid() { return Math.random().toString(36).slice(2,9); }

function loadStateFromStorage(){
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      // seed sample tracks
      state.playlist = sampleTracks.map(t => ({ id: uuid(), ...t }));
      saveStateToStorage();
      return;
    }
    const parsed = JSON.parse(raw);
    state.playlist = parsed.playlist || [];
  } catch (e) {
    console.warn("Failed to load saved playlist:", e);
    state.playlist = sampleTracks.map(t => ({ id: uuid(), ...t }));
  }
}

function saveStateToStorage(){
  // Only persist non-local tracks (remote urls, so they survive reload)
  try {
    const toPersist = {
      playlist: state.playlist.filter(p => !p.isLocal).map(({id,title,artist,src,isLocal})=>({id,title,artist,src,isLocal}))
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toPersist));
  } catch(e) {
    console.warn("Failed to save playlist:", e);
  }
}

function renderPlaylist(filter=""){
  playlistEl.innerHTML = '';
  const frag = document.createDocumentFragment();
  const lower = filter.trim().toLowerCase();
  state.playlist.forEach((track, idx) => {
    if (lower && !(track.title + " " + (track.artist||"")).toLowerCase().includes(lower)) return;
    const li = document.createElement('li');
    li.draggable = true;
    li.dataset.index = idx;
    if (idx === state.currentIndex) li.classList.add('playing');

    const meta = document.createElement('div');
    meta.className = 'meta';
    const name = document.createElement('div'); name.className = 'name'; name.textContent = track.title || 'Untitled';
    const sub = document.createElement('div'); sub.className = 'sub'; sub.textContent = track.artist || (track.isLocal ? 'Local file' : 'Remote');
    meta.append(name, sub);

    const actions = document.createElement('div'); actions.className = 'actions';
    const playNow = document.createElement('button'); playNow.title = 'Play this track'; playNow.textContent = '▶';
    playNow.addEventListener('click', e => { e.stopPropagation(); playAtIndex(idx); });

    const removeBtn = document.createElement('button'); removeBtn.title = 'Remove'; removeBtn.textContent = '✖';
    removeBtn.addEventListener('click', e => { e.stopPropagation(); removeTrack(idx); });

    actions.append(playNow, removeBtn);

    li.append(meta, actions);

    // click to select and play
    li.addEventListener('click', () => playAtIndex(idx));

    // drag events for reordering
    li.addEventListener('dragstart', (e) => {
      li.classList.add('dragging');
      e.dataTransfer.setData('text/plain', idx.toString());
      e.dataTransfer.effectAllowed = 'move';
    });
    li.addEventListener('dragend', () => li.classList.remove('dragging'));
    li.addEventListener('dragover', e => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
    });
    li.addEventListener('drop', (e) => {
      e.preventDefault();
      const from = parseInt(e.dataTransfer.getData('text/plain'), 10);
      const to = parseInt(li.dataset.index, 10);
      reorderPlaylist(from, to);
    });

    frag.appendChild(li);
  });
  playlistEl.appendChild(frag);
}

function setNowPlayingUI(track){
  if (!track) {
    trackTitleEl.textContent = 'No track selected';
    trackArtistEl.textContent = '';
    totalTimeEl.textContent = '0:00';
    currentTimeEl.textContent = '0:00';
    progressEl.style.width = '0%';
    return;
  }
  trackTitleEl.textContent = track.title || extractNameFromSrc(track.src);
  trackArtistEl.textContent = track.artist || '';
  // artwork: we show nothing special for now
}

function extractNameFromSrc(src){
  try{
    const url = new URL(src);
    return decodeURIComponent(url.pathname.split('/').pop()) || src;
  }catch(e){
    return src;
  }
}

function durationFormat(seconds){
  if (!Number.isFinite(seconds)) return '0:00';
  const m = Math.floor(seconds/60);
  const s = Math.floor(seconds%60).toString().padStart(2,'0');
  return `${m}:${s}`;
}

function playAtIndex(i){
  if (i < 0 || i >= state.playlist.length) return;
  state.currentIndex = i;
  const track = state.playlist[i];
  audio.src = track.src;
  audio.play().then(() => {
    state.playing = true;
    updatePlayButton();
    setNowPlayingUI(track);
    updateMediaSessionMetadata(track);
    renderPlaylist(playlistSearch.value);
    saveStateToStorage();
  }).catch(err => {
    console.error("Play failed:", err);
  });
}

function updatePlayButton(){
  playBtn.textContent = state.playing ? '⏸️' : '▶️';
}

function playPauseToggle(){
  if (!audio.src && state.playlist.length) {
    playAtIndex(0);
    return;
  }
  if (audio.paused) {
    audio.play();
  } else {
    audio.pause();
  }
}

function nextTrack(){
  if (state.shuffle) {
    const i = Math.floor(Math.random()*state.playlist.length);
    playAtIndex(i);
    return;
  }
  if (state.currentIndex + 1 < state.playlist.length) {
    playAtIndex(state.currentIndex + 1);
  } else {
    if (state.repeatMode === 'all') {
      playAtIndex(0);
    } else {
      audio.pause();
      state.playing = false;
      updatePlayButton();
    }
  }
}

function prevTrack(){
  // if current > 3 seconds, seek to 0, else go previous
  if (audio.currentTime > 3) {
    audio.currentTime = 0;
  } else {
    if (state.currentIndex > 0) playAtIndex(state.currentIndex - 1);
    else if (state.repeatMode === 'all') playAtIndex(state.playlist.length - 1);
  }
}

function removeTrack(idx){
  const removingCurrent = idx === state.currentIndex;
  state.playlist.splice(idx,1);
  if (removingCurrent) {
    audio.pause();
    state.playing = false;
    audio.src = '';
    state.currentIndex = -1;
    setNowPlayingUI(null);
  } else if (idx < state.currentIndex) {
    state.currentIndex--;
  }
  renderPlaylist(playlistSearch.value);
  saveStateToStorage();
}

function reorderPlaylist(from, to){
  if (from === to) return;
  const [item] = state.playlist.splice(from,1);
  state.playlist.splice(to,0,item);
  // fix currentIndex mapping
  if (state.currentIndex === from) state.currentIndex = to;
  else if (from < state.currentIndex && to >= state.currentIndex) state.currentIndex--;
  else if (from > state.currentIndex && to <= state.currentIndex) state.currentIndex++;
  renderPlaylist(playlistSearch.value);
  saveStateToStorage();
}

// add local files using File objects
function addFiles(files){
  const arr = Array.from(files).filter(f => f.type.startsWith('audio/'));
  arr.forEach(file => {
    const objUrl = URL.createObjectURL(file);
    const title = file.name;
    const track = { id: uuid(), title, artist: '', src: objUrl, isLocal: true, fileName: file.name };
    state.playlist.push(track);
  });
  renderPlaylist(playlistSearch.value);
  // local files can't be persisted to localStorage (object URLs)
}

// add a remote URL
function addUrl(url){
  try {
    const parsed = new URL(url);
    const title = decodeURIComponent(parsed.pathname.split('/').pop()) || url;
    state.playlist.push({ id: uuid(), title, artist:'', src: url, isLocal:false });
    renderPlaylist(playlistSearch.value);
    saveStateToStorage();
  } catch(e) {
    alert('Invalid URL');
  }
}

function updateProgress(){
  if (!audio.duration || !audio.currentTime) {
    progressEl.style.width = '0%';
    currentTimeEl.textContent = '0:00';
    totalTimeEl.textContent = durationFormat(audio.duration);
    return;
  }
  const pct = (audio.currentTime / audio.duration) * 100;
  progressEl.style.width = pct + '%';
  currentTimeEl.textContent = durationFormat(audio.currentTime);
  totalTimeEl.textContent = durationFormat(audio.duration);
}

// handle ended
audio.addEventListener('ended', () => {
  if (state.repeatMode === 'one') {
    audio.currentTime = 0;
    audio.play();
    return;
  }
  nextTrack();
});

// play/pause events
audio.addEventListener('play', () => { state.playing = true; updatePlayButton(); renderPlaylist(playlistSearch.value); });
audio.addEventListener('pause', () => { state.playing = false; updatePlayButton(); renderPlaylist(playlistSearch.value); });
audio.addEventListener('timeupdate', updateProgress);
audio.addEventListener('loadedmetadata', () => {
  totalTimeEl.textContent = durationFormat(audio.duration);
});

// seek by clicking seekbar
seekbar.addEventListener('click', (e) => {
  const rect = seekbar.getBoundingClientRect();
  const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
  if (audio.duration) audio.currentTime = pct * audio.duration;
});

// keyboard support for seek when focused
seekbar.addEventListener('keydown', (e) => {
  if (!audio.duration) return;
  if (e.key === 'ArrowLeft') audio.currentTime = Math.max(0, audio.currentTime - 5);
  if (e.key === 'ArrowRight') audio.currentTime = Math.min(audio.duration, audio.currentTime + 5);
});

// volume control
volumeEl.addEventListener('input', (e) => {
  audio.volume = parseFloat(e.target.value);
  muteBtn.textContent = audio.muted || audio.volume === 0 ? '🔈' : '🔊';
});

muteBtn.addEventListener('click', () => {
  audio.muted = !audio.muted;
  muteBtn.textContent = audio.muted ? '🔈' : '🔊';
});

// Buttons
playBtn.addEventListener('click', () => playPauseToggle());
nextBtn.addEventListener('click', nextTrack);
prevBtn.addEventListener('click', prevTrack);

shuffleBtn.addEventListener('click', () => {
  state.shuffle = !state.shuffle;
  shuffleBtn.style.opacity = state.shuffle ? 1 : 0.6;
});

repeatBtn.addEventListener('click', () => {
  if (state.repeatMode === 'off') state.repeatMode = 'one';
  else if (state.repeatMode === 'one') state.repeatMode = 'all';
  else state.repeatMode = 'off';
  repeatBtn.textContent = state.repeatMode === 'one' ? '🔂' : '🔁';
  repeatBtn.style.opacity = state.repeatMode === 'off' ? 0.6 : 1;
});

// file add UI
openFilesBtn.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', (e) => {
  addFiles(e.target.files);
  fileInput.value = '';
});

// drag & drop onto the whole app to add files
document.addEventListener('dragover', (e) => { e.preventDefault(); });
document.addEventListener('drop', (e) => {
  e.preventDefault();
  if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) {
    addFiles(e.dataTransfer.files);
  } else if (e.dataTransfer && e.dataTransfer.getData('text/uri-list')) {
    const url = e.dataTransfer.getData('text/uri-list');
    if (url) addUrl(url.trim());
  }
});

// add URL prompt
addUrlBtn.addEventListener('click', () => {
  const url = prompt('Enter audio URL (http/https):');
  if (url) addUrl(url.trim());
});

// search
playlistSearch.addEventListener('input', (e) => {
  renderPlaylist(e.target.value);
});

// export/import
exportBtn.addEventListener('click', () => {
  const data = JSON.stringify(state.playlist.filter(p => !p.isLocal));
  const blob = new Blob([data], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'playlist.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
});

importBtn.addEventListener('click', () => importFile.click());
importFile.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      if (Array.isArray(parsed)) {
        parsed.forEach(p => {
          if (p.src) state.playlist.push({ id: uuid(), title: p.title || extractNameFromSrc(p.src), artist: p.artist || '', src: p.src, isLocal: false });
        });
        renderPlaylist(playlistSearch.value);
        saveStateToStorage();
      } else alert('Invalid playlist format');
    } catch(err) {
      alert('Failed to parse JSON');
    }
  };
  reader.readAsText(file);
  importFile.value = '';
});

// clear playlist
clearBtn.addEventListener('click', () => {
  if (!confirm('Clear playlist? (this removes remote & local entries)')) return;
  state.playlist = [];
  state.currentIndex = -1;
  audio.pause(); audio.src = '';
  renderPlaylist();
  saveStateToStorage();
  setNowPlayingUI(null);
});

// keyboard shortcuts
document.addEventListener('keydown', (e) => {
  const tag = document.activeElement && document.activeElement.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA') return; // ignore while typing
  if (e.code === 'Space') { e.preventDefault(); playPauseToggle(); }
  if (e.key.toLowerCase() === 'n') nextTrack();
  if (e.key.toLowerCase() === 'p') prevTrack();
  if (e.key.toLowerCase() === 's') { state.shuffle = !state.shuffle; shuffleBtn.style.opacity = state.shuffle?1:0.6; }
  if (e.key.toLowerCase() === 'r') {
    if (state.repeatMode === 'off') state.repeatMode = 'one';
    else if (state.repeatMode === 'one') state.repeatMode = 'all';
    else state.repeatMode = 'off';
    repeatBtn.textContent = state.repeatMode === 'one' ? '🔂' : '🔁';
    repeatBtn.style.opacity = state.repeatMode === 'off' ? 0.6 : 1;
  }
  if (e.key.toLowerCase() === 'm') { audio.muted = !audio.muted; muteBtn.textContent = audio.muted ? '🔈' : '🔊'; }
  if (e.key === 'ArrowRight') audio.currentTime = Math.min(audio.duration || 0, audio.currentTime + 5);
  if (e.key === 'ArrowLeft') audio.currentTime = Math.max(0, audio.currentTime - 5);
  if (e.key === 'ArrowUp') { audio.volume = Math.min(1, audio.volume + 0.05); volumeEl.value = audio.volume; }
  if (e.key === 'ArrowDown') { audio.volume = Math.max(0, audio.volume - 0.05); volumeEl.value = audio.volume; }
});

// Media Session API (improves integration w/ OS media keys)
function updateMediaSessionMetadata(track){
  if (!('mediaSession' in navigator)) return;
  navigator.mediaSession.metadata = new MediaMetadata({
    title: track.title || extractNameFromSrc(track.src),
    artist: track.artist || '',
    album: '',
    artwork: [
      { src: '', sizes: '512x512', type: 'image/png' } // placeholder
    ]
  });
}

if ('mediaSession' in navigator) {
  navigator.mediaSession.setActionHandler('play', () => audio.play());
  navigator.mediaSession.setActionHandler('pause', () => audio.pause());
  navigator.mediaSession.setActionHandler('previoustrack', prevTrack);
  navigator.mediaSession.setActionHandler('nexttrack', nextTrack);
  // seek handlers are optional
}

// initialize: load saved playlist and render
loadStateFromStorage();
renderPlaylist();
setNowPlayingUI(state.playlist[state.currentIndex] || null);

// if there is a playlist and no selection, don't auto-play; user can click first item
// but we can pre-load first remote track metadata if desired
if (state.playlist.length > 0 && state.currentIndex === -1) {
  // show first item details
  setNowPlayingUI(state.playlist[0]);
}

// expose some functions for debugging (optional)
window.__player = {
  state,
  playAtIndex,
  addUrl,
  addFiles: (files) => addFiles(files)
};
