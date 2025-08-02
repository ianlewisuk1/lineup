import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { collection, getDocs, doc, getDoc, updateDoc } from "firebase/firestore";
import { db, auth } from "../firebase/firebase";
import { Plus, ArrowLeft, Calendar, MapPin, Trophy, Users, TrendingUp } from "lucide-react";
import LeagueNavBar from "../components/LeagueNavBar";

function TeamPage() {
  const { leagueId, teamName } = useParams();
  const navigate = useNavigate();
  const [schedule, setSchedule] = useState([]);
  const [loading, setLoading] = useState(true);
  const [teamInfo, setTeamInfo] = useState(null);
  const [ownershipInfo, setOwnershipInfo] = useState(null);
  const [userTeams, setUserTeams] = useState([]);
  const [selectedDropTeam, setSelectedDropTeam] = useState("");
  const [pendingAddTeam, setPendingAddTeam] = useState("");
  const [showSwapUI, setShowSwapUI] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [teamToAdd, setTeamToAdd] = useState(null);
  const [loadingStage, setLoadingStage] = useState("Fetching team info...");
  
  // Custom notification modal states
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [modalMessage, setModalMessage] = useState("");
  const [modalTitle, setModalTitle] = useState("");

  // Custom modal helper functions
  const showSuccess = (title, message) => {
    setModalTitle(title);
    setModalMessage(message);
    setShowSuccessModal(true);
  };

  const showError = (title, message) => {
    setModalTitle(title);
    setModalMessage(message);
    setShowErrorModal(true);
  };

  const closeModals = () => {
    setShowSuccessModal(false);
    setShowErrorModal(false);
    setModalTitle("");
    setModalMessage("");
  };

  useEffect(() => {
    const fetchTeamData = async () => {
      try {
        const decodedTeamName = decodeURIComponent(teamName);
        
        // Stage 1: Fetch team info with query optimization
        setLoadingStage("Loading team details...");
        const teamsSnap = await getDocs(collection(db, "teams"));
        let foundTeam = null;
        
        teamsSnap.forEach(doc => {
          const data = doc.data();
          if (data.school === decodedTeamName) {
            foundTeam = data;
          }
        });
        setTeamInfo(foundTeam);

        // Stage 2: Fetch ownership and user data in parallel
        setLoadingStage("Checking ownership status...");
        const [ownershipResult, userTeamsResult] = await Promise.all([
          fetchOwnershipInfo(decodedTeamName),
          fetchUserTeams()
        ]);
        
        setOwnershipInfo(ownershipResult);
        setUserTeams(userTeamsResult);

        // Stage 3: Fetch schedule (most expensive operation)
        setLoadingStage("Loading schedule...");
        const scheduleData = await fetchTeamSchedule(decodedTeamName);
        setSchedule(scheduleData);
        
        setLoading(false);
      } catch (error) {
        console.error("Error fetching team data:", error);
        setLoading(false);
      }
    };

    const fetchOwnershipInfo = async (teamName) => {
      const membersSnap = await getDocs(collection(db, "leagues", leagueId, "members"));
      
      for (const memberDoc of membersSnap.docs) {
        const memberData = memberDoc.data();
        const lineup = memberData.lineup || {};
        const starters = lineup.starters || [];
        const bench = lineup.bench || [];
        
        let status = null;
        if (starters.includes(teamName)) {
          status = "starting";
        } else if (bench.includes(teamName)) {
          status = "bench";
        }
        
        if (status) {
          // Only fetch user data if we found ownership
          let ownerName = memberData.displayName || "Unknown Owner";
          try {
            const userDoc = await getDoc(doc(db, "users", memberDoc.id));
            if (userDoc.exists()) {
              const userData = userDoc.data();
              ownerName = userData.firstName 
                ? `${userData.firstName} ${userData.lastName || ""}`.trim()
                : userData.displayName || memberData.displayName || "Unknown Owner";
            }
          } catch (error) {
            console.warn("Could not fetch user data:", error);
          }
          
          return {
            status,
            ownerName,
            teamName: memberData.teamName || "Unnamed Team"
          };
        }
      }
      return null;
    };

    const fetchUserTeams = async () => {
      const user = auth.currentUser;
      if (!user) return [];
      
      try {
        const userMemberRef = doc(db, "leagues", leagueId, "members", user.uid);
        const userMemberSnap = await getDoc(userMemberRef);
        if (userMemberSnap.exists()) {
          const userLineup = userMemberSnap.data()?.lineup || {};
          const starters = userLineup.starters || [];
          const bench = userLineup.bench || [];
          return [...starters, ...bench];
        }
      } catch (error) {
        console.error("Error fetching user teams:", error);
      }
      return [];
    };

    const fetchTeamSchedule = async (teamName) => {
      // Batch all week queries at once instead of sequential
      const weeksSnap = await getDocs(collection(db, "schedule", "2025", "weeks"));
      const weekNumbers = weeksSnap.docs.map(doc => doc.id);
      
      // Fetch all games for all weeks in parallel
      const allGamesPromises = weekNumbers.map(async (weekNum) => {
        const gamesSnap = await getDocs(collection(db, "schedule", "2025", "weeks", weekNum, "games"));
        const weekGames = [];
        
        gamesSnap.forEach(gameDoc => {
          const game = gameDoc.data();
          if (game.homeTeam === teamName || game.awayTeam === teamName) {
            weekGames.push({
              ...game,
              week: parseInt(weekNum),
              gameId: gameDoc.id
            });
          }
        });
        
        return weekGames;
      });
      
      const allWeeksGames = await Promise.all(allGamesPromises);
      const scheduleData = allWeeksGames.flat();
      
      // Sort by week
      return scheduleData.sort((a, b) => a.week - b.week);
    };

    fetchTeamData();
  }, [teamName, leagueId]);

  const handleAddTeam = (teamName) => {
    const user = auth.currentUser;
    if (!user) return;

    if (userTeams.length < 7) {
      setTeamToAdd({ school: teamName });
      setShowAddModal(true);
    } else {
      setPendingAddTeam(teamName);
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
      
      const emptyStarterIndex = starters.findIndex(t => !t);
      const emptyBenchIndex = bench.findIndex(t => !t);
      
      if (emptyStarterIndex !== -1) {
        starters[emptyStarterIndex] = teamToAdd.school;
      } else if (emptyBenchIndex !== -1) {
        bench[emptyBenchIndex] = teamToAdd.school;
      } else {
        showError("Roster Full", "Your roster is full! Please drop a team first.");
        return;
      }

      await updateDoc(memberRef, {
        "lineup.starters": starters,
        "lineup.bench": bench
      });

      setUserTeams([...starters, ...bench].filter(Boolean));
      setShowAddModal(false);
      setTeamToAdd(null);
      
      showSuccess("Team Added!", `${teamToAdd.school} has been successfully added to your lineup!`);
      
      // Update ownership info to reflect the change
      const user2 = auth.currentUser;
      if (user2) {
        const userDoc = await getDoc(doc(db, "users", user2.uid));
        let ownerName = "You";
        if (userDoc.exists()) {
          const userData = userDoc.data();
          ownerName = userData.firstName 
            ? `${userData.firstName} ${userData.lastName || ""}`.trim()
            : userData.displayName || "You";
        }
        
        const memberDoc = await getDoc(memberRef);
        const memberData2 = memberDoc.data();
        
        setOwnershipInfo({
          status: emptyStarterIndex !== -1 ? "starting" : "bench",
          ownerName,
          teamName: memberData2.teamName || "Your Team"
        });
      }
      
    } catch (error) {
      console.error("Error adding team:", error);
      showError("Error", "Failed to add team. Please try again.");
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

      setUserTeams([...starters, ...bench].filter(Boolean));
      setShowSwapUI(false);
      setPendingAddTeam("");
      setSelectedDropTeam("");
      
      showSuccess("Team Swapped!", `Successfully swapped ${selectedDropTeam} for ${pendingAddTeam}!`);
      
      // Update ownership info to reflect the change
      const user2 = auth.currentUser;
      if (user2) {
        const userDoc = await getDoc(doc(db, "users", user2.uid));
        let ownerName = "You";
        if (userDoc.exists()) {
          const userData = userDoc.data();
          ownerName = userData.firstName 
            ? `${userData.firstName} ${userData.lastName || ""}`.trim()
            : userData.displayName || "You";
        }
        
        setOwnershipInfo({
          status: starterIndex !== -1 ? "starting" : "bench",
          ownerName,
          teamName: memberData.teamName || "Your Team"
        });
      }
      
    } catch (error) {
      console.error("Error swapping teams:", error);
      showError("Error", "Failed to swap teams. Please try again.");
    }
  };

  const formatGameResult = (game, teamName) => {
    const isHome = game.homeTeam === teamName;
    const teamScore = isHome ? game.homePoints : game.awayPoints;
    const opponentScore = isHome ? game.awayPoints : game.homePoints;
    
    if (game.gameComplete && teamScore !== null && opponentScore !== null) {
      const won = teamScore > opponentScore;
      return { result: won ? "W" : "L", score: `${teamScore}-${opponentScore}`, won };
    }
    
    return null;
  };

  const formatOpponent = (game, teamName) => {
    const isHome = game.homeTeam === teamName;
    const opponent = isHome ? game.awayTeam : game.homeTeam;
    
    if (game.neutralSite) {
      return { opponent, prefix: "vs", isHome: null };
    }
    
    return { opponent, prefix: isHome ? "vs" : "@", isHome };
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return {
      weekday: date.toLocaleDateString('en-US', { weekday: 'short' }),
      date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    };
  };

  const renderOwnershipStatus = () => {
    const decodedTeamName = decodeURIComponent(teamName);
    
    if (!ownershipInfo) {
      return (
        <div style={{ 
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "16px", 
          backgroundColor: "#ecfdf5", 
          border: "2px solid #10b981", 
          borderRadius: "12px", 
          color: "#065f46",
          marginBottom: "20px",
          boxShadow: "0 2px 4px rgba(0,0,0,0.1)"
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <Users size={20} />
            <span style={{ fontWeight: "600" }}>Status: Free Agent</span>
          </div>
          {auth.currentUser && (
            <button 
              onClick={() => handleAddTeam(decodedTeamName)}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "6px",
                padding: "8px 16px",
                backgroundColor: "#10b981",
                color: "white",
                border: "none",
                borderRadius: "8px",
                cursor: "pointer",
                fontWeight: "500",
                transition: "all 0.2s ease"
              }}
              onMouseEnter={(e) => e.target.style.backgroundColor = "#059669"}
              onMouseLeave={(e) => e.target.style.backgroundColor = "#10b981"}
              title="Add to your team"
            >
              <Plus size={16} />
              Add Team
            </button>
          )}
        </div>
      );
    }

    const { status, ownerName, teamName: ownerTeamName } = ownershipInfo;
    const isStarting = status === "starting";
    const statusText = isStarting ? "Starting Lineup" : "Riding the Bench";
    const bgColor = isStarting ? "#eff6ff" : "#fef3c7";
    const borderColor = isStarting ? "#3b82f6" : "#f59e0b";
    const textColor = isStarting ? "#1e40af" : "#92400e";

    return (
      <div style={{ 
        padding: "16px", 
        backgroundColor: bgColor, 
        border: `2px solid ${borderColor}`, 
        borderRadius: "12px", 
        color: textColor,
        marginBottom: "20px",
        boxShadow: "0 2px 4px rgba(0,0,0,0.1)"
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
          <Trophy size={20} />
          <span style={{ fontWeight: "600" }}>Status: {statusText}</span>
        </div>
        <div style={{ marginLeft: "28px", fontSize: "14px" }}>
          Owned by <strong>{ownerName}</strong> ({ownerTeamName})
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div style={{ backgroundColor: "#f8fafc", minHeight: "100vh" }}>
        <LeagueNavBar />
        <div style={{ 
          padding: "40px 20px", 
          textAlign: "center",
          color: "#64748b",
          fontSize: "16px"
        }}>
          <div style={{ marginBottom: "16px", fontSize: "18px", fontWeight: "600" }}>
            Loading {decodeURIComponent(teamName)}...
          </div>
          <div style={{ fontSize: "14px", color: "#94a3b8" }}>
            {loadingStage}
          </div>
        </div>
      </div>
    );
  }

  const decodedTeamName = decodeURIComponent(teamName);

  return (
    <div style={{ backgroundColor: "#f8fafc", minHeight: "100vh" }}>
      <LeagueNavBar />
      
      {/* Header */}
      <div style={{ 
        padding: "20px 16px 16px 16px",
        background: teamInfo?.hexColor ? `linear-gradient(135deg, ${teamInfo.hexColor} 0%, ${teamInfo.hexColor}CC 100%)` : "linear-gradient(135deg, #1e40af 0%, #0ea5e9 100%)",
        color: "white"
      }}>
        <button 
          onClick={() => navigate(-1)} 
          style={{ 
            display: "flex",
            alignItems: "center",
            gap: "8px",
            marginBottom: "16px", 
            padding: "8px 16px",
            backgroundColor: "rgba(255,255,255,0.2)",
            color: "white",
            border: "none",
            borderRadius: "8px",
            cursor: "pointer",
            fontSize: "14px",
            fontWeight: "500",
            transition: "all 0.2s ease"
          }}
          onMouseEnter={(e) => e.target.style.backgroundColor = "rgba(255,255,255,0.3)"}
          onMouseLeave={(e) => e.target.style.backgroundColor = "rgba(255,255,255,0.2)"}
        >
          <ArrowLeft size={16} />
          Back
        </button>
        
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ flex: 1 }}>
            <h1 style={{ 
              fontSize: "32px", 
              fontWeight: "700", 
              margin: "0 0 8px 0"
            }}>
              {decodedTeamName}
            </h1>
            
            {teamInfo && (
              <p style={{
                fontSize: "18px",
                opacity: "0.9",
                margin: 0
              }}>
                {teamInfo.conference || "Independent"} • {teamInfo.currentSeason?.record || "0-0"}
              </p>
            )}
          </div>
          
          <div style={{
            width: "80px",
            height: "80px",
            borderRadius: "50%",
            backgroundColor: "rgba(255,255,255,0.2)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            border: "3px solid rgba(255,255,255,0.3)"
          }}>
            {teamInfo?.logos1 ? (
              <img 
                src={teamInfo.logos1} 
                alt={`${decodedTeamName} logo`}
                style={{
                  width: "60px",
                  height: "60px",
                  borderRadius: "50%",
                  objectFit: "contain",
                  backgroundColor: "white"
                }}
                onLoad={(e) => {
                  console.log("Logo loaded successfully:", teamInfo.logo);
                }}
                onError={(e) => {
                  console.error("Logo failed to load:", teamInfo.logo);
                  e.target.style.display = 'none';
                  e.target.parentElement.innerHTML = '<div style="color: white; font-size: 20px; font-weight: bold; display: flex; align-items: center; justify-content: center; width: 100%; height: 100%;">' + decodedTeamName.substring(0, 2).toUpperCase() + '</div>';
                }}
              />
            ) : (
              <div style={{
                color: "white", 
                fontSize: "20px", 
                fontWeight: "bold",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: "100%",
                height: "100%"
              }}>
                {decodedTeamName.substring(0, 2).toUpperCase()}
              </div>
            )}
          </div>
        </div>
      </div>

      <div style={{ padding: "20px 16px" }}>
        {/* Ownership Status */}
        {renderOwnershipStatus()}
        
        {/* Team Stats */}
        {teamInfo?.currentSeason && (
          <div style={{ 
            marginBottom: "24px", 
            padding: "20px", 
            backgroundColor: "white", 
            borderRadius: "12px",
            boxShadow: "0 2px 4px rgba(0,0,0,0.1)"
          }}>
            <h3 style={{ 
              margin: "0 0 16px 0", 
              fontSize: "16px", 
              fontWeight: "600",
              color: "#1e293b",
              display: "flex",
              alignItems: "center",
              gap: "8px"
            }}>
              <TrendingUp size={18} />
              2025 Season Stats
            </h3>
            
            <div style={{ 
              display: "grid", 
              gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", 
              gap: "12px" 
            }}>
              <div>
                <div style={{ fontSize: "11px", color: "#64748b", marginBottom: "2px", textTransform: "uppercase", letterSpacing: "0.5px" }}>Conference Record</div>
                <div style={{ fontSize: "16px", fontWeight: "700", color: "#1e293b" }}>
                  {teamInfo.currentSeason.confRecord || "0-0"}
                </div>
              </div>
              
              <div>
                <div style={{ fontSize: "11px", color: "#64748b", marginBottom: "2px", textTransform: "uppercase", letterSpacing: "0.5px" }}>ATS Record</div>
                <div style={{ fontSize: "16px", fontWeight: "700", color: "#1e293b" }}>
                  {teamInfo.currentSeason.ats === "PENDING SCHEDULE" ? "TBD" : (teamInfo.currentSeason.ats || "0-0")}
                </div>
              </div>
              
              <div>
                <div style={{ fontSize: "11px", color: "#64748b", marginBottom: "2px", textTransform: "uppercase", letterSpacing: "0.5px" }}>Fantasy Points</div>
                <div style={{ fontSize: "16px", fontWeight: "700", color: "#059669" }}>
                  {teamInfo.currentSeason.gamePoints || 0}
                </div>
              </div>
              
              <div>
                <div style={{ fontSize: "11px", color: "#64748b", marginBottom: "2px", textTransform: "uppercase", letterSpacing: "0.5px" }}>Avg Weekly Fantasy</div>
                <div style={{ fontSize: "16px", fontWeight: "700", color: "#0ea5e9" }}>
                  {(() => {
                    const weeklyPoints = teamInfo.currentSeason.weeklyPoints || {};
                    const gamesPlayed = parseInt(teamInfo.currentSeason.gamesPlayed) || 0;
                    
                    if (gamesPlayed === 0) return "0.0";
                    
                    const totalWeeklyPoints = Object.values(weeklyPoints).reduce((sum, points) => {
                      return sum + (parseFloat(points) || 0);
                    }, 0);
                    
                    const average = totalWeeklyPoints / gamesPlayed;
                    return average.toFixed(1);
                  })()}
                </div>
              </div>
              
              <div>
                <div style={{ fontSize: "11px", color: "#64748b", marginBottom: "2px", textTransform: "uppercase", letterSpacing: "0.5px" }}>Season Total Pts</div>
                <div style={{ fontSize: "16px", fontWeight: "700", color: "#7c3aed" }}>
                  {teamInfo.currentSeason.seasonTotalPoints || 0}
                </div>
              </div>
              
              <div>
                <div style={{ fontSize: "11px", color: "#64748b", marginBottom: "2px", textTransform: "uppercase", letterSpacing: "0.5px" }}>Games Played</div>
                <div style={{ fontSize: "16px", fontWeight: "700", color: "#1e293b" }}>
                  {teamInfo.currentSeason.gamesPlayed || "0"}
                </div>
              </div>
              
              <div>
                <div style={{ fontSize: "11px", color: "#64748b", marginBottom: "2px", textTransform: "uppercase", letterSpacing: "0.5px" }}>Avg Points For</div>
                <div style={{ fontSize: "16px", fontWeight: "700", color: "#059669" }}>
                  {teamInfo.currentSeason.avgPointsFor || "0"}
                </div>
              </div>
              
              <div>
                <div style={{ fontSize: "11px", color: "#64748b", marginBottom: "2px", textTransform: "uppercase", letterSpacing: "0.5px" }}>Avg Points Against</div>
                <div style={{ fontSize: "16px", fontWeight: "700", color: "#dc2626" }}>
                  {teamInfo.currentSeason.avgPointsAgainst || "0"}
                </div>
              </div>
              
              <div>
                <div style={{ fontSize: "11px", color: "#64748b", marginBottom: "2px", textTransform: "uppercase", letterSpacing: "0.5px" }}>Total Pts For</div>
                <div style={{ fontSize: "16px", fontWeight: "700", color: "#059669" }}>
                  {teamInfo.currentSeason.totalPointsFor || "0"}
                </div>
              </div>
              
              <div>
                <div style={{ fontSize: "11px", color: "#64748b", marginBottom: "2px", textTransform: "uppercase", letterSpacing: "0.5px" }}>Total Pts Against</div>
                <div style={{ fontSize: "16px", fontWeight: "700", color: "#dc2626" }}>
                  {teamInfo.currentSeason.totalPointsAgainst || "0"}
                </div>
              </div>
              
              {teamInfo.currentSeason.division && (
                <div>
                  <div style={{ fontSize: "11px", color: "#64748b", marginBottom: "2px", textTransform: "uppercase", letterSpacing: "0.5px" }}>Division</div>
                  <div style={{ fontSize: "16px", fontWeight: "700", color: "#1e293b" }}>
                    {teamInfo.currentSeason.division}
                  </div>
                </div>
              )}
              
              {teamInfo.currentSeason.nextOpponent && (
                <div style={{ gridColumn: "span 2" }}>
                  <div style={{ fontSize: "11px", color: "#64748b", marginBottom: "2px", textTransform: "uppercase", letterSpacing: "0.5px" }}>Next Opponent</div>
                  <div style={{ fontSize: "14px", fontWeight: "600", color: "#1e293b" }}>
                    {teamInfo.currentSeason.nextGameIsHome === false ? "@" : "vs"} {teamInfo.currentSeason.nextOpponent}
                    {teamInfo.currentSeason.nextOpponentSpread && teamInfo.currentSeason.nextOpponentSpread !== "TBD" && (
                      <span style={{ color: "#64748b", fontWeight: "400" }}> ({teamInfo.currentSeason.nextOpponentSpread})</span>
                    )}
                  </div>
                  {teamInfo.currentSeason.nextGameDate && (
                    <div style={{ fontSize: "12px", color: "#64748b", marginTop: "2px" }}>
                      {new Date(teamInfo.currentSeason.nextGameDate).toLocaleDateString('en-US', { 
                        weekday: 'short', 
                        month: 'short', 
                        day: 'numeric' 
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Schedule */}
        <div style={{ 
          backgroundColor: "white", 
          borderRadius: "12px",
          overflow: "hidden",
          boxShadow: "0 2px 4px rgba(0,0,0,0.1)"
        }}>
          <div style={{ 
            padding: "20px 20px 16px 20px", 
            borderBottom: "2px solid #f1f5f9"
          }}>
            <h3 style={{ 
              margin: 0, 
              fontSize: "18px", 
              fontWeight: "600",
              color: "#1e293b",
              display: "flex",
              alignItems: "center",
              gap: "8px"
            }}>
              <Calendar size={20} />
              2025 Schedule ({schedule.length} games)
            </h3>
          </div>
          
          {schedule.length === 0 ? (
            <div style={{ padding: "40px 20px", textAlign: "center", color: "#64748b" }}>
              No schedule found for {decodedTeamName}
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ backgroundColor: "#f8fafc" }}>
                    <th style={{ 
                      padding: "12px 16px", 
                      textAlign: "left", 
                      borderBottom: "2px solid #e2e8f0",
                      fontSize: "14px",
                      fontWeight: "600",
                      color: "#374151"
                    }}>Week</th>
                    <th style={{ 
                      padding: "12px 16px", 
                      textAlign: "left", 
                      borderBottom: "2px solid #e2e8f0",
                      fontSize: "14px",
                      fontWeight: "600",
                      color: "#374151"
                    }}>Date</th>
                    <th style={{ 
                      padding: "12px 16px", 
                      textAlign: "left", 
                      borderBottom: "2px solid #e2e8f0",
                      fontSize: "14px",
                      fontWeight: "600",
                      color: "#374151"
                    }}>Opponent</th>
                    <th style={{ 
                      padding: "12px 16px", 
                      textAlign: "left", 
                      borderBottom: "2px solid #e2e8f0",
                      fontSize: "14px",
                      fontWeight: "600",
                      color: "#374151"
                    }}>Venue</th>
                    <th style={{ 
                      padding: "12px 16px", 
                      textAlign: "left", 
                      borderBottom: "2px solid #e2e8f0",
                      fontSize: "14px",
                      fontWeight: "600",
                      color: "#374151"
                    }}>Result</th>
                    <th style={{ 
                      padding: "12px 16px", 
                      textAlign: "center", 
                      borderBottom: "2px solid #e2e8f0",
                      fontSize: "14px",
                      fontWeight: "600",
                      color: "#374151"
                    }}>Fantasy Pts</th>
                  </tr>
                </thead>
                <tbody>
                  {schedule.map((game, index) => {
                    const gameResult = formatGameResult(game, decodedTeamName);
                    const opponentInfo = formatOpponent(game, decodedTeamName);
                    const dateInfo = formatDate(game.date);
                    
                    return (
                      <tr 
                        key={index} 
                        style={{ 
                          borderBottom: index < schedule.length - 1 ? "1px solid #f1f5f9" : "none",
                          transition: "background-color 0.2s ease"
                        }}
                        onMouseEnter={(e) => e.target.parentElement.style.backgroundColor = "#f8fafc"}
                        onMouseLeave={(e) => e.target.parentElement.style.backgroundColor = "white"}
                      >
                        <td style={{ padding: "12px 16px", fontWeight: "600", color: "#1e293b" }}>
                          {game.week}
                        </td>
                        <td style={{ padding: "12px 16px" }}>
                          <div style={{ fontSize: "14px", color: "#1e293b" }}>{dateInfo.weekday}</div>
                          <div style={{ fontSize: "13px", color: "#64748b" }}>{dateInfo.date}</div>
                        </td>
                        <td style={{ padding: "12px 16px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                            <span style={{ 
                              fontSize: "13px", 
                              color: "#64748b",
                              fontWeight: "500"
                            }}>
                              {opponentInfo.prefix}
                            </span>
                            <span style={{ 
                              fontSize: "14px", 
                              color: "#1e293b",
                              fontWeight: "600"
                            }}>
                              {opponentInfo.opponent}
                            </span>
                          </div>
                        </td>
                        <td style={{ padding: "12px 16px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                            <MapPin size={14} style={{ color: "#64748b" }} />
                            <span style={{ fontSize: "14px", color: "#64748b" }}>
                              {game.venue || "TBD"}
                            </span>
                          </div>
                        </td>
                        <td style={{ padding: "12px 16px" }}>
                          {gameResult ? (
                            <div style={{ 
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "6px",
                              padding: "4px 8px",
                              borderRadius: "6px",
                              backgroundColor: gameResult.won ? "#ecfdf5" : "#fef2f2",
                              color: gameResult.won ? "#065f46" : "#991b1b",
                              fontSize: "13px",
                              fontWeight: "600"
                            }}>
                              {gameResult.result} {gameResult.score}
                            </div>
                          ) : (
                            <span style={{ color: "#94a3b8", fontSize: "14px" }}>TBD</span>
                          )}
                        </td>
                        <td style={{ padding: "12px 16px", textAlign: "center" }}>
                          {game.gameComplete && game.fantasyPoints !== undefined && game.fantasyPoints !== null ? (
                            <span style={{ 
                              color: "#059669", 
                              fontSize: "14px",
                              fontWeight: "600"
                            }}>
                              {game.fantasyPoints}
                            </span>
                          ) : (
                            <span style={{ color: "#94a3b8", fontSize: "14px" }}>—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Swap UI */}
        {showSwapUI && (
          <div style={{ 
            marginTop: "24px", 
            padding: "20px", 
            border: "2px solid #e5e7eb", 
            borderRadius: "12px", 
            backgroundColor: "white",
            boxShadow: "0 4px 6px rgba(0,0,0,0.1)"
          }}>
            <h4 style={{ margin: "0 0 12px 0", fontSize: "18px", fontWeight: "600", color: "#1e293b" }}>
              Swap in: {pendingAddTeam}
            </h4>
            <p style={{ margin: "0 0 16px 0", color: "#64748b" }}>
              Your roster is full (7/7 teams). Choose a team to drop:
            </p>
            
            <div style={{ marginBottom: "20px" }}>
              <label style={{ 
                display: "block", 
                marginBottom: "8px", 
                fontSize: "14px", 
                fontWeight: "500",
                color: "#374151"
              }}>
                Drop Team:
              </label>
              <select
                value={selectedDropTeam}
                onChange={(e) => setSelectedDropTeam(e.target.value)}
                style={{ 
                  width: "100%",
                  padding: "12px", 
                  border: "2px solid #e5e7eb",
                  borderRadius: "8px",
                  fontSize: "14px",
                  backgroundColor: "white"
                }}
              >
                <option value="">Select one of your teams</option>
                {userTeams.map((team) => (
                  <option key={team} value={team}>
                    {team}
                  </option>
                ))}
              </select>
            </div>
            
            <div style={{ display: "flex", gap: "12px" }}>
              <button
                onClick={handleConfirmSwap}
                disabled={!selectedDropTeam}
                style={{ 
                  padding: "12px 24px",
                  backgroundColor: selectedDropTeam ? "#1e40af" : "#9ca3af",
                  color: "white",
                  border: "none",
                  borderRadius: "8px",
                  cursor: selectedDropTeam ? "pointer" : "not-allowed",
                  fontSize: "14px",
                  fontWeight: "500",
                  transition: "all 0.2s ease"
                }}
              >
                Confirm Swap
              </button>
              <button
                onClick={() => {
                  setShowSwapUI(false);
                  setPendingAddTeam("");
                  setSelectedDropTeam("");
                }}
                style={{ 
                  padding: "12px 24px",
                  backgroundColor: "white",
                  color: "#64748b",
                  border: "2px solid #e5e7eb",
                  borderRadius: "8px",
                  cursor: "pointer",
                  fontSize: "14px",
                  fontWeight: "500",
                  transition: "all 0.2s ease"
                }}
                onMouseEnter={(e) => {
                  e.target.style.backgroundColor = "#f8fafc";
                  e.target.style.borderColor = "#d1d5db";
                }}
                onMouseLeave={(e) => {
                  e.target.style.backgroundColor = "white";
                  e.target.style.borderColor = "#e5e7eb";
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Bottom spacing */}
      <div style={{ height: "80px" }} />
      
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

      {/* Custom Success Modal */}
      {showSuccessModal && (
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
            textAlign: "center",
            boxShadow: "0 20px 40px rgba(0, 0, 0, 0.3)"
          }}>
            {/* Success Icon */}
            <div style={{
              width: "60px",
              height: "60px",
              backgroundColor: "#10b981",
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 16px auto"
            }}>
              <div style={{
                color: "white",
                fontSize: "24px",
                fontWeight: "bold"
              }}>
                ✓
              </div>
            </div>

            <h3 style={{ 
              fontSize: "18px", 
              fontWeight: "600", 
              marginBottom: "8px",
              color: "#1e293b"
            }}>
              {modalTitle}
            </h3>
            
            <p style={{ 
              marginBottom: "24px",
              color: "#64748b",
              fontSize: "14px"
            }}>
              {modalMessage}
            </p>

            <button
              onClick={closeModals}
              style={{
                width: "100%",
                padding: "12px",
                backgroundColor: "#10b981",
                color: "white",
                border: "none",
                borderRadius: "8px",
                fontSize: "14px",
                fontWeight: "500",
                cursor: "pointer"
              }}
            >
              Awesome!
            </button>
          </div>
        </div>
      )}

      {/* Custom Error Modal */}
      {showErrorModal && (
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
            textAlign: "center",
            boxShadow: "0 20px 40px rgba(0, 0, 0, 0.3)"
          }}>
            {/* Error Icon */}
            <div style={{
              width: "60px",
              height: "60px",
              backgroundColor: "#ef4444",
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 16px auto"
            }}>
              <div style={{
                color: "white",
                fontSize: "24px",
                fontWeight: "bold"
              }}>
                !
              </div>
            </div>

            <h3 style={{ 
              fontSize: "18px", 
              fontWeight: "600", 
              marginBottom: "8px",
              color: "#1e293b"
            }}>
              {modalTitle}
            </h3>
            
            <p style={{ 
              marginBottom: "24px",
              color: "#64748b",
              fontSize: "14px"
            }}>
              {modalMessage}
            </p>

            <button
              onClick={closeModals}
              style={{
                width: "100%",
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
              Got it
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default TeamPage;