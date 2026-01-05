// ============================================================
// YT Transcript 1-Click Copy - Enhancer for YouTube Custom Script
// ============================================================
// Installation:
// 1. Open Enhancer for YouTube settings
// 2. Go to "Custom Script" section
// 3. Paste this entire code
// 4. Save and reload YouTube
// ============================================================

(function() {
  'use strict';
  
  // ====== CONFIG ======
  const CONFIG = {
    PROMPT_TEXT: `[Summarize the following youtube script in paragraphs, each containting bullet points. give bullet points tldr at the beginning. also give the speakers sentiment throughout the script.]`,
    INCLUDE_TIMESTAMPS: false,
    DEBUG_MODE: true,
    BTN_ID: "enhancer-transcript-copy-btn",
    BTN_TEXT: "📋 Copy Transcript",
    UI_WAIT_MS: 8000,
    SCROLL_MAX_LOOPS: 80,
    SCROLL_IDLE_ROUNDS: 5,
    MAX_RETRY_ATTEMPTS: 4,
    INIT_DELAY: 1500,
    AUTO_DETECT_MODE: true  // Auto-copy when transcript is manually opened
  };
  
  // ====== STATE ======
  const state = {
    button: null,
    lastUrl: location.href,
    startTime: Date.now(),
    transcriptObserver: null,
    autoExtracted: false
  };
  
  // ====== UTILS ======
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  
  function log(...args) {
    if (!CONFIG.DEBUG_MODE) return;
    const elapsed = ((Date.now() - state.startTime) / 1000).toFixed(2);
    console.log(`[Enhancer-Transcript +${elapsed}s]`, ...args);
  }
  
  function clean(s) {
    return (s || '')
      .replace(/\r/g, '')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n[ \t]+/g, '\n')
      .trim();
  }
  
  function isWatchPage() {
    return location.pathname === '/watch';
  }
  
  function setButtonState(text, disabled = false) {
    if (!state.button) return;
    state.button.textContent = text;
    state.button.disabled = disabled;
    state.button.style.opacity = disabled ? '0.6' : '1';
    state.button.style.cursor = disabled ? 'not-allowed' : 'pointer';
  }
  
  async function copyToClipboard(text) {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
      
      // Fallback
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;left:-9999px;top:0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch (err) {
      log('❌ Clipboard error:', err);
      return false;
    }
  }
  
  // ====== BUTTON INJECTION ======
  function createButton() {
    const btn = document.createElement('button');
    btn.id = CONFIG.BTN_ID;
    btn.textContent = CONFIG.BTN_TEXT;
    btn.setAttribute('aria-label', 'Copy video transcript with prompt');
    
    // Style to match Enhancer's aesthetic
    btn.style.cssText = `
      margin: 0 8px;
      padding: 0 12px;
      height: 36px;
      border: none;
      border-radius: 18px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s ease;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      white-space: nowrap;
      z-index: 9999;
    `;
    
    // Hover effect
    btn.onmouseenter = () => {
      if (!btn.disabled) {
        btn.style.transform = 'translateY(-1px)';
        btn.style.boxShadow = '0 4px 8px rgba(0,0,0,0.15)';
      }
    };
    btn.onmouseleave = () => {
      btn.style.transform = 'translateY(0)';
      btn.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
    };
    
    btn.onclick = handleButtonClick;
    return btn;
  }
  
  function injectButton() {
    if (!isWatchPage()) {
      removeButton();
      return;
    }
    
    if (state.button && document.body.contains(state.button)) {
      return; // Already injected
    }
    
    // Try multiple mount points (Enhancer might modify the DOM)
    const mountPoints = [
      '#masthead #end',
      '#masthead #start',
      'ytd-masthead #end',
      '#masthead-container #end',
      '#buttons ytd-button-renderer'
    ];
    
    let mounted = false;
    for (const selector of mountPoints) {
      const container = document.querySelector(selector);
      if (container) {
        state.button = createButton();
        
        // Insert at beginning of container
        if (container.firstChild) {
          container.insertBefore(state.button, container.firstChild);
        } else {
          container.appendChild(state.button);
        }
        
        log('✓ Button injected at:', selector);
        mounted = true;
        break;
      }
    }
    
    if (!mounted) {
      log('⚠️ Could not find mount point for button');
    }
  }
  
  function removeButton() {
    if (state.button) {
      state.button.remove();
      state.button = null;
    }
  }
  
  // ====== TRANSCRIPT EXTRACTION ======
  function findTranscriptContainer() {
    const selectors = [
      'ytd-transcript-renderer',
      'ytd-engagement-panel-section-list-renderer ytd-transcript-renderer',
      '[target-id*="transcript"]',
      '[id*="transcript"]',
      '[class*="transcript"]'
    ];
    
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) return el;
    }
    return null;
  }
  
  function extractSegments() {
    const segments = document.querySelectorAll('ytd-transcript-segment-renderer');
    if (!segments.length) return [];
    
    return Array.from(segments)
      .map(seg => {
        const tsEl = seg.querySelector('.segment-timestamp, [class*="timestamp"]');
        const txEl = seg.querySelector('.segment-text, [class*="segment-text"]');
        
        const ts = tsEl ? clean(tsEl.textContent) : '';
        let tx = txEl ? clean(txEl.textContent) : clean(seg.textContent);
        
        // Remove timestamp from text if it starts with it
        if (ts && tx.startsWith(ts)) {
          tx = clean(tx.slice(ts.length));
        }
        
        return { ts, tx };
      })
      .filter(x => x.tx);
  }
  
  function buildTranscriptText(includeTimestamps) {
    const segments = extractSegments();
    
    if (segments.length) {
      log(`Found ${segments.length} transcript segments`);
      return segments
        .map(({ ts, tx }) => (includeTimestamps && ts ? `${ts} ${tx}` : tx))
        .join(' ')
        .trim();
    }
    
    // Fallback to container text
    const container = findTranscriptContainer();
    if (container) {
      return clean(container.innerText).replace(/\n+/g, ' ');
    }
    
    return '';
  }
  
  function findClickableByText(regex) {
    const elements = document.querySelectorAll(
      'button, a, yt-formatted-string, tp-yt-paper-item, tp-yt-paper-button, ytd-menu-service-item-renderer'
    );
    
    for (const el of elements) {
      const text = (el.textContent || '').trim();
      if (!text || !regex.test(text)) continue;
      
      // If it's a formatted string, find parent button
      if (el.tagName === 'YT-FORMATTED-STRING') {
        const btn = el.closest('button, a, tp-yt-paper-item, tp-yt-paper-button, ytd-menu-service-item-renderer');
        if (btn && btn.offsetParent !== null) return btn;
        continue;
      }
      
      // Only return visible elements
      if (el.offsetParent !== null) return el;
    }
    return null;
  }
  
  async function openTranscriptPanel() {
    log('🔍 Attempting to open transcript panel...');
    
    // Check if already open
    const existingSegments = document.querySelectorAll('ytd-transcript-segment-renderer').length;
    if (existingSegments > 0) {
      log(`✓ Transcript already visible (${existingSegments} segments)`);
      return true;
    }
    
    // Method 0: Expand description first (required for Enhancer compatibility)
    log('Method 0: Expanding description section...');
    
    // Find the description area that can be clicked to expand
    const descriptionArea = document.querySelector(
      'ytd-text-inline-expander[slot="content"], ' +
      'ytd-watch-metadata #description, ' +
      '#description.ytd-watch-metadata, ' +
      '#description-inline-expander'
    );
    
    if (descriptionArea) {
      // Check if already expanded by looking for transcript button
      let transcriptBtn = document.querySelector('ytd-structured-description-content-renderer button');
      
      if (!transcriptBtn || transcriptBtn.offsetParent === null) {
        // Try to find clickable part of description
        const expandTarget = descriptionArea.querySelector('tp-yt-paper-button#expand, #expand, [id*="expand"]') || descriptionArea;
        
        if (expandTarget && expandTarget.offsetParent !== null) {
          log('✓ Clicking description to expand...');
          expandTarget.click();
          await sleep(1000); // Wait for expansion animation
          
          log('✓ Description expanded, looking for transcript button...');
        }
      }
    }
    
    // Deep diagnostics
    log('🔍 DOM scan - engagement panels:', document.querySelectorAll('ytd-engagement-panel-section-list-renderer').length);
    log('🔍 DOM scan - structured description:', !!document.querySelector('ytd-structured-description-content-renderer'));
    const allButtons = Array.from(document.querySelectorAll('button, tp-yt-paper-button'));
    const transcriptButtons = allButtons.filter(b => /transcript/i.test(b.textContent));
    log('🔍 Found buttons with "transcript":', transcriptButtons.length);
    transcriptButtons.slice(0, 3).forEach((btn, i) => {
      log(`  ${i + 1}:`, btn.textContent.trim().substring(0, 60), '| visible:', btn.offsetParent !== null);
    });
    
    // Method 1: Direct button in description area (now should be visible)
    log('Method 1: Looking for direct transcript button...');
    
    const structuredDesc = document.querySelector('ytd-structured-description-content-renderer, ytd-video-description-transcript-section-renderer');
    let btn = null;
    
    if (structuredDesc) {
      const buttons = Array.from(structuredDesc.querySelectorAll('button, tp-yt-paper-button'));
      btn = buttons.find(b => /show transcript|transcript/i.test(b.textContent) && b.offsetParent !== null);
    }
    
    if (!btn) btn = findClickableByText(/show transcript|transcript/i);
    
    if (btn && btn.offsetParent !== null) {
      log('✓ Found visible button:', btn.textContent.trim().substring(0, 50));
      btn.click();
      await sleep(1000);
      
      if (document.querySelectorAll('ytd-transcript-segment-renderer').length > 0) {
        log('✅ Transcript opened!');
        return true;
      }
    } else {
      log('❌ No visible transcript button found after expansion');
    }
    
    // Method 2: Three-dot menu
    log('Method 2: Trying three-dot menu...');
    const menuBtn = document.querySelector(
      'ytd-menu-renderer yt-icon-button button, ' +
      'ytd-watch-metadata ytd-menu-renderer button[aria-haspopup="true"]'
    );
    
    if (menuBtn) {
      log('✓ Opening menu...');
      menuBtn.click();
      await sleep(500);
      
      const menuItem = findClickableByText(/show transcript|transcript/i);
      if (menuItem) {
        log('✓ Found transcript in menu');
        menuItem.click();
        await sleep(800);
        return true;
      }
      
      // Close menu
      document.body.click();
      await sleep(200);
    }
    
    // Method 3: Engagement panel
    log('Method 3: Checking engagement panels...');
    btn = findClickableByText(/transcript/i);
    if (btn) {
      log('✓ Found engagement panel button');
      btn.click();
      await sleep(800);
      return true;
    }
    
    log('❌ All methods failed');
    return false;
  }
  
  async function scrollTranscript() {
    const container = findTranscriptContainer();
    if (!container) return;
    
    const scroller = container.querySelector('#body, #segments-container, [style*="overflow"]') || container;
    
    let lastCount = 0;
    let stableRounds = 0;
    
    for (let i = 0; i < CONFIG.SCROLL_MAX_LOOPS; i++) {
      const count = document.querySelectorAll('ytd-transcript-segment-renderer').length;
      
      if (count === lastCount) {
        stableRounds++;
      } else {
        stableRounds = 0;
        lastCount = count;
      }
      
      if (stableRounds >= CONFIG.SCROLL_IDLE_ROUNDS) {
        log(`✓ Loaded all segments (${count} total)`);
        break;
      }
      
      try {
        scroller.scrollTop = scroller.scrollHeight;
      } catch (e) {}
      
      await sleep(200);
    }
  }
  
  async function getTranscript() {
    // Check if segments are actually loaded (not just container)
    const existingSegments = document.querySelectorAll('ytd-transcript-segment-renderer').length;
    let text = buildTranscriptText(CONFIG.INCLUDE_TIMESTAMPS);
    
    if (text && existingSegments > 5) {
      log(`✓ Transcript already extracted: ${text.length} chars (${existingSegments} segments)`);
      return text;
    }
    
    if (text && existingSegments === 0) {
      log(`⚠️ Found text (${text.length} chars) but no segments - not a real transcript`);
      text = ''; // Force opening the real transcript
    }
    
    // Try to open with retries
    let opened = false;
    for (let attempt = 1; attempt <= CONFIG.MAX_RETRY_ATTEMPTS; attempt++) {
      log(`Attempt ${attempt}/${CONFIG.MAX_RETRY_ATTEMPTS}`);
      opened = await openTranscriptPanel();
      if (opened) break;
      if (attempt < CONFIG.MAX_RETRY_ATTEMPTS) {
        await sleep(1000);
      }
    }
    
    if (!opened) {
      log('❌ Could not open transcript panel');
      log('💡 Troubleshooting:');
      log('  1. Check if video has captions/transcript available');
      log('  2. Try manually clicking "Show transcript" to see where it is');
      log('  3. Check if Enhancer is hiding/moving the button');
      const container = findTranscriptContainer();
      log('  4. Transcript container found:', !!container);
      return '';
    }
    
    // Wait for segments to load
    log('⏳ Waiting for segments...');
    const waitStart = Date.now();
    while (Date.now() - waitStart < CONFIG.UI_WAIT_MS) {
      const count = document.querySelectorAll('ytd-transcript-segment-renderer').length;
      if (count > 0) {
        log(`✓ Found ${count} segments`);
        break;
      }
      await sleep(200);
    }
    
    // Scroll to load all
    log('📜 Scrolling to load all segments...');
    await scrollTranscript();
    
    text = buildTranscriptText(CONFIG.INCLUDE_TIMESTAMPS);
    log(`✓ Final transcript: ${text.length} chars`);
    return text;
  }
  
  // ====== EVENT HANDLER ======
  async function handleButtonClick() {
    log('🎬 Button clicked!');
    setButtonState('⏳ Working...', true);
    
    try {
      const transcript = await getTranscript();
      
      if (!transcript || !transcript.trim()) {
        log('❌ No transcript available');
        setButtonState('❌ No transcript', true);
        await sleep(2000);
        setButtonState(CONFIG.BTN_TEXT, false);
        return;
      }
      
      const finalText = `${CONFIG.PROMPT_TEXT}\n\n${transcript}`;
      const copied = await copyToClipboard(finalText);
      
      if (copied) {
        log(`✅ Copied ${finalText.length} chars to clipboard`);
        setButtonState('✅ Copied!', true);
        await sleep(1500);
      } else {
        log('❌ Copy failed');
        setButtonState('❌ Copy failed', true);
        await sleep(2000);
      }
      
      setButtonState(CONFIG.BTN_TEXT, false);
      
    } catch (err) {
      log('❌ Error:', err);
      setButtonState('❌ Error', true);
      await sleep(2000);
      setButtonState(CONFIG.BTN_TEXT, false);
    }
  }
  
  // ====== SPA NAVIGATION WATCHER ======
  function watchNavigation() {
    setInterval(() => {
      if (location.href !== state.lastUrl) {
        state.lastUrl = location.href;
        state.autoExtracted = false; // Reset for new video
        log('📍 Navigation detected:', location.pathname);
        setTimeout(injectButton, 500);
        if (CONFIG.AUTO_DETECT_MODE) {
          startTranscriptObserver();
        }
      }
    }, 1000);
  }
  
  // ====== AUTO-DETECT TRANSCRIPT OPENING ======
  function startTranscriptObserver() {
    // Stop existing observer
    if (state.transcriptObserver) {
      state.transcriptObserver.disconnect();
    }
    
    if (!CONFIG.AUTO_DETECT_MODE) return;
    
    log('👁️ Starting transcript auto-detection...');
    
    state.transcriptObserver = new MutationObserver(async (mutations) => {
      // Check if transcript segments appeared
      const segments = document.querySelectorAll('ytd-transcript-segment-renderer');
      
      if (segments.length > 5 && !state.autoExtracted) {
        log(`🎉 Detected transcript opened! (${segments.length} segments)`);
        state.autoExtracted = true;
        
        // Wait a bit for all segments to load
        await sleep(1000);
        
        // Auto-scroll to load all segments
        log('📜 Auto-scrolling to load all segments...');
        await scrollTranscript();
        
        // Extract and show notification
        const text = buildTranscriptText(CONFIG.INCLUDE_TIMESTAMPS);
        if (text) {
          log(`✅ Auto-extracted: ${text.length} chars`);
          if (state.button) {
            const originalText = state.button.textContent;
            state.button.textContent = '✅ Ready to copy!';
            state.button.style.background = 'linear-gradient(135deg, #11998e 0%, #38ef7d 100%)';
            setTimeout(() => {
              if (state.button) {
                state.button.textContent = originalText;
                state.button.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
              }
            }, 3000);
          }
        }
      }
    });
    
    // Observe the entire page for transcript elements
    state.transcriptObserver.observe(document.body, {
      childList: true,
      subtree: true
    });
  }
  
  // ====== INITIALIZATION ======
  function init() {
    log('='.repeat(60));
    log('🚀 Enhancer for YouTube - Transcript Copy Script');
    log('='.repeat(60));
    log('📍 Page:', location.href);
    log('⚙️ Debug mode:', CONFIG.DEBUG_MODE ? 'ON' : 'OFF');
    log('🤖 Auto-detect mode:', CONFIG.AUTO_DETECT_MODE ? 'ON' : 'OFF');
    
    // Delayed injection to let Enhancer finish its setup
    setTimeout(() => {
      log('✓ Initializing button injection...');
      injectButton();
      watchNavigation();
      
      if (CONFIG.AUTO_DETECT_MODE) {
        startTranscriptObserver();
        log('✓ Auto-detection enabled - transcript will be detected when you open it');
      }
      
      log('✅ Script ready!');
      log('💡 Look for the', CONFIG.BTN_TEXT, 'button in the top bar');
      if (CONFIG.AUTO_DETECT_MODE) {
        log('💡 Or just click "Show transcript" on YouTube - it will auto-extract!');
      }
      log('='.repeat(60));
    }, CONFIG.INIT_DELAY);
  }
  
  // Start when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  
})();
