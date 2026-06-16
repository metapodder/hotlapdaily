import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getBannedIps } from "@/lib/bannedIps";

export const runtime = "nodejs";

type WrappedData = {
  username: string;
  hasRecords: boolean;
  timeSpent: {
    totalAttempts: number;
    hours: number;
    minutes: number;
  };
  streak: {
    current: number;
    longest: number;
  };
  podiums: number;
  podiumMessage: string;
  averageRank: number | null;
  averageRankMessage: string;
  favoriteTrack: {
    trackName: string;
    attempts: number;
    trackId: number;
    bestLap: number | null;
  } | null;
  tracksSubmitted: number;
  totalSessions: number;
  year: number;
  category: string;
};

// GET /api/wrapped?username=NAME
export async function GET(request: NextRequest) {
  // Wrapped feature is hidden - return 404
  return NextResponse.json(
    { error: "Not Found" },
    { status: 404 }
  );
  
  try {
    const { searchParams } = new URL(request.url);
    const username = (searchParams.get("username") || "").trim();

    if (!username) {
      return NextResponse.json(
        { error: "Missing username" },
        { status: 400 }
      );
    }

    const currentYear = new Date().getFullYear();
    const bannedIps = await getBannedIps();

    // Check cache first
    try {
      const cached = await prisma.wrapped.findUnique({
        where: {
          year_username: {
            year: currentYear,
            username: username,
          },
        },
        select: {
          dataJson: true,
          createdAt: true,
        },
      });

      const cachedData = cached?.dataJson;
      if (cachedData) {
        // Return cached data
        return NextResponse.json(cachedData as WrappedData);
      }
    } catch (cacheError) {
      // If cache lookup fails, continue to calculate
      console.error("Cache lookup error:", cacheError);
    }

    const yearStart = new Date(`${currentYear}-01-01T00:00:00Z`);
    const yearEnd = new Date(`${currentYear + 1}-01-01T00:00:00Z`);

    // Check if user has any records
    const userRecordsCount = await prisma.bestLap.count({
      where: {
        driverName: {
          equals: username,
          mode: "insensitive",
        },
        physicsValidationPassed: true,
        valid: true,
        clientIp: {
          notIn: bannedIps,
        },
      },
    });

    if (userRecordsCount === 0) {
      const noRecordsData: WrappedData = {
        username,
        hasRecords: false,
        year: currentYear,
        timeSpent: { totalAttempts: 0, hours: 0, minutes: 0 },
        streak: { current: 0, longest: 0 },
        podiums: 0,
        podiumMessage: "",
        averageRank: null,
        averageRankMessage: "",
        favoriteTrack: null,
        tracksSubmitted: 0,
        totalSessions: 0,
        category: "",
      };

      // Cache the no records result too
      try {
        await prisma.wrapped.upsert({
          where: {
            year_username: {
              year: currentYear,
              username: username,
            },
          },
          create: {
            year: currentYear,
            username: username,
            dataJson: noRecordsData,
          },
          update: {
            dataJson: noRecordsData,
            createdAt: new Date(),
          },
        });
      } catch (cacheError) {
        console.error("Cache save error:", cacheError);
      }

      return NextResponse.json(noRecordsData);
    }

    // Get all user's best laps for the year (optimized query)
    const allUserLaps = await prisma.bestLap.findMany({
      where: {
        driverName: {
          equals: username,
          mode: "insensitive",
        },
        physicsValidationPassed: true,
        valid: true,
        createdAt: {
          gte: yearStart,
          lt: yearEnd,
        },
        clientIp: {
          notIn: bannedIps,
        },
      },
      select: {
        baseTurnSpeed: true,
        createdAt: true,
        trackName: true,
        clientIp: true,
      },
      orderBy: {
        createdAt: "asc",
      },
    });

    // Calculate time spent (last 2 months only)
    const twoMonthsAgo = new Date();
    twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);
    const recentLaps = allUserLaps.filter(
      (lap) => lap.createdAt >= twoMonthsAgo
    );

    // baseTurnSpeed contains the number of attempts before that bestLap
    const totalAttempts = Math.round(recentLaps.reduce((sum, lap) => {
      const attempts = lap.baseTurnSpeed ? Number(lap.baseTurnSpeed) : 1;
      return sum + (Number.isFinite(attempts) && attempts > 0 ? attempts : 1);
    }, 0));

    // Estimate time: assume ~30 seconds per attempt on average
    const totalSeconds = totalAttempts * 30;
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);

    // Calculate streak (daily basis using IP and date)
    // Group by UTC date and IP to find unique daily sessions
    const dailySessions = new Map<string, Set<string>>();
    for (const lap of allUserLaps) {
      const date = new Date(lap.createdAt);
      const utcDate = `${date.getUTCFullYear()}-${String(
        date.getUTCMonth() + 1
      ).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
      const ip = lap.clientIp || "unknown";

      if (!dailySessions.has(utcDate)) {
        dailySessions.set(utcDate, new Set());
      }
      dailySessions.get(utcDate)!.add(ip);
    }

    const sortedDates = Array.from(dailySessions.keys()).sort();
    let currentStreak = 0;
    let longestStreak = 0;
    let tempStreak = 0;

    // Calculate current streak (from today backwards)
    const today = new Date();

    const checkDate = new Date(today);
    let consecutive = true;

    while (consecutive) {
      const checkUtc = `${checkDate.getUTCFullYear()}-${String(
        checkDate.getUTCMonth() + 1
      ).padStart(2, "0")}-${String(checkDate.getUTCDate()).padStart(2, "0")}`;

      if (sortedDates.includes(checkUtc)) {
        currentStreak++;
        checkDate.setDate(checkDate.getDate() - 1);
      } else {
        consecutive = false;
      }
    }

    // Calculate longest streak
    for (let i = 0; i < sortedDates.length; i++) {
      if (i === 0) {
        tempStreak = 1;
      } else {
        const prevDate = new Date(sortedDates[i - 1] + "T00:00:00Z");
        const currDate = new Date(sortedDates[i] + "T00:00:00Z");
        const daysDiff =
          (currDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24);

        if (daysDiff === 1) {
          tempStreak++;
        } else {
          longestStreak = Math.max(longestStreak, tempStreak);
          tempStreak = 1;
        }
      }
    }
    longestStreak = Math.max(longestStreak, tempStreak);

    // Calculate podiums (rank 1-3) for the year
    // Optimized: Get all laps for all dates user raced, then group by date
    const uniqueDates = new Set(
      allUserLaps.map((lap) => {
        const date = new Date(lap.createdAt);
        return `${date.getUTCFullYear()}-${String(
          date.getUTCMonth() + 1
        ).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
      })
    );

    let podiums = 0;
    const allRanks: number[] = []; // Track all ranks achieved by the user

    // Batch query: Get all laps for all dates user raced in one query
    const dateArray = Array.from(uniqueDates);
    if (dateArray.length > 0) {
      // Get date ranges
      const dateRanges = dateArray.map((dateStr) => {
        const [year, month, day] = dateStr.split("-").map(Number);
        const startDate = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
        const endDate = new Date(Date.UTC(year, month - 1, day + 1, 0, 0, 0));
        return { dateStr, startDate, endDate };
      });

      // Get all laps for all these dates in batches
      const allDayLaps = await prisma.bestLap.findMany({
        where: {
          OR: dateRanges.map(({ startDate, endDate }) => ({
            createdAt: {
              gte: startDate,
              lt: endDate,
            },
          })),
          physicsValidationPassed: true,
          valid: true,
          clientIp: {
            notIn: bannedIps,
          },
        },
        select: {
          driverName: true,
          bestLap: true,
          createdAt: true,
          trackName: true,
        },
      });

      // Group by date and track
      const lapsByDate = new Map<string, typeof allDayLaps>();
      for (const lap of allDayLaps) {
        const date = new Date(lap.createdAt);
        const dateStr = `${date.getUTCFullYear()}-${String(
          date.getUTCMonth() + 1
        ).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
        const key = `${dateStr}_${lap.trackName || ""}`;
        if (!lapsByDate.has(key)) {
          lapsByDate.set(key, []);
        }
        lapsByDate.get(key)!.push(lap);
      }

      // Calculate rank for each date/track combination
      for (const [, dayLaps] of lapsByDate.entries()) {
        // Aggregate per driver
        const bestByDriver = new Map<string, number>();
        for (const lap of dayLaps) {
          if (!lap || lap.bestLap == null) continue;
          const numericLap = Number(lap.bestLap);
          if (!Number.isFinite(numericLap)) continue;
          const name = (lap.driverName || "").trim();
          if (!name) continue;
          const driverKey = name.toLowerCase();
          const existing = bestByDriver.get(driverKey);
          if (existing === undefined) {
            bestByDriver.set(driverKey, numericLap);
          } else if (numericLap < (existing as number)) {
            bestByDriver.set(driverKey, numericLap);
          }
        }

        const leaderboard = Array.from(bestByDriver.entries())
          .map(([name, time]) => ({ name, time }))
          .sort((a, b) => a.time - b.time);

        const userRank = leaderboard.findIndex(
          (entry) => entry.name.toLowerCase() === username.toLowerCase()
        );

        if (userRank >= 0 && userRank < 3) {
          podiums++;
        }

        // Track all ranks achieved by the user (for top 10 best ranks calculation)
        if (userRank >= 0) {
          allRanks.push(userRank + 1); // Convert 0-based to 1-based rank
        }
      }
    }

    // Calculate average of top 10 best ranks (lowest numbers = best ranks)
    let averageRank: number | null = null;
    let averageRankMessage = "";
    if (allRanks.length > 0) {
      // Sort ranks ascending (best first) and take top 10
      const sortedRanks = [...allRanks].sort((a, b) => a - b);
      const top10BestRanks = sortedRanks.slice(0, Math.min(10, sortedRanks.length));
      
      // Calculate average of top 10 best ranks
      const sum = top10BestRanks.reduce((acc, rank) => acc + rank, 0);
      averageRank = Math.round(sum / top10BestRanks.length);
      
      if (averageRank !== null) {
        const rank = averageRank as number;
        if (rank === 1) {
          averageRankMessage = "You're consistently the fastest! 🏁";
        } else if (rank <= 3) {
          averageRankMessage = "You're a podium regular! 🥇";
        } else if (rank <= 5) {
          averageRankMessage = "Top 5 average - impressive consistency! 💪";
        } else if (rank <= 7) {
          averageRankMessage = "Solid top 10 performer! 🎯";
        } else if (rank <= 10) {
          averageRankMessage = "Making it to the top 10 regularly! 🚀";
        } else {
          averageRankMessage = "Your top 10 best ranks show great progress! 📈";
        }
      }
    }

    // Calculate favorite track (maximum attempts)
    // Extract trackId from trackName and get track info from TrackFunction
    const trackAttempts = new Map<number, number>();
    const trackIdToName = new Map<number, string>();
    
    for (const lap of allUserLaps) {
      const trackName = lap.trackName || "";
      // Extract trackId from "Track 117" format
      const trackIdMatch = trackName.match(/Track\s+(\d+)/);
      if (!trackIdMatch) continue;
      
      const trackId = parseInt((trackIdMatch as RegExpMatchArray)[1], 10);
      if (!Number.isFinite(trackId)) continue;
      
      const attempts = lap.baseTurnSpeed ? Number(lap.baseTurnSpeed) : 1;
      const current = trackAttempts.get(trackId) || 0;
      trackAttempts.set(
        trackId,
        current + (Number.isFinite(attempts) && attempts > 0 ? attempts : 1)
      );
      trackIdToName.set(trackId, trackName);
    }

    let favoriteTrackId: number | null = null;
    let maxAttempts = 0;
    for (const [trackId, attempts] of trackAttempts.entries()) {
      if (attempts > maxAttempts) {
        maxAttempts = attempts;
        favoriteTrackId = trackId;
      }
    }

    // Get track function info and best lap time if available
    let favoriteTrack: { trackName: string; attempts: number; trackId: number; bestLap: number | null } | null = null;
    if (favoriteTrackId) {
      // Get best lap time for this track
      const trackId = favoriteTrackId as number;
      const favoriteTrackName = trackIdToName.get(trackId) || `Track ${trackId}`;
      const bestLapRecord = await prisma.bestLap.findFirst({
        where: {
          driverName: {
            equals: username,
            mode: "insensitive",
          },
          trackName: favoriteTrackName,
          physicsValidationPassed: true,
          valid: true,
          clientIp: {
            notIn: bannedIps,
          },
        },
        select: {
          bestLap: true,
        },
        orderBy: {
          bestLap: "asc",
        },
      });
      
      const bestLapValue = bestLapRecord?.bestLap;
      const bestLap = bestLapValue ? Number(bestLapValue) : null;
      favoriteTrack = {
        trackName: favoriteTrackName,
        attempts: maxAttempts,
        trackId: trackId,
        bestLap: bestLap,
      };
    }

    // Calculate tracks submitted
    const tracksSubmitted = await prisma.submittedTrack.count({
      where: {
        name: {
          equals: username,
          mode: "insensitive",
        },
        createdAt: {
          gte: yearStart,
          lt: yearEnd,
        },
      },
    });

    // Total sessions (unique days with activity)
    const totalSessions = dailySessions.size;

    // Determine podium message and category
    let podiumMessage = "";
    let category = "";
    
    // Category determination with priority (most impressive first)
    // Priority order: Top 10 Elite > Streak Master > Track Builder > Champion > Podium Pro > Seasoned Player > etc.
    
    if (averageRank !== null) {
      const rank = averageRank as number;
      if (rank <= 10) {
        if (rank === 1) {
          category = "🏆 Top 10 Elite - #1 Average";
        } else if (rank <= 3) {
          category = "🥇 Top 10 Elite - Podium Average";
        } else if (rank <= 5) {
          category = "🥈 Top 10 Elite - Top 5 Average";
        } else {
          category = "🥉 Top 10 Elite";
        }
      }
    }
    
    if (!category) {
      if (longestStreak >= 30) {
        category = "🔥 Streak Master";
      } else if (tracksSubmitted >= 5) {
        category = "🛠️ Track Builder";
      } else if (longestStreak >= 14) {
        category = "⚡ Dedicated Racer";
      } else if (totalSessions >= 50) {
        category = "📅 Regular Racer";
      } else if (podiums >= 10) {
        podiumMessage = "Incredible! You're a podium machine! 🏆";
        category = "Champion";
      } else if (podiums > 5 && podiums < 10) {
        podiumMessage = "Impressive! You're consistently making it to the top 3!";
        category = "Podium Pro";
      } else if (podiums >= 1 && podiums <= 5) {
        podiumMessage = "You're getting the hang of it! Podium finishes are just the beginning.";
        category = "Rising Star";
      } else if (totalAttempts >= 100) {
        category = "🎮 Seasoned Player";
      } else if (totalAttempts >= 50) {
        podiumMessage = "Keep pushing! Every champion started with zero podiums.";
        category = "Persistent Racer";
      } else if (totalSessions >= 10) {
        podiumMessage = "Keep pushing! Every champion started with zero podiums.";
        category = "Active Racer";
      } else {
        podiumMessage = "Keep pushing! Every champion started with zero podiums.";
        category = "Rookie Racer";
      }
    }

    const wrappedData: WrappedData = {
      username,
      hasRecords: true,
      timeSpent: {
        totalAttempts,
        hours,
        minutes,
      },
      streak: {
        current: currentStreak,
        longest: longestStreak,
      },
      podiums,
      podiumMessage,
      averageRank,
      averageRankMessage,
      favoriteTrack,
      tracksSubmitted: tracksSubmitted,
      totalSessions,
      year: currentYear,
      category,
    };

    // Cache the result
    try {
      await prisma.wrapped.upsert({
        where: {
          year_username: {
            year: currentYear,
            username: username,
          },
        },
        create: {
          year: currentYear,
          username: username,
          dataJson: wrappedData,
        },
        update: {
          dataJson: wrappedData,
          createdAt: new Date(),
        },
      });
    } catch (cacheError) {
      // Log error but don't fail the request
      console.error("Cache save error:", cacheError);
    }

    return NextResponse.json(wrappedData);
  } catch (error) {
    console.error("Wrapped API error:", error);
    return NextResponse.json(
      { error: "Unexpected server error" },
      { status: 500 }
    );
  }
}

