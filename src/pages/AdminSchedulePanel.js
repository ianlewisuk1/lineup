import React, { useEffect, useState } from "react";
import { supabase } from "../supabase/supabase";
import { SEASON_YEAR } from "../utils/season";

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
      const { data: teamsData } = await supabase.from("teams").select("*");
      const classifications = {};
      (teamsData || []).forEach(teamData => {
        // Store by document ID
        classifications[teamData.id] = teamData.classification || 'fbs';

        // Store by alternate names if they exist
        if (teamData.alternateNames1) {
          classifications[teamData.alternateNames1] = teamData.classification || 'fbs';
        }
        if (teamData.alternateNames2) {
          classifications[teamData.alternateNames2] = teamData.classification || 'fbs';
        }

        // Also try common variations
        const docIdVariations = [
          teamData.id,
          teamData.id.replace(/-/g, ' '), // "alabama-a-m" -> "alabama a m"
          teamData.id.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()), // "Alabama A M"
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
      const { data: gamesData } = await supabase.from("games").select("*").eq("year", SEASON_YEAR);
      allGames = (gamesData || []).map(g => ({ ...g, week: g.week }));
    } else {
      const { data: gamesData } = await supabase.from("games").select("*").eq("year", SEASON_YEAR).eq("week", String(week));
      allGames = (gamesData || []).map(g => ({ ...g, week: parseInt(week) }));
    }

    // Filter out FCS vs FCS games at the data level if excludeFCSGames is true
    if (excludeFCSGames) {
      const originalCount = allGames.length;
      allGames = allGames.filter((game) => {
        const awayIsFCS = isFCSTeam(game.away_team, classifications);
        const homeIsFCS = isFCSTeam(game.home_team, classifications);
        const isFCSvsFCS = awayIsFCS && homeIsFCS;

        if (isFCSvsFCS) {
          console.log(`Excluding FCS vs FCS game: ${game.away_team} @ ${game.home_team}`);
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
        if (game.away_team) teamsSet.add(game.away_team);
        if (game.home_team) teamsSet.add(game.home_team);
        weeksSet.add(game.week);
      });

      const weeks = Array.from(weeksSet);

      // Fetch standings data if enabled (using weekly_standings table)
      if (crossRefCollections.standings) {
        for (const w of weeks) {
          try {
            const { data: standingsData } = await supabase.from("weekly_standings").select("*").eq("week", String(w));
            (standingsData || []).forEach(teamData => {
              const key = `${teamData.team_name}-${w}-standings`;
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

      setCrossRefData(crossRef);
    } catch (error) {
      console.error("Error fetching cross-reference data:", error);
    }
  };

  useEffect(() => {
    fetchGames();
  }, [week, enableCrossRef, crossRefCollections, excludeFCSGames]);

  const handleUpdate = async (id, field, value) => {
    await supabase.from("games").update({ [field]: value }).eq("id", id);
    setGames((prev) =>
      prev.map((g) =>
        g.id === id ? { ...g, [field]: value } : g
      )
    );
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this game?")) return;
    await supabase.from("games").delete().eq("id", id);
    setGames((prev) => prev.filter((g) => g.id !== id));
  };

  // Helper function to copy game path to clipboard
  const copyGamePath = (gameId, gameWeek) => {
    const path = `games/${gameId} (week ${gameWeek})`;
    navigator.clipboard.writeText(path);
    alert(`Copied to clipboard: ${path}`);
  };

  const openInSupabase = (gameId, gameWeek) => {
    alert(`Game ID: ${gameId} (Week ${gameWeek})`);
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
              g.away_team?.toLowerCase().includes(searchLower) ||
              g.home_team?.toLowerCase().includes(searchLower)
            );
          case "venue":
            return g.venue?.toLowerCase().includes(searchLower);
          case "matchup":
            const matchup = `${g.away_team} @ ${g.home_team}`.toLowerCase();
            const reverseMatchup = `${g.home_team} vs ${g.away_team}`.toLowerCase();
            return matchup.includes(searchLower) || reverseMatchup.includes(searchLower);
          case "id":
            return g.id?.toLowerCase().includes(searchLower);
          default: // "all"
            return (
              g.away_team?.toLowerCase().includes(searchLower) ||
              g.home_team?.toLowerCase().includes(searchLower) ||
              g.venue?.toLowerCase().includes(searchLower) ||
              g.game_status?.toLowerCase().includes(searchLower) ||
              g.date?.toLowerCase().includes(searchLower) ||
              String(g.week).includes(searchLower) ||
              String(g.away_score).includes(searchLower) ||
              String(g.home_score).includes(searchLower) ||
              String(g.home_spread).includes(searchLower) ||
              g.id?.toLowerCase().includes(searchLower)
            );
        }
      });
    }

    // Apply status filter
    if (statusFilter) {
      filtered = filtered.filter((g) => g.game_status === statusFilter);
    }

    // Note: FCS filtering now happens at data fetch level, not here

    filtered.sort((a, b) => {
      switch (sortBy) {
        case "gameId":
          return (a.id || "").localeCompare(b.id || "");
        case "week":
          return a.week - b.week;
        case "awayTeam":
          return (a.away_team || "").localeCompare(b.away_team || "");
        case "awayScore":
          return (parseInt(a.away_score) || 0) - (parseInt(b.away_score) || 0);
        case "homeTeam":
          return (a.home_team || "").localeCompare(b.home_team || "");
        case "homeScore":
          return (parseInt(a.home_score) || 0) - (parseInt(b.home_score) || 0);
        case "homeSpread":
          return (parseFloat(a.home_spread) || 0) - (parseFloat(b.home_spread) || 0);
        case "gameStatus":
          return (a.game_status || "").localeCompare(b.game_status || "");
        case "gameComplete":
          return (a.game_complete === b.game_complete) ? 0 : a.game_complete ? 1 : -1;
        case "date":
          return new Date(a.game_time || 0) - new Date(b.game_time || 0);
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
                const awayStandings = getCrossRefData(g.away_team, g.week, "standings");
                const homeStandings = getCrossRefData(g.home_team, g.week, "standings");
                const awayInjuries = getInjuryData(g.away_team);
                const homeInjuries = getInjuryData(g.home_team);

                return (
                  <tr
                    key={`${g.week}-${g.id}`}
                    style={{
                      borderBottom: "1px solid #eee",
                      backgroundColor: g.game_complete ? "#f8f9fa" : "white"
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
                        value={g.away_team || ""}
                        onChange={(e) => handleUpdate(g.id, "away_team", e.target.value)}
                        style={{ width: "100%", border: "1px solid #ddd", padding: "0.25rem", fontSize: "0.85rem" }}
                      />
                    </td>
                    <td style={{ padding: "0.5rem" }}>
                      <input
                        type="number"
                        value={g.away_score ?? ""}
                        onChange={(e) =>
                          handleUpdate(g.id, "away_score", parseInt(e.target.value) || 0)
                        }
                        style={{ width: "60px", border: "1px solid #ddd", padding: "0.25rem", fontSize: "0.85rem" }}
                      />
                    </td>
                    <td style={{ padding: "0.5rem" }}>
                      <input
                        value={g.home_team || ""}
                        onChange={(e) => handleUpdate(g.id, "home_team", e.target.value)}
                        style={{ width: "100%", border: "1px solid #ddd", padding: "0.25rem", fontSize: "0.85rem" }}
                      />
                    </td>
                    <td style={{ padding: "0.5rem" }}>
                      <input
                        type="number"
                        value={g.home_score ?? ""}
                        onChange={(e) =>
                          handleUpdate(g.id, "home_score", parseInt(e.target.value) || 0)
                        }
                        style={{ width: "60px", border: "1px solid #ddd", padding: "0.25rem", fontSize: "0.85rem" }}
                      />
                    </td>
                    <td style={{ padding: "0.5rem" }}>
                      <input
                        type="number"
                        step="0.5"
                        value={g.home_spread ?? ""}
                        onChange={(e) => handleUpdate(g.id, "home_spread", parseFloat(e.target.value))}
                        style={{ width: "70px", border: "1px solid #ddd", padding: "0.25rem", fontSize: "0.85rem" }}
                      />
                    </td>
                    <td style={{ padding: "0.5rem" }}>
                      <select
                        value={g.game_status || "scheduled"}
                        onChange={(e) => handleUpdate(g.id, "game_status", e.target.value)}
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
                        checked={g.game_complete || false}
                        onChange={(e) => handleUpdate(g.id, "game_complete", e.target.checked)}
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
                          onClick={() => openInSupabase(g.id, g.week)}
                          style={{
                            background: "#4285f4",
                            color: "white",
                            border: "none",
                            cursor: "pointer",
                            fontSize: "0.75rem",
                            padding: "0.25rem 0.5rem",
                            borderRadius: "3px"
                          }}
                          title="View game info"
                        >
                          🔗
                        </button>
                        <button
                          onClick={() => handleDelete(g.id)}
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
