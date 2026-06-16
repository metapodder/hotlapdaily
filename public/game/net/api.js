// Best-lap submission via Next.js API route
export const sendBestLap = async (bestLap, driverName, trackName, physicsData, antiCheatSummary = null, bestLapTrace = null) => {
    try {
        // Reject submission if anti-cheat validation failed
        if (antiCheatSummary && !antiCheatSummary.isValid) {
            console.warn('Lap submission rejected: Anti-cheat validation failed');
            throw new Error('Lap rejected due to course violations');
        }
        
        // Note: record data is encapsulated on the server; keep client payload minimal

        // Prepare encoded payload with lightweight proof-of-work to deter trivial curl submissions
        const payload = {
            bestLap,
            driverName,
            trackName,
            ts: Date.now(),
            r: Math.floor(Math.random() * 0xffffffff)
        };

        const toBase64 = (str) => btoa(unescape(encodeURIComponent(str)));
        const fromStringToUint8 = (str) => new TextEncoder().encode(str);
        const toHex = (buffer) => Array.from(new Uint8Array(buffer)).map(b => b.toString(16).padStart(2, '0')).join('');
        const sha256Hex = async (str) => {
            const data = fromStringToUint8(str);
            const digest = await crypto.subtle.digest('SHA-256', data);
            return toHex(digest);
        };
        const computePowNonce = async (message, difficultyPrefix = '000') => {
            let nonce = 0;
            const MAX_ITERS = 1000000;
            while (nonce < MAX_ITERS) {
                const candidate = `${message}:${nonce}`;
                const hash = await sha256Hex(candidate);
                if (hash.startsWith(difficultyPrefix)) return String(nonce);
                nonce += 1;
            }
            return String(nonce);
        };

        const encoded = toBase64(JSON.stringify(payload));
        // Obtain server-issued challenge for HMAC binding and PoW difficulty
        let challenge = null;
        let signature = null;
        let powPrefix = '0000';
        try {
            const challengeRes = await fetch(`/api/challenge`, { method: 'GET', cache: 'no-store' });
            if (!challengeRes.ok) {
                throw new Error(`Challenge fetch failed: ${challengeRes.status}`);
            }
            const ch = await challengeRes.json();
            challenge = ch.challenge || null;
            signature = ch.signature || null;
            powPrefix = ch.powPrefix || '0000';
        } catch {
            console.warn('Challenge retrieval failed');
            throw new Error('Unable to obtain challenge for secure submission');
        }
        const powNonce = await computePowNonce(encoded, powPrefix);
        
        // Send to internal API which forwards to Supabase securely
        let response = await fetch(`/api/best-lap`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                version: 1,
                encoded,
                powNonce,
                challenge,
                signature,
                physicsData,
                antiCheatSummary,
                // Send trace outside the encoded/PoW payload to avoid bloat
                bestLapTrace
            })
        });
                
        if (!response.ok) {
            // Handle conflict (409) - driver already has a best lap for this track today
            if (response.status === 409) {
                console.log('Best lap already exists for this driver/track/date combination');
                return { success: false, reason: 'duplicate' };
            }

            const errorText = await response.text();
            // If PoW failed (e.g., challenge expired while page was open), fetch a new challenge and retry once
            try {
                const maybeErr = JSON.parse(errorText);
                if (maybeErr && (maybeErr.error === 'Invalid PoW' || maybeErr.error === 'Expired challenge' || maybeErr.error === 'Missing challenge' || maybeErr.error === 'Invalid challenge signature')) {
                    try {
                        const challengeRes2 = await fetch(`/api/challenge`, { method: 'GET', cache: 'no-store' });
                        if (challengeRes2.ok) {
                            const ch2 = await challengeRes2.json();
                            const newChallenge = ch2.challenge || null;
                            const newSignature = ch2.signature || null;
                            const newPrefix = ch2.powPrefix || powPrefix;
                            const newNonce = await computePowNonce(encoded, newPrefix);
                            response = await fetch(`/api/best-lap`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    version: 1,
                                    encoded,
                                    powNonce: newNonce,
                                    challenge: newChallenge,
                                    signature: newSignature,
                                    physicsData,
                                    antiCheatSummary,
                                    bestLapTrace
                                })
                            });
                        }
                    } catch { /* ignore retry errors */ }
                }
            } catch { /* not JSON or other error format */ }

            if (!response.ok) {
                const finalText = await response.text();
                let errorMessage = `Supabase API error: ${response.status} ${response.statusText}`;
                try {
                    const errorData = JSON.parse(finalText);
                    if (errorData.message) {
                        errorMessage += ` - ${errorData.message}`;
                    }
                } catch {
                    errorMessage += ` - Response: ${finalText}`;
                }
                throw new Error(errorMessage);
            }
        }
        

        // Parse the response JSON once
        let responseData;
        try {
            responseData = await response.json();
        } catch {
            responseData = {};
        }

        // Also fetch current rank and return with result
        try {
            const rn = typeof driverName === 'string' ? driverName.trim() : '';
            if (rn) {
                // Include trackId so rank reflects the current track context
                let trackIdParam = '';
                try {
                    const storedTrackId = localStorage.getItem('hotlapdaily_todays_track_id');
                    if (storedTrackId && storedTrackId.trim()) {
                        trackIdParam = `&trackId=${encodeURIComponent(storedTrackId.trim())}`;
                    } else if (typeof trackName === 'string' && trackName.startsWith('Track ')) {
                        const extracted = trackName.replace('Track ', '').trim();
                        if (extracted) trackIdParam = `&trackId=${encodeURIComponent(extracted)}`;
                    }
                } catch {
                    // ignore storage access errors
                }
                const rankRes = await fetch(`/api/rank?driverName=${encodeURIComponent(rn)}${trackIdParam}`, { cache: 'no-store' });
                if (rankRes.ok) {
                    const data = await rankRes.json();
                    return {
                        success: true,
                        rank: data.rank,
                        total: data.total,
                        raceId: responseData.raceId
                    };
                }
            }
        } catch {
            console.warn('Rank fetch failed');
        }

        // Return success with raceId even if rank fetch failed
        return {
            success: true,
            raceId: responseData.raceId
        };
        
    } catch (error) {
        console.error('Error sending best lap to Supabase:', error);
        console.error('Error details:', {
            endpoint: '/api/best-lap',
            bestLap,
            driverName,
            trackName
        });
        // Don't throw the error to avoid breaking the game experience
        return { success: false, reason: 'error', error: error.message };
    }
};


