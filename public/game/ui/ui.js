// UI interactions and secret modal logic (side-effect module)
window.addEventListener('DOMContentLoaded', () => {  // Hamburger open/close
  const hamburger = document.getElementById('hamburger');
  const sidePanel = document.getElementById('sidePanel');
  // Persist player name in localStorage
  const nameInput = document.getElementById('playerName');
  if (nameInput) {
    try {
      const savedName = localStorage.getItem('hotlapdaily_player_name');
      if (savedName && savedName.trim()) {
        nameInput.value = savedName;
      }
    } catch {
      // Ignore storage errors (e.g., private browsing)
    }
    const saveName = () => {
      try {
        const value = nameInput.value.trim().slice(0, 18);
        localStorage.setItem('hotlapdaily_player_name', value);
      } catch {
        // Ignore storage errors
      }
    };
    nameInput.addEventListener('input', saveName);
    nameInput.addEventListener('blur', saveName);
  }
  // Persist constructor (team) selection in localStorage
  const teamSelect = document.getElementById('teamSelect');
  if (teamSelect) {
    try {
      const savedTeam = localStorage.getItem('hotlapdaily_constructor');
      if (savedTeam && savedTeam.trim()) {
        teamSelect.value = savedTeam;
        teamSelect.dispatchEvent(new Event('change'));
      }
    } catch {
      // Ignore storage errors (e.g., private browsing)
    }
    const saveTeam = () => {
      try {
        const value = (teamSelect.value || '').trim();
        localStorage.setItem('hotlapdaily_constructor', value);
      } catch {
        // Ignore storage errors
      }
    };
    teamSelect.addEventListener('change', saveTeam);
    teamSelect.addEventListener('input', saveTeam);
  }

  // Persist Ghost Car toggle
  const ghostToggle = document.getElementById('ghostToggle');
  if (ghostToggle) {
    try {
      const savedGhost = localStorage.getItem('hotlapdaily_ghost_enabled');
      const raceId = localStorage.getItem('hotlapdaily_race_id');
      
      // Check URL parameters for raceId as well
      const urlParams = new URLSearchParams(window.location.search);
      const urlRaceId = urlParams.get('raceId');
      
      // Auto-enable ghost car if raceId is present in localStorage OR URL, otherwise use saved preference
      const isEnabled = (raceId && raceId.trim()) || (urlRaceId && urlRaceId.trim()) ? true : (savedGhost === 'true');
      ghostToggle.checked = isEnabled;
    } catch {}
    const saveGhost = () => {
      try {
        const value = ghostToggle.checked ? 'true' : 'false';
        localStorage.setItem('hotlapdaily_ghost_enabled', value);
        // Dispatch a lightweight event so the game can react immediately
        try { window.dispatchEvent(new CustomEvent('hotlap:ghost-toggle', { detail: { enabled: ghostToggle.checked } })); } catch {}
      } catch {}
    };
    ghostToggle.addEventListener('change', saveGhost);
    ghostToggle.addEventListener('input', saveGhost);

    // Replace inline checkbox UI with a single "Ghost Settings" button and modal
    try {
      // Hide original checkbox + its label
      try { ghostToggle.style.display = 'none'; } catch {}
      try {
        const ghostLabel = document.querySelector('label[for="ghostToggle"]');
        if (ghostLabel) ghostLabel.style.display = 'none';
      } catch {}

      // Find the existing Ghost Settings button (now in HTML)
      const btn = document.getElementById('ghostSettingsBtn');
      if (btn) {
        // Badge removed - no longer showing ON/OFF label
        // Visual sync helper - using green glow outline like before
        const syncBtnVisual = (enabled) => {
          try {
            if (enabled) {
              // Add green glow effect like before
              btn.classList.add('completed-glow');
            } else {
              // Remove glow effect
              btn.classList.remove('completed-glow');
              btn.style.color = '';
              btn.style.borderColor = '';
              btn.style.boxShadow = '';
            }
          } catch {}
        };
        // Initialize visual state from storage/toggle
        try {
          const saved = localStorage.getItem('hotlapdaily_ghost_enabled') === 'true';
          const raceId = localStorage.getItem('hotlapdaily_race_id');
          
          // Check URL parameters for raceId as well
          const urlParams = new URLSearchParams(window.location.search);
          const urlRaceId = urlParams.get('raceId');
          
          // Auto-enable ghost car if raceId is present in localStorage OR URL, otherwise use saved preference
          const isEnabled = (raceId && raceId.trim()) || (urlRaceId && urlRaceId.trim()) ? true : saved;
          syncBtnVisual(isEnabled);
        } catch { syncBtnVisual(false); }
        // React to runtime changes
        try {
          window.addEventListener('hotlap:ghost-toggle', (e) => {
            try { syncBtnVisual(!!(e && e.detail && e.detail.enabled)); } catch {}
          });
        } catch {}
        
        // Add driver name display element - only show on desktop
        const driverDisplay = document.createElement('div');
        driverDisplay.id = 'web-ghost-driver';
        driverDisplay.style.cssText = 'display:none;font-size:12px;color:#666;margin-top:4px;text-align:center;';
        driverDisplay.innerHTML = 'Ghost: <span id="web-ghost-driver-name"></span>';
        
        // Only show on desktop (>= 769px), hide completely on mobile
        const isDesktop = window.innerWidth >= 769;
        if (isDesktop) {
          const startButton = document.getElementById('startButton');
          if (startButton) {
            startButton.parentNode.insertBefore(driverDisplay, startButton);
          }
        }
        // Mobile: don't add the element at all

        btn.addEventListener('click', () => {
          // Get current ghost state
          const currentState = localStorage.getItem('hotlapdaily_ghost_enabled') === 'true';
          const newState = !currentState;
          
          // Update localStorage
          localStorage.setItem('hotlapdaily_ghost_enabled', newState ? 'true' : 'false');
          
          // Keep hidden original checkbox in sync for game compatibility
          try { ghostToggle.checked = newState; } catch {}
          
          // Dispatch event for game sync
          try { 
            window.dispatchEvent(new CustomEvent('hotlap:ghost-toggle', { 
              detail: { enabled: newState } 
            })); 
          } catch {}
          
          // Update visual state
          syncBtnVisual(newState);
          
          // Show feedback message (similar to share button)
          showGhostMessage(newState ? 'Ghost car enabled' : 'Ghost car disabled');
        });
        
        // Function to show ghost feedback messages (similar to share button)
        const showGhostMessage = (message) => {
          try {
            let messageEl = document.getElementById('ghostMessage');
            if (!messageEl) {
              messageEl = document.createElement('div');
              messageEl.id = 'ghostMessage';
              messageEl.style.cssText = `
                position: fixed;
                bottom: 20px;
                left: 50%;
                transform: translateX(-50%);
                background: var(--bg-primary);
                color: var(--text-primary);
                padding: 10px 20px;
                border-radius: 5px;
                border: 2px solid var(--border);
                z-index: 1000;
                opacity: 0;
                transition: opacity 0.3s ease, transform 0.3s ease;
                font-weight: bold;
                min-width: 200px;
                text-align: center;
                pointer-events: none;
                box-shadow: 0 3px 10px rgba(0,0,0,0.2);
              `;
              document.body.appendChild(messageEl);
            }
            
            // Clear existing timer
            if (messageEl._hideTimer) clearTimeout(messageEl._hideTimer);
            
            // Update message and show
            messageEl.textContent = message;
            messageEl.style.transform = 'translateX(-50%) translateY(20px)';
            messageEl.style.opacity = '0';
            void messageEl.offsetWidth; // Force reflow
            messageEl.style.opacity = '1';
            messageEl.style.transform = 'translateX(-50%) translateY(0)';
            
            // Hide after 0.9 seconds
            messageEl._hideTimer = setTimeout(() => {
              messageEl.style.opacity = '0';
              messageEl.style.transform = 'translateX(-50%) translateY(20px)';
            }, 900);
          } catch (e) { 
            console.error('Error showing ghost message:', e); 
          }
        };
      }
    } catch {}
  }
  
  if (hamburger && sidePanel) {
    hamburger.onclick = () => {
      const isOpen = sidePanel.style.left === '0px';
      
      if (isOpen) {
        // Close panel
        sidePanel.style.left = '-260px';
        hamburger.classList.remove('active', 'panel-open');
      } else {
        // Open panel
        sidePanel.style.left = '0';
        hamburger.classList.add('active', 'panel-open');
      }
    };
  }
  // Secret Modal Logic (like Share Modal)
  const secretBtn = document.getElementById('secretBtn');
  const secretModal = document.getElementById('secretModal');
  const closeSecret = document.getElementById('closeSecret');
  
  function openSecretModal() {
    if (!secretModal) return;
    secretModal.style.display = 'flex';
    // Force reflow before adding visible for transition
    void secretModal.offsetHeight;
    secretModal.classList.add('visible');
    if (sidePanel) {
      sidePanel.style.left = '-260px';
      // Reset hamburger classes when closing side panel
      if (hamburger) {
        hamburger.classList.remove('active', 'panel-open');
      }
    }
  }
  
  function closeSecretModal() {
    if (!secretModal) return;
    secretModal.classList.remove('visible');
    setTimeout(() => {
      secretModal.style.display = 'none';
    }, 300); // Match transition duration
  }
  
  if (secretBtn && secretModal && closeSecret) {
    secretBtn.addEventListener('click', openSecretModal);
    closeSecret.addEventListener('click', closeSecretModal);
    secretModal.addEventListener('click', (e) => {
      if (e.target === secretModal) closeSecretModal();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && secretModal.classList.contains('visible')) closeSecretModal();
    });
  }
  // Optional: close side panel when clicking outside
  window.addEventListener('click', function(e) {
    if (!sidePanel || !hamburger) return;
      // Only check for clicks outside if panel is open
    if (sidePanel.style.left === '0px') {
      if (!sidePanel.contains(e.target) && !hamburger.contains(e.target) && (!secretModal || !secretModal.contains(e.target))) {
        sidePanel.style.left = '-260px';
        hamburger.classList.remove('active', 'panel-open');
      }
    }
  });
});

// Function to reposition ghost car text based on screen size
const repositionGhostCarText = () => {
  const webGhostDriver = document.getElementById('web-ghost-driver');
  const ghostSettingsBtn = document.getElementById('ghostSettingsBtn');
  const startButton = document.getElementById('startButton');
  
  if (!ghostSettingsBtn || !startButton) return;
  
  const isDesktop = window.innerWidth >= 769;
  
  if (isDesktop) {
    // Desktop: create and position above start button if not exists
    if (!webGhostDriver) {
      const driverDisplay = document.createElement('div');
      driverDisplay.id = 'web-ghost-driver';
      driverDisplay.style.cssText = 'display:none;font-size:12px;color:#666;margin-top:4px;text-align:center;';
      driverDisplay.innerHTML = 'Ghost: <span id="web-ghost-driver-name"></span>';
      startButton.parentNode.insertBefore(driverDisplay, startButton);
    } else {
      // Move existing element to above start button
      if (webGhostDriver.parentNode) {
        webGhostDriver.parentNode.removeChild(webGhostDriver);
      }
      startButton.parentNode.insertBefore(webGhostDriver, startButton);
    }
  } else {
    // Mobile: remove the element completely
    if (webGhostDriver && webGhostDriver.parentNode) {
      webGhostDriver.parentNode.removeChild(webGhostDriver);
    }
  }
};

// Function to handle ghost driver name display for web (desktop only)
const updateWebGhostDriverDisplay = (driverName) => {
  // Only show on desktop
  if (window.innerWidth < 769) return;
  
  const webGhostDriver = document.getElementById('web-ghost-driver');
  const webGhostDriverName = document.getElementById('web-ghost-driver-name');
  
  if (webGhostDriver && webGhostDriverName) {
    // Check if ghost car is enabled
    const ghostToggle = document.getElementById('ghostToggle');
    const isGhostEnabled = ghostToggle ? ghostToggle.checked : false;
    
    if (driverName && driverName.trim() && isGhostEnabled) {
      // Truncate name if > 8 characters for web
      const displayName = driverName.length > 8 ? driverName.substring(0, 8) + '..' : driverName;
      webGhostDriverName.textContent = displayName;
      webGhostDriver.style.display = 'block';
    } else {
      webGhostDriver.style.display = 'none';
    }
  }
};

// Listen for ghost driver loaded event
window.addEventListener('hotlap:ghost-driver-loaded', (event) => {
  const driverName = event.detail?.driverName;
  updateWebGhostDriverDisplay(driverName);
});

// Listen for ghost toggle changes to update driver display
window.addEventListener('hotlap:ghost-toggle', (event) => {
  const isEnabled = event.detail?.enabled;
  
  // Get the current driver name from the game instance if available
  const gameInstance = window.__hotlapGameInstance;
  const driverName = gameInstance && typeof gameInstance.getRaceIdDriverName === 'function' 
    ? gameInstance.getRaceIdDriverName() 
    : null;
  
  // Update display based on toggle state
  if (isEnabled) {
    updateWebGhostDriverDisplay(driverName);
  } else {
    updateWebGhostDriverDisplay(null);
  }
});

// Listen for window resize to reposition ghost car text
window.addEventListener('resize', () => {
  repositionGhostCarText();
});


