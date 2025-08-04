import React, { useEffect, useState, useRef } from "react";
import { db, auth } from "../firebase/firebase";
import {
  collection,
  getDocs,
  getDoc,
  doc,
  updateDoc,
} from "firebase/firestore";
import { useParams, useNavigate } from "react-router-dom";
import { Plus, Search, Filter, ChevronDown } from "lucide-react";
import LeagueNavBar from "../components/LeagueNavBar";

// Custom Dropdown Component with matching height and truncation
const CustomDropdown = ({ 
  value, 
  onChange, 
  options, 
  placeholder = "Select an option",
  icon: Icon = Filter 
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const dropdownRef = useRef(null);
  const listRef = useRef(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
        setHighlightedIndex(-1);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, []);

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (!isOpen) return;

      switch (event.key) {
        case 'ArrowDown':
          event.preventDefault();
          setHighlightedIndex(prev => 
            prev < options.length - 1 ? prev + 1 : 0
          );
          break;
        case 'ArrowUp':
          event.preventDefault();
          setHighlightedIndex(prev => 
            prev > 0 ? prev - 1 : options.length - 1
          );
          break;
        case 'Enter':
          event.preventDefault();
          if (highlightedIndex >= 0) {
            handleSelect(options[highlightedIndex]);
          }
          break;
        case 'Escape':
          setIsOpen(false);
          setHighlightedIndex(-1);
          break;
        default:
          break;
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, highlightedIndex, options]);

  // Scroll highlighted item into view
  useEffect(() => {
    if (highlightedIndex >= 0 && listRef.current) {
      const highlightedElement = listRef.current.children[highlightedIndex];
      if (highlightedElement) {
        highlightedElement.scrollIntoView({
          block: 'nearest',
          behavior: 'smooth'
        });
      }
    }
  }, [highlightedIndex]);

  const handleSelect = (option) => {
    onChange(option.value);
    setIsOpen(false);
    setHighlightedIndex(-1);
  };

  const toggleDropdown = () => {
    setIsOpen(!isOpen);
    setHighlightedIndex(-1);
  };

  const selectedOption = options.find(opt => opt.value === value);

  // Truncate text if too long - balanced for readability
  const truncateText = (text, maxLength = 10) => {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength - 3) + '...';
  };

  return (
    <div 
      ref={dropdownRef}
      style={{ 
        position: 'relative', 
        width: '100%',
        userSelect: 'none'
      }}
    >
      {/* Dropdown Trigger - matching search input height exactly */}
      <button
        type="button"
        onClick={toggleDropdown}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            toggleDropdown();
          }
        }}
        style={{
          width: '100%',
          height: '44px', // Exact match with search input
          padding: '12px 48px 12px 48px',
          backgroundColor: 'white',
          border: `2px solid ${isOpen ? '#1e40af' : '#e5e7eb'}`,
          borderRadius: '8px',
          fontSize: '14px',
          fontFamily: 'inherit',
          color: selectedOption ? '#1e293b' : '#64748b',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          textAlign: 'left',
          transition: 'all 0.2s ease',
          outline: 'none',
          boxSizing: 'border-box',
          WebkitAppearance: 'none',
          MozAppearance: 'none',
          appearance: 'none'
        }}
        onFocus={(e) => e.target.style.borderColor = '#1e40af'}
        onBlur={(e) => {
          if (!isOpen) e.target.style.borderColor = '#e5e7eb';
        }}
      >
        {/* Left Icon */}
        <Icon 
          size={16} 
          style={{
            position: 'absolute',
            left: '12px',
            color: '#64748b',
            pointerEvents: 'none'
          }}
        />
        
        {/* Selected Text with truncation */}
        <span style={{
          flex: 1,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          paddingRight: '8px'
        }} title={selectedOption ? selectedOption.label : placeholder}>
          {selectedOption ? truncateText(selectedOption.label) : placeholder}
        </span>
        
        {/* Chevron Icon */}
        <ChevronDown 
          size={16} 
          style={{
            color: '#64748b',
            transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s ease',
            flexShrink: 0
          }}
        />
      </button>

      {/* Dropdown List */}
      {isOpen && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            marginTop: '4px',
            backgroundColor: 'white',
            border: '2px solid #e5e7eb',
            borderRadius: '8px',
            boxShadow: '0 10px 25px rgba(0, 0, 0, 0.15)',
            zIndex: 1000,
            maxHeight: '240px',
            overflowY: 'auto',
            overflowX: 'hidden'
          }}
        >
          <ul
            ref={listRef}
            style={{
              margin: 0,
              padding: '4px 0',
              listStyle: 'none'
            }}
          >
            {options.map((option, index) => (
              <li
                key={option.value}
                onClick={() => handleSelect(option)}
                onMouseEnter={() => setHighlightedIndex(index)}
                style={{
                  padding: '12px 16px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  color: '#1e293b',
                  backgroundColor: 
                    highlightedIndex === index ? '#f1f5f9' :
                    value === option.value ? '#eff6ff' : 'transparent',
                  borderLeft: value === option.value ? '3px solid #1e40af' : '3px solid transparent',
                  transition: 'all 0.15s ease',
                  fontWeight: value === option.value ? '600' : '400'
                }}
                onMouseDown={(e) => e.preventDefault()}
                title={option.label} // Show full text on hover
              >
                {option.label}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

// Compact Sort Button Component
const SortButton = ({ label, sortKey, sortConfig, onSort }) => (
  <button
    onClick={() => onSort(sortKey)}
    style={{
      padding: '6px 10px',
      backgroundColor: sortConfig.key === sortKey ? '#eff6ff' : 'transparent',
      border: sortConfig.key === sortKey ? '1px solid #1e40af' : '1px solid #e5e7eb',
      borderRadius: '4px',
      fontSize: '12px',
      fontWeight: '500',
      color: sortConfig.key === sortKey ? '#1e40af' : '#64748b',
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      gap: '4px',
      transition: 'all 0.2s ease'
    }}
    onMouseEnter={(e) => {
      if (sortConfig.key !== sortKey) {
        e.target.style.backgroundColor = '#f8fafc';
      }
    }}
    onMouseLeave={(e) => {
      if (sortConfig.key !== sortKey) {
        e.target.style.backgroundColor = 'transparent';
      }
    }}
  >
    {label}
    <span style={{ fontSize: '10px' }}>
      {sortConfig.key === sortKey ? (sortConfig.direction === 'asc' ? '▲' : '▼') : '⇅'}
    </span>
  </button>
);

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
  const fetchData = async () => {
  const teamsSnap = await getDocs(collection(db, "teams"));
  const membersSnap = await getDocs(collection(db, "leagues", leagueId, "members"));

  const teamsMap = {};
  const drafted = {};
  
  // Build drafted teams object
  membersSnap.forEach(doc => {
    const { displayName, teamName, lineup } = doc.data();
    const starters = lineup?.starters || [];
    const bench = lineup?.bench || [];
    const current = [...starters, ...bench];

    current.forEach(teamId => {
      // Teams are stored as document IDs, so use them directly
      if (teamId && teamId.trim()) {
        drafted[teamId] = {
          ownerName: displayName,
          teamName: teamName || "Unnamed Squad"
        };
      }
    });
  });

  // DEBUG CODE - ADD THIS:
  console.log("=== DETAILED MEMBER DEBUG ===");
  membersSnap.forEach((doc, index) => {
    const data = doc.data();
    console.log(`Member ${index + 1}:`, {
      displayName: data.displayName,
      teamName: data.teamName,
      lineup: data.lineup
    });
    
    if (data.lineup) {
      console.log(`  - Starters:`, data.lineup.starters);
      console.log(`  - Bench:`, data.lineup.bench);
      console.log(`  - Drafted:`, data.lineup.drafted);
    }
  });

  // Build teams map
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

  // Set state
  const sortedConf = Object.keys(teamsMap).sort();
  setConferenceList(["National", ...sortedConf]);
  setTeamsByConference(teamsMap);
  setActiveConference("National");
  setDraftedTeams(drafted);

  // Get current user's teams
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
      setTeamToAdd(team);
      setShowAddModal(true);
    } else {
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
      
      // NORMALIZE THE TEAM NAME BEFORE SAVING
      const normalizedTeamName = teamToAdd.school
        .toLowerCase()
        .replace(/\s+/g, "-")
        .replace(/&/g, "")
        .replace(/[^a-z0-9\-]/g, "");
      
      const emptyStarterIndex = starters.findIndex(t => !t);
      const emptyBenchIndex = bench.findIndex(t => !t);
      
      if (emptyStarterIndex !== -1) {
        starters[emptyStarterIndex] = normalizedTeamName; // Use normalized name
      } else if (emptyBenchIndex !== -1) {
        bench[emptyBenchIndex] = normalizedTeamName; // Use normalized name
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
      
      // NORMALIZE THE NEW TEAM NAME
      const normalizedNewTeam = pendingAddTeam
        .toLowerCase()
        .replace(/\s+/g, "-")
        .replace(/&/g, "")
        .replace(/[^a-z0-9\-]/g, "");
      
      const starterIndex = starters.findIndex(t => t === selectedDropTeam);
      const benchIndex = bench.findIndex(t => t === selectedDropTeam);
      
      if (starterIndex !== -1) {
        starters[starterIndex] = normalizedNewTeam; // Use normalized name
      } else if (benchIndex !== -1) {
        bench[benchIndex] = normalizedNewTeam; // Use normalized name
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
      
    } catch (error) {
      console.error("Error swapping teams:", error);
      showError("Error", "Failed to swap teams. Please try again.");
    }
  };

  const getVisibleFreeAgents = () => {
    // Get list of teams by conference
    let allTeams = activeConference === "National"
      ? Object.values(teamsByConference).flat()
      : teamsByConference[activeConference] || [];

    // Filter out drafted teams by matching school names
    const teams = allTeams.filter(team => {
      // Normalize the team's school name to match the format in drafted teams
      const normalizedSchoolName = team.school
        ?.toLowerCase()
        .replace(/\s+/g, "-")
        .replace(/&/g, "")
        .replace(/[^a-z0-9\-]/g, "");
      
      // Check if this normalized school name is in the drafted teams
      const isDrafted = draftedTeams[normalizedSchoolName];
      
      return !isDrafted;
    });

    // Apply search query
    if (searchQuery) {
      return teams.filter(team =>
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
    } else if (key === "points") {
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
    
    // Format the date if available
    let dateStr = "";
    if (season.nextGameDate) {
      try {
        // Assuming date format is "2025-08-23"
        const date = new Date(season.nextGameDate);
        const month = date.getMonth() + 1;
        const day = date.getDate();
        dateStr = ` • ${month}/${day}`;
      } catch (error) {
        // If date parsing fails, just show without date
        dateStr = "";
      }
    }
    
    return `${prefix} ${season.nextOpponent} (${spread})${dateStr}`;
  };

  // Convert conference list to dropdown options
  const conferenceOptions = conferenceList.map(conf => ({
    value: conf,
    label: conf === "National" ? "All Conferences" : conf
  }));

  // REDESIGNED COMPACT TEAM CARD with new layout
  const TeamCard = ({ team }) => {
    if (!team) return null;

    // Get current week from global season config (you'll need to pass this down or fetch it)
    const currentWeek = "Preseason"; // This should come from your season config
    const previousWeek = currentWeek === "Preseason" ? null : `Week ${parseInt(currentWeek.replace("Week ", "")) - 1}`;
    
    // Get previous week points
    const previousWeekPoints = previousWeek && team.weeklyPoints?.[previousWeek] 
      ? team.weeklyPoints[previousWeek] 
      : null;

    return (
      <div style={{
        backgroundColor: "white",
        borderRadius: "8px",
        padding: "12px",
        marginBottom: "8px",
        boxShadow: "0 1px 2px rgba(0, 0, 0, 0.1)",
        border: "1px solid #e2e8f0",
        transition: "all 0.2s ease"
      }}>
        {/* Header with team info, sort data, and add button */}
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: "12px",
          marginBottom: "10px"
        }}>
          {/* Team Logo */}
          <div style={{
            width: "32px",
            height: "32px",
            borderRadius: "50%",
            overflow: "hidden",
            border: "1px solid #e2e8f0",
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
                fontSize: "10px",
                fontWeight: "700",
                color: "#64748b"
              }}>
                {team.school ? team.school.split(' ').map(word => word[0]).join('').slice(0, 2) : '?'}
              </div>
            )}
          </div>

          {/* Team Name */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3 
              onClick={() => handleTeamClick(team.school)}
              style={{
                fontSize: "14px",
                fontWeight: "600",
                color: "#1e293b",
                margin: "0 0 2px 0",
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
              fontSize: "11px",
              color: "#64748b",
              margin: "0"
            }}>
              {team.conference || "N/A"}
            </p>
          </div>

          {/* Sort Data: Name, Overall Points, Record */}
          <div style={{
            display: "flex",
            gap: "8px",
            fontSize: "10px",
            alignItems: "center"
          }}>
            <div style={{
              padding: "3px 6px",
              backgroundColor: "#f8fafc",
              borderRadius: "4px",
              textAlign: "center",
              minWidth: "35px"
            }}>
              <div style={{ color: "#64748b", fontWeight: "500", marginBottom: "1px" }}>
                Fantasy Points
              </div>
              <div style={{ color: "#059669", fontWeight: "700", fontSize: "9px" }}>
                {team.currentSeason?.gamePoints || 0}
              </div>
            </div>
            <div style={{
              padding: "3px 6px",
              backgroundColor: "#f8fafc",
              borderRadius: "4px",
              textAlign: "center",
              minWidth: "30px"
            }}>
              <div style={{ color: "#64748b", fontWeight: "500", marginBottom: "1px" }}>
                Record
              </div>
              <div style={{ color: "#1e293b", fontWeight: "600", fontSize: "9px" }}>
                {team.currentSeason?.record || "0-0"}
              </div>
            </div>
          </div>

          {/* Add Button */}
          <button 
            onClick={() => handleAddTeam(team)}
            style={{
              width: "28px",
              height: "28px",
              borderRadius: "50%",
              backgroundColor: "#059669",
              border: "none",
              color: "white",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 1px 4px rgba(5, 150, 105, 0.3)",
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
            <Plus size={14} />
          </button>
        </div>

        {/* Second Row: Conf, ATS, Prev */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gap: "6px",
          fontSize: "10px",
          marginBottom: "6px"
        }}>
          <div style={{
            padding: "4px 6px",
            backgroundColor: "#f8fafc",
            borderRadius: "4px"
          }}>
            <div style={{ color: "#64748b", fontWeight: "500", marginBottom: "1px" }}>
              Conf. Record
            </div>
            <div style={{ color: "#1e293b", fontWeight: "600", fontSize: "9px" }}>
              {team.currentSeason?.confRecord || "0-0"}
            </div>
          </div>

          <div style={{
            padding: "4px 6px",
            backgroundColor: "#f8fafc",
            borderRadius: "4px"
          }}>
            <div style={{ color: "#64748b", fontWeight: "500", marginBottom: "1px" }}>
              ATS Record
            </div>
            <div style={{ color: "#1e293b", fontWeight: "600", fontSize: "9px" }}>
              {team.currentSeason?.ATS || "0-0"}
            </div>
          </div>

          <div style={{
            padding: "4px 6px",
            backgroundColor: "#f8fafc",
            borderRadius: "4px"
          }}>
            <div style={{ color: "#64748b", fontWeight: "500", marginBottom: "1px" }}>
              Prev Week Pts
            </div>
            <div style={{ color: "#1e293b", fontWeight: "600", fontSize: "9px" }}>
              {previousWeekPoints !== null ? previousWeekPoints : "N/A"}
            </div>
          </div>
        </div>

        {/* Third Row: Next Game (full width, centered) */}
        <div style={{
          padding: "6px 8px",
          backgroundColor: "#f8fafc",
          borderRadius: "4px",
          fontSize: "10px",
          textAlign: "center"
        }}>
          <div style={{ color: "#64748b", fontWeight: "500", marginBottom: "2px" }}>
            Next Game
          </div>
          <div style={{ color: "#1e293b", fontWeight: "600", fontSize: "9px" }}>
            {formatNextGame(team.currentSeason)}
          </div>
        </div>
      </div>
    );
  };

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
      overflow: "hidden"
    }}>
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

      {/* Standard Header - matching MyLineup */}
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

      {/* Compact Controls - Search, Filter, and Sort */}
      <div style={{
        padding: "12px 16px",
        backgroundColor: "white",
        borderBottom: "1px solid #e5e7eb",
        display: "flex",
        alignItems: "center",
        gap: "12px",
        flexWrap: "wrap"
      }}>
        {/* Search and Conference Filter Row */}
        <div style={{
          display: "flex",
          gap: "8px",
          flex: "1 1 auto",
          minWidth: "280px"
        }}>
          {/* Search */}
          <div style={{ position: "relative", flex: "1 1 0", minWidth: "130px" }}>
            <Search size={16} style={{
              position: "absolute",
              left: "12px",
              top: "50%",
              transform: "translateY(-50%)",
              color: "#64748b"
            }} />
            <input
              type="text"
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: "100%",
                height: "44px",
                padding: "12px 12px 12px 40px",
                border: "2px solid #e5e7eb",
                borderRadius: "8px",
                fontSize: "14px",
                boxSizing: "border-box"
              }}
              onFocus={(e) => e.target.style.borderColor = "#1e40af"}
              onBlur={(e) => e.target.style.borderColor = "#e5e7eb"}
            />
          </div>

          {/* Conference Filter */}
          <div style={{ flex: "1 1 0", minWidth: "130px" }}>
            <CustomDropdown
              value={activeConference}
              onChange={setActiveConference}
              options={conferenceOptions}
              icon={Filter}
            />
          </div>
        </div>

        {/* Sort Options - Only 3 buttons */}
        <div style={{ display: "flex", gap: "6px", flex: "0 0 auto" }}>
          <SortButton 
            label="Name" 
            sortKey="school" 
            sortConfig={sortConfig}
            onSort={toggleSort}
          />
          <SortButton 
            label="Points" 
            sortKey="points" 
            sortConfig={sortConfig}
            onSort={toggleSort}
          />
          <SortButton 
            label="Record" 
            sortKey="currentSeason.record" 
            sortConfig={sortConfig}
            onSort={toggleSort}
          />
        </div>
      </div>

      <div style={{ 
        padding: "16px",
        position: "relative",
        zIndex: 1
      }}>
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
            overflow: "hidden"
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

      {/* Bottom spacing for navigation */}
      <div style={{ height: "80px" }} />
    </div>
  );
}

export default FreeAgents;