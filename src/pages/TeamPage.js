// src/pages/TeamPage.js
import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../firebase/firebase";
import LeagueNavBar from "../components/LeagueNavBar";

function TeamPage() {
  const { leagueId, teamName } = useParams();
  const navigate = useNavigate();
  const [schedule, setSchedule] = useState([]);
  const [loading, setLoading] = useState(true);
  const [teamInfo, setTeamInfo] = useState(null);

  useEffect(() => {
    const fetchTeamSchedule = async () => {
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
        console.error("Error fetching team schedule:", error);
        setLoading(false);
      }
    };

    fetchTeamSchedule();
  }, [teamName]);

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

  if (loading) {
    return (
      <div>
        <LeagueNavBar />
        <div style={{ padding: "1rem" }}>
          <p>Loading team schedule...</p>
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
        
        <h2>{decodedTeamName} Schedule</h2>
        
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
      </div>
    </div>
  );
}

export default TeamPage;