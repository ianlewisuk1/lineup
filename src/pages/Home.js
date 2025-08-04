import React, { useEffect, useState } from "react";
import { auth, db } from "../firebase/firebase";
import { doc, getDoc } from "firebase/firestore";
import { useNavigate, useLocation } from "react-router-dom";
import { Trophy, Users, ArrowRight } from "lucide-react";

function Home() {
  const [leagueList, setLeagueList] = useState([]);
  const [isAdmin, setIsAdmin] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const location = useLocation();
  const flashMessage = location.state?.message;

  useEffect(() => {
    const fetchUserAndLeagues = async () => {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        setLoading(false);
        return;
      }

      try {
        const userRef = doc(db, "users", currentUser.uid);
        const userSnap = await getDoc(userRef);
        const userData = userSnap.data();
        const adminStatus = userData?.isAdmin || false;
        setIsAdmin(adminStatus);

        if (adminStatus) {
          navigate("/admin");
          return;
        }

        const leagueIds = userData?.leagueIds || [];
        const leaguesData = [];
        for (let leagueId of leagueIds) {
          const leagueRef = doc(db, "leagues", leagueId);
          const leagueSnap = await getDoc(leagueRef);
          if (leagueSnap.exists()) {
            leaguesData.push({ id: leagueId, ...leagueSnap.data() });
          }
        }

        setLeagueList(leaguesData);
      } catch (error) {
        console.error("Error fetching user data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchUserAndLeagues();
  }, [navigate]);

  if (isAdmin) return null;

  if (loading) {
    return (
      <div style={{ backgroundColor: "#f8fafc", minHeight: "100vh", width: "100%", overflowX: "hidden" }}>
        <div style={{ 
          padding: "40px 20px", 
          textAlign: "center",
          color: "#64748b",
          fontSize: "16px"
        }}>
          <div style={{ marginBottom: "16px", fontSize: "18px", fontWeight: "600" }}>
            Loading your leagues...
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ backgroundColor: "#f8fafc", minHeight: "100vh" }}>
      {/* Header */}
      <div style={{ 
        padding: "20px 16px 16px 16px",
        background: "linear-gradient(135deg, #1e40af 0%, #0ea5e9 100%)",
        color: "white"
      }}>
        <div style={{ maxWidth: "100%", width: "100%" }}>
          <h1 style={{ 
            fontSize: "clamp(24px, 5vw, 32px)", 
            fontWeight: "700", 
            margin: "0 0 8px 0",
            display: "flex",
            alignItems: "center",
            gap: "12px",
            flexWrap: "wrap"
          }}>
            <Trophy size={32} />
            My Leagues
          </h1>
          
          <p style={{
            fontSize: "clamp(14px, 3vw, 18px)",
            opacity: "0.9",
            margin: 0
          }}>
            Welcome back! Here are your fantasy leagues.
          </p>
        </div>
      </div>

      <div style={{ padding: "20px 16px", width: "100%", boxSizing: "border-box" }}>
        {/* Flash Message */}
        {flashMessage && (
          <div style={{ 
            padding: "16px", 
            backgroundColor: "#ecfdf5", 
            border: "2px solid #10b981", 
            borderRadius: "12px", 
            color: "#065f46",
            marginBottom: "24px",
            boxShadow: "0 2px 4px rgba(0,0,0,0.1)"
          }}>
            <div style={{ fontWeight: "600" }}>{flashMessage}</div>
          </div>
        )}

        {/* Leagues List */}
        {leagueList.length === 0 ? (
          <div style={{ 
            display: "grid", 
            gap: "16px",
            gridTemplateColumns: "repeat(auto-fit, minmax(min(350px, 100%), 1fr))",
            width: "100%"
          }}>
            {/* Create League Card */}
            <div style={{
              backgroundColor: "white",
              borderRadius: "12px",
              padding: "32px 24px",
              boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
              border: "2px dashed #e5e7eb",
              textAlign: "center",
              transition: "all 0.2s ease",
              cursor: "pointer"
            }}
            onMouseEnter={(e) => {
              e.target.style.borderColor = "#1e40af";
              e.target.style.backgroundColor = "#f0f9ff";
              e.target.style.transform = "translateY(-2px)";
              e.target.style.boxShadow = "0 8px 25px rgba(0,0,0,0.15)";
            }}
            onMouseLeave={(e) => {
              e.target.style.borderColor = "#e5e7eb";
              e.target.style.backgroundColor = "white";
              e.target.style.transform = "translateY(0px)";
              e.target.style.boxShadow = "0 2px 4px rgba(0,0,0,0.1)";
            }}
            onClick={() => navigate("/create-league")}
            >
              <div style={{
                width: "64px",
                height: "64px",
                borderRadius: "50%",
                backgroundColor: "#1e40af",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto 16px auto"
              }}>
                <Trophy size={32} style={{ color: "white" }} />
              </div>
              
              <h3 style={{ 
                fontSize: "20px", 
                fontWeight: "600", 
                color: "#1e293b",
                margin: "0 0 8px 0"
              }}>
                Create a League
              </h3>
              <p style={{ 
                color: "#64748b", 
                fontSize: "14px",
                margin: "0 0 20px 0",
                lineHeight: "1.5"
              }}>
                Start your own fantasy league and invite friends to compete
              </p>
              
              <div style={{
                padding: "8px 16px",
                backgroundColor: "#1e40af",
                color: "white",
                borderRadius: "6px",
                fontSize: "14px",
                fontWeight: "500",
                display: "inline-block"
              }}>
                Get Started
              </div>
            </div>

            {/* Join League Card */}
            <div style={{
              backgroundColor: "white",
              borderRadius: "12px",
              padding: "32px 24px",
              boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
              border: "2px dashed #e5e7eb",
              textAlign: "center",
              transition: "all 0.2s ease",
              cursor: "pointer"
            }}
            onMouseEnter={(e) => {
              e.target.style.borderColor = "#059669";
              e.target.style.backgroundColor = "#f0fdf4";
              e.target.style.transform = "translateY(-2px)";
              e.target.style.boxShadow = "0 8px 25px rgba(0,0,0,0.15)";
            }}
            onMouseLeave={(e) => {
              e.target.style.borderColor = "#e5e7eb";
              e.target.style.backgroundColor = "white";
              e.target.style.transform = "translateY(0px)";
              e.target.style.boxShadow = "0 2px 4px rgba(0,0,0,0.1)";
            }}
            onClick={() => navigate("/join-league")}
            >
              <div style={{
                width: "64px",
                height: "64px",
                borderRadius: "50%",
                backgroundColor: "#059669",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto 16px auto"
              }}>
                <Users size={32} style={{ color: "white" }} />
              </div>
              
              <h3 style={{ 
                fontSize: "20px", 
                fontWeight: "600", 
                color: "#1e293b",
                margin: "0 0 8px 0"
              }}>
                Join a League
              </h3>
              <p style={{ 
                color: "#64748b", 
                fontSize: "14px",
                margin: "0 0 20px 0",
                lineHeight: "1.5"
              }}>
                Got an invite code? Join an existing fantasy league
              </p>
              
              <div style={{
                padding: "8px 16px",
                backgroundColor: "#059669",
                color: "white",
                borderRadius: "6px",
                fontSize: "14px",
                fontWeight: "500",
                display: "inline-block"
              }}>
                Join Now
              </div>
            </div>
          </div>
        ) : (
          <div style={{ 
            display: "grid", 
            gap: "16px",
            gridTemplateColumns: "repeat(auto-fit, minmax(min(400px, 100%), 1fr))",
            width: "100%"
          }}>
            {leagueList.map((league) => (
              <div 
                key={league.id} 
                style={{
                  backgroundColor: "white",
                  borderRadius: "12px",
                  padding: "24px",
                  boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
                  border: "1px solid #e5e7eb",
                  transition: "all 0.2s ease",
                  cursor: "pointer"
                }}
                onMouseEnter={(e) => {
                  e.target.style.transform = "translateY(-2px)";
                  e.target.style.boxShadow = "0 8px 25px rgba(0,0,0,0.15)";
                }}
                onMouseLeave={(e) => {
                  e.target.style.transform = "translateY(0px)";
                  e.target.style.boxShadow = "0 2px 4px rgba(0,0,0,0.1)";
                }}
                onClick={() => navigate(`/${league.id}/my-lineup`)}
              >
                <div style={{ 
                  display: "flex", 
                  alignItems: "center", 
                  justifyContent: "space-between",
                  marginBottom: "16px"
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    <div style={{
                      width: "48px",
                      height: "48px",
                      borderRadius: "50%",
                      backgroundColor: "#1e40af",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "white",
                      fontSize: "18px",
                      fontWeight: "bold"
                    }}>
                      {(league.name || "UL").substring(0, 2).toUpperCase()}
                    </div>
                    
                    <div>
                      <h3 style={{ 
                        fontSize: "clamp(18px, 4vw, 20px)", 
                        fontWeight: "600", 
                        margin: "0 0 4px 0",
                        color: "#1e293b",
                        wordBreak: "break-word"
                      }}>
                        {league.name || "Unnamed League"}
                      </h3>
                      <p style={{ 
                        fontSize: "clamp(12px, 2.5vw, 14px)", 
                        color: "#64748b",
                        margin: 0,
                        wordBreak: "break-all"
                      }}>
                        League ID: {league.id}
                      </p>
                    </div>
                  </div>
                  
                  <ArrowRight size={20} style={{ color: "#94a3b8" }} />
                </div>

                <div style={{ 
                  display: "grid", 
                  gridTemplateColumns: "1fr 1fr", 
                  gap: "16px",
                  marginTop: "16px"
                }}>
                  <div>
                    <div style={{ 
                      fontSize: "11px", 
                      color: "#64748b", 
                      marginBottom: "4px", 
                      textTransform: "uppercase", 
                      letterSpacing: "0.5px" 
                    }}>
                      Members
                    </div>
                    <div style={{ 
                      fontSize: "16px", 
                      fontWeight: "700", 
                      color: "#1e293b" 
                    }}>
                      {league.memberCount || "—"}
                    </div>
                  </div>
                  
                  <div>
                    <div style={{ 
                      fontSize: "11px", 
                      color: "#64748b", 
                      marginBottom: "4px", 
                      textTransform: "uppercase", 
                      letterSpacing: "0.5px" 
                    }}>
                      Season
                    </div>
                    <div style={{ 
                      fontSize: "16px", 
                      fontWeight: "700", 
                      color: "#1e293b" 
                    }}>
                      2025
                    </div>
                  </div>
                </div>

                {/* Action Button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate(`/${league.id}/my-lineup`);
                  }}
                  style={{
                    width: "100%",
                    marginTop: "20px",
                    padding: "12px",
                    backgroundColor: "#f8fafc",
                    color: "#1e40af",
                    border: "2px solid #e0e7ff",
                    borderRadius: "8px",
                    fontSize: "14px",
                    fontWeight: "600",
                    cursor: "pointer",
                    transition: "all 0.2s ease",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "8px"
                  }}
                  onMouseEnter={(e) => {
                    e.target.style.backgroundColor = "#e0e7ff";
                    e.target.style.borderColor = "#c7d2fe";
                  }}
                  onMouseLeave={(e) => {
                    e.target.style.backgroundColor = "#f8fafc";
                    e.target.style.borderColor = "#e0e7ff";
                  }}
                >
                  View My Lineup
                  <ArrowRight size={16} />
                </button>
              </div>
            ))}
            
            {/* Create League Card */}
            <div style={{
              backgroundColor: "white",
              borderRadius: "12px",
              padding: "32px 24px",
              boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
              border: "2px dashed #e5e7eb",
              textAlign: "center",
              transition: "all 0.2s ease",
              cursor: "pointer"
            }}
            onMouseEnter={(e) => {
              e.target.style.borderColor = "#1e40af";
              e.target.style.backgroundColor = "#f0f9ff";
              e.target.style.transform = "translateY(-2px)";
              e.target.style.boxShadow = "0 8px 25px rgba(0,0,0,0.15)";
            }}
            onMouseLeave={(e) => {
              e.target.style.borderColor = "#e5e7eb";
              e.target.style.backgroundColor = "white";
              e.target.style.transform = "translateY(0px)";
              e.target.style.boxShadow = "0 2px 4px rgba(0,0,0,0.1)";
            }}
            onClick={() => navigate("/create-league")}
            >
              <div style={{
                width: "48px",
                height: "48px",
                borderRadius: "50%",
                backgroundColor: "#1e40af",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto 16px auto"
              }}>
                <Trophy size={24} style={{ color: "white" }} />
              </div>
              
              <h3 style={{ 
                fontSize: "18px", 
                fontWeight: "600", 
                color: "#1e293b",
                margin: "0 0 8px 0"
              }}>
                Create New League
              </h3>
              <p style={{ 
                color: "#64748b", 
                fontSize: "14px",
                margin: "0 0 16px 0",
                lineHeight: "1.4"
              }}>
                Start your own fantasy league
              </p>
              
              <div style={{
                padding: "8px 16px",
                backgroundColor: "#1e40af",
                color: "white",
                borderRadius: "6px",
                fontSize: "14px",
                fontWeight: "500",
                display: "inline-block"
              }}>
                Create League
              </div>
            </div>

            {/* Join League Card */}
            <div style={{
              backgroundColor: "white",
              borderRadius: "12px",
              padding: "32px 24px",
              boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
              border: "2px dashed #e5e7eb",
              textAlign: "center",
              transition: "all 0.2s ease",
              cursor: "pointer"
            }}
            onMouseEnter={(e) => {
              e.target.style.borderColor = "#059669";
              e.target.style.backgroundColor = "#f0fdf4";
              e.target.style.transform = "translateY(-2px)";
              e.target.style.boxShadow = "0 8px 25px rgba(0,0,0,0.15)";
            }}
            onMouseLeave={(e) => {
              e.target.style.borderColor = "#e5e7eb";
              e.target.style.backgroundColor = "white";
              e.target.style.transform = "translateY(0px)";
              e.target.style.boxShadow = "0 2px 4px rgba(0,0,0,0.1)";
            }}
            onClick={() => navigate("/join-league")}
            >
              <div style={{
                width: "48px",
                height: "48px",
                borderRadius: "50%",
                backgroundColor: "#059669",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto 16px auto"
              }}>
                <Users size={24} style={{ color: "white" }} />
              </div>
              
              <h3 style={{ 
                fontSize: "18px", 
                fontWeight: "600", 
                color: "#1e293b",
                margin: "0 0 8px 0"
              }}>
                Join a League
              </h3>
              <p style={{ 
                color: "#64748b", 
                fontSize: "14px",
                margin: "0 0 16px 0",
                lineHeight: "1.4"
              }}>
                Got an invite code? Join now
              </p>
              
              <div style={{
                padding: "8px 16px",
                backgroundColor: "#059669",
                color: "white",
                borderRadius: "6px",
                fontSize: "14px",
                fontWeight: "500",
                display: "inline-block"
              }}>
                Join League
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Bottom spacing */}
      <div style={{ height: "80px" }} />
    </div>
  );
}

export default Home;