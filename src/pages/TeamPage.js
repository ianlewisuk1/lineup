// src/pages/TeamPage.js
import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { collection, getDocs, doc, getDoc } from "firebase/firestore";
import { db, auth } from "../firebase/firebase";
import { Plus } from "lucide-react";
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

  useEffect(() => {
    const fetchTeamData = async () => {
      try {
        const decodedTeamName = decodeURIComponent(teamName);
        
        // Fetch team info
        const teamsSnap = await getDocs(collection(db, "teams"));
        let foundTeam = null;
        teamsSnap.forEach(doc => {
          const data = doc.data();
          if (data.school === decodedTeamName) {
            foundTeam = data;
          }
        });
        setTeamInfo(foundTeam);

        // Fetch ownership info from league members
        const membersSnap = await getDocs(collection(db, "leagues", leagueId, "members"));
        let ownership = null;
        
        for (const memberDoc of membersSnap.docs) {
          const memberData = memberDoc.data();
          const lineup = memberData.lineup || {};
          const starters = lineup.starters || [];
          const bench = lineup.bench || [];
          
          // Check if this team is in starters or bench
          if (starters.includes(decodedTeamName)) {
            // Fetch user info for display name
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
            
            ownership = {
              status: "starting",
              ownerName: ownerName,
              teamName: memberData.teamName || "Unnamed Team"
            };
            break;
          } else if (bench.includes(decodedTeamName)) {
            // Fetch user info for display name
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
            
            ownership = {
              status: "bench",
              ownerName: ownerName,
              teamName: memberData.teamName || "Unnamed Team"
            };
            break;
          }
        }
        
        setOwnershipInfo(ownership);

        // Fetch current user's teams for add functionality
        const user = auth.currentUser;
        if (user) {
          const userMemberRef = doc(db, "leagues", leagueId, "members", user.uid);
          const userMemberSnap = await getDoc(userMemberRef);
          if (userMemberSnap.exists()) {
            const userLineup = userMemberSnap.data()?.lineup || {};
            const starters = userLineup.starters || [];
            const bench = userLineup.bench || [];
            setUserTeams([...starters, ...bench]);
          }
        }

        // Fetch schedule for 2025
        const scheduleData = [];
        const weeksSnap = await getDocs(collection(db, "schedule", "2025", "weeks"));
        
        for (const weekDoc of weeksSnap.docs) {
          const weekNum = weekDoc.id;
          const gamesSnap = await getDocs(collection(db, "schedule", "2025", "weeks", weekNum, "games"));
          
          gamesSnap.forEach(gameDoc => {
            const game = gameDoc.data();
            // Check if this team is playing in this game
            if (game.homeTeam === decodedTeamName || game.awayTeam === decodedTeamName) {
              scheduleData.push({
                ...game,
                week: parseInt(weekNum),
                gameId: gameDoc.id
              });
            }
          });
        }

        // Sort by week
        scheduleData.sort((a, b) => a.week - b.week);
        setSchedule(scheduleData);
        setLoading(false);
      } catch (error) {
        console.error("Error fetching team data:", error);
        setLoading(false);
      }
    };

    fetchTeamData();
  }, [teamName, leagueId]);

  const handleAddTeam = (teamName) => {
    const user = auth.currentUser;
    if (!user) return;

    if (userTeams.length < 7) {
      navigate(`/confirm-add/${leagueId}/${teamName}`);
    } else {
      setPendingAddTeam(teamName);
      setSelectedDropTeam("");
      setShowSwapUI(true);
    }
  };

  const handleConfirmSwap = () => {
    if (!selectedDropTeam || !pendingAddTeam) return;
    navigate(`/confirm-swap/${leagueId}/${pendingAddTeam}/${selectedDropTeam}`);
  };

  const formatGameResult = (game, teamName) => {
    const isHome = game.homeTeam === teamName;
    const opponent = isHome ? game.awayTeam : game.homeTeam;
    const teamScore = isHome ? game.homePoints : game.awayPoints;
    const opponentScore = isHome ? game.awayPoints : game.homePoints;
    
    if (game.gameComplete && teamScore !== null && opponentScore !== null) {
      const won = teamScore > opponentScore;
      const result = won ? "W" : "L";
      return `${result} ${teamScore}-${opponentScore}`;
    }
    
    return ""; // Future game, no result
  };

  const formatOpponent = (game, teamName) => {
    const isHome = game.homeTeam === teamName;
    const opponent = isHome ? game.awayTeam : game.homeTeam;
    
    if (game.neutralSite) {
      return `vs ${opponent}`;
    }
    
    return isHome ? `vs ${opponent}` : `@ ${opponent}`;
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      weekday: 'short', 
      month: 'short', 
      day: 'numeric' 
    });
  };

  const renderOwnershipStatus = () => {
    if (!ownershipInfo) {
      return (
        <div style={{ 
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0.75rem", 
          backgroundColor: "#d4edda", 
          border: "1px solid #c3e6cb", 
          borderRadius: "4px", 
          color: "#155724",
          marginBottom: "1rem"
        }}>
          <div>
            <strong>Status:</strong> Free Agent
          </div>
          {auth.currentUser && (
            <button 
              onClick={() => handleAddTeam(decodeURIComponent(teamName))}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "0.5rem",
                backgroundColor: "#28a745",
                color: "white",
                border: "none",
                borderRadius: "4px",
                cursor: "pointer"
              }}
              title="Add to your team"
            >
              <Plus size={20} />
            </button>
          )}
        </div>
      );
    }

    const { status, ownerName, teamName: ownerTeamName } = ownershipInfo;
    const statusText = status === "starting" ? "Starting" : "Riding the bench";
    const bgColor = status === "starting" ? "#d1ecf1" : "#fff3cd";
    const borderColor = status === "starting" ? "#bee5eb" : "#ffeaa7";
    const textColor = status === "starting" ? "#0c5460" : "#856404";

    return (
      <div style={{ 
        padding: "0.75rem", 
        backgroundColor: bgColor, 
        border: `1px solid ${borderColor}`, 
        borderRadius: "4px", 
        color: textColor,
        marginBottom: "1rem"
      }}>
        <strong>Status:</strong> {statusText} for <strong>{ownerTeamName}</strong> (managed by {ownerName})
      </div>
    );
  };

  if (loading) {
    return (
      <div>
        <LeagueNavBar />
        <div style={{ padding: "1rem" }}>
          <p>Loading team information...</p>
        </div>
      </div>
    );
  }

  const decodedTeamName = decodeURIComponent(teamName);

  return (
    <div>
      <LeagueNavBar />
      <div style={{ padding: "1rem" }}>
        <button 
          onClick={() => navigate(-1)} 
          style={{ marginBottom: "1rem", padding: "0.5rem 1rem", cursor: "pointer" }}
        >
          ← Back
        </button>
        
        <h2>{decodedTeamName}</h2>
        
        {/* Ownership Status */}
        {renderOwnershipStatus()}
        
        {/* Team Info */}
        {teamInfo && (
          <div style={{ marginBottom: "1rem", padding: "1rem", backgroundColor: "#f5f5f5", borderRadius: "4px" }}>
            <p><strong>Conference:</strong> {teamInfo.conference || "Independent"}</p>
            {teamInfo.currentSeason && (
              <>
                <p><strong>Record:</strong> {teamInfo.currentSeason.record || "0-0"}</p>
                <p><strong>Conference Record:</strong> {teamInfo.currentSeason.confRecord || "0-0"}</p>
                <p><strong>Points:</strong> {teamInfo.currentSeason.gamePoints || 0}</p>
              </>
            )}
          </div>
        )}

        <h3>Schedule</h3>
        {schedule.length === 0 ? (
          <p>No schedule found for {decodedTeamName}</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ backgroundColor: "#f0f0f0" }}>
                <th style={{ padding: "0.75rem", textAlign: "left", borderBottom: "2px solid #ccc" }}>Week</th>
                <th style={{ padding: "0.75rem", textAlign: "left", borderBottom: "2px solid #ccc" }}>Date</th>
                <th style={{ padding: "0.75rem", textAlign: "left", borderBottom: "2px solid #ccc" }}>Opponent</th>
                <th style={{ padding: "0.75rem", textAlign: "left", borderBottom: "2px solid #ccc" }}>Venue</th>
                <th style={{ padding: "0.75rem", textAlign: "left", borderBottom: "2px solid #ccc" }}>Result</th>
                <th style={{ padding: "0.75rem", textAlign: "center", borderBottom: "2px solid #ccc" }}>Conf Game</th>
              </tr>
            </thead>
            <tbody>
              {schedule.map((game, index) => (
                <tr key={index} style={{ borderBottom: "1px solid #eee" }}>
                  <td style={{ padding: "0.75rem" }}>{game.week}</td>
                  <td style={{ padding: "0.75rem" }}>{formatDate(game.date)}</td>
                  <td style={{ padding: "0.75rem" }}>{formatOpponent(game, decodedTeamName)}</td>
                  <td style={{ padding: "0.75rem" }}>{game.venue || "TBD"}</td>
                  <td style={{ padding: "0.75rem", fontWeight: "bold" }}>
                    {formatGameResult(game, decodedTeamName) || "TBD"}
                  </td>
                  <td style={{ padding: "0.75rem", textAlign: "center" }}>
                    {game.conferenceGame ? "✓" : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Swap UI - only show if user is trying to add this team but has full roster */}
        {showSwapUI && (
          <div style={{ marginTop: "1rem", padding: "1rem", border: "1px solid #ccc", borderRadius: "4px", backgroundColor: "#f8f9fa" }}>
            <h4>Swap in: {pendingAddTeam}</h4>
            <p>Your roster is full. Choose a team to drop:</p>
            <label>
              Drop:
              <select
                value={selectedDropTeam}
                onChange={(e) => setSelectedDropTeam(e.target.value)}
                style={{ marginLeft: "1rem", padding: "0.5rem" }}
              >
                <option value="">Select one of your teams</option>
                {userTeams.map((team) => (
                  <option key={team} value={team}>
                    {team}
                  </option>
                ))}
              </select>
            </label>
            <div style={{ marginTop: "1rem" }}>
              <button
                onClick={handleConfirmSwap}
                disabled={!selectedDropTeam}
                style={{ 
                  marginRight: "1rem",
                  padding: "0.5rem 1rem",
                  backgroundColor: selectedDropTeam ? "#007bff" : "#6c757d",
                  color: "white",
                  border: "none",
                  borderRadius: "4px",
                  cursor: selectedDropTeam ? "pointer" : "not-allowed"
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
                  padding: "0.5rem 1rem",
                  backgroundColor: "#6c757d",
                  color: "white",
                  border: "none",
                  borderRadius: "4px",
                  cursor: "pointer"
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default TeamPage;