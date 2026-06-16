// Ultra-safe Clarity lap time tracking function - always fail safe
export function trackLapToClarity(lapTime) {
    // Use setTimeout with 0 delay to ensure non-blocking behavior
    setTimeout(() => {
        try {
            // Only execute if Clarity is loaded
            if (typeof window.clarity === 'function') {
                const formattedTime = (lapTime / 1000).toFixed(3) + "s";
                window.clarity("set", "lastLapTime", formattedTime);
            }
        } catch (e) {
            // Silent failure - never break user experience
        }
    }, 0);
}


