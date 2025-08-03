// scripts/addFakeTeams.js
import { initializeApp } from "firebase/app";
import { getFirestore, doc, setDoc } from "firebase/firestore";
import { firebaseConfig } from "../src/firebase/firebase.js"; // adjust path if needed

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const fakeTeams = [
  {
    id: "alabama-fake",
    school: "Alabama Fake",
    mascot: "Test Tide",
    abbreviation: "BAMA",
    conference: "Test Conference",
    color: "#e5e7eb",
    alternateColor: "#d1d5db",
    logos1: "https://via.placeholder.com/100x100?text=A",
    logos2: "https://via.placeholder.com/100x100?text=A2",
    state: "FA",
    city: "Montest",
  },
  {
    id: "ohio-mock",
    school: "Ohio Mock",
    mascot: "FakeCats",
    abbreviation: "OHM",
    conference: "Test Conference",
    color: "#cbd5e1",
    alternateColor: "#94a3b8",
    logos1: "https://via.placeholder.com/100x100?text=O",
    logos2: "https://via.placeholder.com/100x100?text=O2",
    state: "FA",
    city: "Mockton",
  },
  {
    id: "georgia-test",
    school: "Georgia Test",
    mascot: "Fake Dogs",
    abbreviation: "GT",
    conference: "Test Conference",
    color: "#f87171",
    alternateColor: "#fca5a5",
    logos1: "https://via.placeholder.com/100x100?text=G",
    logos2: "https://via.placeholder.com/100x100?text=G2",
    state: "FA",
    city: "Peachville",
  },
  {
    id: "usc-sim",
    school: "USC Sim",
    mascot: "TrojTest",
    abbreviation: "USC",
    conference: "Test Conference",
    color: "#fbbf24",
    alternateColor: "#fcd34d",
    logos1: "https://via.placeholder.com/100x100?text=U",
    logos2: "https://via.placeholder.com/100x100?text=U2",
    state: "FA",
    city: "Simford",
  },
  {
    id: "lsu-dev",
    school: "LSU Dev",
    mascot: "Dev Tigers",
    abbreviation: "LSU",
    conference: "Test Conference",
    color: "#a78bfa",
    alternateColor: "#ddd6fe",
    logos1: "https://via.placeholder.com/100x100?text=L",
    logos2: "https://via.placeholder.com/100x100?text=L2",
    state: "FA",
    city: "Baton Rogue Test",
  },
];

async function addFakeTeams() {
  for (let team of fakeTeams) {
    await setDoc(doc(db, "teams", team.id), {
      school: team.school,
      abbreviation: team.abbreviation,
      alternateNames1: team.abbreviation,
      alternateNames2: team.school,
      classification: "fbs",
      conference: team.conference,
      confOdds: 100,
      color: team.color,
      alternateColor: team.alternateColor,
      mascot: team.mascot,
      city: team.city,
      state: team.state,
      stadiumName: `${team.school} Test Stadium`,
      logos1: team.logos1,
      logos2: team.logos2,
      draftable: true,
      testTeam: true,
      retStarters: 22,
      prevYearRecord: "0-0",
      prevYearPoints: 0,
      prevYearAts: "0-0",
      predictedWins: 0,
      philMetrics: 0,
      philMetricDraftRank: 200,
      powerRank: 200,
      sosRank: 200,
      twitter: "@FakeFB",
      id: team.id,
      currentSeason: {
        record: "0-0",
        confRecord: "0-0",
        ATS: "0-0",
        division: "",
        nextGameDate: "2025-08-21",
        nextOpponent: "Fake Opponent",
        nextOpponentSpread: "+0.0",
        nextGameIsHome: true,
        avgPointsFor: "0",
        avgPointsAgainst: "0",
        gamesPlayed: "0",
        gamePoints: 0,
        gameComplete: false,
        seasonTotalPoints: 0,
        totalPointsFor: "0",
        totalPointsAgainst: "0",
        weeklyPoints: {},
      },
    });

    console.log(`✅ Added fake team: ${team.school}`);
  }
}

addFakeTeams();
