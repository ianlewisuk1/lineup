import React, { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { auth, db } from "../firebase/firebase";
import { getDoc, doc } from "firebase/firestore";
import AdminUserPanel from "../components/AdminUserPanel";
import AdminLeaguePanel from "../components/AdminLeaguePanel";

function AdminPanel() {
 const [loading, setLoading] = useState(true);
 const navigate = useNavigate();

 useEffect(() => {
   const fetchData = async () => {
     const currentUser = auth.currentUser;
     if (!currentUser) {
       return navigate("/login");
     }

     const userRef = doc(db, "users", currentUser.uid);
     const userSnap = await getDoc(userRef);

     if (!userSnap.exists() || !userSnap.data().isAdmin) {
       console.log("Unauthorized access attempt.");
       return navigate("/");
     }

     setLoading(false);
   };

   fetchData();
 }, [navigate]);

 if (loading) return <p>Loading admin panel...</p>;

 return (
   <div style={{ backgroundColor: "white", minHeight: "100vh" }}>
     <div style={{ padding: "1rem", borderBottom: "1px solid #ddd" }}>
       <h2>Admin Panel</h2>
       <nav style={{ marginTop: "0.5rem" }}>
         <Link to="/" style={{ marginRight: "1rem", color: "#007bff", textDecoration: "none" }}>
           ← Back to Home
         </Link>
         <Link to="/logout" style={{ color: "#007bff", textDecoration: "none" }}>
           Logout
         </Link>
       </nav>
     </div>
     
     <div style={{ padding: "1rem" }}>
       <div style={{ marginBottom: "1rem" }}>
         <Link to="/admin/teams" style={{ marginRight: "1rem" }}>
           🛠 Manage Teams
         </Link>
         <Link to="/admin/schedule">
           📅 Manage Schedule
         </Link>
       </div>

       <AdminUserPanel />
       <AdminLeaguePanel />
     </div>
   </div>
 );
}

export default AdminPanel;