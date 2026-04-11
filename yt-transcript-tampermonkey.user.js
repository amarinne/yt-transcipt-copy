// ==UserScript==
// @name         YouTube Transcript Copy
// @namespace    https://github.com/amarinne/yt-transcipt-copy
// @version      1.1.1
// @description  One-click YouTube transcript extraction with custom prompt
// @author       amarinne
// @match        https://www.youtube.com/*
// @match        https://youtube.com/*
// @grant        GM_setClipboard
// @run-at       document-end
// @icon         https://www.google.com/s2/favicons?sz=64&domain=youtube.com
// ==/UserScript==

(function() {
  'use strict';
  
  const CONFIG = {
    PROMPT_TEXT: `Summarize the following youtube script in paragraphs, each containting bullet points. give bullet points tldr at the beginning. also give the speakers sentiment throughout the script.`,
    INCLUDE_TIMESTAMPS: false,
    BTN_TEXT: "Copy Transcript"
  };
  
  const state = { button: null, lastUrl: location.href };
  
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const clean = (s) => (s || '').replace(/\r/g, '').replace(/[ \t]+\n/g, '\n').replace(/\n[ \t]+/g, '\n').trim();
  const isWatchPage = () => location.pathname === '/watch';
  
  function createButton() {
    const btn = document.createElement('button');
    btn.textContent = CONFIG.BTN_TEXT;
    btn.style.cssText = `
      margin: 0 8px; padding: 0 12px; height: 36px; border: none; border-radius: 18px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white; font-size: 13px; font-weight: 600; cursor: pointer;
      transition: all 0.2s ease; box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      white-space: nowrap; z-index: 9999;
    `;
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
      if (state.button) state.button.remove();
      return;
    }
    if (state.button && document.body.contains(state.button)) return;
    
    const mountPoints = ['#masthead #end', '#masthead #start', 'ytd-masthead #end'];
    for (const selector of mountPoints) {
      const container = document.querySelector(selector);
      if (container) {
        state.button = createButton();
        if (container.firstChild) {
          container.insertBefore(state.button, container.firstChild);
        } else {
          container.appendChild(state.button);
        }
        break;
      }
    }
  }
  
  function getTranscriptSegments() {
    const modernSegments = Array.from(document.querySelectorAll('transcript-segment-view-model, .ytwTranscriptSegmentViewModelHost'));
    if (modernSegments.length) return modernSegments;

    const legacySegments = Array.from(document.querySelectorAll('ytd-transcript-segment-renderer'));
    if (legacySegments.length) return legacySegments;

    return [];
  }

  function extractSegments() {
    const segments = getTranscriptSegments();
    if (!segments.length) return [];

    return segments
      .map(seg => {
        const tsEl =
          seg.querySelector('.ytwTranscriptSegmentViewModelTimestampA11yLabel') ||
          seg.querySelector('.ytwTranscriptSegmentViewModelTimestamp') ||
          seg.querySelector('.segment-timestamp, [class*="timestamp"]');
        const txEl =
          seg.querySelector("span[role='text']") ||
          seg.querySelector('.ytAttributedStringHost') ||
          seg.querySelector('span.yt-core-attributed-string') ||
          seg.querySelector('.segment-text, [class*="segment-text"]');

        const ts = tsEl ? clean(tsEl.textContent) : '';
        let tx = txEl ? clean(txEl.textContent) : clean(seg.textContent);
        if (!tx && seg.children.length) {
          tx = clean(Array.from(seg.children).map((child) => child.textContent).join(' '));
        }
        if (ts && tx.startsWith(ts)) tx = clean(tx.slice(ts.length));
        return { ts, tx };
      })
      .filter(x => x.tx);
  }

  function hasTranscriptSegments() {
    return document.querySelectorAll('transcript-segment-view-model, .ytwTranscriptSegmentViewModelHost').length > 0 ||
           document.querySelectorAll('ytd-transcript-segment-renderer').length > 0;
  }
  
  function buildTranscriptText(includeTimestamps) {
    const segments = extractSegments();
    if (segments.length) {
      return segments
        .map(({ ts, tx }) => (includeTimestamps && ts ? `${ts} ${tx}` : tx))
        .join(' ')
        .trim();
    }

    // New panel fallback
    const newPanel = document.querySelector('[target-id="PAmodern_transcript_view"]');
    if (newPanel) {
      return clean(newPanel.innerText).replace(/\n+/g, ' ');
    }
    
    // Legacy fallback
    const container = document.querySelector('ytd-transcript-renderer');
    if (container) {
      return clean(container.innerText).replace(/\n+/g, ' ');
    }
    return '';
  }
  
  async function openTranscriptPanel() {
    if (hasTranscriptSegments()) return true;

    // Strategy 1: New DOM – look for chip or button with aria-label="Transcript"
    // directly clickable without expanding description
    const directSelectors = [
      'button[aria-label="Transcript"]',
      'chip-view-model button[aria-label="Transcript"]',
    ];
    for (const sel of directSelectors) {
      const btn = document.querySelector(sel);
      if (btn && btn.offsetParent !== null) {
        btn.click();
        await sleep(1500);
        if (hasTranscriptSegments()) return true;
      }
    }
    
    // Strategy 2: Expand description first
    const descriptionSelectors = [
      'ytd-text-inline-expander[slot="content"]',
      'ytd-watch-metadata #description',
      '#description.ytd-watch-metadata',
      'ytd-video-description-header-renderer',
      '#description-inline-expander'
    ];
    
    for (const selector of descriptionSelectors) {
      const descArea = document.querySelector(selector);
      if (descArea && descArea.offsetParent !== null) {
        descArea.click();
        await sleep(1200);
        break;
      }
    }
    
    // Strategy 3: Look for transcript button in expanded description
    const buttonSelectors = [
      'ytd-video-description-transcript-section-renderer button',
      'ytd-structured-description-content-renderer button',
      '#structured-description button'
    ];
    
    for (const selector of buttonSelectors) {
      const buttons = Array.from(document.querySelectorAll(selector));
      const btn = buttons.find(b => 
        b.offsetParent !== null &&
        (/show transcript|transcript/i.test(b.textContent) || 
         /show transcript|transcript/i.test(b.getAttribute('aria-label') || ''))
      );
      
      if (btn) {
        btn.click();
        await sleep(1500);
        if (hasTranscriptSegments()) return true;
      }
    }

    // Strategy 4: Broader search for any visible "show transcript" button
    const allButtons = Array.from(document.querySelectorAll('button'));
    const transcriptBtn = allButtons.find(b =>
      b.offsetParent !== null &&
      (/show transcript/i.test(b.textContent) || /show transcript/i.test(b.getAttribute('aria-label') || ''))
    );
    if (transcriptBtn) {
      transcriptBtn.click();
      await sleep(1500);
      if (hasTranscriptSegments()) return true;
    }
    
    return false;
  }
  
  async function scrollTranscript() {
    // New DOM: panel is [target-id="PAmodern_transcript_view"]
    // Legacy DOM: ytd-transcript-renderer
    const panel = document.querySelector('[target-id="PAmodern_transcript_view"]') ||
                  document.querySelector('ytd-transcript-renderer');
    if (!panel) return;
    
    const scroller = panel.querySelector('#body, #segments-container, .ytd-transcript-renderer') || panel;
    let lastCount = 0, stableRounds = 0;
    
    for (let i = 0; i < 80; i++) {
      const count = getTranscriptSegments().length;
      if (count === lastCount) {
        stableRounds++;
        if (stableRounds >= 5) break;
      } else {
        stableRounds = 0;
        lastCount = count;
      }
      try { scroller.scrollTop = scroller.scrollHeight; } catch (e) {}
      await sleep(200);
    }
  }
  
  async function getTranscript() {
    let text = buildTranscriptText(CONFIG.INCLUDE_TIMESTAMPS);
    const segCount = getTranscriptSegments().length;
    
    if (text && segCount > 5) return text;
    if (text && segCount === 0) text = '';
    
    const opened = await openTranscriptPanel();
    if (!opened) return '';
    
    await sleep(1000);
    await scrollTranscript();
    
    return buildTranscriptText(CONFIG.INCLUDE_TIMESTAMPS);
  }
  
  async function copyToClipboard(text) {
    try {
      // Try GM_setClipboard first (Tampermonkey)
      if (typeof GM_setClipboard !== 'undefined') {
        GM_setClipboard(text);
        return true;
      }
      
      // Fallback to navigator.clipboard
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
      
      // Final fallback
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;left:-9999px;top:0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch (err) {
      return false;
    }
  }
  
  async function handleButtonClick() {
    if (!state.button) return;
    const originalText = state.button.textContent;
    state.button.textContent = '⏳ Working...';
    state.button.disabled = true;
    state.button.style.opacity = '0.6';
    
    try {
      const transcript = await getTranscript();
      
      if (!transcript || !transcript.trim()) {
        state.button.textContent = '❌ No transcript';
        await sleep(2000);
      } else {
        const finalText = `${CONFIG.PROMPT_TEXT}\n\n${transcript}`;
        const copied = await copyToClipboard(finalText);
        
        if (copied) {
          const wordCount = finalText.trim().split(/\s+/).length;
          state.button.textContent = `✅ ${wordCount} words copied`;
          await sleep(10000);
        } else {
          state.button.textContent = '❌ Copy failed';
          await sleep(2000);
        }
      }
    } catch (err) {
      state.button.textContent = '❌ Error';
      await sleep(2000);
    }
    
    state.button.textContent = originalText;
    state.button.disabled = false;
    state.button.style.opacity = '1';
  }
  
  function watchNavigation() {
    setInterval(() => {
      if (location.href !== state.lastUrl) {
        state.lastUrl = location.href;
        setTimeout(injectButton, 500);
      }
    }, 1000);
  }
  
  function init() {
    setTimeout(() => {
      injectButton();
      watchNavigation();
    }, 1500);
  }
  
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  
})();
