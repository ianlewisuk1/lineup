import React, { useEffect, useState, useRef } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../firebase/firebase";
import { useNavigate, useParams } from "react-router-dom";
import { Search, Filter, ChevronDown, BarChart3, ChevronUp } from "lucide-react";
import LeagueNavBar from "../components/LeagueNavBar";

// Custom Dropdown Component
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
      <button
        type="button"
        onClick={toggleDropdown}
        style={{
          width: '100%',
          height: '44px',
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
        <Icon 
          size={16} 
          style={{
            position: 'absolute',
            left: '12px',
            color: '#64748b',
            pointerEvents: 'none'
          }}
        />
        
        <span style={{
          flex: 1,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          paddingRight: '8px'
        }} title={selectedOption ? selectedOption.label : placeholder}>
          {selectedOption ? truncateText(selectedOption.label) : placeholder}
        </span>
        
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
            maxHeight: '300px',
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
                title={option.label}
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

function Stats() {
  const { leagueId } = useParams();
  const navigate = useNavigate();
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [conferenceList, setConferenceList] = useState([]);
  const [activeConference, setActiveConference] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStat, setSelectedStat] = useState("gamePoints");
  const [sortColumn, setSortColumn] = useState("gamePoints");
  const [sortDirection, setSortDirection] = useState("descending");

  // All available stats with labels
  const statOptions = [
    { value: "gamePoints", label: "Fantasy Points", type: "number" },
    { value: "record", label: "Overall Record", type: "string" },
    { value: "confRecord", label: "Conference Record", type: "string" },
    { value: "ats", label: "ATS Record", type: "string" },
    { value: "avgPointsFor", label: "Avg Points For", type: "number" },
    { value: "avgPointsAgainst", label: "Avg Points Against", type: "number" },
    { value: "sosRank", label: "SOS Rank", type: "number" },
    { value: "philMetrics", label: "Phil Metrics Rank", type: "number" },
    { value: "prevYearPoints", label: "2024 Points", type: "number" },
    { value: "nextOpponent", label: "Next Opponent", type: "string" }
  ];

  useEffect(() => {
    const fetchTeams = async () => {
      const snap = await getDocs(collection(db, "teams"));
      const list = [];
      const confSet = new Set();

      snap.forEach(doc => {
        const data = doc.data();
        if ((data.classification || "").toUpperCase() === "FBS") {
          list.push(data);
          if (data.conference) confSet.add(data.conference);
        }
      });

      setTeams(list);
      setConferenceList(["All", "P4", ...Array.from(confSet).sort()]);
      setLoading(false);
    };
    fetchTeams();
  }, []);

  const filteredTeams = teams.filter(team => {
    const matchesSearch = team.school.toLowerCase().includes(searchQuery.toLowerCase());

    const p4 = ["SEC", "ACC", "Big Ten", "Big 12"];
    if (activeConference === "All") return matchesSearch;
    if (activeConference === "P4") return matchesSearch && p4.includes(team.conference);
    return matchesSearch && team.conference === activeConference;
  });

  const sortedTeams = [...filteredTeams].sort((a, b) => {
    const getValue = (team, key) => {
      if (key === "school") return team.school || "";
      
      const season = team.currentSeason || {};
      
      switch (key) {
        case "gamePoints":
          return Number(season.gamePoints) || 0;
        case "avgPointsFor":
          return Number(season.avgPointsFor) || 0;
        case "avgPointsAgainst":
          return Number(season.avgPointsAgainst) || 0;
        case "sosRank":
          return Number(team.sosRank) || 999;
        case "philMetrics":
          return Number(team.philMetrics) || 999;
        case "prevYearPoints":
          return Number(team.prevYearPoints) || 0;
        case "nextOpponent":
          return season.nextOpponent || "zzz";
        case "record":
        case "confRecord":
        case "ats":
          return season[key] || "zzz";
        default:
          return season[key] || "";
      }
    };

    const aVal = getValue(a, sortColumn);
    const bVal = getValue(b, sortColumn);

    const currentStat = statOptions.find(s => s.value === sortColumn) || 
                       { type: sortColumn === "school" ? "string" : "string" };
    
    if (currentStat?.type === "number") {
      return sortDirection === "ascending" ? aVal - bVal : bVal - aVal;
    }
    
    const aStr = String(aVal).toLowerCase();
    const bStr = String(bVal).toLowerCase();
    
    if (sortDirection === "ascending") {
      return aStr.localeCompare(bStr);
    } else {
      return bStr.localeCompare(aStr);
    }
  });

  const handleTeamClick = (teamName) => {
    navigate(`/${leagueId}/team/${encodeURIComponent(teamName)}`);
  };

  const handleColumnSort = (column) => {
    if (sortColumn === column) {
      // Same column - toggle direction
      setSortDirection(prev => prev === "ascending" ? "descending" : "ascending");
    } else {
      // New column - set as sort column and default to descending for numbers, ascending for strings
      setSortColumn(column);
      const stat = statOptions.find(s => s.value === column);
      const isString = column === "school" || stat?.type === "string";
      setSortDirection(isString ? "ascending" : "descending");
    }
  };

  const toggleSort = () => {
    setSortDirection(prev => prev === "ascending" ? "descending" : "ascending");
  };

  const formatNextOpponent = (team) => {
    const cs = team.currentSeason;
    if (!cs || !cs.nextOpponent) return "—";

    const spread = cs.nextOpponentSpread ?? "TBD";

    let prefix = "?";
    if (cs.nextGameIsHome === true) prefix = "vs";
    else if (cs.nextGameIsHome === false) prefix = "@";

    return `${prefix} ${cs.nextOpponent} (${spread})`;
  };

  const getStatValue = (team, statKey) => {
    const season = team.currentSeason || {};
    
    switch (statKey) {
      case "gamePoints":
        return season.gamePoints ?? 0;
      case "avgPointsFor":
        return season.avgPointsFor ?? "—";
      case "avgPointsAgainst":
        return season.avgPointsAgainst ?? "—";
      case "sosRank":
        return team.sosRank ?? "—";
      case "philMetrics":
        return team.philMetrics !== undefined && team.philMetrics !== null ? team.philMetrics : "—";
      case "prevYearPoints":
        return team.prevYearPoints ?? "—";
      case "nextOpponent":
        return formatNextOpponent(team);
      case "record":
      case "confRecord":
      case "ats":
        return season[statKey] || "—";
      default:
        return "—";
    }
  };

  const getStatColor = (statKey, value) => {
    switch (statKey) {
      case "gamePoints":
      case "prevYearPoints":
      case "avgPointsFor":
        return "#059669"; // Green for positive stats
      case "avgPointsAgainst":
        return "#dc2626"; // Red for points against
      case "sosRank":
      case "philMetrics":
        return "#7c3aed"; // Purple for rankings
      default:
        return "#1e293b"; // Default dark
    }
  };

  // Convert options to dropdown format
  const conferenceOptions = conferenceList.map(conf => ({
    value: conf,
    label: conf
  }));

  const currentStatLabel = statOptions.find(s => s.value === selectedStat)?.label || "Stat";

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
          Loading FBS stats...
        </div>
      </div>
    );
  }

  return (
    <div style={{ 
      backgroundColor: "#f8fafc", 
      minHeight: "100vh"
    }}>
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
          FBS Team Stats
        </h1>
        <p style={{
          fontSize: "14px",
          opacity: "0.9",
          textAlign: "center",
          margin: 0
        }}>
          {sortedTeams.length} teams • Sorted by {sortColumn === "school" ? "Team Name" : currentStatLabel}
        </p>
      </div>

      {/* Controls */}
      <div style={{
        padding: "12px 16px",
        backgroundColor: "white",
        borderBottom: "1px solid #e5e7eb"
      }}>
        {/* First Row: Search and Conference */}
        <div style={{
          display: "flex",
          gap: "8px",
          marginBottom: "12px"
        }}>
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
              placeholder="Search teams..."
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

          <div style={{ flex: "1 1 0", minWidth: "130px" }}>
            <CustomDropdown
              value={activeConference}
              onChange={setActiveConference}
              options={conferenceOptions}
              icon={Filter}
            />
          </div>
        </div>

        {/* Second Row: Stat Selector and Sort */}
        <div style={{
          display: "flex",
          gap: "8px",
          alignItems: "center"
        }}>
          <div style={{ flex: "1 1 0", minWidth: "200px" }}>
            <CustomDropdown
              value={selectedStat}
              onChange={setSelectedStat}
              options={statOptions}
              icon={BarChart3}
              placeholder="Select stat to display..."
            />
          </div>

          <button
            onClick={toggleSort}
            style={{
              padding: "12px 16px",
              backgroundColor: "#1e40af",
              color: "white",
              border: "none",
              borderRadius: "8px",
              fontSize: "14px",
              fontWeight: "500",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "6px",
              transition: "all 0.2s ease",
              minWidth: "100px",
              justifyContent: "center"
            }}
            onMouseEnter={(e) => e.target.style.backgroundColor = "#1d4ed8"}
            onMouseLeave={(e) => e.target.style.backgroundColor = "#1e40af"}
          >
            Sort {sortDirection === "ascending" ? "▲" : "▼"}
          </button>
        </div>
      </div>

      <div style={{ padding: "16px" }}>
        {/* Stats List */}
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
                "No teams available"
              }
            </p>
          </div>
        ) : (
          <div style={{
            backgroundColor: "white",
            borderRadius: "8px",
            overflow: "hidden",
            boxShadow: "0 1px 3px rgba(0, 0, 0, 0.1)"
          }}>
            {/* Clickable Header */}
            <div style={{
              padding: "16px",
              backgroundColor: "#f8fafc",
              borderBottom: "2px solid #e2e8f0",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              fontWeight: "600",
              color: "#374151"
            }}>
              <button
                onClick={() => handleColumnSort("school")}
                style={{
                  background: "none",
                  border: "none",
                  color: "#374151",
                  fontWeight: "600",
                  fontSize: "14px",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                  padding: "4px 0",
                  transition: "color 0.2s ease"
                }}
                onMouseEnter={(e) => e.target.style.color = "#1e40af"}
                onMouseLeave={(e) => e.target.style.color = "#374151"}
              >
                Team (Conference)
                {sortColumn === "school" && (
                  sortDirection === "ascending" ? 
                    <ChevronUp size={14} /> : 
                    <ChevronDown size={14} />
                )}
              </button>
              
              <button
                onClick={() => handleColumnSort(selectedStat)}
                style={{
                  background: "none",
                  border: "none",
                  color: "#374151",
                  fontWeight: "600",
                  fontSize: "14px",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                  padding: "4px 0",
                  transition: "color 0.2s ease"
                }}
                onMouseEnter={(e) => e.target.style.color = "#1e40af"}
                onMouseLeave={(e) => e.target.style.color = "#374151"}
              >
                {currentStatLabel}
                {sortColumn === selectedStat && (
                  sortDirection === "ascending" ? 
                    <ChevronUp size={14} /> : 
                    <ChevronDown size={14} />
                )}
              </button>
            </div>

            {/* Team Rows */}
            {sortedTeams.map((team, index) => (
              <div
                key={team.school}
                style={{
                  padding: "12px 16px",
                  borderBottom: index < sortedTeams.length - 1 ? "1px solid #f1f5f9" : "none",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  transition: "background-color 0.2s ease"
                }}
                onMouseEnter={(e) => e.target.style.backgroundColor = "#f8fafc"}
                onMouseLeave={(e) => e.target.style.backgroundColor = "white"}
              >
                <div style={{ flex: 1 }}>
                  <div
                    onClick={() => handleTeamClick(team.school)}
                    style={{
                      color: "#1e40af",
                      textDecoration: "underline",
                      cursor: "pointer",
                      fontWeight: "600",
                      fontSize: "15px",
                      marginBottom: "2px"
                    }}
                  >
                    {team.school}
                  </div>
                  <div style={{
                    color: "#64748b",
                    fontSize: "13px"
                  }}>
                    {team.conference || "—"}
                  </div>
                </div>

                <div style={{
                  color: getStatColor(selectedStat, getStatValue(team, selectedStat)),
                  fontWeight: "700",
                  fontSize: "16px",
                  textAlign: "right",
                  minWidth: "80px"
                }}>
                  {getStatValue(team, selectedStat)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Bottom spacing */}
      <div style={{ height: "80px" }} />
    </div>
  );
}

export default Stats;