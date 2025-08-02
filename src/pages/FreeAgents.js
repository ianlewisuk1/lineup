import React, { useEffect, useState } from "react";
import { db, auth } from "../firebase/firebase";
import {
  collection,
  getDocs,
  getDoc,
  doc,
  updateDoc,
} from "firebase/firestore";
import { useParams, useNavigate } from "react-router-dom";
import { Plus, Search, Filter } from "lucide-react";
import LeagueNavBar from "../components/LeagueNavBar";

function FreeAgents() {
  const { leagueId } = useParams();
  const navigate = useNavigate();
  const [teamsByConference, setTeamsByConference] = useState({});
  const [conferenceList, setConferenceList] = useState([]);
  const [activeConference, setActiveConference] = useState("National");
  const [draftedTeams, setDraftedTeams] = useState({});
  const [loading, setLoading] = useState(true);
  const [userTeams, setUserTeams] = useState([]);
  const [selectedDropTeam, setSelectedDropTeam] = useState("");
  const [pendingAddTeam, setPendingAddTeam] = useState("");
  const [showSwapUI, setShowSwapUI] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [teamToAdd, setTeamToAdd] = useState(null);
  const [sortConfig, setSortConfig] = useState({ key: "school", direction: "asc" });
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    const fetchData = async () => {
      const teamsSnap = await getDocs(collection(db, "teams"));
      const membersSnap = await getDocs(collection(db, "leagues", leagueId, "members"));

      const teamsMap = {};
      const drafted = {};
      membersSnap.forEach(doc => {
        const { displayName, teamName, lineup } = doc.data();
        const starters = lineup?.starters || [];
        const bench = lineup?.bench || [];
        const current = [...starters, ...bench];

        current.forEach(team => {
          drafted[team] = {
            ownerName: displayName,
            teamName: teamName || "Unnamed Squad"
          };
        });
      });

      teamsSnap.forEach(doc => {
        const data = doc.data();
        if ((data.classification || "").toUpperCase() !== "FBS") return;

        const conf = data.conference || "Unknown";
        if (!teamsMap[conf]) teamsMap[conf] = [];

        teamsMap[conf].push({
          id: doc.id,
          ...data,
          logo: data.logos1 || data.logos2 || null,
          currentWeekPoints: data.currentSeason?.currentWeekPoints || null,
          gameComplete: data.currentSeason?.gameComplete || false,
          color: data.color || null
        });
      });

      const sortedConf = Object.keys(teamsMap).sort();
      setConferenceList(["National", ...sortedConf]);
      setTeamsByConference(teamsMap);
      setActiveConference("National");
      setDraftedTeams(drafted);

      const user = auth.currentUser;
      if (!user) return;

      const memberRef = doc(db, "leagues", leagueId, "members", user.uid);
      const memberSnap = await getDoc(memberRef);
      const lineup = memberSnap.data()?.lineup || {};

      const starters = lineup.starters || [];
      const bench = lineup.bench || [];
      setUserTeams([...starters, ...bench].filter(Boolean));

      setLoading(false);
    };

    fetchData();
  }, [leagueId]);

  const handleTeamClick = (teamName) => {
    navigate(`/${leagueId}/team/${encodeURIComponent(teamName)}`);
  };

  const handleAddTeam = (team) => {
    const user = auth.currentUser;
    if (!user) return;

    if (userTeams.length < 7) {
      // Show add confirmation modal
      setTeamToAdd(team);
      setShowAddModal(true);
    } else {
      // Show swap UI for full roster
      setPendingAddTeam(team.school);
      setSelectedDropTeam("");
      setShowSwapUI(true);
    }
  };

  const confirmAddTeam = async () => {
    if (!teamToAdd) return;
    
    try {
      const user = auth.currentUser;
      if (!user) return;

      const memberRef = doc(db, "leagues", leagueId, "members", user.uid);
      const memberSnap = await getDoc(memberRef);
      const memberData = memberSnap.data();
      
      const lineup = memberData?.lineup || {};
      const starters = [...(lineup.starters || [])];
      const bench = [...(lineup.bench || [])];
      
      // Add to first empty starter slot, or first empty bench slot
      const emptyStarterIndex = starters.findIndex(t => !t);
      const emptyBenchIndex = bench.findIndex(t => !t);
      
      if (emptyStarterIndex !== -1) {
        starters[emptyStarterIndex] = teamToAdd.school;
      } else if (emptyBenchIndex !== -1) {
        bench[emptyBenchIndex] = teamToAdd.school;
      } else {
        // This shouldn't happen since we check length < 7
        alert("Roster is full!");
        return;
      }

      await updateDoc(memberRef, {
        "lineup.starters": starters,
        "lineup.bench": bench
      });

      // Update local state
      setUserTeams([...starters, ...bench].filter(Boolean));
      setShowAddModal(false);
      setTeamToAdd(null);
      
      alert(`✅ ${teamToAdd.school} has been added to your lineup!`);
      
    } catch (error) {
      console.error("Error adding team:", error);
      alert("Failed to add team. Please try again.");
    }
  };

  const handleConfirmSwap = async () => {
    if (!selectedDropTeam || !pendingAddTeam) return;
    
    try {
      const user = auth.currentUser;
      if (!user) return;

      const memberRef = doc(db, "leagues", leagueId, "members", user.uid);
      const memberSnap = await getDoc(memberRef);
      const memberData = memberSnap.data();
      
      const lineup = memberData?.lineup || {};
      const starters = [...(lineup.starters || [])];
      const bench = [...(lineup.bench || [])];
      
      // Find and replace the dropped team with the new team
      const starterIndex = starters.findIndex(t => t === selectedDropTeam);
      const benchIndex = bench.findIndex(t => t === selectedDropTeam);
      
      if (starterIndex !== -1) {
        starters[starterIndex] = pendingAddTeam;
      } else if (benchIndex !== -1) {
        bench[benchIndex] = pendingAddTeam;
      }

      await updateDoc(memberRef, {
        "lineup.starters": starters,
        "lineup.bench": bench
      });

      // Update local state
      setUserTeams([...starters, ...bench].filter(Boolean));
      setShowSwapUI(false);
      setPendingAddTeam("");
      setSelectedDropTeam("");
      
      alert(`✅ Swapped ${selectedDropTeam} for ${pendingAddTeam}!`);
      
    } catch (error) {
      console.error("Error swapping teams:", error);
      alert("Failed to swap teams. Please try again.");
    }
  };

  const getVisibleFreeAgents = () => {
    let teams;
    if (activeConference === "National") {
      teams = Object.values(teamsByConference)
        .flat()
        .filter(team => !draftedTeams[team.school]);
    } else {
      teams = (teamsByConference[activeConference] || []).filter(team => !draftedTeams[team.school]);
    }

    // Filter by search query
    if (searchQuery) {
      teams = teams.filter(team => 
        team.school.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    return teams;
  };

  const sortedTeams = [...getVisibleFreeAgents()].sort((a, b) => {
    const key = sortConfig.key;
    let aValue, bValue;
    
    if (key === "currentSeason.record") {
      aValue = a.currentSeason?.record || "0-0";
      bValue = b.currentSeason?.record || "0-0";
    } else if (key === "currentSeason.nextOpponent") {
      aValue = a.currentSeason?.nextOpponent || "";
      bValue = b.currentSeason?.nextOpponent || "";
    } else if (key === "gamePoints") {
      aValue = a.currentSeason?.gamePoints || 0;
      bValue = b.currentSeason?.gamePoints || 0;
    } else {
      aValue = a[key] || "";
      bValue = b[key] || "";
    }

    if (typeof aValue === "number" && typeof bValue === "number") {
      return sortConfig.direction === "asc" ? aValue - bValue : bValue - aValue;
    }

    return sortConfig.direction === "asc"
      ? String(aValue).localeCompare(String(bValue))
      : String(bValue).localeCompare(String(aValue));
  });

  const toggleSort = (key) => {
    setSortConfig((prev) => ({
      key,
      direction: prev.key === key && prev.direction === "asc" ? "desc" : "asc",
    }));
  };

  const formatNextGame = (season) => {
    if (!season?.nextOpponent) return "—";
    const isHome = season.nextGameIsHome;
    const spread = season.nextOpponentSpread ?? "TBD";
    const prefix = isHome === false ? "@" : isHome === true ? "vs" : "?";
    return `${prefix} ${season.nextOpponent} (${spread})`;
  };

  const TeamCard = ({ team }) => {
    const [expanded, setExpanded] = useState(false);

    const toggleExpanded = () => setExpanded(!expanded);

    return (
      <div style={{
        backgroundColor: "white",
        borderRadius: "12px",
        padding: "16px",
        marginBottom: "12px",
        boxShadow: "0 1px 3px rgba(0, 0, 0, 0.1)",
        border: "1px solid #e2e8f0",
        transition: "all 0.2s ease",
        position: "relative" // ← Add this to anchor absolute positioned children
      }}>
        {/* Weekly Points Badge */}
        <div style={{
          position: "absolute",
          top: "12px",
          right: "12px",
          backgroundColor: team?.gameComplete 
            ? (team?.currentWeekPoints > 0 ? "#059669" : "#6b7280")
            : "#f59e0b",
          color: "white",
          borderRadius: "6px",
          padding: "4px 8px",
          fontSize: "12px",
          fontWeight: "700",
          boxShadow: "0 2px 4px rgba(0, 0, 0, 0.2)"
        }}>
          {team?.gameComplete ? (team?.currentWeekPoints || 0) : "?"} pts
        </div>

        {/* Main Team Header */}
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: "12px",
          marginBottom: "12px"
        }}>
          {/* Team Logo */}
          <div style={{
            width: "48px",
            height: "48px",
            borderRadius: "50%",
            overflow: "hidden",
            border: "2px solid #e2e8f0",
            backgroundColor: "#f8fafc",
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center"
          }}>
            {team.logo ? (
              <img 
                src={team.logo}
                alt={team.school}
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover"
                }}
              />
            ) : (
              <div style={{
                fontSize: "14px",
                fontWeight: "700",
                color: "#64748b"
              }}>
                {team.school ? team.school.split(' ').map(word => word[0]).join('').slice(0, 3) : '?'}
              </div>
            )}
          </div>

          {/* Team Info */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3 
              onClick={() => handleTeamClick(team.school)}
              style={{
                fontSize: "18px",
                fontWeight: "700",
                color: "#1e293b",
                margin: "0 0 4px 0",
                cursor: "pointer",
                textDecoration: "underline",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap"
              }}
            >
              {team.school}
            </h3>
            <p style={{
              fontSize: "14px",
              color: "#64748b",
              margin: "0 0 4px 0"
            }}>
              {team.conference || "N/A"}
            </p>
            <div style={{
              fontSize: "12px",
              color: "#059669",
              fontWeight: "600"
            }}>
              {team.currentSeason?.gamePoints ?? 0} season points
            </div>
          </div>

          {/* Add Button */}
          <button 
            onClick={() => handleAddTeam(team)}
            style={{
              width: "40px",
              height: "40px",
              borderRadius: "50%",
              backgroundColor: "#059669",
              border: "none",
              color: "white",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 2px 8px rgba(5, 150, 105, 0.3)",
              transition: "all 0.2s ease",
              flexShrink: 0
            }}
            onMouseEnter={(e) => {
              e.target.style.backgroundColor = "#047857";
              e.target.style.transform = "scale(1.05)";
            }}
            onMouseLeave={(e) => {
              e.target.style.backgroundColor = "#059669";
              e.target.style.transform = "scale(1)";
            }}
          >
            <Plus size={20} />
          </button>
        </div>

        {/* Quick Info Row */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gap: "12px",
          marginBottom: "12px",
          fontSize: "12px"
        }}>
          <div style={{
            padding: "8px 12px",
            backgroundColor: "#f8fafc",
            borderRadius: "6px"
          }}>
            <div style={{ color: "#64748b", fontWeight: "500", marginBottom: "2px" }}>
              Record
            </div>
            <div style={{ color: "#1e293b", fontWeight: "600" }}>
              {team.currentSeason?.record || "0-0"}
            </div>
          </div>
          
          <div style={{
            padding: "8px 12px",
            backgroundColor: "#f8fafc",
            borderRadius: "6px"
          }}>
            <div style={{ color: "#64748b", fontWeight: "500", marginBottom: "2px" }}>
              ATS
            </div>
            <div style={{ color: "#1e293b", fontWeight: "600" }}>
              {team.currentSeason?.atsRecord || "0-0"}
            </div>
          </div>
          
          <div style={{
            padding: "8px 12px",
            backgroundColor: "#f8fafc",
            borderRadius: "6px"
          }}>
            <div style={{ color: "#64748b", fontWeight: "500", marginBottom: "2px" }}>
              Next
            </div>
            <div style={{ color: "#1e293b", fontWeight: "600" }}>
              {formatNextGame(team.currentSeason)}
            </div>
          </div>
        </div>

        {/* Expand/Collapse Button */}
        <button
          onClick={toggleExpanded}
          style={{
            width: "100%",
            padding: "8px",
            backgroundColor: expanded ? "#f1f5f9" : "#f8fafc",
            border: "1px solid #e2e8f0",
            borderRadius: "6px",
            fontSize: "12px",
            fontWeight: "500",
            color: "#64748b",
            cursor: "pointer",
            transition: "all 0.2s ease"
          }}
        >
          {expanded ? "Show Less ▲" : "Show More Details ▼"}
        </button>

        {/* Expanded Details */}
        {expanded && (
          <div style={{
            marginTop: "12px",
            padding: "12px",
            backgroundColor: "#f8fafc",
            borderRadius: "8px",
            border: "1px solid #e2e8f0"
          }}>
            <div style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "12px",
              fontSize: "12px",
              marginBottom: "12px"
            }}>
              <div>
                <div style={{ color: "#64748b", fontWeight: "500", marginBottom: "2px" }}>
                  Conference Record
                </div>
                <div style={{ color: "#1e293b", fontWeight: "600" }}>
                  {team.currentSeason?.confRecord || "0-0"}
                </div>
              </div>
              <div>
                <div style={{ color: "#64748b", fontWeight: "500", marginBottom: "2px" }}>
                  Classification
                </div>
                <div style={{ color: "#1e293b", fontWeight: "600" }}>
                  {team.classification || "FBS"}
                </div>
              </div>
            </div>

            {/* Remaining Schedule */}
            <div>
              <div style={{
                color: "#64748b",
                fontWeight: "600",
                fontSize: "12px",
                marginBottom: "8px",
                textTransform: "uppercase",
                letterSpacing: "0.5px"
              }}>
                Remaining Schedule
              </div>
              <div style={{
                backgroundColor: "white",
                borderRadius: "6px",
                padding: "8px",
                border: "1px solid #e2e8f0"
              }}>
                <div style={{ fontSize: "11px", color: "#64748b" }}>
                  Schedule details coming soon...
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  const SortableHeader = ({ label, sortKey, onSort, sortConfig }) => (
    <button
      onClick={() => onSort(sortKey)}
      style={{
        padding: "12px 16px",
        backgroundColor: sortConfig.key === sortKey ? "#f1f5f9" : "transparent",
        border: "none",
        borderRadius: "8px",
        fontSize: "14px",
        fontWeight: "600",
        color: "#374151",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        gap: "6px",
        transition: "all 0.2s ease",
        userSelect: "none",
        width: "100%",
        textAlign: "left"
      }}
      onMouseEnter={(e) => {
        if (sortConfig.key !== sortKey) {
          e.target.style.backgroundColor = "#f8fafc";
        }
      }}
      onMouseLeave={(e) => {
        if (sortConfig.key !== sortKey) {
          e.target.style.backgroundColor = "transparent";
        }
      }}
    >
      {label}
      <span style={{ color: "#64748b", fontSize: "12px" }}>
        {sortConfig.key === sortKey ? (sortConfig.direction === "asc" ? "▲" : "▼") : "⇅"}
      </span>
    </button>
  );

  if (loading) {
    return (
      <div style={{ backgroundColor: "#f8fafc", minHeight: "100vh" }}>
        <LeagueNavBar />
        <div style={{ 
          padding: "20px", 
          textAlign: "center",
          color: "#64748b",
          fontSize: "16px"
        }}>
          Loading free agents...
        </div>
      </div>
    );
  }

  return (
    <div style={{ 
      backgroundColor: "#f8fafc", 
      minHeight: "100vh",
      position: "relative",
      overflow: "hidden" // Prevent any overflow elements
    }}>
      {/* Add CSS to hide any points badges */}
      <style>{`
        [style*="pts"], 
        div:contains("pts"),
        .points-badge,
        [class*="points"],
        [class*="badge"] {
          display: none !important;
        }
      `}</style>
      
      <LeagueNavBar />

      {/* Header */}
      <div style={{ 
        padding: "20px 16px 16px 16px",
        background: "linear-gradient(135deg, #1e40af 0%, #0ea5e9 100%)",
        color: "white",
        position: "relative",
        zIndex: 1 // Ensure header is above any stray elements
      }}>
        <h1 style={{ 
          fontSize: "24px", 
          fontWeight: "700", 
          margin: "0 0 8px 0",
          textAlign: "center"
        }}>
          Free Agents
        </h1>
        <p style={{
          fontSize: "14px",
          opacity: "0.9",
          textAlign: "center",
          margin: 0
        }}>
          {sortedTeams.length} teams available
        </p>
      </div>

      <div style={{ 
        padding: "16px",
        position: "relative",
        zIndex: 1 // Ensure content is above any stray elements
      }}>
        {/* Search and Filter Controls */}
        <div style={{
          backgroundColor: "white",
          borderRadius: "12px",
          padding: "16px",
          marginBottom: "16px",
          boxShadow: "0 1px 3px rgba(0, 0, 0, 0.1)",
          border: "1px solid #e2e8f0",
          position: "relative",
          zIndex: 10 // Ensure this is above any floating elements
        }}>
          <div style={{
            display: "flex",
            gap: "12px",
            alignItems: "center",
            marginBottom: "12px",
            flexWrap: "wrap",
            position: "relative",
            zIndex: 11 // Even higher than the container
          }}>
            {/* Search Input */}
            <div style={{ 
              flex: 1, 
              minWidth: "200px", 
              position: "relative",
              zIndex: 12 // Highest z-index for the input
            }}>
              <Search 
                size={16} 
                style={{
                  position: "absolute",
                  left: "12px",
                  top: "50%",
                  transform: "translateY(-50%)",
                  color: "#64748b"
                }}
              />
              <input
                type="text"
                placeholder="Search by team name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  width: "100%",
                  padding: "12px 12px 12px 40px",
                  border: "2px solid #e5e7eb",
                  borderRadius: "8px",
                  fontSize: "14px",
                  fontFamily: "inherit",
                  boxSizing: "border-box",
                  position: "relative",
                  zIndex: 13 // Ensure input is clickable above floating elements
                }}
                onFocus={(e) => e.target.style.borderColor = "#1e40af"}
                onBlur={(e) => e.target.style.borderColor = "#e5e7eb"}
              />
            </div>

            {/* Conference Filter */}
            <div style={{ minWidth: "180px", position: "relative" }}>
              <Filter 
                size={16} 
                style={{
                  position: "absolute",
                  left: "12px",
                  top: "50%",
                  transform: "translateY(-50%)",
                  color: "#64748b",
                  pointerEvents: "none"
                }}
              />
              <select
                value={activeConference}
                onChange={(e) => setActiveConference(e.target.value)}
                style={{
                  width: "100%",
                  padding: "12px 12px 12px 40px",
                  border: "2px solid #e5e7eb",
                  borderRadius: "8px",
                  fontSize: "14px",
                  fontFamily: "inherit",
                  backgroundColor: "white",
                  boxSizing: "border-box"
                }}
              >
                {conferenceList.map(conf => (
                  <option key={conf} value={conf}>
                    {conf === "National" ? "All Conferences" : conf}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Sort Controls */}
          <div style={{
            display: "flex",
            gap: "8px",
            flexWrap: "wrap"
          }}>
            <div style={{
              fontSize: "12px",
              color: "#64748b",
              fontWeight: "600",
              textTransform: "uppercase",
              letterSpacing: "0.5px",
              padding: "12px 0",
              minWidth: "60px"
            }}>
              Sort by:
            </div>
            
            <SortableHeader 
              label="School" 
              sortKey="school" 
              onSort={toggleSort} 
              sortConfig={sortConfig} 
            />
            <SortableHeader 
              label="Points" 
              sortKey="gamePoints" 
              onSort={toggleSort} 
              sortConfig={sortConfig} 
            />
            <SortableHeader 
              label="Record" 
              sortKey="currentSeason.record" 
              onSort={toggleSort} 
              sortConfig={sortConfig} 
            />
          </div>
        </div>

        {/* Teams List */}
        {sortedTeams.length === 0 ? (
          <div style={{
            backgroundColor: "white",
            borderRadius: "12px",
            padding: "40px 20px",
            textAlign: "center",
            boxShadow: "0 1px 3px rgba(0, 0, 0, 0.1)"
          }}>
            <p style={{ color: "#64748b", fontSize: "16px", margin: 0 }}>
              {searchQuery ? 
                `No teams found matching "${searchQuery}"` : 
                "No free agents available"
              }
            </p>
          </div>
        ) : (
          <div style={{
            position: "relative",
            overflow: "hidden" // Ensure no elements leak out
          }}>
            {sortedTeams.map((team) => (
              <TeamCard key={team.id} team={team} />
            ))}
          </div>
        )}

        {/* Add Team Modal */}
        {showAddModal && teamToAdd && (
          <div style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0, 0, 0, 0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: "16px"
          }}>
            <div style={{
              backgroundColor: "white",
              borderRadius: "16px",
              padding: "24px",
              maxWidth: "400px",
              width: "100%"
            }}>
              <h3 style={{ 
                fontSize: "18px", 
                fontWeight: "600", 
                marginBottom: "16px",
                textAlign: "center"
              }}>
                Add {teamToAdd.school}?
              </h3>
              
              <p style={{ 
                textAlign: "center", 
                marginBottom: "24px",
                color: "#64748b" 
              }}>
                This will add them to your lineup.
              </p>

              <div style={{ display: "flex", gap: "12px" }}>
                <button
                  onClick={() => {
                    setShowAddModal(false);
                    setTeamToAdd(null);
                  }}
                  style={{
                    flex: 1,
                    padding: "12px",
                    backgroundColor: "#6b7280",
                    color: "white",
                    border: "none",
                    borderRadius: "8px",
                    cursor: "pointer"
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={confirmAddTeam}
                  style={{
                    flex: 1,
                    padding: "12px",
                    backgroundColor: "#059669",
                    color: "white",
                    border: "none",
                    borderRadius: "8px",
                    cursor: "pointer"
                  }}
                >
                  Add Team
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Swap UI Modal */}
        {showSwapUI && (
          <div style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0, 0, 0, 0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: "16px"
          }}>
            <div style={{
              backgroundColor: "white",
              borderRadius: "16px",
              padding: "24px",
              maxWidth: "400px",
              width: "100%",
              boxShadow: "0 20px 40px rgba(0, 0, 0, 0.3)"
            }}>
              <h3 style={{ 
                fontSize: "18px", 
                fontWeight: "600", 
                marginBottom: "16px",
                textAlign: "center",
                color: "#1e293b"
              }}>
                Add {pendingAddTeam}
              </h3>
              
              <p style={{ 
                textAlign: "center", 
                marginBottom: "20px",
                color: "#64748b",
                fontSize: "14px"
              }}>
                Your roster is full. Select a team to drop:
              </p>

              <select
                value={selectedDropTeam}
                onChange={(e) => setSelectedDropTeam(e.target.value)}
                style={{
                  width: "100%",
                  padding: "12px",
                  border: "2px solid #e5e7eb",
                  borderRadius: "8px",
                  fontSize: "14px",
                  fontFamily: "inherit",
                  marginBottom: "20px",
                  backgroundColor: "white"
                }}
              >
                <option value="">Select a team to drop</option>
                {userTeams.filter(Boolean).map((team) => (
                  <option key={team} value={team}>
                    {team}
                  </option>
                ))}
              </select>

              <div style={{ display: "flex", gap: "12px" }}>
                <button
                  onClick={() => setShowSwapUI(false)}
                  style={{
                    flex: 1,
                    padding: "12px",
                    backgroundColor: "#6b7280",
                    color: "white",
                    border: "none",
                    borderRadius: "8px",
                    fontSize: "14px",
                    fontWeight: "500",
                    cursor: "pointer"
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmSwap}
                  disabled={!selectedDropTeam}
                  style={{
                    flex: 1,
                    padding: "12px",
                    backgroundColor: selectedDropTeam ? "#059669" : "#94a3b8",
                    color: "white",
                    border: "none",
                    borderRadius: "8px",
                    fontSize: "14px",
                    fontWeight: "500",
                    cursor: selectedDropTeam ? "pointer" : "not-allowed"
                  }}
                >
                  Confirm Swap
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Bottom spacing for navigation */}
      <div style={{ height: "80px" }} />
    </div>
  );
}

export default FreeAgents;