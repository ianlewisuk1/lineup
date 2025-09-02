import React, { useEffect, useState } from "react";
import {
  collection,
  getDocs,
  doc,
  updateDoc,
  deleteDoc,
} from "firebase/firestore";
import { db } from "../firebase/firebase";

function AdminSchedulePanel() {
  const [week, setWeek] = useState("1");
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [searchType, setSearchType] = useState("all");
  const [statusFilter, setStatusFilter] = useState("");
  const [sortBy, setSortBy] = useState("date");
  const [excludeFCSGames, setExcludeFCSGames] = useState(true); // Default to true
  
  // Team classifications cache
  const [teamClassifications, setTeamClassifications] = useState({});
  
  // Function to fetch team classifications
  const fetchTeamClassifications = async () => {
    try {
      const teamsSnap = await getDocs(collection(db, "teams"));
      const classifications = {};
      teamsSnap.docs.forEach(doc => {
        const teamData = doc.data();
        // Store by document ID
        classifications[doc.id] = teamData.classification || 'fbs';
        
        // Store by alternate names if they exist
        if (teamData.alternateNames1) {
          classifications[teamData.alternateNames1] = teamData.classification || 'fbs';
        }
        if (teamData.alternateNames2) {
          classifications[teamData.alternateNames2] = teamData.classification || 'fbs';
        }
        
        // Also try common variations
        const docIdVariations = [
          doc.id,
          doc.id.replace(/-/g, ' '), // "alabama-a-m" -> "alabama a m"
          doc.id.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()), // "Alabama A M"
        ];
        docIdVariations.forEach(variation => {
          classifications[variation] = teamData.classification || 'fbs';
        });
      });
      
      console.log('Team Classifications loaded:', Object.keys(classifications).length, 'entries');
      console.log('Sample FCS teams found:', Object.entries(classifications).filter(([name, cls]) => cls === 'fcs').slice(0, 5));
      
      setTeamClassifications(classifications);
      return classifications;
    } catch (error) {
      console.error("Error fetching team classifications:", error);
      return {};
    }
  };
  
  // Function to check if a team is FCS based on database
  const isFCSTeam = (teamName, classifications = teamClassifications) => {
    if (!teamName) return false;
    
    // Try exact match first
    if (classifications[teamName] === 'fcs') {
      console.log(`${teamName} is FCS (exact match)`);
      return true;
    }
    
    // Try case-insensitive match
    const lowerName = teamName.toLowerCase();
    const matchingKey = Object.keys(classifications).find(key => 
      key.toLowerCase() === lowerName
    );
    
    if (matchingKey && classifications[matchingKey] === 'fcs') {
      console.log(`${teamName} is FCS (case-insensitive match via ${matchingKey})`);
      return true;
    }
    
    console.log(`${teamName} is NOT FCS (no match found)`);
    return false;
  };
  
  // Cross-reference data state
  const [crossRefData, setCrossRefData] = useState({});
  const [enableCrossRef, setEnableCrossRef] = useState(false);
  const [crossRefCollections, setCrossRefCollections] = useState({
    standings: true,
    stats: false,
    injuries: false,
    // Add more collections as needed
  });

  const fetchGames = async () => {
    setLoading(true);
    
    // First fetch team classifications if not already loaded
    let classifications = teamClassifications;
    if (Object.keys(classifications).length === 0) {
      classifications = await fetchTeamClassifications();
    }
    
    let allGames = [];

    if (week === "all") {
      const weekNumbers = Array.from({ length: 20 }, (_, i) => i + 1);
      for (const w of weekNumbers) {
        const snap = await getDocs(
          collection(db, "schedule", "2025", "weeks", String(w), "games")
        );
        const gamesWithWeek = snap.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
          week: w,
        }));
        allGames = [...allGames, ...gamesWithWeek];
      }
    } else {
      const snap = await getDocs(
        collection(db, "schedule", "2025", "weeks", String(week), "games")
      );
      allGames = snap.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
        week: parseInt(week),
      }));
    }

    // Filter out FCS vs FCS games at the data level if excludeFCSGames is true
    if (excludeFCSGames) {
      const originalCount = allGames.length;
      allGames = allGames.filter((game) => {
        const awayIsFCS = isFCSTeam(game.awayTeam, classifications);
        const homeIsFCS = isFCSTeam(game.homeTeam, classifications);
        const isFCSvsFCS = awayIsFCS && homeIsFCS;
        
        if (isFCSvsFCS) {
          console.log(`Excluding FCS vs FCS game: ${game.awayTeam} @ ${game.homeTeam}`);
        }
        
        // Keep game if at least one team is NOT FCS
        return !isFCSvsFCS;
      });
      console.log(`Filtered out ${originalCount - allGames.length} FCS vs FCS games`);
    }

    setGames(allGames);
    
    // Fetch cross-reference data if enabled
    if (enableCrossRef) {
      await fetchCrossReferenceData(allGames);
    }
    
    setLoading(false);
  };

  // Fetch cross-reference data from other collections
  const fetchCrossReferenceData = async (gamesList) => {
    const crossRef = {};
    
    try {
      // Get unique teams and weeks from games
      const teamsSet = new Set();
      const weeksSet = new Set();
      
      gamesList.forEach(game => {
        if (game.awayTeam) teamsSet.add(game.awayTeam);
        if (game.homeTeam) teamsSet.add(game.homeTeam);
        weeksSet.add(game.week);
      });

      const teams = Array.from(teamsSet);
      const weeks = Array.from(weeksSet);

      // Fetch standings data if enabled
      if (crossRefCollections.standings) {
        for (const w of weeks) {
          try {
            const standingsSnap = await getDocs(
              collection(db, "standings", "2025", "weeks", String(w), "teams")
            );
            standingsSnap.docs.forEach(doc => {
              const teamData = doc.data();
              const key = `${teamData.team}-${w}-standings`;
              crossRef[key] = {
                wins: teamData.wins || 0,
                losses: teamData.losses || 0,
                winPct: teamData.winPct || 0,
                pointsFor: teamData.pointsFor || 0,
                pointsAgainst: teamData.pointsAgainst || 0,
              };
            });
          } catch (err) {
            console.log(`No standings data for week ${w}`);
          }
        }
      }

      // Fetch team stats if enabled
      if (crossRefCollections.stats) {
        for (const team of teams) {
          for (const w of weeks) {
            try {
              const statsSnap = await getDocs(
                collection(db, "stats", "2025", "weeks", String(w), "teams")
              );
              const teamStats = statsSnap.docs.find(doc => doc.data().team === team);
              if (teamStats) {
                const key = `${team}-${w}-stats`;
                crossRef[key] = teamStats.data();
              }
            } catch (err) {
              console.log(`No stats data for ${team} week ${w}`);
            }
          }
        }
      }

      // Fetch injury data if enabled
      if (crossRefCollections.injuries) {
        for (const team of teams) {
          try {
            const injuriesSnap = await getDocs(
              collection(db, "injuries", "2025", "teams", team, "players")
            );
            const injuries = injuriesSnap.docs.map(doc => doc.data());
            crossRef[`${team}-injuries`] = injuries;
          } catch (err) {
            console.log(`No injury data for ${team}`);
          }
        }
      }

      setCrossRefData(crossRef);
    } catch (error) {
      console.error("Error fetching cross-reference data:", error);
    }
  };

  useEffect(() => {
    fetchGames();
  }, [week, enableCrossRef, crossRefCollections, excludeFCSGames]);

  const handleUpdate = async (id, field, value, gameWeek = week) => {
    const gameRef = doc(
      db,
      "schedule",
      "2025",
      "weeks",
      String(gameWeek),
      "games",
      id
    );
    await updateDoc(gameRef, { [field]: value });
    setGames((prev) =>
      prev.map((g) =>
        g.id === id && g.week === gameWeek ? { ...g, [field]: value } : g
      )
    );
  };

  const handleDelete = async (id, gameWeek = week) => {
    if (!window.confirm("Delete this game?")) return;
    const gameRef = doc(
      db,
      "schedule",
      "2025",
      "weeks",
      String(gameWeek),
      "games",
      id
    );
    await deleteDoc(gameRef);
    setGames((prev) => prev.filter((g) => !(g.id === id && g.week === gameWeek)));
  };

  // Helper function to copy game path to clipboard
  const copyGamePath = (gameId, gameWeek) => {
    const path = `schedule/2025/weeks/${gameWeek}/games/${gameId}`;
    navigator.clipboard.writeText(path);
    alert(`Copied to clipboard: ${path}`);
  };

  // Helper function to open Firebase console
  const openInFirebase = (gameId, gameWeek) => {
    const projectId = "YOUR_PROJECT_ID"; // Replace with your actual project ID
    const path = `schedule%2F2025%2Fweeks%2F${gameWeek}%2Fgames%2F${gameId}`;
    const url = `https://console.firebase.google.com/project/${projectId}/firestore/data/~2F${path}`;
    window.open(url, '_blank');
  };

  // Enhanced filtering logic
  const getFilteredAndSortedGames = () => {
    let filtered = games;

    if (search.trim()) {
      const searchLower = search.toLowerCase();
      filtered = games.filter((g) => {
        switch (searchType) {
          case "teams":
            return (
              g.awayTeam?.toLowerCase().includes(searchLower) ||
              g.homeTeam?.toLowerCase().includes(searchLower)
            );
          case "venue":
            return g.venue?.toLowerCase().includes(searchLower);
          case "matchup":
            const matchup = `${g.awayTeam} @ ${g.homeTeam}`.toLowerCase();
            const reverseMatchup = `${g.homeTeam} vs ${g.awayTeam}`.toLowerCase();
            return matchup.includes(searchLower) || reverseMatchup.includes(searchLower);
          case "id":
            return g.id?.toLowerCase().includes(searchLower);
          default: // "all"
            return (
              g.awayTeam?.toLowerCase().includes(searchLower) ||
              g.homeTeam?.toLowerCase().includes(searchLower) ||
              g.venue?.toLowerCase().includes(searchLower) ||
              g.gameStatus?.toLowerCase().includes(searchLower) ||
              g.date?.toLowerCase().includes(searchLower) ||
              String(g.week).includes(searchLower) ||
              String(g.awayScore).includes(searchLower) ||
              String(g.homeScore).includes(searchLower) ||
              String(g.homeSpread).includes(searchLower) ||
              g.id?.toLowerCase().includes(searchLower)
            );
        }
      });
    }

    // Apply status filter
    if (statusFilter) {
      filtered = filtered.filter((g) => g.gameStatus === statusFilter);
    }

    // Note: FCS filtering now happens at data fetch level, not here

    filtered.sort((a, b) => {
      switch (sortBy) {
        case "gameId":
          return (a.id || "").localeCompare(b.id || "");
        case "week":
          return a.week - b.week;
        case "awayTeam":
          return (a.awayTeam || "").localeCompare(b.awayTeam || "");
        case "awayScore":
          return (parseInt(a.awayScore) || 0) - (parseInt(b.awayScore) || 0);
        case "homeTeam":
          return (a.homeTeam || "").localeCompare(b.homeTeam || "");
        case "homeScore":
          return (parseInt(a.homeScore) || 0) - (parseInt(b.homeScore) || 0);
        case "homeSpread":
          return (parseFloat(a.homeSpread) || 0) - (parseFloat(b.homeSpread) || 0);
        case "gameStatus":
          return (a.gameStatus || "").localeCompare(b.gameStatus || "");
        case "gameComplete":
          return (a.gameComplete === b.gameComplete) ? 0 : a.gameComplete ? 1 : -1;
        case "date":
          return new Date(a.date || 0) - new Date(b.date || 0);
        default:
          return 0;
      }
    });

    return filtered;
  };

  const filteredGames = getFilteredAndSortedGames();

  // Get cross-reference data for a team/week
  const getCrossRefData = (team, week, type) => {
    const key = `${team}-${week}-${type}`;
    return crossRefData[key] || {};
  };

  const getInjuryData = (team) => {
    const key = `${team}-injuries`;
    return crossRefData[key] || [];
  };

  // Quick search presets
  const quickSearches = [
    { label: "Today's Games", action: () => {
      const today = new Date().toISOString().split('T')[0];
      setSearch(today);
      setSearchType("all");
    }},
    { label: "Final Games", action: () => {
      setStatusFilter("final");
      setSearch("");
    }},
    { label: "In Progress", action: () => {
      setStatusFilter("in-progress");
      setSearch("");
    }},
    { label: "Clear Filters", action: () => {
      setSearch("");
      setSearchType("all");
      setStatusFilter("");
      setExcludeFCSGames(true); // Keep FCS exclusion as default
    }}
  ];

  return (
    <div style={{ padding: "2rem" }}>
      <h2>Admin Panel: Schedule</h2>

      {/* Controls Section */}
      <div style={{ 
        display: "flex", 
        gap: "1rem", 
        flexWrap: "wrap", 
        alignItems: "center",
        marginBottom: "1rem",
        backgroundColor: "#f8f9fa",
        padding: "1rem",
        borderRadius: "8px"
      }}>
        <label>
          Week:{" "}
          <select value={week} onChange={(e) => setWeek(e.target.value)}>
            <option value="all">All Weeks</option>
            {Array.from({ length: 20 }, (_, i) => i + 1).map((w) => (
              <option key={w} value={String(w)}>
                Week {w}
              </option>
            ))}
          </select>
        </label>

        <label>
          Search Type:{" "}
          <select value={searchType} onChange={(e) => setSearchType(e.target.value)}>
            <option value="all">All Fields</option>
            <option value="teams">Teams Only</option>
            <option value="matchup">Matchups</option>
            <option value="venue">Venue</option>
            <option value="id">Game ID</option>
          </select>
        </label>

        <label>
          Status:{" "}
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">All Statuses</option>
            <option value="scheduled">Scheduled</option>
            <option value="in-progress">In Progress</option>
            <option value="final">Final</option>
          </select>
        </label>

        <label>
          Sort By:{" "}
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
            <option value="date">Date</option>
            <option value="week">Week</option>
            <option value="gameId">Game ID</option>
            <option value="awayTeam">Away Team</option>
            <option value="awayScore">Away Score</option>
            <option value="homeTeam">Home Team</option>
            <option value="homeScore">Home Score</option>
            <option value="homeSpread">Home Spread</option>
            <option value="gameStatus">Status</option>
            <option value="gameComplete">Complete</option>
          </select>
        </label>

        <label style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <input 
            type="checkbox" 
            checked={excludeFCSGames} 
            onChange={(e) => setExcludeFCSGames(e.target.checked)}
          />
          Exclude FCS vs FCS Games
        </label>
      </div>

      {/* Cross-Reference Controls */}
      <div style={{ 
        backgroundColor: "#e3f2fd", 
        padding: "1rem", 
        borderRadius: "8px", 
        marginBottom: "1rem" 
      }}>
        <label style={{ display: "flex", alignItems: "center", marginBottom: "0.5rem" }}>
          <input 
            type="checkbox" 
            checked={enableCrossRef} 
            onChange={(e) => setEnableCrossRef(e.target.checked)}
            style={{ marginRight: "0.5rem" }}
          />
          Enable Cross-Reference Data (slower loading)
        </label>
        
        {enableCrossRef && (
          <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
            <label>
              <input 
                type="checkbox" 
                checked={crossRefCollections.standings} 
                onChange={(e) => setCrossRefCollections(prev => ({...prev, standings: e.target.checked}))}
              />
              {" "}Standings
            </label>
            <label>
              <input 
                type="checkbox" 
                checked={crossRefCollections.stats} 
                onChange={(e) => setCrossRefCollections(prev => ({...prev, stats: e.target.checked}))}
              />
              {" "}Team Stats
            </label>
            <label>
              <input 
                type="checkbox" 
                checked={crossRefCollections.injuries} 
                onChange={(e) => setCrossRefCollections(prev => ({...prev, injuries: e.target.checked}))}
              />
              {" "}Injuries
            </label>
          </div>
        )}
      </div>

      {/* Search Input */}
      <div style={{ margin: "1rem 0" }}>
        <input
          type="text"
          placeholder={`Search ${searchType === "all" ? "across all fields" : searchType}...`}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ 
            width: "100%", 
            padding: "0.75rem", 
            fontSize: "1rem",
            border: "2px solid #ddd",
            borderRadius: "4px"
          }}
        />
      </div>

      {/* Quick Search Buttons */}
      <div style={{ 
        display: "flex", 
        gap: "0.5rem", 
        flexWrap: "wrap", 
        marginBottom: "1rem" 
      }}>
        {quickSearches.map((qs, idx) => (
          <button
            key={idx}
            onClick={qs.action}
            style={{
              padding: "0.5rem 1rem",
              backgroundColor: "#007bff",
              color: "white",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
              fontSize: "0.875rem"
            }}
            onMouseOver={(e) => e.target.style.backgroundColor = "#0056b3"}
            onMouseOut={(e) => e.target.style.backgroundColor = "#007bff"}
          >
            {qs.label}
          </button>
        ))}
      </div>

      {/* Results Count */}
      <p style={{ 
        marginBottom: "1rem", 
        fontSize: "0.9rem", 
        color: "#666" 
      }}>
        Showing {filteredGames.length} of {games.length} games
        {search && ` • Search: "${search}"`}
        {statusFilter && ` • Status: ${statusFilter}`}
        {excludeFCSGames && ` • FCS vs FCS Excluded`}
      </p>

      {loading ? (
        <p>Loading games{enableCrossRef ? " and cross-reference data" : ""}...</p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ 
            width: "100%", 
            borderCollapse: "collapse", 
            fontSize: "0.85rem",
            backgroundColor: "white",
            boxShadow: "0 2px 4px rgba(0,0,0,0.1)"
          }}>
            <thead>
              <tr style={{ backgroundColor: "#f0f0f0" }}>
                <th style={{ padding: "0.75rem", textAlign: "left", borderBottom: "2px solid #ddd", minWidth: "100px" }}>Game ID</th>
                <th style={{ padding: "0.75rem", textAlign: "left", borderBottom: "2px solid #ddd" }}>Week</th>
                <th style={{ padding: "0.75rem", textAlign: "left", borderBottom: "2px solid #ddd" }}>Away Team</th>
                <th style={{ padding: "0.75rem", textAlign: "left", borderBottom: "2px solid #ddd" }}>Away Score</th>
                <th style={{ padding: "0.75rem", textAlign: "left", borderBottom: "2px solid #ddd" }}>Home Team</th>
                <th style={{ padding: "0.75rem", textAlign: "left", borderBottom: "2px solid #ddd" }}>Home Score</th>
                <th style={{ padding: "0.75rem", textAlign: "left", borderBottom: "2px solid #ddd" }}>Home Spread</th>
                <th style={{ padding: "0.75rem", textAlign: "left", borderBottom: "2px solid #ddd" }}>Status</th>
                <th style={{ padding: "0.75rem", textAlign: "left", borderBottom: "2px solid #ddd" }}>Complete</th>
                {enableCrossRef && crossRefCollections.standings && (
                  <>
                    <th style={{ padding: "0.75rem", textAlign: "left", borderBottom: "2px solid #ddd", backgroundColor: "#e3f2fd" }}>Away Record</th>
                    <th style={{ padding: "0.75rem", textAlign: "left", borderBottom: "2px solid #ddd", backgroundColor: "#e3f2fd" }}>Home Record</th>
                  </>
                )}
                {enableCrossRef && crossRefCollections.injuries && (
                  <>
                    <th style={{ padding: "0.75rem", textAlign: "left", borderBottom: "2px solid #ddd", backgroundColor: "#fff3e0" }}>Away Injuries</th>
                    <th style={{ padding: "0.75rem", textAlign: "left", borderBottom: "2px solid #ddd", backgroundColor: "#fff3e0" }}>Home Injuries</th>
                  </>
                )}
                <th style={{ padding: "0.75rem", textAlign: "left", borderBottom: "2px solid #ddd" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredGames.map((g) => {
                const awayStandings = getCrossRefData(g.awayTeam, g.week, "standings");
                const homeStandings = getCrossRefData(g.homeTeam, g.week, "standings");
                const awayInjuries = getInjuryData(g.awayTeam);
                const homeInjuries = getInjuryData(g.homeTeam);
                
                return (
                  <tr 
                    key={`${g.week}-${g.id}`} 
                    style={{ 
                      borderBottom: "1px solid #eee",
                      backgroundColor: g.gameComplete ? "#f8f9fa" : "white"
                    }}
                  >
                    <td style={{ padding: "0.5rem" }}>
                      <div style={{ 
                        fontFamily: "monospace", 
                        fontSize: "0.8rem",
                        backgroundColor: "#f8f9fa",
                        padding: "0.25rem",
                        borderRadius: "3px",
                        cursor: "pointer",
                        maxWidth: "100px",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap"
                      }}
                      title={`Click to copy: ${g.id}`}
                      onClick={() => copyGamePath(g.id, g.week)}
                      >
                        {g.id}
                      </div>
                    </td>
                    <td style={{ padding: "0.5rem" }}>{g.week}</td>
                    <td style={{ padding: "0.5rem" }}>
                      <input
                        value={g.awayTeam || ""}
                        onChange={(e) => handleUpdate(g.id, "awayTeam", e.target.value, g.week)}
                        style={{ width: "100%", border: "1px solid #ddd", padding: "0.25rem", fontSize: "0.85rem" }}
                      />
                    </td>
                    <td style={{ padding: "0.5rem" }}>
                      <input
                        type="number"
                        value={g.awayScore ?? ""}
                        onChange={(e) =>
                          handleUpdate(g.id, "awayScore", parseInt(e.target.value) || 0, g.week)
                        }
                        style={{ width: "60px", border: "1px solid #ddd", padding: "0.25rem", fontSize: "0.85rem" }}
                      />
                    </td>
                    <td style={{ padding: "0.5rem" }}>
                      <input
                        value={g.homeTeam || ""}
                        onChange={(e) => handleUpdate(g.id, "homeTeam", e.target.value, g.week)}
                        style={{ width: "100%", border: "1px solid #ddd", padding: "0.25rem", fontSize: "0.85rem" }}
                      />
                    </td>
                    <td style={{ padding: "0.5rem" }}>
                      <input
                        type="number"
                        value={g.homeScore ?? ""}
                        onChange={(e) =>
                          handleUpdate(g.id, "homeScore", parseInt(e.target.value) || 0, g.week)
                        }
                        style={{ width: "60px", border: "1px solid #ddd", padding: "0.25rem", fontSize: "0.85rem" }}
                      />
                    </td>
                    <td style={{ padding: "0.5rem" }}>
                      <input
                        type="number"
                        step="0.5"
                        value={g.homeSpread ?? ""}
                        onChange={(e) => handleUpdate(g.id, "homeSpread", parseFloat(e.target.value), g.week)}
                        style={{ width: "70px", border: "1px solid #ddd", padding: "0.25rem", fontSize: "0.85rem" }}
                      />
                    </td>
                    <td style={{ padding: "0.5rem" }}>
                      <select
                        value={g.gameStatus || "scheduled"}
                        onChange={(e) => handleUpdate(g.id, "gameStatus", e.target.value, g.week)}
                        style={{ width: "100%", border: "1px solid #ddd", padding: "0.25rem", fontSize: "0.85rem" }}
                      >
                        <option value="scheduled">Scheduled</option>
                        <option value="in-progress">In Progress</option>
                        <option value="final">Final</option>
                      </select>
                    </td>
                    <td style={{ padding: "0.5rem", textAlign: "center" }}>
                      <input
                        type="checkbox"
                        checked={g.gameComplete || false}
                        onChange={(e) => handleUpdate(g.id, "gameComplete", e.target.checked, g.week)}
                      />
                    </td>
                    
                    {/* Cross-reference columns */}
                    {enableCrossRef && crossRefCollections.standings && (
                      <>
                        <td style={{ padding: "0.5rem", fontSize: "0.8rem", backgroundColor: "#f3f8ff" }}>
                          {awayStandings.wins !== undefined ? 
                            `${awayStandings.wins}-${awayStandings.losses} (${(awayStandings.winPct * 100).toFixed(1)}%)` 
                            : "N/A"
                          }
                        </td>
                        <td style={{ padding: "0.5rem", fontSize: "0.8rem", backgroundColor: "#f3f8ff" }}>
                          {homeStandings.wins !== undefined ? 
                            `${homeStandings.wins}-${homeStandings.losses} (${(homeStandings.winPct * 100).toFixed(1)}%)` 
                            : "N/A"
                          }
                        </td>
                      </>
                    )}
                    
                    {enableCrossRef && crossRefCollections.injuries && (
                      <>
                        <td style={{ padding: "0.5rem", fontSize: "0.8rem", backgroundColor: "#fffbf0" }}>
                          {awayInjuries.length > 0 ? 
                            <span title={awayInjuries.map(inj => `${inj.player}: ${inj.status}`).join('\n')}>
                              {awayInjuries.length} injured
                            </span>
                            : "Healthy"
                          }
                        </td>
                        <td style={{ padding: "0.5rem", fontSize: "0.8rem", backgroundColor: "#fffbf0" }}>
                          {homeInjuries.length > 0 ? 
                            <span title={homeInjuries.map(inj => `${inj.player}: ${inj.status}`).join('\n')}>
                              {homeInjuries.length} injured
                            </span>
                            : "Healthy"
                          }
                        </td>
                      </>
                    )}
                    
                    <td style={{ padding: "0.5rem", textAlign: "center" }}>
                      <div style={{ display: "flex", gap: "0.5rem", justifyContent: "center" }}>
                        <button
                          onClick={() => openInFirebase(g.id, g.week)}
                          style={{ 
                            background: "#4285f4", 
                            color: "white",
                            border: "none", 
                            cursor: "pointer",
                            fontSize: "0.75rem",
                            padding: "0.25rem 0.5rem",
                            borderRadius: "3px"
                          }}
                          title="Open in Firebase Console"
                        >
                          🔗
                        </button>
                        <button
                          onClick={() => handleDelete(g.id, g.week)}
                          style={{ 
                            color: "red", 
                            fontWeight: "bold", 
                            background: "none", 
                            border: "none", 
                            cursor: "pointer",
                            fontSize: "1.2rem"
                          }}
                          title="Delete game"
                        >
                          🗑
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {filteredGames.length === 0 && !loading && (
        <div style={{ 
          textAlign: "center", 
          padding: "2rem", 
          backgroundColor: "#f8f9fa", 
          borderRadius: "8px",
          marginTop: "1rem"
        }}>
          <p>No games found matching your search criteria.</p>
          <button 
            onClick={() => {
              setSearch("");
              setSearchType("all");
              setStatusFilter("");
              setExcludeFCSGames(true);
            }}
            style={{
              marginTop: "1rem",
              padding: "0.5rem 1rem",
              backgroundColor: "#007bff",
              color: "white",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer"
            }}
          >
            Clear All Filters
          </button>
        </div>
      )}
    </div>
  );
}

export default AdminSchedulePanel;