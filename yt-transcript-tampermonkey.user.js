// ==UserScript==
// @name         YouTube Transcript Copy
// @namespace    https://github.com/amarinne/yt-transcipt-copy
// @version      1.0.0
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
  
  function extractSegments() {
    const segments = document.querySelectorAll('ytd-transcript-segment-renderer');
    if (!segments.length) return [];
    
    return Array.from(segments)
      .map(seg => {
        const tsEl = seg.querySelector('.segment-timestamp, [class*="timestamp"]');
        const txEl = seg.querySelector('.segment-text, [class*="segment-text"]');
        const ts = tsEl ? clean(tsEl.textContent) : '';
        let tx = txEl ? clean(txEl.textContent) : clean(seg.textContent);
        if (ts && tx.startsWith(ts)) tx = clean(tx.slice(ts.length));
        return { ts, tx };
      })
      .filter(x => x.tx);
  }
  
  function buildTranscriptText(includeTimestamps) {
    const segments = extractSegments();
    if (segments.length) {
      return segments
        .map(({ ts, tx }) => (includeTimestamps && ts ? `${ts} ${tx}` : tx))
        .join(' ')
        .trim();
    }
    
    const container = document.querySelector('ytd-transcript-renderer');
    if (container) {
      return clean(container.innerText).replace(/\n+/g, ' ');
    }
    return '';
  }
  
  async function openTranscriptPanel() {
    const existingSegments = document.querySelectorAll('ytd-transcript-segment-renderer').length;
    if (existingSegments > 0) return true;
    
    // Step 1: Expand description first
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
    
    // Step 2: Look for transcript button in expanded description
    const buttonSelectors = [
      'ytd-structured-description-content-renderer button',
      'ytd-video-description-transcript-section-renderer button',
      '#structured-description button'
    ];
    
    for (const selector of buttonSelectors) {
      const buttons = Array.from(document.querySelectorAll(selector));
      const btn = buttons.find(b => 
        /show transcript|transcript/i.test(b.textContent) && 
        b.offsetParent !== null
      );
      
      if (btn) {
        btn.click();
        await sleep(1200);
        
        if (document.querySelectorAll('ytd-transcript-segment-renderer').length > 0) {
          return true;
        }
      }
    }
    
    return false;
  }
  
  async function scrollTranscript() {
    const container = document.querySelector('ytd-transcript-renderer');
    if (!container) return;
    
    const scroller = container.querySelector('#body, #segments-container') || container;
    let lastCount = 0, stableRounds = 0;
    
    for (let i = 0; i < 80; i++) {
      const count = document.querySelectorAll('ytd-transcript-segment-renderer').length;
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
    const existingSegments = document.querySelectorAll('ytd-transcript-segment-renderer').length;
    let text = buildTranscriptText(CONFIG.INCLUDE_TIMESTAMPS);
    
    if (text && existingSegments > 5) return text;
    if (text && existingSegments === 0) text = '';
    
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
