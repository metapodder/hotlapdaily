"use client";
import Script from "next/script";
import { useEffect } from "react";

declare global {
  interface Window {
    __hotlapInitGame?: () => void;
    __hotlapGameInstance?: {
      getRaceIdDriverName?: () => string | null;
    };
    __hotlapInitialized?: boolean;
    __hotlapInitInProgress?: boolean;
  }
}

export default function Home() {
  useEffect(() => {
    // Show loading screen initially
    const loadingScreen = document.getElementById('loadingScreen');
    if (loadingScreen) {
      loadingScreen.classList.remove('hidden');
    }

    // Handle top banner dismiss
    const topBanner = document.getElementById('top-banner');
    const closeTopBanner = document.getElementById('close-top-banner');
    
    // Check if banner was previously dismissed
    try {
      const bannerDismissed = localStorage.getItem('hotlapdaily_top_banner_dismissed');
      if (bannerDismissed === 'true' && topBanner) {
        topBanner.style.display = 'none';
      }
    } catch {}

    const handleBannerClose = () => {
      try {
        localStorage.setItem('hotlapdaily_top_banner_dismissed', 'true');
      } catch {}
      if (topBanner) {
        topBanner.style.display = 'none';
      }
    };

    if (closeTopBanner) {
      closeTopBanner.addEventListener('click', handleBannerClose);
    }

    try {
      if (typeof window !== 'undefined') {
        // Check for URL parameters
        const urlParams = new URLSearchParams(window.location.search);
        const raceId = urlParams.get('raceId');
        const trackId = urlParams.get('trackId');
        const testMode = urlParams.get('testMode') === 'true';
        
        if (testMode) {
          localStorage.setItem('hotlapdaily_test_mode', 'true');
          // Set default checkpoint opacity if not already set
          if (!localStorage.getItem('hotlapdaily_test_checkpoint_opacity')) {
            localStorage.setItem('hotlapdaily_test_checkpoint_opacity', '0.5');
          }
        }

        // Force a fresh init on client-side navigations back to "/"
        // Game handles ?trackId= and ?track= internally via practice mode path
        window.__hotlapGameInstance = undefined;
        try { window.__hotlapInitialized = false; } catch {}
        try { window.__hotlapInitInProgress = false; } catch {}
        try { window.dispatchEvent(new Event('DOMContentLoaded')); } catch {}
        try { window.dispatchEvent(new Event('load')); } catch {}
        if (typeof window.__hotlapInitGame === 'function') {
          window.__hotlapInitGame();
        }
        
        // If raceId is present, load the ghost car after game initialization
        if (raceId) {
          try {
            localStorage.setItem('hotlapdaily_race_id', raceId);
          } catch {}
        }

        // If viewing a historical track (not today's), show practice banner
        if (trackId && !testMode) {
          const tagline = document.querySelector('.tagline');
          if (tagline) {
            tagline.textContent = `Track ${trackId} — practice mode`;
          }
          const nextTrackEl = document.getElementById('next-track-time');
          if (nextTrackEl) {
            nextTrackEl.innerHTML = '<span style="color:#ffaa00;font-weight:600;">⚠ Times will not be recorded on past tracks</span>';
          }
        }
      }
    } catch {}

    // Hide loading screen after a short delay to show the pulsating effect
    setTimeout(() => {
      if (loadingScreen) {
        loadingScreen.classList.add('hidden');
      }
    }, 2000); // Show loading for 2 seconds

    // Check for test mode and show banner
    const testTrackBanner = document.getElementById('test-track-banner');
    const submitTestTrackBtn = document.getElementById('submit-test-track-btn');
    const exitTestModeBtn = document.getElementById('exit-test-mode-btn');
    const nextTrackTime = document.getElementById('next-track-time');
    
    // Submit track modal functionality
    const submitTrackModal = document.getElementById('submitTrackModal');
    const closeSubmitTrackModal = document.getElementById('closeSubmitTrackModal');
    const submitTrackNameInput = document.getElementById('submitTrackNameInput') as HTMLInputElement;
    const submitTrackModalBtn = document.getElementById('submitTrackModalBtn') as HTMLButtonElement | null;
    const submitTrackStatusMsg = document.getElementById('submitTrackStatusMsg');
    
    const openSubmitTrackModal = () => {
      if (submitTrackModal) {
        submitTrackModal.classList.add('show');
        const savedTrackName = localStorage.getItem('hotlapdaily_track_name');
        if (savedTrackName && submitTrackNameInput) {
          submitTrackNameInput.value = savedTrackName;
        }
        if (submitTrackNameInput) submitTrackNameInput.focus();
        if (submitTrackStatusMsg) {
          submitTrackStatusMsg.textContent = '';
          submitTrackStatusMsg.className = '';
        }
        if (submitTrackModalBtn) {
          submitTrackModalBtn.disabled = false;
          submitTrackModalBtn.textContent = 'Submit to Hotlap Daily';
        }
      }
    };
    
    const closeSubmitTrackModalFunc = () => {
      if (submitTrackModal) {
        submitTrackModal.classList.remove('show');
      }
    };
    
    const checkIsMobile = () => window.innerWidth <= 768;
    
    const checkTestMode = () => {
      try {
        // Check for URL parameter - only show test mode UI if ?testMode=true is in URL
        const urlParams = new URLSearchParams(window.location.search);
        const urlTestMode = urlParams.get('testMode') === 'true';
        const testMode = localStorage.getItem('hotlapdaily_test_mode');
        const mobile = checkIsMobile();
        const shareButton = document.getElementById('shareButton');
        
        // Only activate test mode UI if BOTH URL param AND localStorage are set
        if (urlTestMode && testMode === 'true') {
          // Hide banner on mobile, show on desktop
          if (testTrackBanner) {
            testTrackBanner.style.display = mobile ? 'none' : 'block';
          }
          
          // Hide LAP DROP button in test mode
          if (shareButton) {
            shareButton.style.display = 'none';
          }

          // Wire up checkpoint % slider
          const cpSlider = document.getElementById('testCheckpointSlider') as HTMLInputElement;
          const cpDisplay = document.getElementById('testCheckpointDisplay');
          if (cpSlider && !cpSlider.dataset.bound) {
            cpSlider.dataset.bound = 'true';
            // Load saved value
            const saved = localStorage.getItem('hotlapdaily_test_checkpoint_pct');
            if (saved) {
              cpSlider.value = saved;
              if (cpDisplay) cpDisplay.textContent = saved + '%';
            }
            // Apply to game on load
            const applyToGame = () => {
              const pct = parseInt(cpSlider.value) || 0;
              localStorage.setItem('hotlapdaily_test_checkpoint_pct', String(pct));
              if (cpDisplay) cpDisplay.textContent = pct + '%';
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const gi = (window as any).__hotlapGameInstance;
              if (gi && gi.antiCheat) {
                gi.antiCheat.minimumCheckpointsRequired = pct / 100;
              }
            };
            cpSlider.addEventListener('input', applyToGame);
            // Apply on initial load (retry until game is ready)
            const tryApply = () => {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const gi = (window as any).__hotlapGameInstance;
              if (gi && gi.antiCheat) {
                const pct = parseInt(cpSlider.value) || 50;
                gi.antiCheat.minimumCheckpointsRequired = pct / 100;
              } else {
                setTimeout(tryApply, 500);
              }
            };
            setTimeout(tryApply, 1000);
          }

          // Wire up checkpoint opacity slider
          const opSlider = document.getElementById('testCpOpacitySlider') as HTMLInputElement;
          const opDisplay = document.getElementById('testCpOpacityDisplay');
          if (opSlider && !opSlider.dataset.bound) {
            opSlider.dataset.bound = 'true';
            const savedOp = localStorage.getItem('hotlapdaily_test_checkpoint_opacity');
            if (savedOp) {
              opSlider.value = String(Math.round(parseFloat(savedOp) * 100));
              if (opDisplay) opDisplay.textContent = opSlider.value + '%';
            }
            opSlider.addEventListener('input', () => {
              const val = parseInt(opSlider.value) || 0;
              localStorage.setItem('hotlapdaily_test_checkpoint_opacity', String(val / 100));
              if (opDisplay) opDisplay.textContent = val + '%';
            });
          }

          // On mobile, show "** Test Track **" label above and put controls below the game
          if (mobile && nextTrackTime) {
            const existingSubmitBtn = document.getElementById('mobile-test-submit-btn');
            if (!existingSubmitBtn) {
              const savedPct = localStorage.getItem('hotlapdaily_test_checkpoint_pct') || '50';
              const savedOp = localStorage.getItem('hotlapdaily_test_checkpoint_opacity') || '0.5';
              const savedOpPct = Math.round(parseFloat(savedOp) * 100);
              nextTrackTime.innerHTML = `<span style="font-weight: bold;">** Test Track **</span>`;
              const bottomControls = document.getElementById('mobile-test-controls-bottom');
              if (bottomControls) {
                bottomControls.style.display = 'block';
                bottomControls.innerHTML = `
                  <div style="text-align: center;">
                    <button id="mobile-test-submit-btn" class="pixel-button" style="padding: 4px 12px; font-size: 12px; display: inline-block;">
                      Submit Track
                    </button>
                    <div style="margin-top: 6px; display: flex; align-items: center; gap: 6px; justify-content: center; flex-wrap: wrap;">
                      <label style="font-size: 11px; white-space: nowrap;">Min CP:</label>
                      <input type="range" id="mobileCheckpointSlider" min="0" max="100" step="5" value="${savedPct}" style="width: 100px; cursor: pointer; accent-color: #ffc107;" />
                      <span id="mobileCheckpointDisplay" style="font-size: 11px; font-weight: bold; min-width: 30px;">${savedPct}%</span>
                    </div>
                    <div style="margin-top: 4px; display: flex; align-items: center; gap: 6px; justify-content: center; flex-wrap: wrap;">
                      <label style="font-size: 11px; white-space: nowrap;">Show CP:</label>
                      <input type="range" id="mobileCpOpacitySlider" min="0" max="100" step="5" value="${savedOpPct}" style="width: 100px; cursor: pointer; accent-color: #ff4444;" />
                      <span id="mobileCpOpacityDisplay" style="font-size: 11px; font-weight: bold; min-width: 30px;">${savedOpPct}%</span>
                    </div>
                  </div>
                `;
              }
              const mobileSubmitBtn = document.getElementById('mobile-test-submit-btn');
              if (mobileSubmitBtn) {
                mobileSubmitBtn.addEventListener('click', () => {
                  openSubmitTrackModal();
                });
              }
              const mobileCpSlider = document.getElementById('mobileCheckpointSlider') as HTMLInputElement;
              const mobileCpDisplay = document.getElementById('mobileCheckpointDisplay');
              if (mobileCpSlider) {
                mobileCpSlider.addEventListener('input', () => {
                  const pct = parseInt(mobileCpSlider.value) || 0;
                  localStorage.setItem('hotlapdaily_test_checkpoint_pct', String(pct));
                  if (mobileCpDisplay) mobileCpDisplay.textContent = pct + '%';
                  const desktopSlider = document.getElementById('testCheckpointSlider') as HTMLInputElement;
                  const desktopDisplay = document.getElementById('testCheckpointDisplay');
                  if (desktopSlider) desktopSlider.value = String(pct);
                  if (desktopDisplay) desktopDisplay.textContent = pct + '%';
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  const gi = (window as any).__hotlapGameInstance;
                  if (gi && gi.antiCheat) {
                    gi.antiCheat.minimumCheckpointsRequired = pct / 100;
                  }
                });
              }
              const mobileOpSlider = document.getElementById('mobileCpOpacitySlider') as HTMLInputElement;
              const mobileOpDisplay = document.getElementById('mobileCpOpacityDisplay');
              if (mobileOpSlider) {
                mobileOpSlider.addEventListener('input', () => {
                  const val = parseInt(mobileOpSlider.value) || 0;
                  localStorage.setItem('hotlapdaily_test_checkpoint_opacity', String(val / 100));
                  if (mobileOpDisplay) mobileOpDisplay.textContent = val + '%';
                  const deskOpSlider = document.getElementById('testCpOpacitySlider') as HTMLInputElement;
                  const deskOpDisplay = document.getElementById('testCpOpacityDisplay');
                  if (deskOpSlider) deskOpSlider.value = String(val);
                  if (deskOpDisplay) deskOpDisplay.textContent = val + '%';
                });
              }
            }
          } else if (!mobile && nextTrackTime) {
            // Restore original content on desktop (game will update it)
            const existingSubmitBtn = document.getElementById('mobile-test-submit-btn');
            if (existingSubmitBtn) {
              nextTrackTime.innerHTML = '<span className="icon">⏱</span> <span id="next-track-label">Next track in...</span>';
              const bottomControls = document.getElementById('mobile-test-controls-bottom');
              if (bottomControls) bottomControls.style.display = 'none';
            }
          }
        } else {
          // Not in test mode
          if (testTrackBanner) {
            testTrackBanner.style.display = 'none';
          }
          const mobileBottomControls = document.getElementById('mobile-test-controls-bottom');
          if (mobileBottomControls) mobileBottomControls.style.display = 'none';
          // Show LAP DROP button when not in test mode (game will control its visibility)
          if (shareButton) {
            // Don't force show, let the game control it
          }
          if (nextTrackTime) {
            const existingSubmitBtn = document.getElementById('mobile-test-submit-btn');
            if (existingSubmitBtn) {
              nextTrackTime.innerHTML = '<span className="icon">⏱</span> <span id="next-track-label">Next track in...</span>';
            }
          }
        }
      } catch {}
    };
    
    checkTestMode();
    
    // Update on window resize
    const handleTestModeResize = () => {
      checkTestMode();
    };
    window.addEventListener('resize', handleTestModeResize);
    
    const submitTestTrack = async () => {
      const name = submitTrackNameInput ? submitTrackNameInput.value.trim() : '';
      if (!name) {
        if (submitTrackStatusMsg) {
          submitTrackStatusMsg.textContent = '⚠️ Please enter your name.';
          submitTrackStatusMsg.className = 'status-error';
        }
        return;
      }
      
      const testTrackCode = localStorage.getItem('hotlapdaily_test_track_code');
      if (!testTrackCode) {
        if (submitTrackStatusMsg) {
          submitTrackStatusMsg.textContent = '⚠️ No test track found.';
          submitTrackStatusMsg.className = 'status-error';
        }
        return;
      }
      
      if (submitTrackModalBtn && submitTrackStatusMsg) {
        submitTrackModalBtn.disabled = true;
        submitTrackModalBtn.textContent = 'Submitting...';
        submitTrackStatusMsg.textContent = '⏳ Submitting track...';
        submitTrackStatusMsg.className = 'status-loading';
      }
      
      try {
        const response = await fetch(`/api/submit-track`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ name, code: testTrackCode })
        });
        
        if (response.ok) {
          if (submitTrackStatusMsg) {
            submitTrackStatusMsg.textContent = '🎉 Track submitted successfully!';
            submitTrackStatusMsg.className = 'status-success';
          }
          if (name) {
            localStorage.setItem('hotlapdaily_track_name', name);
          }
          setTimeout(() => {
            closeSubmitTrackModalFunc();
            // Clear test mode and reload
            localStorage.removeItem('hotlapdaily_test_mode');
            localStorage.removeItem('hotlapdaily_test_track_code');
            window.location.reload();
          }, 2000);
        } else {
          const errorText = await response.text();
          console.error('Submission failed:', errorText);
          if (submitTrackStatusMsg) {
            submitTrackStatusMsg.textContent = '⚠️ Submission failed. Please try again.';
            submitTrackStatusMsg.className = 'status-error';
          }
          if (submitTrackModalBtn) {
            submitTrackModalBtn.textContent = 'Retry Submission';
            submitTrackModalBtn.disabled = false;
          }
        }
      } catch (error) {
        console.error('Submission error:', error);
        if (submitTrackStatusMsg) {
          submitTrackStatusMsg.textContent = '⚠️ Network error. Please check your connection and try again.';
          submitTrackStatusMsg.className = 'status-error';
        }
        if (submitTrackModalBtn) {
          submitTrackModalBtn.textContent = 'Retry Submission';
          submitTrackModalBtn.disabled = false;
        }
      }
    };
    
    // Handle submit test track button (desktop)
    if (submitTestTrackBtn) {
      submitTestTrackBtn.addEventListener('click', () => {
        openSubmitTrackModal();
      });
    }
    
    // Handle modal close
    if (closeSubmitTrackModal) {
      closeSubmitTrackModal.addEventListener('click', closeSubmitTrackModalFunc);
    }
    
    // Close modal when clicking outside
    if (submitTrackModal) {
      submitTrackModal.addEventListener('click', (event) => {
        if (event.target === submitTrackModal) {
          closeSubmitTrackModalFunc();
        }
      });
    }
    
    // Handle modal submit button
    if (submitTrackModalBtn) {
      submitTrackModalBtn.addEventListener('click', submitTestTrack);
    }
    
    // Handle exit test mode button
    if (exitTestModeBtn) {
      exitTestModeBtn.addEventListener('click', () => {
        try {
          localStorage.removeItem('hotlapdaily_test_mode');
          localStorage.removeItem('hotlapdaily_test_track_code');
          // Remove testMode param from URL and reload
          const url = new URL(window.location.href);
          url.searchParams.delete('testMode');
          window.location.href = url.toString();
        } catch {}
      });
    }

    const teamSelect = document.getElementById('teamSelect') as HTMLSelectElement | null;
    const selectArrow = document.getElementById('selectArrow');
    const constructorModal = document.getElementById('constructorModal');
    const constructorModalClose = document.getElementById('constructorModalClose');
    const constructorOptions = Array.from(document.querySelectorAll<HTMLButtonElement>('.constructor-option'));
    const customSelectContainer = teamSelect?.parentElement;

    if (!teamSelect || !selectArrow || !constructorModal || !constructorModalClose || !customSelectContainer) return;

    // Handle select placeholder state - Mobile only
    const isMobile = () => window.innerWidth <= 768;
    
    const updatePlaceholderState = () => {
      if (!isMobile()) return; // Only apply on mobile
      
      // Remove existing prefix element if it exists
      const existingPrefix = customSelectContainer.querySelector('.constructor-prefix');
      if (existingPrefix) {
        existingPrefix.remove();
      }

      if (teamSelect.value) {
        customSelectContainer.classList.add('has-value');
        
        // Removed prefix element creation to prevent overlapping on mobile
        console.log('Added has-value class, current value:', teamSelect.value);
      } else {
        customSelectContainer.classList.remove('has-value');
        console.log('Removed has-value class');
      }
    };

    // Set initial state and listen for changes
    teamSelect.value = 'ferrari'; // Set default for game functionality
    updatePlaceholderState();
    teamSelect.addEventListener('change', updatePlaceholderState);

    // Hide prefix on focus/hover - Mobile only
    const hidePrefixOnInteraction = () => {
      if (!isMobile()) return;
      const prefix = customSelectContainer.querySelector('.constructor-prefix');
      if (prefix) {
        (prefix as HTMLElement).style.opacity = '0';
      }
    };

    const showPrefixAfterInteraction = () => {
      if (!isMobile()) return;
      const prefix = customSelectContainer.querySelector('.constructor-prefix');
      if (prefix) {
        (prefix as HTMLElement).style.opacity = '1';
      }
    };

    teamSelect.addEventListener('focus', hidePrefixOnInteraction);
    teamSelect.addEventListener('mouseenter', hidePrefixOnInteraction);
    teamSelect.addEventListener('blur', showPrefixAfterInteraction);
    teamSelect.addEventListener('mouseleave', showPrefixAfterInteraction);

    // Utility to position the toggle flush with the bottom edge of the stats bar
    const positionToggleRelativeToStats = () => {
      const toggleButton = document.getElementById('mobile-stats-toggle') as HTMLElement | null;
      const mobileStats = document.getElementById('mobile-top-stats') as HTMLElement | null;
      if (!toggleButton || !mobileStats) return;

      // If stats are hidden or collapsed, keep toggle at a small top offset
      const isHidden = mobileStats.style.display === 'none';
      const isCollapsed = mobileStats.classList.contains('collapsed');
      if (isHidden) {
        try { toggleButton.style.setProperty('top', '0.5rem', 'important'); } catch { toggleButton.style.top = '0.5rem'; }
        return;
      }

      // When collapsed, pin to top-left to avoid overlapping the floating timer on the right
      if (isCollapsed) {
        try { toggleButton.style.setProperty('top', '0.5rem', 'important'); } catch { toggleButton.style.top = '0.5rem'; }
        try { toggleButton.style.setProperty('left', '0.5rem', 'important'); } catch { toggleButton.style.left = '0.5rem'; }
        try { toggleButton.style.setProperty('right', 'auto', 'important'); } catch { toggleButton.style.right = 'auto'; }
        return;
      }

      // Otherwise, place the toggle exactly at the bar's height so it hugs the bottom edge
      const heightPx = mobileStats.offsetHeight || 0;
      try { toggleButton.style.setProperty('top', `${Math.max(0, heightPx-10)}px`, 'important'); } catch { toggleButton.style.top = `${Math.max(0, heightPx)}px`; }
      // Ensure right side in expanded mode
      try { toggleButton.style.setProperty('right', '0.5rem', 'important'); } catch { toggleButton.style.right = '0.5rem'; }
      try { toggleButton.style.setProperty('left', 'auto', 'important'); } catch { toggleButton.style.left = 'auto'; }
    };

    // Handle window resize to update mobile state
    const handleResize = () => {
      updatePlaceholderState();
      updateMobileStatsVisibility();
      positionToggleRelativeToStats();
    };
    window.addEventListener('resize', handleResize);

    // Mobile stats visibility handler
    let statsResizeObserver: ResizeObserver | null = null;
    const updateMobileStatsVisibility = () => {
      const isMobile = window.innerWidth <= 768;
      const mobileStats = document.getElementById('mobile-top-stats');
      const toggleButton = document.getElementById('mobile-stats-toggle');
      
      console.log('Mobile check:', isMobile, 'Stats element:', !!mobileStats, 'Toggle element:', !!toggleButton);
      
      if (mobileStats && toggleButton) {
        if (isMobile) {
          mobileStats.style.display = 'grid';
          toggleButton.style.display = 'flex';
          toggleButton.style.visibility = 'visible';
          console.log('Showing mobile elements');
          // Restore collapsed state from localStorage
          const isCollapsed = localStorage.getItem('mobileStatsCollapsed') === 'true';
          if (isCollapsed) {
            mobileStats.classList.add('collapsed');
          }
          // Observe and react to size changes to keep the toggle pinned to the bottom edge
          try {
            if (typeof ResizeObserver !== 'undefined' && !statsResizeObserver) {
              statsResizeObserver = new ResizeObserver(() => positionToggleRelativeToStats());
              statsResizeObserver.observe(mobileStats);
            }
          } catch {}
          // Initial position
          positionToggleRelativeToStats();
        } else {
          mobileStats.style.display = 'none';
          toggleButton.style.display = 'none';
          console.log('Hiding mobile elements');
          if (statsResizeObserver) {
            try { statsResizeObserver.disconnect(); } catch {}
            statsResizeObserver = null;
          }
        }
      } else {
        console.log('Missing elements - Stats:', !!mobileStats, 'Toggle:', !!toggleButton);
      }
    };

    // Mobile stats collapse/expand functionality
    const setupMobileStatsToggle = () => {
      const toggleButton = document.getElementById('mobile-stats-toggle');
      const mobileStats = document.getElementById('mobile-top-stats');
      
      if (!toggleButton || !mobileStats) return;

      const updateToggleButton = (isCollapsed: boolean) => {
        if (isCollapsed) {
          toggleButton.innerHTML = '<img src="/caret.svg" alt="expand" style="width: 8px; height: 6px; transform: rotate(0deg);" />'; // Down caret to expand
          toggleButton.title = 'Expand stats';
        } else {
          toggleButton.innerHTML = '<img src="/caret.svg" alt="minimize" style="width: 8px; height: 6px; transform: rotate(180deg);" />'; // Up caret to minimize
          toggleButton.title = 'Minimize stats';
        }
      };

      const toggleCollapse = () => {
        const isCollapsed = mobileStats.classList.contains('collapsed');
        
        if (isCollapsed) {
          // Expand
          mobileStats.classList.remove('collapsed');
          localStorage.setItem('mobileStatsCollapsed', 'false');
        } else {
          // Collapse
          mobileStats.classList.add('collapsed');
          localStorage.setItem('mobileStatsCollapsed', 'true');
        }
        
        updateToggleButton(!isCollapsed);
        positionToggleRelativeToStats();
        
        // Update canvas positioning after state change
        setTimeout(() => {
          const canvas = document.getElementById('gameCanvas');
          if (canvas) {
            // Force reflow to apply new positioning
            canvas.style.transition = 'all 0.3s ease';
          }
        }, 50);
      };

      // Set initial button state
      const isCollapsed = localStorage.getItem('mobileStatsCollapsed') === 'true';
      updateToggleButton(isCollapsed);

      toggleButton.addEventListener('click', toggleCollapse);
      toggleButton.addEventListener('touchstart', (e: Event) => {
        e.preventDefault();
        toggleCollapse();
      });

      return () => {
        toggleButton.removeEventListener('click', toggleCollapse);
        toggleButton.removeEventListener('touchstart', toggleCollapse);
      };
    };

    // Initial mobile stats setup
    updateMobileStatsVisibility();
    const toggleCleanup = setupMobileStatsToggle();

    // Set initial mobile timer with emoji (same font size as best/previous)
    const initialTimer = () => {
      const mobileTimer = document.getElementById('mobile-timer-text');
      if (mobileTimer && window.innerWidth <= 768) {
        mobileTimer.textContent = '0:00.000';
      }
    };
    initialTimer();

    // Function to sync mobile stats with regular stats
    const syncMobileStats = () => {
      const isMobile = window.innerWidth <= 768;
      if (!isMobile) return;

      const mobileStats = document.getElementById('mobile-top-stats');
      if (!mobileStats) return;

      // Always sync timer and rank (visible in both expanded and collapsed states)
      const mobileTimer = document.getElementById('mobile-timer-text');
      const regularTimer = document.getElementById('lap-timer');
      if (mobileTimer && regularTimer) {
        let timerText = regularTimer.textContent || '0:00.000';
        // Keep DNF format as-is to show time before collision, just remove "s" suffix
        if (!timerText.includes('DNF')) {
          // Remove "s" suffix from regular time format, preserve exact precision
          timerText = timerText.replace(/(\d+:\d+\.\d+)s/g, '$1');
        } else {
          // For DNF, remove "s" from the time part but keep the (DNF) indicator
          timerText = timerText.replace(/(\d+:\d+\.\d+)s(\(DNF\))/g, '$1$2');
        }
        mobileTimer.textContent = timerText;
      }

      // Sync rank from the desktop best-lap label e.g., "Best: 5.999s (Rank #64)"
      try {
        const mobileRankNumber = document.getElementById('mobile-rank-number');
        const regularBestForRank = document.querySelector('.in-game-best-lap');
        if (mobileRankNumber && regularBestForRank && regularBestForRank.textContent) {
          const m = regularBestForRank.textContent.match(/\(\s*Rank\s*#(\d+)\s*\)/i);
          if (m && m[1]) {
            mobileRankNumber.textContent = `#${m[1]}`;
          }
        }
      } catch {}

      // Only sync other stats if not collapsed
      const isCollapsed = mobileStats.classList.contains('collapsed');
      if (!isCollapsed) {
        // Sync best lap (remove "s" suffix, preserve exact precision)
        const mobileBest = document.getElementById('mobile-best-lap');
        const regularBest = document.querySelector('.in-game-best-lap');
        if (mobileBest && regularBest) {
          let bestText = regularBest.textContent || 'Best: --';
          // Strip bracketed rank e.g., (Rank #64) so rank only shows in the rank area
          bestText = bestText.replace(/\s*\(\s*Rank\s*#\d+\s*\)\s*/i, '');
          // Remove "s" suffix from time if present, preserve exact 3 decimal places
          bestText = bestText.replace(/(\d+:\d+\.\d{3})s/g, '$1');
          mobileBest.textContent = bestText;
        }

        // Sync previous lap (remove "s" suffix, preserve exact precision)
        const mobilePrev = document.getElementById('mobile-previous-lap');
        const regularPrev = document.querySelector('.in-game-previous-lap');
        if (mobilePrev && regularPrev) {
          let prevText = regularPrev.textContent || 'Prev: --';
          // Remove "s" suffix from time if present, preserve exact 3 decimal places
          prevText = prevText.replace(/(\d+:\d+\.\d{3})s/g, '$1');
          mobilePrev.textContent = prevText;
        }

        // Sync sparkline with purple color for fastest laps (center only)
        const mobileSparkline = document.getElementById('mobile-sparkline');
        const regularSparkline = document.querySelector('.in-game-sparkline');
        if (mobileSparkline && regularSparkline) {
          // Copy the entire HTML content to preserve purple best-lap styling
          mobileSparkline.innerHTML = regularSparkline.innerHTML || '';
        }
      }
    };

    // Function to handle ghost driver name display
    const updateGhostDriverDisplay = (driverName: string | null) => {
      const mobileGhostDriver = document.getElementById('mobile-ghost-driver');
      const mobileGhostDriverName = document.getElementById('mobile-ghost-driver-name');
      
      if (mobileGhostDriver && mobileGhostDriverName) {
        // Check if ghost car is enabled
        const ghostToggle = document.getElementById('ghostToggle') as HTMLInputElement;
        const isGhostEnabled = ghostToggle ? ghostToggle.checked : false;
        
        if (driverName && driverName.trim() && isGhostEnabled) {
          // Truncate name if > 8 characters for mobile
          const displayName = driverName.length > 8 ? driverName.substring(0, 8) + '..' : driverName;
          mobileGhostDriverName.textContent = displayName;
          mobileGhostDriver.style.display = 'block';
        } else {
          mobileGhostDriver.style.display = 'none';
        }
      }
    };

    // Listen for ghost driver loaded event
    window.addEventListener('hotlap:ghost-driver-loaded', (event: Event) => {
      const customEvent = event as CustomEvent;
      const driverName = customEvent.detail?.driverName;
      updateGhostDriverDisplay(driverName);
    });

    // Listen for ghost toggle changes to update driver display
    window.addEventListener('hotlap:ghost-toggle', (event: Event) => {
      const customEvent = event as CustomEvent;
      const isEnabled = customEvent.detail?.enabled;
      
      // Get the current driver name from the game instance if available
      const gameInstance = window.__hotlapGameInstance;
      const driverName = gameInstance?.getRaceIdDriverName?.() || null;
      
      // Update display based on toggle state
      if (isEnabled) {
        updateGhostDriverDisplay(driverName);
      } else {
        updateGhostDriverDisplay(null);
      }
    });

    // Set up periodic sync for mobile stats
    const mobileStatsInterval = setInterval(() => { syncMobileStats(); positionToggleRelativeToStats(); }, 100); // Sync and reposition periodically when needed

    const prevent = (e: Event) => { e.preventDefault(); e.stopPropagation(); };
    teamSelect.addEventListener('mousedown', prevent);
    teamSelect.addEventListener('touchstart', prevent);
    teamSelect.addEventListener('click', prevent);
    teamSelect.style.pointerEvents = 'none';

    const addGlowEffect = () => {
      selectArrow.classList.add('glow');
      setTimeout(() => selectArrow.classList.remove('glow'), 200);
    };

    const updateSelectedVisual = () => {
      const currentValue = teamSelect.value;
      constructorOptions.forEach(option => {
        option.classList.remove('selected');
        if (option.dataset.value === currentValue) option.classList.add('selected');
      });
    };

    const openModal = () => {
      addGlowEffect();
      constructorModal.classList.remove('closing');
      constructorModal.classList.add('active');
      updateSelectedVisual();
    };

    const closeModal = () => {
      constructorModal.classList.add('closing');
      constructorModal.classList.remove('active');
      constructorOptions.forEach(option => {
        (option as HTMLButtonElement).style.boxShadow = '';
        (option as HTMLButtonElement).style.transform = '';
      });
      setTimeout(() => constructorModal.classList.remove('closing'), 400);
    };

    const onArrowClick = (e: Event) => { e.preventDefault(); e.stopPropagation(); openModal(); };
    selectArrow.addEventListener('click', onArrowClick);
    selectArrow.addEventListener('touchstart', onArrowClick);

    const onCloseClick = () => closeModal();
    constructorModalClose.addEventListener('click', onCloseClick);

    const onOutsideClick = (e: Event) => { if (e.target === constructorModal) closeModal(); };
    constructorModal.addEventListener('click', onOutsideClick);

    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape' && constructorModal.classList.contains('active')) closeModal(); };
    document.addEventListener('keydown', onEsc);

    const onOptionClick = (option: HTMLButtonElement) => () => {
      const value = option.dataset.value || '';
      option.style.boxShadow = '0 0 8px #89CFF0, 0 0 15px #89CFF0';
      option.style.transform = 'translateY(-2px)';
      teamSelect.value = value;
      teamSelect.dispatchEvent(new Event('change'));
      updatePlaceholderState(); // Update placeholder state when option is selected
      setTimeout(closeModal, 350);
    };
    constructorOptions.forEach(opt => opt.addEventListener('click', onOptionClick(opt)));

    updateSelectedVisual();

    return () => {
      // Cleanup banner event listener
      if (closeTopBanner) {
        closeTopBanner.removeEventListener('click', handleBannerClose);
      }
      teamSelect.removeEventListener('mousedown', prevent);
      teamSelect.removeEventListener('touchstart', prevent);
      teamSelect.removeEventListener('click', prevent);
      teamSelect.removeEventListener('change', updatePlaceholderState);
      teamSelect.removeEventListener('focus', hidePrefixOnInteraction);
      teamSelect.removeEventListener('mouseenter', hidePrefixOnInteraction);
      teamSelect.removeEventListener('blur', showPrefixAfterInteraction);
      teamSelect.removeEventListener('mouseleave', showPrefixAfterInteraction);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('resize', handleTestModeResize);
      if (statsResizeObserver) {
        try { statsResizeObserver.disconnect(); } catch {}
        statsResizeObserver = null;
      }
      clearInterval(mobileStatsInterval);
      // Cleanup toggle functionality
      if (toggleCleanup) {
        toggleCleanup();
      }
      selectArrow.removeEventListener('click', onArrowClick);
      selectArrow.removeEventListener('touchstart', onArrowClick);
      constructorModalClose.removeEventListener('click', onCloseClick);
      constructorModal.removeEventListener('click', onOutsideClick);
      document.removeEventListener('keydown', onEsc);
      constructorOptions.forEach(opt => opt.replaceWith(opt.cloneNode(true)));
    };
  }, []);
  return (
    <>
      {/* Loading Screen */}
      <div id="loadingScreen" className="loading-screen">
        <img src="/F1-car-8bit.png" alt="Loading..." className="loading-f1-car" />
        <div className="loading-text">Loading Game...</div>
      </div>

      <a href="https://discord.gg/hSCtAbgcKY" className="x-emoji-link" target="_blank" rel="noopener noreferrer" title="Join Discord" style={{position:"absolute", top:12, right:18, textDecoration:"none", zIndex:10}}>
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24px" height="24px" fill="#111"><path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276c-.598.3428-1.2205.6447-1.8733.8923a.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z"/></svg>
      </a>

      {/* Top Banner - Dismissible
      <div 
        id="top-banner" 
        style={{
          position: "relative",
          margin: "10px 25px",
          padding: "12px 40px 12px 12px",
          backgroundColor: "#fff3cd",
          border: "2px solid #ffc107",
          borderRadius: "4px",
          textAlign: "center",
          zIndex: 9
        }}
      >
        <button
          id="close-top-banner"
          className="close-btn"
          style={{
            position: "absolute",
            top: "-12px",
            right: "-12px",
            width: "30px",
            height: "30px",
            background: "#FF0000",
            border: "2px solid var(--border)",
            borderRadius: "0",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "0",
            transition: "all 0.2s ease",
            zIndex: 10
          }}
          aria-label="Close banner"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16px" height="16px" fill="#fff">
            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
          </svg>
        </button>
        <div style={{fontWeight: "bold", marginBottom: "4px", fontSize: "14px", color: "#000000"}}>🏁 Welcome to Hotlap Daily!</div>
        <div style={{fontSize: "12px", color: "#856404"}}>Set your fastest lap time and compete on the leaderboard!</div>
      </div> */}

      <div className="game-container">
        <div className="pixel-title-box" style={{margin: "0 25px"}}><h1 className="fade-in pixel-title-text">HOTLAP DAILY</h1></div>
        <p className="tagline fade-in" style={{margin: "0 25px"}}>go flatout to set today&apos;s laptime</p>
        <div id="next-track-time" className="fade-in"><span className="icon">⏱</span> <span id="next-track-label">Next track in...</span></div>

        <div className="game-ui fade-in">
          <div className="controls-panel">
            <div className="player-setup">
              <div className="input-group">
                <label htmlFor="playerName">Name</label>
                <input type="text" id="playerName" placeholder="ENTER DRIVER NAME" maxLength={18} style={{height:"32px", padding:"0.25rem"}} />
              </div>

              <div className="input-group">
                <label htmlFor="teamSelect">Constructor</label>
                <div className="constructor-input-row" style={{display:"flex", gap:"4px", alignItems:"stretch"}}>
                  <div className="custom-select-container" style={{flex:"0 0 85%"}}>
                    <select id="teamSelect" style={{height:"32px", padding:"0.5px 0.25rem 0.25rem 0.25rem"}}>
                      <option value="ferrari">Prancing Horse</option>
                      <option value="red_bull">Energy Drink Racers</option>
                      <option value="mercedes">Silver Arrows</option>
                      <option value="mclaren">Papaya Wonders</option>
                      <option value="aston_martin">Team Strolled</option>
                      <option value="alpine">French Madness</option>
                      <option value="williams">Go Weeyums</option>
                      <option value="visa_rb">Sister Bull</option>
                      <option value="audi">4Circles</option>
                      <option value="haas">Steiner Squad</option>
                      <option value="cadillac">And Ready&apos;s Dream</option>
                    </select>
                    <div className="select-arrow" id="selectArrow"></div>
                  </div>
                  <div className="ghost-button-container" style={{flex:"0 0 17%", display:"flex", justifyContent:"center", alignItems:"stretch"}}>
                    <button id="ghostSettingsBtn" className="pixel-button" style={{width:"100%", height:"32px", padding:"0", display:"flex", alignItems:"center", justifyContent:"center", marginTop:"-0.03px"}}>
                      <img src="/ghost.png" alt="Ghost Car Settings" style={{width:"20px", height:"20px"}} />
                    </button>
                  </div>
                </div>
              </div>

              <div style={{marginTop:5, display:"flex", alignItems:"center", gap:10}}>
                <input id="ghostToggle" type="checkbox" style={{width:16, height:16}} />
                <label htmlFor="ghostToggle" style={{userSelect:"none", cursor:"pointer"}}>Ghost Car</label>
              </div>
            </div>

            <button id="startButton" className="pixel-button">PRESS SPACE OR TOUCH TO BEGIN</button>

            {/* Steering controls - hidden in landscape mode, shown in portrait */}
            <div className="controls-grid portrait-only">
              <div className="control-item control-left">
                <img src="/assets/left.png" alt="Left" className="control-image" />
              </div>
              <div className="control-item control-right">
                <img src="/assets/right.png" alt="Right" className="control-image" />
              </div>
            </div>

            <button id="shareButton" className="pixel-button control-share-button" style={{display:"none"}}>
              <span className="share-icon">⚡</span> LAP DROP
            </button>
          </div>

          <div className="game-screen">
            {/* Mobile-specific top stats bar - Updated with new collapsible design */}
            <div className="mobile-top-stats" style={{ display: 'none' }} id="mobile-top-stats">
              <div className="mobile-stats-left">
                <div className="mobile-best-lap" id="mobile-best-lap" style={{ fontSize: '6px' }}>Best: --</div>
                <div className="mobile-previous-lap" id="mobile-previous-lap" style={{ fontSize: '6px' }}>Prev: --</div>
                <div className="mobile-sparkline" id="mobile-sparkline"></div>
              </div>

              <div className="mobile-stats-right">
                <div className="mobile-rank" id="mobile-rank">
                  <span className="emoji">🏆</span>
                  <span>Rank: <span className="mobile-rank-number" id="mobile-rank-number">#--</span></span>
                </div>
                <div className="mobile-timer" id="mobile-timer">
                  <span className="emoji">⏱️</span>
                  <span id="mobile-timer-text">0:00.000</span>
                </div>
                <div className="mobile-ghost-driver" id="mobile-ghost-driver" style={{ display: 'none', fontSize: '12px', color: '#666', marginTop: '4px', textAlign: 'center' }}>
                  Ghost: <span id="mobile-ghost-driver-name"></span>
                </div>
              </div>
            </div>

            {/* Minimize/Expand toggle button */}
            <button className="mobile-stats-toggle" id="mobile-stats-toggle" title="Minimize stats" style={{ right: '0.5rem', left: 'auto' }}>
              <img src="/caret.svg" alt="minimize" style={{width: '8px', height: '6px', transform: 'rotate(180deg)'}} />
            </button>

            {/* Landscape steering controls - positioned absolutely on left/right of canvas */}
            <div className="steering-controls-landscape steering-left">
              <div className="control-item control-left">
                <img src="/assets/left.png" alt="Left" className="control-image" />
              </div>
            </div>
            <div className="steering-controls-landscape steering-right">
              <div className="control-item control-right">
                <img src="/assets/right.png" alt="Right" className="control-image" />
              </div>
            </div>

            <div className="stats">
              <div id="lap-timer">0:00.000</div>
            </div>
            <div className="in-game-leaderboard">
              <div className="leaderboard-content" id="leaderboardContent">
                <button className="leaderboard-collapse" id="leaderboardCollapse">
                  <svg className="collapse-icon" width="12" height="12" viewBox="0 0 12 12" xmlns="http://www.w3.org/2000/svg"><path d="M3 4.5L6 7.5L9 4.5" stroke="#000000" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </button>
                <div id="in-game-lap-times"></div>
              </div>
            </div>
            <canvas id="gameCanvas"></canvas>
          </div>
        </div>
      </div>

      {/* Test track controls - shown below the game in test mode */}
      <div id="test-track-banner" style={{display: "none", margin: "10px 25px", padding: "12px", backgroundColor: "#fff3cd", border: "2px solid #ffc107", borderRadius: "4px", textAlign: "center"}}>
        <div className="test-track-title" style={{fontWeight: "bold", marginBottom: "8px", fontSize: "14px", color: "#000000"}}>🧪 TEST TRACK MODE</div>
        <div style={{fontSize: "12px", marginBottom: "10px", color: "#856404"}}>This is a test track. Lap times will not be submitted.</div>
        <div id="checkpoint-slider-section" style={{margin: "10px auto", maxWidth: "360px", padding: "8px 12px", backgroundColor: "rgba(0,0,0,0.05)", borderRadius: "4px"}}>
          <div style={{display: "flex", alignItems: "center", gap: "8px", justifyContent: "center", flexWrap: "wrap"}}>
            <label htmlFor="testCheckpointSlider" style={{fontSize: "12px", color: "#856404", fontWeight: "600", whiteSpace: "nowrap"}}>Min Checkpoints:</label>
            <input
              type="range"
              id="testCheckpointSlider"
              min="0"
              max="100"
              step="5"
              defaultValue="50"
              style={{flex: "1", minWidth: "100px", maxWidth: "180px", cursor: "pointer", accentColor: "#ffc107"}}
            />
            <span id="testCheckpointDisplay" style={{fontSize: "12px", fontWeight: "bold", color: "#856404", minWidth: "35px"}}>50%</span>
          </div>
          <div style={{fontSize: "11px", color: "#997a00", marginTop: "4px"}}>Minimum % of checkpoints to pass for a valid lap</div>
          <div style={{display: "flex", alignItems: "center", gap: "8px", justifyContent: "center", flexWrap: "wrap", marginTop: "8px"}}>
            <label htmlFor="testCpOpacitySlider" style={{fontSize: "12px", color: "#856404", fontWeight: "600", whiteSpace: "nowrap"}}>Show Checkpoints:</label>
            <input
              type="range"
              id="testCpOpacitySlider"
              min="0"
              max="100"
              step="5"
              defaultValue="50"
              style={{flex: "1", minWidth: "100px", maxWidth: "180px", cursor: "pointer", accentColor: "#ff4444"}}
            />
            <span id="testCpOpacityDisplay" style={{fontSize: "12px", fontWeight: "bold", color: "#856404", minWidth: "35px"}}>50%</span>
          </div>
        </div>
        <div style={{marginTop: "10px"}}>
          <button
            id="submit-test-track-btn"
            className="pixel-button"
            style={{padding: "8px 16px", fontSize: "12px", marginRight: "8px"}}
          >
            Submit Track
          </button>
          <button
            id="exit-test-mode-btn"
            className="pixel-button"
            style={{padding: "8px 16px", fontSize: "12px", backgroundColor: "#6c757d", borderColor: "#6c757d"}}
          >
            Exit Test Mode
          </button>
        </div>
      </div>

      {/* Mobile test controls - shown below the game on mobile in test mode */}
      <div id="mobile-test-controls-bottom" style={{display: "none", margin: "8px 0", textAlign: "center"}}></div>

      {/* Sidebar is globally rendered */}

      {/* Modals */}
      <div className="constructor-modal" id="constructorModal">
        <div className="constructor-card">
          <button className="modal-close pixel-button" id="constructorModalClose">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24"><path d="M19 6.41L17.59 5L12 10.59L6.41 5L5 6.41L10.59 12L5 17.59L6.41 19L12 13.41L17.59 19L19 17.59L13.41 12L19 6.41Z" fill="white"/></svg>
          </button>
          <h3>Choose Constructor</h3>
          <div className="constructor-options">
            {[
              ["ferrari","Prancing Horse"],
              ["red_bull","Energy Drink Racers"],
              ["mercedes","Silver Arrows"],
              ["mclaren","Papaya Wonders"],
              ["aston_martin","Team Strolled"],
              ["alpine","French Madness"],
              ["williams","Go Weeyums"],
              ["visa_rb","Sister Bull"],
              ["audi","4Circles"],
              ["haas","Steiner Squad"],
              ["cadillac","And Ready's Dream"],
            ].map(([value,label]) => (
              <button key={value} className="constructor-option" data-value={value}>{label}</button>
            ))}
          </div>
        </div>
      </div>

      <div className="share-modal" id="shareModal">
        <div className="share-card">
          <button className="modal-close pixel-button" id="closeModal">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24"><path d="M19 6.41L17.59 5L12 10.59L6.41 5L5 6.41L10.59 12L5 17.59L6.41 19L12 13.41L17.59 19L19 17.59L13.41 12L19 6.41Z" fill="white"/></svg>
          </button>
          <canvas className="share-card-preview" id="sharePreview"></canvas>
          <div className="share-card-buttons">
            <button className="pixel-button" id="downloadShare"><span className="share-icon">💾</span> DOWNLOAD</button>
            <button className="pixel-button" id="lapDropShare"><span className="share-icon">⚡</span> SHARE</button>
            <button className="pixel-button" id="cancelShare">CANCEL</button>
          </div>
        </div>
      </div>

      {/* Secret modal is now globally available in layout */}

      {/* Submit Track Modal */}
      <div id="submitTrackModal" className="modal">
        <div className="modal-blur"></div>
        <div className="modal-content">
          <button className="close-btn" id="closeSubmitTrackModal" aria-label="Close">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path d="M4 4L14 14M14 4L4 14" stroke="#fff" strokeWidth="2.2" strokeLinecap="round"/>
            </svg>
          </button>
          <h2 className="pixel-title-text" style={{fontSize:32, color:'var(--text-primary)'}}>Submit Track</h2>
          <br />
          <input type="text" id="submitTrackNameInput" placeholder="Your Name or Nickname" />
          <div style={{height:18}}></div>
          <button id="submitTrackModalBtn" className="btn btn-primary">Submit to Hotlap Daily</button>
          <br /><br />
          <div id="submitTrackStatusMsg" className="status-loading" style={{minHeight:22}}></div>
        </div>
      </div>

      {/* Scripts */}
      <Script
        src="/game/engine.js?v=1.3.9"
        type="module"
        strategy="afterInteractive"
        onLoad={() => {
          try {
            // If the page is already loaded, fire events or instantiate directly
            if (document.readyState !== 'loading') {
              try { window.dispatchEvent(new Event('DOMContentLoaded')); } catch {}
              try { window.dispatchEvent(new Event('load')); } catch {}
            }
            // Always reset any stale instance and re-init when landing here via SPA navigation
            try { window.__hotlapGameInstance = undefined; } catch {}
            if (typeof window.__hotlapInitGame === 'function') {
              window.__hotlapInitGame();
            }
          } catch {}
        }}
      />
    </>
  );
}
