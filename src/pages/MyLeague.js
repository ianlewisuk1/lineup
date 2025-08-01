import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { db } from "../firebase/firebase";
import { collection, getDocs, doc, getDoc } from "firebase/firestore";
import LeagueNavBar from "../components/LeagueNavBar";

function MyLeague() {
  const { leagueId } = useParams();
  const navigate = useNavigate();
  const [members, setMembers] = useState([]);
  const [allTeams, setAllTeams] = useState({});
  const [leagueName, setLeagueName] = useState("");
  const [currentWeek, setCurrentWeek] = useState("Preseason");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        console.log("Using leagueId:", leagueId);

        // Fetch league info for name
        const leagueDoc = await getDoc(doc(db, "leagues", leagueId));
        if (leagueDoc.exists()) {
          setLeagueName(leagueDoc.data().name || "League");
        }

        // Fetch current week from global config
        const configDoc = await getDoc(doc(db, "config", "season"));
        if (configDoc.exists()) {
          setCurrentWeek(configDoc.data().currentWeek || "Preseason");
        }

        // Fetch all teams first to get team logos
        const teamsRef = collection(db, "teams");
        const teamsSnapshot = await getDocs(teamsRef);
        const teamsMap = {};
        teamsSnapshot.docs.forEach(doc => {
          const teamData = doc.data();
          if (teamData.school) {
            teamsMap[teamData.school] = {
              logo: teamData.logos1 || teamData.logos2 || null,
              logos1: teamData.logos1 || null,
              logos2: teamData.logos2 || null,
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

        setMembers(membersData);
        setLoading(false);
      } catch (error) {
        console.error("Error fetching data:", error);
        setLoading(false);
      }
    };

    fetchData();
  }, [leagueId]);

  const handleTeamClick = (teamName) => {
    navigate(`/${leagueId}/team/${encodeURIComponent(teamName)}`);
  };

  // Team logo component with fallback
  const TeamLogo = ({ teamName, size = 32, clickable = false }) => {
    const team = allTeams[teamName];
    const logoUrl = team?.logo;

    const handleClick = () => {
      if (clickable && teamName) {
        handleTeamClick(teamName);
      }
    };

    const logoStyle = {
      width: size,
      height: size,
      borderRadius: "50%",
      overflow: "hidden",
      border: "2px solid #ffffff",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "#f1f5f9",
      cursor: clickable ? "pointer" : "default",
      transition: clickable ? "all 0.2s ease" : "none",
      flexShrink: 0,
      boxShadow: "0 2px 4px rgba(0, 0, 0, 0.1)"
    };

    if (logoUrl) {
      return (
        <div 
          style={logoStyle}
          onClick={handleClick}
          onMouseEnter={(e) => {
            if (clickable) {
              e.currentTarget.style.transform = "scale(1.1)";
              e.currentTarget.style.boxShadow = "0 4px 8px rgba(0, 0, 0, 0.15)";
            }
          }}
          onMouseLeave={(e) => {
            if (clickable) {
              e.currentTarget.style.transform = "scale(1)";
              e.currentTarget.style.boxShadow = "0 2px 4px rgba(0, 0, 0, 0.1)";
            }
          }}
          title={clickable ? `View ${teamName} details` : teamName}
        >
          <img 
            src={logoUrl} 
            alt={teamName}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover"
            }}
            onError={(e) => {
              const fallbackUrl = team?.logos2;
              if (fallbackUrl && e.target.src !== fallbackUrl) {
                e.target.src = fallbackUrl;
              } else {
                e.target.style.display = 'none';
                e.target.nextSibling.style.display = 'flex';
              }
            }}
          />
          <div style={{
            display: 'none',
            width: '100%',
            height: '100%',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: size < 30 ? '10px' : '12px',
            fontWeight: '600',
            color: 'white',
            textAlign: 'center',
            background: 'linear-gradient(135deg, #1e40af 0%, #0ea5e9 100%)'
          }}>
            {teamName ? teamName.split(' ').map(word => word[0]).join('').slice(0, 3) : '?'}
          </div>
        </div>
      );
    }

    // Fallback placeholder with team initials and gradient
    return (
      <div 
        style={{
          ...logoStyle,
          background: "linear-gradient(135deg, #1e40af 0%, #0ea5e9 100%)",
          color: "white",
          fontSize: size < 30 ? '10px' : '12px',
          fontWeight: '600'
        }}
        onClick={handleClick}
        onMouseEnter={(e) => {
          if (clickable) {
            e.currentTarget.style.transform = "scale(1.1)";
            e.currentTarget.style.boxShadow = "0 4px 8px rgba(0, 0, 0, 0.15)";
          }
        }}
        onMouseLeave={(e) => {
          if (clickable) {
            e.currentTarget.style.transform = "scale(1)";
            e.currentTarget.style.boxShadow = "0 2px 4px rgba(0, 0, 0, 0.1)";
          }
        }}
        title={clickable ? `View ${teamName} details` : teamName}
      >
        {teamName ? teamName.split(' ').map(word => word[0]).join('').slice(0, 3) : '?'}
      </div>
    );
  };

  if (loading) {
    return (
      <div style={{ 
        padding: "20px", 
        textAlign: "center",
        color: "#64748b",
        fontSize: "16px"
      }}>
        Loading league standings...
      </div>
    );
  }

  // Sort by points descending
  const sortedMembers = [...members].sort((a, b) => {
    const aPoints = a.points ?? 0;
    const bPoints = b.points ?? 0;
    if (bPoints !== aPoints) return bPoints - aPoints;
    
    const aWeeklyPoints = a.weeklyPoints ?? 0;
    const bWeeklyPoints = b.weeklyPoints ?? 0;
    return bWeeklyPoints - aWeeklyPoints;
  });

  return (
    <div style={{ backgroundColor: "#f8fafc", minHeight: "100vh" }}>
      <LeagueNavBar />

      {/* Header */}
      <div style={{ 
        padding: "20px 16px 16px 16px",
        background: "linear-gradient(135deg, #1e40af 0%, #0ea5e9 100%)",
        color: "white"
      }}>
        <h1 style={{ 
          fontSize: "24px", 
          fontWeight: "700", 
          margin: "0 0 8px 0",
          textAlign: "center"
        }}>
          {leagueName ? `${leagueName} Standings` : "League Standings"}
        </h1>
        <p style={{
          fontSize: "14px",
          opacity: "0.9",
          textAlign: "center",
          margin: 0
        }}>
          {sortedMembers.length} managers competing
        </p>
      </div>

      {/* Standings Cards */}
      <div style={{ padding: "16px" }}>
        {sortedMembers.length === 0 ? (
          <div style={{
            backgroundColor: "white",
            borderRadius: "16px",
            padding: "40px 20px",
            textAlign: "center",
            boxShadow: "0 1px 3px rgba(0, 0, 0, 0.1)"
          }}>
            <p style={{ color: "#64748b", fontSize: "16px" }}>
              No members found in this league.
            </p>
          </div>
        ) : (
          sortedMembers.map((member, idx) => {
            const lineup = member.lineup || {};
            const starters = Array.isArray(lineup.starters) ? lineup.starters : [];
            const bench = Array.isArray(lineup.bench) ? lineup.bench : [];
            const allTeamsOwned = [...starters, ...bench].filter(team => 
              typeof team === 'string' && team.trim() !== ''
            );

            // Determine rank styling
            const getRankStyle = (position) => {
              if (position === 0) return { backgroundColor: "#ffd700", color: "#92400e" }; // Gold
              if (position === 1) return { backgroundColor: "#e5e7eb", color: "#374151" }; // Silver
              if (position === 2) return { backgroundColor: "#d97706", color: "white" }; // Bronze
              return { backgroundColor: "#64748b", color: "white" }; // Default
            };

            const rankStyle = getRankStyle(idx);

            return (
              <div key={member.id} style={{
                backgroundColor: "white",
                borderRadius: "12px",
                padding: "16px",
                marginBottom: "8px",
                boxShadow: "0 1px 3px rgba(0, 0, 0, 0.1)",
                border: "1px solid #e2e8f0"
              }}>
                {/* Header: Rank, Team Name, Points */}
                <div style={{
                  display: "flex",
                  alignItems: "center",
                  marginBottom: "12px"
                }}>
                  {/* Rank Badge */}
                  <div style={{
                    width: "32px",
                    height: "32px",
                    borderRadius: "50%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontWeight: "700",
                    fontSize: "14px",
                    marginRight: "12px",
                    flexShrink: 0,
                    ...rankStyle
                  }}>
                    {idx + 1}
                  </div>

                  {/* Team Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <h3 style={{
                      fontSize: "18px",
                      fontWeight: "600",
                      color: "#1e293b",
                      margin: "0 0 2px 0",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap"
                    }}>
                      {member.teamName || "Unnamed Team"}
                    </h3>
                    <p style={{
                      fontSize: "14px",
                      color: "#64748b",
                      margin: 0
                    }}>
                      {member.firstName || "Unknown Manager"}
                    </p>
                  </div>

                  {/* Points & Weekly Score */}
                  <div style={{ textAlign: "right" }}>
                    <div style={{
                      fontSize: "18px",
                      fontWeight: "700",
                      color: "#1e40af",
                      lineHeight: 1
                    }}>
                      {member.points ?? 0}
                    </div>
                    <div style={{
                      fontSize: "11px",
                      color: "#64748b",
                      marginTop: "2px"
                    }}>
                      {member.weeklyPoints ?? 0} in {currentWeek}
                    </div>
                    <div style={{
                      fontSize: "11px",
                      color: "#64748b",
                      marginTop: "1px"
                    }}>
                      {member.freeAgentMoves ?? 0} FA moves
                    </div>
                  </div>
                </div>

                {/* Team Roster with Starters/Bench Separation */}
                <div style={{
                  display: "flex",
                  gap: "12px",
                  alignItems: "flex-start"
                }}>
                  {/* Starters Section */}
                  <div style={{ flex: 1 }}>
                    <div style={{
                      fontSize: "10px",
                      fontWeight: "600",
                      color: "#059669",
                      textTransform: "uppercase",
                      letterSpacing: "0.5px",
                      marginBottom: "4px",
                      textAlign: "left"
                    }}>
                      Starters
                    </div>
                    <div style={{
                      display: "flex",
                      gap: "4px",
                      justifyContent: "flex-start",
                      flexWrap: "wrap"
                    }}>
                      {/* Starters */}
                      {starters.slice(0, 5).map((teamName, teamIdx) => (
                        <TeamLogo 
                          key={`starter-${teamIdx}`}
                          teamName={teamName} 
                          size={36} 
                          clickable={true} 
                        />
                      ))}
                      
                      {/* Empty starter slots */}
                      {Array.from({ length: Math.max(0, 5 - starters.length) }).map((_, emptyIdx) => (
                        <div key={`empty-starter-${emptyIdx}`} style={{
                          width: "36px",
                          height: "36px",
                          borderRadius: "50%",
                          border: "2px dashed #059669",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          backgroundColor: "#f0fdf4",
                          flexShrink: 0,
                          boxShadow: "0 1px 3px rgba(0, 0, 0, 0.05)"
                        }}>
                          <div style={{
                            width: "8px",
                            height: "8px",
                            borderRadius: "50%",
                            backgroundColor: "#059669"
                          }} />
                        </div>
                      ))}
                    </div>
                  </div>
                  
                  {/* Bench Section */}
                  <div style={{ flex: "0 0 auto", minWidth: "70px" }}>
                    <div style={{
                      fontSize: "10px",
                      fontWeight: "600",
                      color: "#d97706",
                      textTransform: "uppercase",
                      letterSpacing: "0.5px",
                      marginBottom: "4px",
                      textAlign: "left"
                    }}>
                      Bench
                    </div>
                    <div style={{
                      display: "flex",
                      gap: "4px",
                      justifyContent: "flex-start"
                    }}>
                      {/* Bench */}
                      {bench.slice(0, 2).map((teamName, teamIdx) => (
                        <TeamLogo 
                          key={`bench-${teamIdx}`}
                          teamName={teamName} 
                          size={36} 
                          clickable={true} 
                        />
                      ))}
                      
                      {/* Empty bench slots */}
                      {Array.from({ length: Math.max(0, 2 - bench.length) }).map((_, emptyIdx) => (
                        <div key={`empty-bench-${emptyIdx}`} style={{
                          width: "36px",
                          height: "36px",
                          borderRadius: "50%",
                          border: "2px dashed #d97706",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          backgroundColor: "#fffbeb",
                          flexShrink: 0,
                          boxShadow: "0 1px 3px rgba(0, 0, 0, 0.05)"
                        }}>
                          <div style={{
                            width: "8px",
                            height: "8px",
                            borderRadius: "50%",
                            backgroundColor: "#d97706"
                          }} />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Smack Talk Speech Bubble - Only show if exists */}
                {member.smackTalk && member.smackTalk.trim() && (
                  <div style={{
                    marginTop: "10px",
                    position: "relative",
                    display: "flex",
                    justifyContent: "flex-start"
                  }}>
                    <div style={{
                      backgroundColor: "#1e40af",
                      color: "white",
                      padding: "8px 12px",
                      borderRadius: "16px",
                      fontSize: "12px",
                      fontWeight: "500",
                      maxWidth: "80%",
                      wordWrap: "break-word",
                      position: "relative",
                      boxShadow: "0 2px 4px rgba(30, 64, 175, 0.3)"
                    }}>
                      💬 {member.smackTalk}
                      {/* Speech bubble tail */}
                      <div style={{
                        position: "absolute",
                        bottom: "-6px",
                        left: "16px",
                        width: 0,
                        height: 0,
                        borderLeft: "6px solid transparent",
                        borderRight: "6px solid transparent",
                        borderTop: "6px solid #1e40af"
                      }} />
                    </div>
                  </div>
                )}

                {/* FA Moves removed from here since it's now with points */}
              </div>
            );
          })
        )}
      </div>

      {/* Bottom spacing for navigation */}
      <div style={{ height: "80px" }} />
    </div>
  );
}

export default MyLeague;