import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { db } from "../firebase/firebase";
import { collection, getDocs, doc, getDoc } from "firebase/firestore";
import LeagueNavBar from "../components/LeagueNavBar";

function MyLeague() {
  const { leagueId } = useParams();
  const [members, setMembers] = useState([]);
  const [allTeams, setAllTeams] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        console.log("Using leagueId:", leagueId); // DEBUG

        // Fetch all teams first to get team logos
        const teamsRef = collection(db, "teams");
        const teamsSnapshot = await getDocs(teamsRef);
        const teamsMap = {};
        teamsSnapshot.docs.forEach(doc => {
          const teamData = doc.data();
          if (teamData.school) {
            teamsMap[teamData.school] = {
              logo: teamData.logo || null,
              colors: teamData.colors || {}
            };
          }
        });
        setAllTeams(teamsMap);

        // Fetch league members
        const membersRef = collection(db, "leagues", leagueId, "members");
        const snapshot = await getDocs(membersRef);
        
        const membersData = await Promise.all(
          snapshot.docs.map(async (memberDoc) => {
            const memberData = memberDoc.data();
            
            // Fetch user data for first name
            let firstName = "Unknown";
            try {
              if (memberDoc.id) {
                const userDoc = await getDoc(doc(db, "users", memberDoc.id));
                if (userDoc.exists()) {
                  const userData = userDoc.data();
                  firstName = userData.firstName || userData.displayName || "Unknown";
                }
              }
            } catch (userError) {
              console.warn("Could not fetch user data:", userError);
            }

            return {
              id: memberDoc.id,
              firstName,
              ...memberData
            };
          })
        );

        console.log("Fetched members:", membersData); // DEBUG

        setMembers(membersData);
        setLoading(false);
      } catch (error) {
        console.error("Error fetching data:", error);
        setLoading(false);
      }
    };

    fetchData();
  }, [leagueId]);

  // Team logo component with fallback
  const TeamLogo = ({ teamName, size = 32 }) => {
    const team = allTeams[teamName];
    const logoUrl = team?.logo;

    if (logoUrl) {
      return (
        <div style={{
          width: size,
          height: size,
          borderRadius: "50%",
          overflow: "hidden",
          border: "1px solid #ddd",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#f5f5f5"
        }}>
          <img 
            src={logoUrl} 
            alt={teamName}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover"
            }}
            onError={(e) => {
              // Fallback to placeholder if image fails to load
              e.target.style.display = 'none';
              e.target.nextSibling.style.display = 'flex';
            }}
          />
          <div style={{
            display: 'none',
            width: '100%',
            height: '100%',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '10px',
            fontWeight: 'bold',
            color: '#666',
            textAlign: 'center',
            lineHeight: '12px'
          }}>
            {teamName ? teamName.split(' ').map(word => word[0]).join('').slice(0, 3) : '?'}
          </div>
        </div>
      );
    }

    // Fallback placeholder with team initials
    return (
      <div style={{
        width: size,
        height: size,
        borderRadius: "50%",
        border: "1px solid #ddd",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#e9ecef",
        fontSize: size < 30 ? '10px' : '12px',
        fontWeight: 'bold',
        color: '#666'
      }}>
        {teamName ? teamName.split(' ').map(word => word[0]).join('').slice(0, 3) : '?'}
      </div>
    );
  };

  // Manager team logo (placeholder for now)
  const ManagerLogo = ({ teamName, size = 40 }) => {
    return (
      <div style={{
        width: size,
        height: size,
        borderRadius: "50%",
        border: "2px solid #007bff",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#007bff",
        fontSize: '14px',
        fontWeight: 'bold',
        color: 'white'
      }}>
        {teamName ? teamName.split(' ').map(word => word[0]).join('').slice(0, 2) : 'TM'}
      </div>
    );
  };

  if (loading) return <p>Loading...</p>;

  // Sort by points descending (you can adjust this logic)
  const sortedMembers = [...members].sort((a, b) => {
    const aPoints = a.points ?? 0;
    const bPoints = b.points ?? 0;
    if (bPoints !== aPoints) return bPoints - aPoints;
    
    const aWeeklyPoints = a.weeklyPoints ?? 0;
    const bWeeklyPoints = b.weeklyPoints ?? 0;
    return bWeeklyPoints - aWeeklyPoints;
  });

  return (
    <div style={{ padding: "1rem" }}>
      <LeagueNavBar />

      <h2>League Standings</h2>
      {sortedMembers.length === 0 ? (
        <p>No members found in this league.</p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ 
            width: "100%", 
            borderCollapse: "collapse",
            minWidth: "800px"
          }}>
            <thead>
              <tr style={{ backgroundColor: "#f8f9fa" }}>
                <th style={headerStyle}>#</th>
                <th style={headerStyle}>Team</th>
                <th style={headerStyle}>Manager</th>
                <th style={headerStyle} colSpan="7">Current Roster</th>
                <th style={headerStyle}>FA Moves</th>
                <th style={headerStyle}>Weekly Pts</th>
                <th style={headerStyle}>Total Pts</th>
              </tr>
            </thead>
            <tbody>
              {sortedMembers.map((member, idx) => {
                const lineup = member.lineup || {};
                const starters = Array.isArray(lineup.starters) ? lineup.starters : [];
                const bench = Array.isArray(lineup.bench) ? lineup.bench : [];
                const allTeamsOwned = [...starters, ...bench].filter(team => 
                  typeof team === 'string' && team.trim() !== ''
                );
                
                // Pad with empty slots if less than 7 teams
                const paddedTeams = [...allTeamsOwned];
                while (paddedTeams.length < 7) {
                  paddedTeams.push(null);
                }

                return (
                  <tr key={member.id} style={{ 
                    borderBottom: "1px solid #dee2e6",
                    backgroundColor: idx % 2 === 0 ? "#ffffff" : "#f8f9fa"
                  }}>
                    <td style={cellStyle}>
                      <div style={{
                        width: "30px",
                        height: "30px",
                        borderRadius: "50%",
                        backgroundColor: idx < 3 ? "#ffd700" : "#6c757d",
                        color: "white",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontWeight: "bold"
                      }}>
                        {idx + 1}
                      </div>
                    </td>
                    
                    <td style={cellStyle}>
                      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                        <ManagerLogo teamName={member.teamName} />
                        <div>
                          <div style={{ fontWeight: "bold", fontSize: "14px" }}>
                            {member.teamName || "Unnamed Team"}
                          </div>
                        </div>
                      </div>
                    </td>
                    
                    <td style={cellStyle}>
                      <div style={{ fontSize: "14px" }}>
                        {typeof member.firstName === 'string' ? member.firstName : 'Unknown'}
                      </div>
                    </td>
                    
                    {/* 7 team slots */}
                    {paddedTeams.slice(0, 7).map((teamName, teamIdx) => (
                      <td key={teamIdx} style={{ ...cellStyle, textAlign: "center" }}>
                        {teamName && typeof teamName === 'string' ? (
                          <div style={{ display: "flex", justifyContent: "center" }}>
                            <TeamLogo teamName={teamName} size={28} />
                          </div>
                        ) : (
                          <div style={{
                            width: "28px",
                            height: "28px",
                            borderRadius: "50%",
                            border: "1px dashed #ccc",
                            margin: "0 auto"
                          }} />
                        )}
                      </td>
                    ))}
                    
                    <td style={{ ...cellStyle, textAlign: "center" }}>
                      {typeof member.freeAgentMoves === 'number' ? member.freeAgentMoves : 0}
                    </td>
                    
                    <td style={{ ...cellStyle, textAlign: "center", fontWeight: "bold" }}>
                      {typeof member.weeklyPoints === 'number' ? member.weeklyPoints : 0}
                    </td>
                    
                    <td style={{ ...cellStyle, textAlign: "center", fontWeight: "bold", fontSize: "16px" }}>
                      {typeof member.points === 'number' ? member.points : 0}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <h2 style={{ marginTop: "2rem" }}>National Comparison</h2>
      <p>(Coming soon...)</p>
    </div>
  );
}

const headerStyle = {
  padding: "12px 8px",
  borderBottom: "2px solid #dee2e6",
  textAlign: "left",
  fontWeight: "bold",
  fontSize: "12px",
  color: "#495057"
};

const cellStyle = {
  padding: "8px",
  borderBottom: "1px solid #dee2e6",
  verticalAlign: "middle"
};

export default MyLeague;